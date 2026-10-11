/* Guest landing uses the existing upload form and trusted welcome presets. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),body=document.body,form=$('guest-message');
 if(!form)return;
 body.classList.add('guest-landing-ready');body.dataset.guestView='home';
 let currentState=null,countdownTimer=null,openingNotified=false;
 const main=document.querySelector('.guest-page'),hero=document.querySelector('.capsule-hero'),intro=$('intro-section');
 const landing=document.createElement('section');landing.id='guest-landing';landing.className='guest-landing';landing.setAttribute('aria-label','Accueil de la capsule');
 landing.innerHTML='<div class="guest-cover" hidden><div class="guest-cover-slot"></div><button class="guest-cover-open" type="button" aria-label="Ouvrir le message d’accueil"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7Z"/></svg></button></div><div class="guest-home-content"><p class="guest-home-label">Capsule temporelle</p><div class="guest-home-heading"></div><p id="guest-event-date"></p><div class="guest-home-divider" aria-hidden="true"></div><section class="guest-opening" hidden aria-label="Ouverture de la capsule"><h2>La capsule ouvre bientôt</h2><div class="guest-countdown" role="timer" aria-live="off"></div><p class="guest-opening-date"></p></section><p class="guest-home-principle">Déposez un souvenir aujourd’hui.<br>Il sera révélé à la date que vous choisirez.</p><div class="guest-greeting"></div><button type="button" id="guest-read-more" hidden>Lire la suite</button><h2 class="guest-home-prompt">Partagez un souvenir</h2><button type="button" id="guest-deposit" class="guest-deposit" hidden><span>Déposer un souvenir</span><span aria-hidden="true">→</span></button><div class="guest-home-types" role="group" aria-label="Choisir un souvenir"></div><div class="guest-home-state"></div><div class="guest-home-footer"><a href="index.html#principe" class="guest-home-brand" aria-label="La Suite — découvrir le concept sur La Forge à Souvenirs"><img src="assets/la-suite-logo.webp?v=20261010-forge-type" alt="La Suite — Capsule temporelle"></a></div></div>';
 const fullscreen=document.createElement('button');fullscreen.type='button';fullscreen.className='guest-fullscreen';fullscreen.setAttribute('aria-label','Afficher en plein écran');fullscreen.title='Plein écran';fullscreen.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';fullscreen.hidden=!document.fullscreenEnabled;const screenbar=document.createElement('div');screenbar.className='guest-screenbar';screenbar.append(fullscreen);main.prepend(screenbar);fullscreen.onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{fullscreen.hidden=true;}};document.addEventListener('fullscreenchange',()=>fullscreen.setAttribute('aria-label',document.fullscreenElement?'Quitter le plein écran':'Afficher en plein écran'));
 main.prepend(landing);landing.querySelector('.guest-home-heading').append(hero);
 const greeting=landing.querySelector('.guest-greeting'),cover=landing.querySelector('.guest-cover'),slot=landing.querySelector('.guest-cover-slot');
 greeting.append(intro);landing.querySelector('.guest-home-content').insertBefore(cover,greeting);landing.querySelector('.guest-home-state').append($('guest-state'),$('guest-retry'));
 const hostZone=document.createElement('div');hostZone.className='guest-host-zone';cover.before(hostZone);hostZone.append(cover,greeting);const emptyWelcome=document.createElement('div');emptyWelcome.className='guest-empty-welcome';emptyWelcome.innerHTML='<div class="guest-empty-illustration" aria-hidden="true"></div><div class="guest-empty-formats" aria-label="Formats de souvenirs disponibles"></div>';hostZone.append(emptyWelcome);
 const hostLabel=document.createElement('p');hostLabel.className='guest-host-label';hostLabel.textContent='Le mot de votre hôte';greeting.prepend(hostLabel);
 const icons={image:'<path fill-rule="evenodd" d="M8 3h8l2 3h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3Zm4 6a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"/>',video:'<rect x="1" y="5" width="14" height="14" rx="3"/><path d="m17 9 6-4v14l-6-4z"/>',audio:'<rect x="8" y="1" width="8" height="14" rx="4"/><path d="M4 10a1 1 0 0 1 2 0v2a6 6 0 0 0 12 0v-2a1 1 0 0 1 2 0v2a8 8 0 0 1-7 8v2h4v2H7v-2h4v-2a8 8 0 0 1-7-8Z"/>',text:'<path fill-rule="evenodd" d="M4 1h10v6h6v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Zm2 10v2h10v-2Zm0 5v2h10v-2Zm0 4v1h6v-1Z"/><path d="m16 1 4 4h-4Z"/>'};
 const types=landing.querySelector('.guest-home-types');
 for(const [type,label] of [['image','Photo'],['video','Vidéo'],['audio','Audio'],['text','Texte']]){
  const b=document.createElement('button');b.type='button';b.dataset.landingType=type;b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[type]+'</svg><span>'+label+'</span>';b.hidden=true;
  b.onclick=()=>{body.dataset.guestView='compose';form.querySelector('[data-memory-type="'+type+'"]').click();window.scrollTo(0,0);if(type==='text')$('message_text').focus({preventScroll:true});else form.querySelector('[data-media-mode="upload"]').focus({preventScroll:true});};types.append(b);
 }
 $('guest-deposit').onclick=()=>{body.dataset.guestView='compose';window.scrollTo(0,0);form.querySelector('[data-memory-type]:not([hidden])')?.focus({preventScroll:true});};
 const back=document.createElement('button');back.type='button';back.id='guest-home-back';back.className='btn secondary';back.textContent='← Accueil';form.before(back);
 back.onclick=()=>{if(form.querySelector('.submit-memory').disabled)return;window.dispatchEvent(new Event('la-suite-guest-home'));body.dataset.guestView='home';$('organizer-intro').pause();window.scrollTo(0,0);$('guest-deposit').focus({preventScroll:true});};
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
  if(form.hidden&&body.dataset.guestView==='compose')body.dataset.guestView='home';
  landing.dataset.state=state.state;landing.dataset.countdown=String(state.state==='scheduled'&&Boolean(SuiteGuestCalendar.remaining(state.opens_at)));
  currentState=state;openingNotified=false;clearInterval(countdownTimer);updateCountdown();if(state.state==='scheduled')countdownTimer=setInterval(updateCountdown,1000);
  landing.querySelector('.guest-home-footer img').hidden=false;const o=window.SuiteWelcome.options(state.welcome_config),theme=window.SuiteDesign.styles.find(s=>s.id===o.style),dark=theme?.dark||false;
  const surface=dark?theme.background:getComputedStyle(body).getPropertyValue('--welcome-paper').trim();
  const luminance=c=>{const v=c.replace('#','').match(/../g)?.map(n=>{const x=parseInt(n,16)/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return v?.length===3?v[0]*.2126+v[1]*.7152+v[2]*.0722:1;};
  const a=luminance(o.color),b=luminance(surface),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),accent=ratio>=3?o.color:dark?'#eee2cc':'#514536';
  landing.dataset.dark=String(dark);landing.style.setProperty('--home-paper',dark?theme.background:'var(--welcome-paper)');landing.style.setProperty('--home-ink',dark?'#fffaf1':'#292724');landing.style.setProperty('--home-accent',accent);landing.style.setProperty('--home-button-ink',luminance(accent)>.179?'#211f1c':'#ffffff');
  const art=window.SuiteDesign.artwork(o.style,o);landing.style.setProperty('--home-art',art?'url("'+art+'")':'none');
  const date=state.wedding_date;$('guest-event-date').hidden=state.state==='scheduled'||state.welcome_config?.welcomeShowDate===false;$('guest-event-date').textContent=/^\d{4}-\d{2}-\d{2}$/.test(date||'')?new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Paris'}).format(new Date(date+'T12:00:00Z')):'';
  for(const b of types.children)b.hidden=form.hidden||Boolean(form.querySelector('[data-memory-type="'+b.dataset.landingType+'"]').hidden);
    landing.querySelector('.guest-home-prompt').hidden=form.hidden||Boolean(SuiteGuestCalendar.welcomeAvailable(state)&&state.welcome_message);$('guest-deposit').hidden=form.hidden;
  landing.classList.toggle('has-greeting',Boolean(SuiteGuestCalendar.welcomeAvailable(state)&&state.welcome_message));
  const divider=landing.querySelector('.guest-home-divider');divider.innerHTML=['botanique','botanical','olive'].includes(o.style)?'<svg viewBox="0 0 80 30"><path d="M8 24Q35 12 70 8M25 19Q14 3 34 12M38 14Q33 0 47 9M49 12Q55 24 63 12M34 16Q34 28 47 18"/></svg>':'<span>✧</span>'; 
  syncMedia();document.body.classList.remove('guest-loading','guest-load-error');landing.setAttribute('aria-busy','false');requestAnimationFrame(syncMedia);
 }
 const observer=new MutationObserver(()=>{if(!$('guest-success').hidden)body.dataset.guestView='success';});observer.observe($('guest-success'),{attributes:true,attributeFilter:['hidden']});
 $('another-memory').addEventListener('click',()=>{body.dataset.guestView='home';});
 new MutationObserver(()=>{$('guest-deposit').hidden=form.hidden;for(const b of types.children)b.hidden=form.hidden||Boolean(form.querySelector('[data-memory-type="'+b.dataset.landingType+'"]').hidden);}).observe(form,{attributes:true,subtree:true,attributeFilter:['hidden']});
 document.fonts?.ready.then(syncMedia);
 window.addEventListener('resize',syncMedia);
 window.addEventListener('pagehide',()=>clearInterval(countdownTimer));window.SuiteGuestLanding={render,syncMedia,fail(){body.classList.remove('guest-loading');body.classList.add('guest-load-error');body.dataset.guestView='home';}};
})();
