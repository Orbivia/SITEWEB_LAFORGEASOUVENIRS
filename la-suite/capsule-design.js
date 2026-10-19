/* Shared, fixed artwork for the card and guest page. Uploaded backgrounds are rasterized locally. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const nativeAndroid=Boolean(window.LaSuiteAndroid||(typeof navigator!=='undefined'&&/LaSuiteOrganizer\//.test(navigator.userAgent)));
 const styles=[['nuit-etoilee','Nuit étoilée','#0b1934','#b68c39'],['gatsby','Gatsby','#073c31','#b68c39'],['botanique','Botanique','#fcf8ef','#52634d'],['fleurs','Fleurs','#fcf8ef','#95677e'],['geometrique','Géométrique','#fcf8ef','#42556d'],['or','Or','#fcf8ef','#a17832'],['aquarelle','Aquarelle','#ffffff','#74628b'],['cadeau','Cadeau','#fcf8ef','#8b2730'],['terrazzo','Terrazzo','#fcf8ef','#637363'],['retro','Rétro','#fcf8ef','#946044'],['porcelaine-bleue','Porcelaine bleue','#fcf8ef','#315889'],['olivier','Olivier méditerranéen','#fcf8ef','#52634d'],['velours-bordeaux','Velours bordeaux','#4c0916','#d8b574'],...(!nativeAndroid?[['rivage-nacre','Rivage nacré','#fbf8ef','#3b7372']]:[]),['fond-blanc','Fond blanc','#ffffff','#353c39']].map(([id,name,background,accent])=>({id,name,background,accent,font:id==='gatsby'?'classic':id==='retro'?'editorial':'elegant',badge:'plain',dark:['gatsby','nuit-etoilee','velours-bordeaux'].includes(id)}));
 const colors=[['#FFFDF7','Ivoire'],['#DFAFA9','Blush'],['#89987D','Sauge'],['#BFA88A','Sable'],['#AEA0BC','Lavande'],['#6D8FAC','Bleu'],['#8B2730','Bordeaux']];
 const position=n=>Math.max(0,Math.min(100,Number.isFinite(Number(n))?Number(n):50));
 function validBackground(value){return typeof value==='string'&&value.length<=300000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)?value:null;}
 function background(c){return validBackground(Object.hasOwn(c,'_designBackground')?c._designBackground:c.welcome_config?.background);}
 function crops(c){return Object.fromEntries(['cardX','cardY','welcomeX','welcomeY'].map(key=>[key,position(c._designCrop?.[key]??c.welcome_config?.[key])]));}
 function fields(c){return {...(background(c)?{background:background(c)}:{}),...crops(c)};}
 function artwork(style,config={}){return style==='custom'?validBackground(config.background):styles.some(s=>s.id===style)?'assets/themes/backgrounds/'+style+'.webp?v=20261018-clearance2':null;}
 function logoBackground(style,config={}){
  const art=artwork(style,config);if(!art)return 'none';
  // Preset artwork reserves its own footer; never paint a halo over the design.
  return 'url("'+art+'")';
 }
 function effectivePlan(c){return c.admin_plan_override||(['free_beta','legacy'].includes(c.activation_source)?'premium':c.plan);}
 function thumbnail(style){
  if(style==='custom')return 'assets/themes/previews/importer.webp';
  if(styles.some(s=>s.id===style))return 'assets/themes/previews/'+style+'.webp?v=20261018-clearance2';
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
  const gallery=document.querySelector('.qr-theme-gallery');gallery.setAttribute('aria-label',styles.length+' styles et import de votre design');gallery.innerHTML=styles.map(s=>'<button type="button" class="qr-style-choice" data-qr-style="'+s.id+'" aria-pressed="false"><img class="qr-theme-thumbnail" src="assets/themes/previews/'+s.id+'.webp?v=20261018-clearance2" width="256" height="256" alt=""><span class="qr-theme-name">'+s.name+'</span></button>').join('')+'<button type="button" id="design-import" class="qr-style-choice" aria-controls="design-file"><img class="qr-theme-thumbnail" src="assets/themes/previews/importer.webp" width="256" height="256" alt=""><span class="qr-theme-name">Importer mon design</span></button>';
  const custom=document.createElement('div');custom.className='design-custom';custom.innerHTML='<input id="design-file" type="file" accept="image/jpeg,image/png,image/webp" hidden><p id="design-upload-status" role="status" aria-live="polite"></p><div id="design-crop" hidden><p>Position du fond</p><label>Fiche : horizontal<input type="range" data-design-crop="cardX" min="0" max="100"></label><label>Fiche : vertical<input type="range" data-design-crop="cardY" min="0" max="100"></label><label>Accueil : horizontal<input type="range" data-design-crop="welcomeX" min="0" max="100"></label><label>Accueil : vertical<input type="range" data-design-crop="welcomeY" min="0" max="100"></label></div>';gallery.after(custom);
  const palette=document.querySelector('.qr-color-palette');palette.innerHTML=colors.map(([hex,name])=>'<button type="button" data-qr-color="'+hex+'" style="--swatch:'+hex+'" aria-label="'+name+'"><span>'+name+'</span></button>').join('')+'<label class="qr-custom-color" title="Palette personnalisée"><input id="qr-color" type="color" value="'+(/^#[0-9a-f]{6}$/i.test(c.qr_color||'')?c.qr_color:'#b78b38')+'" aria-label="Palette personnalisée"><span>Palette</span></label>';
  const menu=document.querySelector('.qr-font-menu');menu.hidden=false;menu.querySelectorAll('.qr-font-sample').forEach(e=>e.textContent=c.couple_name&&c.couple_name.length<=24?c.couple_name:'Votre événement');

  const welcome=$('organizer-welcome');welcome.open=true;welcome.querySelector('summary').addEventListener('click',e=>e.preventDefault());controls.append(welcome);controls.prepend(gallery.closest('.qr-control-group'));
  $('design-import').onclick=()=>{if(background(c)){$('qr-style').value='custom';$('qr-style').dispatchEvent(new Event('change',{bubbles:true}));$('design-crop').hidden=false;}else $('design-file').click();};
  const replace=document.createElement('button');replace.type='button';replace.className='btn secondary';replace.textContent='Changer mon fond';$('design-crop').append(replace);replace.onclick=()=>$('design-file').click();
  $('design-file').onchange=async()=>{const file=$('design-file').files[0];if(!file)return;$('design-import').disabled=true;try{if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10000000)throw Error('Choisissez une image JPG, PNG ou WebP de 10 Mo maximum.');const bitmap=await createImageBitmap(file);try{if(bitmap.width*bitmap.height>32000000)throw Error('L’image est trop grande. Choisissez une version de moins de 32 mégapixels.');const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);let data;for(const quality of [.9,.75,.6,.45,.3]){data=canvas.toDataURL('image/jpeg',quality);if(data.length<=300000)break;}if(!validBackground(data))throw Error('L’image est trop détaillée. Choisissez un fichier plus léger.');c._designBackground=data;$('qr-style').value='custom';$('qr-style').dispatchEvent(new Event('change',{bubbles:true}));$('design-crop').hidden=false;$('design-upload-status').textContent='';}finally{bitmap.close();}}catch(e){$('design-upload-status').textContent=e.message||'Impossible de lire cette image.';}finally{$('design-import').disabled=false;$('design-file').value='';}};
  custom.querySelectorAll('[data-design-crop]').forEach(input=>{input.value=crops(c)[input.dataset.designCrop];input.oninput=()=>{c._designCrop={...crops(c),[input.dataset.designCrop]:Number(input.value)};$('qr-style').dispatchEvent(new Event('change',{bubbles:true}));};});
  const sync=()=>{const style=$('qr-style').value;$('design-crop').hidden=style!=='custom';$('design-import').setAttribute('aria-pressed',String(style==='custom'));};$('qr-style').addEventListener('change',sync);sync();
  return {};
 }
 window.SuiteDesign={logoBackground,styles,colors,position,validBackground,background,fields,artwork,effectivePlan,thumbnail,mount,storage:null};
})();
