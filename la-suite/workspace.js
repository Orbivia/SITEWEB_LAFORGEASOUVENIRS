/* One workspace: capsule selection, account settings. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function sheet(id,title){
  const d=document.createElement('dialog');d.id=id;d.className='studio-sheet workspace-sheet';d.setAttribute('aria-labelledby',id+'-title');
  d.innerHTML='<div class="studio-sheet-head"><h2 id="'+id+'-title">'+title+'</h2><button type="button" class="studio-close" aria-label="Fermer">×</button></div><div class="studio-sheet-body"></div>';
  document.body.append(d);d.querySelector('.studio-close').onclick=()=>d.close();
  d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)if(!d.canClose||d.canClose())d.close()}});return d;
 }
 async function deleteOwnedCapsule(sb,userId,capsule,confirmation){
  if(!userId)throw Error('Votre session a expiré. Reconnectez-vous.');
  if(!capsule.owner_id)throw Error('Les informations de la capsule sont incomplètes. Rechargez la page.');
  if(capsule.owner_id!==userId)throw Error('Cette capsule n’est pas rattachée à votre compte.');
  if(confirmation!==capsule.couple_name)throw Error('Confirmez le nom exact de votre capsule.');
  const {data,error}=await sb.from('capsules').delete().eq('id',capsule.id).eq('owner_id',userId).eq('couple_name',confirmation).select('id');
  if(error)throw error;
  if(data?.length!==1||data[0].id!==capsule.id)throw Error('La capsule a changé ou n’est plus disponible. Rouvrez la liste.');
 }
 window.SuiteWorkspace={deleteOwnedCapsule,async setup({sb,user,caps,access,selected,canLeave,prepareLeave,logout}){
  let ended=false,accountBusy=false,deleteBusy=false,deleteTarget=null;
  document.body.classList.add('workspace-ready');
  // Reserve the device inset once; Android browser chrome must not resize the tabs.
  const insetProbe=document.createElement('div');insetProbe.className='workspace-safe-area-probe';document.body.append(insetProbe);
  const deviceInset=Math.min(34,Math.max(0,parseFloat(getComputedStyle(insetProbe).paddingBottom)||0));insetProbe.remove();
  document.documentElement.style.setProperty('--workspace-device-inset',deviceInset+'px');
  const header=document.querySelector('.suite-topbar');header.querySelector('[data-suite-burger]')?.remove();header.querySelector('[data-suite-nav]')?.remove();
  const accountButton=document.createElement('button');accountButton.id='workspace-account';accountButton.className='workspace-account-button';accountButton.type='button';accountButton.setAttribute('aria-label','Mon compte');accountButton.setAttribute('aria-haspopup','dialog');accountButton.innerHTML='<i class="fa-solid fa-user" aria-hidden="true"></i><span>Mon compte</span>';header.append(accountButton);
  const title=$('dashboard-title');
  if(!selected)title.textContent='Mon espace';
  const choose=sheet('workspace-capsules','Mes capsules'),account=sheet('workspace-account-dialog','Mon compte'),deletion=sheet('workspace-delete-capsule','Supprimer la capsule ?');
  accountButton.setAttribute('aria-controls',account.id);
  const body=choose.querySelector('.studio-sheet-body');body.innerHTML='<div id="workspace-mine"><div id="workspace-capsule-list"></div><a id="workspace-create" class="btn primary" href="create.html"><i class="fa-solid fa-plus" aria-hidden="true"></i>Créer une capsule</a><p id="workspace-create-help" class="hint"></p></div><p id="workspace-selection-status" class="status" role="status"></p>';
  $('workspace-create').hidden=!access.can_create;$('workspace-create-help').textContent=access.can_create?'':access.reason||'';
  const summaries=new Map(),states={draft:'En préparation',scheduled:'Prête à partager',open:'Dépôts ouverts',closed:'Dépôts terminés',full:'Stockage rempli',expired:'Conservation terminée',suspended:'Dépôts en pause',missing_date:'Date à compléter'};
  const gear='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12.00 1.00L14.15 1.21L15.33 3.96L16.83 4.77L19.78 4.22L21.15 5.89L20.04 8.67L20.53 10.30L23.00 12.00L22.79 14.15L20.04 15.33L19.23 16.83L19.78 19.78L18.11 21.15L15.33 20.04L13.70 20.53L12.00 23.00L9.85 22.79L8.67 20.04L7.17 19.23L4.22 19.78L2.85 18.11L3.96 15.33L3.47 13.70L1.00 12.00L1.21 9.85L3.96 8.67L4.77 7.17L4.22 4.22L5.89 2.85L8.67 3.96L10.30 3.47ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/></svg>';
  const trash='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 2h6a1 1 0 0 1 1 1v1h4a1 1 0 0 1 1 1v2H3V5a1 1 0 0 1 1-1h4V3a1 1 0 0 1 1-1Z"/><path fill-rule="evenodd" d="m4 9 1 11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2l1-11ZM9 12a1 1 0 0 0-1 1v5a1 1 0 0 0 2 0v-5a1 1 0 0 0-1-1Zm6 0a1 1 0 0 0-1 1v5a1 1 0 0 0 2 0v-5a1 1 0 0 0-1-1Z"/></svg>';
  function render(){
   $('workspace-capsule-list').innerHTML=caps.map(c=>{
    const info=summaries.get(c.id),state=info?.state||(c.status==='active'?'scheduled':'draft'),current=c.slug===selected?.slug,settingsActive=current&&location.hash==='#settings';
    return '<div class="workspace-capsule-entry"><a class="workspace-capsule-row" href="dashboard.html?slug='+encodeURIComponent(c.slug)+'#configuration" '+(current?'aria-current="true"':'')+'><img src="'+esc(window.SuiteDesign.thumbnail(c.qr_style||'minimal'))+'" alt=""><span><strong>'+esc(c.couple_name)+'</strong><small>'+esc(new Date(c.wedding_date+'T12:00:00').toLocaleDateString('fr-FR'))+'</small><small class="workspace-state" data-state="'+esc(state)+'">'+esc(states[state]||'Indisponible')+'</small><small class="workspace-discovery">'+(info?Number(info.available_count)+' à découvrir · '+Number(info.locked_count)+' programmé'+(Number(info.locked_count)>1?'s':''):'Chargement des souvenirs…')+'</small></span></a><div class="workspace-capsule-actions"><button type="button" data-capsule-settings="'+esc(c.id)+'" aria-label="Paramètres de '+esc(c.couple_name)+'" title="Paramètres" aria-pressed="'+settingsActive+'">'+gear+'</button><button type="button" data-capsule-delete="'+esc(c.id)+'" aria-label="Supprimer '+esc(c.couple_name)+'" title="Supprimer">'+trash+'</button></div></div>';
   }).join('')||'<p class="hint">Créez votre première capsule pour commencer.</p>';
  }
  let summaryLoading=false;
  async function refreshSummaries(){if(ended||summaryLoading)return;summaryLoading=true;try{const{data,error}=await sb.rpc('owner_capsule_summary');if(error)throw error;if(ended)return;(data||[]).forEach(info=>summaries.set(info.id,info));render();$('workspace-selection-status').textContent=''}catch{if(!ended)$('workspace-selection-status').textContent='Les compteurs n’ont pas chargé. Fermez puis rouvrez cette fenêtre pour réessayer.'}finally{summaryLoading=false}}
  render();
  body.addEventListener('click',e=>{const link=e.target.closest('#workspace-mine a');if(link&&!canLeave()){e.preventDefault();$('workspace-selection-status').textContent='Enregistrez les modifications avant de changer de capsule.'}});
  choose.canClose=()=>true;account.canClose=()=>!accountBusy;deletion.canClose=()=>!deleteBusy;
  choose.querySelector('.studio-close').onclick=()=>choose.close();
  choose.addEventListener('close',()=>{accountButton.focus()});
  body.addEventListener('click',e=>{
   const settings=e.target.closest('[data-capsule-settings]'),remove=e.target.closest('[data-capsule-delete]');
   if(!settings&&!remove||ended||deleteBusy)return;
   const capsule=caps.find(c=>c.id===(settings?.dataset.capsuleSettings||remove?.dataset.capsuleDelete));if(!capsule)return;
   if(!canLeave()){$('workspace-selection-status').textContent='Patientez jusqu’à la fin de l’enregistrement.';return;}
   if(settings){
    choose.close();
    if(capsule.slug===selected?.slug)$('owner-tab-settings')?.click();
    else location.href='dashboard.html?slug='+encodeURIComponent(capsule.slug)+'#settings';
   }else{
    deleteTarget=capsule;$('workspace-delete-name').textContent=capsule.couple_name;
    $('workspace-delete-confirmation').value='';$('workspace-delete-status').textContent='';$('workspace-delete-submit').disabled=true;deletion.showModal();
   }
  });
  deletion.querySelector('.studio-sheet-body').innerHTML='<p>La capsule <strong id="workspace-delete-name"></strong> et ses souvenirs seront supprimés. Son lien et son QR code ne fonctionneront plus. Cette action est définitive.</p><form id="workspace-delete-form"><label for="workspace-delete-confirmation">Recopiez le nom de la capsule pour confirmer</label><input id="workspace-delete-confirmation" autocomplete="off" required><p id="workspace-delete-status" class="status" role="status" aria-live="polite"></p><div class="workspace-delete-actions"><button id="workspace-delete-cancel" class="btn secondary" type="button">Annuler</button><button id="workspace-delete-submit" class="btn primary" type="submit" disabled>Supprimer</button></div></form>';
  $('workspace-delete-confirmation').oninput=()=>{$('workspace-delete-submit').disabled=deleteBusy||$('workspace-delete-confirmation').value.trim()!==deleteTarget?.couple_name;};
  const closeDeletion=()=>{if(!deleteBusy)deletion.close();};deletion.querySelector('.studio-close').onclick=closeDeletion;$('workspace-delete-cancel').onclick=closeDeletion;
  deletion.addEventListener('cancel',e=>{if(deleteBusy)e.preventDefault();});
  deletion.addEventListener('close',()=>{const targetId=deleteTarget?.id;deleteTarget=null;[...choose.querySelectorAll('[data-capsule-delete]')].find(button=>button.dataset.capsuleDelete===targetId)?.focus();});
  $('workspace-delete-form').onsubmit=async e=>{
   e.preventDefault();if(ended||deleteBusy||!deleteTarget)return;
   const target=deleteTarget,confirmation=$('workspace-delete-confirmation').value.trim();
   if(confirmation!==target.couple_name)return;
   deleteBusy=true;deletion.querySelectorAll('button,input').forEach(el=>el.disabled=true);$('workspace-delete-status').textContent='Suppression…';
   try{
    if(!canLeave()){
     $('workspace-delete-status').textContent='Enregistrement des modifications…';
     if(!prepareLeave||!await prepareLeave()||!canLeave())throw Error('Les modifications ne sont pas encore enregistrées. Réessayez après l’enregistrement.');
    }
    if(ended)return;
    $('workspace-delete-status').textContent='Suppression…';
    await deleteOwnedCapsule(sb,user.id,target,confirmation);if(ended)return;
    caps.splice(caps.findIndex(c=>c.id===target.id),1);summaries.delete(target.id);
    if(target.slug===selected?.slug){try{localStorage.removeItem('la_suite_last_'+user.id)}catch{}location.replace(caps.length?'dashboard.html?slug='+encodeURIComponent(caps[0].slug):'dashboard.html');return;}
    deleteBusy=false;deletion.close();render();$('workspace-selection-status').textContent='La capsule a été supprimée.';
    try{const {data,error}=await sb.rpc('owner_capsule_access');if(!error&&data){access=data;$('workspace-create').hidden=!data.can_create;$('workspace-create-help').textContent=data.can_create?'':data.reason||'';}}catch{}
   }catch(error){if(!ended)$('workspace-delete-status').textContent='Suppression impossible : '+error.message;}
   finally{deleteBusy=false;deletion.querySelectorAll('button,input').forEach(el=>el.disabled=false);$('workspace-delete-submit').disabled=$('workspace-delete-confirmation').value.trim()!==deleteTarget?.couple_name;}
  };
  account.querySelector('.studio-sheet-body').innerHTML='<section class="workspace-account-section"><h3>Connexion</h3><p class="workspace-account-label">Adresse e-mail</p><div class="workspace-email"><span id="workspace-email-current"></span><button id="workspace-edit-email" aria-expanded="false" aria-controls="workspace-email-form" class="btn secondary" type="button">Modifier</button></div><form id="workspace-email-form" hidden><label for="workspace-email-new">Nouvelle adresse e-mail</label><input id="workspace-email-new" type="email" autocomplete="email" required maxlength="254"><p class="hint">Confirmez le changement via les e-mails reçus. Votre adresse actuelle reste utilisée jusqu’à confirmation.</p><button class="btn primary" type="submit">Confirmer le changement</button></form></section><section class="workspace-account-section workspace-security" aria-label="Sécurité"><button id="workspace-edit-password" aria-expanded="false" aria-controls="workspace-password-form" class="workspace-account-row" type="button"><i class="fa-solid fa-lock" aria-hidden="true"></i>Modifier mon mot de passe<i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button><form id="workspace-password-form" hidden><label for="workspace-password-current">Mot de passe actuel</label><input id="workspace-password-current" type="password" autocomplete="current-password" required><label for="workspace-password-new">Nouveau mot de passe</label><input id="workspace-password-new" type="password" autocomplete="new-password" minlength="10" required><label for="workspace-password-confirm">Confirmer le nouveau mot de passe</label><input id="workspace-password-confirm" type="password" autocomplete="new-password" minlength="10" required><small>Au moins 10 caractères.</small><button class="btn primary" type="submit">Modifier mon mot de passe</button><a href="auth.html?mode=reset">Mot de passe oublié ?</a></form></section><p id="workspace-account-status" class="status" role="status" aria-live="polite"></p><button id="logout" class="workspace-account-row workspace-logout" type="button"><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i>Déconnexion</button>';
  const capsulesButton=document.createElement('button');capsulesButton.id='workspace-open-capsules';capsulesButton.type='button';capsulesButton.className='workspace-account-row';capsulesButton.setAttribute('aria-haspopup','dialog');capsulesButton.setAttribute('aria-controls',choose.id);capsulesButton.innerHTML='<i class="fa-solid fa-layer-group" aria-hidden="true"></i>Mes capsules<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';const capsulesSection=document.createElement('section');capsulesSection.className='workspace-account-section workspace-account-capsules';capsulesSection.append(capsulesButton);account.querySelector('.studio-sheet-body').prepend(capsulesSection);
  // Compact account menu; each edit opens its own view in the same dialog.
  account.classList.add('workspace-account-compact');
  const accountBody=account.querySelector('.studio-sheet-body'),accountHeading=account.querySelector('h2');
  const identity=document.createElement('div');identity.className='workspace-account-identity';accountHeading.before(identity);identity.append(accountHeading,$('workspace-email-current'));
  const emailButton=$('workspace-edit-email');emailButton.className='workspace-account-row';emailButton.innerHTML='<i class="fa-solid fa-envelope" aria-hidden="true"></i><span>Modifier mon adresse e-mail</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';
  $('workspace-edit-password').innerHTML='<i class="fa-solid fa-lock" aria-hidden="true"></i><span>Modifier mon mot de passe</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';
  capsulesButton.innerHTML='<i class="fa-solid fa-layer-group" aria-hidden="true"></i><span>Mes capsules</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';
  $('logout').innerHTML='<i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i><span>Se déconnecter</span>';
  const accountMenu=document.createElement('div');accountMenu.className='workspace-account-menu';accountMenu.append(capsulesButton,emailButton,$('workspace-edit-password'));
  const accountViews=document.createElement('div');accountViews.className='workspace-account-views';accountViews.hidden=true;
  const accountBack=document.createElement('button');accountBack.type='button';accountBack.className='workspace-account-back';accountBack.innerHTML='<i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Mon compte';accountViews.append(accountBack,$('workspace-email-form'),$('workspace-password-form'));
  const accountStatus=$('workspace-account-status'),accountLogout=$('logout');
  accountBody.replaceChildren(accountMenu,accountViews,accountStatus,accountLogout);
  function showAccountView(kind){
   const editing=Boolean(kind);accountMenu.hidden=editing;accountViews.hidden=!editing;accountLogout.hidden=editing;$('workspace-email-current').hidden=editing;
   accountHeading.textContent=kind==='email'?'Modifier mon adresse e-mail':kind==='password'?'Modifier mon mot de passe':'Mon compte';
   for(const name of ['email','password']){$('workspace-'+name+'-form').hidden=kind!==name;$('workspace-edit-'+name).setAttribute('aria-expanded',String(kind===name));}
   accountBody.scrollTop=0;
  }
  accountBack.onclick=()=>{if(accountBusy)return;const passwordOpen=!$('workspace-password-form').hidden;if(passwordOpen)$('workspace-password-form').reset();showAccountView(null);(passwordOpen?$('workspace-edit-password'):emailButton).focus();};
  capsulesButton.onclick=async()=>{if(ended||accountBusy||deleteBusy)return;account.close();render();choose.showModal();await refreshSummaries()};
  const summaryTimer=setInterval(()=>{if(ended){clearInterval(summaryTimer);return}if(choose.open&&document.visibilityState==='visible')refreshSummaries()},15000);
  document.addEventListener('visibilitychange',()=>{if(!ended&&choose.open&&document.visibilityState==='visible')refreshSummaries()});
  let currentEmail=user.email||'';$('workspace-email-current').textContent=currentEmail;
  function report(text,error=false){const status=$('workspace-account-status');status.textContent=text;status.className='status show '+(error?'err':'ok');}
  function busy(value){accountBusy=value;account.querySelectorAll('button,input').forEach(b=>b.disabled=value);}
  accountButton.onclick=()=>{if(!ended){accountButton.setAttribute('aria-expanded','true');account.showModal()}};account.addEventListener('close',()=>accountButton.setAttribute('aria-expanded','false'));account.addEventListener('toggle',()=>accountButton.setAttribute('aria-expanded',String(account.open)));
  account.addEventListener('close',()=>{account.querySelectorAll('input[type=password]').forEach(i=>i.value='');['email','password'].forEach(kind=>{$('workspace-'+kind+'-form').hidden=true;$('workspace-edit-'+kind).setAttribute('aria-expanded','false')});$('workspace-account-status').textContent='';showAccountView(null);accountButton.focus()});
  account.addEventListener('cancel',e=>{if(accountBusy)e.preventDefault()});account.querySelector('.studio-close').onclick=()=>{if(!accountBusy)account.close()};
  $('workspace-edit-email').onclick=()=>{if(accountBusy)return;showAccountView('email');$('workspace-email-new').value=currentEmail;$('workspace-email-new').focus();};
  $('workspace-edit-password').onclick=()=>{if(accountBusy)return;showAccountView('password');$('workspace-password-current').focus();};
  $('workspace-email-form').onsubmit=async e=>{e.preventDefault();if(ended||accountBusy)return;const email=$('workspace-email-new').value.trim();if(email.toLowerCase()===currentEmail.toLowerCase())return report('Cette adresse est déjà utilisée.');if(!e.target.reportValidity())return;busy(true);report('Envoi de la confirmation…');try{const {error}=await sb.auth.updateUser({email},{emailRedirectTo:new URL('dashboard.html',location.href).href});if(error)throw error;if(!ended)report('Demande envoyée. Consultez vos e-mails pour confirmer le changement.');}catch(e){if(!ended)report('Changement impossible : '+e.message,true)}finally{busy(false)}};
  $('workspace-password-form').onsubmit=async e=>{e.preventDefault();if(ended||accountBusy||!e.target.reportValidity())return;const old=$('workspace-password-current').value,password=$('workspace-password-new').value;if(password!==$('workspace-password-confirm').value)return report('Les nouveaux mots de passe ne correspondent pas.',true);if(password===old)return report('Choisissez un mot de passe différent de l’actuel.',true);busy(true);report('Modification en cours…');try{
   const checked=await sb.auth.signInWithPassword({email:currentEmail,password:old});if(checked.error)throw Error('Le mot de passe actuel est incorrect.');if(checked.data?.user&&checked.data.user.id!==user.id)throw Error('Le compte a changé. Reconnectez-vous.');if(ended)return;
   const {error}=await sb.auth.updateUser({password});if(error)throw error;if(!ended){e.target.reset();showAccountView(null);$('workspace-edit-password').focus();report('Votre mot de passe a été modifié.');}
  }catch(e){if(!ended)report('Modification impossible : '+e.message,true)}finally{busy(false)}};
  $('logout').onclick=async()=>{if(accountBusy)return report('Patientez jusqu’à la fin de l’opération.',true);await logout();};
  sb.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||session?.user?.id&&session.user.id!==user.id){ended=true;choose.close();account.close();deletion.close();queueMicrotask(()=>{choose.replaceChildren();account.replaceChildren();deletion.replaceChildren()});document.querySelectorAll('.owner-tabs').forEach(n=>n.remove());}else if(event==='USER_UPDATED'&&session?.user?.email){currentEmail=session.user.email;$('workspace-email-current').textContent=currentEmail;}});
  // Follow the visual viewport while Android browser bars expand/collapse.
  const viewport=window.visualViewport;let frame;
  function align(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(ended)return;const visible=window.visualViewport,zoomed=visible&&Math.abs(visible.scale-1)>.05;const gap=visible&&!zoomed?Math.max(0,innerHeight-visible.height-visible.offsetTop):0;document.documentElement.style.setProperty('--workspace-bottom',gap+'px');document.documentElement.style.setProperty('--workspace-viewport-height',(visible&&!zoomed?visible.height:innerHeight)+'px');document.body.classList.toggle('workspace-keyboard',!!visible&&!zoomed&&innerHeight-visible.height>150);if(account.open&&account.contains(document.activeElement)&&document.activeElement.matches('input'))document.activeElement.scrollIntoView({block:'nearest'});});}
  viewport?.addEventListener('resize',align);viewport?.addEventListener('scroll',align);window.addEventListener('resize',align);window.addEventListener('scroll',align,{passive:true});align();
 }};
})();
