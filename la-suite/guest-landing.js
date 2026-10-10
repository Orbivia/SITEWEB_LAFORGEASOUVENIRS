/* Guest landing uses the existing upload form and trusted welcome presets. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),body=document.body,form=$('guest-message');
 if(!form)return;
 body.classList.add('guest-landing-ready');body.dataset.guestView='home';
 const main=document.querySelector('.guest-page'),hero=document.querySelector('.capsule-hero'),intro=$('intro-section');
 const landing=document.createElement('section');landing.id='guest-landing';landing.className='guest-landing';landing.setAttribute('aria-label','Accueil de la capsule');
 landing.innerHTML='<div class="guest-cover" hidden><div class="guest-cover-slot"></div><button class="guest-cover-open" type="button" aria-label="Ouvrir le message d’accueil"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7Z"/></svg></button></div><div class="guest-home-content"><div class="guest-home-heading"></div><p id="guest-event-date"></p><div class="guest-home-divider" aria-hidden="true"></div><div class="guest-greeting"></div><button type="button" id="guest-read-more" hidden>Lire la suite</button><h2 class="guest-home-prompt">Partagez un souvenir</h2><button type="button" id="guest-deposit" class="guest-deposit" hidden><span>Déposer un souvenir</span><span aria-hidden="true">→</span></button><div class="guest-home-types" role="group" aria-label="Choisir un souvenir"></div><div class="guest-home-state"></div><div class="guest-home-footer"><img src="assets/la-suite-logo.webp?v=20261010-forge-type" alt="La Suite — Capsule temporelle"><p class="guest-home-privacy">Vos souvenirs restent privés.</p><button type="button" class="guest-home-concept">Le concept</button></div></div>';
 main.prepend(landing);landing.querySelector('.guest-home-heading').append(hero);
 const greeting=landing.querySelector('.guest-greeting'),cover=landing.querySelector('.guest-cover'),slot=landing.querySelector('.guest-cover-slot');
 greeting.append(intro);landing.querySelector('.guest-home-state').append($('guest-state'),$('guest-retry'));
 const icons={image:'<rect x="3" y="6" width="18" height="15" rx="3"/><path d="m8 6 2-3h4l2 3"/><circle cx="12" cy="13" r="4"/>',video:'<rect x="2" y="5" width="14" height="14" rx="3"/><path d="m16 10 6-4v12l-6-4"/>',audio:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',text:'<path d="M5 4h14M5 9h14M5 14h14M5 19h9"/>'};
 const types=landing.querySelector('.guest-home-types');
 for(const [type,label] of [['image','Photo'],['video','Vidéo'],['audio','Audio'],['text','Texte']]){
  const b=document.createElement('button');b.type='button';b.dataset.landingType=type;b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[type]+'</svg><span>'+label+'</span>';b.hidden=true;
  b.onclick=()=>{body.dataset.guestView='compose';form.querySelector('[data-memory-type="'+type+'"]').click();window.scrollTo(0,0);if(type==='text')$('message_text').focus({preventScroll:true});else form.querySelector('[data-media-mode="upload"]').focus({preventScroll:true});};types.append(b);
 }
 $('guest-deposit').onclick=()=>types.querySelector('[data-landing-type=text]:not([hidden])')?.click();
 const back=document.createElement('button');back.type='button';back.id='guest-home-back';back.className='btn secondary';back.textContent='← Accueil';form.before(back);
 back.onclick=()=>{if(form.querySelector('.submit-memory').disabled)return;window.dispatchEvent(new Event('la-suite-guest-home'));body.dataset.guestView='home';$('organizer-intro').pause();window.scrollTo(0,0);types.querySelector('button:not([hidden])')?.focus({preventScroll:true});};
 landing.querySelector('.guest-home-concept').onclick=()=>$('guest-concept-open').click();
 function openWelcome(){const dialog=$('guest-welcome-dialog');for(const media of [...slot.children])intro.append(media);dialog.append(intro);intro.hidden=false;$('organizer-intro').controls=true;dialog.showModal();}
 landing.querySelector('.guest-cover-open').onclick=openWelcome;$('guest-read-more').onclick=openWelcome;
 $('guest-welcome-dialog').addEventListener('close',()=>{greeting.append(intro);$('organizer-intro').controls=false;syncMedia();});
 function syncMedia(){
  const image=$('organizer-intro-image'),video=$('organizer-intro'),media=!image.hidden&&image.getAttribute('src')?image:!video.hidden&&video.getAttribute('src')?video:null;
  cover.hidden=!media;landing.classList.toggle('has-cover',Boolean(media));
  if(!$('guest-welcome-dialog').open){if(media)slot.append(media);for(const node of [image,video])if(node!==media)intro.append(node);video.controls=false;}
  if(!$('guest-welcome-dialog').open)intro.hidden=!$('capsule-welcome').textContent.trim();
  landing.querySelector('.guest-cover-open').setAttribute('aria-label',media===image?'Agrandir l’image d’accueil':'Lire la vidéo d’accueil');
  landing.querySelector('.guest-cover-open svg').style.display=media===image?'none':'';
  $('guest-read-more').hidden=!$('capsule-welcome').textContent.trim()||$('capsule-welcome').scrollHeight<=$('capsule-welcome').clientHeight+1;
 }
 function render(state){
  const o=window.SuiteWelcome.options(state.welcome_config),theme=window.SuiteDesign.styles.find(s=>s.id===o.style),dark=theme?.dark||false;
  const surface=dark?theme.background:getComputedStyle(body).getPropertyValue('--welcome-paper').trim();
  const luminance=c=>{const v=c.replace('#','').match(/../g)?.map(n=>{const x=parseInt(n,16)/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return v?.length===3?v[0]*.2126+v[1]*.7152+v[2]*.0722:1;};
  const a=luminance(o.color),b=luminance(surface),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),accent=ratio>=3?o.color:dark?'#eee2cc':'#514536';
  landing.dataset.dark=String(dark);landing.style.setProperty('--home-paper',dark?theme.background:'var(--welcome-paper)');landing.style.setProperty('--home-ink',dark?'#fffaf1':'#292724');landing.style.setProperty('--home-accent',accent);landing.style.setProperty('--home-button-ink',luminance(accent)>.179?'#211f1c':'#ffffff');
  const art=window.SuiteDesign.artwork(o.style,o);landing.style.setProperty('--home-art',art?'url("'+art+'")':'none');
  const date=state.wedding_date;$('guest-event-date').hidden=state.welcome_config?.welcomeShowDate===false;$('guest-event-date').textContent=/^\d{4}-\d{2}-\d{2}$/.test(date||'')?new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Paris'}).format(new Date(date+'T12:00:00Z')):'';
  for(const b of types.children)b.hidden=form.hidden||Boolean(form.querySelector('[data-memory-type="'+b.dataset.landingType+'"]').hidden);
  landing.querySelector('.guest-home-prompt').hidden=form.hidden||Boolean(state.welcome_message);$('guest-deposit').hidden=form.hidden;
  landing.classList.toggle('has-greeting',Boolean(state.welcome_message));
  const divider=landing.querySelector('.guest-home-divider');divider.innerHTML=['botanique','botanical','olive'].includes(o.style)?'<svg viewBox="0 0 80 30"><path d="M8 24Q35 12 70 8M25 19Q14 3 34 12M38 14Q33 0 47 9M49 12Q55 24 63 12M34 16Q34 28 47 18"/></svg>':'<span>✧</span>'; 
  syncMedia();requestAnimationFrame(syncMedia);
 }
 const observer=new MutationObserver(()=>{if(!$('guest-success').hidden)body.dataset.guestView='success';});observer.observe($('guest-success'),{attributes:true,attributeFilter:['hidden']});
 $('another-memory').addEventListener('click',()=>{body.dataset.guestView='home';});
 new MutationObserver(()=>{$('guest-deposit').hidden=form.hidden;for(const b of types.children)b.hidden=form.hidden||Boolean(form.querySelector('[data-memory-type="'+b.dataset.landingType+'"]').hidden);}).observe(form,{attributes:true,subtree:true,attributeFilter:['hidden']});
 document.fonts?.ready.then(syncMedia);
 window.addEventListener('resize',syncMedia);
 window.SuiteGuestLanding={render,syncMedia};
})();
