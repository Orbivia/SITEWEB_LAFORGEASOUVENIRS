/* Main inline organizer studio. Existing validated controls and save/export pipelines remain authoritative. */
(function(){
 'use strict';
 const original=window.SuiteWelcome.setup,$=id=>document.getElementById(id);
 window.SuiteWelcome.setup=function(context){
  const designer=original(context),c=context.capsule;
  const studio=document.createElement('section');studio.id='welcome-visual-editor';studio.className='welcome-visual-editor visual-primary';studio.setAttribute('aria-labelledby','visual-title');
  studio.innerHTML=`<header class="visual-head"><h2 id="visual-title">Personnaliser ma capsule</h2><button type="button" data-save>Enregistrer</button></header>
  <nav class="visual-targets" role="tablist" aria-label="Élément à personnaliser"><button type="button" role="tab" id="visual-card-tab" data-target="card" aria-controls="visual-card">Fiche QR</button><button type="button" role="tab" id="visual-welcome-tab" data-target="welcome" aria-controls="visual-welcome">Accueil invités</button></nav>
  <div class="visual-stage"><p class="visual-help">Touchez un texte pour le modifier</p>
  <section id="visual-card" class="visual-card" role="tabpanel" aria-labelledby="visual-card-tab"><img class="visual-card-image" alt="Votre fiche QR, identique au rendu imprimé"><div class="visual-card-overlays"></div></section>
  <article id="visual-welcome" class="visual-page" role="tabpanel" aria-labelledby="visual-welcome-tab" hidden>
  <h1 contenteditable="plaintext-only" role="textbox" aria-label="Nom de la capsule" data-field="capsule-name" data-limit="50"></h1><button type="button" class="visual-event" data-date aria-label="Modifier la date de l’événement"></button>
  <button type="button" class="visual-media" hidden aria-label="Modifier l’image ou la vidéo d’accueil"></button>
  <p class="visual-message" contenteditable="plaintext-only" role="textbox" aria-label="Message d’accueil" aria-multiline="true" data-field="intro-text" data-limit="2000"></p><p class="visual-empty">Partagez un souvenir</p>
  <div class="visual-formats" aria-label="Formats proposés aux invités"></div>
  <div class="visual-example"><span>Votre nom</span><span class="visual-fake-input">Prénom de l’invité</span><span contenteditable="plaintext-only" role="textbox" aria-label="Libellé de la date" data-field="welcome-date-title" data-limit="32"></span><span class="visual-fake-input">Aujourd’hui <i aria-hidden="true">▦</i></span></div>
  <footer><img src="assets/la-suite-logo.webp?v=20261010-forge-type" alt="La Suite — capsule temporelle"><small>Votre souvenir reste privé.</small></footer></article></div>
  <aside class="visual-drawer"><button type="button" class="visual-drawer-toggle" aria-expanded="false" aria-controls="visual-settings"><span>Apparence</span><span data-chevron aria-hidden="true">⌃</span></button><div id="visual-settings" hidden>
  <div class="visual-tabs" role="tablist" aria-label="Réglages visuels"><button type="button" role="tab" data-tab="theme">Thème</button><button type="button" role="tab" data-tab="color">Couleurs</button><button type="button" role="tab" data-tab="font">Typo</button><button type="button" role="tab" data-tab="details">Fiche</button><button type="button" role="tab" data-tab="intro">Accueil</button></div>
  <section data-panel="theme"><div class="visual-themes"></div><button type="button" class="visual-import">Importer un fond</button><div class="visual-background-host"></div></section>
  <section data-panel="color" hidden><div class="visual-colors"></div></section>
  <section data-panel="font" hidden><label>Typographie <select data-font></select></label></section>
  <section data-panel="details" hidden><label>Date de l’événement <input type="date" data-event-date></label><p class="visual-date-help"></p><label>Initiales <input data-initials maxlength="4" placeholder="C & A"></label><label class="visual-check"><input type="checkbox" data-monogram> Monogramme dans le QR</label><p class="visual-detail-help">Touchez le titre et les textes sous le QR pour les modifier. Effacez un texte facultatif pour le masquer.</p></section>
  <section data-panel="intro" hidden><div class="visual-intro-host"></div></section></div></aside>
  <p class="visual-status" role="status" aria-live="polite"></p>`;
  $('dashboard-content').append(studio);
  let target='card',mediaUrl=null,composing=false;const mediaButton=studio.querySelector('.visual-media'),qrSource=$('qr-artwork-preview');
  const icons={image:['Photo','fa-camera'],video:['Vidéo','fa-video'],audio:['Audio','fa-microphone'],text:['Texte','fa-align-left']},plan=window.SuiteDesign.effectivePlan(c);
  Object.entries(icons).filter(([key])=>key!=='video'||plan==='premium').filter(([key])=>key!=='audio'||plan!=='photo').forEach(([, [name,icon]])=>{const item=document.createElement('span');item.innerHTML='<i class="fa-solid '+icon+'" aria-hidden="true"></i><small></small>';item.lastChild.textContent=name;studio.querySelector('.visual-formats').append(item)});
  const defaults={'print-title':'Votre capsule','welcome-date-title':'Quand l’ouvrir ?'};
  function dispatch(id,event='change'){const field=$(id);field?.dispatchEvent(new Event(event,{bubbles:true}))}
  function syncField(el){const field=$(el.dataset.field);if(!field)return;const limit=Number(el.dataset.limit);const value=el.innerText.replace(/\r/g,'').slice(0,limit);if(el.innerText.length>limit){el.textContent=value;const selection=getSelection(),range=document.createRange();range.selectNodeContents(el);range.collapse(false);selection.removeAllRanges();selection.addRange(range)}field.value=value;
   if(field.id==='print-note'||field.id==='print-explanation'){const toggle=$(field.id+'-visible');if(toggle)toggle.checked=Boolean(value.trim())}
   dispatch(field.id,'input');if(field.id==='capsule-name')context.markDirty('settings');context.scheduleSave();
  }
  function wire(el){el.dataset.placeholder=el.dataset.field==='intro-text'?'Touchez pour écrire votre accueil…':'Touchez pour modifier';el.addEventListener('compositionstart',()=>composing=true);el.addEventListener('compositionend',()=>{composing=false;syncField(el)});
   el.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'))});
   el.addEventListener('keydown',e=>{if(e.key==='Enter'&&['capsule-name','print-title','welcome-date-title','qr-initials-input'].includes(el.dataset.field)&&!e.isComposing){e.preventDefault();el.blur()}});
   el.addEventListener('input',()=>{if(!composing)syncField(el)});
   el.addEventListener('blur',()=>{const field=$(el.dataset.field);if(!field.value.trim()&&(defaults[field.id]||field.id==='capsule-name')){field.value=field.id==='capsule-name'?c.couple_name:defaults[field.id];dispatch(field.id,'input')}render()});
  }
  studio.querySelectorAll('[data-field]').forEach(wire);
  const cardFields=[['print-title','Titre de la fiche',42],['print-note','Message sous le QR',120],['print-explanation','Explication sous le QR',240]];
  cardFields.forEach(([id,label,limit])=>{const el=document.createElement('div');el.className='visual-card-text';el.contentEditable='plaintext-only';el.setAttribute('role','textbox');el.setAttribute('aria-label',label);el.setAttribute('aria-multiline',String(id!=='print-title'));el.dataset.field=id;el.dataset.limit=limit;el.title=label;wire(el);studio.querySelector('.visual-card-overlays').append(el)});
  const dateButton=document.createElement('button');dateButton.type='button';dateButton.className='visual-card-date';dateButton.setAttribute('aria-label','Modifier la date de l’événement');dateButton.title='Date de l’événement';studio.querySelector('.visual-card-overlays').append(dateButton);
  function qrRender(){if(qrSource.src)studio.querySelector('.visual-card-image').src=qrSource.src;
   const fallback={'print-title':{x:180,y:190,width:821,height:195},'print-note':{x:180,y:1220,width:821,height:110},'print-explanation':{x:180,y:1350,width:821,height:180},date:{x:180,y:397,width:821,height:60}};let boxes=fallback;try{boxes=JSON.parse(qrSource.dataset.textBoxes)||fallback}catch{}
   studio.querySelectorAll('.visual-card-text').forEach(el=>{let box=boxes[el.dataset.field]||fallback[el.dataset.field];if(el.dataset.field==='print-note'&&!$('print-note').value.trim())box={...box,y:1175,height:40};Object.assign(el.style,{left:box.x/1181*100+'%',top:box.y/1772*100+'%',width:box.width/1181*100+'%',height:Math.max(55,box.height)/1772*100+'%'});el.classList.toggle('is-empty',!$(el.dataset.field).value.trim());el.classList.toggle('has-error',$(el.dataset.field).getAttribute('aria-invalid')==='true')});
   const box=boxes.date||fallback.date;Object.assign(dateButton.style,{left:box.x/1181*100+'%',top:box.y/1772*100+'%',width:box.width/1181*100+'%',height:box.height/1772*100+'%'});
  }
  new MutationObserver(qrRender).observe(qrSource,{attributes:true,attributeFilter:['src','data-text-boxes']});
  function render(){if(!studio.isConnected)return;const o=designer.collect(),preset=window.SuiteDesign.styles.find(t=>t.id===o.style),page=studio.querySelector('.visual-page');window.SuiteWelcome.apply(o,page);
   studio.style.setProperty('--visual-paper',preset?.background||'#fcf8ef');studio.style.setProperty('--visual-ink',preset?.dark?'#fff8eb':'#20372e');studio.style.setProperty('--visual-font',page.style.getPropertyValue('--welcome-font'));
   const art=window.SuiteDesign.artwork(o.style,o);page.style.backgroundImage=art?'url("'+art+'")':'none';
   studio.querySelectorAll('[data-field]').forEach(el=>{const source=$(el.dataset.field);el.contentEditable=source?.disabled?'false':'plaintext-only';el.setAttribute('aria-disabled',String(Boolean(source?.disabled)));if(document.activeElement!==el)el.textContent=source?.value||''});
   const day=$('capsule-date').value;studio.querySelector('.visual-event').textContent=day?new Date(day+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}):'';
   const nativeDate=$('capsule-date'),date=studio.querySelector('[data-event-date]');if(document.activeElement!==date)date.value=nativeDate.value;date.disabled=nativeDate.disabled;date.min=nativeDate.min;date.max=nativeDate.max;studio.querySelector('.visual-date-help').textContent=nativeDate.closest('.field').querySelector('.field-help')?.textContent||'';
   const kind=$('intro-kind').value;studio.querySelector('.visual-message').hidden=kind==='none';studio.querySelector('.visual-empty').hidden=kind!=='none';
   studio.querySelector('[data-font]').value=$('qr-font').value;studio.querySelector('[data-color]').value=$('qr-color').value;
   studio.querySelector('[data-initials]').value=$('qr-initials-input').value;studio.querySelector('[data-monogram]').checked=$('qr-show-initials').checked;
   studio.querySelectorAll('[data-style]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.style===$('qr-style').value)));
   let presetColor=false;studio.querySelectorAll('[data-swatch]').forEach(b=>{const active=b.dataset.swatch.toLowerCase()===$('qr-color').value.toLowerCase();b.setAttribute('aria-pressed',String(active));presetColor ||= active});studio.querySelector('.visual-custom-color').classList.toggle('is-selected',!presetColor);
   const file=$('intro-file').files?.[0],existing=document.querySelector('#intro-preview-wrap img,#intro-preview-wrap video'),key=kind+':'+(file?file.name+file.lastModified:existing?.src||'');
   mediaButton.hidden=!['image','video'].includes(kind);if(mediaButton.dataset.key!==key){mediaButton.dataset.key=key;mediaButton.replaceChildren();if(mediaUrl){URL.revokeObjectURL(mediaUrl);mediaUrl=null}
    if(!mediaButton.hidden){const src=file?(mediaUrl=URL.createObjectURL(file)):existing?.src;if(src){const media=document.createElement(kind==='image'?'img':'video');media.src=src;media.alt='Votre accueil';if(kind==='video'){media.muted=true;media.playsInline=true;media.preload='metadata'}mediaButton.append(media)}const label=document.createElement('span');label.textContent=src?'Remplacer l’accueil':kind==='image'?'Ajouter une photo d’accueil':'Ajouter une vidéo d’accueil';mediaButton.append(label)}
   }qrRender();
  }
  const drawer=studio.querySelector('.visual-drawer-toggle');function expanded(value){drawer.setAttribute('aria-expanded',String(value));$('visual-settings').hidden=!value;studio.querySelector('[data-chevron]').textContent=value?'⌄':'⌃'}drawer.onclick=()=>expanded(drawer.getAttribute('aria-expanded')!=='true');
  function tab(name){studio.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===name;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1});studio.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==name)}
  function tabKeys(buttons,key){buttons.forEach((b,i)=>b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:buttons.length-1))%buttons.length];next.click();next.focus()}))}
  const tabs=[...studio.querySelectorAll('[data-tab]')];tabs.forEach(b=>{b.onclick=()=>tab(b.dataset.tab);b.id='visual-tab-'+b.dataset.tab;const panel=studio.querySelector('[data-panel="'+b.dataset.tab+'"]');panel.id='visual-panel-'+b.dataset.tab;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',b.id);b.setAttribute('aria-controls',panel.id)});tabKeys(tabs);tab('color');
  function selectTarget(value){document.activeElement?.blur();target=value;studio.dataset.target=value;$('visual-card').hidden=value!=='card';$('visual-welcome').hidden=value!=='welcome';studio.querySelectorAll('[data-target]').forEach(b=>{const selected=b.dataset.target===value;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1});render()}
  const targetTabs=[...studio.querySelectorAll('[data-target]')];targetTabs.forEach(b=>b.onclick=()=>selectTarget(b.dataset.target));tabKeys(targetTabs);
  window.SuiteDesign.styles.forEach(s=>{const b=document.createElement('button');b.type='button';b.dataset.style=s.id;const img=document.createElement('img');img.src=window.SuiteDesign.thumbnail(s.id);img.alt='';const name=document.createElement('span');name.textContent=s.name;b.append(img,name);b.onclick=()=>{document.querySelector('[data-qr-style="'+s.id+'"]')?.click();render()};studio.querySelector('.visual-themes').append(b)});
  const swatches=[['#52634D','Sauge'],['#6B5635','Doré'],['#9C6571','Rose'],['#42556D','Bleu'],['#2D2926','Noir'],['#8B2730','Bordeaux']];swatches.forEach(([value,name])=>{const b=document.createElement('button');b.type='button';b.dataset.swatch=value;b.style.background=value;b.setAttribute('aria-label',name);b.onclick=()=>{$('qr-color').value=value;dispatch('qr-color');render()};studio.querySelector('.visual-colors').append(b)});
  const custom=document.createElement('label');custom.className='visual-custom-color';custom.title='Couleur personnalisée';custom.innerHTML='<input type="color" data-color aria-label="Choisir une couleur personnalisée"><span aria-hidden="true">+</span>';studio.querySelector('.visual-colors').append(custom);custom.querySelector('input').oninput=e=>{$('qr-color').value=e.target.value;dispatch('qr-color');render()};
  const font=studio.querySelector('[data-font]');[...$('welcome-font').options].forEach(o=>font.add(o.cloneNode(true)));font.onchange=()=>{$('qr-font').value=font.value;dispatch('qr-font');render()};
  studio.querySelector('[data-initials]').oninput=e=>{$('qr-initials-input').value=e.target.value;dispatch('qr-initials-input','input');render()};studio.querySelector('[data-monogram]').onchange=e=>{$('qr-show-initials').checked=e.target.checked;dispatch('qr-show-initials');render()};
  studio.querySelector('[data-event-date]').onchange=e=>{const source=$('capsule-date');if(source.disabled)return;source.value=e.target.value;dispatch('capsule-date','input');dispatch('capsule-date');window.SuiteOrganizerLayout.syncDate?.();render()};
  function editDate(){expanded(true);tab('details');studio.querySelector('[data-event-date]').focus()}dateButton.onclick=editDate;studio.querySelector('[data-date]').onclick=editDate;
  mediaButton.onclick=()=>{expanded(true);tab('intro');$('choose-intro-file').click()};studio.querySelector('.visual-import').onclick=()=>$('design-file').click();
  ['intro-kind','intro-file','intro-text','qr-style','qr-font','qr-color','capsule-date','capsule-name','print-title','print-note','print-explanation','qr-show-initials','qr-initials-input'].forEach(id=>{for(const event of ['input','change'])$(id).addEventListener(event,render)});
  new MutationObserver(render).observe($('intro-preview-wrap'),{childList:true});new MutationObserver(render).observe($('intro-text'),{attributes:true,attributeFilter:['disabled']});new MutationObserver(render).observe($('capsule-date'),{attributes:true,attributeFilter:['disabled','min','max']});
  studio.querySelector('[data-save]').onclick=async()=>{document.activeElement?.blur();const b=studio.querySelector('[data-save]'),status=studio.querySelector('.visual-status');b.disabled=true;status.textContent='Enregistrement…';try{const ok=await context.saveAll();status.textContent=ok?'Modifications enregistrées.':$('organizer-save-error')?.textContent||$('intro-status')?.textContent||'Enregistrement incomplet. Réessayez.';if(ok)render()}catch{status.textContent='Enregistrement impossible. Réessayez.'}finally{b.disabled=false}};
  queueMicrotask(()=>{
   const panel=document.querySelector('.qr-designer-panel');panel.prepend(studio);document.body.classList.add('visual-primary-ready');
   studio.querySelector('.visual-intro-host').append(document.querySelector('.intro-video-panel'));
   const crop=$('design-crop');studio.querySelector('.visual-background-host').append(crop);const uploadStatus=$('design-upload-status');studio.querySelector('.visual-background-host').append(uploadStatus);
   const actions=document.createElement('div');actions.className='visual-actions';panel.append(actions);actions.append(document.querySelector('.qr-preview-actions'),document.querySelector('.activation-panel'),document.querySelector('.organizer-export-availability'),$('organizer-card-readability'),$('qr-status'));
   window.SuiteOrganizerLayout.placeActivation=()=>{const activation=document.querySelector('.activation-panel');if(activation&&activation.parentElement!==actions)actions.append(activation)};
   $('customize-welcome').onclick=()=>{selectTarget('welcome');studio.scrollIntoView({block:'start'})};
   $('open-guest-link').hidden=true;$('organizer-modify').hidden=true;
   selectTarget('card');expanded(matchMedia('(min-width:761px)').matches);render();
  });
  matchMedia('(min-width:761px)').addEventListener('change',e=>expanded(e.matches));
  window.addEventListener('pagehide',()=>{if(mediaUrl)URL.revokeObjectURL(mediaUrl)});
  return {...designer,syncShared(){designer.syncShared();render()},close(){designer.close()}};
 };
})();
