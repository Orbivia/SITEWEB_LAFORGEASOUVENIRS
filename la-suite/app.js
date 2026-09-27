(function(){
const qs=new URLSearchParams(location.search);
const cfg=window.LA_SUITE_CONFIG||{};
const configured=Boolean(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&window.supabase);
const sb=configured?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
const maxBytes=cfg.MAX_VIDEO_BYTES||100*1024*1024;
let selectedMedia=null,activeStream=null,recorder=null,recordedChunks=[];

const $=id=>document.getElementById(id);
function show(el,msg,ok=true){if(!el)return;el.textContent=msg;el.className="status show "+(ok?"ok":"err")}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function slugify(v){return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,50)}
function rid(){return Math.random().toString(36).slice(2,8)}
function fdate(v){if(!v)return"—";return new Date(String(v).length===10?v+"T12:00:00":v).toLocaleDateString("fr-FR")}
function label(t){return t==="video"?"Vidéo":t==="audio"?"Audio":t==="image"?"Image":"Texte"}
function icon(t){return t==="video"?"▶":t==="audio"?"♫":t==="image"?"▣":"✎"}
function ext(m){return({"video/mp4":"mp4","video/quicktime":"mov","video/webm":"webm","audio/webm":"webm","audio/mpeg":"mp3","audio/wav":"wav","audio/x-wav":"wav","audio/mp4":"m4a","audio/ogg":"ogg","image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/heic":"heic","image/heif":"heif"})[m]||"bin"}
function group(m){return m?.startsWith("video/")?"video":m?.startsWith("audio/")?"audio":m?.startsWith("image/")?"image":null}
async function user(){if(!sb)return null;const{data}=await sb.auth.getUser();return data?.user||null}
function stopStream(){if(activeStream){activeStream.getTracks().forEach(t=>t.stop());activeStream=null}}
function resetPreview(){if(selectedMedia?.url)URL.revokeObjectURL(selectedMedia.url);selectedMedia=null;["preview-video","preview-audio","preview-image"].forEach(id=>{const e=$(id);if(e){e.hidden=true;e.removeAttribute("src")}});if($("media-preview"))$("media-preview").hidden=true}
function preview(file,type){resetPreview();const url=URL.createObjectURL(file);selectedMedia={file,type,url};$("media-preview").hidden=false;const el=$(type==="video"?"preview-video":type==="audio"?"preview-audio":"preview-image");el.src=url;el.hidden=false}
async function countdown(el){el.hidden=false;for(let i=3;i>0;i--){el.textContent=i;await new Promise(r=>setTimeout(r,1000))}el.textContent="●";await new Promise(r=>setTimeout(r,250));el.hidden=true}
function bestMime(kind){const c=kind==="video"?["video/webm;codecs=vp8,opus","video/webm","video/mp4"]:["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg"];return c.find(x=>window.MediaRecorder&&MediaRecorder.isTypeSupported(x))||""}

async function prepareRecorder(kind){
 stopStream();
 activeStream=await navigator.mediaDevices.getUserMedia(kind==="video"?{video:{facingMode:"user"},audio:true}:{audio:true});
 if(kind==="video"){$("live-video").srcObject=activeStream;$("prepare-video").hidden=true;$("start-video").hidden=false}
 else{$("audio-indicator").textContent="Microphone activé";$("prepare-audio").hidden=true;$("start-audio").hidden=false}
}
async function startRecorder(kind){
 if(!activeStream)await prepareRecorder(kind);
 await countdown($(kind==="video"?"video-countdown":"audio-countdown"));
 recordedChunks=[];const mime=bestMime(kind);
 recorder=mime?new MediaRecorder(activeStream,{mimeType:mime}):new MediaRecorder(activeStream);
 recorder.ondataavailable=e=>{if(e.data?.size)recordedChunks.push(e.data)};
 recorder.onstop=()=>{
  const actual=recorder.mimeType||mime||(kind==="video"?"video/webm":"audio/webm");
  const file=new File([new Blob(recordedChunks,{type:actual})],"souvenir."+ext(actual),{type:actual});
  preview(file,kind);stopStream();
  if(kind==="video"){$("live-video").srcObject=null;$("prepare-video").hidden=false;$("start-video").hidden=true;$("stop-video").hidden=true}
  else{$("audio-indicator").textContent="Enregistrement terminé";$("prepare-audio").hidden=false;$("start-audio").hidden=true;$("stop-audio").hidden=true}
 };
 recorder.start();
 if(kind==="video"){$("start-video").hidden=true;$("stop-video").hidden=false}
 else{$("audio-indicator").textContent="● Enregistrement en cours";$("start-audio").hidden=true;$("stop-audio").hidden=false}
}
function stopRecorder(){if(recorder&&recorder.state!=="inactive")recorder.stop()}

async function initAuth(){
 const form=$("auth-form");if(!form)return;
 const status=$("status");
 if(!configured)return show(status,"Supabase n'est pas encore configuré.",false);
 if(await user())return setTimeout(()=>location.href="dashboard.html",200);
 form.addEventListener("submit",async e=>{
  e.preventDefault();const email=$("email").value.trim();const redirectTo=new URL("dashboard.html",location.href).href;
  show(status,"Envoi du lien de connexion…");
  const{error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo}});
  if(error)return show(status,"Impossible d'envoyer le lien : "+error.message,false);
  form.reset();show(status,"Lien envoyé. Consultez votre boîte mail.")
 })
}

