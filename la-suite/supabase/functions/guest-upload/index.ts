import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ALLOWED_TYPES = new Set([
  "video/mp4","video/quicktime","video/webm",
  "audio/webm","audio/mpeg","audio/wav","audio/x-wav","audio/mp4","audio/ogg",
  "image/jpeg","image/png","image/webp","image/heic","image/heif",
]);
const TYPE_GROUPS: Record<string,"video"|"audio"|"image"> = {
  "video/mp4":"video","video/quicktime":"video","video/webm":"video",
  "audio/webm":"audio","audio/mpeg":"audio","audio/wav":"audio","audio/x-wav":"audio","audio/mp4":"audio","audio/ogg":"audio",
  "image/jpeg":"image","image/png":"image","image/webp":"image","image/heic":"image","image/heif":"image",
};
const EXTENSIONS: Record<string,string> = {
  "video/mp4":"mp4","video/quicktime":"mov","video/webm":"webm",
  "audio/webm":"webm","audio/mpeg":"mp3","audio/wav":"wav","audio/x-wav":"wav","audio/mp4":"m4a","audio/ogg":"ogg",
  "image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/heic":"heic","image/heif":"heif",
};

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}})}
function parseDelivery(value:unknown){
 if(!value)return new Date().toISOString();
 const text=String(value);
 if(/^\d{4}-\d{2}-\d{2}$/.test(text)){
  const d=new Date(text+"T00:00:00Z");
  if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==text)throw new Error("Choisissez une date valide.");
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Paris",hour:"numeric",hourCycle:"h23"}).formatToParts(d);
  const offset=Number(parts.find(p=>p.type==="hour")?.value);
  return new Date(d.getTime()-offset*3600000).toISOString();
 }
 const d=new Date(text);if(Number.isNaN(d.getTime()))throw new Error("Choisissez une date valide.");return d.toISOString();
}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const body=await req.json(),action=String(body?.action||""),guestToken=String(body?.guest_token||"");
  const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  if(action==="init_intro"||action==="finalize_intro"){
   const token=(req.headers.get("Authorization")||"").replace(/^Bearer /i,"");
   const{data:auth,error:authError}=await db.auth.getUser(token);
   if(authError||!auth.user)return json({error:"Connectez-vous pour enregistrer votre accueil."},401);
   const{data:result,error}=await db.rpc("organizer_intro_backend",{p_action:action==="init_intro"?"reserve":"finalize",p_user:auth.user.id,p_capsule:body.capsule_id,p_payload:{mime:body.file_type,bytes:body.file_size,path:body.path}});
   if(error)return json({error:error.message},409);
   if(action==="finalize_intro")return json(result);
   const{data:signed,error:signedError}=await db.storage.from("capsule-media").createSignedUploadUrl(result.path);
   if(signedError||!signed)throw signedError||new Error("Unable to create upload URL");
   return json({...result,token:signed.token});
  }
  if(!/^[a-f0-9]{36}$/.test(guestToken))return json({error:"Lien de capsule invalide."},400);
  const{data:capsule,error:capsuleError}=await db.from("capsules").select("id,intro_path,status,couple_name,wedding_date,welcome_message").eq("guest_token",guestToken).maybeSingle();
  if(capsuleError||!capsule||capsule.status!=="active")return json({error:"Cette capsule est introuvable."},404);
  if(action==="get_status"){
   const{data,error}=await db.rpc("guest_capsule_state",{p_capsule_id:capsule.id});if(error)throw error;
   return json({ok:true,...data,couple_name:capsule.couple_name,wedding_date:capsule.wedding_date,welcome_message:capsule.welcome_message,has_intro:Boolean(capsule.intro_path)});
  }
  if(action==="get_intro"){
   const{data:state,error:stateError}=await db.rpc("guest_capsule_state",{p_capsule_id:capsule.id});
   if(stateError)throw stateError;if(state?.state==="suspended")return json({error:"Les dépôts sont temporairement en pause."},403);if(state?.state==="expired")return json({error:"La période de conservation est terminée."},410);
   if(!capsule.intro_path)return json({ok:true,signed_url:null});
   if(!capsule.intro_path.startsWith(capsule.id+"/organizer/"))return json({error:"Accueil indisponible."},403);
   const{data,error}=await db.storage.from("capsule-media").createSignedUrl(capsule.intro_path,3600);
   if(error)throw error;return json({ok:true,signed_url:data?.signedUrl||null,media_type:/\.(jpg|jpeg|png|webp)$/i.test(capsule.intro_path)?"image":"video"});
  }
  if(action==="submit_text"||action==="init_media"){
   const guestId=String(body?.guest_id||'');
   if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(guestId))return json({error:'Rechargez cette page avant de réessayer.'},400);
   const guestName=String(body?.guest_name||"").trim(),messageText=String(body?.message_text||"").trim();
   const fileType=String(body?.file_type||"").split(";")[0],fileSize=action==="submit_text"?0:Number(body?.file_size),mediaType=action==="submit_text"?"text":TYPE_GROUPS[fileType];
   if(action==="init_media"&&(!ALLOWED_TYPES.has(fileType)||!Number.isSafeInteger(fileSize)))return json({error:"Choisissez un fichier compatible."},400);
   const duration=body?.duration_seconds;
   if(duration!=null&&(!Number.isFinite(duration)||duration<=0||duration>(mediaType==="video"?60.1:180.1)))return json({error:"Vidéo : 1 minute maximum. Audio : 3 minutes maximum."},400);
   const requestId=String(body?.request_id||crypto.randomUUID());
   if(!/^[a-f0-9-]{36}$/i.test(requestId))return json({error:"Envoi invalide."},400);
   const{data:reserved,error}=await db.rpc("reserve_guest_memory",{p_capsule_id:capsule.id,p_request_id:requestId,p_name:guestName,p_text:messageText,p_type:mediaType,p_mime:action==="submit_text"?null:fileType,p_bytes:fileSize,p_delivery:parseDelivery(body?.delivery_at),p_guest_id:guestId});
   if(error)return json({error:error.message},409);
   if(reserved.complete)return json(reserved);
   const{data:signed,error:signedError}=await db.storage.from("capsule-media").createSignedUploadUrl(reserved.path);
   if(signedError||!signed)throw signedError||new Error("Unable to create upload URL");
   return json({...reserved,token:signed.token});
  }
  if(action==="finalize_media"){
   const messageId=String(body?.message_id||""),path=String(body?.path||"");
   if(!/^[a-f0-9-]{36}$/i.test(messageId)||!path.startsWith(capsule.id+"/"))return json({error:"Envoi invalide."},400);
   const{data,error}=await db.rpc("finalize_guest_memory",{p_capsule_id:capsule.id,p_message_id:messageId,p_path:path});
   if(error){
    if(error.message.includes("ne correspond pas")){
     const{data:message}=await db.from("messages").select("upload_path,media_path").eq("id",messageId).eq("capsule_id",capsule.id).maybeSingle();
     if(message?.upload_path===path&&!message.media_path)await db.storage.from("capsule-media").remove([path]);
    }
    return json({error:error.message},409);
   }
   return json(data);
  }
  return json({error:"Unknown action"},400);
 }catch(error){console.error(error);return json({error:"Le service est momentanément indisponible. Votre souvenir reste sur cette page : réessayez."},500)}
});
