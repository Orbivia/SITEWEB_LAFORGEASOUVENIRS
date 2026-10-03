import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import Stripe from 'npm:stripe@22.3.2';
const cors={'Access-Control-Allow-Origin':'https://laforgeasouvenirs.fr','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const base='https://laforgeasouvenirs.fr/la-suite/dashboard.html';
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return reply({error:'Méthode invalide.'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const rpc=async(action:string,user:string|null=null,payload:unknown={})=>{const {data,error}=await db.rpc('offer_backend',{p_action:action,p_user:user,p_payload:payload});if(error)throw error;return data;};
 const key=Deno.env.get('STRIPE_SECRET_KEY'),secret=Deno.env.get('STRIPE_WEBHOOK_SECRET');
 try{
  if(req.headers.has('stripe-signature')){
   if(!key||!secret)return reply({error:'Paiement non configuré.'},503);
   const stripe=new Stripe(key);let event;
   try{event=await stripe.webhooks.constructEventAsync(await req.text(),req.headers.get('stripe-signature')!,secret,undefined,Stripe.createSubtleCryptoProvider());}catch{return reply({error:'Signature invalide.'},400);}
   if(event.livemode!==(key.startsWith('sk_live_')||key.startsWith('rk_live_')))return reply({error:'Mode de paiement invalide.'},400);
   if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return reply({ok:true});
   // Retrieve canonical session: the redirect never changes a capsule's rights.
   const session=await stripe.checkout.sessions.retrieve((event.data.object as any).id);
   if(session.payment_status!=='paid')return reply({ok:true});
   if(!session.metadata?.suite_order||session.mode!=='payment')return reply({error:'Commande invalide.'},400);
   const order=await rpc('settle',null,{id:session.metadata.suite_order,session_id:session.id,amount_cents:session.amount_total,currency:session.currency,payment_intent:typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id});
   if(order.state==='refund_required'){
    const refund=await stripe.refunds.create({payment_intent:order.payment_intent},{idempotencyKey:'suite-refund-'+order.id});
    if(refund.status==='succeeded')await rpc('refund',null,{id:order.id,refund_id:refund.id});
    else return reply({error:'Remboursement à vérifier.'},500);
   }
   return reply({ok:true});
  }
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer /i,''),{data:auth,error:authError}=await db.auth.getUser(token);
  if(authError||!auth.user)return reply({error:'Connectez-vous pour continuer.'},401);
  if(!auth.user.email_confirmed_at)return reply({error:'Confirmez votre adresse e-mail.'},403);
  const body=await req.json(),id=String(body.capsule_id||'');
  if(!/^[a-f0-9-]{36}$/i.test(id))return reply({error:'Capsule invalide.'},400);
  if(body.action==='status'){const result=await rpc('status',auth.user.id,{capsule_id:id});return reply({...result,payments_enabled:result.payments_enabled&&Boolean(key&&secret),notifications_enabled:result.notifications_enabled&&Boolean(Deno.env.get('RESEND_API_KEY')&&Deno.env.get('NOTIFICATION_FROM'))});}
  if(body.action!=='checkout')return reply({error:'Action invalide.'},400);
  if(!key||!secret)return reply({error:'Paiement non configuré.'},503);
  const order=await rpc('reserve',auth.user.id,{capsule_id:id,plan:body.plan});
  if(!order.email)throw Error('Confirmez votre adresse e-mail.');const stripe=new Stripe(key);
  const session=order.session_id?await stripe.checkout.sessions.retrieve(order.session_id):await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],locale:'fr',customer_email:order.email,client_reference_id:order.id,metadata:{suite_order:order.id},expires_at:Math.floor(new Date(order.expires_at).getTime()/1000),line_items:[{quantity:1,price_data:{currency:'eur',unit_amount:order.amount_cents,product_data:{name:'La Suite — passage à '+({audio:'Plus',premium:'Premium'} as any)[order.to_plan]}}}],success_url:base+'?slug='+encodeURIComponent(order.slug)+'&upgrade=return',cancel_url:base+'?slug='+encodeURIComponent(order.slug)+'&upgrade=cancel'},{idempotencyKey:'suite-upgrade-'+order.id});
  if(session.status!=='open'||!session.url)return reply({error:'Ce paiement est terminé. Actualisez la capsule.'},409);
  await rpc('bind',auth.user.id,{id:order.id,session_id:session.id});return reply({url:session.url});
 }catch(error:any){console.error('suite-billing failed',String(error?.message||error));return reply({error:'Opération de paiement impossible. Réessayez ; aucun changement de formule sans paiement confirmé.'},500);}
});
