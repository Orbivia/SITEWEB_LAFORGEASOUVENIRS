// No secrets configured = no queueing and no sending. Payload is frozen in the outbox.
export async function processNotifications(db:any,env:(name:string)=>string|undefined,send=fetch){
 const key=env('RESEND_API_KEY'),from=env('NOTIFICATION_FROM');if(!key||!from)return {configured:false};
 const rpc=async(action:string,payload:unknown={})=>{const {data,error}=await db.rpc('offer_backend',{p_action:action,p_payload:payload});if(error)throw error;return data;};
 await rpc('notify_enqueue');let count=0;
 for(let i=0;i<3;i++){
  const job=await rpc('notify_lease',{sender:from});if(!job)break;
  const date=new Date(job.expires_at).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'});
  const opened=job.kind==='opened',subject=opened?'La Suite : des souvenirs vous attendent':'La Suite : pensez à garder vos souvenirs';
  const text=opened?`${job.opened_count} souvenir(s) sont maintenant ouverts dans votre capsule « ${job.label} ».\nRetrouvez-les dans votre espace organisateur.`:`Votre capsule « ${job.label} » arrive à la fin de ses 3 ans d’accès le ${date}.\nTéléchargez vos souvenirs ouverts avant cette date pour les conserver.`;
  let providerId=null;
  try{
   const result=await send('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'suite-notification-'+job.id},body:JSON.stringify({from:job.sender,to:[job.recipient],subject,text:text+'\n\nhttps://laforgeasouvenirs.fr/la-suite/dashboard.html?slug='+encodeURIComponent(job.slug)+'\n\nVous pouvez désactiver ces notifications dans les paramètres de votre capsule.'})});
   if(result.ok){const data=await result.json();providerId=data.id||null;}
  }catch{/* A timeout may follow an accepted email. Retry the same idempotency key. */}
  await rpc('notify_result',{id:job.id,lease:job.lease,provider_id:providerId});if(providerId)count++;
 }
 return {sent:count};
}
