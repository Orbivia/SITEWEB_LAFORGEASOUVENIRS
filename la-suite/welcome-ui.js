/* Shared guest appearance and organizer welcome designer. No guest content is fetched here. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const colors=['#8B2730','#6B5635','#52634D','#42556D','#9C6571','#2D2926','#3D7370','#946044','#74628B','#A16C28','#4C647D','#556246'];
 const colorNames=['Bordeaux','Doré','Sauge','Bleu ardoise','Rose poudré','Noir doux','Bleu lagon','Terracotta','Lavande','Miel','Bleu nuit','Olivier'];
 const fonts={elegant:['Élégante','"Cormorant Garamond",Georgia,serif'],classic:['Classique','"Playfair Display",Georgia,serif'],modern:['Moderne','Inter,Arial,sans-serif'],romantic:['Manuscrite','"Great Vibes",cursive'],editorial:['Éditoriale','"DM Serif Display",Georgia,serif'],refined:['Raffinée','"Libre Baskerville",Georgia,serif'],contemporary:['Contemporaine','Montserrat,Inter,sans-serif'],signature:['Signature','Parisienne,cursive']};
 // All surfaces and illustrations are local, fixed presets. Saved settings never contain CSS or HTML.
 const themes={
  capsule:{name:'Capsule',bg:'#FBF8F2',paper:'#FFFAF4',date:'#FAE9D1',accent:'#8B2730',font:'elegant',art:'clock',pattern:'none'},
  editorial:{name:'Éditorial',bg:'#F8F5EF',paper:'#FFFDF8',date:'#FCF7EE',accent:'#6B5635',font:'editorial',art:'none',pattern:'none'},
  minimal:{name:'Contemporain',bg:'#FFFFFF',paper:'#FFFFFF',date:'#F2F1EE',accent:'#2D2926',font:'modern',art:'none',pattern:'none'},
  botanical:{name:'Botanique',bg:'#EDF2E9',paper:'#FCFDF8',date:'#DFE8D7',accent:'#52634D',font:'elegant',art:'envelope',pattern:'leaves'},
  olive:{name:'Olivier',bg:'#F5F4E9',paper:'#FFFEF5',date:'#E7E6CE',accent:'#556246',font:'refined',art:'letter',pattern:'leaves'},
  pressed:{name:'Fleurs pressées',bg:'#FBF4EF',paper:'#FFFDF9',date:'#F1E1D9',accent:'#9C6571',font:'signature',art:'envelope',pattern:'flowers'},
  romantic:{name:'Jardin romantique',bg:'#F9EFF0',paper:'#FFFAFA',date:'#F2DEDF',accent:'#9C6571',font:'romantic',art:'clock',pattern:'flowers'},
  bohemian:{name:'Bohème',bg:'#F6EDE2',paper:'#FFFBF4',date:'#EEDBC5',accent:'#946044',font:'elegant',art:'hourglass',pattern:'arches'},
  riviera:{name:'Riviera',bg:'#F0F5F1',paper:'#FEFFFC',date:'#DDEBE6',accent:'#3D7370',font:'classic',art:'envelope',pattern:'stripes'},
  dolce:{name:'Dolce Vita',bg:'#FFFBE7',paper:'#FFFFF8',date:'#F4EBC3',accent:'#42556D',font:'classic',art:'calendar',pattern:'sun'},
  seaside:{name:'Bord de mer',bg:'#ECF4F9',paper:'#FCFEFF',date:'#DCECF5',accent:'#4C647D',font:'modern',art:'envelope',pattern:'waves'},
  celestial:{name:'Céleste',bg:'#F1EEFA',paper:'#FDFBFF',date:'#E5DFF3',accent:'#74628B',font:'elegant',art:'hourglass',pattern:'stars'},
  pearl:{name:'Perle',bg:'#F6F4EF',paper:'#FFFFFF',date:'#EEE9DF',accent:'#6B5635',font:'refined',art:'letter',pattern:'none'},
  retro:{name:'Rétro',bg:'#F9EDE6',paper:'#FFF9F3',date:'#EFD6C5',accent:'#946044',font:'editorial',art:'clock',pattern:'arches'},
  confetti:{name:'Confettis',bg:'#FCF8EC',paper:'#FFFFFB',date:'#F4E9D2',accent:'#A16C28',font:'contemporary',art:'calendar',pattern:'confetti'},
  artdeco:{name:'Art déco',bg:'#F4F0E6',paper:'#FFFCF5',date:'#E8DCBE',accent:'#2D2926',font:'classic',art:'hourglass',pattern:'deco'},
  terracotta:{name:'Terre de soleil',bg:'#F7EAE1',paper:'#FFF9F1',date:'#EED5C3',accent:'#946044',font:'editorial',art:'letter',pattern:'sun'},
  night:{name:'Nuit étoilée',bg:'#E9ECF4',paper:'#FCFCFF',date:'#DCE2F0',accent:'#42556D',font:'elegant',art:'clock',pattern:'stars'}
 };
 Object.assign(themes,Object.fromEntries(window.SuiteDesign.styles.map(s=>[s.id,{name:s.name,bg:s.background,paper:"#fffdf8",date:"#f3eee5",accent:s.accent,font:s.font,art:"none",pattern:"none"}])),{custom:{name:"Mon design",bg:"#ffffff",paper:"#fffdf8",date:"#f3eee5",accent:"#8b2730",font:"elegant",art:"none",pattern:"none"}});
 const patterns={
  none:'none',leaves:'radial-gradient(ellipse at 0 25%,#71876518 0 15%,transparent 16%),radial-gradient(ellipse at 100% 70%,#71876518 0 15%,transparent 16%)',
  flowers:'radial-gradient(circle at 0 20%,#bd81911c 0 11%,transparent 12%),radial-gradient(circle at 100% 80%,#c994791a 0 15%,transparent 16%)',
  arches:'radial-gradient(ellipse at 0 100%,#be91611a 0 27%,transparent 28%),radial-gradient(ellipse at 100% 0,#be916115 0 27%,transparent 28%)',
  stripes:'repeating-linear-gradient(90deg,transparent 0 30px,#73968e0c 30px 42px)',
  sun:'radial-gradient(circle at 92% 6%,#d6aa351a 0 38px,transparent 39px)',
  waves:'repeating-radial-gradient(ellipse at 0 100%,transparent 0 28px,#487c9b0a 29px 30px,transparent 31px 46px)',
  stars:'radial-gradient(circle,#9483b42b 1px,transparent 1.5px)',confetti:'radial-gradient(ellipse,#b9956933 1px,transparent 2px),radial-gradient(circle,#638e8e25 1px,transparent 2px)',
  deco:'repeating-linear-gradient(45deg,transparent 0 40px,#a6894520 40px 41px,transparent 41px 80px)'
 };
 const svg=content=>'<svg viewBox="0 0 180 110" aria-hidden="true" focusable="false"><g fill="#FFFAF1" stroke="#AD8545" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+content+'</g></svg>';
 const illustrations={
  clock:svg('<circle cx="135" cy="46" r="32" fill="#FFF9EB"/><circle cx="135" cy="46" r="26" fill="none"/><path d="M135 25v21l12 8M130 8h10M135 8v6M111 22l-4-5M159 22l4-5M132 21v4M132 67v4M111 46h4M155 46h4" fill="none"/><path d="M22 41l88-13 10 62-88 13z"/><path d="M22 41l49 25 39-38M32 103l29-44M120 90L83 58" stroke="#CEAF82" fill="none"/>'),
  envelope:svg('<path d="M35 31l108-9 7 73-108 9z"/><path d="M35 31l58 37 50-46M42 104l42-44M150 95l-48-36" fill="none" stroke="#CEAF82"/>'),
  hourglass:svg('<path d="M74 16h70M74 98h70M80 16c0 27 25 26 25 41S80 74 80 98M138 16c0 27-25 26-25 41s25 17 25 41" fill="none"/><path d="M86 27h46l-23 23zM88 88l21-21 21 21z" fill="#D7BB85" stroke="none"/><path d="M109 57v5" fill="none"/>'),
  calendar:svg('<rect x="61" y="18" width="88" height="79" rx="8"/><path d="M61 39h88M81 11v16M130 11v16" fill="none"/><path d="M77 57h10M103 57h10M129 57h4M77 77h10M103 77h10" fill="none"/><circle cx="132" cy="77" r="10" fill="#EEE0BE"/>'),
  letter:svg('<path d="M55 30l53-22 43 57-53 29z"/><path d="M73 34l31-13M80 45l31-14M88 56l30-14" fill="none" stroke="#CEAF82"/><path d="M30 51l89-5 4 57-89 5z"/><path d="M30 51l46 25 43-30M34 108l34-37M123 103L85 70" fill="none" stroke="#CEAF82"/>')
 };
 const ornaments={none:'',heart:'♡',botanical:'❧',star:'✧',sun:'☼',flower:'✿',initials:''};
 function hex(value){return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toUpperCase():null}
 function choice(value,values,fallback){return values.includes(value)?value:fallback}
 function text(value,fallback,max){return typeof value==='string'&&value.trim()?value.trim().slice(0,max):fallback}
 function options(value={}){
  const style=Object.hasOwn(themes,value?.style)?value.style:'capsule',t=themes[style];
  return {...(window.SuiteDesign.validBackground(value?.background)?{background:value.background}:{}),...Object.fromEntries(["cardX","cardY","welcomeX","welcomeY"].map(k=>[k,window.SuiteDesign.position(value?.[k])])),style,font:choice(value?.font,Object.keys(fonts),'elegant'),color:hex(value?.color)||'#8B2730',ornament:choice(value?.ornament,Object.keys(ornaments),'none'),title:text(value?.title,'Un mot de vos hôtes',80),illustration:choice(value?.illustration,[...Object.keys(illustrations),'none'],t.art),texture:choice(value?.texture,['plain','grain','linen','stripes'],'plain'),corners:choice(value?.corners,['rounded','soft','square'],'rounded'),initials:typeof value?.initials==='string'?value.initials.slice(0,4):'',dateTitle:text(value?.dateTitle,'Quand l’ouvrir ?',32),invitation:text(value?.invitation,'Choisissez le moment de la surprise',70)};
 }
 function ink(color){const v=color.slice(1).match(/../g).map(n=>{const s=parseInt(n,16)/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4});return v[0]*.2126+v[1]*.7152+v[2]*.0722>.179?'#211F1C':'#FFFFFF'}
 function apply(value,root=document.body){
  const o=options(value),t=themes[o.style];Object.assign(root.dataset,{welcomeArtwork:String(Boolean(window.SuiteDesign.artwork(o.style,o))),welcomeStyle:o.style,welcomeFont:o.font,welcomeOrnament:o.ornament,welcomeTexture:o.texture,welcomeCorners:o.corners,welcomeIllustration:o.illustration});
  const vars={'guest-accent':o.color,'welcome-contrast':ink(o.color),'welcome-readable':ink(o.color)==='#FFFFFF'?o.color:'#514536','welcome-bg':t.bg,'welcome-paper':t.paper,'welcome-date':t.date,'welcome-pattern':patterns[t.pattern],'welcome-pattern-size':['stars','confetti'].includes(t.pattern)?'39px 41px':'auto','welcome-font':fonts[o.font][1],'welcome-weight':['romantic','signature','editorial'].includes(o.font)?'400':'600','welcome-radius':{rounded:'18px',soft:'8px',square:'2px'}[o.corners]};
  const artwork=window.SuiteDesign.artwork(o.style,o);if(artwork){vars['welcome-pattern']='url("'+artwork+'")';vars['welcome-pattern-size']='cover';}
  root.style.backgroundPosition=o.welcomeX+'% '+o.welcomeY+'%';
  Object.entries(vars).forEach(([key,v])=>root.style.setProperty('--'+key,v));
  root.querySelectorAll('[data-welcome-title]').forEach(e=>e.textContent=o.title);
  root.querySelectorAll('.delivery-caption small,[data-welcome-date-title]').forEach(e=>e.textContent=o.dateTitle);
  root.querySelectorAll('.delivery-invitation').forEach(e=>e.textContent=o.invitation);
  root.querySelectorAll('.guest-date-art').forEach(e=>e.remove());const date=root.querySelector('.delivery-summary');
  if(date&&o.illustration!=='none'){const art=document.createElement('span');art.className='guest-date-art';art.setAttribute('aria-hidden','true');art.innerHTML=illustrations[o.illustration]+'<span class="guest-envelope-ornament"></span>';art.lastElementChild.textContent=o.ornament==='initials'?o.initials:ornaments[o.ornament];date.append(art)}
  return o;
 }
 function miniMarkup(){return '<span class="capsule-hero"><span><span class="guest-capsule-label">La capsule de</span><strong class="welcome-mini-name">Justine &amp; Pierre</strong></span></span><span class="guest-form"><span class="guest-date-feature"><span class="delivery-summary"><span class="delivery-caption" data-welcome-date-title>Quand l’ouvrir ?</span><span class="delivery-invitation">Choisissez le moment de la surprise</span><strong>Maintenant</strong><span class="delivery-edit">Modifier ›</span></span></span><span class="welcome-mini-formats"><span>Petit mot</span><span>Photo</span><span>Audio</span><span>Vidéo</span></span><span class="welcome-mini-message"><span>Votre petit mot</span><span class="welcome-mini-lines">Écrivez ce que vous aimeriez leur dire…</span></span><span class="welcome-mini-signature">Votre prénom · facultatif</span><span class="submit-memory">Envoyer mon souvenir →</span></span>'}
 function setup({capsule:c,markDirty,scheduleSave,saveAll}){
  const o=options(c.welcome_config),dialog=document.createElement('dialog');dialog.id='welcome-editor';dialog.className='studio-sheet welcome-editor';dialog.setAttribute('aria-labelledby','welcome-editor-title');
  // Preview fragments intentionally use no form controls or IDs: they sit inside native buttons.
  const mini=miniMarkup();
  dialog.innerHTML=`<div class="studio-sheet-head"><h2 id="welcome-editor-title">Textes de l’accueil</h2><button type="button" class="studio-close" aria-label="Fermer les réglages de l’accueil">×</button></div>
   <div class="studio-sheet-body"><button type="button" id="welcome-expand-preview" class="studio-preview-button welcome-expand-preview" aria-haspopup="dialog" aria-controls="organizer-guest-preview"><span class="welcome-preview-device"><span class="guest-compact welcome-mini-preview">${mini}</span></span><span class="welcome-preview-label">Agrandir l’aperçu <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></span></button>
   <div class="studio-config"><div class="studio-card-tabs studio-config-tabs" role="tablist" aria-label="Personnalisation de l’accueil"><button type="button" role="tab" id="welcome-tab-style" data-welcome-tab="style" aria-controls="welcome-panel-style" aria-selected="true">Style</button><button type="button" role="tab" id="welcome-tab-content" data-welcome-tab="content" aria-controls="welcome-panel-content" aria-selected="false" tabindex="-1">Textes</button><button type="button" role="tab" id="welcome-tab-details" data-welcome-tab="details" aria-controls="welcome-panel-details" aria-selected="false" tabindex="-1">Police et couleurs</button></div>
   <div class="studio-config-scroll"><section id="welcome-panel-style" role="tabpanel" aria-labelledby="welcome-tab-style"><div class="welcome-style-grid" role="group" aria-label="Ambiance de l’accueil"></div>
   <div class="welcome-option-grid"><div class="field"><label for="welcome-illustration">Illustration</label><select id="welcome-illustration"><option value="clock">Enveloppe et horloge</option><option value="envelope">Enveloppe</option><option value="hourglass">Sablier</option><option value="calendar">Calendrier</option><option value="letter">Lettre</option><option value="none">Sans illustration</option></select></div><div class="field"><label for="welcome-ornament">Décoration</label><select id="welcome-ornament"><option value="none">Sans décoration</option><option value="heart">Un cœur discret</option><option value="botanical">Feuillage</option><option value="star">Étoile</option><option value="sun">Soleil</option><option value="flower">Fleur</option><option value="initials">Votre monogramme</option></select></div><div class="field"><label for="welcome-texture">Papier</label><select id="welcome-texture"><option value="plain">Uni</option><option value="grain">Papier grainé</option><option value="linen">Toile de lin</option><option value="stripes">Rayures fines</option></select></div><div class="field"><label for="welcome-corners">Forme des cadres</label><select id="welcome-corners"><option value="rounded">Arrondie</option><option value="soft">Légèrement arrondie</option><option value="square">Droite</option></select></div></div><p class="microcopy">Chaque ambiance peut être ajustée dans les autres onglets.</p></section>
   <section id="welcome-panel-content" role="tabpanel" aria-labelledby="welcome-tab-content" hidden><div class="field"><div class="welcome-label-row"><label for="welcome-date-title">Invitation à choisir la date</label><small id="welcome-date-title-count"></small></div><input id="welcome-date-title" maxlength="32"></div><div class="field"><div class="welcome-label-row"><label for="welcome-invitation">Petit texte sous l’invitation</label><small id="welcome-invitation-count"></small></div><input id="welcome-invitation" maxlength="70"></div><div class="field"><div class="welcome-label-row"><label for="welcome-title">Titre du message d’accueil</label><small id="welcome-title-count"></small></div><input id="welcome-title" maxlength="80"></div><div id="welcome-content-fields"></div></section>
   <section id="welcome-panel-details" role="tabpanel" aria-labelledby="welcome-tab-details" hidden><div class="field"><label for="welcome-font">Typographie</label><select id="welcome-font"></select><p class="welcome-font-example"></p></div><div class="field"><div class="welcome-label-row"><span class="field-label">Couleur principale</span><small id="welcome-color-value"></small></div><div class="welcome-colors" role="group" aria-label="Couleur principale"></div><label class="welcome-custom-color" for="welcome-custom-color"><input type="color" id="welcome-custom-color"> Choisir une autre couleur</label></div><div class="field"><label for="welcome-initials">Votre monogramme</label><input id="welcome-initials" maxlength="4" placeholder="J & P"><small class="field-help">Choisissez « Votre monogramme » dans les décorations pour l’afficher sur l’illustration.</small></div></section>
   <p id="welcome-design-status" class="status" role="status" aria-live="polite"></p></div></div></div><div class="studio-sheet-footer"><button id="welcome-done" type="button" class="btn primary">Terminé</button></div>`;
  $('dashboard-content').append(dialog);
  const summary=document.createElement('div');summary.className='welcome-summary';summary.innerHTML='<p>Votre message et votre image apparaissent directement sur la page des invités.</p><button id="customize-welcome" type="button" class="btn secondary" aria-haspopup="dialog" aria-controls="welcome-editor"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>Textes de l’accueil</button>';$('organizer-welcome').append(summary);
  Object.entries(fonts).forEach(([value,[label]])=>{const opt=document.createElement('option');opt.value=value;opt.textContent=label;$('welcome-font').append(opt)});
  const fields={title:'welcome-title',font:'welcome-font',ornament:'welcome-ornament',illustration:'welcome-illustration',texture:'welcome-texture',corners:'welcome-corners',initials:'welcome-initials',dateTitle:'welcome-date-title',invitation:'welcome-invitation'};
  Object.entries(fields).forEach(([key,id])=>$(id).value=o[key]);let style=o.style,color=o.color;
  Object.entries(themes).forEach(([key,t])=>{const button=document.createElement('button');button.type='button';button.dataset.welcomeStyle=key;button.innerHTML='<span class="welcome-style-sample"><span class="welcome-gallery-device"><span class="guest-compact welcome-gallery-preview">'+mini+'</span></span></span><strong></strong>';button.lastElementChild.textContent=t.name;apply({style:key,color:t.accent,font:t.font},button.querySelector('.welcome-gallery-preview'));dialog.querySelector('.welcome-style-grid').append(button)});
  colors.forEach((value,i)=>{const button=document.createElement('button');button.type='button';button.dataset.welcomeColor=value;button.style.setProperty('--swatch',value);button.setAttribute('aria-label',colorNames[i]);button.onclick=()=>{color=value;changed()};dialog.querySelector('.welcome-colors').append(button)});
  function collect(){const sharedStyle=$('qr-style')?.value,sharedFont=$('qr-font')?.value,sharedColor=$('qr-color')?.value;return options({...c.welcome_config,...window.SuiteDesign.fields(c),style:window.SuiteDesign.styles.some(s=>s.id===sharedStyle)||sharedStyle==='custom'?sharedStyle:style,color:sharedColor||color,...Object.fromEntries(Object.entries(fields).map(([key,id])=>[key,$(id).value])),font:sharedFont||$('welcome-font').value})}
  function render(){
   const value=collect(),name=$('capsule-name')?.value.trim()||c.couple_name;apply(value,dialog.querySelector('.welcome-mini-preview'));dialog.querySelector('.welcome-mini-name').textContent=name;
   $('welcome-ornament').disabled=value.illustration==='none';dialog.querySelectorAll('button[data-welcome-style]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.welcomeStyle===style)));dialog.querySelectorAll('[data-welcome-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.welcomeColor===color)));
   $('welcome-custom-color').value=color;$('welcome-color-value').textContent=color;
   const sample=dialog.querySelector('.welcome-font-example');sample.textContent=name;sample.style.fontFamily=fonts[value.font][1];
   [['welcome-title',80],['welcome-date-title',32],['welcome-invitation',70]].forEach(([id,max])=>$(id+'-count').textContent=$(id).value.length+' / '+max);
  }
  function changed(){markDirty('welcome');render();scheduleSave()}
  dialog.querySelectorAll('button[data-welcome-style]').forEach(b=>b.onclick=()=>{style=b.dataset.welcomeStyle;const t=themes[style];color=t.accent;$('welcome-font').value=t.font;$('welcome-illustration').value=t.art;changed()});
  Object.values(fields).forEach(id=>$(id).addEventListener($(id).tagName==='INPUT'?'input':'change',changed));$('welcome-custom-color').oninput=()=>{color=hex($('welcome-custom-color').value);changed()};
  function tab(name,focus=false){dialog.querySelectorAll('[data-welcome-tab]').forEach(button=>{const selected=button.dataset.welcomeTab===name;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;$('welcome-panel-'+button.dataset.welcomeTab).hidden=!selected;if(selected&&focus)button.focus()});dialog.querySelector('.studio-config-scroll').scrollTop=0}
  const tabs=[...dialog.querySelectorAll('[data-welcome-tab]')];tabs.forEach((b,i)=>{b.onclick=()=>tab(b.dataset.welcomeTab);b.onkeydown=e=>{let next;if(e.key==='ArrowRight')next=(i+1)%tabs.length;if(e.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length;if(e.key==='Home')next=0;if(e.key==='End')next=tabs.length-1;if(next!==undefined){e.preventDefault();tab(tabs[next].dataset.welcomeTab,true)}}});
  $('customize-welcome').onclick=()=>{$('welcome-content-fields').append(document.querySelector('.intro-video-panel'));render();dialog.showModal()};dialog.querySelector('.studio-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{$('organizer-welcome').insertBefore(document.querySelector('.intro-video-panel'),summary);if($('customize-welcome')?.isConnected)$('customize-welcome').focus()});
  $('welcome-expand-preview').onclick=()=>$('open-guest-link').click();$('organizer-guest-preview').addEventListener('close',()=>{if(dialog.open)$('welcome-expand-preview').focus()});
  $('welcome-done').onclick=async()=>{const button=$('welcome-done');button.disabled=true;try{if(await saveAll()){dialog.close();$('welcome-design-status').textContent=''}else{$('welcome-design-status').textContent=$('organizer-save-error').textContent||$('intro-status').textContent||'Enregistrement incomplet. Réessayez.'}}finally{button.disabled=false}};
  tab('content');render();window.SuiteWelcome.collectShared=collect;return {collect,syncShared:render,close:()=>dialog.close()};
 }
 window.SuiteWelcome={options,apply,setup};
})();

