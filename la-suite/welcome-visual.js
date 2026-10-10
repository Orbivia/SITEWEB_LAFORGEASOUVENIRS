/* Optional visual studio. Existing controls and save pipeline remain the source of truth. */
(function(){
 'use strict';
 const original=window.SuiteWelcome.setup,$=id=>document.getElementById(id);
 window.SuiteWelcome.setup=function(context){
  const designer=original(context),c=context.capsule;
  const dialog=document.createElement('dialog');dialog.id='welcome-visual-editor';dialog.className='welcome-visual-editor';
  dialog.setAttribute('aria-labelledby','visual-title');
  dialog.innerHTML=`<header class="visual-head"><button type="button" data-close aria-label="Revenir à l’organisateur">‹</button><h2 id="visual-title">Personnaliser <small>Version de test</small></h2><button type="button" data-save>Enregistrer</button></header>
  <div class="visual-stage"><p class="visual-help">Touchez un texte pour le modifier</p><article class="visual-page" aria-label="Aperçu modifiable de la page invité">
  <h1 contenteditable="plaintext-only" role="textbox" aria-label="Nom de la capsule" data-field="capsule-name" data-limit="50"></h1><p class="visual-event"></p>
  <button type="button" class="visual-media" hidden aria-label="Modifier l’image ou la vidéo d’accueil"></button>
  <p class="visual-message" contenteditable="plaintext-only" role="textbox" aria-label="Message d’accueil" aria-multiline="true" data-field="intro-text" data-limit="2000"></p>
  <p class="visual-empty">Partagez un souvenir</p>
  <div class="visual-formats" aria-label="Formats proposés aux invités"></div>
  <div class="visual-example"><span>Votre nom</span><span class="visual-fake-input">Prénom de l’invité</span><span contenteditable="plaintext-only" role="textbox" aria-label="Libellé de la date" data-field="welcome-date-title" data-limit="32"></span><span class="visual-fake-input">Aujourd’hui <i aria-hidden="true">▦</i></span></div>
  <footer><img src="assets/la-suite-logo.webp?v=20261010-forge-type" alt="La Suite — capsule temporelle"><small>Votre souvenir reste privé.</small></footer></article></div>
  <aside class="visual-drawer"><button type="button" class="visual-drawer-toggle" aria-expanded="false" aria-controls="visual-settings"><span>Apparence</span><span data-chevron aria-hidden="true">⌃</span></button><div id="visual-settings" hidden>
  <div class="visual-tabs" role="tablist" aria-label="Réglages visuels"><button type="button" role="tab" data-tab="theme">Thème</button><button type="button" role="tab" data-tab="color">Couleurs</button><button type="button" role="tab" data-tab="font">Typo</button><button type="button" role="tab" data-tab="intro">Accueil</button></div>
  <section data-panel="theme"><div class="visual-themes"></div></section><section data-panel="color" hidden><div class="visual-colors"></div><label>Couleur personnalisée <input type="color" data-color></label></section>
  <section data-panel="font" hidden><label>Typographie <select data-font></select></label></section>
  <section data-panel="intro" hidden><div class="visual-intro-host"></div></section></div></aside>
  <div class="visual-bottom"><button type="button" data-preview>Voir comme invité</button><button type="button" data-classic>Éditeur actuel</button></div><p class="visual-status" role="status" aria-live="polite"></p>`;
  $('dashboard-content').append(dialog);
  const launch=document.createElement('button');launch.type='button';launch.id='customize-welcome-visual';launch.className='btn secondary';launch.textContent='Tester l’éditeur visuel';$('customize-welcome').after(launch);
  let returnAnchor=null,mediaUrl=null;const mediaButton=dialog.querySelector('.visual-media');
  const icons={image:['Photo','fa-camera'],video:['Vidéo','fa-video'],audio:['Audio','fa-microphone'],text:['Texte','fa-align-left']};
  const plan=window.SuiteDesign.effectivePlan(c);
  Object.entries(icons).filter(([key])=>key!=='video'||plan==='premium').filter(([key])=>key!=='audio'||plan!=='photo').forEach(([, [name,icon]])=>{const item=document.createElement('span');item.innerHTML='<i class="fa-solid '+icon+'" aria-hidden="true"></i><small></small>';item.lastChild.textContent=name;dialog.querySelector('.visual-formats').append(item)});
  function dispatch(id,event='change'){const field=$(id);field?.dispatchEvent(new Event(event,{bubbles:true}))}
  function render(){
   if(!dialog.open)return;
   const o=designer.collect(),preset=window.SuiteDesign.styles.find(t=>t.id===o.style),page=dialog.querySelector('.visual-page');window.SuiteWelcome.apply(o,page);
   page.style.setProperty('--visual-paper',preset?.background||'#fcf8ef');page.style.setProperty('--visual-ink',preset?.dark?'#fff8eb':'#20372e');
   const art=window.SuiteDesign.artwork(o.style,o);page.style.backgroundImage=art?'url("'+art+'")':'none';
   dialog.querySelectorAll('[data-field]').forEach(el=>{if(document.activeElement!==el)el.textContent=$(el.dataset.field)?.value||''});
   dialog.querySelector('.visual-event').textContent=c.wedding_date?new Date(c.wedding_date+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'';
   const kind=$('intro-kind').value;dialog.querySelector('.visual-message').hidden=kind==='none';dialog.querySelector('.visual-empty').hidden=kind!=='none';
   dialog.querySelector('[data-font]').value=$('qr-font').value;dialog.querySelector('[data-color]').value=$('qr-color').value;
   dialog.querySelectorAll('[data-style]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.style===$('qr-style').value)));
   dialog.querySelectorAll('[data-swatch]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.swatch.toLowerCase()===$('qr-color').value.toLowerCase())));
   mediaButton.replaceChildren();if(mediaUrl){URL.revokeObjectURL(mediaUrl);mediaUrl=null}
   mediaButton.hidden=!['image','video'].includes(kind);
   if(!mediaButton.hidden){const file=$('intro-file').files?.[0],existing=document.querySelector('#intro-preview-wrap img,#intro-preview-wrap video');const src=file?(mediaUrl=URL.createObjectURL(file)):existing?.src;
    if(src){const media=document.createElement(kind==='image'?'img':'video');media.src=src;media.alt='Votre accueil';if(kind==='video'){media.muted=true;media.playsInline=true;media.preload='metadata'}mediaButton.append(media)}
    const label=document.createElement('span');label.textContent=src?'Remplacer l’accueil':kind==='image'?'Ajouter une photo d’accueil':'Ajouter une vidéo d’accueil';mediaButton.append(label);
   }
  }
  dialog.querySelectorAll('[data-field]').forEach(el=>{
   el.dataset.placeholder=el.dataset.field==='intro-text'?'Touchez pour écrire votre accueil…':'Touchez pour modifier';
   el.addEventListener('paste',e=>{e.preventDefault();const value=e.clipboardData.getData('text/plain');document.execCommand('insertText',false,value)});
   el.addEventListener('keydown',e=>{if(e.key==='Enter'&&el.dataset.field!=='intro-text'){e.preventDefault();el.blur()}});
   el.addEventListener('input',()=>{const field=$(el.dataset.field);let value=el.textContent.slice(0,Number(el.dataset.limit));if(el.textContent.length>Number(el.dataset.limit))el.textContent=value;field.value=value;dispatch(field.id,'input');if(field.id==='capsule-name')context.markDirty('settings');context.scheduleSave()});
   el.addEventListener('blur',()=>{const field=$(el.dataset.field);if(!field.value.trim()&&field.id!=='intro-text'){field.value=field.id==='capsule-name'?c.couple_name:'Quand l’ouvrir ?';dispatch(field.id,'input')}render()});
  });
  const drawer=dialog.querySelector('.visual-drawer-toggle');function expanded(value){drawer.setAttribute('aria-expanded',String(value));$('visual-settings').hidden=!value;dialog.querySelector('[data-chevron]').textContent=value?'⌄':'⌃'}
  drawer.onclick=()=>expanded(drawer.getAttribute('aria-expanded')!=='true');
  function tab(name){dialog.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===name;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1});dialog.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==name)}
  const tabs=[...dialog.querySelectorAll('[data-tab]')];tabs.forEach((b,i)=>{b.onclick=()=>tab(b.dataset.tab);b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const next=tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];tab(next.dataset.tab);next.focus()}});tab('color');
  window.SuiteDesign.styles.forEach(s=>{const b=document.createElement('button');b.type='button';b.dataset.style=s.id;const img=document.createElement('img');img.src=window.SuiteDesign.thumbnail(s.id);img.alt='';const name=document.createElement('span');name.textContent=s.name;b.append(img,name);b.onclick=()=>{const source=document.querySelector('[data-qr-style="'+s.id+'"]');if(source)source.click();else{$('qr-style').value=s.id;$('qr-color').value=s.accent;$('qr-font').value=s.font;dispatch('qr-style')}render()};dialog.querySelector('.visual-themes').append(b)});
  [['#52634D','Sauge'],['#6B5635','Doré'],['#9C6571','Rose'],['#42556D','Bleu'],['#2D2926','Noir'],['#8B2730','Bordeaux']].forEach(([value,name])=>{const b=document.createElement('button');b.type='button';b.dataset.swatch=value;b.style.background=value;b.setAttribute('aria-label',name);b.onclick=()=>{$('qr-color').value=value;dispatch('qr-color');render()};dialog.querySelector('.visual-colors').append(b)});
  const font=dialog.querySelector('[data-font]');[...$('welcome-font').options].forEach(o=>font.add(o.cloneNode(true)));font.onchange=()=>{$('qr-font').value=font.value;dispatch('qr-font');render()};dialog.querySelector('[data-color]').oninput=e=>{$('qr-color').value=e.target.value;dispatch('qr-color');render()};
  ['intro-kind','intro-file','intro-text','qr-style','qr-font','qr-color'].forEach(id=>$(id).addEventListener(id==='intro-text'?'input':'change',render));
  function open(){const panel=document.querySelector('.intro-video-panel');returnAnchor=document.createComment('visual-intro-return');panel.before(returnAnchor);dialog.querySelector('.visual-intro-host').append(panel);dialog.showModal();expanded(false);render()}
  launch.onclick=open;
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.querySelector('[data-classic]').onclick=()=>{dialog.close();$('customize-welcome').click()};
  dialog.querySelector('[data-preview]').onclick=()=>$('open-guest-link').click();
  mediaButton.onclick=()=>{expanded(true);tab('intro');$('choose-intro-file').click()};
  dialog.querySelector('[data-save]').onclick=async()=>{document.activeElement?.blur();const b=dialog.querySelector('[data-save]'),status=dialog.querySelector('.visual-status');b.disabled=true;status.textContent='Enregistrement…';try{const ok=await context.saveAll();status.textContent=ok?'Modifications enregistrées.':$('organizer-save-error')?.textContent||$('intro-status')?.textContent||'Enregistrement incomplet. Réessayez.';if(ok)render()}catch(e){status.textContent='Enregistrement impossible. Réessayez.'}finally{b.disabled=false}};
  dialog.addEventListener('close',()=>{const panel=dialog.querySelector('.intro-video-panel');if(panel&&returnAnchor?.isConnected)returnAnchor.replaceWith(panel);if(mediaUrl){URL.revokeObjectURL(mediaUrl);mediaUrl=null}launch.focus()});
  queueMicrotask(()=>{if(launch.isConnected)$('customize-welcome').after(launch)});
  return {...designer,syncShared(){designer.syncShared();render()},close(){dialog.close();designer.close()}};
 };
})();
