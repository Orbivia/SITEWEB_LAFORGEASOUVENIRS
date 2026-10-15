/* Public declarations. No contract or account existence is disclosed. */
(()=>{
 'use strict';const form=document.querySelector('#legal-request-form');if(!form)return;
 const $=id=>document.getElementById(id),kind=form.dataset.kind;
 const submit=$('legal-review'),confirm=$('legal-confirm'),edit=$('legal-edit'),review=$('legal-review-panel'),status=$('legal-status'),result=$('legal-result');
 let draft=null,busy=false,receiptURL=null,requestId=crypto.randomUUID();
 const report=(text,error=false)=>{status.textContent=text;status.className='legal-status '+(error?'error':'');};
 const fields=()=>({full_name:$('legal-full-name').value.trim(),email:$('legal-email').value.trim(),contract_reference:$('legal-contract').value.trim(),message:$('legal-message').value.trim()});
 function lock(value){busy=value;form.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=value);}
 function showEditor(){review.hidden=true;$('legal-fields').hidden=false;submit.hidden=false;draft=null;report('');}
 form.addEventListener('submit',event=>{
  event.preventDefault();if(busy||!form.reportValidity()||$('legal-website').value)return;
  draft=fields();$('legal-summary-name').textContent=draft.full_name;$('legal-summary-email').textContent=draft.email;$('legal-summary-contract').textContent=draft.contract_reference||'Compte associé à cette adresse';$('legal-summary-message').textContent=draft.message||'Aucune précision complémentaire.';
  $('legal-fields').hidden=true;submit.hidden=true;review.hidden=false;report('Vérifiez votre déclaration avant de la confirmer.');confirm.focus();
 });
 edit.onclick=()=>{if(!busy){showEditor();$('legal-full-name').focus()}};
 confirm.onclick=async()=>{
  if(busy||!draft)return;lock(true);report('Enregistrement de votre déclaration…');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
   const config=window.LA_SUITE_CONFIG;if(!config?.SUPABASE_URL||!config.SUPABASE_ANON_KEY)throw Error();
   const response=await fetch(config.SUPABASE_URL+'/functions/v1/suite-legal',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',apikey:config.SUPABASE_ANON_KEY},body:JSON.stringify({...draft,id:requestId,action:'submit',kind,confirmed:true,receipt_mode:'download',website:''})});
   const data=await response.json();if(!response.ok||typeof data.receipt!=='string'||!data.id||!data.received_at)throw Error(data.error||'La déclaration n’a pas été enregistrée. Réessayez.');
   if(receiptURL)URL.revokeObjectURL(receiptURL);receiptURL=URL.createObjectURL(new Blob(['\uFEFF'+data.receipt],{type:'text/plain;charset=utf-8'}));
   const link=$('legal-receipt');link.href=receiptURL;link.download='LaSuite-accuse-'+data.id+'.txt';
   $('legal-reference').textContent=data.id;$('legal-received').textContent=new Date(data.received_at).toLocaleString('fr-FR',{timeZone:'Europe/Paris'})+' (heure de Paris)';
   form.hidden=true;result.hidden=false;report('Votre déclaration a été reçue. Conservez votre accusé de réception.');link.click();link.focus();
  }catch(error){report(error.name==='AbortError'?'La réponse tarde à arriver. Réessayez sans modifier votre déclaration : elle ne sera pas enregistrée deux fois.':error.message||'Enregistrement impossible. Réessayez ou contactez pierre.charlier@orbivia.fr.',true)}finally{clearTimeout(timer);lock(false)}
 };
 form.addEventListener('input',()=>{requestId=crypto.randomUUID()});
 window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue=''}});
})();
