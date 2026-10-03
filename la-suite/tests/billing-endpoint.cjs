const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),Stripe=require('stripe'),{stripTypeScriptTypes}=require('node:module');
(async()=>{
 const id='11111111-1111-4111-8111-111111111111',orderId='22222222-2222-4222-8222-222222222222',secret='whsec_fake',key='sk_test_fake',calls=[];
 const session={id:'cs_fake',payment_status:'paid',mode:'payment',amount_total:500,currency:'eur',payment_intent:'pi_fake',metadata:{suite_order:orderId},status:'open',url:'https://checkout.stripe.com/c/test'};
 const sdk=new Stripe(key);let signatureChecks=0;
 class TestStripe{static createSubtleCryptoProvider(){return Stripe.createSubtleCryptoProvider()}constructor(){this.webhooks={constructEventAsync:async(...args)=>{signatureChecks++;return sdk.webhooks.constructEventAsync(...args)}};this.checkout={sessions:{retrieve:async()=>session,create:async(params)=>{calls.push(['stripe-create',params]);return session}}};this.refunds={create:async()=>({id:'re_test',status:'succeeded'})};}}
 const db={auth:{getUser:async token=>({data:{user:token==='owner'?{id:'owner',email_confirmed_at:'today'}:null}})},rpc:async(_,{p_action,p_user,p_payload})=>{calls.push([p_action,p_payload]);if(p_action==='reserve')return{data:{id:orderId,to_plan:'audio',amount_cents:500,slug:'julie-thomas',email:'owner@example.test',expires_at:new Date(Date.now()+3600000).toISOString()}};if(p_action==='settle')return{data:{state:'paid'}};if(p_action==='status')return{data:{payments_enabled:false,notifications_enabled:false,upgrades:[]}};return{data:true}}};
 let handler;const source=stripTypeScriptTypes(fs.readFileSync(__dirname+'/../supabase/functions/suite-billing/index.ts','utf8')).replace(/^import .*;\n/gm,'');
 vm.runInNewContext(source,{createClient:()=>db,Stripe:TestStripe,Deno:{env:{get:name=>name==='STRIPE_SECRET_KEY'?key:name==='STRIPE_WEBHOOK_SECRET'?secret:''},serve:fn=>handler=fn},Response,URL,Date,console});
 const invoke=async(body,headers={})=>handler(new Request('https://test.invalid',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)}));
 assert.equal((await invoke({action:'checkout',capsule_id:id,plan:'audio'})).status,401);
 let result=await invoke({action:'checkout',capsule_id:id,plan:'audio',amount_cents:1},{Authorization:'Bearer owner'});assert.equal(result.status,200);assert.equal(calls.find(c=>c[0]==='stripe-create')[1].line_items[0].price_data.unit_amount,500);assert.equal(calls.filter(c=>c[0]==='settle').length,0);
 const event={id:'evt_test',type:'checkout.session.completed',livemode:false,data:{object:{id:session.id}}},body=JSON.stringify(event),signature=Stripe.webhooks.generateTestHeaderString({payload:body,secret});
 assert.equal((await invoke(body,{'stripe-signature':'bad'})).status,400);
 assert.equal((await invoke(body+' ',{'stripe-signature':signature})).status,400);
 result=await invoke(body,{'stripe-signature':signature});assert.equal(result.status,200);assert.equal(calls.filter(c=>c[0]==='settle').length,1);
 session.payment_status='unpaid';assert.equal((await invoke(body,{'stripe-signature':signature})).status,200);assert.equal(calls.filter(c=>c[0]==='settle').length,1);
 assert(signatureChecks>=4);console.log('PASS: official Stripe SDK rejects forged/altered webhooks; verified paid session alone settles; checkout uses server amount, never client price');
})().catch(e=>{console.error(e);process.exit(1)});