async function initCreate(){
 const form=$("create-capsule");if(!form)return;
 const status=$("status"),dateInput=$("wedding_date"),dateButton=$("wedding_date_button"),emailInput=$("email"),submit=form.querySelector('button[type="submit"]');
 const draftKey="la_suite_create_draft";
 const pad=n=>String(n).padStart(2,"0");
 const iso=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
 const today=new Date();today.setHours(0,0,0,0);
 const tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);
 const minDate=iso(tomorrow);

 if(dateInput){
  dateInput.min=minDate;
  dateInput.lang="fr";
 }
 if(dateButton&&dateInput){
  dateButton.addEventListener("click",()=>{
   try{
    if(typeof dateInput.showPicker==="function")dateInput.showPicker();
    else{dateInput.focus();dateInput.click()}
   }catch(e){
    dateInput.focus();
    dateInput.click();
   }
  });
 }

 function readDraft(){
  try{
   const d=JSON.parse(localStorage.getItem(draftKey)||"null");
   if(!d||Date.now()-Number(d.saved_at||0)>24*60*60*1000){localStorage.removeItem(draftKey);return null}
   return d;
  }catch(e){localStorage.removeItem(draftKey);return null}
 }
 function validateDraft(d){
  if(!d?.couple||!d?.wedding||!d?.email)return"Complétez les champs obligatoires.";
  if(d.couple.length>50)return"Le nom de la capsule est limité à 50 caractères.";
  if(!/^\S+@\S+\.\S+$/.test(d.email))return"Adresse e-mail invalide.";
  if(d.wedding<minDate)return"Choisissez une date d'événement future.";
  return"";
 }
 async function createCapsule(d,u){
  const err=validateDraft(d);if(err)return show(status,err,false);
  if(!u)return false;
  if(submit)submit.disabled=true;
  show(status,"Création de la capsule…");
  const{data,error}=await sb.from("capsules").insert({
   owner_id:u.id,
   slug:slugify(d.couple)+"-"+rid(),
   couple_name:d.couple,
   wedding_date:d.wedding,
   welcome_message:null,
   unlock_date:null
  }).select("id,slug,guest_token").single();
  if(error){if(submit)submit.disabled=false;show(status,"Création impossible : "+error.message,false);return false}
  localStorage.removeItem(draftKey);
  location.href="dashboard.html?slug="+encodeURIComponent(data.slug);
  return true
 }

 if(!configured)return show(status,"Supabase n'est pas configuré.",false);
 const currentUser=await user();

 const pending=readDraft();
 if(qs.get("resume")==="1"&&currentUser&&pending){
  await createCapsule(pending,currentUser);
  return
 }

 form.addEventListener("submit",async e=>{
  e.preventDefault();
  const fd=new FormData(form);
  const d={
   couple:String(fd.get("couple")||"").trim(),
   wedding:String(fd.get("wedding_date")||""),
   email:String(fd.get("email")||"").trim(),
   saved_at:Date.now()
  };
  const err=validateDraft(d);if(err)return show(status,err,false);

  const u=await user();
  if(u&&String(u.email||"").toLowerCase()===d.email.toLowerCase()){
   return createCapsule(d,u)
  }
  if(u)await sb.auth.signOut();

  localStorage.setItem(draftKey,JSON.stringify(d));
  const redirectTo=new URL("create.html?resume=1",location.href).href;
  if(submit)submit.disabled=true;
  show(status,"Envoi du lien de connexion…");
  const{error}=await sb.auth.signInWithOtp({email:d.email,options:{emailRedirectTo:redirectTo}});
  if(error){
   if(submit)submit.disabled=false;
   localStorage.removeItem(draftKey);
   return show(status,"Impossible d'envoyer le lien : "+error.message,false)
  }
  show(status,"Lien envoyé. Ouvrez votre e-mail pour finaliser automatiquement la création de la capsule.")
 })
}

