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
 const status=$("status"),dateInput=$("wedding_date"),dateDisplay=$("wedding_date_display"),dateButton=$("wedding_date_button"),emailInput=$("email"),submit=form.querySelector('button[type="submit"]');
 const draftKey="la_suite_create_draft";
 const pad=n=>String(n).padStart(2,"0");
 const iso=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
 const today=new Date();today.setHours(0,0,0,0);
 const tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);
 const minDate=iso(tomorrow);

 function parseFrDate(value){
  const m=String(value||"").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(!m)return"";
  const day=Number(m[1]),month=Number(m[2]),year=Number(m[3]);
  const d=new Date(year,month-1,day);
  if(d.getFullYear()!==year||d.getMonth()!==month-1||d.getDate()!==day)return"";
  return iso(d)
 }
 function frFromIso(value){
  const m=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?m[3]+"/"+m[2]+"/"+m[1]:""
 }
 function formatFrTyping(value){
  const digits=String(value||"").replace(/\D/g,"").slice(0,8);
  return [digits.slice(0,2),digits.slice(2,4),digits.slice(4,8)].filter(Boolean).join("/")
 }

 if(dateInput){
  dateInput.min=minDate;
  dateInput.lang="fr-FR";
  dateInput.addEventListener("change",()=>{if(dateDisplay)dateDisplay.value=frFromIso(dateInput.value)})
 }
 if(dateDisplay){
  dateDisplay.addEventListener("input",()=>{
   dateDisplay.value=formatFrTyping(dateDisplay.value);
   if(dateInput)dateInput.value=parseFrDate(dateDisplay.value)
  })
  dateDisplay.addEventListener("blur",()=>{
   const parsed=parseFrDate(dateDisplay.value);
   if(parsed&&dateInput)dateInput.value=parsed
  })
 }
 dateButton?.addEventListener("click",()=>{
  if(!dateInput)return;
  try{
   if(typeof dateInput.showPicker==="function")dateInput.showPicker();
   else dateInput.click()
  }catch(e){dateInput.click()}
 })

 function readDraft(){
  try{
   const d=JSON.parse(localStorage.getItem(draftKey)||"null");
   if(!d||Date.now()-Number(d.saved_at||0)>24*60*60*1000){localStorage.removeItem(draftKey);return null}
   return d;
  }catch(e){localStorage.removeItem(draftKey);return null}
 }
 function validateDraft(d){
  if(!d?.couple||!d?.email)return"Complétez les champs obligatoires.";
  if(d.couple.length>50)return"Le nom de la capsule est limité à 50 caractères.";
  if(!/^\S+@\S+\.\S+$/.test(d.email))return"Adresse e-mail invalide.";
  if(!d?.wedding)return"Saisissez une date valide au format JJ/MM/AAAA.";
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

 if(!configured){
  show(status,"Le service de connexion n'a pas pu être chargé. Rechargez la page.",false);
  return
 }

 const currentUser=await user();
 const pending=readDraft();
 if(qs.get("resume")==="1"&&currentUser&&pending){
  await createCapsule(pending,currentUser);
  return
 }

 form.addEventListener("submit",async e=>{
  e.preventDefault();
  e.stopPropagation();
  const fd=new FormData(form);
  const displayedDate=String(dateDisplay?.value||"").trim();
  const d={
   couple:String(fd.get("couple")||"").trim(),
   wedding:dateDisplay?parseFrDate(displayedDate):String(fd.get("wedding_date")||""),
   email:String(fd.get("email")||"").trim(),
   saved_at:Date.now()
  };
  const err=validateDraft(d);if(err)return show(status,err,false);

  localStorage.setItem(draftKey,JSON.stringify(d));
  if(submit)submit.disabled=true;

  try{
   const u=await user();

   // Ne renvoie pas inutilement un e-mail si cette adresse est déjà authentifiée.
   if(u&&String(u.email||"").toLowerCase()===d.email.toLowerCase()){
    return await createCapsule(d,u)
   }

   if(u)await sb.auth.signOut();
   show(status,"Envoi du lien sécurisé…");
   const redirectTo=new URL("create.html?resume=1",location.href).href;
   const{error}=await sb.auth.signInWithOtp({
    email:d.email,
    options:{emailRedirectTo:redirectTo,shouldCreateUser:true}
   });
   if(error)throw error;
   show(status,"Lien envoyé. Consultez votre boîte mail pour finaliser la création.");
  }catch(err){
   if(submit)submit.disabled=false;
   const msg=String(err?.message||"");
   if(/rate limit|too many requests|429/i.test(msg)){
    return show(status,"Trop de liens ont été demandés récemment. Le service e-mail Supabase a temporairement atteint sa limite. Réessayez plus tard ou utilisez une adresse déjà connectée.",false)
   }
   show(status,"Impossible d'envoyer le lien : "+(msg||"erreur inconnue"),false);
  }
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
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function qrOptions(c){
 return {
  initials:(c.qr_initials||defaultInitials(c.couple_name)).slice(0,4),
  color:c.qr_color||"#b78b38",
  title:c.print_title||"Laissez-nous un souvenir",
  note:c.print_note||"Scannez ce code pour nous laisser un souvenir.",
  explanation:c.print_explanation||"Vidéo, audio ou photo : choisissez la manière la plus naturelle de partager un souvenir avec nous.",
  font:["elegant","classic","modern","romantic"].includes(c.qr_font)?c.qr_font:"elegant",
  style:["romantic","minimal","chic"].includes(c.qr_style)?c.qr_style:"romantic",
  size:clamp(Number(c.qr_size||230),180,280),
  showInitials:c.qr_show_initials!==false,
  showBrand:c.qr_show_brand!==false
 }
}
function qrFontFamily(key){
 return key==="classic"?"Playfair Display":key==="modern"?"Inter":key==="romantic"?"Great Vibes":"Cormorant Garamond";
}
function collectQrCustomization(c){
 return {
  qr_initials:($("qr-initials-input")?.value||defaultInitials(c.couple_name)).trim().slice(0,4),
  qr_color:$("qr-color")?.value||"#b78b38",
  print_title:($("print-title")?.value||"Laissez-nous un souvenir").trim().slice(0,80),
  print_note:($("print-note")?.value||"Scannez ce code pour nous laisser un souvenir.").trim().slice(0,180),
  print_explanation:($("print-explanation")?.value||"Vidéo, audio ou photo : choisissez la manière la plus naturelle de partager un souvenir avec nous.").trim().slice(0,320),
  qr_font:$("qr-font")?.value||"elegant",
  qr_style:$("qr-style")?.value||"romantic",
  qr_size:clamp(Number($("qr-size")?.value||230),180,280),
  qr_show_initials:Boolean($("qr-show-initials")?.checked),
  qr_show_brand:Boolean($("qr-show-brand")?.checked)
 }
}
function renderCustomQr(url,c){
 const box=$("qrcode");if(!box||!window.QRCode)return;
 const o=qrOptions(c);
 box.innerHTML="";
 box.style.width=o.size+"px";
 box.style.height=o.size+"px";
 new QRCode(box,{text:url,width:o.size,height:o.size,colorDark:o.color,colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.H});
 if(o.showInitials){
  const badge=document.createElement("div");
  badge.className="qr-designer-badge";
  badge.textContent=o.initials;
  badge.style.color=o.color;
  box.appendChild(badge);
 }
}
function applyQrPreview(url,c){
 const o=qrOptions(c),card=$("qr-print-card");
 if(!card)return;
 card.className="qr-print-card qr-style-"+o.style+" qr-font-"+o.font;
 card.style.setProperty("--qr-accent",o.color);
 $("qr-preview-capsule").textContent=c.couple_name||"Votre capsule";
 $("qr-preview-title").textContent=o.title;
 $("qr-preview-note").textContent=o.note;
 $("qr-preview-explanation").textContent=o.explanation;
 $("qr-preview-brand").hidden=!o.showBrand;
 $("qr-size-value").textContent=o.size+" px";
 $("qr-color-value").textContent=o.color.toUpperCase();
 renderCustomQr(url,c)
}
function getQrCanvas(){return $("qrcode")?.querySelector("canvas")||null}
function drawWrappedCenteredText(ctx,text,cx,y,maxWidth,lineHeight,maxLines=6){
 const words=String(text||"").trim().split(/\s+/).filter(Boolean),lines=[];let line="";
 for(const word of words){
  const test=line?line+" "+word:word;
  if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test;
 }
 if(line)lines.push(line);
 const out=lines.slice(0,maxLines);
 out.forEach((l,i)=>ctx.fillText(l,cx,y+i*lineHeight));
 return y+out.length*lineHeight
}
async function downloadPrintCard(c,url){
 const qr=getQrCanvas();if(!qr)return show($("qr-status"),"QR code indisponible.",false);
 const o=qrOptions(c);
 if(document.fonts?.ready)try{await document.fonts.ready}catch(e){}
 const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
 const W=1181,H=1772;canvas.width=W;canvas.height=H;
 const bg=o.style==="minimal"?"#ffffff":o.style==="chic"?"#f8f3ea":"#fffaf3";
 ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);

 if(o.style!=="minimal"){
  ctx.strokeStyle=o.color;ctx.globalAlpha=.32;ctx.lineWidth=3;
  ctx.strokeRect(54,54,W-108,H-108);
  ctx.globalAlpha=1;
 }
 if(o.style==="romantic"){
  ctx.strokeStyle=o.color;ctx.globalAlpha=.18;ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(88,88,72,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.arc(W-88,H-88,72,0,Math.PI*2);ctx.stroke();
  ctx.globalAlpha=1;
 }

 ctx.textAlign="center";ctx.textBaseline="alphabetic";
 ctx.fillStyle="#6e665f";ctx.font='600 24px Inter, Arial, sans-serif';
 ctx.fillText(String(c.couple_name||"Votre capsule").toUpperCase(),W/2,150);

 const ff=qrFontFamily(o.font);
 ctx.fillStyle="#201c1a";
 const titleSize=o.font==="romantic"?88:72;
 ctx.font=(o.font==="romantic"?"400 ":"700 ")+titleSize+'px "'+ff+'", serif';
 let titleY=245;
 titleY=drawWrappedCenteredText(ctx,o.title,W/2,titleY,900,titleSize*.98,2);

 ctx.strokeStyle=o.color;ctx.lineWidth=4;
 ctx.beginPath();ctx.moveTo(W/2-95,titleY+18);ctx.lineTo(W/2-18,titleY+18);ctx.stroke();
 ctx.fillStyle=o.color;ctx.beginPath();ctx.arc(W/2,titleY+18,5,0,Math.PI*2);ctx.fill();
 ctx.beginPath();ctx.moveTo(W/2+18,titleY+18);ctx.lineTo(W/2+95,titleY+18);ctx.stroke();

 const qsize=Math.round(clamp(o.size,180,280)/230*560);
 const qx=Math.round((W-qsize)/2),qy=Math.max(430,Math.round(titleY+80));
 ctx.fillStyle="#ffffff";
 ctx.beginPath();ctx.roundRect(qx-28,qy-28,qsize+56,qsize+56,34);ctx.fill();
 ctx.drawImage(qr,qx,qy,qsize,qsize);

 if(o.showInitials){
  const b=Math.round(qsize*.19),cx=W/2,cy=qy+qsize/2;
  ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(cx,cy,b/2,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#fff";ctx.lineWidth=18;ctx.stroke();
  ctx.fillStyle=o.color;ctx.font='700 '+Math.round(b*.34)+'px Inter, Arial, sans-serif';
  ctx.textBaseline="middle";ctx.fillText(o.initials,cx,cy+2);ctx.textBaseline="alphabetic";
 }

 let textY=qy+qsize+105;
 ctx.fillStyle="#262220";ctx.font='700 34px Inter, Arial, sans-serif';
 textY=drawWrappedCenteredText(ctx,o.note,W/2,textY,860,46,3)+26;

 ctx.fillStyle="#706964";ctx.font='400 27px Inter, Arial, sans-serif';
 drawWrappedCenteredText(ctx,o.explanation,W/2,textY,820,42,5);

 ctx.strokeStyle="#ded4c8";ctx.lineWidth=2;
 ctx.beginPath();ctx.moveTo(175,H-205);ctx.lineTo(W-175,H-205);ctx.stroke();

 if(o.showBrand){
  ctx.fillStyle="#211d1d";
  ctx.font='700 34px "Cormorant Garamond", Georgia, serif';
  ctx.fillText("La Suite",W/2,H-135);
 }
 ctx.fillStyle="#8a8179";ctx.font='500 20px Inter, Arial, sans-serif';
 ctx.fillText("Capsule temporelle · "+fdate(c.wedding_date),W/2,H-95);

 const a=document.createElement("a");
 a.download="la-suite-"+slugify(c.couple_name)+"-10x15-portrait.png";
 a.href=canvas.toDataURL("image/png");
 a.click()
}
async function saveQrCustomization(c,url){
 const s=$("qr-status"),payload=collectQrCustomization(c);
 show(s,"Enregistrement…");
 const{error}=await sb.from("capsules").update(payload).eq("id",c.id);
 if(error)return show(s,"Impossible d'enregistrer : "+error.message,false);
 Object.assign(c,payload);applyQrPreview(url,c);show(s,"Personnalisation enregistrée.")
}
async function shareGuestLink(url){
 if(navigator.share){
  try{await navigator.share({title:"La Suite",text:"Déposez votre souvenir dans notre capsule temporelle.",url});return}catch(e){if(e?.name==="AbortError")return}
 }
 try{await navigator.clipboard.writeText(url);show($("qr-status"),"Lien copié.")}catch(e){prompt("Copiez ce lien :",url)}
}

function ownerShell(c,url,count){
 const o=qrOptions(c);
 return `
<div class="owner-panel" data-owner-panel="configuration">
<section class="qr-designer-panel">
 <div class="qr-designer-head">
  <div>
   <div class="eyebrow">Carte QR code</div>
   <h2>Personnalisez votre carte</h2>
   <p>Le rendu est mis à jour en direct. Le fichier téléchargé est au format <strong>10 × 15 cm portrait</strong>.</p>
  </div>
  <div class="qr-designer-top-actions">
   <button class="btn secondary" id="copy-link" type="button">Copier le lien</button>
   <a class="btn secondary" id="open-guest-link" href="${esc(url)}" target="_blank" rel="noopener">Ouvrir la page invité</a>
   <button class="btn primary" id="download-print-card" type="button">Télécharger la carte</button>
  </div>
 </div>

 <div class="qr-designer-grid">
  <div class="qr-designer-controls">
   <div class="qr-control-group">
    <h3>Contenu</h3>
    <div class="field"><label for="print-title">Titre de la carte</label><input id="print-title" maxlength="80" value="${esc(o.title)}"></div>
    <div class="field"><label for="print-note">Petit mot</label><textarea id="print-note" maxlength="180" rows="3">${esc(o.note)}</textarea></div>
    <div class="field"><label for="print-explanation">Texte d'explication</label><textarea id="print-explanation" maxlength="320" rows="4">${esc(o.explanation)}</textarea></div>
   </div>

   <div class="qr-control-group">
    <h3>Personnalisation</h3>
    <div class="qr-control-grid">
     <div class="field"><label for="qr-initials-input">Initiales</label><input id="qr-initials-input" maxlength="4" value="${esc(o.initials)}"></div>
     <div class="field"><label for="qr-color">Couleur d'accent</label><div class="color-line"><input id="qr-color" type="color" value="${esc(o.color)}"><span id="qr-color-value">${esc(o.color.toUpperCase())}</span></div></div>
    </div>
    <div class="field"><label for="qr-font">Typographie</label><select id="qr-font">
     <option value="elegant" ${o.font==="elegant"?"selected":""}>Élégante</option>
     <option value="classic" ${o.font==="classic"?"selected":""}>Classique</option>
     <option value="modern" ${o.font==="modern"?"selected":""}>Moderne</option>
     <option value="romantic" ${o.font==="romantic"?"selected":""}>Manuscrite</option>
    </select></div>
    <div class="field"><label for="qr-style">Style de carte</label><select id="qr-style">
     <option value="romantic" ${o.style==="romantic"?"selected":""}>Romantique</option>
     <option value="minimal" ${o.style==="minimal"?"selected":""}>Minimal</option>
     <option value="chic" ${o.style==="chic"?"selected":""}>Chic</option>
    </select></div>
    <div class="field">
     <div class="qr-range-label"><label for="qr-size">Taille du QR code</label><span id="qr-size-value">${o.size} px</span></div>
     <input id="qr-size" class="qr-range" type="range" min="180" max="280" step="10" value="${o.size}">
    </div>
    <label class="qr-check"><input id="qr-show-initials" type="checkbox" ${o.showInitials?"checked":""}><span>Afficher les initiales au centre</span></label>
    <label class="qr-check"><input id="qr-show-brand" type="checkbox" ${o.showBrand?"checked":""}><span>Afficher « La Suite » en bas de la carte</span></label>
   </div>

   <button class="btn primary qr-save-button" id="save-qr" type="button">Enregistrer la personnalisation</button>
   <button class="btn secondary qr-share-button" id="share-link" type="button">Partager le lien invité</button>
   <input id="guest-link" class="share-input" readonly value="${esc(url)}">
   <div id="qr-status" class="status"></div>
  </div>

  <div class="qr-designer-preview">
   <div class="qr-preview-sticky">
    <div class="qr-preview-label"><span>Aperçu en direct</span><strong>10 × 15 cm · Portrait</strong></div>
    <div class="qr-preview-stage">
     <div class="qr-print-card qr-style-${esc(o.style)} qr-font-${esc(o.font)}" id="qr-print-card" style="--qr-accent:${esc(o.color)}">
      <div class="qr-print-top">
       <div class="qr-print-capsule" id="qr-preview-capsule">${esc(c.couple_name)}</div>
       <h2 id="qr-preview-title">${esc(o.title)}</h2>
       <div class="qr-print-ornament"><i></i><b></b><i></i></div>
      </div>
      <div class="qr-print-main">
       <div id="qrcode" class="qr-print-code"></div>
       <h3 id="qr-preview-note">${esc(o.note)}</h3>
       <p id="qr-preview-explanation">${esc(o.explanation)}</p>
      </div>
      <div class="qr-print-footer">
       <strong id="qr-preview-brand" ${o.showBrand?"":"hidden"}>La Suite</strong>
       <span>Capsule temporelle · ${esc(fdate(c.wedding_date))}</span>
      </div>
     </div>
    </div>
    <p class="qr-preview-tip">Prête à imprimer ou à intégrer sur une table, une invitation ou un panneau.</p>
   </div>
  </div>
 </div>
</section>

<section class="card dashboard-card intro-video-card qr-followup-card">
 <div class="eyebrow">Vidéo d'accueil</div><h3>Le message vu après le scan</h3>
 <p class="microcopy">La vidéo doit durer <strong>12 secondes maximum</strong>.</p>
 <div id="intro-preview-wrap"></div>
 <input id="intro-file" type="file" accept="video/*">
 <button id="upload-intro" class="btn secondary" type="button">Enregistrer cette vidéo</button>
 <div id="intro-status" class="status"></div>
</section>

</div>

<div class="owner-panel" data-owner-panel="messages" hidden>
 <section class="owner-messages-hero">
  <div>
   <div class="eyebrow">Vos messages</div>
   <h2>Les souvenirs de vos invités</h2>
   <p>Retrouvez ici les souvenirs reçus. Ceux programmés pour plus tard restent verrouillés jusqu’à leur date de dévoilement.</p>
  </div>
  <div id="next-delivery" class="next-delivery" hidden></div>
 </section>
 <section class="memories-section">
  <div class="section-title-row">
   <div><div class="eyebrow">Souvenirs reçus</div><h2>${count} contenu(s)</h2></div>
  </div>
  <div id="memory-list" class="memory-list"></div>
 </section>
</div>`
}

function ownerUnreadCount(c,manifest){
 const seen=c?.owner_messages_seen_at?new Date(c.owner_messages_seen_at).getTime():0;
 return (manifest||[]).filter(item=>{
  const created=new Date(item.created_at).getTime();
  return Number.isFinite(created)&&created>seen
 }).length
}

function updateOwnerUnreadBadge(count){
 const badge=$("owner-unread-badge");
 if(!badge)return;
 const n=Math.max(0,Number(count)||0);
 badge.hidden=n===0;
 badge.textContent=n>99?"99+":String(n);
 badge.setAttribute("aria-label",n+" nouveau"+(n>1?"x":"")+" message"+(n>1?"s":""));
}

async function markOwnerMessagesSeen(c,manifest){
 const latest=(manifest||[]).reduce((max,item)=>{
  const t=new Date(item.created_at).getTime();
  return Number.isFinite(t)&&t>max?t:max
 },0);
 if(!latest){updateOwnerUnreadBadge(0);return}
 const current=c?.owner_messages_seen_at?new Date(c.owner_messages_seen_at).getTime():0;
 if(current>=latest){updateOwnerUnreadBadge(0);return}
 const seenAt=new Date(Math.max(Date.now(),latest)).toISOString();
 const{error}=await sb.from("capsules").update({owner_messages_seen_at:seenAt}).eq("id",c.id);
 if(!error){
  c.owner_messages_seen_at=seenAt;
  updateOwnerUnreadBadge(0)
 }
}

function setupOwnerTabs(c,manifest){
 const links=[...document.querySelectorAll("[data-owner-tab-link]")];
 const panels=[...document.querySelectorAll("[data-owner-panel]")];
 if(!links.length||!panels.length)return;

 const activate=async(name,updateHash=true)=>{
  const target=name==="messages"?"messages":"configuration";
  links.forEach(link=>{
   const active=link.dataset.ownerTabLink===target;
   link.classList.toggle("is-active",active);
   link.setAttribute("aria-current",active?"page":"false")
  });
  panels.forEach(panel=>{panel.hidden=panel.dataset.ownerPanel!==target});
  if(updateHash&&location.hash!=="#"+target)history.replaceState(null,"","#"+target);
  if(target==="messages")await markOwnerMessagesSeen(c,manifest)
 };

 links.forEach(link=>link.addEventListener("click",e=>{
  e.preventDefault();
  activate(link.dataset.ownerTabLink||"configuration")
 }));

 updateOwnerUnreadBadge(ownerUnreadCount(c,manifest));
 activate(location.hash==="#messages"?"messages":"configuration",false)
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
 const{data:caps,error}=await sb.from("capsules").select("id,slug,guest_token,couple_name,wedding_date,welcome_message,intro_path,qr_initials,qr_color,print_title,print_note,print_explanation,qr_font,qr_style,qr_size,qr_show_initials,qr_show_brand,owner_messages_seen_at,created_at").order("created_at",{ascending:false});
 if(error)return $("dashboard-content").innerHTML='<div class="status show err">'+esc(error.message)+'</div>';
 if(!caps.length)return $("dashboard-content").innerHTML='<div class="notice">Aucune capsule. <a href="create.html"><strong>Créer une capsule</strong></a>.</div>';
 const c=(qs.get("slug")&&caps.find(x=>x.slug===qs.get("slug")))||caps[0];$("dashboard-title").textContent=c.couple_name;
 const url=new URL("capsule.html",location.href);url.search="?t="+encodeURIComponent(c.guest_token);
 const{data:manifest,error:me}=await sb.rpc("owner_message_manifest",{p_capsule_id:c.id});if(me)return $("dashboard-content").innerHTML='<div class="status show err">'+esc(me.message)+'</div>';
 $("dashboard-content").innerHTML=ownerShell(c,url.href,(manifest||[]).length);
 setupOwnerTabs(c,manifest||[]);
 applyQrPreview(url.href,c);
 const liveIds=["print-title","print-note","print-explanation","qr-initials-input","qr-color","qr-font","qr-style","qr-size","qr-show-initials","qr-show-brand"];
 const updateDesigner=()=>{
   Object.assign(c,collectQrCustomization(c));
   applyQrPreview(url.href,c);
 };
 liveIds.forEach(id=>{
   const el=$(id);if(!el)return;
   el.addEventListener("input",updateDesigner);
   el.addEventListener("change",updateDesigner);
 });
 $("save-qr")?.addEventListener("click",()=>saveQrCustomization(c,url.href));
 $("copy-link")?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(url.href);show($("qr-status"),"Lien copié.")}catch(e){prompt("Copiez ce lien :",url.href)}});
 $("share-link")?.addEventListener("click",()=>shareGuestLink(url.href));
 $("download-print-card")?.addEventListener("click",()=>{
   Object.assign(c,collectQrCustomization(c));
   applyQrPreview(url.href,c);
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