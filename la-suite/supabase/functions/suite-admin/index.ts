import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import {importKey,seal,open} from './crypto.ts';
const cors={'Access-Control-Allow-Origin':'https://laforgeasouvenirs.fr','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-suite-worker','Access-Control-Allow-Methods':'POST,OPTIONS'};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return response({error:'Méthode invalide.'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const rpc=async(action:string,payload:unknown={})=>{const {data,error}=await db.rpc('admin_backend',{p_action:action,p_payload:payload});if(error)throw error;return data;};
 let job:any=null;
 try{
  const body=await req.json();let worker=false,userId:string|null=null;
  if(req.headers.has('x-suite-worker')){const runtime=await rpc('runtime');worker=req.headers.get('x-suite-worker')===runtime.worker;if(!worker)return response({error:'Accès refusé.'},403);}
  else {const token=(req.headers.get('Authorization')||'').replace(/^Bearer /i,'');const {data,error}=await db.auth.getUser(token);if(error||!data.user)return response({error:'Connectez-vous pour continuer.'},401);userId=data.user.id;if(!await rpc('member',{user_id:userId}))return response({error:'Accès réservé à l’administrateur.'},403);}
  const action=String(body.action||'');if(worker&&action!=='tick')return response({error:'Accès refusé.'},403);
  if(action==='overview')return response(await rpc('overview'));
  if(action==='manage')return response({ok:await rpc('manage',{id:body.id,suspended:body.suspended,quota:body.quota,actor:userId})});
  if(action==='backup')return response(await rpc('queue',{id:body.id||null,actor:userId}));
  if(action==='retry'){await rpc('retry',{id:body.id});return response({ok:true});}
  if(action==='restore'){await rpc('restore',{id:body.id});return response({ok:true});}
  if(action==='export'){
   const backup=await rpc('get',{id:body.id});const names=[{name:backup.manifest_aad||backup.manifest_path,path:backup.manifest_path},...backup.files.map((f:any)=>({name:f.key,path:f.stored_key||f.key}))];
   // Return paged links to avoid giant responses and link expiry during large downloads.
   const offset=Math.max(0,Number(body.offset)||0);const page=names.slice(offset,offset+20);const {data,error}=await db.storage.from('capsule-backups').createSignedUrls(page.map((x:any)=>x.path),3600);if(error)throw error;
   return response({total:names.length,entries:data.map((x:any,i:number)=>({name:page[i].name,url:x.signedUrl}))});
  }
  const runtime=await rpc('runtime'),key=await importKey(runtime.key);
  const download=async(bucket:string,path:string)=>{const {data,error}=await db.storage.from(bucket).download(path);if(error||!data)throw error||new Error('Fichier manquant.');return new Uint8Array(await data.arrayBuffer());};
  const upload=async(path:string,data:Uint8Array)=>{const {error}=await db.storage.from('capsule-backups').upload(path,data,{contentType:'application/octet-stream',upsert:true});if(error)throw error;};
  if(action==='import_start'){
   if(!/^[a-f0-9-]{36}\/manifest$/.test(String(body.name))||String(body.manifest).length>28000000)throw new Error('Format de sauvegarde invalide.');
   const bytes=Uint8Array.from(atob(body.manifest),x=>x.charCodeAt(0));const manifest=JSON.parse(new TextDecoder().decode(await open(key,bytes,body.name)));
   if(manifest.version!==1||!Array.isArray(manifest.files)||!manifest.snapshot)throw new Error('Format de sauvegarde invalide.');
   const result=await rpc('import',{manifest,snapshot:manifest.snapshot,files:manifest.files,aad:body.name});await upload(result.manifest_path,bytes);return response(result);
  }
  if(action==='import_url'){
   const backup=await rpc('import_get',{id:body.id});const index=Number(body.index);if(!Number.isInteger(index)||!backup.files[index])throw new Error('Fichier invalide.');
   const {data,error}=await db.storage.from('capsule-backups').createSignedUploadUrl(backup.files[index].stored_key,{upsert:true});if(error)throw error;return response({path:data.path,token:data.token,name:backup.files[index].key});
  }
  if(action==='import_finish'){await rpc('import_finish',{id:body.id});return response({ok:true});}
  if(action!=='tick')return response({error:'Action invalide.'},400);
  const garbage=await rpc('cleanup');for(let i=0;i<garbage.garbage.length;i+=100){const {error}=await db.storage.from('capsule-backups').remove(garbage.garbage.slice(i,i+100));if(error)throw error;}
  const {data:mediaGarbage,error:mediaError}=await db.rpc('media_cleanup_backend',{p_action:'candidates'});if(mediaError)throw mediaError;
  if(mediaGarbage.garbage.length){const {error}=await db.storage.from('capsule-media').remove(mediaGarbage.garbage);if(error)throw error;}
  const {error:ackError}=await db.rpc('media_cleanup_backend',{p_action:'ack',p_paths:mediaGarbage.garbage});if(ackError)throw ackError;
  job=await rpc('lease');if(!job)return response({ok:true,idle:true});
  const started=Date.now();let processed=0;
  if(job.state==='restoring'){
   const manifest=JSON.parse(new TextDecoder().decode(await open(key,await download('capsule-backups',job.manifest_path),job.manifest_aad||job.manifest_path)));
   await rpc('restore_check',{snapshot:manifest.snapshot});
   while(job.restore_cursor<job.files.length&&processed<5&&Date.now()-started<20000){
    const f=job.files[job.restore_cursor];const raw=await open(key,await download('capsule-backups',f.stored_key||f.key),f.key);
    if(raw.byteLength!==f.size)throw new Error('Taille de fichier invalide.');
    // Do not overwrite a newer live file; restore only missing media.
    const {error}=await db.storage.from('capsule-media').upload(f.path,raw,{contentType:f.mime,upsert:false});if(error&&String(error.statusCode)!=='409'&&!/already exists|duplicate/i.test(error.message))throw error;
    job.restore_cursor++;processed++;
   }
   if(job.restore_cursor===job.files.length){await rpc('restore_metadata',{snapshot:manifest.snapshot});await rpc('progress',{id:job.id,lease:job.lease,restore_cursor:job.restore_cursor,state:'restored'});}
   else await rpc('progress',{id:job.id,lease:job.lease,restore_cursor:job.restore_cursor});
  }else{
   while(job.cursor<job.files.length&&processed<5&&Date.now()-started<20000){
    const f=job.files[job.cursor];if(!await rpc('asset_exists',{path:f.key})){
     const raw=await download('capsule-media',f.path);if(raw.byteLength!==f.size||!await rpc('source_unchanged',{path:f.path,key:f.key}))throw new Error('Un fichier a changé pendant la sauvegarde. Relancez-la.');
     await upload(f.key,await seal(key,raw,f.key));await rpc('asset',{path:f.key});
    }
    job.cursor++;processed++;
   }
   if(job.cursor===job.files.length){const path=job.id+'/manifest';const bytes=new TextEncoder().encode(JSON.stringify({version:1,snapshot:job.snapshot,files:job.files}));await upload(path,await seal(key,bytes,path));await rpc('progress',{id:job.id,lease:job.lease,cursor:job.cursor,state:'ready',manifest:path});}
   else await rpc('progress',{id:job.id,lease:job.lease,cursor:job.cursor});
  }
  return response({ok:true,processed});
 }catch(error:any){
  console.error('suite-admin operation failed',String(error?.message||error));
  if(job)try{await rpc('progress',{id:job.id,lease:job.lease,state:'failed',error:'Opération interrompue. Réessayez ; si le problème persiste, vérifiez les fichiers et le stockage.'});}catch{}
  return response({error:/capsule|compte|sauvegard|conservation|opération|fichier/i.test(String(error?.message))?String(error.message):'Opération impossible. Réessayez.'},400);
 }
});