function initGuestControls(){
 document.querySelectorAll("[data-media-mode]").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll("[data-media-mode]").forEach(b=>b.classList.remove("active"));btn.classList.add("active");
  document.querySelectorAll(".media-panel").forEach(p=>p.classList.remove("active"));$(btn.dataset.mediaMode+"-panel").classList.add("active");stopStream()
 }));
 $("media-file")?.addEventListener("change",e=>{const f=e.target.files?.[0],t=f&&group(f.type);if(f&&t)preview(f,t)});
 $("photo-file")?.addEventListener("change",e=>{const f=e.target.files?.[0];if(f)preview(f,"image")});
 $("remove-media")?.addEventListener("click",resetPreview);
 $("prepare-video")?.addEventListener("click",()=>prepareRecorder("video").catch(()=>alert("Impossible d'accéder à la caméra.")));
 $("start-video")?.addEventListener("click",()=>startRecorder("video"));
 $("stop-video")?.addEventListener("click",stopRecorder);
 $("prepare-audio")?.addEventListener("click",()=>prepareRecorder("audio").catch(()=>alert("Impossible d'accéder au microphone.")));
 $("start-audio")?.addEventListener("click",()=>startRecorder("audio"));
 $("stop-audio")?.addEventListener("click",stopRecorder);
 const d=$("delivery_date"),now=$("deliver-now"),wrap=$("delivery-date-wrap");
 if(d)d.min=new Date().toISOString().slice(0,10);
 now?.addEventListener("change",()=>{wrap.hidden=now.checked;d.required=!now.checked})
}

async function initCapsule(){
 if(!$("capsule-title"))return;
 initGuestControls();const token=qs.get("t")||qs.get("token"),status=$("status");
 if(!configured||!token)return show(status,"Lien de capsule invalide.",false);
 const{data,error}=await sb.rpc("get_capsule_public",{p_guest_token:token});
 if(error||!data?.length){$("guest-message").hidden=true;return show(status,"Cette capsule est introuvable.",false)}
 const c=data[0];$("capsule-title").textContent=c.couple_name;$("capsule-welcome").textContent=c.welcome_message||"";
 const eventDate=c.wedding_date?new Date(c.wedding_date+"T23:59:59"):null;
 if(eventDate){
   const recordingDeadline=new Date(eventDate);
   recordingDeadline.setFullYear(recordingDeadline.getFullYear()+3);
   if(new Date()>recordingDeadline){
     $("guest-message").hidden=true;
     return show(status,"Cette capsule n'accepte plus de nouveaux souvenirs : la période de 3 ans après l'événement est terminée.",false);
   }
 }
 if(c.has_intro){
  const r=await sb.functions.invoke("guest-upload",{body:{action:"get_intro",guest_token:token}});
  if(!r.error&&r.data?.signed_url){$("organizer-intro").src=r.data.signed_url;$("intro-section").hidden=false}
 }
 $("guest-message").addEventListener("submit",async e=>{
  e.preventDefault();const name=$("guest_name").value.trim(),text=$("message_text").value.trim(),instant=$("deliver-now").checked,date=$("delivery_date").value;
  if(!name)return show(status,"Indiquez votre prénom.",false);
  if(!selectedMedia&&!text)return show(status,"Ajoutez un contenu ou un message.",false);
  if(selectedMedia?.file.size>maxBytes)return show(status,"Le fichier dépasse 100 Mo.",false);
  let deliveryAt;
  if(instant)deliveryAt=new Date().toISOString();
  else{if(!date)return show(status,"Choisissez une date de livraison.",false);deliveryAt=new Date(date+"T00:00:00").toISOString()}
  try{
   show(status,"Envoi de votre souvenir…");
   if(!selectedMedia){
    const r=await sb.functions.invoke("guest-upload",{body:{action:"submit_text",guest_token:token,guest_name:name,message_text:text,delivery_at:deliveryAt}});
    if(r.error||r.data?.error)throw new Error(r.data?.error||r.error.message)
   }else{
    const f=selectedMedia.file;
    const i=await sb.functions.invoke("guest-upload",{body:{action:"init_media",guest_token:token,guest_name:name,message_text:text,file_type:f.type,file_size:f.size,delivery_at:deliveryAt}});
    if(i.error||i.data?.error)throw new Error(i.data?.error||i.error.message);
    const up=await sb.storage.from("capsule-media").uploadToSignedUrl(i.data.path,i.data.token,f,{contentType:f.type,upsert:false});
    if(up.error)throw up.error;
    const fin=await sb.functions.invoke("guest-upload",{body:{action:"finalize_media",guest_token:token,message_id:i.data.message_id,path:i.data.path}});
    if(fin.error||fin.data?.error)throw new Error(fin.data?.error||fin.error.message)
   }
   e.target.reset();resetPreview();$("delivery-date-wrap").hidden=false;show(status,"Souvenir déposé. Il sera livré à la date choisie.")
  }catch(err){show(status,"Envoi impossible : "+(err?.message||"erreur inconnue"),false)}
 })
}

