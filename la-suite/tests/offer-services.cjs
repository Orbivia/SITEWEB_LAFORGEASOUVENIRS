const fs=require('node:fs'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module');
(async()=>{
 const source=stripTypeScriptTypes(fs.readFileSync(__dirname+'/../supabase/functions/suite-admin/notifications.ts','utf8'));
 const {processNotifications}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const job={id:'fixed-id',lease:'lease',kind:'opened',opened_count:2,label:'Julie & Thomas',slug:'julie-thomas',recipient:'owner@example.test',sender:'La Suite <capsules@example.test>',expires_at:'2029-10-01T22:00:00Z'},calls=[];let lease=true;
 const db={rpc:async(_,{p_action,p_payload})=>{calls.push([p_action,p_payload]);return {data:p_action==='notify_lease'&&lease?(lease=false,job):p_action==='notify_lease'?null:true}}};
 let sent=[];const send=async(url,opts)=>{sent.push([url,opts]);return new Response(JSON.stringify({id:'provider-id'}),{status:200})};
 await processNotifications(db,()=>undefined,send);assert.equal(calls.length,0);assert.equal(sent.length,0);
 const env=n=>n==='RESEND_API_KEY'?'fake-key':job.sender;
 await processNotifications(db,env,send);assert.equal(sent.length,1);const payload=JSON.parse(sent[0][1].body);assert(!payload.text.includes('guest_token'));assert(payload.text.includes('2 souvenir(s)'));assert(payload.text.includes('dashboard.html'));assert.equal(calls.at(-2)[1].provider_id,'provider-id');
 lease=true;await processNotifications(db,env,async(url,opts)=>{sent.push([url,opts]);throw Error('Timeout after acceptance')});
 assert.equal(calls.at(-2)[1].provider_id,null);assert.equal(sent[0][1].headers['Idempotency-Key'],sent[1][1].headers['Idempotency-Key']);assert.equal(sent[0][1].body,sent[1][1].body);
 console.log('PASS: disabled service sends nothing; frozen digest contains no guest access or memory content; timeout retries use identical payload and idempotency key');
})().catch(e=>{console.error(e);process.exit(1)});
