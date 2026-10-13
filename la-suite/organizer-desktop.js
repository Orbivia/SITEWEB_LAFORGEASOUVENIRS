/* Layout follows available space; input capabilities refine desktop controls. */
(function(){
 'use strict';
 const wide=matchMedia('(min-width:761px)'),coarse=matchMedia('(any-pointer:coarse)'),fine=matchMedia('(any-pointer:fine)'),hover=matchMedia('(hover:hover)'),short=matchMedia('(max-height:649px)');
 const snapshot=()=>({layout:wide.matches?'wide':'compact',input:coarse.matches?(fine.matches?'hybrid':'touch'):'precise',hover:hover.matches,height:short.matches?'short':'regular'});
 function update(){const state=snapshot(),body=document.body;if(!body)return;
  if(!wide.matches){delete body.dataset.organizerInput;delete body.dataset.organizerHover;delete body.dataset.organizerHeight;return;}
  body.dataset.organizerInput=state.input;body.dataset.organizerHover=String(state.hover);body.dataset.organizerHeight=state.height;
 }
 window.SuiteOrganizerCapabilities=Object.freeze({get:snapshot});
 for(const query of [wide,coarse,fine,hover,short])query.addEventListener('change',update);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',update,{once:true});else update();
})();
/* PC workspace enhancement. Native controls and their autosave stay authoritative. */
(function(){
 'use strict';
 if(!window.SuiteWelcome?.setup)return;
 const wide=matchMedia('(min-width:761px)'),original=window.SuiteWelcome.setup,$=id=>document.getElementById(id);
 let current=null,mounted=null,frame=0;
 const text=(node,value)=>{value=String(value??'');if(node.textContent!==value)node.textContent=value;};
 const fire=(node,type='input')=>node.dispatchEvent(new Event(type,{bubbles:true}));
 function mount(context,studio){
  const c=context.capsule,owned=[],bindings=[],moves=[],listeners=[];
  const on=(node,event,fn)=>{node.addEventListener(event,fn);listeners.push(()=>node.removeEventListener(event,fn));};
  const element=(tag,className,content)=>{const node=document.createElement(tag);if(className)node.className=className;if(content!==undefined)node.textContent=content;return node;};
  const button=(label,fn,className='pc-button')=>{const node=element('button',className,label);node.type='button';node.onclick=fn;return node;};
  const group=(title,parent)=>{const node=element('section','pc-control-section');node.append(element('h3','',title));parent.append(node);return node;};
  const labelField=(title,input,parent)=>{const label=element('label','pc-field');label.append(element('span','',title),input);parent.append(label);return label;};
  const proxy=(source,title,parent,kind)=>{
   if(!source)return null;const control=element(source.tagName==='TEXTAREA'?'textarea':source.tagName==='SELECT'?'select':'input');
   if(control.tagName==='INPUT')control.type=kind||source.type;if(control.tagName==='SELECT')for(const option of source.options)control.add(option.cloneNode(true));
   if(source.maxLength>0)control.maxLength=source.maxLength;control.dataset.pcSource=source.id||source.dataset.designCrop||'show-date';control.setAttribute('aria-label',title);
   if(control.type==='number'){control.min=source.min||'0';control.max=source.max||'100';control.step='1';}
   if(control.type==='date'){control.min=source.min;control.max=source.max;}
   labelField(title,control,parent);bindings.push({source,control});
   on(control,control.tagName==='SELECT'||['checkbox','date'].includes(control.type)?'change':'input',()=>{
    if(source.disabled)return;if(control.type==='number'&&!control.value)return;if(control.type==='checkbox')source.checked=control.checked;else source.value=control.value;if(control.type==='number')control.value=source.value;
    if(source.id==='print-note'){$('print-note-visible').checked=Boolean(control.value.trim());}
    if(source.id==='qr-initials-input'){$('qr-show-initials').checked=Boolean(control.value.trim());fire($('qr-show-initials'),'change');}
    fire(source,control.tagName==='SELECT'||control.type==='checkbox'?'change':'input');if(control.type==='date'){fire(source,'change');window.SuiteOrganizerLayout?.syncDate?.();}
    context.scheduleSave();sync();
   });if(control.tagName!=='SELECT'&&!['checkbox','date'].includes(control.type))on(control,'change',()=>{if(source.disabled)return;fire(source,'change');context.scheduleSave();});return control;
  };
  const overview=element('section','pc-capsule-overview');overview.setAttribute('aria-label','Votre capsule');
  const identity=element('div','pc-capsule-identity'),name=element('h1'),facts=element('div','pc-capsule-facts'),state=element('span','pc-state'),storage=element('span','pc-storage');
  identity.append(name,facts);const navigation=element('nav','pc-owner-navigation');navigation.setAttribute('aria-label','Navigation de la capsule');
  const go=async target=>{if(!await context.saveAll())return;const native=document.querySelector('[data-owner-tab-link="'+target+'"]');native?.click();sync();};
  const customize=button('Personnaliser',()=>go('configuration')),discover=button('Découvrir',()=>go('messages'));navigation.append(customize,discover);
  const right=element('div','pc-capsule-state');right.append(state,storage);overview.append(identity,navigation,right);$('dashboard-content').prepend(overview);owned.push(overview);
  const column=element('div','pc-preview-column');studio.append(column);owned.push(column);
  for(const node of [studio.querySelector('.visual-targets'),studio.querySelector('.visual-stage'),studio.querySelector('.visual-actions')]){const home=document.createComment('PC placement');node.before(home);moves.push({node,home});column.append(node);}
  const drawer=studio.querySelector('.visual-drawer'),content=element('div','pc-content-controls');drawer.append(content);owned.push(content);
  const common=group('Votre capsule',content);proxy($('capsule-name'),'Nom de la capsule',common);const eventDate=proxy($('organizer-event-date')||$('capsule-date'),'Date de l’événement · JJ/MM/AAAA',common);eventDate.placeholder='JJ/MM/AAAA';common.append(button('Choisir dans le calendrier',()=>{if($('capsule-date').disabled)return;try{$('capsule-date').showPicker();}catch{eventDate.focus();}}));
  const dateNote=element('p','pc-hint','La date verrouillée se modifie dans les paramètres de la capsule.');common.append(dateNote);
  proxy(studio.querySelector('[data-show-date]'),'Afficher la date sur la fiche et l’accueil',common,'checkbox');
  const card=group('Contenu de la fiche QR',content);proxy($('print-title'),'Titre de la fiche',card);proxy($('print-note'),'Message sous le QR',card);proxy($('qr-initials-input'),'Initiales du QR · 4 caractères',card);
  function choices(title,key,parent){const row=element('div','pc-choice-field');row.append(element('span','pc-field-label',title));const controls=element('div','pc-choice-buttons');row.append(controls);parent.append(row);
   for(const native of studio.querySelectorAll('['+key+']')){const label=native.textContent.trim(),b=button(label,()=>{native.click();sync();});b.dataset.pcChoice=key;b.dataset.pcValue=native.getAttribute(key);controls.append(b);bindings.push({source:native,control:b,choice:true});}
  }
  choices('Motif du QR','data-qr-shape',card);choices('Repères du QR','data-qr-eyes',card);
  const greeting=group('Contenu de l’accueil invités',content);const kind=proxy($('intro-kind'),'Format de l’accueil',greeting);const message=proxy($('intro-text'),'Votre message d’accueil',greeting);
  const media=element('div','pc-media-tools'),file=element('input');file.type='file';file.hidden=true;file.setAttribute('aria-label','Image ou vidéo d’accueil');media.append(file);greeting.append(media);
  const mediaStatus=element('p','pc-hint');mediaStatus.setAttribute('role','status');greeting.append(mediaStatus);
  const replace=button('Choisir / remplacer',()=>file.click()),adjust=button('Ajuster · image entière',()=>cropImage(false)),crop=button('Recadrer l’image',()=>cropImage(true)),remove=button('Retirer',async()=>{const native=$('intro-kind');native.value='none';fire(native,'change');await context.saveAll();sync();});media.append(replace,adjust,crop,remove);
  on(file,'change',()=>{if(!file.files.length)return;mediaError='';const native=$('intro-file');native.files=file.files;fire(native,'change');sync();});
  let originalImage=null,originalKey='',cropDialog=null,bitmap=null,mediaError='';
  async function loadImage(){const native=$('intro-file'),selected=native.files[0],url=$('intro-preview-wrap')?.querySelector('img')?.src;const key=selected?selected.name+selected.lastModified:url;
   if(!key)throw Error('Choisissez d’abord une image.');if(key!==originalKey){originalImage=selected||(await fetch(url).then(r=>{if(!r.ok)throw Error('Image indisponible.');return r.blob();}));originalKey=key;}return originalImage;
  }
  function assignImage(blob){const transfer=new DataTransfer();const made=new File([blob],'accueil-recadre.jpg',{type:blob.type,lastModified:Date.now()});transfer.items.add(made);$('intro-file').files=transfer.files;originalKey=made.name+made.lastModified;fire($('intro-file'),'change');sync();}
  async function cropImage(open){try{const blob=await loadImage();if(!open){assignImage(blob);return;}
   if(!wide.matches)return;bitmap?.close();bitmap=await createImageBitmap(blob);cropDialog?.remove();cropDialog=element('dialog','pc-image-crop');cropDialog.setAttribute('aria-label','Recadrer votre image d’accueil');owned.push(cropDialog);
   const heading=element('header'),close=button('Fermer',()=>cropDialog.close());heading.append(element('h2','','Recadrer votre image'),close);cropDialog.append(heading);
   const canvas=element('canvas'),tools=element('div','pc-choice-buttons'),positions=element('div','pc-choice-buttons'),status=element('p','pc-hint','Le recadrage modifie l’image enregistrée dans votre accueil.');let ratio=1,x=.5,y=.5;
   function draw(){canvas.width=600;canvas.height=Math.round(600/ratio);const sw=Math.min(bitmap.width,bitmap.height*ratio),sh=sw/ratio;canvas.getContext('2d').drawImage(bitmap,(bitmap.width-sw)*x,(bitmap.height-sh)*y,sw,sh,0,0,canvas.width,canvas.height);}
   for(const [title,value] of [['Carré',1],['Portrait',2/3],['Paysage',3/2]])tools.append(button(title,()=>{ratio=value;draw();}));
   for(const [title,xx,yy] of [['Gauche',0,.5],['Centrer',.5,.5],['Droite',1,.5],['Haut',.5,0],['Bas',.5,1]])positions.append(button(title,()=>{x=xx;y=yy;draw();}));
   cropDialog.append(canvas,tools,positions,status,button('Appliquer le recadrage',()=>canvas.toBlob(blob=>{if(blob){assignImage(blob);cropDialog.close();}},'image/jpeg',.9),'pc-button primary'));document.body.append(cropDialog);draw();cropDialog.showModal();
  }catch(error){mediaError=error.message;text(mediaStatus,mediaError);}}
  const background=group('Cadrage du fond personnalisé',content);for(const source of document.querySelectorAll('[data-design-crop]'))proxy(source,{cardX:'Fiche · horizontal (%)',cardY:'Fiche · vertical (%)',welcomeX:'Accueil · horizontal (%)',welcomeY:'Accueil · vertical (%)'}[source.dataset.designCrop],background,'number');
  const colorHint=element('p','pc-hint','Couleur des textes, boutons et repères du QR. Le contraste est ajusté pour préserver la lisibilité.');studio.querySelector('[data-panel=color]').prepend(colorHint);owned.push(colorHint);
  for(const b of studio.querySelectorAll('[data-font-sample]')){const caption=element('small','pc-font-name',b.getAttribute('aria-label'));b.append(caption);owned.push(caption);}
  const links=element('section','pc-share-panel');links.append(element('h3','','Inviter vos proches'));const guestUrl=new URL('capsule.html',location.href);guestUrl.search='?t='+encodeURIComponent(c.guest_token);
  const linkInput=element('input');linkInput.type='text';linkInput.readOnly=true;linkInput.value=guestUrl.href;linkInput.setAttribute('aria-label','Lien de la page invités');const linkStatus=element('p','pc-hint');linkStatus.setAttribute('role','status');const copy=button('Copier le lien',async()=>{try{await navigator.clipboard.writeText(guestUrl.href);text(linkStatus,'Lien copié.');}catch{linkInput.select();text(linkStatus,'Sélectionnez puis copiez le lien.');}}),open=element('a','pc-button','Ouvrir la page invités');open.href=guestUrl.href;open.target='_blank';open.rel='noopener';
  const exportHint=element('p','pc-hint','Téléchargement : PDF A4, carte 10 × 15 cm ou QR seul en PNG.');links.append(linkInput,copy,open,linkStatus,exportHint);column.append(links);owned.push(links);
  const previewFrame=studio.querySelector('.visual-live-preview');
  function cleanPreview(){if(!wide.matches)return;try{const doc=previewFrame.contentDocument;if(!doc?.head||doc.querySelector('[data-pc-preview]'))return;const style=doc.createElement('style');style.dataset.pcPreview='';style.textContent='.guest-preview-edit-layer{display:none!important}';doc.head.append(style);owned.push(style);}catch{}}
  on(previewFrame,'load',cleanPreview);cleanPreview();
  const mainTitle=studio.querySelector('.visual-head h2'),oldTitle=mainTitle.textContent;text(mainTitle,'Personnaliser votre capsule');studio.classList.add('pc-workspace');
  function sync(){if(!wide.matches||!studio.isConnected)return;
   text(name,$('capsule-name')?.value||c.couple_name);const plan=window.SuiteDesign.effectivePlan(c),date=$('capsule-date')?.value||c.wedding_date;const formatted=/^\d{4}-\d{2}-\d{2}$/.test(date)?new Date(date+'T12:00:00').toLocaleDateString('fr-FR'):'';
   text(facts,formatted+' · '+({photo:'Essentiel',audio:'Plus',premium:'Premium'}[plan]||plan));const usage=c.usage;
   text(state,{draft:'En préparation',scheduled:'Prête à partager',open:'Dépôts ouverts',closed:'Dépôts terminés',full:'Stockage rempli',expired:'Conservation terminée',suspended:'Dépôts en pause'}[c.status==='draft'?'draft':usage?.state]||'Capsule active');
   text(storage,usage?.quota_bytes?'Stockage : '+new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format((usage.used_bytes||0)/1e9)+' / '+new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(usage.quota_bytes/1e9)+' Go':'');
   const active=document.querySelector('[data-owner-panel=messages]')&&!document.querySelector('[data-owner-panel=messages]').hidden;customize.setAttribute('aria-current',active?'false':'page');discover.setAttribute('aria-current',active?'page':'false');discover.hidden=c.status!=='active';
   card.hidden=studio.dataset.target!=='card';greeting.hidden=studio.dataset.target!=='welcome';background.hidden=$('qr-style')?.value!=='custom';dateNote.hidden=!$('capsule-date')?.disabled;
   for(const {source,control,choice} of bindings){if(choice){control.setAttribute('aria-pressed',source.getAttribute('aria-pressed')||'false');control.disabled=$('qr-style').disabled;continue;}control.disabled=source.disabled;if(document.activeElement!==control){if(control.type==='checkbox')control.checked=source.checked;else control.value=source.value;}}
   const k=$('intro-kind').value;message.closest('label').hidden=k!=='text';media.hidden=!['image','video'].includes(k);file.accept=$('intro-file').accept;adjust.hidden=crop.hidden=k!=='image';replace.disabled=remove.disabled=adjust.disabled=crop.disabled=$('intro-file').disabled;
   text(mediaStatus,mediaError||$('intro-file-help')?.textContent||'');links.hidden=c.status!=='active'||usage?.state==='expired';linkInput.disabled=c.status!=='active';
  }
  on(studio,'click',()=>requestAnimationFrame(sync));on(document,'input',()=>requestAnimationFrame(sync));on(document,'change',()=>requestAnimationFrame(sync));on(window,'studio-layout',()=>requestAnimationFrame(sync));
  const observer=new MutationObserver(()=>{if(!studio.isConnected){mounted?.destroy();mounted=null;current=null;return;}requestAnimationFrame(sync);});observer.observe(studio,{attributes:true,attributeFilter:['data-target']});observer.observe($('dashboard-content'),{childList:true,subtree:true});sync();
  return {studio,sync,destroy(){observer.disconnect();listeners.forEach(stop=>stop());cropDialog?.close();bitmap?.close();for(const {node,home} of moves)home.replaceWith(node);owned.forEach(node=>node.remove());studio.classList.remove('pc-workspace');text(mainTitle,oldTitle);}};
 }
 function update(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!wide.matches){mounted?.destroy();mounted=null;return;}const studio=$('welcome-visual-editor');if(mounted&&mounted.studio!==studio){mounted.destroy();mounted=null;}if(current&&studio&&document.body.classList.contains('visual-primary-ready')&&!mounted)mounted=mount(current,studio);mounted?.sync();});}
 window.SuiteWelcome.setup=function(context){const designer=original(context);current=context;if(wide.matches)queueMicrotask(update);return designer;};
 wide.addEventListener('change',update);
})();