function videoDuration(file){
 return new Promise((resolve,reject)=>{
  const video=document.createElement("video"),url=URL.createObjectURL(file);
  video.preload="metadata";
  video.onloadedmetadata=()=>{const d=video.duration;URL.revokeObjectURL(url);resolve(d)};
  video.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Impossible de lire la durée de la vidéo."))};
  video.src=url;
 })
}

async function uploadIntro(c){
 const f=$("intro-file")?.files?.[0],s=$("intro-status");if(!f)return show(s,"Choisissez une vidéo.",false);
 if(!f.type.startsWith("video/"))return show(s,"Choisissez un fichier vidéo.",false);
 if(f.size>maxBytes)return show(s,"La vidéo dépasse 100 Mo.",false);
 try{
  const duration=await videoDuration(f);
  if(!Number.isFinite(duration)||duration>12.05)return show(s,"La vidéo d'accueil doit durer 12 secondes maximum.",false);
 }catch(err){return show(s,err.message||"Impossible de contrôler la durée de la vidéo.",false)}
 const path=c.id+"/organizer/intro."+ext(f.type);show(s,"Envoi de la vidéo…");
 const up=await sb.storage.from("capsule-media").upload(path,f,{contentType:f.type,upsert:true});if(up.error)return show(s,up.error.message,false);
 const{error}=await sb.from("capsules").update({intro_path:path}).eq("id",c.id);if(error)return show(s,error.message,false);
 show(s,"Vidéo d'accueil enregistrée.");setTimeout(()=>location.reload(),400)
}

