const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
let capsule={id:'test',status:'draft',intro_path:'test/organizer/greeting.png'},signedCalls=0,handler;
const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:capsule})};
const createClient=()=>({from:()=>chain,rpc:async()=>({data:{state:'open'}}),storage:{from:()=>({createSignedUrl:async()=>{signedCalls++;return{data:{signedUrl:'https://example.test/signed'}}}})}});
const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/guest-upload/index.ts'),'utf8').replace(/^import .*;\n/,'');
vm.runInNewContext(stripTypeScriptTypes(source),{createClient,Deno:{env:{get:()=>''},serve:fn=>handler=fn},Response,crypto,console});
(async()=>{
 const invoke=action=>handler(new Request('https://example.test/',{method:'POST',body:JSON.stringify({action,guest_token:'a'.repeat(36)})}));
 for(const action of ['get_intro','submit_text','init_media','finalize_media'])assert.equal((await invoke(action)).status,404);
 assert.equal(signedCalls,0);
 capsule.status='active';let response=await invoke('get_intro');assert.equal(response.status,200);assert.equal((await response.json()).media_type,'image');
 capsule.intro_path='test/organizer/intro.mp4';assert.equal((await(await invoke('get_intro')).json()).media_type,'video');
 capsule.intro_path=null;assert.equal((await(await invoke('get_intro')).json()).signed_url,null);
 console.log('PASS: draft endpoints blocked; image, video and absent greeting responses');
})().catch(e=>{console.error(e);process.exitCode=1});
