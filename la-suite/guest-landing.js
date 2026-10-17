/* Guest landing uses the existing upload form and trusted welcome presets. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),body=document.body,form=$('guest-message');
 if(!form)return;
 body.classList.add('guest-landing-ready','guest-compose-refined');body.dataset.guestView='home';const welcomeEditor=new URLSearchParams(location.search).get('editor')==='1'&&window.parent!==window;

 let currentState=null,countdownTimer=null,openingNotified=false;
 const main=document.querySelector('.guest-page'),hero=document.querySelector('.capsule-hero'),intro=$('intro-section');
 const landing=document.createElement('section');landing.id='guest-landing';landing.className='guest-landing';landing.setAttribute('aria-label','Accueil de la capsule');
 landing.innerHTML='<div class="guest-cover" hidden><div class="guest-cover-slot"></div><button class="guest-cover-open" type="button" aria-label="Ouvrir le message d’accueil"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7Z"/></svg></button></div><div class="guest-home-content"><p class="guest-home-label">Capsule temporelle</p><div class="guest-home-heading"></div><p id="guest-event-date"></p><div class="guest-home-divider" aria-hidden="true"></div><section class="guest-opening" hidden aria-label="Ouverture de la capsule"><h2>La capsule ouvre bientôt</h2><div class="guest-countdown" role="timer" aria-live="off"></div><p class="guest-opening-date"></p></section><p class="guest-home-principle">Déposez un souvenir aujourd’hui.<br>Il sera révélé à la date que vous choisirez.</p><div class="guest-greeting"></div><button type="button" id="guest-read-more" hidden>Lire la suite</button><h2 class="guest-home-prompt">Partagez un souvenir</h2><button type="button" id="guest-deposit" class="guest-deposit" hidden><span>Déposer un souvenir</span><span aria-hidden="true">→</span></button><div class="guest-home-types" role="group" aria-label="Choisir un souvenir"></div><div class="guest-home-state"></div><div class="guest-home-footer"><a href="index.html#principe" class="guest-home-brand" aria-label="La Suite — découvrir le concept sur La Forge à Souvenirs"><img src="assets/la-suite-logo.webp?v=20261010-forge-type" alt="La Suite — Capsule temporelle"></a></div></div>';
 const fullscreen=document.createElement('button');fullscreen.type='button';fullscreen.className='guest-fullscreen';fullscreen.setAttribute('aria-label','Afficher en plein écran');fullscreen.title='Plein écran';fullscreen.innerHTML='<i class="fa-solid fa-expand" aria-hidden="true"></i>';fullscreen.hidden=!document.fullscreenEnabled||(new URLSearchParams(location.search).get('preview')==='1'&&window.parent!==window);document.body.append(fullscreen);fullscreen.onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{fullscreen.hidden=true;}};document.addEventListener('fullscreenchange',()=>{const active=Boolean(document.fullscreenElement);fullscreen.setAttribute('aria-label',active?'Quitter le plein écran':'Afficher en plein écran');fullscreen.title=active?'Quitter le plein écran':'Plein écran';fullscreen.firstElementChild.className=active?'fa-solid fa-compress':'fa-solid fa-expand';});
 main.prepend(landing);landing.querySelector('.guest-home-heading').append(hero);
 const greeting=landing.querySelector('.guest-greeting'),cover=landing.querySelector('.guest-cover'),slot=landing.querySelector('.guest-cover-slot');
 greeting.append(intro);landing.querySelector('.guest-home-content').insertBefore(cover,greeting);landing.querySelector('.guest-home-state').append($('guest-state'),$('guest-retry'));
 const hostZone=document.createElement('div');hostZone.className='guest-host-zone';cover.before(hostZone);hostZone.append(cover,greeting);const emptyWelcome=document.createElement('div');emptyWelcome.className='guest-empty-welcome';emptyWelcome.innerHTML='<div class="guest-empty-illustration" aria-hidden="true"></div><div class="guest-empty-formats" aria-label="Formats de souvenirs disponibles"></div>';hostZone.append(emptyWelcome);
 const hostLabel=document.createElement('p');hostLabel.className='guest-host-label';hostLabel.textContent='Le mot de votre hôte';greeting.prepend(hostLabel);
 const icons={image:'<path fill-rule="evenodd" d="M8 3h8l2 3h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3Zm4 6a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"/>',video:'<rect x="1" y="5" width="14" height="14" rx="3"/><path d="m17 9 6-4v14l-6-4z"/>',audio:'<rect x="8" y="1" width="8" height="14" rx="4"/><path d="M4 10a1 1 0 0 1 2 0v2a6 6 0 0 0 12 0v-2a1 1 0 0 1 2 0v2a8 8 0 0 1-7 8v2h4v2H7v-2h4v-2a8 8 0 0 1-7-8Z"/>',text:'<path fill-rule="evenodd" d="M4 1h10v6h6v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Zm2 10v2h10v-2Zm0 5v2h10v-2Zm0 4v1h6v-1Z"/><path d="m16 1 4 4h-4Z"/>'};
 const types=landing.querySelector('.guest-home-types');
 if(new URLSearchParams(location.search).get('editor')==='1'&&window.parent!==window){
  body.classList.add('guest-preview-editor');
  const editLayer=document.createElement('div');editLayer.className='guest-preview-edit-layer';body.append(editLayer);
  const editTargets=[['name','#capsule-title','Modifier le titre'],['date','#guest-event-date','Modifier la date'],['intro','.guest-host-zone','Modifier le contenu d’accueil']];
  const edits=editTargets.map(([field,selector,label])=>{const button=document.createElement('button');button.type='button';button.className='guest-preview-edit';button.dataset.field=field;button.setAttribute('aria-label',label);button.title=label;button.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><use href="assets/icons/solid/sprite.svg?v=20261011-icons1#modifier"></use></svg>';button.onclick=()=>window.parent.postMessage({type:'la-suite-guest-edit',field},location.origin);editLayer.append(button);return{button,node:landing.querySelector(selector)};});
  function editInline(field){const node=field==='name'?$('capsule-title'):null;
   if(node&&(field==='name'||!node.hidden&&node.textContent.trim())){const frozen=node.getBoundingClientRect(),previousStyle=node.getAttribute('style');node.style.width=frozen.width+'px';node.style.height=frozen.height+'px';node.style.minHeight=frozen.height+'px';node.style.maxHeight=frozen.height+'px';node.style.boxSizing='border-box';node.style.overflow='auto';node.contentEditable='true';node.setAttribute('role','textbox');node.setAttribute('aria-label',field==='name'?'Nom de la capsule':'Message d’accueil');node.focus();window.parent.postMessage({type:'la-suite-guest-inline-start',box:{top:frozen.top,bottom:frozen.bottom}},location.origin);const range=document.createRange();range.selectNodeContents(node);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    const limit=field==='name'?50:2000;node.setAttribute('aria-description',limit+' caractères maximum');
    const enforceLimit=()=>{const value=node.innerText.replace(/\r/g,'');if(value.length>limit){node.textContent=value.slice(0,limit);const range=document.createRange();range.selectNodeContents(node);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);}window.parent.postMessage({type:'la-suite-guest-inline-change',field,value:node.innerText},location.origin);};
    node.oninput=enforceLimit;node.oncompositionend=enforceLimit;
    node.onpaste=event=>{event.preventDefault();document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));enforceLimit();};
    node.onblur=()=>{node.contentEditable='false';if(previousStyle===null)node.removeAttribute('style');else node.setAttribute('style',previousStyle);window.parent.postMessage({type:'la-suite-guest-inline-end'},location.origin)};
    node.onkeydown=event=>{if(event.key==='Escape'||field==='name'&&event.key==='Enter'&&!event.isComposing){event.preventDefault();node.blur()}};
   }else window.parent.postMessage({type:'la-suite-guest-edit',field},location.origin);
  }
  for(const {button} of edits)button.onclick=()=>editInline(button.dataset.field);
  let editScale=1;
  function positionEdits(){for(const {button,node} of edits){
   let anchor=node;const content=button.dataset.field==='intro';if(content)anchor=([...node.querySelectorAll('#capsule-welcome,.guest-cover img,.guest-cover video,.guest-empty-illustration')].find(el=>!el.hidden&&el.getBoundingClientRect().height>0))||node;
   let box=anchor.getBoundingClientRect();
   if(anchor.matches('#capsule-title,#guest-event-date,#capsule-welcome')&&anchor.textContent.trim()){const range=document.createRange();range.selectNodeContents(anchor);const textBox=range.getBoundingClientRect();if(textBox.width&&textBox.height)box=textBox;}
   if(anchor.matches('img,video')){const naturalWidth=anchor.naturalWidth||anchor.videoWidth,naturalHeight=anchor.naturalHeight||anchor.videoHeight;if(naturalWidth&&naturalHeight&&getComputedStyle(anchor).objectFit==='contain'){const ratio=Math.min(box.width/naturalWidth,box.height/naturalHeight),width=naturalWidth*ratio,height=naturalHeight*ratio;box={left:box.left+(box.width-width)/2,right:box.left+(box.width+width)/2,top:box.top+(box.height-height)/2,width,height};}}
   const size=24/editScale,gap=4/editScale;button.style.width=size+'px';button.style.height=size+'px';button.style.padding=(5/editScale)+'px';button.style.transform='none';if(button.dataset.field==='date'&&(!box.width||!box.height)){const title=$('capsule-title').getBoundingClientRect();box={left:title.left,right:title.right,top:title.bottom+12,width:title.width,height:size};}button.hidden=!box.width||!box.height||body.dataset.guestView!=='home';
   button.style.left=Math.max(0,Math.min(innerWidth-size-gap,content?box.right-size-gap:box.right+gap))+'px';button.style.top=Math.max(0,Math.min(innerHeight-size,content?box.top+gap:box.top+(box.height-size)/2))+'px';
  }}
  const editResize=new ResizeObserver(positionEdits);for(const {node} of edits)editResize.observe(node);
  new MutationObserver(positionEdits).observe(landing,{subtree:true,attributes:true,childList:true,characterData:true});
  landing.addEventListener('load',positionEdits,true);landing.addEventListener('loadedmetadata',positionEdits,true);window.addEventListener('resize',positionEdits);window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='la-suite-guest-preview-scale')return;const scale=Number(event.data.scale);if(!Number.isFinite(scale)||scale<=0)return;editScale=Math.max(.05,Math.min(1,scale));editLayer.style.setProperty('--preview-edit-scale',String(1/editScale));positionEdits();});
  document.addEventListener('click',event=>{
   const node=event.target.closest('#capsule-title,#guest-event-date,.guest-host-zone,#guest-read-more');if(!node||event.target.closest('[contenteditable=true]'))return;
   event.preventDefault();event.stopImmediatePropagation();editInline(node.id==='capsule-title'?'name':node.id==='guest-event-date'?'date':'intro');
  },true);
  window.addEventListener('scroll',positionEdits,{passive:true});window.visualViewport?.addEventListener('resize',positionEdits);window.visualViewport?.addEventListener('scroll',positionEdits);
  document.fonts?.ready.then(positionEdits);positionEdits();
 }

 for(const [type,label] of [['image','Photo'],['video','Vidéo'],['audio','Audio'],['text','Texte']]){
  const b=document.createElement('button');b.type='button';b.dataset.landingType=type;b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[type]+'</svg><span>'+label+'</span>';b.hidden=true;
  b.onclick=()=>{if(welcomeEditor)return;body.dataset.guestView='compose';form.querySelector('[data-memory-type="'+type+'"]').click();window.scrollTo(0,0);};types.append(b);
 }
 $('guest-deposit').onclick=()=>{if(welcomeEditor)return;body.dataset.guestView='compose';window.scrollTo(0,0);form.querySelector('[data-memory-type]:not([hidden])')?.focus({preventScroll:true});};
 const composeHeading=document.createElement('header');composeHeading.className='guest-compose-heading';composeHeading.innerHTML='<h2>Votre souvenir</h2><p></p>';form.prepend(composeHeading);const signature=form.querySelector('.guest-signature'),delivery=form.querySelector('.guest-personalization');signature.after(delivery);
 const submission=document.createElement('div');submission.className='guest-submit-fields';signature.before(submission);submission.append(signature,delivery,form.querySelector('.submit-memory'));
 const composer=document.createElement('div');composer.className='guest-composer-body';form.querySelector('.memory-type-choices').after(composer);for(const id of ['capture-choices','file-help','upload-panel','video-panel','audio-panel','photo-panel','media-preview','capture-status','guest-text-content','guest-extras']){const node=$(id);if(node)composer.append(node);}
 const revealButton=$('delivery-summary'),revealValue=$('delivery-value');revealButton.classList.add('guest-reveal-card');
 const revealCaption=document.createElement('span');revealCaption.className='guest-reveal-caption';revealCaption.textContent='Révéler ce souvenir';
 const revealArrow=document.createElement('span');revealArrow.className='guest-reveal-arrow';revealArrow.setAttribute('aria-hidden','true');revealArrow.textContent='›';
 const revealSymbol=document.createElement('span');revealSymbol.className='guest-reveal-symbol';revealSymbol.setAttribute('aria-hidden','true');revealSymbol.innerHTML='<svg viewBox="0 0 24 24" focusable="false"><path d="M5 3h14M5 21h14M7 3v4c0 2 3 3.5 5 5-2 1.5-5 3-5 5v4M17 3v4c0 2-3 3.5-5 5 2 1.5 5 3 5 5v4"/></svg>';
 revealButton.replaceChildren(revealSymbol,revealCaption,revealValue,revealArrow);

 const mediaDialog=document.createElement('dialog');mediaDialog.className='guest-media-dialog guest-capture-dialog';mediaDialog.setAttribute('aria-labelledby','guest-media-dialog-title');mediaDialog.innerHTML='<header><h2 id="guest-media-dialog-title">Votre souvenir</h2><button type="button" class="guest-media-close" aria-label="Fermer">×</button></header><div class="guest-media-dialog-body"></div>';form.append(mediaDialog);const mediaBody=mediaDialog.querySelector('.guest-media-dialog-body');for(const id of ['capture-choices','file-help','upload-panel','video-panel','audio-panel','photo-panel','media-preview','capture-status'])mediaBody.append($(id));for(const kind of ['audio','video'])for(const action of ['prepare','start','stop']){const button=$(action+'-'+kind);button.setAttribute('aria-label',action==='stop'?'Arrêter l’enregistrement':'Démarrer l’enregistrement');button.innerHTML='<svg class="guest-recorder-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="'+(action==='stop'?'M6 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z':kind==='audio'?'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Zm-6 8a1 1 0 0 0-1 1v1a7 7 0 0 0 6 6.93V21H8v2h8v-2h-3v-2.07A7 7 0 0 0 19 12v-1a1 1 0 0 0-2 0v1a5 5 0 0 1-10 0v-1a1 1 0 0 0-1-1Z':'M4 5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2l5 3V6l-5 3V7a2 2 0 0 0-2-2Z')+'"/></svg>';}const mediaLaunch=document.createElement('button');mediaLaunch.type='button';mediaLaunch.className='guest-media-launch';mediaLaunch.innerHTML='<img class="guest-media-thumbnail" alt="" hidden><i class="fa-solid fa-image" aria-hidden="true"></i><strong>Ajouter votre souvenir</strong><span>Choisir un fichier ou enregistrer</span>';composer.prepend(mediaLaunch);const editBadge='<b class="guest-content-pencil" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><use href="assets/icons/solid/sprite.svg?v=20261011-icons1#modifier"></use></svg></b>';mediaLaunch.insertAdjacentHTML('beforeend',editBadge);mediaLaunch.setAttribute('aria-haspopup','dialog');const mediaCard=document.createElement('div');mediaCard.className='guest-memory-card';mediaLaunch.before(mediaCard);mediaCard.append(mediaLaunch);const depositVideo=$('preview-video');depositVideo.classList.add('guest-media-video');depositVideo.muted=false;depositVideo.controls=true;mediaCard.append(depositVideo);const depositAudio=document.createElement('audio');depositAudio.controls=true;depositAudio.preload='metadata';depositAudio.hidden=true;mediaCard.append(depositAudio);

 // Keep a real, bounded playback area, independent of the edit-button overlay.
 depositVideo.preload='auto';depositVideo.setAttribute('aria-label','Aperçu de votre vidéo');
 const playbackNotice=document.createElement('p');playbackNotice.className='guest-video-playback-error';playbackNotice.setAttribute('role','alert');playbackNotice.hidden=true;mediaCard.after(playbackNotice);
 depositVideo.addEventListener('loadedmetadata',()=>{
  if(depositVideo.videoWidth&&depositVideo.videoHeight)mediaCard.style.setProperty('--guest-video-ratio',depositVideo.videoWidth+'/'+depositVideo.videoHeight);
  playbackNotice.hidden=true;
 });
 depositVideo.addEventListener('error',()=>{if(!depositVideo.getAttribute('src'))return;playbackNotice.textContent='L’aperçu de cette vidéo ne peut pas être lu. Essayez une autre vidéo ou ouvrez la page dans votre navigateur.';playbackNotice.hidden=false;});
 depositVideo.addEventListener('playing',()=>{playbackNotice.hidden=true;});
 for(const kind of ['audio','video']){const actions=$(kind+'-panel').querySelector('.recorder-actions'),clock=$(kind+'-timer'),elapsed=document.createElement('span'),remaining=document.createElement('span');elapsed.className='guest-record-elapsed';remaining.className='guest-record-remaining';actions.prepend(elapsed);actions.append(remaining);function syncClock(){const recording=!clock.hidden&&$(kind+'-countdown').hidden;actions.dataset.recording=String(recording);elapsed.textContent=recording?clock.querySelector('.record-elapsed').textContent:'';remaining.textContent=recording?clock.querySelector('.record-remaining').textContent.replace(' restantes',''):'';elapsed.setAttribute('aria-label','Temps écoulé '+elapsed.textContent);remaining.setAttribute('aria-label','Temps restant '+remaining.textContent);}new MutationObserver(syncClock).observe(clock,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden']});new MutationObserver(syncClock).observe($(kind+'-countdown'),{attributes:true,attributeFilter:['hidden']});syncClock();}
 function openMediaDialog(){if(window.SuiteGuestLimits?.remaining()>0)return;if(form.querySelector('.submit-memory').disabled)return;const type=form.querySelector('[data-memory-type][aria-pressed=true]')?.dataset.memoryType;if(type==='text')return;depositAudio.pause();depositVideo.pause();mediaDialog.dataset.type=type;window.dispatchEvent(new CustomEvent('la-suite-guest-edit-media',{detail:{type}}));const replacing=mediaCard.dataset.ready==='true';mediaDialog.dataset.replacing=String(replacing);updateMediaDialogState();mediaBody.scrollTop=0;mediaDialog.querySelector('h2').textContent={image:'Votre photo',audio:'Votre audio',video:'Votre vidéo'}[type];if(!mediaDialog.open)mediaDialog.showModal();requestAnimationFrame(fitDepositDialogs);}
 mediaLaunch.onclick=openMediaDialog;mediaDialog.querySelector('.guest-media-close').onclick=()=>mediaDialog.close();mediaDialog.addEventListener('close',()=>{window.dispatchEvent(new Event('la-suite-guest-home'));if(!textDialog.open&&!mediaLaunch.hidden&&!mediaDialog.open)mediaLaunch.focus({preventScroll:true});});
 function syncMediaLauncher(){const type=form.querySelector('[data-memory-type][aria-pressed=true]')?.dataset.memoryType||'text';mediaLaunch.hidden=type==='text';mediaCard.hidden=type==='text';const icon=mediaLaunch.querySelector('i');icon.className='fa-solid '+({image:'fa-camera',audio:'fa-microphone',video:'fa-video'}[type]||'fa-image');const ready=!$('media-preview').hidden;if(!ready||type!=='video')playbackNotice.hidden=true;mediaLaunch.dataset.ready=String(ready);mediaLaunch.dataset.type=type;mediaCard.dataset.type=type;mediaCard.dataset.ready=String(ready);mediaLaunch.setAttribute('aria-label',ready?'Modifier votre '+({image:'photo',audio:'audio',video:'vidéo'}[type]||'souvenir'):'Ajouter votre souvenir');const thumbnail=mediaLaunch.querySelector('.guest-media-thumbnail'),video=depositVideo,photo=ready&&type==='image'&&!$('preview-image').hidden,film=ready&&type==='video'&&!$('preview-video').hidden;thumbnail.hidden=!photo;if(photo)thumbnail.src=$('preview-image').src;else thumbnail.removeAttribute('src');video.hidden=!film;const src=film?$('preview-video').getAttribute('src'):null;if(src&&video.getAttribute('src')!==src)video.src=src;else if(!film){video.pause();video.removeAttribute('src');video.load();}const sound=ready&&type==='audio'&&!$('preview-audio').hidden;depositAudio.hidden=!sound;const audioSrc=sound?$('preview-audio').getAttribute('src'):null;if(audioSrc&&depositAudio.getAttribute('src')!==audioSrc)depositAudio.src=audioSrc;else if(!sound){depositAudio.pause();depositAudio.removeAttribute('src');}icon.hidden=photo||film||sound;mediaLaunch.querySelector('strong').hidden=ready;mediaLaunch.querySelector('span').hidden=ready;mediaLaunch.querySelector('strong').textContent='Ajouter '+({image:'une photo',audio:'un audio',video:'une vidéo'}[type]||'un souvenir');mediaLaunch.querySelector('span').textContent='Choisir un fichier ou enregistrer';}

 for(const button of form.querySelectorAll('[data-memory-type]')){new MutationObserver(syncMediaLauncher).observe(button,{attributes:true,attributeFilter:['aria-pressed']});}new MutationObserver(syncMediaLauncher).observe($('media-preview'),{attributes:true,subtree:true,attributeFilter:['hidden','src']});syncMediaLauncher();
 // Accepted media returns directly to the deposit; the pencil reopens its editor.
 let acceptedMediaSource='';
 new MutationObserver(()=>{const type=form.querySelector('[data-memory-type][aria-pressed=true]')?.dataset.memoryType,node=$(type==='image'?'preview-image':type==='video'?'preview-video':'preview-audio'),source=node?.getAttribute('src');if($('media-preview').hidden||node?.hidden||!source||source===acceptedMediaSource)return;acceptedMediaSource=source;mediaDialog.dataset.replacing='false';syncMediaLauncher();if(mediaDialog.open)mediaDialog.close();}).observe($('media-preview'),{subtree:true,attributes:true,attributeFilter:['hidden','src']});
 // MediaRecorder WebM may omit duration; scan its end before enabling seeking.
 for(const audioPreview of [$('preview-audio'),depositAudio]){let durationProbeCleanup=null;
 audioPreview.addEventListener('loadedmetadata',()=>{if(durationProbeCleanup)durationProbeCleanup();if(Number.isFinite(audioPreview.duration))return;const source=audioPreview.getAttribute('src');let timer;
  function cleanup(){clearTimeout(timer);audioPreview.removeEventListener('durationchange',restore);audioPreview.removeEventListener('timeupdate',restore);durationProbeCleanup=null;}
  function restore(){if(audioPreview.getAttribute('src')!==source){cleanup();return;}if(!Number.isFinite(audioPreview.duration)||audioPreview.duration<=0)return;cleanup();audioPreview.currentTime=0;}
  durationProbeCleanup=cleanup;audioPreview.addEventListener('durationchange',restore);audioPreview.addEventListener('timeupdate',restore);timer=setTimeout(()=>{cleanup();if(audioPreview.getAttribute('src')===source)audioPreview.currentTime=0;},2000);audioPreview.currentTime=1e101;
 });}
 const counter=document.createElement('span');counter.className='guest-message-counter';$('guest-message-field').append(counter);const updateCounter=()=>{const field=$('message_text'),length=Array.from(field.value.trim()).length,short=length<10;counter.textContent=length+' / 1 000';field.classList.toggle('is-too-short',short);counter.classList.toggle('is-too-short',short);};$('message_text').addEventListener('input',updateCounter);form.addEventListener('reset',()=>queueMicrotask(updateCounter));updateCounter();
 const textDialog=document.createElement('dialog');textDialog.id='guest-text-dialog';textDialog.className='guest-media-dialog guest-text-dialog';textDialog.setAttribute('aria-labelledby','guest-text-dialog-title');textDialog.innerHTML='<header><h2 id="guest-text-dialog-title">Votre petit mot</h2><button type="button" class="guest-media-close" aria-label="Fermer">×</button></header><div class="guest-media-dialog-body"></div><button type="button" class="btn primary guest-media-done">Valider</button>';form.append(textDialog);textDialog.querySelector('.guest-media-dialog-body').append($('guest-text-content'));
 const textLaunch=document.createElement('button');textLaunch.type='button';textLaunch.className='guest-media-launch guest-text-launch';textLaunch.setAttribute('aria-haspopup','dialog');textLaunch.setAttribute('aria-controls',textDialog.id);textLaunch.innerHTML='<i class="fa-solid fa-pen" aria-hidden="true"></i><strong>Écrire votre petit mot</strong><span>Ouvrir la fenêtre de saisie</span>';composer.prepend(textLaunch);textLaunch.insertAdjacentHTML('beforeend',editBadge);
 function openTextDialog(){if(window.SuiteGuestLimits?.remaining()>0)return;if(form.querySelector('.submit-memory').disabled||form.querySelector('[data-memory-type][aria-pressed=true]')?.dataset.memoryType!=='text')return;if(!textDialog.open)textDialog.showModal();$('message_text').focus({preventScroll:true});requestAnimationFrame(fitDepositDialogs);}
 function syncTextLauncher(){updateCounter();const selected=form.querySelector('[data-memory-type][aria-pressed=true]')?.dataset.memoryType==='text',text=$('message_text').value.trim();textLaunch.hidden=!selected;textLaunch.dataset.ready=String(Boolean(text));textLaunch.setAttribute('aria-label',text?'Modifier votre petit mot':'Écrire votre petit mot');textLaunch.querySelector('strong').hidden=Boolean(text);textLaunch.querySelector('i').hidden=Boolean(text);textLaunch.querySelector('span').textContent=text||'Ouvrir la fenêtre de saisie';}
 textLaunch.onclick=openTextDialog;textDialog.querySelector('.guest-media-close').onclick=()=>textDialog.close();textDialog.querySelector('.guest-media-done').onclick=()=>textDialog.close();textDialog.addEventListener('close',()=>{syncTextLauncher();if(!mediaDialog.open&&!textLaunch.hidden&&!textDialog.open)textLaunch.focus({preventScroll:true});});
 let editorOpenTimer=null;
 for(const button of form.querySelectorAll('[data-memory-type]')){
  button.addEventListener('click',()=>{
   if(button.disabled)return;
   clearTimeout(editorOpenTimer);
   editorOpenTimer=setTimeout(()=>{
    const selected=form.querySelector('[data-memory-type][aria-pressed=true]')?.dataset.memoryType;
    if(selected!==button.dataset.memoryType)return;
    showGuestWait();if(window.SuiteGuestLimits?.remaining()>0)return;
    syncMediaLauncher();syncTextLauncher();
    mediaBody.scrollTop=0;mediaDialog.dataset.ready='false';mediaDialog.dataset.recording='false';mediaDialog.dataset.replacing='false';
    if(selected==='text'){if(mediaDialog.open)mediaDialog.close();openTextDialog();}
    else{if(textDialog.open)textDialog.close();openMediaDialog();}
   },0);
  });
  new MutationObserver(syncTextLauncher).observe(button,{attributes:true,attributeFilter:['aria-pressed']});
 }
 $('message_text').addEventListener('input',syncTextLauncher);$('message_text').addEventListener('invalid',event=>{if(!textLaunch.hidden){event.preventDefault();openTextDialog();}});form.addEventListener('reset',()=>queueMicrotask(syncTextLauncher));syncTextLauncher();
 // Validate the text before advancing to the signature, including trimmed Unicode length.
 const textError=document.createElement('p');textError.className='status err';textError.id='guest-text-error';textError.setAttribute('role','alert');textError.hidden=true;textDialog.querySelector('.guest-media-dialog-body').append(textError);
 $('message_text').setAttribute('aria-describedby','guest-text-error');
 function validateGuestText(){
  const selected=form.querySelector('[data-memory-type][aria-pressed=true]')?.dataset.memoryType;
  if(selected!=='text')return true;
  const field=$('message_text'),length=Array.from(field.value.trim()).length;
  const message=length<10?'Votre petit mot doit contenir au moins 10 caractères.':length>1000?'Votre petit mot doit contenir au maximum 1 000 caractères.':'';
  textError.textContent=message;textError.hidden=!message;textError.classList.toggle('show',Boolean(message));field.setAttribute('aria-invalid',String(Boolean(message)));
  if(!message)return true;
  if(nameDialog.open)nameDialog.close();openTextDialog();return false;
 }
 textDialog.querySelector('.guest-media-done').onclick=()=>{if(validateGuestText())textDialog.close();};
 $('message_text').addEventListener('input',()=>{textError.hidden=true;textError.classList.remove('show');$('message_text').removeAttribute('aria-invalid');});
 const nameDialog=document.createElement('dialog');nameDialog.className='guest-name-dialog';nameDialog.setAttribute('aria-labelledby','guest-name-title');nameDialog.innerHTML='<header><h2 id="guest-name-title">Votre prénom</h2><button type="button" class="guest-media-close" aria-label="Fermer">×</button></header><div class="guest-media-dialog-body"></div><button type="button" class="btn primary guest-name-send">Envoyer mon souvenir</button>';form.append(nameDialog);const nameBody=nameDialog.querySelector('.guest-media-dialog-body');nameBody.append(signature);
 const privacy=signature.querySelector('.legal-collection-notice');if(privacy){const details=document.createElement('details'),summary=document.createElement('summary');details.className='guest-name-privacy';summary.textContent='Confidentialité et vos droits';details.append(summary,privacy);nameBody.append(details);}
 signature.querySelector('label').textContent='Prénom ou surnom';$('guest_name').setAttribute('enterkeyhint','send');
 nameDialog.querySelector('.guest-media-close').onclick=()=>nameDialog.close();
 const sendButton=form.querySelector('.submit-memory');
 sendButton.addEventListener('click',event=>{event.preventDefault();highlightMissing();const type=form.querySelector('[data-memory-type][aria-pressed=true]')?.dataset.memoryType;if(type==='text'&&!validateGuestText())return;if(type!=='text'&&$('media-preview').hidden){mediaLaunch.focus();return;}if(!$('deliver-now').checked&&!$('delivery_date').value){deliveryPopup.showModal();return;}if(window.SuiteGuestLimits?.remaining()>0||sendButton.disabled)return;markMissing($('guest_name'),false);nameDialog.showModal();$('guest_name').focus({preventScroll:true});requestAnimationFrame(fitDepositDialogs);});
 nameDialog.querySelector('.guest-name-send').onclick=()=>{if(!validateGuestText())return;if(!$('guest_name').value.trim()){markMissing($('guest_name'),true);$('guest_name').focus();return;}if(!$('guest_name').reportValidity())return;nameDialog.close();form.requestSubmit(sendButton);};
 $('guest_name').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing&&nameDialog.open){event.preventDefault();nameDialog.querySelector('.guest-name-send').click();}});
 form.addEventListener('submit',()=>{if(nameDialog.open)nameDialog.close();},true);
 // Highlight missing required values together before native form validation.
 function markMissing(node,missing){node.classList.toggle('guest-required-missing',missing);node.setAttribute('aria-invalid',String(missing));}
 function highlightMissing(){const type=form.querySelector('[data-memory-type][aria-pressed=true]')?.dataset.memoryType;if(nameDialog.open)markMissing($('guest_name'),!$('guest_name').value.trim());markMissing(textLaunch,type==='text'&&!$('message_text').value.trim());markMissing(mediaCard,type!=='text'&&$('media-preview').hidden);markMissing($('delivery-summary'),!$('deliver-now').checked&&!$('delivery_date').value);}

 form.addEventListener('invalid',highlightMissing,true);
 $('guest_name').addEventListener('input',()=>{if($('guest_name').value.trim())markMissing($('guest_name'),false);});
 $('message_text').addEventListener('input',()=>{if($('message_text').value.trim())markMissing(textLaunch,false);});
 new MutationObserver(()=>{if(!$('media-preview').hidden)markMissing(mediaCard,false);}).observe($('media-preview'),{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(()=>{if($('deliver-now').checked||$('delivery_date').value)markMissing($('delivery-summary'),false);}).observe($('delivery-value'),{subtree:true,childList:true,characterData:true});
 form.addEventListener('reset',()=>{for(const node of form.querySelectorAll('.guest-required-missing'))markMissing(node,false);});
 const deliveryPopup=$('delivery-dialog');deliveryPopup.append($('delivery-done'));
 const depositDialogs=[textDialog,mediaDialog,deliveryPopup,nameDialog];
 function fitDepositDialogs(){const view=window.visualViewport;if((view?.scale||1)>1.01)return;const height=view?.height||innerHeight,offset=view?.offsetTop||0;for(const dialog of depositDialogs){if(!dialog.open)continue;dialog.style.setProperty('--deposit-dialog-height',Math.max(1,Math.min(560,height-24))+'px');dialog.style.setProperty('--deposit-dialog-top',offset+12+'px');}}
 function updateMediaDialogState(){
 const ready=!$('media-preview').hidden&&mediaDialog.dataset.replacing!=='true',type=mediaDialog.dataset.type;
 const counting=!$('video-countdown').hidden||!$('audio-countdown').hidden,recording=!$('stop-video').hidden||!$('stop-audio').hidden;
 const processing=$('capture-status').dataset.preparing==='true'||$('capture-status').dataset.originalChoice==='true';
 mediaDialog.dataset.ready=String(ready);mediaDialog.dataset.recording=String(!ready&&(counting||recording));
 mediaDialog.dataset.phase=processing?'processing':ready?'ready':counting?'countdown':recording?'recording':type==='audio'||$('video-panel').classList.contains('active')?'capture':'choose';
 scheduleDepositFit();
}
 const scheduleDepositFit=()=>requestAnimationFrame(fitDepositDialogs);
 for(const dialog of depositDialogs){dialog.classList.add('guest-deposit-dialog');dialog.addEventListener('toggle',scheduleDepositFit);dialog.addEventListener('focusin',scheduleDepositFit);}
 new MutationObserver(updateMediaDialogState).observe(mediaBody,{subtree:true,attributes:true,attributeFilter:['hidden','class','data-preparing','data-original-choice'],childList:true});new MutationObserver(updateMediaDialogState).observe(form.querySelector('.submit-memory'),{attributes:true,attributeFilter:['disabled']});updateMediaDialogState();
 window.addEventListener('resize',scheduleDepositFit);window.visualViewport?.addEventListener('resize',scheduleDepositFit);window.visualViewport?.addEventListener('scroll',scheduleDepositFit);
 const waitNotice=document.createElement('p');waitNotice.className='guest-wait-notice';waitNotice.hidden=true;waitNotice.setAttribute('role','status');form.querySelector('.memory-type-choices').before(waitNotice);
 const homeWait=waitNotice.cloneNode(true);landing.querySelector('.guest-home-principle').after(homeWait);
 function showGuestWait(){const seconds=window.SuiteGuestLimits?.remaining()||0,label=seconds>=3600?Math.ceil(seconds/3600)+' h':String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');for(const notice of [waitNotice,homeWait]){notice.hidden=!seconds;notice.textContent=seconds?'Prochain envoi dans '+label+'. Votre souvenir reste sur cette page.':'';}const button=form.querySelector('.submit-memory');button.setAttribute('aria-disabled',String(seconds>0));if(!button.disabled){button.querySelector('span').textContent=seconds?'Envoi disponible dans '+label:'Continuer';}}
 window.addEventListener('la-suite-guest-limits',showGuestWait);window.addEventListener('focus',()=>window.SuiteGuestLimits?.refresh());showGuestWait();
 const sending=document.createElement('div');sending.id='guest-send-screen';sending.setAttribute('role','status');sending.innerHTML='<span class="guest-send-spinner" aria-hidden="true"></span><p>Envoi de votre souvenir…</p>';body.append(sending);
 const composeFooter=document.createElement('footer');composeFooter.className='guest-compose-footer';composeFooter.innerHTML='<a href="index.html#principe" class="guest-home-brand" aria-label="Découvrir La Suite — La Forge à Souvenirs"><img src="assets/la-suite-logo.webp?v=20261010-forge-type" alt="La Suite — capsule temporelle"></a>';form.append(composeFooter);
 function openWelcome(){if(!SuiteGuestCalendar.welcomeAvailable(currentState))return;const dialog=$('guest-welcome-dialog');for(const media of [...slot.children])intro.append(media);dialog.append(intro);intro.hidden=false;$('organizer-intro').controls=true;dialog.showModal();}
 landing.querySelector('.guest-cover-open').onclick=openWelcome;$('guest-read-more').onclick=openWelcome;
 $('guest-welcome-dialog').addEventListener('close',()=>{greeting.append(intro);$('organizer-intro').controls=false;syncMedia();});
 function syncMedia(){
  if(!SuiteGuestCalendar.welcomeAvailable(currentState)){cover.hidden=true;intro.hidden=true;greeting.hidden=true;emptyWelcome.hidden=false;hostZone.dataset.content='empty';$('guest-read-more').hidden=true;landing.classList.remove('has-cover');$('organizer-intro').pause();return;}
  const image=$('organizer-intro-image'),video=$('organizer-intro'),media=!image.hidden&&image.getAttribute('src')?image:!video.hidden&&video.getAttribute('src')?video:null;
  const hasText=Boolean($('capsule-welcome').textContent.trim());greeting.hidden=!hasText;hostLabel.hidden=!hasText;emptyWelcome.hidden=Boolean(media||hasText);hostZone.dataset.content=media?'media':hasText?'text':'empty';
  cover.hidden=!media;landing.classList.toggle('has-cover',Boolean(media));
  if(!$('guest-welcome-dialog').open){if(media)slot.append(media);for(const node of [image,video])if(node!==media)intro.append(node);video.controls=false;}
  if(!$('guest-welcome-dialog').open)intro.hidden=!$('capsule-welcome').textContent.trim();
  landing.querySelector('.guest-cover-open').setAttribute('aria-label',media===image?'Agrandir l’image d’accueil':'Lire la vidéo d’accueil');
  landing.querySelector('.guest-cover-open svg').style.display=media===image?'none':'';
  $('guest-read-more').hidden=!$('capsule-welcome').textContent.trim()||$('capsule-welcome').scrollHeight<=$('capsule-welcome').clientHeight+1;
 }
 function updateCountdown(){
  const remaining=SuiteGuestCalendar.remaining(currentState?.opens_at),box=landing.querySelector('.guest-opening'),timer=box.querySelector('.guest-countdown');
  box.hidden=currentState?.state!=='scheduled'||!remaining;if(box.hidden)return;box.querySelector('.guest-opening-date').textContent='Ouverture le '+new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Paris'}).format(new Date(currentState.opens_at));
  const units=[['days','jours'],['hours','heures'],['minutes','minutes'],['seconds','secondes']];
  if(!timer.children.length)for(const [key,label] of units){const cell=document.createElement('span');cell.innerHTML='<strong></strong><small>'+label+'</small>';cell.dataset.unit=key;timer.append(cell);}
  for(const cell of timer.children)cell.firstElementChild.textContent=String(remaining[cell.dataset.unit]).padStart(2,'0');
  if(remaining.total===0&&!openingNotified){openingNotified=true;setTimeout(()=>window.dispatchEvent(new Event('la-suite-guest-boundary')),1000);}
 }
 function render(state){
  if(welcomeEditor)body.dataset.guestView='home';else if(form.hidden&&body.dataset.guestView==='compose')body.dataset.guestView='home';
  landing.dataset.state=state.state;landing.dataset.countdown=String(state.state==='scheduled'&&Boolean(SuiteGuestCalendar.remaining(state.opens_at)));
  currentState=state;openingNotified=false;clearInterval(countdownTimer);updateCountdown();if(state.state==='scheduled')countdownTimer=setInterval(updateCountdown,1000);
  landing.querySelector('.guest-home-footer img').hidden=false;const o=window.SuiteWelcome.options(state.welcome_config),theme=window.SuiteDesign.styles.find(s=>s.id===o.style),dark=theme?.dark||false;
  const surface=dark?theme.background:getComputedStyle(body).getPropertyValue('--welcome-paper').trim();
  const luminance=c=>{const v=c.replace('#','').match(/../g)?.map(n=>{const x=parseInt(n,16)/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return v?.length===3?v[0]*.2126+v[1]*.7152+v[2]*.0722:1;};
  const a=luminance(o.color),b=luminance(surface),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),accent=ratio>=3?o.color:dark?'#eee2cc':'#514536';
  landing.dataset.dark=String(dark);landing.style.setProperty('--home-paper',dark?theme.background:'var(--welcome-paper)');landing.style.setProperty('--home-ink',dark?'#fffaf1':'#292724');landing.style.setProperty('--home-accent',accent);landing.style.setProperty('--home-button-ink',luminance(accent)>.179?'#211f1c':'#ffffff');
  const art=window.SuiteDesign.artwork(o.style,o);landing.style.setProperty('--home-art',window.SuiteDesign.logoBackground(o.style,o));body.dataset.composeDark=String(dark);for(const key of ['--home-paper','--home-ink','--home-accent','--home-button-ink','--home-art'])body.style.setProperty(key,landing.style.getPropertyValue(key));composeHeading.querySelector('p').textContent='Pour '+$('capsule-title').textContent;
  const date=state.wedding_date;$('guest-event-date').hidden=state.state==='scheduled'||state.welcome_config?.welcomeShowDate===false;$('guest-event-date').textContent=/^\d{4}-\d{2}-\d{2}$/.test(date||'')?new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Paris'}).format(new Date(date+'T12:00:00Z')):'';
  for(const b of types.children)b.hidden=form.hidden||Boolean(form.querySelector('[data-memory-type="'+b.dataset.landingType+'"]').hidden);
    landing.querySelector('.guest-home-prompt').hidden=form.hidden||Boolean(SuiteGuestCalendar.welcomeAvailable(state)&&state.welcome_message);$('guest-deposit').hidden=form.hidden;
  landing.classList.toggle('has-greeting',Boolean(SuiteGuestCalendar.welcomeAvailable(state)&&state.welcome_message));
  const divider=landing.querySelector('.guest-home-divider');divider.innerHTML=['botanique','botanical','olive'].includes(o.style)?'<svg viewBox="0 0 80 30"><path d="M8 24Q35 12 70 8M25 19Q14 3 34 12M38 14Q33 0 47 9M49 12Q55 24 63 12M34 16Q34 28 47 18"/></svg>':'<span>✧</span>';
  syncMedia();document.body.classList.remove('guest-loading','guest-load-error');landing.setAttribute('aria-busy','false');requestAnimationFrame(syncMedia);
 }
 const observer=new MutationObserver(()=>{if(!$('guest-success').hidden)body.dataset.guestView='success';});observer.observe($('guest-success'),{attributes:true,attributeFilter:['hidden']});
 $('another-memory').addEventListener('click',()=>{body.dataset.guestView='compose';window.scrollTo(0,0);});
 new MutationObserver(()=>{$('guest-deposit').hidden=form.hidden;for(const b of types.children)b.hidden=form.hidden||Boolean(form.querySelector('[data-memory-type="'+b.dataset.landingType+'"]').hidden);}).observe(form,{attributes:true,subtree:true,attributeFilter:['hidden']});
 document.fonts?.ready.then(syncMedia);
 window.addEventListener('resize',syncMedia);
 window.addEventListener('pagehide',()=>clearInterval(countdownTimer));window.SuiteGuestLanding={render,syncMedia,fail(){body.classList.remove('guest-loading');body.classList.add('guest-load-error');body.dataset.guestView='home';}};
})();





(function(){for(const footer of document.querySelectorAll('.guest-home-footer,.guest-compose-footer,.guest-success-footer')){const image=footer.querySelector('img');if(!image)continue;let link=image.closest('a');if(!link){link=document.createElement('a');link.className='guest-home-brand';image.before(link);link.append(image);}link.href='index.html#principe';link.target='_blank';link.rel='noopener';link.setAttribute('aria-label','Découvrir La Suite — La Forge à Souvenirs');}})();

