/* Shared, fixed artwork for the card and guest page. Uploaded backgrounds are rasterized locally. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const styles=[['gatsby','Gatsby','#073c31','#b68c39'],['nuit-etoilee','Nuit étoilée','#0b1934','#b68c39'],['botanique','Botanique','#fcf8ef','#52634d'],['fleurs','Fleurs','#fcf8ef','#95677e'],['geometrique','Géométrique','#fcf8ef','#42556d'],['or','Or','#fcf8ef','#a17832'],['aquarelle','Aquarelle','#ffffff','#74628b'],['cadeau','Cadeau','#fcf8ef','#8b2730'],['fond-blanc','Fond blanc','#ffffff','#353c39'],['terrazzo','Terrazzo','#fcf8ef','#637363'],['retro','Rétro','#fcf8ef','#946044']].map(([id,name,background,accent])=>({id,name,background,accent,font:id==='gatsby'?'classic':id==='retro'?'editorial':'elegant',badge:'plain',dark:['gatsby','nuit-etoilee'].includes(id)}));
 const colors=[['#FFFDF7','Ivoire'],['#DFAFA9','Blush'],['#89987D','Sauge'],['#BFA88A','Sable'],['#AEA0BC','Lavande'],['#6D8FAC','Bleu'],['#8B2730','Bordeaux']];
 const position=n=>Math.max(0,Math.min(100,Number.isFinite(Number(n))?Number(n):50));
 function validBackground(value){return typeof value==='string'&&value.length<=300000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)?value:null;}
 function background(c){return validBackground(Object.hasOwn(c,'_designBackground')?c._designBackground:c.welcome_config?.background);}
 function crops(c){return Object.fromEntries(['cardX','cardY','welcomeX','welcomeY'].map(key=>[key,position(c._designCrop?.[key]??c.welcome_config?.[key])]));}
 function fields(c){return {...(background(c)?{background:background(c)}:{}),...crops(c)};}
 function artwork(style,config={}){return style==='custom'?validBackground(config.background):styles.some(s=>s.id===style)?'assets/themes/backgrounds/'+style+'.webp?v=20261009-border1':null;}
 function effectivePlan(c){return c.admin_plan_override||(['free_beta','legacy'].includes(c.activation_source)?'premium':c.plan);}
 function thumbnail(style){
  if(style==='custom')return 'assets/themes/previews/importer.webp';
  if(styles.some(s=>s.id===style))return 'assets/themes/previews/'+style+'.webp';
  const legacy=['minimal','editorial','signature','chic','palace','arch','botanical','olive','pressed','romantic','boho','seaside','riviera','dolce','confetti','celestial','pearl'];
  return legacy.includes(style)?'assets/themes/'+style+'.webp':'assets/themes/previews/fond-blanc.webp';
 }
 function introUrlCache(storage){
  let path=null,url=null,signedAt=0,pending=null;
  return async nextPath=>{
   if(nextPath!==path){path=nextPath;url=null;pending=null;}
   if(!nextPath)return null;
   if(url&&Date.now()-signedAt<240000)return url;
   if(!pending){
    const requestedAt=Date.now();
    const request=storage.from('capsule-media').createSignedUrl(nextPath,300).then(({data,error})=>{
     if(error||!data?.signedUrl)throw Error('Accueil indisponible');
     if(path===nextPath&&pending===request){url=data.signedUrl;signedAt=requestedAt;}
     return data.signedUrl;
    }).finally(()=>{if(pending===request)pending=null;});
    pending=request;
   }
   return pending;
  };
 }
 function mount(c){
  document.body.classList.add('collection-ready','studio-ready');
  const panel=document.querySelector('.qr-designer-panel'),controls=document.querySelector('.qr-designer-controls'),preview=document.querySelector('.qr-designer-preview');
  panel.querySelector('h2').textContent='Personnaliser ma capsule';
  const nav=document.createElement('div');nav.className='design-mobile-tabs';nav.innerHTML='<button type="button" data-design-view="settings" aria-pressed="true">Personnaliser</button><button type="button" data-design-view="preview" aria-pressed="false">Aperçu</button>';panel.querySelector('.qr-designer-head').after(nav);
  let scroll=0;const view=name=>{if(name==='preview')scroll=window.scrollY;panel.dataset.designView=name;const stage=document.querySelector('.activation-panel');if(stage&&matchMedia('(max-width:760px)').matches){if(name==='preview')preview.append(stage);else controls.insertBefore(stage,controls.querySelector('.design-mobile-footer'));}window.SuiteOrganizerLayout?.placeActivation?.();nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.designView===name)));if(matchMedia('(max-width:760px)').matches)window.scrollTo({top:name==='settings'?scroll:Math.max(0,panel.getBoundingClientRect().top+window.scrollY-document.querySelector('.forge-style-header').offsetHeight-8),behavior:'instant'});};nav.querySelectorAll('button').forEach(b=>b.onclick=()=>view(b.dataset.designView));view('settings');
  const gallery=document.querySelector('.qr-theme-gallery');gallery.setAttribute('aria-label','11 styles et import de votre design');gallery.innerHTML=styles.map(s=>'<button type="button" class="qr-style-choice" data-qr-style="'+s.id+'" aria-pressed="false"><img class="qr-theme-thumbnail" src="assets/themes/previews/'+s.id+'.webp?v=20261009-border1" width="256" height="256" alt=""><span class="qr-theme-name">'+s.name+'</span></button>').join('')+'<button type="button" id="design-import" class="qr-style-choice" aria-controls="design-file"><img class="qr-theme-thumbnail" src="assets/themes/previews/importer.webp" width="256" height="256" alt=""><span class="qr-theme-name">Importer mon design</span></button>';
  const custom=document.createElement('div');custom.className='design-custom';custom.innerHTML='<input id="design-file" type="file" accept="image/jpeg,image/png,image/webp" hidden><p id="design-upload-status" role="status" aria-live="polite"></p><div id="design-crop" hidden><p>Position du fond</p><label>Fiche : horizontal<input type="range" data-design-crop="cardX" min="0" max="100"></label><label>Fiche : vertical<input type="range" data-design-crop="cardY" min="0" max="100"></label><label>Accueil : horizontal<input type="range" data-design-crop="welcomeX" min="0" max="100"></label><label>Accueil : vertical<input type="range" data-design-crop="welcomeY" min="0" max="100"></label></div>';gallery.after(custom);
  const palette=document.querySelector('.qr-color-palette');palette.innerHTML=colors.map(([hex,name])=>'<button type="button" data-qr-color="'+hex+'" style="--swatch:'+hex+'" aria-label="'+name+'"><span>'+name+'</span></button>').join('')+'<label class="qr-custom-color" title="Palette personnalisée"><input id="qr-color" type="color" value="'+(/^#[0-9a-f]{6}$/i.test(c.qr_color||'')?c.qr_color:'#b78b38')+'" aria-label="Palette personnalisée"><span>Palette</span></label>';
  const menu=document.querySelector('.qr-font-menu');menu.hidden=false;menu.querySelectorAll('.qr-font-sample').forEach(e=>e.textContent=c.couple_name&&c.couple_name.length<=24?c.couple_name:'Votre événement');

  const welcome=$('organizer-welcome');welcome.open=true;welcome.querySelector('summary').addEventListener('click',e=>e.preventDefault());controls.append(welcome);controls.prepend(gallery.closest('.qr-control-group'));
  const tabs=document.createElement('div');tabs.className='design-preview-tabs';tabs.innerHTML='<button type="button" data-design-preview="card" aria-pressed="true">Fiche QR</button><button type="button" data-design-preview="welcome" aria-pressed="false">Accueil invités</button>';preview.querySelector('.qr-preview-label').before(tabs);
  const guest=document.createElement('iframe');guest.id='design-welcome-preview';guest.title='Aperçu de l’accueil des invités';guest.hidden=true;guest.src='capsule.html?preview=1';preview.querySelector('.qr-preview-stage').append(guest);
  let selected='card',ready=false,loadVersion=0,previewError=false;
  const signedIntro=introUrlCache(window.SuiteDesign.storage);
  const refresh=async()=>{
   const revision=++loadVersion;if(!ready||!guest.isConnected)return;
   try{
    const path=c.intro_path,introUrl=await signedIntro(path);
    if(revision!==loadVersion||!guest.isConnected||path!==c.intro_path)return;
    if(previewError){const status=$('design-upload-status');if(status)status.textContent='';previewError=false;}
    const config=window.SuiteWelcome.collectShared?.()||c.welcome_config;
    guest.contentWindow.postMessage({type:'la-suite-guest-preview',capsule:{couple_name:$('capsule-name')?.value||c.couple_name,wedding_date:$('capsule-date')?.value||c.wedding_date,welcome_message:$('intro-text')?.value??c.welcome_message,welcome_config:config,effective_plan:effectivePlan(c),delivery_before:c.usage?.delivery_before||new Date(Date.now()+900*86400000).toISOString(),has_intro:Boolean(introUrl),preview_intro_url:introUrl,preview_intro_type:/\.(jpg|jpeg|png|webp)$/i.test(path||'')?'image':'video'}},location.origin);
   }catch{if(revision===loadVersion&&guest.isConnected){const status=$('design-upload-status');if(status)status.textContent='L’aperçu de l’accueil n’a pas chargé. Réessayez.';previewError=true;}}
  };
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&selected==='welcome')refresh();});
  window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===guest.contentWindow&&event.data?.type==='la-suite-guest-preview-ready'){ready=true;refresh();}});
  tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=b.dataset.designPreview;guest.hidden=selected!=='welcome';$('qr-artwork-preview').hidden=selected!=='card';tabs.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));refresh();});
  controls.addEventListener('input',refresh);controls.addEventListener('change',refresh);
  $('design-import').onclick=()=>{if(background(c)){$('qr-style').value='custom';$('qr-style').dispatchEvent(new Event('change',{bubbles:true}));$('design-crop').hidden=false;}else $('design-file').click();};
  const replace=document.createElement('button');replace.type='button';replace.className='btn secondary';replace.textContent='Changer mon fond';$('design-crop').append(replace);replace.onclick=()=>$('design-file').click();
  $('design-file').onchange=async()=>{const file=$('design-file').files[0];if(!file)return;$('design-import').disabled=true;try{if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10000000)throw Error('Choisissez une image JPG, PNG ou WebP de 10 Mo maximum.');const bitmap=await createImageBitmap(file);try{if(bitmap.width*bitmap.height>32000000)throw Error('L’image est trop grande. Choisissez une version de moins de 32 mégapixels.');const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);let data;for(const quality of [.9,.75,.6,.45,.3]){data=canvas.toDataURL('image/jpeg',quality);if(data.length<=300000)break;}if(!validBackground(data))throw Error('L’image est trop détaillée. Choisissez un fichier plus léger.');c._designBackground=data;$('qr-style').value='custom';$('qr-style').dispatchEvent(new Event('change',{bubbles:true}));$('design-crop').hidden=false;$('design-upload-status').textContent='';}finally{bitmap.close();}}catch(e){$('design-upload-status').textContent=e.message||'Impossible de lire cette image.';}finally{$('design-import').disabled=false;$('design-file').value='';}};
  custom.querySelectorAll('[data-design-crop]').forEach(input=>{input.value=crops(c)[input.dataset.designCrop];input.oninput=()=>{c._designCrop={...crops(c),[input.dataset.designCrop]:Number(input.value)};$('qr-style').dispatchEvent(new Event('change',{bubbles:true}));};});
  matchMedia('(max-width:760px)').addEventListener('change',event=>{const stage=document.querySelector('.activation-panel');if(!stage)return;if(event.matches)view(panel.dataset.designView);else controls.append(stage);window.SuiteOrganizerLayout?.placeActivation?.();});
  const sync=()=>{const style=$('qr-style').value;$('design-crop').hidden=style!=='custom';$('design-import').setAttribute('aria-pressed',String(style==='custom'));};$('qr-style').addEventListener('change',sync);sync();
  return {refresh};
 }
 window.SuiteDesign={styles,colors,position,validBackground,background,fields,artwork,effectivePlan,thumbnail,mount,storage:null};
})();
