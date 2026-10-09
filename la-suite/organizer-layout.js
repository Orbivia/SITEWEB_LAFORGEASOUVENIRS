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
  const name=$('capsule-name').closest('.field'),date=$('capsule-date').closest('.field');const nameHome=document.createComment('name'),dateHome=document.createComment('date');name.before(nameHome);date.before(dateHome);name.querySelector('label').textContent='Nom de la capsule';compact.append(name,date);const relocateFields=()=>{if(!document.querySelector('[data-owner-panel=settings]').hidden){nameHome.after(name);dateHome.after(date);}else compact.prepend(name,date);};new MutationObserver(relocateFields).observe(document.querySelector('[data-owner-panel=settings]'),{attributes:true,attributeFilter:['hidden']});relocateFields();
  const textGroup=$('print-title').closest('.qr-control-group');
  const note=$('print-note').closest('.field');note.querySelector('label[for=print-note]').textContent='Message sous le QR';compact.append(note);
  const welcome=document.createElement('div');welcome.className='field organizer-welcome-shortcut';welcome.innerHTML='<label>Accueil invités</label>';const welcomeButton=$('customize-welcome');welcomeButton.innerHTML='<i class="fa-regular fa-image" aria-hidden="true"></i><span>Personnaliser l’accueil</span><i class="fa-solid fa-pencil" aria-hidden="true"></i>';welcome.append(welcomeButton);compact.append(welcome);personalization.after(compact);
  const advanced=document.createElement('details');advanced.className='organizer-extra-options';advanced.innerHTML='<summary>Options de la fiche · titre, monogramme et explication</summary>';advanced.append(textGroup,document.querySelector('.qr-initials-card'));compact.after(advanced);
  // Intro controls are edited in the existing welcome dialog, not duplicated on the page.
  $('organizer-welcome').classList.add('organizer-welcome-hidden');
  const stage=document.querySelector('.activation-panel');if(stage)advanced.after(stage);
  const actions=document.querySelector('.qr-preview-actions');actions.append($('download-print-card'),$('print-print-card'),$('share-link'));$('share-link').innerHTML='<i class="fa-solid fa-share-nodes" aria-hidden="true"></i>Partager le lien';
  $('print-print-card').classList.replace('primary','secondary');$('download-print-card').classList.replace('secondary','primary');
  // Keep the full guest journey accessible without adding a fourth action to the row.
  const guide=document.querySelector('.qr-print-guide');guide.after($('open-guest-link'));$('open-guest-link').className='organizer-guest-preview-link';guide.querySelector('summary').textContent='Conseils d’impression et aperçu du parcours invité';
  $('capsule-name').addEventListener('input',()=>{if($('print-title').dataset.titleEdited!=='true'&&(!c.print_title||c.print_title==='Notre capsule temporelle'||$('print-title').dataset.followsName==='true')){$('print-title').dataset.followsName='true';$('print-title').value=$('capsule-name').value.slice(0,42);$('print-title').dispatchEvent(new Event('input',{bubbles:true}));}});
  $('print-title').addEventListener('input',event=>{if(event.isTrusted){$('print-title').dataset.followsName='false';$('print-title').dataset.titleEdited='true';}});
  // Existing date locking, helper text and autosave continue to use the moved input.
 }};
})();
