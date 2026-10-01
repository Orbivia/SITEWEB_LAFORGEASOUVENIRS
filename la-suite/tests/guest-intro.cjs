const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
let capsule={id:'test',status:'draft',intro_path:'test/organizer/greeting.png'},signedCalls=0,handler,state='open',user=null,backendError=null,backendArgs=null;
const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:capsule})};
const createClient=()=>({auth:{getUser:async()=>({data:{user}})},from:()=>chain,rpc:async(name,args)=>{if(name==='organizer_intro_backend'){backendArgs=args;return backendError?{error:{message:backendError}}:{data:{path:'test/organizer/signed.png',ok:true}}}return{data:{state}}},storage:{from:()=>({createSignedUploadUrl:async()=>({data:{token:'signed-upload-token'}}),createSignedUrl:async()=>{signedCalls++;return{data:{signedUrl:'https://example.test/signed'}}}})}});
const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/guest-upload/index.ts'),'utf8').replace(/^import .*;\n/,'');
const ctx={createClient,Deno:{env:{get:()=>''},serve:fn=>handler=fn},Response,crypto,console};
vm.runInNewContext(stripTypeScriptTypes(source),ctx);
(async()=>{
 assert.equal(ctx.parseDelivery('2026-03-29'),'2026-03-28T23:00:00.000Z');
 assert.equal(ctx.parseDelivery('2026-03-30'),'2026-03-29T22:00:00.000Z');
 assert.throws(()=>ctx.parseDelivery('2026-02-30'));
 const invoke=action=>handler(new Request('https://example.test/',{method:'POST',body:JSON.stringify({action,guest_token:'a'.repeat(36)})}));
 for(const action of ['get_intro','submit_text','init_media','finalize_media'])assert.equal((await invoke(action)).status,404);
 assert.equal(signedCalls,0);
 capsule.status='active';let response=await invoke('get_intro');assert.equal(response.status,200);assert.equal((await response.json()).media_type,'image');
 capsule.intro_path='test/organizer/intro.mp4';assert.equal((await(await invoke('get_intro')).json()).media_type,'video');
 capsule.intro_path=null;assert.equal((await(await invoke('get_intro')).json()).signed_url,null);
 for(const path of ['test/private-memory.mp4','other/organizer/intro.mp4']){capsule.intro_path=path;const before=signedCalls;assert.equal((await invoke('get_intro')).status,403);assert.equal(signedCalls,before);}
 capsule.intro_path='test/organizer/intro.mp4';for(const value of ['suspended','expired']){state=value;const before=signedCalls;assert.equal((await invoke('get_intro')).status,value==='expired'?410:403);assert.equal(signedCalls,before);}
 assert.equal((await invoke('init_intro')).status,401);
 user={id:'verified-owner'};response=await invoke('init_intro');assert.equal(response.status,200);assert.equal((await response.json()).token,'signed-upload-token');assert.equal(backendArgs.p_user,'verified-owner');
 backendError='La capsule est pleine';assert.equal((await invoke('init_intro')).status,409);backendError=null;
 response=await invoke('finalize_intro');assert.equal(response.status,200);assert.equal(backendArgs.p_action,'finalize');
 console.log('PASS: draft/private/cross-capsule/expired intros blocked; organizer authentication required; valid greeting responses');
})().catch(e=>{console.error(e);process.exitCode=1});
