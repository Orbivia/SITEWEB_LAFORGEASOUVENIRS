(()=>{
 'use strict';const $=id=>document.getElementById(id),button=$('legal-admin-open');if(!button)return;
 const config=window.LA_SUITE_CONFIG,client=window.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_ANON_KEY);
 const dialog=$('legal-admin-dialog'),list=$('legal-admin-list'),status=$('legal-admin-status'),closed=$('legal-admin-closed');let busy=false,loaded=false;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const api=async body=>{const {data,error}=await client.functions.invoke('suite-legal',{body});if(error||data?.error)throw Error(data?.error||'Les demandes ne sont pas accessibles.');return data;};
 async function refresh(){
  if(busy)return;busy=true;button.disabled=true;status.textContent='Chargement…';
  try{const data=await api({action:'list',include_closed:closed.checked});if($('admin-content').hidden)return;
   button.textContent='Demandes clients'+(data.pending?' · '+data.pending+' à traiter':'');
   list.innerHTML=(data.requests||[]).map(r=>'<details><summary><strong>'+esc(r.kind==='withdrawal'?'Rétractation':'Suppression de compte')+'</strong> · '+esc(r.full_name)+' · '+esc(new Date(r.received_at).toLocaleString('fr-FR'))+' · '+esc({new:'À traiter',processing:'En cours',closed:'Traité'}[r.state])+'</summary><p>'+esc(r.email)+'\n'+esc(r.contract_reference)+'\n'+esc(r.message)+'</p><p class="hint">Référence : '+esc(r.id)+'</p><label>Note de suivi<textarea maxlength="2000" data-legal-note="'+esc(r.id)+'">'+esc(r.admin_note)+'</textarea></label><div class="legal-admin-tools"><button class="btn secondary" type="button" data-legal-id="'+esc(r.id)+'" data-state="processing">En cours</button><button class="btn secondary" type="button" data-legal-id="'+esc(r.id)+'" data-state="closed">Marquer comme traité</button><button class="btn secondary" type="button" data-legal-id="'+esc(r.id)+'" data-state="new">À traiter</button></div></details>').join('')||'<p>Aucune demande dans cette liste.</p>';
   status.textContent='Le suivi ne déclenche aucun remboursement ni suppression. Vérifiez l’identité si nécessaire, traitez la demande, puis notez le résultat.';
  }catch(error){status.textContent=error.message}finally{busy=false;button.disabled=false}
 }
 button.onclick=()=>{if(!dialog.open)dialog.showModal();refresh()};$('legal-admin-close').onclick=()=>{if(!busy)dialog.close()};dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()});closed.onchange=refresh;
 list.addEventListener('click',async event=>{
  const target=event.target.closest('button[data-legal-id]');if(!target||busy)return;busy=true;dialog.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=true);
  try{const note=[...list.querySelectorAll('textarea')].find(el=>el.dataset.legalNote===target.dataset.legalId)?.value||'';await api({action:'update',id:target.dataset.legalId,state:target.dataset.state,note});busy=false;await refresh()}
  catch(error){status.textContent=error.message}finally{busy=false;dialog.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=false)}
 });
 new MutationObserver(()=>{if($('admin-content').hidden){loaded=false;if(dialog.open)dialog.close();list.replaceChildren();status.textContent='';button.textContent='Demandes clients';}else if(!loaded){loaded=true;refresh()}}).observe($('admin-content'),{attributes:true,attributeFilter:['hidden']});
})();
