/* Compact organizer layout. Move existing controls, preserving persistence and validation. */
(function(){
 'use strict';
 window.SuiteOrganizerLayout={mount(c){
  const $=id=>document.getElementById(id),controls=document.querySelector('.qr-designer-controls');
  if(!controls||document.body.classList.contains('organizer-layout-ready'))return;
  document.body.classList.add('organizer-layout-ready');
  const header=document.querySelector('.suite-topbar'),tabs=document.querySelector('.owner-tabs');
  const brand=header.querySelector('.suite-brand img');brand.src='assets/la-forge-logo.webp';brand.alt='La Forge à Souvenirs';
  const wordmark=document.createElement('span');wordmark.className='organizer-wordmark';wordmark.textContent='La Suite';header.insertBefore(wordmark,header.children[1]);header.insertBefore(tabs,wordmark.nextSibling);
  const selector=document.querySelector('.workspace-selector');
  if(!selector){const choose=document.createElement('button');choose.type='button';choose.className='organizer-capsule-selector';choose.innerHTML='Mes capsules <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>';choose.setAttribute('aria-haspopup','dialog');choose.setAttribute('aria-controls','workspace-capsules');choose.onclick=()=>$('workspace-open-capsules').click();header.insertBefore(choose,header.querySelector('.workspace-account-button'));}
  if(selector){selector.classList.add('organizer-capsule-selector');const label=document.createElement('span');label.textContent='Mes capsules';selector.prepend(label);header.insertBefore(selector,header.querySelector('.workspace-account-button'));}
  const head=document.querySelector('.qr-designer-head');const subtitle=document.createElement('p');subtitle.textContent='Créez une carte QR et une page d’accueil qui vous ressemblent.';head.firstElementChild.append(subtitle);
  document.querySelector('.qr-control-title').hidden=true;
  const design=document.querySelector('.qr-theme-gallery').closest('.customization-card');
  const designHeading=design.querySelector('h3,h4,strong');if(designHeading)designHeading.textContent='Design commun';
  document.querySelectorAll('.qr-font-sample').forEach(e=>e.textContent='Aa');
  const personalization=document.querySelector('.qr-personalization-group');
  const compact=document.createElement('div');compact.className='organizer-compact-fields';
  const date=$('capsule-date').closest('.field'),dateHome=document.createComment('date');date.before(dateHome);
  const textGroup=$('print-title').closest('.qr-control-group'),title=$('print-title').closest('.field');title.querySelector('label').textContent='Titre de la fiche';compact.append(title,date);
  const settings=document.querySelector('[data-owner-panel=settings]');
  const relocateDate=()=>{if(!settings.hidden)dateHome.after(date);else title.after(date);};
  new MutationObserver(relocateDate).observe(settings,{attributes:true,attributeFilter:['hidden']});
  const nativeDate=date.querySelector('#capsule-date'),frenchDate=document.createElement('input');frenchDate.id='organizer-event-date';frenchDate.type='text';frenchDate.inputMode='numeric';frenchDate.maxLength=10;frenchDate.placeholder='JJ/MM/AAAA';frenchDate.autocomplete='off';frenchDate.setAttribute('aria-label','Date de l’événement, au format jour/mois/année');nativeDate.tabIndex=-1;nativeDate.after(frenchDate);date.querySelector('label').htmlFor=frenchDate.id;
  const calendar=document.createElement('button');calendar.type='button';calendar.className='organizer-date-picker';calendar.setAttribute('aria-label','Choisir la date dans le calendrier');calendar.innerHTML='<i class="fa-regular fa-calendar" aria-hidden="true"></i>';calendar.onclick=()=>{try{nativeDate.showPicker()}catch{nativeDate.focus()}};frenchDate.after(calendar);
  const syncDate=()=>{frenchDate.value=/^\d{4}-\d{2}-\d{2}$/.test(nativeDate.value)?nativeDate.value.split('-').reverse().join('/'):'';frenchDate.disabled=nativeDate.disabled;calendar.disabled=nativeDate.disabled;frenchDate.setCustomValidity('');};
  const validateDate=()=>{if(/^\d{3,8}$/.test(frenchDate.value)){const digits=frenchDate.value;frenchDate.value=digits.slice(0,2)+'/'+digits.slice(2,4)+(digits.length>4?'/'+digits.slice(4):'');}const match=frenchDate.value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);const iso=match?match[3]+'-'+match[2]+'-'+match[1]:'';const parsed=new Date(iso+'T12:00:00Z');const valid=iso&&Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===iso;nativeDate.value=valid?iso:'';frenchDate.setCustomValidity(valid?'':'Utilisez une date valide au format JJ/MM/AAAA.');frenchDate.setAttribute('aria-invalid',String(!valid));nativeDate.dispatchEvent(new Event('input',{bubbles:true}));return Boolean(valid);};
  frenchDate.addEventListener('input',validateDate);frenchDate.addEventListener('change',()=>{if(validateDate())nativeDate.dispatchEvent(new Event('change',{bubbles:true}));});nativeDate.addEventListener('input',event=>{if(event.isTrusted)syncDate()});nativeDate.addEventListener('change',syncDate);new MutationObserver(()=>{frenchDate.disabled=nativeDate.disabled;calendar.disabled=nativeDate.disabled;}).observe(nativeDate,{attributes:true,attributeFilter:['disabled','min','max']});syncDate();window.SuiteOrganizerLayout.syncDate=syncDate;window.addEventListener('studio-layout',syncDate);
  const note=$('print-note').closest('.field');note.querySelector('label[for=print-note]').textContent='Message sous le QR';compact.append(note);
  const welcome=document.createElement('div');welcome.className='field organizer-welcome-shortcut';welcome.innerHTML='<label>Accueil invités</label>';const welcomeButton=$('customize-welcome');welcomeButton.innerHTML='<i class="fa-regular fa-image" aria-hidden="true"></i><span>Personnaliser l’accueil</span><i class="fa-solid fa-pencil" aria-hidden="true"></i>';welcome.append(welcomeButton);compact.append(welcome);personalization.after(compact);
  const advanced=document.createElement('details');advanced.className='organizer-extra-options';advanced.innerHTML='<summary>Options de la fiche · monogramme et explication</summary>';advanced.append(textGroup,document.querySelector('.qr-initials-card'));compact.after(advanced);
  // Intro controls are edited in the existing welcome dialog, not duplicated on the page.
  $('organizer-welcome').classList.add('organizer-welcome-hidden');
  const stage=document.querySelector('.activation-panel');if(stage)advanced.after(stage);
  const actions=document.querySelector('.qr-preview-actions');actions.append($('download-print-card'),$('print-print-card'),$('share-link'));$('share-link').innerHTML='<i class="fa-solid fa-share-nodes" aria-hidden="true"></i>Partager le lien';
  $('print-print-card').classList.replace('primary','secondary');$('download-print-card').classList.replace('secondary','primary');
  // Keep the full guest journey accessible without adding a fourth action to the row.
  const guide=document.querySelector('.qr-print-guide');guide.after($('open-guest-link'));$('open-guest-link').className='organizer-guest-preview-link';guide.querySelector('summary').textContent='Conseils d’impression et aperçu du parcours invité';
  if(c.print_title==='Notre capsule temporelle'&&c.couple_name){$('print-title').value=c.couple_name.slice(0,42);$('print-title').dispatchEvent(new Event('input',{bubbles:true}));}
  // Existing date locking, helper text and autosave continue to use the moved input.
 }};
})();
