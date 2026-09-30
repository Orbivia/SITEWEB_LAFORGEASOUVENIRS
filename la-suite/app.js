(function(){
const qs=new URLSearchParams(location.search);
const cfg=window.LA_SUITE_CONFIG||{};
const configured=Boolean(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&window.supabase);
const sb=configured?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
const maxBytes=cfg.MAX_VIDEO_BYTES||100*1024*1024;
let selectedMedia=null,activeStream=null,recorder=null,recordedChunks=[];
const organizerState={qr:false,intro:false,settings:false,saving:0,error:false};
let qrSaveQueue=Promise.resolve(),introSavePending=null,introPreviewUrl=null,countdownTimer=null;
function memoryCountLabel(value){const n=Number(value)||0;return n+" souvenir"+(n>1?"s":"")+" reçu"+(n>1?"s":"")}
function organizerDirty(){return organizerState.qr||organizerState.intro||organizerState.settings}
function saveIndicator(){
 const el=$("organizer-save-state");if(!el)return;
 el.textContent=organizerState.saving?"Enregistrement…":organizerState.error?"Enregistrement incomplet. Réessayez.":organizerDirty()?"Modifications non enregistrées":"Tout est enregistré";
 const retry=$("save-organizer");if(retry)retry.textContent=organizerState.error?"Réessayer l’enregistrement":"Tout enregistrer";
 el.dataset.state=organizerState.error?"error":organizerDirty()?"pending":"saved";
}
function markDirty(part){organizerState[part]=true;organizerState.error=false;saveIndicator()}
window.addEventListener("beforeunload",e=>{if(organizerDirty()||organizerState.saving){e.preventDefault();e.returnValue=""}});


const $=id=>document.getElementById(id);
function show(el,msg,ok=true){if(!el)return;el.textContent=msg;el.className="status show "+(ok?"ok":"err")}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function slugify(v){return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,50)}
function rid(){return Math.random().toString(36).slice(2,8)}
function fdate(v){if(!v)return"—";return new Date(String(v).length===10?v+"T12:00:00":v).toLocaleDateString("fr-FR")}
function label(t){return t==="video"?"Vidéo":t==="audio"?"Audio":t==="image"?"Image":"Texte"}
function icon(t){return t==="video"?"▶":t==="audio"?"♫":t==="image"?"▣":"✎"}
function ext(m){m=m?.split(";")[0];return({"video/mp4":"mp4","video/quicktime":"mov","video/webm":"webm","audio/webm":"webm","audio/mpeg":"mp3","audio/wav":"wav","audio/x-wav":"wav","audio/mp4":"m4a","audio/ogg":"ogg","image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/heic":"heic","image/heif":"heif"})[m]||"bin"}
function group(m){return m?.startsWith("video/")?"video":m?.startsWith("audio/")?"audio":m?.startsWith("image/")?"image":null}
async function user(){if(!sb)return null;const{data}=await sb.auth.getUser();return data?.user||null}
function stopStream(){if(activeStream){activeStream.getTracks().forEach(t=>t.stop());activeStream=null}}
function resetPreview(){if(selectedMedia?.url)URL.revokeObjectURL(selectedMedia.url);selectedMedia=null;["preview-video","preview-audio","preview-image"].forEach(id=>{const e=$(id);if(e){e.hidden=true;e.removeAttribute("src")}});if($("media-preview"))$("media-preview").hidden=true}
function preview(file,type){resetPreview();const url=URL.createObjectURL(file);selectedMedia={file,type,url};$("media-preview").hidden=false;const el=$(type==="video"?"preview-video":type==="audio"?"preview-audio":"preview-image");el.src=url;el.hidden=false}
async function countdown(el){el.hidden=false;for(let i=3;i>0;i--){el.textContent=i;await new Promise(r=>setTimeout(r,1000))}el.textContent="●";await new Promise(r=>setTimeout(r,250));el.hidden=true}
function bestMime(kind){const c=kind==="video"?["video/webm;codecs=vp8,opus","video/webm","video/mp4"]:["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg"];return c.find(x=>window.MediaRecorder&&MediaRecorder.isTypeSupported(x))||""}


let recorderTimer=null,recorderStarted=0,recorderPreparing=false,recorderGeneration=0;
async function prepareRecorder(kind){
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error("Enregistrement indisponible");
 stopStream();const generation=recorderGeneration;
 const stream=await navigator.mediaDevices.getUserMedia(kind==="video"?{video:{facingMode:"user",width:{ideal:1280},height:{ideal:720}},audio:true}:{audio:true});
 if(generation!==recorderGeneration){stream.getTracks().forEach(t=>t.stop());return}
 activeStream=stream;
 if(kind==="video"){$("live-video").srcObject=activeStream;$("prepare-video").hidden=true;$("start-video").hidden=false}
 else{$("audio-indicator").textContent="Microphone activé";$("prepare-audio").hidden=true;$("start-audio").hidden=false}
}
async function startRecorder(kind){
 if(recorderPreparing||recorder?.state==="recording")return;
 recorderPreparing=true;const generation=recorderGeneration;
 $("start-"+kind).disabled=true;
 try{
  if(!activeStream)await prepareRecorder(kind);
  await countdown($(kind==="video"?"video-countdown":"audio-countdown"));
  if(generation!==recorderGeneration||!activeStream)return;
  recordedChunks=[];const mime=bestMime(kind),options={audioBitsPerSecond:64000};
  if(mime)options.mimeType=mime;if(kind==="video")options.videoBitsPerSecond=1500000;
  const current=new MediaRecorder(activeStream,options);recorder=current;recorderStarted=Date.now();let bytes=0;
  current.ondataavailable=e=>{if(e.data?.size){recordedChunks.push(e.data);bytes+=e.data.size;if(bytes>=GUEST_LIMITS[kind]*0.95&&current.state==="recording")current.stop()}};
  current.onstop=()=>{
   clearInterval(recorderTimer);const duration=Math.min((Date.now()-recorderStarted)/1000,kind==="video"?60:180);
   const actual=(current.mimeType||mime||(kind==="video"?"video/webm":"audio/webm")).split(";")[0];
   const file=new File([new Blob(recordedChunks,{type:actual})],"souvenir."+ext(actual),{type:actual});
   stopStream();if(kind==="video")$("live-video").srcObject=null;
   $("prepare-"+kind).hidden=false;$("start-"+kind).hidden=true;$("stop-"+kind).hidden=true;
   $(kind+"-countdown").hidden=true;
   if(generation===recorderGeneration&&guestType===kind)acceptGuestFile(file,kind,duration);
  };
  current.start(500);
  $("start-"+kind).hidden=true;$("stop-"+kind).hidden=false;
  const durationLimit=kind==="video"?60:180,clock=$(kind+"-countdown");clock.hidden=false;
  recorderTimer=setInterval(()=>{
   const left=Math.max(0,durationLimit-Math.floor((Date.now()-recorderStarted)/1000));
   clock.textContent="● "+Math.floor(left/60)+":"+String(left%60).padStart(2,"0")+" restantes";
   if(kind==="audio")$("audio-indicator").textContent="Enregistrement en cours";
   if(left===0)stopRecorder();
  },250);
 }finally{recorderPreparing=false;$("start-"+kind).disabled=false}
}
function stopRecorder(){clearInterval(recorderTimer);if(recorder&&recorder.state!=="inactive")recorder.stop()}

const PLAN_NAMES={photo:"Essentiel",audio:"Plus",premium:"Premium"};
const PLAN_PRICES={photo:"9,90 €",audio:"14,90 €",premium:"24,90 €"};
function authDestination(){return qs.get("next")==="create"?"create.html?resume=1":"dashboard.html"}
async function initAuth(){
 const form=$("auth-form");if(!form)return;
 const status=$("status"),submit=form.querySelector('[type="submit"]');
 if(!configured)return show(status,"Le service de connexion est indisponible. Rechargez la page.",false);
 let mode=qs.get("mode")==="signup"?"signup":qs.get("mode")==="recovery"?"recovery":"login";
 function render(){
  const recovery=mode==="recovery",reset=mode==="reset";
  $("auth-title").textContent=({login:"Bienvenue dans votre espace",signup:"Créez votre compte",reset:"Retrouver votre accès",recovery:"Choisissez votre mot de passe"})[mode];
  $("auth-description").textContent=reset?"Recevez un lien pour définir ou réinitialiser votre mot de passe.":recovery?"Utilisez au moins 10 caractères pour sécuriser votre espace.":"Retrouvez vos capsules, personnalisez-les et partagez vos souvenirs.";
  $("email-field").hidden=recovery;$("email").required=!recovery;
  $("password-field").hidden=reset;$("password").required=!reset;
  $("password").minLength=mode==="login"?1:10;$("password").autocomplete=mode==="login"?"current-password":"new-password";
  $("password-confirm-field").hidden=!(recovery||mode==="signup");$("password-confirm").required=recovery||mode==="signup";
  submit.textContent=({login:"Me connecter",signup:"Créer mon compte",reset:"Recevoir le lien",recovery:"Enregistrer mon mot de passe"})[mode];
  $("auth-options").hidden=false;
  $("resend-confirmation").hidden=true;
  show(status,"");
 }
 render();
 sb.auth.onAuthStateChange(event=>{if(event==="PASSWORD_RECOVERY"){mode="recovery";render()}});
 $("resend-confirmation").addEventListener("click",async()=>{
  const button=$("resend-confirmation");button.disabled=true;
  try{const{error}=await sb.auth.resend({type:"signup",email:$("email").value.trim(),options:{emailRedirectTo:new URL(authDestination(),location.href).href}});if(error)throw error;show(status,"Un nouveau lien de confirmation a été demandé. Vérifiez votre boîte mail et les indésirables.")}catch(e){show(status,"Envoi impossible. Patientez quelques minutes avant de réessayer.",false)}finally{button.disabled=false}
 });
 document.querySelectorAll('[data-auth-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.authMode;render()}));
 if(qs.get("next")==="create")try{const d=JSON.parse(localStorage.getItem("la_suite_create_draft")||"null");if(d?.email)$("email").value=d.email}catch(e){}
 const authError=new URLSearchParams(location.hash.slice(1)).get("error_description");
 if(authError)show(status,"Ce lien n’est plus valide. Demandez un nouveau lien avec « Mot de passe oublié / première connexion ».",false);
 const initial=await user();
 if(initial&&mode!=="recovery")return location.href=authDestination();
 form.addEventListener("submit",async e=>{
  e.preventDefault();submit.disabled=true;
  const email=$("email").value.trim(),password=$("password").value;
  try{
   if((mode==="signup"||mode==="recovery")&&password!==$("password-confirm").value)throw new Error("Les mots de passe ne correspondent pas.");
   let result;
   if(mode==="reset"){
    result=await sb.auth.resetPasswordForEmail(email,{redirectTo:new URL("auth.html?mode=recovery",location.href).href});
    if(result.error)throw result.error;
    return show(status,"Si cette adresse est associée à un compte, un lien vous sera envoyé. Pensez à vérifier les indésirables.");
   }
   if(mode==="recovery"){
    result=await sb.auth.updateUser({password});if(result.error)throw result.error;
    location.href=authDestination();return;
   }
   if(mode==="signup"){
    result=await sb.auth.signUp({email,password,options:{emailRedirectTo:new URL(authDestination(),location.href).href}});
    if(result.error)throw result.error;
    if(!result.data.session){$("resend-confirmation").hidden=false;$("password").value="";$("password-confirm").value="";return show(status,"Consultez votre boîte mail pour confirmer votre adresse, puis connectez-vous. Votre préparation est conservée 24 h dans ce navigateur. Si vous avez déjà un compte, utilisez « J’ai déjà un compte ».")}
   }else{
    result=await sb.auth.signInWithPassword({email,password});if(result.error)throw result.error;
   }
   location.href=authDestination();
  }catch(err){
   const msg=String(err?.message||"");
   show(status,/Invalid login/i.test(msg)?"E-mail ou mot de passe incorrect.":/Email not confirmed/i.test(msg)?"Confirmez votre adresse avec le lien reçu par e-mail.":/rate limit|too many/i.test(msg)?"Trop de tentatives. Patientez quelques minutes avant de réessayer.":/session missing|expired|invalid.*token/i.test(msg)?"Ce lien a expiré. Demandez un nouveau lien depuis « Mot de passe oublié ».":msg||"Connexion impossible. Réessayez.",false);
  }finally{submit.disabled=false}
 });
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
  const existing=await sb.from("capsules").select("slug").eq("id",d.id).maybeSingle();
  if(existing.data){localStorage.removeItem(draftKey);location.href="dashboard.html?slug="+encodeURIComponent(existing.data.slug);return true}
  const{data,error}=await sb.from("capsules").insert({
   id:d.id,
   plan:PLAN_NAMES[d.plan]?d.plan:"premium",
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
 if(currentUser){emailInput.value=currentUser.email;emailInput.readOnly=true;$("email-help").textContent="Cette capsule sera enregistrée dans votre compte."}
 if(pending){$("couple").value=pending.couple;dateInput.value=pending.wedding;dateDisplay.value=frFromIso(pending.wedding);if(!currentUser)emailInput.value=pending.email}
 $("plan").value=PLAN_NAMES[qs.get("plan")]?qs.get("plan"):(pending?.plan||"premium");
 if(qs.get("resume")==="1"&&currentUser&&pending){
  pending.id=pending.id||crypto.randomUUID();
  localStorage.setItem(draftKey,JSON.stringify(pending));
  await createCapsule(pending,currentUser);
  return
 }

 form.addEventListener("submit",async e=>{
  e.preventDefault();
  e.stopPropagation();
  const fd=new FormData(form);
  const displayedDate=String(dateDisplay?.value||"").trim();
  const d={
   id:readDraft()?.id||crypto.randomUUID(),
   plan:$("plan").value,
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

   if(u)return await createCapsule(d,u);
   location.href="auth.html?mode=signup&next=create";
  }catch(err){
   if(submit)submit.disabled=false;
   const msg=String(err?.message||"");
   if(/rate limit|too many requests|429/i.test(msg)){
    return show(status,"Trop de liens ont été demandés récemment. Le service e-mail Supabase a temporairement atteint sa limite. Réessayez plus tard ou utilisez une adresse déjà connectée.",false)
   }
   show(status,"Impossible de continuer : "+(msg||"erreur inconnue"),false);
  }
 })
}


let guestState=null,guestType="image",guestBusy=false,guestTransaction=null,guestSelectionVersion=0;
const GUEST_LIMITS={image:10000000,audio:20000000,video:50000000};
function parisDay(value=new Date()){
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(value);
 return ["year","month","day"].map(k=>parts.find(p=>p.type===k).value).join("-");
}
function addMonthsClamped(day,months){
 const [y,m,d]=day.split("-").map(Number),last=new Date(Date.UTC(y,m-1+months+1,0)).getUTCDate();
 return new Date(Date.UTC(y,m-1+months,Math.min(d,last))).toISOString().slice(0,10);
}
async function guestInvoke(body){
 const r=await sb.functions.invoke("guest-upload",{body});
 if(r.error||r.data?.error){
  let message=r.data?.error;
  if(!message&&r.error?.context?.json)try{message=(await r.error.context.json()).error}catch(e){}
  throw new Error(message||"Connexion interrompue. Votre souvenir reste sur cette page : réessayez.");
 }
 return r.data;
}
function setGuestMode(mode){
 stopRecorder();stopStream();recorderGeneration++;
 document.querySelectorAll(".media-panel").forEach(p=>p.classList.remove("active"));
 $(mode+"-panel")?.classList.add("active");
 document.querySelectorAll("[data-media-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mediaMode===mode));
 ["video","audio"].forEach(k=>{$("prepare-"+k).hidden=false;$("start-"+k).hidden=true;$("stop-"+k).hidden=true});
}
function chooseGuestType(type){
 guestType=type;guestSelectionVersion++;resetPreview();guestTransaction=null;
 if(!guestBusy)$("guest-message").querySelector('[type="submit"]').disabled=false;show($("status"),"");
 document.querySelectorAll("[data-memory-type]").forEach(b=>{const selected=b.dataset.memoryType===type;b.classList.toggle("active",selected);b.setAttribute("aria-pressed",String(selected))});
 $("capture-choices").hidden=type==="text";$("message_text").required=type==="text";
 $("message-label").innerHTML=type==="text"?"Votre petit mot":'Un petit mot <span class="optional">(facultatif)</span>';
 $("message_text").placeholder=type==="text"?"Écrivez ce que vous aimeriez leur dire…":"Quelques mots pour accompagner votre souvenir…";
 const capture=$("capture-memory");capture.dataset.mediaMode=type==="image"?"photo":type;
 capture.textContent=type==="image"?"Prendre une photo":type==="audio"?"M’enregistrer":"Me filmer";
 $("media-file").accept=type==="image"?"image/jpeg,image/png,image/webp,image/heic,image/heif":type==="audio"?"audio/webm,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg":"video/mp4,video/quicktime,video/webm";
 $("media-file").value="";$("photo-file").value="";
 $("file-help").textContent=type==="image"?"Photo · 10 Mo maximum.":type==="audio"?"Audio · 3 minutes et 20 Mo maximum.":"Vidéo · 1 minute et 50 Mo maximum.";
 setGuestMode(type==="text"?"text":"upload");
}
async function optimizeGuestPhoto(file){
 if(!["image/jpeg","image/png","image/webp"].includes(file.type))return file;
 const img=new Image(),url=URL.createObjectURL(file);
 try{
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error("Cette image ne peut pas être lue. Choisissez une autre photo."));img.src=url});
  const scale=Math.min(1,2048/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.88));
  if(!blob)throw new Error("Impossible de préparer cette photo.");
  return new File([blob],"souvenir.jpg",{type:"image/jpeg"});
 }finally{URL.revokeObjectURL(url)}
}
function guestMediaDuration(file){
 return new Promise((resolve,reject)=>{
  const media=document.createElement(file.type.startsWith("audio/")?"audio":"video"),url=URL.createObjectURL(file);
  const timeout=setTimeout(()=>finish(new Error("La durée de ce fichier est illisible. Essayez un autre fichier ou enregistrez directement ici.")),10000);
  function finish(error){clearTimeout(timeout);media.removeAttribute("src");URL.revokeObjectURL(url);error?reject(error):resolve(media.duration)}
  media.preload="metadata";media.onloadedmetadata=()=>Number.isFinite(media.duration)&&media.duration>0?finish():finish(new Error("La durée de ce fichier est illisible. Enregistrez directement ici."));
  media.onerror=()=>finish(new Error("Ce fichier ne peut pas être lu. Essayez un autre format."));media.src=url;
 });
}
async function acceptGuestFile(file,type,duration){
 const version=++guestSelectionVersion;resetPreview();guestTransaction=null;
 if(!file)return;
 try{
  $("guest-message").querySelector('[type="submit"]').disabled=true;show($("status"),"Préparation de votre souvenir…");
  const normalizedType=file.type.split(";")[0];if(group(normalizedType)!==type)throw new Error("Choisissez un fichier correspondant au type de souvenir sélectionné.");
  if(file.size>GUEST_LIMITS[type])throw new Error(type==="image"?"La photo dépasse 10 Mo.":type==="audio"?"L’audio dépasse 20 Mo.":"La vidéo dépasse 50 Mo.");
  if(type==="image")file=await optimizeGuestPhoto(file);
  else{duration=duration||await guestMediaDuration(file);if(duration>(type==="video"?60.1:180.1))throw new Error(type==="video"?"Choisissez une vidéo d’une minute maximum.":"Choisissez un audio de 3 minutes maximum.")}
  if(version!==guestSelectionVersion)return;
  if(file.size>GUEST_LIMITS[type])throw new Error("Ce souvenir dépasse la taille autorisée.");
  if(normalizedType!==file.type&&type!=="image")file=new File([file],file.name,{type:normalizedType});
  preview(file,type);selectedMedia.duration=duration;show($("status"),"Votre souvenir est prêt.");
 }catch(error){if(version===guestSelectionVersion)show($("status"),error.message,false)}
 finally{if(version===guestSelectionVersion)$("guest-message").querySelector('[type="submit"]').disabled=false}
}
function chooseDelivery(choice){
 const now=choice==="now";$("deliver-now").checked=now;$("delivery-date-wrap").hidden=choice!=="custom";$("delivery_date").required=!now;
 document.querySelectorAll("[data-delivery]").forEach(b=>{const active=b.dataset.delivery===choice;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active))});
 if(now)$("delivery_date").value="";
 else if(choice!=="custom")$("delivery_date").value=addMonthsClamped(parisDay(),Number(choice));
 else{$("delivery_date").focus()}
 updateDeliveryHelp();guestTransaction=null;
}
function updateDeliveryHelp(){
 $("delivery-help").textContent=$("deliver-now").checked?"Votre souvenir sera accessible dès son envoi.":$("delivery_date").value?"Il restera secret jusqu’au "+fdate($("delivery_date").value)+".":"Choisissez une date. Votre souvenir restera secret jusqu’à ce jour.";
}
function initGuestControls(){
 document.querySelectorAll("[data-memory-type]").forEach(b=>b.addEventListener("click",()=>{if(!guestBusy)chooseGuestType(b.dataset.memoryType)}));
 document.querySelectorAll("[data-media-mode]").forEach(b=>b.addEventListener("click",()=>{if(!guestBusy)setGuestMode(b.dataset.mediaMode)}));
 $("media-file").addEventListener("change",e=>acceptGuestFile(e.target.files?.[0],guestType));
 $("photo-file").addEventListener("change",e=>acceptGuestFile(e.target.files?.[0],"image"));
 $("remove-media").addEventListener("click",()=>{guestSelectionVersion++;resetPreview();guestTransaction=null;$("media-file").value="";$("photo-file").value="";show($("status"),"")});
 for(const kind of ["video","audio"]){
  $("prepare-"+kind).addEventListener("click",()=>prepareRecorder(kind).catch(()=>show($("status"),"Autorisez l’accès "+(kind==="video"?"à la caméra":"au microphone")+", ou choisissez un fichier.",false)));
  $("start-"+kind).addEventListener("click",()=>startRecorder(kind).catch(()=>show($("status"),"L’enregistrement n’a pas démarré. Réessayez ou choisissez un fichier.",false)));
  $("stop-"+kind).addEventListener("click",stopRecorder);
 }
 document.querySelectorAll("[data-delivery]").forEach(b=>b.addEventListener("click",()=>chooseDelivery(b.dataset.delivery)));
 $("delivery_date").addEventListener("change",()=>{guestTransaction=null;updateDeliveryHelp()});
 $("delivery_date").min=parisDay();
 window.addEventListener("beforeunload",e=>{if(guestBusy||selectedMedia||$("message_text")?.value.trim()){e.preventDefault();e.returnValue=""}});
 window.addEventListener("pagehide",()=>{stopRecorder();stopStream()});
}
function renderGuestState(state){
 const el=$("guest-state");const messages={
 scheduled:"Les dépôts ouvriront le "+fdate(state.opens_at)+", le jour de l’événement.",
 closed:"Les dépôts sont terminés. Les souvenirs déjà envoyés seront dévoilés aux dates choisies.",
 expired:"La période de conservation de cette capsule est terminée.",
 missing_date:"Cette capsule n’est pas encore prête à recevoir des souvenirs.",
 full:"La capsule est pleine pour les fichiers. Vous pouvez toujours laisser un petit mot.",
 open:state.legacy?"Vous pouvez laisser un souvenir dans cette capsule.":"Les dépôts sont ouverts jusqu’au "+fdate(new Date(new Date(state.closes_at).getTime()-1000).toISOString())+" à minuit, heure de Paris."
 };
 el.textContent=messages[state.state]||"Cette capsule n’est pas disponible.";el.dataset.state=state.state;
 $("guest-message").hidden=!["open","full"].includes(state.state);
 const allowed=state.effective_plan==="photo"?["image","text"]:state.effective_plan==="audio"?["image","audio","text"]:["image","audio","video","text"];
 document.querySelectorAll("[data-memory-type]").forEach(b=>b.hidden=!allowed.includes(b.dataset.memoryType)||(state.state==="full"&&b.dataset.memoryType!=="text"));
 if(!allowed.includes(guestType)||state.state==="full")chooseGuestType("text");
 const max=parisDay(new Date(new Date(state.delivery_before).getTime()-1000));$("delivery_date").max=max;
 document.querySelectorAll("[data-delivery]").forEach(b=>{if(/^\d+$/.test(b.dataset.delivery))b.hidden=addMonthsClamped(parisDay(),Number(b.dataset.delivery))>max});
}
function uploadGuestFile(file,transaction){
 if(transaction.uploaded)return Promise.resolve();
 if(!window.tus)throw new Error("Le service d’envoi n’a pas chargé. Gardez cette page ouverte et réessayez.");
 return new Promise((resolve,reject)=>{
  const progress=$("upload-progress");progress.hidden=false;
  if(!transaction.upload){
   const endpoint=cfg.SUPABASE_URL.replace(".supabase.co",".storage.supabase.co")+"/storage/v1/upload/resumable";
   transaction.upload=new tus.Upload(file,{endpoint,headers:{"x-signature":transaction.reserved.token,apikey:cfg.SUPABASE_ANON_KEY,"x-upsert":"false"},
    chunkSize:6*1024*1024,uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,retryDelays:[0,1000,3000,5000],
    fingerprint:()=>Promise.resolve("la-suite:"+transaction.requestId),
    metadata:{bucketName:"capsule-media",objectName:transaction.reserved.path,contentType:file.type,cacheControl:"3600"}});
  }
  transaction.upload.options.onProgress=(sent,total)=>{const percent=Math.round(sent/total*100);progress.value=percent;show($("status"),"Envoi de votre souvenir : "+percent+" %. Gardez cette page ouverte.")};
  transaction.upload.options.onError=()=>reject(new Error("L’envoi a été interrompu. Gardez cette page ouverte et appuyez sur Réessayer pour le reprendre."));
  transaction.upload.options.onSuccess=()=>{transaction.uploaded=true;resolve()};
  transaction.upload.start();
 });
}
async function initCapsule(){
 if(!$("capsule-title"))return;
 const token=qs.get("t")||qs.get("token");
 if(!configured||!token){$("guest-state").textContent="Lien de capsule invalide.";return}
 initGuestControls();chooseGuestType("image");
 try{
  guestState=await guestInvoke({action:"get_status",guest_token:token});
  $("capsule-title").textContent=guestState.couple_name;$("capsule-welcome").textContent=guestState.welcome_message||"";
  $("capsule-welcome").hidden=!guestState.welcome_message;$("intro-section").hidden=!guestState.welcome_message;
  renderGuestState(guestState);
  if(guestState.has_intro&&guestState.state!=="expired")guestInvoke({action:"get_intro",guest_token:token}).then(r=>{
   if(r.signed_url){const media=$(r.media_type==="image"?"organizer-intro-image":"organizer-intro");media.src=r.signed_url;media.hidden=false;$("intro-section").hidden=false}
  }).catch(()=>{});
 }catch(error){$("guest-state").textContent=error.message;return}
 $("another-memory").addEventListener("click",async()=>{
  $("guest-success").hidden=true;$("guest-message").hidden=false;chooseGuestType("image");chooseDelivery("now");show($("status"),"");
  try{guestState=await guestInvoke({action:"get_status",guest_token:token});renderGuestState(guestState)}catch(error){$("guest-state").textContent=error.message}
  $("guest-state").scrollIntoView({behavior:"smooth",block:"start"});
 });
 $("guest-message").addEventListener("submit",async e=>{
  e.preventDefault();if(guestBusy)return;
  const name=$("guest_name").value.trim(),text=$("message_text").value.trim(),instant=$("deliver-now").checked,date=$("delivery_date").value,status=$("status");
  if(recorder?.state==="recording"||recorderPreparing)return show(status,"Terminez votre enregistrement avant l’envoi.",false);
  if(guestType!=="text"&&!selectedMedia)return show(status,"Ajoutez votre souvenir, ou choisissez « Petit mot ».",false);
  if(guestType==="text"&&!text)return show(status,"Écrivez votre petit mot.",false);
  if(!instant&&(!date||date<$("delivery_date").min||date>$("delivery_date").max))return show(status,"Choisissez une date entre aujourd’hui et le "+fdate($("delivery_date").max)+".",false);
  const key=JSON.stringify([name,text,instant,date,selectedMedia?.url]);
  if(!guestTransaction||guestTransaction.key!==key)guestTransaction={key,requestId:crypto.randomUUID(),delivery:instant?new Date().toISOString():date};
  const transaction=guestTransaction,button=e.target.querySelector('[type="submit"]');
  const fields=[...e.target.querySelectorAll("input,textarea,button")],disabled=fields.map(f=>f.disabled);
  guestBusy=true;fields.forEach(f=>f.disabled=true);button.textContent="Envoi en cours…";$("upload-progress").value=0;
  try{
   show(status,"Préparation de l’envoi…");
   if(guestType==="text"){
    await guestInvoke({action:"submit_text",guest_token:token,request_id:transaction.requestId,guest_name:name,message_text:text,delivery_at:transaction.delivery});
   }else{
    const f=selectedMedia.file;
    if(!transaction.reserved)transaction.reserved=await guestInvoke({action:"init_media",guest_token:token,request_id:transaction.requestId,guest_name:name,message_text:text,file_type:f.type,file_size:f.size,duration_seconds:selectedMedia.duration,delivery_at:transaction.delivery});
    if(!transaction.reserved.complete){
     await uploadGuestFile(f,transaction);
     show(status,"Votre fichier est reçu. Confirmation du souvenir…");
     await guestInvoke({action:"finalize_media",guest_token:token,message_id:transaction.reserved.message_id,path:transaction.reserved.path});
    }
   }
   $("guest-success-date").textContent=instant?"Les organisateurs peuvent déjà le découvrir.":"Il restera secret jusqu’au "+fdate(date)+".";
   e.target.reset();resetPreview();guestTransaction=null;$("guest-message").hidden=true;$("guest-success").hidden=false;$("guest-success").focus();$("guest-success").scrollIntoView({behavior:"smooth",block:"center"});
  }catch(error){show(status,error.message,false);button.textContent="Réessayer l’envoi"}
  finally{guestBusy=false;fields.forEach((f,i)=>f.disabled=disabled[i]);$("upload-progress").hidden=true;if(!$("guest-success").hidden)button.textContent="Envoyer mon souvenir"}
 });
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

function introKind(c){return c.intro_path?(/\.(jpg|jpeg|png|webp)$/i.test(c.intro_path)?"image":"video"):c.welcome_message?"text":"none"}
async function renderIntroPreview(c){
 const wrap=$("intro-preview-wrap");if(!wrap)return;
 wrap.replaceChildren();
 if(c.welcome_message){const text=document.createElement("p");text.className="intro-text-preview";text.textContent=c.welcome_message;wrap.append(text)}
 if(!c.intro_path)return;
 const{data,error}=await sb.storage.from("capsule-media").createSignedUrl(c.intro_path,300);
 if(error||!data?.signedUrl){wrap.append(document.createTextNode("Aperçu indisponible. Votre répondeur reste enregistré."));return}
 const media=document.createElement(introKind(c)==="image"?"img":"video");media.className="intro-preview";media.src=data.signedUrl;
 if(media.tagName==="IMG")media.alt="Votre image d’accueil";else{media.controls=true;media.playsInline=true}
 wrap.append(media);
}
function uploadIntro(c){
 if(introSavePending)return introSavePending;
 introSavePending=performIntroSave(c).finally(()=>introSavePending=null);return introSavePending;
}
async function performIntroSave(c){
 const kind=$("intro-kind").value,f=$("intro-file")?.files?.[0],s=$("intro-status"),button=$("upload-intro");
 const text=$("intro-text").value.trim();
 if(kind==="text"&&!text){show(s,"Écrivez votre message d’accueil.",false);return false}
 let path=null;
 button.disabled=true;organizerState.saving++;saveIndicator();
 const fields=[...document.querySelectorAll(".intro-editor-fields input,.intro-editor-fields select,.intro-editor-fields textarea")];fields.forEach(el=>el.disabled=true);
 try{
  if(kind==="image"||kind==="video"){
   if(!f){if(introKind(c)!==kind||!c.intro_path)throw new Error("Choisissez un fichier pour votre répondeur.");path=c.intro_path}
   else{
    const allowed=kind==="image"?["image/jpeg","image/png","image/webp"]:["video/mp4","video/quicktime","video/webm"];
    if(!allowed.includes(f.type))throw new Error(kind==="image"?"Choisissez une image JPG, PNG ou WebP.":"Choisissez une vidéo MP4, MOV ou WebM.");
    if(f.size>(kind==="image"?10000000:50000000))throw new Error(kind==="image"?"L’image dépasse 10 Mo.":"La vidéo dépasse 50 Mo.");
    if(kind==="video"){const duration=await videoDuration(f);if(!Number.isFinite(duration)||duration>12.05)throw new Error("La vidéo doit durer 12 secondes maximum.")}
    path=c.id+"/organizer/intro-"+crypto.randomUUID()+"."+ext(f.type);
    show(s,"Envoi du répondeur…");
    const up=await sb.storage.from("capsule-media").upload(path,f,{contentType:f.type,upsert:false});if(up.error)throw up.error;
   }
  }
  const payload={intro_path:path,welcome_message:kind==="text"?text:null};
  const{error}=await sb.from("capsules").update(payload).eq("id",c.id);if(error)throw error;
  Object.assign(c,payload);$("intro-file").value="";organizerState.intro=false;organizerState.error=false;await renderIntroPreview(c);renderIntroDraft(c);
  show(s,kind==="none"?"Répondeur désactivé. Vos invités accèdent directement au dépôt de souvenirs.":"Votre répondeur est enregistré.");
  return true;
 }catch(e){organizerState.error=true;show(s,e.message||"Impossible d’enregistrer votre répondeur.",false);return false}finally{button.disabled=false;fields.forEach(el=>el.disabled=false);organizerState.saving--;saveIndicator()}
}
function renderIntroDraft(c){
 const wrap=$("intro-live-preview");if(!wrap)return;
 wrap.replaceChildren();if(introPreviewUrl){URL.revokeObjectURL(introPreviewUrl);introPreviewUrl=null}
 if(!organizerState.intro){wrap.hidden=true;return}wrap.hidden=false;
 const title=document.createElement("strong");title.textContent="Aperçu — non enregistré";wrap.append(title);
 const kind=$("intro-kind").value,file=$("intro-file").files[0];
 if(kind==="text"){const text=document.createElement("p");text.className="intro-text-preview";text.textContent=$("intro-text").value||"Votre texte apparaîtra ici.";wrap.append(text)}
 else if(file&&((kind==="image"&&["image/jpeg","image/png","image/webp"].includes(file.type))||(kind==="video"&&file.type.startsWith("video/")))){
  const media=document.createElement(kind==="image"?"img":"video");introPreviewUrl=URL.createObjectURL(file);media.src=introPreviewUrl;media.className="intro-preview";if(kind==="image")media.alt="Aperçu de l’image sélectionnée";else{media.controls=true;media.preload="metadata"}wrap.append(media);
 }else{const hint=document.createElement("p");hint.textContent=kind==="none"?"Les invités accéderont directement au dépôt de souvenirs.":"Choisissez un fichier compatible pour afficher son aperçu.";wrap.append(hint)}
}
function setupIntro(c){
 const kind=$("intro-kind"),file=$("intro-file");kind.value=introKind(c);
 function update(){
  $("intro-text-field").hidden=kind.value!=="text";
  $("intro-media-field").hidden=kind.value!=="image"&&kind.value!=="video";
  file.accept=kind.value==="image"?"image/jpeg,image/png,image/webp":"video/mp4,video/quicktime,video/webm";
  $("intro-file-label").textContent=kind.value==="image"?"Votre image":"Votre vidéo";
  $("intro-file-help").textContent=kind.value==="image"?"JPG, PNG ou WebP · 10 Mo maximum.":"MP4, MOV ou WebM · 12 secondes et 50 Mo maximum.";
  $("upload-intro").textContent=kind.value==="none"?"Enregistrer sans répondeur":"Enregistrer mon répondeur";
 }
 kind.addEventListener("change",()=>{file.value="";update();markDirty("intro");renderIntroDraft(c);show($("intro-status"),"Modifications à enregistrer.")});update();
 file.addEventListener("change",()=>{markDirty("intro");renderIntroDraft(c);show($("intro-status"),file.files[0]?"Fichier sélectionné. Enregistrez pour le publier.":"")});
 $("intro-text").addEventListener("input",()=>{markDirty("intro");renderIntroDraft(c)});
 $("upload-intro").addEventListener("click",()=>uploadIntro(c));renderIntroPreview(c);
}
const DEFAULT_CARD_TITLE="Notre capsule temporelle";
const DEFAULT_CARD_NOTE="Laissez-nous un souvenir à découvrir plus tard, à la date que vous choisissez.";
function defaultCardExplanation(plan){
 const formats={photo:"une photo ou un texte",audio:"une photo, un audio ou un texte",premium:"une photo, un audio, une vidéo ou un texte"};
 return "Flashez ce QR code et déposez-y "+(formats[plan]||formats.premium)+". Choisissez la manière la plus naturelle de partager un souvenir avec nous.";
}
function cardDefault(value,old,fallback){return !value||value===old?fallback:String(value)}

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
  title:cardDefault(c.print_title,"Laissez-nous un souvenir",DEFAULT_CARD_TITLE).slice(0,42),
  note:cardDefault(c.print_note,"Scannez ce code pour nous laisser un souvenir.",DEFAULT_CARD_NOTE).slice(0,120),
  explanation:cardDefault(c.print_explanation,"Vidéo, audio ou photo : choisissez la manière la plus naturelle de partager un souvenir avec nous.",defaultCardExplanation(c.plan)).slice(0,240),
  font:["elegant","classic","modern","romantic","editorial","refined","contemporary","signature"].includes(c.qr_font)?c.qr_font:"elegant",
  style:Object.hasOwn(qrThemes,c.qr_style)?c.qr_style:"romantic",
  size:QR_LARGE_SIZE,
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
 return ["romantic","signature","editorial"].includes(key)?"400":key==="classic"?"600":"700";
}
function collectQrCustomization(c){
 return {
  qr_initials:($("qr-initials-input")?.value||defaultInitials(c.couple_name)).trim().slice(0,4),
  qr_color:$("qr-color")?.value||"#b78b38",
  print_title:($("print-title")?.value||DEFAULT_CARD_TITLE).trim().slice(0,42),
  print_note:($("print-note")?.value||DEFAULT_CARD_NOTE).trim().slice(0,120),
  print_explanation:($("print-explanation")?.value||defaultCardExplanation(c.plan)).trim().slice(0,240),
  qr_font:$("qr-font")?.value||"elegant",
  qr_style:$("qr-style")?.value||"romantic",
  qr_size:QR_LARGE_SIZE,
  qr_show_initials:Boolean($("qr-show-initials")?.checked),
  qr_show_brand:true
 }
}
// The same artwork is used for the preview and the print export.
const qrThemes={
 minimal:{name:"Épure",detail:"Blanc · lignes pures",background:"#ffffff",font:"modern",accent:"#353c39",badge:"plain"},
 editorial:{name:"Éditorial",detail:"Papier · contraste",background:"#faf8f2",font:"editorial",accent:"#252d3b",badge:"plain"},
 signature:{name:"Signature",detail:"Ivoire · manuscrit",background:"#fffcf6",font:"signature",accent:"#715e51",badge:"oval"},
 chic:{name:"Art déco",detail:"Champagne · géométrie",background:"#f8f3e8",font:"classic",accent:"#8b713e",badge:"diamond"},
 palace:{name:"Palace",detail:"Crème · médaillons",background:"#fcf7ec",font:"refined",accent:"#907447",badge:"double"},
 arch:{name:"Arche",detail:"Pêche · courbes",background:"#f7ece4",font:"editorial",accent:"#986c59",badge:"oval"},
 botanical:{name:"Botanique",detail:"Sauge · feuillage",background:"#f0f4eb",font:"elegant",accent:"#536c53",badge:"circle"},
 olive:{name:"Olivier",detail:"Lin · Méditerranée",background:"#faf8ed",font:"refined",accent:"#63704d",badge:"oval"},
 pressed:{name:"Fleurs pressées",detail:"Crème · fleurs des champs",background:"#fffaf1",font:"signature",accent:"#8b665d",badge:"circle"},
 romantic:{name:"Jardin romantique",detail:"Rose · fleurs au trait",background:"#fff4f3",font:"elegant",accent:"#946c76",badge:"double"},
 boho:{name:"Bohème",detail:"Sable · soleil",background:"#f7eee1",font:"editorial",accent:"#9b6449",badge:"circle"},
 riviera:{name:"Riviera",detail:"Pastel · rayures",background:"#fffdf7",font:"classic",accent:"#698b89",badge:"oval"},
 dolce:{name:"Dolce Vita",detail:"Citron · bleu azur",background:"#fffbee",font:"classic",accent:"#386384",badge:"diamond"},
 seaside:{name:"Bord de mer",detail:"Bleu brume · vagues",background:"#f0f7f8",font:"modern",accent:"#456c83",badge:"plain"},
 celestial:{name:"Céleste",detail:"Perle · étoiles",background:"#f5f3fc",font:"elegant",accent:"#72658e",badge:"diamond"},
 pearl:{name:"Perle",detail:"Nacre · petits points",background:"#faf7f4",font:"refined",accent:"#8b7c75",badge:"double"},
 retro:{name:"Rétro",detail:"Pêche · bordeaux",background:"#fff0e3",font:"editorial",accent:"#8d4751",badge:"oval"},
 confetti:{name:"Confettis",detail:"Crème · touches de couleur",background:"#fffdf4",font:"contemporary",accent:"#55677c",badge:"plain"}
};
const QR_LARGE_SIZE=245;

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
 const ctx=canvas.getContext("2d"); // Light modules and the four-module quiet zone remain transparent.
 ctx.fillStyle=qrInk(o.color);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(model.isDark(y,x))ctx.fillRect((x+quiet)*cell,(y+quiet)*cell,cell,cell);
 return canvas;
}
function drawQrMonogram(ctx,o,cx,cy,size,background){
 const d=size*.18,r=d/2,theme=qrThemes[o.style];
 ctx.save();
 // Reveal the exact artwork beneath the code, including gradients: no white badge.
 ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
 ctx.drawImage(background,cx-r,cy-r,d,d,cx-r,cy-r,d,d);
 ctx.restore();ctx.save();ctx.translate(cx,cy);
 ctx.strokeStyle=qrInk(o.color);ctx.lineWidth=Math.max(.8,size*.0013);ctx.globalAlpha=.45;
 const badge=theme.badge;
 if(badge!=="plain"){
  ctx.beginPath();
  if(badge==="diamond"){ctx.moveTo(0,-r*.84);ctx.lineTo(r*.84,0);ctx.lineTo(0,r*.84);ctx.lineTo(-r*.84,0);ctx.closePath()}
  else ctx.ellipse(0,0,r*.83,r*(badge==="oval"?.72:.83),0,0,Math.PI*2);
  ctx.stroke();
  if(badge==="double"){ctx.globalAlpha=.2;ctx.beginPath();ctx.arc(0,0,r*.93,0,Math.PI*2);ctx.stroke()}
 }
 ctx.globalAlpha=1;
 const letters=Array.from(o.initials.trim().toUpperCase()).slice(0,4).join("");
 const family=qrFontFamily(o.font),weight=qrFontWeight(o.font);
 const maxW=d*(badge==="diamond"?.52:.66),maxH=d*(badge==="diamond"?.43:.48);
 ctx.textAlign="left";ctx.textBaseline="alphabetic";
 let fontSize=d*.5,metrics;
 do{
  ctx.font=weight+" "+fontSize+'px "'+family+'", serif';
  metrics=ctx.measureText(letters);
  if(Math.max(metrics.width,metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight)<=maxW&&metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent<=maxH)break;
  fontSize--;
 }while(fontSize>12);
 ctx.fillStyle=qrInk(o.color);ctx.textAlign="left";ctx.textBaseline="alphabetic";
 ctx.fillText(letters,(metrics.actualBoundingBoxLeft-metrics.actualBoundingBoxRight)/2,(metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)/2);
 ctx.restore();
}
function drawQrBackdrop(ctx,o,W,H){
 const theme=qrThemes[o.style],style=o.style;
 ctx.fillStyle=theme.background;ctx.fillRect(0,0,W,H);
 if(style==="minimal")return;
 const wash=(x,y,r,alpha)=>{
  const g=ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,o.color);g.addColorStop(1,theme.background);
  ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.restore();
 };
 const soft=["romantic","pressed","botanical","olive","signature","pearl","celestial"].includes(style);
 wash(0,0,W*.9,soft?.14:.07);wash(W,H,W,soft?.12:.06);
 if(style==="pearl")wash(W*.8,H*.35,W*.7,.07);
 ctx.save();ctx.strokeStyle=o.color;ctx.fillStyle=o.color;
 // Fine paper texture lives in the margins, away from the quiet zone and text.
 ctx.globalAlpha=.045;
 for(let i=0;i<1100;i++){
  const x=(i*83.37)%W,y=(i*173.29)%H;
  if(x<125||x>W-125)ctx.fillRect(x,y,1.1,1.1);
 }
 ctx.globalAlpha=.14;ctx.lineWidth=1.3;
 if(["chic","palace","retro","editorial"].includes(style)){
  for(let i=0;i<5;i++){
   const inset=24+i*7;ctx.beginPath();ctx.moveTo(inset,150);ctx.lineTo(inset,inset);ctx.lineTo(150,inset);ctx.stroke();
   ctx.beginPath();ctx.moveTo(W-inset,H-150);ctx.lineTo(W-inset,H-inset);ctx.lineTo(W-150,H-inset);ctx.stroke();
  }
 }
 if(["romantic","pressed","botanical","olive"].includes(style)){
  for(const flip of [false,true]){
   ctx.save();if(flip){ctx.translate(W,H);ctx.rotate(Math.PI)}
   ctx.globalAlpha=.09;
   for(let i=0;i<5;i++){
    ctx.beginPath();ctx.ellipse(55+i*9,510+i*135,70,150,-.4+i*.15,0,Math.PI*2);ctx.fill();
   }
   ctx.globalAlpha=.24;ctx.beginPath();ctx.moveTo(36,185);ctx.bezierCurveTo(135,360,18,650,83,980);ctx.stroke();
   ctx.restore();
  }
 }
 if(style==="celestial"){
  ctx.globalAlpha=.16;
  for(const [x,y] of [[35,95],[W-35,H-95]]){ctx.beginPath();ctx.arc(x,y,145,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(x,y,165,0,Math.PI*2);ctx.stroke()}
  ctx.globalAlpha=.38;
  for(let i=0;i<38;i++){const x=i%2?W-35-(i*11)%80:35+(i*11)%80,y=170+(i*73)%(H-300);ctx.beginPath();ctx.arc(x,y,i%3?1.4:2.5,0,Math.PI*2);ctx.fill()}
 }
 if(style==="seaside"){
  ctx.globalAlpha=.09;
  for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(0,H-65-i*12);ctx.bezierCurveTo(W*.3,H-190-i*8,W*.6,H+20-i*12,W,H-110-i*12);ctx.stroke()}
 }
 if(style==="dolce"){
  ctx.globalAlpha=.18;
  for(let y=320;y<H-320;y+=85)for(const x of [50,W-50]){ctx.beginPath();ctx.moveTo(x,y-10);ctx.lineTo(x+10,y);ctx.lineTo(x,y+10);ctx.lineTo(x-10,y);ctx.closePath();ctx.stroke()}
 }
 if(style==="boho"){
  ctx.globalAlpha=.16;
  for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(-10,H-180,160+i*14,300+i*14,.35,0,Math.PI*2);ctx.stroke()}
 }
 ctx.restore();
}
function drawQrDecor(ctx,o,W,H){
 ctx.save();ctx.strokeStyle=o.color;ctx.fillStyle=o.color;ctx.lineWidth=2;
 const style=o.style;
 const line=(x,y,x2,y2)=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke()};
 const ellipse=(x,y,rx,ry,angle=0,fill=false)=>{ctx.beginPath();ctx.ellipse(x,y,rx,ry,angle,0,Math.PI*2);fill?ctx.fill():ctx.stroke()};
 const star=(x,y,r)=>{ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,l=i%2?r*.25:r;ctx.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l)}ctx.closePath();ctx.fill()};
 const branch=(x,y,angle,filled=false)=>{
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(20,-70,8,-145,40,-210);ctx.stroke();
  for(let i=0;i<7;i++){const ly=-25-i*26,lx=6+i*4,dir=i%2?1:-1;ellipse(lx+dir*17,ly-12,22,6,dir*.65,filled)}ctx.restore();
 };
 const flower=(x,y,r)=>{for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ellipse(x+Math.cos(a)*r*.65,y+Math.sin(a)*r*.65,r*.6,r*.28,a)}ellipse(x,y,r*.18,r*.18,0,true)};
 if(style==="chic"){
  ctx.globalAlpha=.45;ctx.strokeRect(60,60,W-120,H-120);ctx.globalAlpha=.25;ctx.strokeRect(75,75,W-150,H-150);ctx.globalAlpha=.8;
  for(const [x,y,a] of [[60,60,0],[W-60,60,Math.PI/2],[W-60,H-60,Math.PI],[60,H-60,-Math.PI/2]]){ctx.save();ctx.translate(x,y);ctx.rotate(a);line(0,95,0,0);line(0,0,95,0);line(15,70,15,15);line(15,15,70,15);ctx.translate(15,15);ctx.rotate(Math.PI/4);ctx.fillRect(-4,-4,8,8);ctx.restore()}
 }else if(style==="editorial"){
  ctx.lineWidth=5;line(145,125,W-145,125);ctx.lineWidth=1;line(145,H-250,W-145,H-250);
  ctx.globalAlpha=.25;ctx.fillRect(62,185,10,250);ctx.fillRect(W-72,H-495,10,250);
 }else if(style==="signature"){
  ctx.globalAlpha=.55;ctx.beginPath();ctx.moveTo(340,125);ctx.bezierCurveTo(550,60,650,200,840,120);ctx.bezierCurveTo(750,175,630,80,530,145);ctx.stroke();
  line(145,H-250,245,H-250);
 }else if(style==="palace"){
  ctx.globalAlpha=.42;ctx.strokeRect(70,70,W-140,H-140);
  for(const [x,y,a] of [[85,85,0],[W-85,85,Math.PI/2],[W-85,H-85,Math.PI],[85,H-85,-Math.PI/2]]){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.beginPath();ctx.moveTo(0,105);ctx.bezierCurveTo(75,95,95,75,105,0);ctx.stroke();ellipse(45,45,25,12,-Math.PI/4);ellipse(22,72,12,6,-Math.PI/3);ellipse(72,22,12,6,-Math.PI/6);ctx.restore()}
 }else if(style==="arch"){
  ctx.globalAlpha=.08;ctx.beginPath();ctx.roundRect(125,110,W-250,H-390,[450,450,18,18]);ctx.fill();ctx.globalAlpha=.45;ctx.beginPath();ctx.roundRect(145,135,W-290,H-440,[425,425,12,12]);ctx.stroke();
 }else if(["botanical","olive","pressed","romantic"].includes(style)){
  ctx.globalAlpha=style==="botanical"?.45:.5;
  branch(100,360,-.2,style==="botanical");branch(W-100,H-360,Math.PI-.2,style==="botanical");
  if(style==="olive"){for(let i=0;i<4;i++){ellipse(76+i*3,205+i*25,4,7,.3,true);ellipse(W-76-i*3,H-205-i*25,4,7,.3,true)}}
  if(style==="pressed"||style==="romantic"){
   if(style==="pressed")ctx.strokeStyle="#b89749";
   flower(112,130,style==="romantic"?32:20);flower(70,230,18);
   flower(W-112,H-130,style==="romantic"?32:20);flower(W-70,H-230,18);
   if(style==="romantic"){flower(112,130,18);flower(W-112,H-130,18)}
  }
 }else if(style==="boho"){
  ctx.globalAlpha=.1;ellipse(0,H-180,190,280,.4,true);ellipse(W,210,170,260,.4,true);ctx.globalAlpha=.55;
  for(let i=0;i<15;i++){const a=Math.PI+i*Math.PI/14;line(W/2+Math.cos(a)*48,155+Math.sin(a)*48,W/2+Math.cos(a)*68,155+Math.sin(a)*68)}
  ctx.beginPath();ctx.arc(W/2,155,35,Math.PI,Math.PI*2);ctx.stroke();
 }else if(style==="riviera"){
  ctx.globalAlpha=.14;for(let x=0;x<W;x+=70)ctx.fillRect(x,0,35,H);
  ctx.globalAlpha=1;ctx.fillStyle="#fffdf7";ctx.fillRect(110,110,W-220,H-220);
  for(let y=125;y<H-110;y+=35){ellipse(110,y,18,18,0,true);ellipse(W-110,y,18,18,0,true)}
  ctx.strokeStyle=o.color;ctx.globalAlpha=.3;ctx.strokeRect(130,130,W-260,H-260);
 }else if(style==="dolce"){
  ctx.globalAlpha=.5;ctx.setLineDash([5,10]);ctx.strokeRect(65,65,W-130,H-130);ctx.setLineDash([]);ctx.globalAlpha=1;
  for(const [x,y] of [[103,150],[W-103,H-170]]){ctx.fillStyle="#eed36a";ellipse(x,y,30,45,.5,true);ctx.fillStyle="#6f8853";ellipse(x+15,y-49,23,7,-.4,true)}
 }else if(style==="seaside"){
  ctx.globalAlpha=.3;
  for(const base of [85,H-120])for(let j=0;j<3;j++){ctx.beginPath();ctx.moveTo(60,base+j*14);for(let x=60;x<W-60;x+=100)ctx.quadraticCurveTo(x+25,base+j*14-18,x+50,base+j*14);ctx.stroke()}
 }else if(style==="celestial"){
  ctx.globalAlpha=.6;for(const [x,y,r] of [[110,170,15],[W-100,330,10],[90,960,9],[W-100,1330,14],[170,H-165,11],[W-260,110,8]])star(x,y,r);
  ctx.beginPath();ctx.arc(W/2,130,27,.2,Math.PI*1.85);ctx.bezierCurveTo(W/2-10,100,W/2-10,150,W/2+26,135);ctx.stroke();
 }else if(style==="pearl"){
  ctx.globalAlpha=.4;for(let x=70;x<W-60;x+=24){ellipse(x,70,3,3,0,true);ellipse(x,H-70,3,3,0,true)}for(let y=94;y<H-90;y+=24){ellipse(70,y,3,3,0,true);ellipse(W-70,y,3,3,0,true)}
  ctx.globalAlpha=.2;ctx.strokeRect(86,86,W-172,H-172);
 }else if(style==="retro"){
  ctx.globalAlpha=.65;ctx.lineWidth=5;ctx.beginPath();ctx.roundRect(70,70,W-140,H-140,130);ctx.stroke();ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(85,85,W-170,H-170,118);ctx.stroke();
  ctx.globalAlpha=.15;for(let i=0;i<3;i++){line(105+i*12,290,105+i*12,H-290);line(W-105-i*12,290,W-105-i*12,H-290)}
 }else if(style==="confetti"){
  const colors=["#c99383","#d8b557","#7e9b92","#9092b1"];
  for(let i=0;i<30;i++){const x=i%2?W-55-(i*19)%65:55+(i*19)%65,y=90+(i*137)%(H-180);ctx.save();ctx.translate(x,y);ctx.rotate(i*.7);ctx.fillStyle=colors[i%4];ctx.globalAlpha=.7;i%3?ctx.fillRect(-4,-9,8,18):ellipse(0,0,5,5,0,true);ctx.restore()}
 }
 ctx.restore();
}
function drawQrDivider(ctx,o,x,y){
 ctx.save();ctx.strokeStyle=o.color;ctx.fillStyle=o.color;ctx.lineWidth=2;
 const half=qrThemes[o.style].badge==="plain"?32:90,gap=qrThemes[o.style].badge==="plain"?0:20;
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
 drawQrBackdrop(ctx,o,W,H);
 drawQrDecor(ctx,o,W,H);
 ctx.textAlign="center";ctx.textBaseline="alphabetic";
 const ff=qrFontFamily(o.font);
 let titleSize=["romantic","signature"].includes(o.font)?120:o.font==="contemporary"?96:o.font==="refined"?98:112;
 ctx.fillStyle="#201c1a";
 const titleWidth=o.style==="arch"?660:880;
 titleSize=fitPrintFont(ctx,o.title,titleWidth,3,titleSize,'"'+ff+'", serif',qrFontWeight(o.font));
 const titleLines=wrapCanvasLines(ctx,o.title,titleWidth,3),titleLineHeight=titleSize*1.12;
 const titleY=310-(titleLines.length-1)*titleLineHeight/2;
 drawWrappedCenteredText(ctx,o.title,W/2,titleY,titleWidth,titleLineHeight,3);
 drawQrDivider(ctx,o,W/2,475);
 const qsize=570,qx=Math.round((W-qsize)/2),qy=550;
 const background=document.createElement("canvas");background.width=W;background.height=H;
 background.getContext("2d").drawImage(canvas,0,0);
 ctx.imageSmoothingEnabled=false;
 ctx.drawImage(qr,qx,qy,qsize,qsize);
 ctx.imageSmoothingEnabled=true;

 if(o.showInitials)drawQrMonogram(ctx,o,W/2,qy+qsize/2,qsize,background);

 let textY=qy+qsize+74;
 const textWidth=890;
 let noteSize=fitPrintFont(ctx,o.note,textWidth,3,48,"Inter, Arial, sans-serif","600");
 let explanationSize=fitPrintFont(ctx,o.explanation,textWidth,5,40,"Inter, Arial, sans-serif","400");
 // Fit both paragraphs above the logo, including maximum-length custom text.
 const textLines=(text,size,weight)=>{ctx.font=weight+" "+size+"px Inter, Arial, sans-serif";return wrapCanvasLines(ctx,text,textWidth,100).length};
 while(noteSize>24&&explanationSize>24){
  const n=textLines(o.note,noteSize,"600"),e=textLines(o.explanation,explanationSize,"400");
  if(textY+n*noteSize*1.2+20+(e-1)*explanationSize*1.2<=1545)break;
  noteSize--;explanationSize--;
 }
 ctx.fillStyle="#262220";ctx.font="600 "+noteSize+"px Inter, Arial, sans-serif";
 textY=drawWrappedCenteredText(ctx,o.note,W/2,textY,textWidth,noteSize*1.2,10)+20;
 ctx.fillStyle="#554e49";ctx.font="400 "+explanationSize+"px Inter, Arial, sans-serif";
 drawWrappedCenteredText(ctx,o.explanation,W/2,textY,textWidth,explanationSize*1.2,12);


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
function saveQrCustomization(c,url,silent=false){
 const payload=collectQrCustomization(c);organizerState.saving++;saveIndicator();
 const run=async()=>{
  try{
   const{error}=await sb.from("capsules").update(payload).eq("id",c.id);if(error)throw error;
   Object.assign(c,payload);applyQrPreview(url,{...c,...collectQrCustomization(c)});
   if(JSON.stringify(payload)===JSON.stringify(collectQrCustomization(c)))organizerState.qr=false;
   organizerState.error=false;show($("qr-status"),"Carte enregistrée.");return true;
  }catch(e){organizerState.qr=true;organizerState.error=true;show($("qr-status"),"Impossible d’enregistrer la carte : "+e.message,false);return false}
  finally{organizerState.saving--;saveIndicator()}
 };
 qrSaveQueue=qrSaveQueue.then(run,run);return qrSaveQueue;
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
    <h3>Les mots de votre carte</h3><p class="field-help">Les textes sont prêts à l’emploi. Ajustez-les pour qu’ils vous ressemblent.</p>
    <div class="field"><div class="qr-field-label-row"><label for="print-title">Titre de la carte</label><span data-char-count="print-title">0 / 42</span></div><input id="print-title" maxlength="42" value="${esc(o.title)}"></div>
    <div class="field"><div class="qr-field-label-row"><label for="print-note">Petit mot</label><span data-char-count="print-note">0 / 120</span></div><textarea id="print-note" maxlength="120" rows="2">${esc(o.note)}</textarea></div>
    <div class="field"><div class="qr-field-label-row"><label for="print-explanation">Texte d'explication</label><span data-char-count="print-explanation">0 / 240</span></div><textarea id="print-explanation" maxlength="240" rows="3">${esc(o.explanation)}</textarea><small id="plan-explanation-help" class="field-help">Texte proposé pour la formule ${esc(PLAN_NAMES[c.plan]||"Premium")}.</small></div>
   </div>

   <div class="qr-control-group qr-personalization-group">
    <div class="qr-control-title">
     <div><h3>Personnalisation</h3><p>Chaque ambiance associe un fond, des ornements et une typographie. Ajustez ensuite les détails.</p></div>
    </div>

    <div class="field qr-choice-field">
     <label>Ambiance de la carte</label>
     <input id="qr-style" type="hidden" value="${esc(o.style)}">
     <div class="qr-style-choices qr-theme-gallery" role="group" aria-label="18 ambiances de carte">
      ${Object.entries(qrThemes).map(([key,theme])=>`<button class="qr-style-choice ${o.style===key?"is-selected":""}" data-qr-style="${key}" type="button" aria-pressed="${o.style===key}"><img class="qr-theme-thumbnail" src="assets/themes/${key}.webp?v=20260928-integrated1" alt="" width="180" height="270" loading="lazy"><span class="qr-theme-name">${theme.name}</span></button>`).join("")}
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
     <div class="qr-field-label-row"><label for="qr-color">Couleurs</label><span id="qr-color-value">${esc(o.color.toUpperCase())}</span></div>
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
      <div><i class="fa-solid fa-qrcode" aria-hidden="true"></i><span><strong>Multipliez les points d’accès</strong><small>Tables, bar, livre d’or ou photobooth : plusieurs QR codes facilitent les participations.</small></span></div><div><i class="fa-solid fa-share-nodes" aria-hidden="true"></i><span><strong>Pensez aussi aux absents</strong><small>N’hésitez pas à partager votre carte ou votre lien avec les personnes absentes : elles peuvent, elles aussi, vous laisser un souvenir.</small></span></div>
     </div>
    </div>
    <div id="qr-status" class="status"></div>
   </div>
  </div>
 </div>
</section>

<section class="qr-designer-panel intro-video-panel">
 <div class="intro-video-head"><div><div class="eyebrow">Un accueil à votre image · Facultatif</div><h2>Votre répondeur</h2><p>Visible à l’ouverture de votre QR code. Accueillez vos invités avec un texte, une vidéo ou une image avant qu’ils déposent leur souvenir.</p></div><span class="intro-video-limit">En option</span></div>
 <div class="intro-video-body intro-editor-grid">
  <div class="intro-editor-fields">
   <div class="field"><label for="intro-kind">Comment souhaitez-vous accueillir vos invités ?</label><select id="intro-kind"><option value="none">Sans répondeur</option><option value="text">Un texte</option><option value="video">Une vidéo</option><option value="image">Une image</option></select><small class="field-help">Vous pouvez passer cette étape ou modifier votre répondeur à tout moment.</small></div>
   <div class="field" id="intro-text-field" hidden><label for="intro-text">Votre message</label><textarea id="intro-text" rows="6" maxlength="2000" placeholder="Bienvenue dans notre capsule ! Laissez-nous un petit mot, une émotion, un souvenir…">${esc(c.welcome_message||"")}</textarea><small class="field-help">2 000 caractères maximum.</small></div>
   <div class="field" id="intro-media-field" hidden><label id="intro-file-label" for="intro-file">Votre fichier</label><input id="intro-file" type="file"><small class="field-help" id="intro-file-help"></small></div>
   <button id="upload-intro" class="btn primary" type="button">Enregistrer mon répondeur</button>
   <div id="intro-status" class="status" role="status" aria-live="polite"></div>
  </div>
  <div class="intro-preview-card"><div id="intro-live-preview" hidden></div><span class="eyebrow">Répondeur enregistré</span><div id="intro-preview-wrap"></div><p class="field-help">Sans répondeur, vos invités accèdent directement au dépôt de souvenirs.</p></div>
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
   <div><div class="eyebrow">Souvenirs reçus</div><h2 id="memory-count">${count} contenu(s)</h2></div>
  </div>
  <button id="refresh-memories" class="btn secondary" type="button">Actualiser les souvenirs</button><p id="memory-status" class="status" role="status"></p><div id="memory-list" class="memory-list"></div>
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
 const fontInput=$("qr-font"),styleInput=$("qr-style"),colorInput=$("qr-color");
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


}

function setupQrTextCounters(){
 const limits={ "print-title":42, "print-note":120, "print-explanation":240 };
 Object.entries(limits).forEach(([id,max])=>{
  const el=$(id),counter=document.querySelector('[data-char-count="'+id+'"]');
  if(!el||!counter)return;
  const sync=()=>{counter.textContent=String(el.value.length)+" / "+max};
  el.addEventListener("input",sync);sync()
 })
}

function nextCountdown(manifest){
 clearInterval(countdownTimer);
 const next=manifest.filter(m=>!m.is_available).sort((a,b)=>new Date(a.delivery_at)-new Date(b.delivery_at))[0],box=$("next-delivery");box.hidden=false;
 if(!next){box.innerHTML="<strong>Aucun souvenir en attente</strong>";return}
 const tick=()=>{const delta=new Date(next.delivery_at)-new Date();if(delta<=0){box.innerHTML="<strong>Un souvenir est prêt à être découvert. Actualisez la liste.</strong>";return}const d=Math.floor(delta/86400000),h=Math.floor((delta%86400000)/3600000),m=Math.floor((delta%3600000)/60000);box.innerHTML="<span>Prochain souvenir dans</span><strong>"+(d?d+" j ":"")+h+" h "+m+" min</strong>"};tick();countdownTimer=setInterval(tick,60000)
}

async function renderManifest(c,manifest){
 const list=$("memory-list");
 if(!manifest.length){list.innerHTML='<div class="notice">Aucun souvenir reçu pour le moment.</div>';return}
 const{data:rows,error}=await sb.from("messages").select("id,guest_name,message_text,media_type,media_path,delivery_at,created_at").eq("capsule_id",c.id);
 if(error)throw error;
 const map=new Map((rows||[]).map(x=>[x.id,x]));list.replaceChildren();
 for(const item of manifest){
  const row=map.get(item.id),available=item.is_available;
  const article=document.createElement("article");article.className="memory-row "+(available?"available":"locked");
  article.innerHTML='<div class="memory-icon">'+icon(item.media_type)+'</div><div class="memory-meta"><strong>'+esc(item.guest_name||"Invité")+'</strong><span>'+label(item.media_type)+' · livraison le '+esc(fdate(item.delivery_at))+'</span></div><div class="memory-actions"><span class="lock-badge '+(available?'open':'locked')+'">'+(available?'Disponible':'🔒 Verrouillé')+'</span></div><div class="memory-content"></div>';
  const content=article.querySelector('.memory-content'),actions=article.querySelector('.memory-actions');
  if(available&&row?.message_text){const text=document.createElement('p');text.className='memory-text';text.textContent=row.message_text;content.append(text)}
  if(available&&row?.media_path){
   const media=document.createElement(row.media_type==="image"?'img':row.media_type==='audio'?'audio':'video');media.className='memory-'+(row.media_type==='image'?'image':row.media_type);if(row.media_type==='image')media.alt='Souvenir de '+(item.guest_name||'votre invité');else{media.controls=true;media.preload='metadata'}
   const status=document.createElement('p');status.className='hint';status.setAttribute('role','status');
   const refresh=document.createElement('button');refresh.type='button';refresh.className='mini-link';refresh.textContent='Recharger le média';
   let signedAt=0;
   const renew=async()=>{refresh.disabled=true;try{const{data,error}=await sb.storage.from('capsule-media').createSignedUrl(row.media_path,300);if(error||!data?.signedUrl)throw error||new Error('Lien indisponible');signedAt=Date.now();media.src=data.signedUrl;status.textContent='';return true}catch(e){status.textContent='Média indisponible. Réessayez avec « Recharger le média ».';return false}finally{refresh.disabled=false}};
   refresh.addEventListener('click',renew);media.addEventListener('error',()=>{status.textContent='La lecture a échoué ou le lien a expiré. Rechargez le média.'});
   if(row.media_type!=='image')media.addEventListener('play',async()=>{if(Date.now()-signedAt>240000){media.pause();if(await renew())media.play().catch(()=>{})}});
   const download=document.createElement('button');download.type='button';download.className='mini-link';download.textContent='Télécharger';
   download.addEventListener('click',async()=>{download.disabled=true;try{const{data,error}=await sb.storage.from('capsule-media').createSignedUrl(row.media_path,300,{download:true});if(error||!data?.signedUrl)throw error||new Error('Lien indisponible');const link=document.createElement('a');link.href=data.signedUrl;link.download='';document.body.append(link);link.click();link.remove();status.textContent=''}catch(e){status.textContent='Téléchargement impossible. Réessayez.'}finally{download.disabled=false}});
   actions.append(refresh,download);content.append(media,status);renew();
  }else if(available&&!row){content.textContent='Ce souvenir n’a pas pu être chargé. Actualisez la liste.'}
  list.append(article);
 }
}
async function renderCapsuleList(caps){
 $("dashboard-title").textContent="Mes capsules";document.querySelectorAll('[data-owner-tab-link]').forEach(el=>el.hidden=true);
 $("dashboard-content").innerHTML='<p class="hint">Vos brouillons et vos capsules actives, réunis dans votre espace.</p><p id="capsules-status" class="status" role="status"></p><div class="capsule-grid">'+caps.map(c=>`<article class="capsule-card"><a class="capsule-card-link" href="dashboard.html?slug=${encodeURIComponent(c.slug)}"><img data-capsule-thumbnail="${esc(c.id)}" class="capsule-thumbnail" src="assets/themes/${esc(qrOptions(c).style)}.webp" alt="Carte de ${esc(c.couple_name)}"><span class="capsule-badge">${c.status==="active"?"Active":"Brouillon privé"}</span><h2>${esc(c.couple_name)}</h2><p>${esc(fdate(c.wedding_date))} · ${esc(PLAN_NAMES[c.plan]||"Premium")}</p><p data-capsule-count="${esc(c.id)}">Chargement du nombre de souvenirs…</p><strong>${c.status==="active"?"Ouvrir ma capsule":"Continuer la préparation"} →</strong></a>${c.status==='draft'?`<button class="delete-draft" data-delete-draft="${esc(c.id)}" type="button">Supprimer le brouillon</button>`:''}</article>`).join('')+'<a class="capsule-card capsule-new" href="create.html"><span aria-hidden="true">+</span><h2>Créer une capsule</h2><p>Préparez un nouvel événement.</p></a></div>';
 document.querySelectorAll('[data-delete-draft]').forEach(button=>button.addEventListener('click',async()=>{
  const c=caps.find(x=>x.id===button.dataset.deleteDraft);if(!c||!confirm('Supprimer définitivement le brouillon « '+c.couple_name+' » ?'))return;
  button.disabled=true;try{const{data,error}=await sb.from('capsules').delete().eq('id',c.id).eq('status','draft').select('id');if(error)throw error;if(!data?.length)throw new Error('Ce brouillon n’existe plus ou a déjà été activé.');button.closest('.capsule-card').remove();show($("capsules-status"),'Brouillon supprimé.')}catch(e){show($("capsules-status"),'Suppression impossible : '+e.message,false);button.disabled=false}
 }));
 const observer=new IntersectionObserver(entries=>{entries.filter(e=>e.isIntersecting).forEach(async entry=>{
  observer.unobserve(entry.target);const c=caps.find(x=>x.id===entry.target.dataset.capsuleThumbnail);
  try{const url=new URL('capsule.html?t='+encodeURIComponent(c.guest_token),location.href).href;const canvas=await buildPrintCardCanvas(c,url);const thumb=document.createElement('canvas');thumb.width=160;thumb.height=240;thumb.getContext('2d').drawImage(canvas,0,0,160,240);entry.target.src=thumb.toDataURL('image/png')}catch(e){}
 })});document.querySelectorAll('[data-capsule-thumbnail]').forEach(el=>observer.observe(el));
 await Promise.all(caps.map(async c=>{const{data,error}=await sb.rpc('owner_capsule_stats',{p_capsule_id:c.id});const el=document.querySelector('[data-capsule-count="'+c.id+'"]');if(el)el.textContent=error?'Nombre de souvenirs indisponible':memoryCountLabel(data?.[0]?.message_count)}));
}
function setupCapsuleSettings(c){
 const panel=document.createElement('details');panel.className='capsule-settings';
 panel.innerHTML=`<summary>Paramètres de la capsule</summary><div class="settings-grid"><div class="field"><label for="capsule-name">Nom de la capsule</label><input id="capsule-name" maxlength="50" required value="${esc(c.couple_name)}"></div><div class="field"><label for="capsule-date">Date de l’événement</label><input id="capsule-date" type="date" required ${c.status==="active"&&c.guest_rules_version===1?"disabled":""} value="${esc(c.wedding_date)}"><small class="field-help">Pour les nouvelles capsules, la date fixe la période de dépôt et reste inchangée après activation.</small></div><div class="field"><label for="capsule-plan">Formule</label><select id="capsule-plan" ${c.status==='active'?'disabled':''}>${Object.entries(PLAN_NAMES).map(([key,name])=>`<option value="${key}" ${key===c.plan?'selected':''}>${name}</option>`).join('')}</select><small class="field-help">${c.status==='active'?'La formule est fixée après activation.':'Modifiable tant que la capsule est en brouillon.'}</small></div></div>`;
 document.querySelector('[data-owner-panel="configuration"]').prepend(panel);
 ['capsule-name','capsule-date','capsule-plan'].forEach(id=>$(id).addEventListener('input',()=>markDirty('settings')));
}
async function saveCapsuleSettings(c){
 if(!organizerState.settings)return true;
 const name=$("capsule-name").value.trim(),date=$("capsule-date").value,plan=$("capsule-plan").value;
 if(!name||name.length>50||!/^\d{4}-\d{2}-\d{2}$/.test(date)){show($("organizer-save-error"),'Renseignez un nom et une date valides.',false);document.querySelector('.capsule-settings').open=true;return false}
 const payload={couple_name:name,wedding_date:date};if(c.status==='draft')payload.plan=plan;
 const oldDefault=defaultCardExplanation(c.plan);
 const{error}=await sb.from('capsules').update(payload).eq('id',c.id);if(error)throw error;
 Object.assign(c,payload);$("dashboard-title").textContent=name;$("plan-explanation-help").textContent="Texte proposé pour la formule "+PLAN_NAMES[c.plan]+".";
 if($("print-explanation").value===oldDefault){$("print-explanation").value=defaultCardExplanation(c.plan);organizerState.qr=true}
 organizerState.settings=($("capsule-name").value.trim()!==name||$("capsule-date").value!==date||$("capsule-plan").value!==plan);return true;
}


async function renderOrganizerLifecycle(c){
 const {data,error}=await sb.rpc("owner_capsule_usage",{p_capsule_id:c.id});
 const panel=document.createElement("section");panel.className="capsule-lifecycle";
 if(error||!data){panel.textContent="Les dates et le stockage sont momentanément indisponibles.";document.querySelector('[data-owner-panel="configuration"]').prepend(panel);return}
 const names={draft:"Brouillon privé",scheduled:"Prête à partager",open:"Dépôts ouverts",closed:"Souvenirs à découvrir",full:"Stockage rempli",expired:"Conservation terminée",missing_date:"Date à compléter"};
 const ratio=Math.min(100,Math.round(data.used_bytes/data.quota_bytes*100)),warning=ratio>=95?"Il reste très peu de place pour les fichiers. Les petits mots restent possibles.":ratio>=80?"Votre capsule approche de sa limite de stockage.":"";
 panel.innerHTML='<strong>'+esc(names[data.state]||"Votre capsule")+'</strong><p>'+esc(data.legacy?"Cette capsule conserve sa période de dépôt initiale.":"Dépôts : "+fdate(data.opens_at)+" et "+fdate(new Date(new Date(data.closes_at).getTime()-1000).toISOString())+" · heure de Paris.")+'</p><p>Dévoilement jusqu’au '+esc(fdate(new Date(new Date(data.delivery_before).getTime()-1000).toISOString()))+' · Conservation jusqu’au '+esc(fdate(data.expires_at))+'.</p><details '+(warning?"open":"")+'><summary>Stockage : '+Math.round(data.used_bytes/1000000)+' Mo / '+(data.quota_bytes/1000000000)+' Go</summary><progress max="100" value="'+ratio+'" aria-label="Stockage utilisé"></progress><p>'+esc(warning||"Le stockage comprend les fichiers et les envois en cours.")+'</p></details>'+(c.activation_source==="free_beta"||c.status==="draft"?'<small>Pendant le lancement gratuit : tous les formats et jusqu’à 5 Go après activation.</small>':"");
 document.querySelector('[data-owner-panel="configuration"]').prepend(panel);
}

async function initDashboard(){
 if(!$("dashboard-content"))return;
 if(!configured)return $("dashboard-content").innerHTML='<div class="notice">Supabase non configuré.</div>';
 const u=await user();if(!u)return location.href="auth.html";
 $("logout")?.addEventListener("click",async()=>{if(organizerState.saving){show($("organizer-save-error"),"Patientez jusqu’à la fin de l’enregistrement avant de vous déconnecter.",false);return}if(organizerDirty()&&!confirm("Des modifications ne sont pas enregistrées. Quitter quand même ?"))return;Object.assign(organizerState,{qr:false,intro:false,settings:false});await sb.auth.signOut();location.href="index.html"});
 const{data:caps,error}=await sb.from("capsules").select("id,slug,status,plan,activation_source,guest_rules_version,guest_token,couple_name,wedding_date,welcome_message,intro_path,qr_initials,qr_color,print_title,print_note,print_explanation,qr_font,qr_style,qr_size,qr_show_initials,qr_show_brand,owner_messages_seen_at,created_at").order("created_at",{ascending:false});
 if(error)return $("dashboard-content").innerHTML='<div class="status show err">'+esc(error.message)+'</div>';
 if(!qs.get("slug")){await renderCapsuleList(caps);return}
 const c=caps.find(x=>x.slug===qs.get("slug"));
 if(!c)return $("dashboard-content").innerHTML='<div class="notice">Capsule introuvable. <a href="dashboard.html">Revenir à mes capsules</a></div>';
 $("dashboard-title").textContent=c.couple_name;
 const url=new URL("capsule.html",location.href);url.search="?t="+encodeURIComponent(c.guest_token);
 let manifest=[];
 $("dashboard-content").innerHTML=ownerShell(c,url.href,(manifest||[]).length);
 await renderOrganizerLifecycle(c);
 const stage=document.createElement("section");stage.className="activation-panel";
 stage.innerHTML=c.status==="active"?'<span class="capsule-badge">Capsule active</span><p>Votre lien invité et votre carte QR sont prêts à être partagés.</p>':`<div><span class="capsule-badge">Brouillon privé</span><h2>Votre capsule est prête ?</h2><p>Votre QR code sera utilisable par vos invités après l’activation.</p></div><button class="btn primary" id="review-activation" type="button">Valider ma capsule</button><dialog id="activation-dialog"><form method="dialog"><button class="dialog-close" aria-label="Fermer">×</button></form><div class="eyebrow">Dernière étape · Activation</div><h2>Tout est prêt ?</h2><p data-activation-summary><strong>${esc(c.couple_name)}</strong> · ${esc(fdate(c.wedding_date))} · ${esc(PLAN_NAMES[c.plan]||"Premium")}</p><p>Tarif prévu de cette formule : <span id="activation-price">${esc(PLAN_PRICES[c.plan]||PLAN_PRICES.premium)}</span> par capsule. <strong>À régler aujourd’hui : 0 €.</strong></p><p>Le paiement sera proposé ultérieurement. Pour le moment, l’activation est gratuite et tous les formats sont accessibles. Aucun paiement ne vous sera demandé pour cette activation.</p><button id="activate-capsule" class="btn primary" type="button">Activer gratuitement</button><p id="activation-status" class="status" role="status"></p></dialog>`;
 document.querySelector('[data-owner-panel="configuration"]').append(stage);
 if(c.status!=="active"){
  ["share-link","download-print-card","print-print-card"].forEach(id=>{$(id).disabled=true;$(id).title="Activez votre capsule pour partager votre carte"});
  const guestLink=$("open-guest-link");if(guestLink)guestLink.hidden=true;
  $("review-activation").addEventListener("click",async()=>{if(await saveAll()){ $("activation-dialog").querySelector('[data-activation-summary]').textContent=c.couple_name+" · "+fdate(c.wedding_date)+" · "+PLAN_NAMES[c.plan];$("activation-price").textContent=PLAN_PRICES[c.plan];$("activation-dialog").showModal()}});
  $("activate-capsule").addEventListener("click",async()=>{
   const button=$("activate-capsule");button.disabled=true;
   try{
    if(!await saveAll())throw new Error("Enregistrez toutes les modifications avant de réessayer.");
    const{error}=await sb.rpc("activate_capsule",{p_capsule_id:c.id});if(error)throw error;
    location.href="dashboard.html?slug="+encodeURIComponent(c.slug)+"&activated=1";
   }catch(e){show($("activation-status"),"Activation impossible : "+e.message,false);button.disabled=false}
  });
 }
 setupCapsuleSettings(c);
 const savebar=document.createElement('div');savebar.className='organizer-savebar';savebar.innerHTML='<span id="organizer-save-state" role="status" aria-live="polite">Tout est enregistré</span><button class="btn secondary" id="save-organizer" type="button">Tout enregistrer</button><p id="organizer-save-error" class="status" role="status"></p>';
 document.querySelector('[data-owner-panel="configuration"]').prepend(savebar);
 setupOwnerTabs(c,manifest||[]);
 applyQrPreview(url.href,c);
 const liveIds=["print-title","print-note","print-explanation","qr-initials-input","qr-color","qr-font","qr-style","qr-show-initials"];
 let qrSaveTimer=null,saveAllPending=null;
 function saveAll(){
  if(saveAllPending)return saveAllPending;
  clearTimeout(qrSaveTimer);organizerState.saving++;saveIndicator();$("save-organizer").disabled=true;
  saveAllPending=(async()=>{try{
   if(!await saveCapsuleSettings(c))return false;
   if(introSavePending&&!await introSavePending)return false;
   if(organizerState.intro&&!await uploadIntro(c))return false;
   if(!await saveQrCustomization(c,url.href,true))return false;
   organizerState.error=false;if(organizerDirty()){show($("organizer-save-error"),"Des modifications ont été faites pendant la sauvegarde. Enregistrez-les avant de continuer.",false);return false}show($("organizer-save-error"),'');return true;
  }catch(e){organizerState.error=true;show($("organizer-save-error"),'Enregistrement impossible : '+e.message,false);return false}
  finally{organizerState.saving--;saveIndicator();$("save-organizer").disabled=false;saveAllPending=null}})();
  return saveAllPending;
 }
 $("save-organizer").addEventListener('click',saveAll);

 const updateDesigner=()=>{
   markDirty("qr");
   applyQrPreview(url.href,{...c,...collectQrCustomization(c)});
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
 setupIntro(c);
 async function refreshMemories(){
  const button=$("refresh-memories");button.disabled=true;show($("memory-status"),'Chargement des souvenirs…');
  try{const{data,error}=await sb.rpc('owner_message_manifest',{p_capsule_id:c.id});if(error)throw error;manifest.splice(0,manifest.length,...(data||[]));await renderManifest(c,manifest);$("memory-count").textContent=memoryCountLabel(manifest.length);nextCountdown(manifest);updateOwnerUnreadBadge(ownerUnreadCount(c,manifest));if(location.hash==='#messages')await markOwnerMessagesSeen(c,manifest);show($("memory-status"),'Souvenirs à jour.')}catch(e){show($("memory-status"),'Chargement impossible. Utilisez « Actualiser les souvenirs » pour réessayer.',false)}finally{button.disabled=false}
 }
 $("refresh-memories").addEventListener('click',refreshMemories);await refreshMemories();
 if(qs.get('activated')==='1'&&c.status==='active'){
  const success=document.createElement('section');success.className='activation-success';success.innerHTML='<div class="eyebrow">Capsule active</div><h2>Votre capsule est prête à être partagée !</h2><p>Votre carte et votre répondeur sont enregistrés. Invitez maintenant vos proches à participer.</p><div class="success-actions"><button class="btn primary" data-success-action="share-link">Partager le lien</button><button class="btn secondary" data-success-action="download-print-card">Télécharger la carte</button><button class="btn secondary" data-success-action="print-print-card">Imprimer</button></div>';
  $("dashboard-content").prepend(success);success.querySelectorAll('[data-success-action]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.successAction).click()));
  history.replaceState(null,'','dashboard.html?slug='+encodeURIComponent(c.slug));
 }
}

initAuth();initCreate();initCapsule();initDashboard();
window.addEventListener("beforeunload",stopStream);
})();