function defaultInitials(name){
 const parts=String(name||"").split(/&|\+| et |\/|,/i).map(x=>x.trim()).filter(Boolean);
 if(parts.length>=2)return (parts[0][0]+parts[1][0]).toUpperCase();
 return String(name||"LS").replace(/[^A-Za-zÀ-ÿ]/g,"").slice(0,2).toUpperCase()||"LS";
}
function qrOptions(c){
 return {
  initials:(c.qr_initials||defaultInitials(c.couple_name)).slice(0,4),
  color:c.qr_color||"#c10d0d",
  note:c.print_note||"Laissez-nous un souvenir à découvrir plus tard",
  explanation:c.print_explanation||"Scannez ce QR code pour enregistrer une vidéo, un audio, une photo ou un message dans notre capsule temporelle. Aucune application nécessaire."
 }
}
function renderCustomQr(url,c){
 const box=$("qrcode");if(!box||!window.QRCode)return;
 box.innerHTML="";
 const o=qrOptions(c);
 new QRCode(box,{text:url,width:220,height:220,colorDark:o.color,colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.H});
 const badge=document.createElement("div");badge.className="qr-initials";badge.textContent=o.initials;badge.style.color=o.color;box.appendChild(badge);
}
function getQrCanvas(){return $("qrcode")?.querySelector("canvas")||null}
function wrapCanvasText(ctx,text,x,y,maxWidth,lineHeight,maxLines=8){
 const words=String(text||"").split(/\s+/);let line="",lines=[];
 for(const word of words){
  const test=line?line+" "+word:word;
  if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test;
 }
 if(line)lines.push(line);
 lines=lines.slice(0,maxLines);
 lines.forEach((l,i)=>ctx.fillText(l,x,y+i*lineHeight));
 return y+lines.length*lineHeight;
}
function loadImage(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src})}
async function downloadPrintCard(c,url){
 const qr=getQrCanvas();if(!qr)return;
 const o=qrOptions(c),canvas=document.createElement("canvas");canvas.width=1772;canvas.height=1181;
 const ctx=canvas.getContext("2d");ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle="#201b1b";ctx.font="700 70px Georgia, serif";ctx.fillText(o.note,110,135);
 ctx.fillStyle="#6f6868";ctx.font="400 30px Arial, sans-serif";wrapCanvasText(ctx,o.explanation,820,350,800,46,7);
 ctx.fillStyle=o.color;ctx.fillRect(820,575,110,8);
 ctx.fillStyle="#201b1b";ctx.font="700 28px Arial, sans-serif";ctx.fillText("VIDÉO  •  AUDIO  •  PHOTO  •  MESSAGE",820,650);
 ctx.fillStyle="#6f6868";ctx.font="400 24px Arial, sans-serif";ctx.fillText("Sans application • Scannez simplement le QR code",820,700);
 ctx.font="400 20px Arial, sans-serif";ctx.fillText("Capsule : "+c.couple_name,820,750);
 ctx.fillText("Événement : "+fdate(c.wedding_date),820,788);

 const qx=120,qy=260,qsize=590;ctx.drawImage(qr,qx,qy,qsize,qsize);
 const badgeSize=118,cx=qx+qsize/2,cy=qy+qsize/2;
 ctx.fillStyle="#ffffff";ctx.beginPath();ctx.arc(cx,cy,badgeSize/2,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle="#ffffff";ctx.lineWidth=18;ctx.stroke();
 ctx.fillStyle=o.color;ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="700 42px Arial, sans-serif";ctx.fillText(o.initials,cx,cy+2);
 ctx.textAlign="left";ctx.textBaseline="alphabetic";

 try{
  const logo=await loadImage("assets/la-suite-logo.webp");
  const ratio=logo.width/logo.height,lh=170,lw=lh*ratio;
  ctx.drawImage(logo,canvas.width-lw-90,canvas.height-lh-65,lw,lh);
 }catch(e){}
 ctx.fillStyle="#6f6868";ctx.font="400 18px Arial, sans-serif";ctx.fillText("La Suite — Capsule temporelle",110,1090);
 ctx.fillText(url,110,1124);

 const a=document.createElement("a");a.download="la-suite-"+slugify(c.couple_name)+"-15x10.png";a.href=canvas.toDataURL("image/png");a.click();
}
async function saveQrCustomization(c){
 const s=$("qr-status"),payload={
  qr_initials:$("qr-initials-input").value.trim().slice(0,4),
  qr_color:$("qr-color").value,
  print_note:$("print-note").value.trim().slice(0,120),
  print_explanation:$("print-explanation").value.trim().slice(0,320)
 };
 show(s,"Enregistrement…");
 const{error}=await sb.from("capsules").update(payload).eq("id",c.id);
 if(error)return show(s,"Impossible d'enregistrer : "+error.message,false);
 Object.assign(c,payload);renderCustomQr($("guest-link").value,c);show(s,"Personnalisation enregistrée.")
}
async function shareGuestLink(url){
 if(navigator.share){
  try{await navigator.share({title:"La Suite",text:"Déposez votre souvenir dans notre capsule temporelle.",url});return}catch(e){if(e?.name==="AbortError")return}
 }
 try{await navigator.clipboard.writeText(url);alert("Lien copié dans le presse-papiers.")}catch(e){prompt("Copiez ce lien :",url)}
}

function ownerShell(c,url,count){
 const o=qrOptions(c);
 return `
<div class="dashboard-grid organizer-grid">
<section class="card dashboard-card qr-card">
 <div class="eyebrow">Votre QR code</div><h3>${esc(c.couple_name)}</h3><p>Événement : ${esc(fdate(c.wedding_date))}</p>
 <div class="qr-wrap"><div id="qrcode" class="custom-qrcode"></div></div>
 <div class="qr-custom-fields">
  <div class="field"><label for="qr-initials-input">Initiales au centre</label><input id="qr-initials-input" maxlength="4" value="${esc(o.initials)}"></div>
  <div class="field"><label for="qr-color">Couleur d'accentuation</label><div class="color-line"><input id="qr-color" type="color" value="${esc(o.color)}"><span id="qr-color-value">${esc(o.color)}</span></div></div>
  <div class="field full"><label for="print-note">Petit mot sur la carte</label><input id="print-note" maxlength="120" value="${esc(o.note)}"></div>
  <div class="field full"><label for="print-explanation">Explication rapide</label><textarea id="print-explanation" maxlength="320">${esc(o.explanation)}</textarea></div>
 </div>
 <div class="dashboard-actions">
  <button class="btn secondary" id="save-qr" type="button">Enregistrer la personnalisation</button>
  <button class="btn secondary" id="copy-link" type="button">Copier le lien</button>
  <button class="btn secondary" id="share-link" type="button">Partager le lien</button>
  <button class="btn primary" id="download-print-card" type="button">Télécharger la carte 15 × 10 cm</button>
 </div>
 <input id="guest-link" class="share-input" readonly value="${esc(url)}">
 <div id="qr-status" class="status"></div>
</section>
<section class="card dashboard-card intro-video-card">
 <div class="eyebrow">Vidéo d'accueil</div><h3>Le message vu après le scan</h3>
 <p class="microcopy">La vidéo doit durer <strong>12 secondes maximum</strong>.</p>
 <div id="intro-preview-wrap"></div>
 <input id="intro-file" type="file" accept="video/*">
 <button id="upload-intro" class="btn secondary" type="button">Enregistrer cette vidéo</button>
 <div id="intro-status" class="status"></div>
</section>
</div>
<section class="memories-section"><div class="section-title-row"><div><div class="eyebrow">Souvenirs reçus</div><h2>${count} contenu(s)</h2></div></div><div id="memory-list" class="memory-list"></div></section>`
}

function nextCountdown(manifest){
 const next=manifest.filter(m=>!m.is_available).sort((a,b)=>new Date(a.delivery_at)-new Date(b.delivery_at))[0],box=$("next-delivery");box.hidden=false;
 if(!next){box.innerHTML="<strong>Aucun souvenir en attente</strong>";return}
 const tick=()=>{const delta=new Date(next.delivery_at)-new Date();if(delta<=0)return location.reload();const d=Math.floor(delta/86400000),h=Math.floor((delta%86400000)/3600000),m=Math.floor((delta%3600000)/60000);box.innerHTML="<span>Prochain souvenir dans</span><strong>"+(d?d+" j ":"")+h+" h "+m+" min</strong>"};tick();setInterval(tick,60000)
}

async function renderManifest(c,manifest){
 const list=$("memory-list");if(!manifest.length){list.innerHTML='<div class="notice">Aucun souvenir reçu pour le moment.</div>';return}
 const{data:rows}=await sb.from("messages").select("id,guest_name,message_text,media_type,media_path,delivery_at,created_at").eq("capsule_id",c.id);
 const map=new Map((rows||[]).map(x=>[x.id,x])),html=[];
 for(const item of manifest){
  const unlocked=item.is_available,row=map.get(item.id);let actions=unlocked?'<span class="lock-badge open">Disponible</span>':'<span class="lock-badge locked">🔒 Verrouillé</span>',content="";
  if(unlocked&&row?.media_path){
   const play=await sb.storage.from("capsule-media").createSignedUrl(row.media_path,300);
   const dl=await sb.storage.from("capsule-media").createSignedUrl(row.media_path,300,{download:true});
   if(play.data?.signedUrl){
    if(row.media_type==="video")content='<video class="memory-video" controls src="'+play.data.signedUrl+'"></video>';
    if(row.media_type==="audio")content='<audio class="memory-audio" controls src="'+play.data.signedUrl+'"></audio>';
    if(row.media_type==="image")content='<img class="memory-image" src="'+play.data.signedUrl+'" alt="Souvenir">'
   }
   if(dl.data?.signedUrl)actions+=' <a class="mini-link" href="'+dl.data.signedUrl+'">Télécharger</a>'
  }
  if(unlocked&&row?.message_text)content+='<p class="memory-text">'+esc(row.message_text)+'</p>';
  html.push('<article class="memory-row '+(unlocked?"available":"locked")+'"><div class="memory-icon">'+icon(item.media_type)+'</div><div class="memory-meta"><strong>'+esc(item.guest_name||"Invité")+'</strong><span>'+label(item.media_type)+' · livraison le '+esc(fdate(item.delivery_at))+'</span></div><div class="memory-actions">'+actions+'</div><div class="memory-content">'+content+'</div></article>')
 }
 list.innerHTML=html.join("")
}

async function initDashboard(){
 if(!$("dashboard-content"))return;
 if(!configured)return $("dashboard-content").innerHTML='<div class="notice">Supabase non configuré.</div>';
 const u=await user();if(!u)return location.href="auth.html";
 $("logout")?.addEventListener("click",async()=>{await sb.auth.signOut();location.href="index.html"});
 const{data:caps,error}=await sb.from("capsules").select("id,slug,guest_token,couple_name,wedding_date,welcome_message,intro_path,qr_initials,qr_color,print_note,print_explanation,created_at").order("created_at",{ascending:false});
 if(error)return $("dashboard-content").innerHTML='<div class="status show err">'+esc(error.message)+'</div>';
 if(!caps.length)return $("dashboard-content").innerHTML='<div class="notice">Aucune capsule. <a href="create.html"><strong>Créer une capsule</strong></a>.</div>';
 const c=(qs.get("slug")&&caps.find(x=>x.slug===qs.get("slug")))||caps[0];$("dashboard-title").textContent=c.couple_name;
 const url=new URL("capsule.html",location.href);url.search="?t="+encodeURIComponent(c.guest_token);
 const{data:manifest,error:me}=await sb.rpc("owner_message_manifest",{p_capsule_id:c.id});if(me)return $("dashboard-content").innerHTML='<div class="status show err">'+esc(me.message)+'</div>';
 $("dashboard-content").innerHTML=ownerShell(c,url.href,(manifest||[]).length);
 renderCustomQr(url.href,c);
 ["qr-initials-input","qr-color"].forEach(id=>$(id)?.addEventListener("input",()=>{
   c.qr_initials=$("qr-initials-input").value.trim().slice(0,4);
   c.qr_color=$("qr-color").value;
   $("qr-color-value").textContent=c.qr_color;
   renderCustomQr(url.href,c);
 }));
 $("save-qr")?.addEventListener("click",()=>saveQrCustomization(c));
 $("copy-link")?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(url.href);show($("qr-status"),"Lien copié.")}catch(e){prompt("Copiez ce lien :",url.href)}});
 $("share-link")?.addEventListener("click",()=>shareGuestLink(url.href));
 $("download-print-card")?.addEventListener("click",()=>{
   c.qr_initials=$("qr-initials-input").value.trim().slice(0,4);
   c.qr_color=$("qr-color").value;
   c.print_note=$("print-note").value.trim();
   c.print_explanation=$("print-explanation").value.trim();
   downloadPrintCard(c,url.href);
 });
 $("intro-file")?.addEventListener("change",async()=>{
   const f=$("intro-file")?.files?.[0];if(!f)return;
   try{
     const d=await videoDuration(f);
     if(d>12.05)show($("intro-status"),"Cette vidéo dure "+d.toFixed(1)+" s. Maximum autorisé : 12 s.",false);
     else show($("intro-status"),"Durée : "+d.toFixed(1)+" s — prête à être envoyée.");
   }catch(e){show($("intro-status"),"Impossible de lire la durée de cette vidéo.",false)}
 });
 $("upload-intro").addEventListener("click",()=>uploadIntro(c));
 if(c.intro_path){const s=await sb.storage.from("capsule-media").createSignedUrl(c.intro_path,300);if(s.data?.signedUrl)$("intro-preview-wrap").innerHTML='<video class="intro-preview" controls src="'+s.data.signedUrl+'"></video>'}
 nextCountdown(manifest||[]);await renderManifest(c,manifest||[])
}

initAuth();initCreate();initCapsule();initDashboard();
window.addEventListener("beforeunload",stopStream);
})();