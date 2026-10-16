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
 window.SuiteWorkspace={deleteOwnedCapsule,async setup({sb,user,caps,access,selected,canLeave,prepareLeave,downloadCapsule,logout}){
  let ended=false,accountBusy=false,deleteBusy=false,downloadBusy=false,deleteTarget=null;
  document.body.classList.add('workspace-ready');
  // Reserve the device inset once; Android browser chrome must not resize the tabs.
  const insetProbe=document.createElement('div');insetProbe.className='workspace-safe-area-probe';document.body.append(insetProbe);
  const deviceInset=Math.min(34,Math.max(0,parseFloat(getComputedStyle(insetProbe).paddingBottom)||0));insetProbe.remove();
  document.documentElement.style.setProperty('--workspace-device-inset',deviceInset+'px');
  const header=document.querySelector('.suite-topbar');header.querySelector('[data-suite-burger]')?.remove();header.querySelector('[data-suite-nav]')?.remove();
  const accountButton=document.createElement('button');accountButton.id='workspace-account';accountButton.className='workspace-account-button';accountButton.type='button';accountButton.setAttribute('aria-label','Mon compte');accountButton.setAttribute('aria-haspopup','dialog');accountButton.innerHTML='<i class="fa-solid fa-user" aria-hidden="true"></i><span>Mon compte</span>';header.append(accountButton);
  const title=$('dashboard-title');
  if(!selected)title.textContent='Mon espace';
  const choose=sheet('workspace-capsules','Mes capsules'),account=sheet('workspace-account-dialog','Mon compte'),deletion=sheet('workspace-delete-capsule','Supprimer la capsule ?'),settingsDialog=sheet('workspace-capsule-settings','Paramètres de la capsule');
  accountButton.setAttribute('aria-controls',account.id);
  const body=choose.querySelector('.studio-sheet-body');body.innerHTML='<div id="workspace-mine"><div id="workspace-capsule-list"></div><div class="workspace-create-actions"><a id="workspace-create" class="btn primary" href="create.html"><i class="fa-solid fa-plus" aria-hidden="true"></i>Créer une capsule</a><p id="workspace-create-help" class="hint"></p></div></div><p id="workspace-selection-status" class="status" role="status"></p>';
  $('workspace-create').hidden=!access.can_create;$('workspace-create-help').textContent=access.can_create?'':access.reason||'';
  const planNames={text:'Petit mot',photo:'Essentiel',audio:'Plus',premium:'Premium'};
  const summaries=new Map(),states={draft:'En préparation',scheduled:'Prête à partager',open:'Dépôts ouverts',closed:'Dépôts terminés',full:'Stockage rempli',expired:'Conservation terminée',suspended:'Dépôts en pause',missing_date:'Date à compléter'};
  const downloadIcon='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 2h2v11l4-4 1.4 1.4L12 16l-6.4-5.6L7 9l4 4V2zM4 16h2v4h12v-4h2v6H4z"></path></svg>';
  const trash='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><use href="assets/icons/solid/sprite.svg?v=20261011-icons1#supprimer"></use></svg>';
  function render(){
   $('workspace-capsule-list').innerHTML=caps.map(c=>{
    const info=summaries.get(c.id),state=info?.state||(c.status==='active'?'scheduled':'draft'),current=c.slug===selected?.slug,artwork=window.SuiteDesign.artwork(c.qr_style||'minimal',{background:window.SuiteDesign.background(c)})||window.SuiteDesign.thumbnail(c.qr_style||'minimal');
    return '<div class="workspace-capsule-entry"><a class="workspace-capsule-row" href="dashboard.html?slug='+encodeURIComponent(c.slug)+'" '+(current?'aria-current="true"':'')+'><img class="workspace-capsule-preview" src="'+esc(artwork)+'" alt=""><span><strong>'+esc(c.couple_name)+'</strong><small class="workspace-plan">'+esc(planNames[window.SuiteDesign.effectivePlan(c)]||'Premium')+'</small><small>'+esc(new Date(c.wedding_date+'T12:00:00').toLocaleDateString('fr-FR'))+'</small><small class="workspace-state" data-state="'+esc(state)+'">'+esc(states[state]||'Indisponible')+'</small><small class="workspace-discovery">'+(info?Number(info.available_count)+' à découvrir · '+Number(info.locked_count)+' programmé'+(Number(info.locked_count)>1?'s':''):'Chargement des souvenirs…')+'</small></span></a><div class="workspace-capsule-actions"><button type="button" data-capsule-settings="'+esc(c.id)+'" aria-label="Paramètres de '+esc(c.couple_name)+'" title="Paramètres"><i class="fa-solid fa-gear" aria-hidden="true"></i></button></div></div>';
   }).join('')||'<p class="hint">Créez votre première capsule pour commencer.</p>';
  }
  let summaryLoading=false;
  async function refreshSummaries(){if(ended||summaryLoading||downloadBusy)return;summaryLoading=true;try{const{data,error}=await sb.rpc('owner_capsule_summary');if(error)throw error;if(ended)return;(data||[]).forEach(info=>summaries.set(info.id,info));render();$('workspace-selection-status').textContent=''}catch{if(!ended)$('workspace-selection-status').textContent='Les compteurs n’ont pas chargé. Fermez puis rouvrez cette fenêtre pour réessayer.'}finally{summaryLoading=false}}
  render();
  body.addEventListener('click',e=>{const link=e.target.closest('#workspace-mine a');if(link&&!canLeave()){e.preventDefault();$('workspace-selection-status').textContent='Enregistrez les modifications avant de changer de capsule.'}});
  choose.canClose=()=>true;account.canClose=()=>!accountBusy;deletion.canClose=()=>!deleteBusy;
  choose.querySelector('.studio-close').onclick=()=>choose.close();
  choose.addEventListener('close',()=>{accountButton.focus()});
  let settingsTarget=null,dateBusy=false;
  settingsDialog.canClose=()=>!dateBusy&&!downloadBusy;
  settingsDialog.addEventListener("cancel",event=>{if(!settingsDialog.canClose())event.preventDefault();});
  settingsDialog.querySelector(".studio-close").onclick=()=>{if(settingsDialog.canClose())settingsDialog.close();};
  body.addEventListener('click',e=>{
   const button=e.target.closest('[data-capsule-settings]');if(!button)return;
   settingsTarget=caps.find(c=>c.id===button.dataset.capsuleSettings);if(!settingsTarget)return;
   const c=settingsTarget,locked=c.status==='active'&&c.guest_rules_version===1;
   settingsDialog.querySelector('.studio-sheet-body').innerHTML='<p><strong>'+esc(c.couple_name)+'</strong></p><form data-settings-date><label for="workspace-event-date">Date de l’événement</label><div class="workspace-date-row"><input id="workspace-event-date" type="date" required value="'+esc(c.wedding_date)+'" '+(locked?'disabled':'')+'><button class="btn primary" type="submit" '+(locked?'disabled':'')+'>Changer la date</button></div></form><hr><button class="btn secondary" type="button" data-capsule-download="'+esc(c.id)+'" '+(c.status==='active'?'':'disabled')+'>Télécharger les souvenirs ouverts</button><button class="btn secondary" type="button" data-capsule-delete="'+esc(c.id)+'">Supprimer la capsule</button><p data-settings-status class="status" role="status"></p>';
   settingsDialog.showModal();
   settingsDialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();if(locked||dateBusy||downloadBusy||ended)return;if(!canLeave()){settingsDialog.querySelector('[data-settings-status]').textContent='Enregistrez vos modifications avant de changer la date.';return;}
    const date=$('workspace-event-date').value;if(!date)return;if(c.status==='draft'&&date<=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date())){settingsDialog.querySelector('[data-settings-status]').textContent='Choisissez une date future.';return;}
    const status=settingsDialog.querySelector('[data-settings-status]'),submit=settingsDialog.querySelector('[type=submit]');dateBusy=true;settingsDialog.querySelectorAll('button,input').forEach(el=>el.disabled=true);
    try{const{data,error}=await sb.from('capsules').update({wedding_date:date}).eq('id',c.id).eq('owner_id',user.id).select('id,wedding_date').single();if(error)throw error;c.wedding_date=data.wedding_date;render();status.textContent='Date enregistrée.';if(c.id===selected?.id)location.reload();}catch(error){status.textContent='Impossible de changer la date : '+error.message;}finally{dateBusy=false;settingsDialog.querySelectorAll('button,input').forEach(el=>el.disabled=false);settingsDialog.querySelector('[data-capsule-download]').disabled=c.status!=='active';}
   };
  });
  const capsuleAction=async e=>{
   const settings=e.target.closest('[data-capsule-download]'),remove=e.target.closest('[data-capsule-delete]');
   if(!settings&&!remove||ended||deleteBusy||downloadBusy||dateBusy)return;
   const capsule=caps.find(c=>c.id===(settings?.dataset.capsuleDownload||remove?.dataset.capsuleDelete));if(!capsule)return;
   if(!canLeave()){(settingsDialog.open?settingsDialog.querySelector('[data-settings-status]'):$('workspace-selection-status')).textContent='Patientez jusqu’à la fin de l’enregistrement.';return;}
   if(settings){
    if(capsule.status!=='active')return;
    downloadBusy=true;body.querySelectorAll('.workspace-capsule-actions button').forEach(button=>button.disabled=true);
    try{await downloadCapsule?.(capsule,settings,settingsDialog.open?settingsDialog.querySelector('[data-settings-status]'):$('workspace-selection-status'));}finally{downloadBusy=false;body.querySelectorAll('.workspace-capsule-actions button').forEach(button=>button.disabled=false);}
   }else{
    deleteTarget=capsule;$('workspace-delete-name').textContent=capsule.couple_name;
    $('workspace-delete-confirmation').value='';$('workspace-delete-status').textContent='';$('workspace-delete-submit').disabled=true;deletion.showModal();
   }
  };
  body.addEventListener('click',capsuleAction);settingsDialog.querySelector('.studio-sheet-body').addEventListener('click',capsuleAction);
  deletion.querySelector('.studio-sheet-body').innerHTML='<p>La capsule <strong id="workspace-delete-name"></strong> et ses souvenirs seront supprimés. Son lien et son QR code ne fonctionneront plus. Cette action est définitive.</p><form id="workspace-delete-form"><label for="workspace-delete-confirmation">Recopiez le nom de la capsule pour confirmer</label><input id="workspace-delete-confirmation" autocomplete="off" required><p id="workspace-delete-status" class="status" role="status" aria-live="polite"></p><div class="workspace-delete-actions"><button id="workspace-delete-cancel" class="btn secondary" type="button">Annuler</button><button id="workspace-delete-submit" class="btn primary" type="submit" disabled>Supprimer</button></div></form>';
  $('workspace-delete-confirmation').oninput=()=>{$('workspace-delete-submit').disabled=deleteBusy||$('workspace-delete-confirmation').value.trim()!==deleteTarget?.couple_name;};
  const closeDeletion=()=>{if(!deleteBusy)deletion.close();};deletion.querySelector('.studio-close').onclick=closeDeletion;$('workspace-delete-cancel').onclick=closeDeletion;
  deletion.addEventListener('cancel',e=>{if(deleteBusy)e.preventDefault();});
  deletion.addEventListener('close',()=>{const targetId=deleteTarget?.id;deleteTarget=null;[...choose.querySelectorAll('[data-capsule-settings]')].find(button=>button.dataset.capsuleSettings===targetId)?.focus();});
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
    deleteBusy=false;deletion.close();settingsDialog.close();render();$('workspace-selection-status').textContent='La capsule a été supprimée.';
    try{const {data,error}=await sb.rpc('owner_capsule_access');if(!error&&data){access=data;$('workspace-create').hidden=!data.can_create;$('workspace-create-help').textContent=data.can_create?'':data.reason||'';}}catch{}
   }catch(error){if(!ended)$('workspace-delete-status').textContent='Suppression impossible : '+error.message;}
   finally{deleteBusy=false;deletion.querySelectorAll('button,input').forEach(el=>el.disabled=false);$('workspace-delete-submit').disabled=$('workspace-delete-confirmation').value.trim()!==deleteTarget?.couple_name;}
  };
  account.querySelector('.studio-sheet-body').innerHTML='<section class="workspace-account-section"><h3>Connexion</h3><p class="workspace-account-label">Adresse e-mail</p><div class="workspace-email"><span id="workspace-email-current"></span><button id="workspace-edit-email" aria-expanded="false" aria-controls="workspace-email-form" class="btn secondary" type="button">Modifier</button></div><form id="workspace-email-form" hidden><label for="workspace-email-new">Nouvelle adresse e-mail</label><input id="workspace-email-new" type="email" autocomplete="email" required maxlength="254"><p class="hint">Confirmez le changement via les e-mails reçus. Votre adresse actuelle reste utilisée jusqu’à confirmation.</p><button class="btn primary" type="submit">Confirmer le changement</button></form></section><section class="workspace-account-section workspace-security" aria-label="Sécurité"><button id="workspace-edit-password" aria-expanded="false" aria-controls="workspace-password-form" class="workspace-account-row" type="button"><i class="fa-solid fa-lock" aria-hidden="true"></i>Modifier mon mot de passe<i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button><form id="workspace-password-form" hidden><label for="workspace-password-current">Mot de passe actuel</label><input id="workspace-password-current" type="password" autocomplete="current-password" required><label for="workspace-password-new">Nouveau mot de passe</label><input id="workspace-password-new" type="password" autocomplete="new-password" minlength="10" required><label for="workspace-password-confirm">Confirmer le nouveau mot de passe</label><input id="workspace-password-confirm" type="password" autocomplete="new-password" minlength="10" required><small>Au moins 10 caractères.</small><button class="btn primary" type="submit">Modifier mon mot de passe</button><a href="auth.html?mode=reset">Mot de passe oublié ?</a></form></section><p id="workspace-account-status" class="status" role="status" aria-live="polite"></p><button id="logout" class="workspace-account-row workspace-logout" type="button"><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i>Déconnexion</button>';
  const customizeLink=document.createElement('a');customizeLink.className='workspace-account-row';customizeLink.href='dashboard.html?slug='+encodeURIComponent(selected?.slug||'')+'#configuration';customizeLink.innerHTML='<i class="fa-solid fa-palette" aria-hidden="true"></i><span>Personnaliser ma capsule</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';customizeLink.hidden=!selected;account.querySelector('.studio-sheet-body').prepend(customizeLink);const discoverLink=document.createElement('a');discoverLink.className='workspace-account-row';discoverLink.href='dashboard.html?slug='+encodeURIComponent(selected?.slug||'')+'#messages';discoverLink.hidden=!selected||selected.status!=='active';discoverLink.innerHTML='<i class="fa-solid fa-box-open" aria-hidden="true"></i><span>Découvrir ma capsule</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';customizeLink.after(discoverLink);
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
  const notifications=sheet('workspace-email-preferences','Préférences e-mail');
  const notificationsButton=document.createElement('button');notificationsButton.id='workspace-open-email-preferences';notificationsButton.type='button';notificationsButton.className='workspace-account-row';notificationsButton.setAttribute('aria-haspopup','dialog');notificationsButton.setAttribute('aria-controls',notifications.id);notificationsButton.innerHTML='<i class="fa-solid fa-bell" aria-hidden="true"></i><span>Préférences e-mail</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';
  const aboutLink=document.createElement('a');aboutLink.id='workspace-about';aboutLink.className='workspace-account-row';aboutLink.href='a-propos.html';aboutLink.innerHTML='<i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>À propos</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';
  accountMenu.append(notificationsButton,aboutLink);
  aboutLink.onclick=event=>{if(accountBusy||!canLeave()){event.preventDefault();report('Patientez jusqu’à la fin de l’enregistrement.',true)}};
  let notificationBusy=false,notificationLoad=0;
  const notificationBody=notifications.querySelector('.studio-sheet-body');
  notificationBody.innerHTML='<p class="hint">Choisissez les capsules pour lesquelles recevoir les récapitulatifs de souvenirs et les rappels avant la fin de conservation.</p><div id="workspace-email-choices"></div><p id="workspace-email-status" class="status show" role="status" aria-live="polite"></p><p class="hint">Ces préférences ne concernent pas les e-mails nécessaires à la connexion et à la sécurité du compte.</p>';
  const notificationStatus=$('workspace-email-status'),notificationChoices=$('workspace-email-choices');
  function notificationReport(text,error=false){notificationStatus.textContent=text;notificationStatus.className='status show '+(error?'err':'ok');}
  function setNotificationBusy(value){notificationBusy=value;notifications.querySelectorAll('button,input').forEach(el=>el.disabled=value);}
  notifications.canClose=()=>!notificationBusy;
  notifications.querySelector('.studio-close').onclick=()=>{if(!notificationBusy)notifications.close()};
  notifications.addEventListener('cancel',event=>{if(notificationBusy)event.preventDefault()});
  notifications.addEventListener('close',()=>{notificationLoad++;if(!ended&&account.open)notificationsButton.focus()});
  notificationsButton.onclick=async()=>{
   if(ended||accountBusy||notificationBusy)return;
   if(!canLeave()){report('Patientez jusqu’à la fin de l’enregistrement.',true);return;}
   const load=++notificationLoad;notificationChoices.replaceChildren();notificationReport('Chargement des préférences…');notifications.showModal();
   try{
    const {data,error}=await sb.from('capsules').select('id,couple_name,notify_by_email').eq('owner_id',user.id).order('created_at',{ascending:false});
    if(ended||load!==notificationLoad)return;if(error)throw error;
    notificationChoices.innerHTML=(data||[]).map(c=>'<label class="workspace-email-choice"><span><strong>'+esc(c.couple_name)+'</strong><small>'+(c.notify_by_email!==false?'E-mails activés':'E-mails désactivés')+'</small></span><input type="checkbox" data-email-capsule="'+esc(c.id)+'" '+(c.notify_by_email!==false?'checked':'')+'></label>').join('');
    notificationReport(data?.length?'Enregistrement automatique après chaque modification.':'Vous pourrez choisir vos notifications après la création d’une capsule.');
   }catch{if(!ended&&load===notificationLoad)notificationReport('Les préférences n’ont pas chargé. Fermez puis rouvrez cette fenêtre pour réessayer.',true)}
  };
  notificationChoices.addEventListener('change',async event=>{
   const input=event.target.closest('input[data-email-capsule]');if(!input||ended||notificationBusy)return;
   const id=input.dataset.emailCapsule,value=input.checked;setNotificationBusy(true);notificationReport('Enregistrement…');
   try{
    const {data,error}=await sb.from('capsules').update({notify_by_email:value}).eq('id',id).eq('owner_id',user.id).select('id,notify_by_email').single();
    if(ended)return;if(error)throw error;if(data?.id!==id||data.notify_by_email!==value)throw Error('Préférence non enregistrée');
    const capsule=caps.find(c=>c.id===id);if(capsule)capsule.notify_by_email=value;
    if(selected?.id===id){selected.notify_by_email=value;if($('capsule-notify'))$('capsule-notify').checked=value;}
    input.closest('label').querySelector('small').textContent=value?'E-mails activés':'E-mails désactivés';notificationReport('Préférence enregistrée.');
   }catch{if(!ended){input.checked=!value;notificationReport('La modification n’a pas été enregistrée. Réessayez.',true)}}
   finally{if(!ended)setNotificationBusy(false)}
  });
  const accountViews=document.createElement('div');accountViews.className='workspace-account-views';accountViews.hidden=true;
  const accountBack=document.createElement('button');accountBack.type='button';accountBack.className='workspace-account-back';accountBack.innerHTML='<i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Mon compte';accountViews.append(accountBack,$('workspace-email-form'),$('workspace-password-form'));
  const accountStatus=$('workspace-account-status'),accountLogout=$('logout');
  accountBody.replaceChildren(accountMenu,accountViews,accountStatus,accountLogout);
  // APK 0.2.0 appends legacy rows after logout. Keep its nodes so its own
  // observer does not recreate them, and integrate only configured phone alerts.
  let nativeNotificationsConfigured=false;
  function syncNativeAccountRows(){
   if(ended)return;
   const privacy=account.querySelector('#android-privacy');
   if(privacy)privacy.hidden=true;
   const phone=account.querySelector('#android-notifications');
   if(!phone)return;
   phone.hidden=!nativeNotificationsConfigured;
   if(phone.dataset.workspaceNativeRow!=='1'){
    phone.innerHTML='<i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i><span>Notifications du téléphone</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';
    phone.dataset.workspaceNativeRow='1';
   }
   if(phone.parentElement!==accountMenu)accountMenu.insertBefore(phone,aboutLink);
  }
  const nativeAccountObserver=new MutationObserver(syncNativeAccountRows);
  nativeAccountObserver.observe(accountBody,{childList:true,subtree:true});
  const nativeNotificationState=event=>{nativeNotificationsConfigured=event.detail?.configured===true;syncNativeAccountRows()};
  window.addEventListener('la-suite-native-notifications',nativeNotificationState);
  function stopNativeAccountSync(){
   nativeAccountObserver.disconnect();
   window.removeEventListener('la-suite-native-notifications',nativeNotificationState);
   const phone=account.querySelector('#android-notifications');if(phone)phone.hidden=true;
  }
  syncNativeAccountRows();
  try{window.LaSuiteAndroid?.notificationState?.()}catch{/* Native bridge not ready yet. */}
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
  sb.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||session?.user?.id&&session.user.id!==user.id){ended=true;stopNativeAccountSync();notificationLoad++;notifications.close();choose.close();account.close();deletion.close();queueMicrotask(()=>{choose.replaceChildren();account.replaceChildren();deletion.replaceChildren();notifications.replaceChildren()});document.querySelectorAll('.owner-tabs').forEach(n=>n.remove());}else if(event==='USER_UPDATED'&&session?.user?.email){currentEmail=session.user.email;$('workspace-email-current').textContent=currentEmail;}});
  // Follow the visual viewport while Android browser bars expand/collapse.
  const viewport=window.visualViewport;let frame;
  function align(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(ended)return;const visible=window.visualViewport,zoomed=visible&&Math.abs(visible.scale-1)>.05;const gap=visible&&!zoomed?Math.max(0,innerHeight-visible.height-visible.offsetTop):0;document.documentElement.style.setProperty('--workspace-bottom',gap+'px');document.documentElement.style.setProperty('--workspace-viewport-height',(visible&&!zoomed?visible.height:innerHeight)+'px');document.body.classList.toggle('workspace-keyboard',!!visible&&!zoomed&&innerHeight-visible.height>150);if(account.open&&account.contains(document.activeElement)&&document.activeElement.matches('input'))document.activeElement.scrollIntoView({block:'nearest'});});}
  viewport?.addEventListener('resize',align);viewport?.addEventListener('scroll',align);window.addEventListener('resize',align);window.addEventListener('scroll',align,{passive:true});align();
 }};
})();
