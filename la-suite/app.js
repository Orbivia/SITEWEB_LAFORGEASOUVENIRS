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
  title:String(c.print_title||"Laissez-nous un souvenir").slice(0,42),
  note:String(c.print_note||"Scannez ce code pour nous laisser un souvenir.").slice(0,80),
  explanation:String(c.print_explanation||"Vidéo, audio ou photo : choisissez la manière la plus naturelle de partager un souvenir avec nous.").slice(0,150),
  font:["elegant","classic","modern","romantic","editorial","refined","contemporary","signature"].includes(c.qr_font)?c.qr_font:"elegant",
  style:["romantic","minimal","chic"].includes(c.qr_style)?c.qr_style:"romantic",
  size:clamp(Number(c.qr_size||215),180,245),
  showInitials:c.qr_show_initials!==false
 }
}
function qrFontFamily(key){
 if(key==="classic")return"Playfair Display";
 if(key==="modern")return"Inter";
 if(key==="romantic")return"Great Vibes";
 if(key==="editorial")return"DM Serif Display";
 if(key==="refined")return"Libre Baskerville";
 if(key==="contemporary")return"Montserrat";
 if(key==="signature")return"Parisienne";
 return"Cormorant Garamond";
}
function qrFontWeight(key){
 return ["romantic","signature"].includes(key)?"400":["classic","editorial","refined"].includes(key)?"600":"700";
}
function collectQrCustomization(c){
 return {
  qr_initials:($("qr-initials-input")?.value||defaultInitials(c.couple_name)).trim().slice(0,4),
  qr_color:$("qr-color")?.value||"#b78b38",
  print_title:($("print-title")?.value||"Laissez-nous un souvenir").trim().slice(0,42),
  print_note:($("print-note")?.value||"Scannez ce code pour nous laisser un souvenir.").trim().slice(0,80),
  print_explanation:($("print-explanation")?.value||"Vidéo, audio ou photo : choisissez la manière la plus naturelle de partager un souvenir avec nous.").trim().slice(0,150),
  qr_font:$("qr-font")?.value||"elegant",
  qr_style:$("qr-style")?.value||"romantic",
  qr_size:clamp(Number($("qr-size")?.value||215),180,245),
  qr_show_initials:Boolean($("qr-show-initials")?.checked),
  qr_show_brand:true
 }
}
// The same artwork is used for the preview and the print export.
const qrThemes={
 romantic:{background:"#fff8f3",font:"elegant",accent:"#946c62"},
 minimal:{background:"#ffffff",font:"modern",accent:"#353c39"},
 chic:{background:"#f8f3e8",font:"classic",accent:"#8b713e"}
};
function qrInk(color){
 const hex=/^#[0-9a-f]{6}$/i.test(color)?color:"#b78b38";
 let rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16));
 const luminance=()=>rgb.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);
 while(luminance()>.10)rgb=rgb.map(x=>Math.floor(x*.9));
 return "#"+rgb.map(x=>x.toString(16).padStart(2,"0")).join("");
}
function makeQrCanvas(url,o){
 const holder=document.createElement("div");
 const code=new QRCode(holder,{text:url,width:512,height:512,colorDark:qrInk(o.color),colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.H});
 const model=code._oQRCode,n=model.getModuleCount(),cell=12,quiet=4;
 const canvas=document.createElement("canvas");canvas.width=canvas.height=(n+quiet*2)*cell;
 const ctx=canvas.getContext("2d");ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle=qrInk(o.color);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(model.isDark(y,x))ctx.fillRect((x+quiet)*cell,(y+quiet)*cell,cell,cell);
 return canvas;
}
function drawQrMonogram(ctx,o,cx,cy,size){
 const d=size*.17,r=d/2;
 ctx.save();ctx.translate(cx,cy);
 ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
 ctx.fillStyle=qrThemes[o.style].background;
 ctx.beginPath();ctx.arc(0,0,r*.80,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle=o.color;ctx.lineWidth=Math.max(1,size*.0018);
 if(o.style!=="minimal"){
  ctx.beginPath();ctx.arc(0,0,r*.78,0,Math.PI*2);ctx.stroke();
 }
 const letters=Array.from(o.initials.trim().toUpperCase()).slice(0,4).join("");
 ctx.fillStyle=qrInk(o.color);ctx.textAlign="center";ctx.textBaseline="middle";
 ctx.font=(o.style==="minimal"?"500 ":"600 ")+Math.round(d*(letters.length>2?.30:.40))+'px '+(o.style==="minimal"?'Inter, sans-serif':'"Cormorant Garamond", Georgia, serif');
 ctx.fillText(letters,0,d*.025,d*.66);
 ctx.restore();
}
function drawQrDecor(ctx,o,W,H){
 ctx.save();ctx.strokeStyle=o.color;ctx.fillStyle=o.color;ctx.lineWidth=2;
 if(o.style==="chic"){
  ctx.globalAlpha=.5;ctx.strokeRect(60,60,W-120,H-120);
  ctx.globalAlpha=.26;ctx.strokeRect(75,75,W-150,H-150);
  ctx.globalAlpha=.8;
  for(const [x,y,angle] of [[60,60,0],[W-60,60,Math.PI/2],[W-60,H-60,Math.PI],[60,H-60,-Math.PI/2]]){
   ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.beginPath();
   ctx.moveTo(0,95);ctx.lineTo(0,0);ctx.lineTo(95,0);
   ctx.moveTo(15,70);ctx.lineTo(15,15);ctx.lineTo(70,15);ctx.stroke();
   ctx.translate(15,15);ctx.rotate(Math.PI/4);ctx.fillRect(-4,-4,8,8);ctx.restore();
  }
 }else if(o.style==="romantic"){
  ctx.globalAlpha=.32;
  for(const [x,y,angle] of [[85,270,-.5],[W-85,H-270,Math.PI-.5]]){
   ctx.save();ctx.translate(x,y);ctx.rotate(angle);
   ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(25,-55,10,-130,44,-195);ctx.stroke();
   for(let i=0;i<6;i++){
    const y=-25-i*27,x=8+i*4,dir=i%2?1:-1;
    ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+dir*45,y-3,x+dir*45,y-28,x+dir*35,y-33);
    ctx.bezierCurveTo(x+dir*10,y-30,x+dir*5,y-10,x,y);ctx.stroke();
   }
   ctx.restore();
  }
 }
 ctx.restore();
}
function drawQrDivider(ctx,o,x,y){
 ctx.save();ctx.strokeStyle=o.color;ctx.fillStyle=o.color;ctx.lineWidth=2;
 const half=o.style==="minimal"?32:90,gap=o.style==="minimal"?0:20;
 ctx.beginPath();ctx.moveTo(x-half,y);ctx.lineTo(x-gap,y);ctx.moveTo(x+gap,y);ctx.lineTo(x+half,y);ctx.stroke();
 if(o.style==="chic"){
  ctx.translate(x,y);ctx.rotate(Math.PI/4);ctx.strokeRect(-6,-6,12,12);
 }else if(o.style==="romantic"){
  ctx.beginPath();ctx.ellipse(x-7,y,9,4,-.5,0,Math.PI*2);ctx.ellipse(x+7,y,9,4,.5,0,Math.PI*2);ctx.stroke();
 }
 ctx.restore();
}
let qrPreviewRevision=0;
function applyQrPreview(url,c){
 const o=qrOptions(c),card=$("qr-artwork-preview");
 if(!card)return;
 $("qr-size-value").textContent=o.size+" px";
 $("qr-color-value").textContent=o.color.toUpperCase();
 const revision=++qrPreviewRevision;
 const snapshot={...c};
 buildPrintCardCanvas(snapshot,url).then(canvas=>{
  if(revision!==qrPreviewRevision)return;
  const preview=$("qr-artwork-preview");
  if(preview)preview.src=canvas.toDataURL("image/png");
 }).catch(()=>show($("qr-status"),"Impossible de préparer l’aperçu. Réessayez.",false));
}
function loadCanvasImage(src){
 return new Promise((resolve,reject)=>{
  const img=new Image();
  img.onload=()=>resolve(img);
  img.onerror=reject;
  img.src=src
 })
}
function wrapCanvasLines(ctx,text,maxWidth,maxLines=6){
 const source=String(text||"").trim();
 if(!source)return[];
 const tokens=[];
 for(const word of source.split(/\s+/).filter(Boolean)){
  if(ctx.measureText(word).width<=maxWidth){tokens.push(word);continue}
  let chunk="";
  for(const char of [...word]){
   const test=chunk+char;
   if(chunk&&ctx.measureText(test).width>maxWidth){tokens.push(chunk);chunk=char}
   else chunk=test
  }
  if(chunk)tokens.push(chunk)
 }
 const lines=[];let line="";
 for(const token of tokens){
  const test=line?line+" "+token:token;
  if(line&&ctx.measureText(test).width>maxWidth){
   lines.push(line);line=token
  }else line=test
 }
 if(line)lines.push(line);
 return lines.slice(0,maxLines)
}
function drawWrappedCenteredText(ctx,text,cx,y,maxWidth,lineHeight,maxLines=6){
 const lines=wrapCanvasLines(ctx,text,maxWidth,maxLines);
 lines.forEach((line,i)=>ctx.fillText(line,cx,y+i*lineHeight));
 return y+lines.length*lineHeight
}
function fitPrintFont(ctx,text,width,lines,size,family,weight){
 while(size>16){
  ctx.font=weight+" "+size+'px '+family;
  if(wrapCanvasLines(ctx,text,width,100).length<=lines)break;
  size--;
 }
 return size;
}
async function buildPrintCardCanvas(c,url){
 const o=qrOptions(c);
 const qr=makeQrCanvas(url,o);
 if(document.fonts?.load)try{await Promise.all([document.fonts.load(qrFontWeight(o.font)+' 72px "'+qrFontFamily(o.font)+'"'),document.fonts.load('600 32px "Cormorant Garamond"'),document.fonts.load('400 25px Inter'),document.fonts.load('700 32px Inter')])}catch(e){}
 const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
 const W=1181,H=1772;canvas.width=W;canvas.height=H;
 const bg=qrThemes[o.style].background;
 ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 drawQrDecor(ctx,o,W,H);
 ctx.textAlign="center";ctx.textBaseline="alphabetic";
 const ff=qrFontFamily(o.font);
 let titleSize=["romantic","signature"].includes(o.font)?86:o.font==="contemporary"?64:o.font==="refined"?66:72;
 ctx.fillStyle="#201c1a";
 titleSize=fitPrintFont(ctx,o.title,880,3,titleSize,'"'+ff+'", serif',qrFontWeight(o.font));
 let titleY=270;
 titleY=drawWrappedCenteredText(ctx,o.title,W/2,titleY,880,titleSize*1.12,3);

 drawQrDivider(ctx,o,W/2,titleY+24);
 const qsize=Math.round(clamp(o.size,180,245)/215*500);
 const qx=Math.round((W-qsize)/2),qy=Math.max(420,Math.round(titleY+82));
 ctx.fillStyle="#ffffff";
 ctx.beginPath();ctx.roundRect(qx-28,qy-28,qsize+56,qsize+56,34);ctx.fill();
 ctx.imageSmoothingEnabled=false;
 ctx.drawImage(qr,qx,qy,qsize,qsize);
 ctx.imageSmoothingEnabled=true;

 if(o.showInitials)drawQrMonogram(ctx,o,W/2,qy+qsize/2,qsize);

 let textY=qy+qsize+92;
 ctx.fillStyle="#262220";fitPrintFont(ctx,o.note,820,3,32,"Inter, Arial, sans-serif","700");
 textY=drawWrappedCenteredText(ctx,o.note,W/2,textY,820,43,3)+20;
 ctx.fillStyle="#706964";fitPrintFont(ctx,o.explanation,790,4,25,"Inter, Arial, sans-serif","400");
 drawWrappedCenteredText(ctx,o.explanation,W/2,textY,790,38,4);


 try{
  const logo=await loadCanvasImage("assets/la-suite-logo.webp?v=20260927-hq");
  const maxW=210,maxH=94,scale=Math.min(maxW/logo.naturalWidth,maxH/logo.naturalHeight);
  const lw=Math.round(logo.naturalWidth*scale),lh=Math.round(logo.naturalHeight*scale);
  ctx.drawImage(logo,W-150-lw,H-165,lw,lh)
 }catch(e){
  ctx.textAlign="right";ctx.fillStyle="#211d1d";
  ctx.font='700 34px "Cormorant Garamond", Georgia, serif';
  ctx.fillText("La Suite",W-150,H-105)
 }
 return canvas
}
async function buildA4PrintCanvas(c,url){
 const card=await buildPrintCardCanvas(c,url);
 const page=document.createElement("canvas"),ctx=page.getContext("2d");
 const W=2480,H=3508;page.width=W;page.height=H;
 ctx.fillStyle="#ffffff";ctx.fillRect(0,0,W,H);
 const x=Math.round((W-card.width)/2),y=Math.round((H-card.height)/2);
 ctx.drawImage(card,x,y);

 ctx.save();
 ctx.strokeStyle="#a9a9a9";ctx.lineWidth=2;ctx.setLineDash([12,10]);
 ctx.strokeRect(x-2,y-2,card.width+4,card.height+4);
 ctx.setLineDash([]);
 ctx.strokeStyle="#7f7f7f";ctx.lineWidth=2;
 const m=34;
 const corners=[[x,y],[x+card.width,y],[x,y+card.height],[x+card.width,y+card.height]];
 corners.forEach(([cx,cy],idx)=>{
  const sx=idx%2===0?-1:1,sy=idx<2?-1:1;
  ctx.beginPath();ctx.moveTo(cx+sx*m,cy);ctx.lineTo(cx+sx*8,cy);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx,cy+sy*m);ctx.lineTo(cx,cy+sy*8);ctx.stroke()
 });
 ctx.restore();
 return page
}
async function downloadPrintCard(c,url){
 try{
  const page=await buildA4PrintCanvas(c,url);
  const a=document.createElement("a");
  a.download="la-suite-"+slugify(c.couple_name)+"-A4.png";
  a.href=page.toDataURL("image/png");
  a.click()
 }catch(e){show($("qr-status"),e?.message||"Impossible de préparer le fichier.",false)}
}
async function printPrintCard(c,url){
 const win=window.open("","_blank");
 if(!win)return show($("qr-status"),"Autorisez les fenêtres pop-up pour lancer l’impression.",false);
 try{
  win.document.write('<!doctype html><html><head><title>Préparation de l’impression…</title></head><body></body></html>');
  win.document.close();
  const page=await buildA4PrintCanvas(c,url);
  const data=page.toDataURL("image/png");
  win.document.open();
  win.document.write('<!doctype html><html><head><title>Imprimer La Suite</title><style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}img{display:block;width:210mm;height:297mm;object-fit:contain}</style></head><body><img src="'+data+'" alt="Carte La Suite A4"></body></html>');
  win.document.close();
  const img=win.document.querySelector("img");
  img.onload=()=>{win.focus();win.print()}
 }catch(e){
  try{win.close()}catch(_){}
  show($("qr-status"),e?.message||"Impossible de lancer l’impression.",false)
 }
}
async function saveQrCustomization(c,url,silent=false){
 const s=$("qr-status"),payload=collectQrCustomization(c);
 if(!silent)show(s,"Enregistrement…");
 const{error}=await sb.from("capsules").update(payload).eq("id",c.id);
 if(error)return show(s,"Impossible d'enregistrer : "+error.message,false);
 Object.assign(c,payload);applyQrPreview(url,c);
 if(!silent)show(s,"Personnalisation enregistrée.")
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
   <p>Personnalisez la carte et visualisez le résultat immédiatement.</p>
  </div>

 </div>

 <div class="qr-designer-grid">
  <div class="qr-designer-controls">
   <div class="qr-control-group">
    <h3>Contenu</h3>
    <div class="field"><div class="qr-field-label-row"><label for="print-title">Titre de la carte</label><span data-char-count="print-title">0 / 42</span></div><input id="print-title" maxlength="42" value="${esc(o.title)}"></div>
    <div class="field"><div class="qr-field-label-row"><label for="print-note">Petit mot</label><span data-char-count="print-note">0 / 80</span></div><textarea id="print-note" maxlength="80" rows="2">${esc(o.note)}</textarea></div>
    <div class="field"><div class="qr-field-label-row"><label for="print-explanation">Texte d'explication</label><span data-char-count="print-explanation">0 / 150</span></div><textarea id="print-explanation" maxlength="150" rows="3">${esc(o.explanation)}</textarea></div>
   </div>

   <div class="qr-control-group qr-personalization-group">
    <div class="qr-control-title">
     <div><h3>Personnalisation</h3><p>Chaque ambiance associe un fond, des ornements et une typographie. Ajustez ensuite les détails.</p></div>
    </div>

    <div class="field qr-choice-field">
     <label>Ambiance de la carte</label>
     <input id="qr-style" type="hidden" value="${esc(o.style)}">
     <div class="qr-style-choices" role="group" aria-label="Style de carte">
      <button class="qr-style-choice ${o.style==="romantic"?"is-selected":""}" data-qr-style="romantic" type="button">
       <span class="qr-style-thumb qr-style-thumb-romantic"><i></i><b>Aa</b></span>
       <span><strong>Romantique</strong><small>Ivoire rosé · feuillage</small></span>
      </button>
      <button class="qr-style-choice ${o.style==="minimal"?"is-selected":""}" data-qr-style="minimal" type="button">
       <span class="qr-style-thumb qr-style-thumb-minimal"><i></i><b>Aa</b></span>
       <span><strong>Minimal</strong><small>Blanc · lignes pures</small></span>
      </button>
      <button class="qr-style-choice ${o.style==="chic"?"is-selected":""}" data-qr-style="chic" type="button">
       <span class="qr-style-thumb qr-style-thumb-chic"><i></i><b>Aa</b></span>
       <span><strong>Chic</strong><small>Champagne · Art déco</small></span>
      </button>
     </div>
    </div>

    <div class="field qr-choice-field">
     <label>Typographie</label>
     <input id="qr-font" type="hidden" value="${esc(o.font)}">
     <div class="qr-font-picker" data-qr-font-picker>
      <button class="qr-font-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
       <span class="qr-font-current qr-font-sample-${esc(o.font)}">Julie & Thomas</span>
       <span class="qr-font-current-name">${o.font==="classic"?"Classique":o.font==="modern"?"Moderne":o.font==="romantic"?"Manuscrite":o.font==="editorial"?"Éditoriale":o.font==="refined"?"Raffinée":o.font==="contemporary"?"Contemporaine":o.font==="signature"?"Signature":"Élégante"}</span>
       <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
      </button>
      <div class="qr-font-menu" role="listbox" hidden>
       <button type="button" role="option" data-qr-font="elegant" class="${o.font==="elegant"?"is-selected":""}">
        <span class="qr-font-sample qr-font-sample-elegant">Julie & Thomas</span><small>Élégante</small>
       </button>
       <button type="button" role="option" data-qr-font="classic" class="${o.font==="classic"?"is-selected":""}">
        <span class="qr-font-sample qr-font-sample-classic">Julie & Thomas</span><small>Classique</small>
       </button>
       <button type="button" role="option" data-qr-font="modern" class="${o.font==="modern"?"is-selected":""}">
        <span class="qr-font-sample qr-font-sample-modern">Julie & Thomas</span><small>Moderne</small>
       </button>
       <button type="button" role="option" data-qr-font="romantic" class="${o.font==="romantic"?"is-selected":""}">
        <span class="qr-font-sample qr-font-sample-romantic">Julie & Thomas</span><small>Manuscrite</small>
       </button>
       <button type="button" role="option" data-qr-font="editorial" class="${o.font==="editorial"?"is-selected":""}">
        <span class="qr-font-sample qr-font-sample-editorial">Julie & Thomas</span><small>Éditoriale</small>
       </button>
       <button type="button" role="option" data-qr-font="refined" class="${o.font==="refined"?"is-selected":""}">
        <span class="qr-font-sample qr-font-sample-refined">Julie & Thomas</span><small>Raffinée</small>
       </button>
       <button type="button" role="option" data-qr-font="contemporary" class="${o.font==="contemporary"?"is-selected":""}">
        <span class="qr-font-sample qr-font-sample-contemporary">Julie & Thomas</span><small>Contemporaine</small>
       </button>
       <button type="button" role="option" data-qr-font="signature" class="${o.font==="signature"?"is-selected":""}">
        <span class="qr-font-sample qr-font-sample-signature">Julie & Thomas</span><small>Signature</small>
       </button>
      </div>
     </div>
    </div>

    <div class="field qr-choice-field">
     <div class="qr-field-label-row"><label for="qr-color">Couleur d’accent</label><span id="qr-color-value">${esc(o.color.toUpperCase())}</span></div>
     <div class="qr-color-palette">
      <button type="button" data-qr-color="#B78B38" style="--swatch:#B78B38" aria-label="Doré"></button>
      <button type="button" data-qr-color="#C10D0D" style="--swatch:#C10D0D" aria-label="Rouge La Suite"></button>
      <button type="button" data-qr-color="#9C6571" style="--swatch:#9C6571" aria-label="Rose poudré"></button>
      <button type="button" data-qr-color="#6D7B67" style="--swatch:#6D7B67" aria-label="Sauge"></button>
      <button type="button" data-qr-color="#42556D" style="--swatch:#42556D" aria-label="Bleu ardoise"></button>
      <button type="button" data-qr-color="#2D2926" style="--swatch:#2D2926" aria-label="Noir doux"></button>
      <label class="qr-custom-color" title="Couleur personnalisée">
       <input id="qr-color" type="color" value="${esc(o.color)}" aria-label="Choisir une couleur personnalisée">
       <i class="fa-solid fa-plus" aria-hidden="true"></i>
      </label>
     </div>
    </div>

    <div class="field qr-choice-field">
     <div class="qr-field-label-row"><label>Taille du QR code</label><span id="qr-size-value">${o.size} px</span></div>
     <input id="qr-size" type="hidden" value="${o.size}">
     <div class="qr-size-choices" role="group" aria-label="Taille du QR code">
      <button type="button" data-qr-size="180">Discret</button>
      <button type="button" data-qr-size="215">Équilibré</button>
      <button type="button" data-qr-size="245">Grand</button>
     </div>
    </div>

    <div class="qr-initials-card">
     <div class="field"><label for="qr-initials-input">Votre monogramme</label><input id="qr-initials-input" maxlength="4" value="${esc(o.initials)}"></div>
     <label class="qr-check qr-check-switch"><input id="qr-show-initials" type="checkbox" ${o.showInitials?"checked":""}><span>Afficher le monogramme au centre</span></label>
    </div>
   </div>


  </div>

  <div class="qr-designer-preview">
   <div class="qr-preview-sticky">
    <div class="qr-preview-label"><span>Aperçu en direct</span><strong>10 × 15 cm · Portrait</strong></div>
    <div class="qr-preview-stage">
     <img id="qr-artwork-preview" class="qr-artwork-preview" alt="Aperçu de votre carte QR personnalisée, identique à l’impression">
    </div>
    <p class="qr-preview-tip">Carte 10 × 15 cm centrée sur une feuille A4 avec repères de découpe.</p>
    <div class="qr-preview-actions">
     <button class="btn secondary" id="share-link" type="button"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i>Partager</button>
     <a class="btn secondary" id="open-guest-link" href="${esc(url)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>Voir la page invité</a>
     <button class="btn secondary" id="download-print-card" type="button"><i class="fa-solid fa-download" aria-hidden="true"></i>Télécharger A4</button>
     <button class="btn primary" id="print-print-card" type="button"><i class="fa-solid fa-print" aria-hidden="true"></i>Imprimer</button>
    </div>
    <div class="qr-print-guide">
     <h4>Pour le jour J</h4>
     <div class="qr-print-guide-grid">
      <div><i class="fa-regular fa-file-lines" aria-hidden="true"></i><span><strong>Imprimez sur A4</strong><small>Découpez ensuite la carte 10 × 15 cm grâce aux repères.</small></span></div>
      <div><i class="fa-regular fa-image" aria-hidden="true"></i><span><strong>Placez-la dans un cadre</strong><small>Un cadre 10 × 15 cm ou un petit chevalet fonctionne très bien.</small></span></div>
      <div><i class="fa-solid fa-qrcode" aria-hidden="true"></i><span><strong>Multipliez les points d’accès</strong><small>Tables, bar, livre d’or ou photobooth : plusieurs QR codes facilitent les participations.</small></span></div>
     </div>
    </div>
    <div id="qr-status" class="status"></div>
   </div>
  </div>
 </div>
</section>

<section class="qr-designer-panel intro-video-panel">
 <div class="intro-video-head">
  <div>
   <div class="eyebrow">Vidéo d'accueil</div>
   <h2>Le message vu après le scan</h2>
   <p>Cette vidéo apparaît aux invités juste après le scan du QR code.</p>
  </div>
  <span class="intro-video-limit"><i class="fa-regular fa-clock" aria-hidden="true"></i>12 s maximum</span>
 </div>
 <div class="intro-video-body">
  <div id="intro-preview-wrap"></div>
  <div class="intro-video-upload">
   <input id="intro-file" type="file" accept="video/*">
   <button id="upload-intro" class="btn primary" type="button">Enregistrer cette vidéo</button>
  </div>
  <div id="intro-status" class="status"></div>
 </div>
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

function setupQrCustomizerUi(){
 const fontInput=$("qr-font"),styleInput=$("qr-style"),colorInput=$("qr-color"),sizeInput=$("qr-size");
 const fontPicker=document.querySelector("[data-qr-font-picker]");
 const fontTrigger=fontPicker?.querySelector(".qr-font-trigger");
 const fontMenu=fontPicker?.querySelector(".qr-font-menu");
 const fontNames={elegant:"Élégante",classic:"Classique",modern:"Moderne",romantic:"Manuscrite",editorial:"Éditoriale",refined:"Raffinée",contemporary:"Contemporaine",signature:"Signature"};

 const dispatch=valueEl=>valueEl?.dispatchEvent(new Event("change",{bubbles:true}));

 const syncFont=()=>{
  if(!fontInput||!fontPicker)return;
  const value=fontInput.value||"elegant";
  fontPicker.querySelectorAll("[data-qr-font]").forEach(btn=>btn.classList.toggle("is-selected",btn.dataset.qrFont===value));
  const sample=fontPicker.querySelector(".qr-font-current");
  const name=fontPicker.querySelector(".qr-font-current-name");
  if(sample){
   sample.className="qr-font-current qr-font-sample-"+value;
   sample.textContent="Julie & Thomas"
  }
  if(name)name.textContent=fontNames[value]||fontNames.elegant
 };
 fontTrigger?.addEventListener("click",()=>{
  const open=fontMenu?.hidden!==false;
  if(fontMenu)fontMenu.hidden=!open;
  fontTrigger.setAttribute("aria-expanded",String(open))
 });
 fontPicker?.querySelectorAll("[data-qr-font]").forEach(btn=>btn.addEventListener("click",()=>{
  if(!fontInput)return;
  fontInput.value=btn.dataset.qrFont||"elegant";
  if(fontMenu)fontMenu.hidden=true;
  fontTrigger?.setAttribute("aria-expanded","false");
  syncFont();
  dispatch(fontInput)
 }));
 document.addEventListener("click",e=>{
  if(!fontPicker||fontPicker.contains(e.target))return;
  if(fontMenu)fontMenu.hidden=true;
  fontTrigger?.setAttribute("aria-expanded","false")
 });
 syncFont();

 const syncStyle=()=>{
  const value=styleInput?.value||"romantic";
  document.querySelectorAll("[data-qr-style]").forEach(btn=>{const selected=btn.dataset.qrStyle===value;btn.classList.toggle("is-selected",selected);btn.setAttribute("aria-pressed",String(selected))})
 };
 document.querySelectorAll("[data-qr-style]").forEach(btn=>btn.addEventListener("click",()=>{
  if(!styleInput)return;
  styleInput.value=btn.dataset.qrStyle||"romantic";
  const theme=qrThemes[styleInput.value];
  if(fontInput)fontInput.value=theme.font;
  if(colorInput)colorInput.value=theme.accent;
  syncFont();syncColor();
  syncStyle();
  dispatch(styleInput)
 }));
 syncStyle();

 const syncColor=()=>{
  const value=(colorInput?.value||"#b78b38").toUpperCase();
  document.querySelectorAll("[data-qr-color]").forEach(btn=>btn.classList.toggle("is-selected",(btn.dataset.qrColor||"").toUpperCase()===value));
 };
 document.querySelectorAll("[data-qr-color]").forEach(btn=>btn.addEventListener("click",()=>{
  if(!colorInput)return;
  colorInput.value=btn.dataset.qrColor||"#b78b38";
  syncColor();
  colorInput.dispatchEvent(new Event("input",{bubbles:true}))
 }));
 colorInput?.addEventListener("input",syncColor);
 syncColor();

 const syncSize=()=>{
  if(!sizeInput)return;
  const value=Number(sizeInput.value||215);
  const choices=[...document.querySelectorAll("[data-qr-size]")];
  let closest=null,delta=Infinity;
  choices.forEach(btn=>{
   const d=Math.abs(Number(btn.dataset.qrSize)-value);
   if(d<delta){delta=d;closest=btn}
  });
  choices.forEach(btn=>btn.classList.toggle("is-selected",btn===closest))
 };
 document.querySelectorAll("[data-qr-size]").forEach(btn=>btn.addEventListener("click",()=>{
  if(!sizeInput)return;
  sizeInput.value=btn.dataset.qrSize||"215";
  syncSize();
  dispatch(sizeInput)
 }));
 syncSize()
}

function setupQrTextCounters(){
 const limits={ "print-title":42, "print-note":80, "print-explanation":150 };
 Object.entries(limits).forEach(([id,max])=>{
  const el=$(id),counter=document.querySelector('[data-char-count="'+id+'"]');
  if(!el||!counter)return;
  const sync=()=>{counter.textContent=String(el.value.length)+" / "+max};
  el.addEventListener("input",sync);sync()
 })
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
 const liveIds=["print-title","print-note","print-explanation","qr-initials-input","qr-color","qr-font","qr-style","qr-size","qr-show-initials"];
 let qrSaveTimer=null;
 const updateDesigner=()=>{
   Object.assign(c,collectQrCustomization(c));
   applyQrPreview(url.href,c);
   clearTimeout(qrSaveTimer);
   qrSaveTimer=setTimeout(()=>saveQrCustomization(c,url.href,true),650);
 };
 liveIds.forEach(id=>{
   const el=$(id);if(!el)return;
   el.addEventListener("input",updateDesigner);
   el.addEventListener("change",updateDesigner);
 });
 setupQrCustomizerUi();
 setupQrTextCounters();
 $("share-link")?.addEventListener("click",()=>shareGuestLink(url.href));
 $("download-print-card")?.addEventListener("click",()=>{
   Object.assign(c,collectQrCustomization(c));
   applyQrPreview(url.href,c);
   downloadPrintCard(c,url.href);
 });
 $("print-print-card")?.addEventListener("click",()=>{
   Object.assign(c,collectQrCustomization(c));
   applyQrPreview(url.href,c);
   printPrintCard(c,url.href);
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
