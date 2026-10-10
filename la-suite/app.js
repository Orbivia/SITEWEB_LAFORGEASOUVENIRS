(function(){
const qs=new URLSearchParams(location.search);
const guestIsPreview=qs.get('preview')==='1'&&Boolean(document.getElementById('capsule-title'));
let guestPreviewState=null;
const cfg=window.LA_SUITE_CONFIG||{};
const configured=Boolean(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&window.supabase);
const sb=configured?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
let selectedMedia=null,activeStream=null,recorder=null;
const organizerState={qr:false,intro:false,welcome:false,settings:false,saving:0,error:false};
let qrSaveQueue=Promise.resolve(),introSavePending=null,introPreviewUrl=null,countdownTimer=null;
function memoryCountLabel(value){const n=Number(value)||0;return n+" souvenir"+(n>1?"s":"")+" reçu"+(n>1?"s":"")}
function organizerDirty(){return organizerState.qr||organizerState.intro||organizerState.welcome||organizerState.settings}
function saveIndicator(){
 const el=$("organizer-save-state");if(!el)return;
 el.textContent=organizerState.saving?"Enregistrement…":organizerState.error?"Enregistrement incomplet. Réessayez.":organizerDirty()?"Modifications non enregistrées":"Tout est enregistré";
 const bar=el.closest(".organizer-savebar");if(bar)bar.hidden=!organizerState.error&&!$("organizer-save-error")?.textContent;
 const retry=$("save-organizer");if(retry){retry.textContent=organizerState.error?"Réessayer":"Enregistrer";retry.disabled=Boolean(organizerState.saving)||(!organizerDirty()&&!organizerState.error)}
 const chooseIntro=$("choose-intro-file");if(chooseIntro)chooseIntro.disabled=Boolean(organizerState.saving);
 const introButton=$("upload-intro");if(introButton){introButton.disabled=Boolean(organizerState.saving)||!organizerState.intro;introButton.hidden=!organizerState.intro;}
 el.dataset.state=organizerState.error?"error":organizerDirty()?"pending":"saved";
 const cardState=$("studio-save-state");if(cardState){cardState.hidden=!organizerState.error;cardState.textContent=organizerState.error?el.textContent:'';cardState.dataset.state=el.dataset.state;}
}
function markDirty(part){organizerState[part]=true;organizerState.error=false;saveIndicator()}
window.addEventListener("beforeunload",e=>{if(!ownerSessionEnded&&(organizerDirty()||organizerState.saving)){e.preventDefault();e.returnValue=""}});


const $=id=>document.getElementById(id);
function show(el,msg,ok=true){if(!el)return;el.textContent=msg;el.className=msg?"status show "+(ok?"ok":"err"):"status"}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function slugify(v){return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,50)}
function rid(){return Math.random().toString(36).slice(2,8)}
function fParis(v){return new Date(v).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'})}
function fdate(v){if(!v)return"—";return fParis(String(v).length===10?v+"T12:00:00Z":v)}
function label(t){return t==="video"?"Vidéo":t==="audio"?"Audio":t==="image"?"Image":"Texte"}
function icon(t){const name={video:"video",audio:"microphone",image:"camera",text:"comment"}[t]||"comment";return '<i class="fa-solid fa-'+name+'" aria-hidden="true"></i>'}
function ext(m){m=m?.split(";")[0];return({"video/mp4":"mp4","video/quicktime":"mov","video/webm":"webm","audio/webm":"webm","audio/mpeg":"mp3","audio/wav":"wav","audio/x-wav":"wav","audio/mp4":"m4a","audio/ogg":"ogg","image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/heic":"heic","image/heif":"heif"})[m]||"bin"}
function group(m){return m?.startsWith("video/")?"video":m?.startsWith("audio/")?"audio":m?.startsWith("image/")?"image":null}
async function user(){if(!sb)return null;const{data}=await sb.auth.getUser();return data?.user||null}
async function capsuleAccess(){const{data,error}=await sb.rpc("owner_capsule_access");if(error||!data)throw error||new Error("Impossible de vérifier votre capsule. Réessayez.");return data}
let mediaRequestVersion=0;
function stopStream(){mediaRequestVersion++;if(activeStream){activeStream.getTracks().forEach(t=>t.stop());activeStream=null}}
function resetPreview(){if(selectedMedia?.url)URL.revokeObjectURL(selectedMedia.url);selectedMedia=null;["preview-video","preview-audio","preview-image"].forEach(id=>{const e=$(id);if(e){e.hidden=true;e.removeAttribute("src")}});if($("media-preview"))$("media-preview").hidden=true}
function preview(file,type){resetPreview();const url=URL.createObjectURL(file);selectedMedia={file,type,url};$("media-preview").hidden=false;const el=$(type==="video"?"preview-video":type==="audio"?"preview-audio":"preview-image");el.src=url;el.hidden=false}
async function countdown(el,valid){el.hidden=false;for(let i=3;i>0;i--){if(!valid())return false;el.textContent=i;await new Promise(r=>setTimeout(r,1000))}if(!valid())return false;el.textContent="●";await new Promise(r=>setTimeout(r,250));if(!valid())return false;el.hidden=true;return true}
function showCapture(message,ok=true){show($("capture-status"),message,ok);show($("status"),"");if(message&&!ok)$("capture-status").scrollIntoView({behavior:"smooth",block:"nearest"})}
function captureError(error,kind){return error?.name==="NotAllowedError"?"Autorisez l’accès "+(kind==="video"?"à la caméra":"au microphone")+" dans votre navigateur, puis réessayez. Vous pouvez aussi choisir un fichier.":error?.name==="NotFoundError"?"Aucun appareil disponible. Choisissez un fichier.":"La caméra ou le micro est indisponible. Fermez les autres applications qui l’utilisent, puis réessayez ou choisissez un fichier."}
function interruptCapture(message){
 if(recorder?.state==="recording"){recorder.interruptionText=message;stopRecorder();return}
 if(recorderPreparing||activeStream){const mode=document.querySelector(".media-panel.active")?.id.replace("-panel","");if(mode)setGuestMode(mode);showCapture(message+" Réactivez la caméra ou le micro pour recommencer.",false)}
}
function bestMime(kind){const c=kind==="video"?["video/webm;codecs=vp8,opus","video/webm","video/mp4"]:["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg"];return c.find(x=>window.MediaRecorder&&MediaRecorder.isTypeSupported(x))||""}


let recorderTimer=null,recorderStopTimer=null,recorderPreparing=false,recorderGeneration=0;
function recordingTime(seconds){return String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0")}
function renderRecordingTimer(kind,started,limit){
 const elapsed=Math.min(limit,Math.max(0,Math.floor((Date.now()-started)/1000))),left=limit-elapsed,clock=$(kind+"-timer");
 clock.hidden=false;clock.querySelector(".record-elapsed").textContent=recordingTime(elapsed);
 clock.querySelector(".record-remaining").textContent=recordingTime(left)+" restantes";
 clock.classList.toggle("ending",left<=10);
 return left;
}
async function prepareRecorder(kind){
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error("Enregistrement indisponible");
 stopStream();const generation=recorderGeneration,request=mediaRequestVersion,button=$("prepare-"+kind);button.disabled=true;
 try{
  const stream=await navigator.mediaDevices.getUserMedia(kind==="video"?{video:{facingMode:"user",width:{ideal:1280},height:{ideal:720}},audio:true}:{audio:true});
  if(generation!==recorderGeneration||request!==mediaRequestVersion||document.visibilityState==="hidden"){stream.getTracks().forEach(t=>t.stop());return}
  activeStream=stream;
  stream.getTracks().forEach(track=>track.addEventListener("ended",()=>{if(activeStream===stream)interruptCapture("La caméra ou le micro a été coupé. Vérifiez l’aperçu avant l’envoi.")},{once:true}));
  if(kind==="video"){$("live-video").srcObject=stream;$("prepare-video").hidden=true;$("start-video").hidden=false}
  else{$("audio-indicator").textContent="Microphone activé";$("prepare-audio").hidden=true;$("start-audio").hidden=false}
  showCapture("Prêt. Appuyez sur Démarrer.");
 }catch(error){if(generation===recorderGeneration&&request===mediaRequestVersion)throw error}
 finally{if(generation===recorderGeneration&&request===mediaRequestVersion)button.disabled=false}
}
async function startRecorder(kind){
 if(recorderPreparing||recorder?.state==="recording")return;
 recorderPreparing=true;const generation=recorderGeneration;
 $("start-"+kind).disabled=true;
 try{
  if(!activeStream)await prepareRecorder(kind);
  if(generation!==recorderGeneration||!activeStream)return;
  guestSelectionVersion++;resetPreview();guestTransaction=null;
  $("guest-message").querySelector('[type="submit"]').disabled=true;showCapture("Préparez-vous à enregistrer…");
  if(!await countdown($(kind==="video"?"video-countdown":"audio-countdown"),()=>generation===recorderGeneration&&Boolean(activeStream)))return;
  if(generation!==recorderGeneration||!activeStream)return;
  const chunks=[],mime=bestMime(kind),options={audioBitsPerSecond:64000},stream=activeStream;
  if(mime)options.mimeType=mime;if(kind==="video")options.videoBitsPerSecond=1500000;
  const current=new MediaRecorder(stream,options),limit=kind==="video"?60:180,started=Date.now();recorder=current;let bytes=0;
  current.ondataavailable=e=>{if(e.data?.size){chunks.push(e.data);bytes+=e.data.size;if(bytes>=GUEST_LIMITS[kind]*0.95&&current.state==="recording")current.stop()}};
  current.onerror=()=>{if(recorder!==current)return;current.interruptionText="L’enregistrement a été interrompu. Vérifiez l’aperçu avant l’envoi.";stopRecorder()};
  current.onstop=()=>{
   if(recorder===current){clearInterval(recorderTimer);clearTimeout(recorderStopTimer);recorder=null;}
   const duration=Math.min((Date.now()-started)/1000,limit);
   const actual=(current.mimeType||mime||(kind==="video"?"video/webm":"audio/webm")).split(";")[0];
   const file=new File([new Blob(chunks,{type:actual})],"souvenir."+ext(actual),{type:actual});
   stream.getTracks().forEach(t=>t.stop());if(activeStream===stream)activeStream=null;
   if(kind==="video"&&$("live-video").srcObject===stream)$("live-video").srcObject=null;
   if(generation===recorderGeneration&&guestType===kind){
    $("prepare-"+kind).hidden=false;$("start-"+kind).hidden=true;$("stop-"+kind).hidden=true;
    $(kind+"-countdown").hidden=true;$(kind+"-timer").hidden=true;
    if(kind==="audio")$("audio-indicator").textContent="Enregistrement terminé";
    acceptGuestFile(file,kind,duration,current.interruptionText);
   }
  };
  current.start(500);
  $("start-"+kind).hidden=true;$("stop-"+kind).hidden=false;
  renderRecordingTimer(kind,started,limit);
  showCapture("Enregistrement en cours… Arrêtez quand vous avez terminé.");
  if(kind==="audio")$("audio-indicator").textContent="Enregistrement en cours";
  recorderStopTimer=setTimeout(()=>{if(recorder===current&&current.state==="recording")stopRecorder()},limit*1000);
  recorderTimer=setInterval(()=>{
   const left=renderRecordingTimer(kind,started,limit);
   if(left===0)stopRecorder();
  },250);
 }catch(error){
  if(generation!==recorderGeneration)return;
  stopRecorder();stopStream();$(kind+"-countdown").hidden=true;$(kind+"-timer").hidden=true;
  $("prepare-"+kind).hidden=false;$("start-"+kind).hidden=true;$("stop-"+kind).hidden=true;
  $("guest-message").querySelector('[type="submit"]').disabled=false;throw error;
 }finally{if(generation===recorderGeneration){recorderPreparing=false;$("start-"+kind).disabled=false}}
}
function stopRecorder(){clearInterval(recorderTimer);clearTimeout(recorderStopTimer);if(recorder&&recorder.state!=="inactive")recorder.stop()}

const PLAN_NAMES={photo:"Essentiel",audio:"Plus",premium:"Premium"};
const PLAN_PRICES={photo:990,audio:1490,premium:2490};
const money=cents=>(cents/100).toLocaleString("fr-FR",{style:"currency",currency:"EUR"});
function customizationHeading(icon,title){return `<div class="customization-heading"><img src="assets/customization/${icon}.webp" alt="" width="48" height="48"><h3>${title}</h3></div>`;}
async function openCheckout(c){
 const {data,error}=await sb.functions.invoke("suite-billing",{body:{action:"checkout",capsule_id:c.id,plan:c.plan}});
 if(error||!data?.url)throw new Error(data?.error||"Le paiement est momentanément indisponible. Votre préparation est conservée.");
 const target=new URL(data.url);if(target.protocol!=="https:"||target.hostname!=="checkout.stripe.com")throw new Error("Lien de paiement invalide.");
 location.href=target.href;
}
let ownerSessionEnded=false;
const ownerDownloadSession=new AbortController();
async function updateOwnedCapsule(c,payload){
 if(ownerSessionEnded)throw Error('Reconnectez-vous pour enregistrer votre capsule.');
 const {data,error}=await sb.from('capsules').update(payload).eq('id',c.id).select('id').single();
 if(error?.code==='PGRST116'||!error&&(!data?.id||data.id!==c.id)||ownerSessionEnded)throw Error('La capsule n’est plus accessible. Reconnectez-vous avant de réessayer.');
 if(error)throw error;
}
function authDestination(){if(qs.get("next")==="admin")return "admin.html";return qs.get("next")==="create"?"create.html?resume=1":"dashboard.html"}
async function signedInDestination(){
 if(qs.get("next")==="admin")return authDestination();
 const {data,error}=await sb.rpc('admin_status');if(error)throw Error('Vérification du compte impossible. Réessayez.');
 return data===true?'admin.html':authDestination();
}
function frenchAuthError(error){
 const code=error?.code||"",msg=String(error?.message||"");
 if(code==="invalid_credentials"||/Invalid login/i.test(msg))return "E-mail ou mot de passe incorrect.";
 if(code==="email_not_confirmed"||/Email not confirmed/i.test(msg))return "Confirmez votre adresse avec le lien reçu par e-mail.";
 if(code==="email_address_invalid"||/invalid.*email|email.*invalid|unable to validate email/i.test(msg))return "Saisissez une adresse e-mail valide.";
 if(["email_exists","user_already_exists"].includes(code)||/already registered|already.*exists/i.test(msg))return "Un compte existe déjà avec cette adresse. Connectez-vous ou utilisez « Mot de passe oublié ».";
 if(code==="weak_password"||/weak password|password.*(least|short|characters)/i.test(msg))return "Choisissez un mot de passe plus sûr, avec au moins 10 caractères.";
 if(code==="same_password")return "Choisissez un mot de passe différent de votre mot de passe actuel.";
 if(code.startsWith("over_")||error?.status===429||/rate limit|too many|security purposes/i.test(msg))return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
 if(["otp_expired","session_not_found","flow_state_expired"].includes(code)||/session missing|expired|invalid.*token/i.test(msg))return "Ce lien a expiré. Demandez un nouveau lien depuis « Mot de passe oublié ».";
 if(["signup_disabled","email_provider_disabled"].includes(code))return "La création de compte est momentanément indisponible.";
 if(code==="email_address_not_authorized"||/error sending|unable to send/i.test(msg))return "L’envoi de l’e-mail est momentanément indisponible. Réessayez plus tard.";
 if(/fetch|network|timeout/i.test(msg))return "Connexion au service impossible. Vérifiez votre connexion et réessayez.";
 if(msg==="Les mots de passe ne correspondent pas."||msg==="Vérification du compte impossible. Réessayez.")return msg;
 return "Une erreur est survenue. Réessayez dans quelques instants.";
}
async function initAuth(){
 const form=$("auth-form");if(!form)return;
 const status=$("status"),submit=form.querySelector('[type="submit"]'),adminAccess=qs.get("next")==="admin";
 if(adminAccess){
  document.title="Connexion à l’administration — La Suite";
  form.closest("section").querySelector(".eyebrow").textContent="Administration privée";
  const nav=document.querySelector(".suite-organizer-link");if(nav){nav.href="admin.html";nav.querySelector("span").textContent="Administration"}
  document.querySelector(".organizer-access-help").textContent="Utilisez votre compte habituel. Si vous avez oublié votre mot de passe, choisissez « Mot de passe oublié ».";
 }
 if(!configured)return show(status,"Le service de connexion est indisponible. Rechargez la page.",false);
 let mode=["signup","recovery","reset"].includes(qs.get("mode"))?qs.get("mode"):"login",pendingConfirmation=false,confirmationEmail="";
 function render(){
  pendingConfirmation=false;
  submit.hidden=false;
  form.querySelectorAll("input").forEach(input=>input.removeAttribute("aria-invalid"));
  const recovery=mode==="recovery",reset=mode==="reset";
  form.hidden=false;
  $("auth-title").textContent=({login:"Bienvenue dans votre espace",signup:"Créez votre compte",reset:"Retrouver votre accès",recovery:"Choisissez votre mot de passe"})[mode];
  if(qs.get("next")==="create"&&mode==="login")$("auth-title").textContent="Vous avez déjà un compte ?";
  if(adminAccess&&mode==="login")$("auth-title").textContent="Connexion à l’administration";
  $("auth-description").textContent=reset?"Recevez un lien pour définir ou réinitialiser votre mot de passe.":recovery?"Utilisez au moins 10 caractères pour sécuriser votre espace.":adminAccess?"Connectez-vous pour accéder à votre administration.":qs.get("next")==="create"?mode==="login"?"Connectez-vous pour continuer. Votre préparation est conservée.":"Créez votre compte pour continuer. Votre préparation est conservée.":"Retrouvez vos capsules et vos souvenirs.";
  $("email-field").hidden=recovery;$("email").required=!recovery;$("email").disabled=recovery;
  $("password-field").hidden=reset;$("password").required=!reset;$("password").disabled=reset;
  $("password-field").querySelector("small").hidden=mode==="login"||reset;
  document.querySelectorAll('[data-auth-mode]').forEach(button=>button.hidden=button.dataset.authMode===mode||(recovery&&button.dataset.authMode==='signup'));
  if(adminAccess){document.querySelector('[data-auth-mode="login"]').hidden=mode==="login";document.querySelector('[data-auth-mode="signup"]').hidden=true;document.querySelector('[data-auth-mode="reset"]').textContent="Mot de passe oublié";}
  $("password").minLength=mode==="login"?1:10;$("password").autocomplete=mode==="login"?"current-password":"new-password";
  $("password-confirm-field").hidden=!(recovery||mode==="signup");$("password-confirm").required=recovery||mode==="signup";$("password-confirm").disabled=!(recovery||mode==="signup");
  document.querySelector(".organizer-access-help").hidden=!reset;
  submit.textContent=({login:"Me connecter",signup:"Créer mon compte",reset:"Recevoir le lien",recovery:"Enregistrer mon mot de passe"})[mode];
  $("auth-options").hidden=false;
  $("resend-confirmation").hidden=true;
  status.textContent="";status.className="status";
 }
 render();
 sb.auth.onAuthStateChange((event,session)=>{
  if(event==="PASSWORD_RECOVERY"){mode="recovery";render()}
  else if(event==="SIGNED_IN"&&session?.user&&pendingConfirmation){
   queueMicrotask(async()=>{try{location.href=await signedInDestination()}catch(error){form.hidden=false;show(status,frenchAuthError(error),false)}});
  }
 });
 $("resend-confirmation").addEventListener("click",async()=>{
  const button=$("resend-confirmation");button.disabled=true;
  try{const{error}=await sb.auth.resend({type:"signup",email:confirmationEmail||$("email").value.trim(),options:{emailRedirectTo:new URL(authDestination(),location.href).href}});if(error)throw error;show(status,"Un nouveau lien de confirmation a été demandé. Vérifiez votre boîte mail et les indésirables.")}catch(e){show(status,frenchAuthError(e),false)}finally{button.disabled=false}
 });
 function chooseMode(next){if(submit.disabled||pendingConfirmation)return;mode=next;$("password").value="";$("password-confirm").value="";render();}
 document.querySelectorAll('[data-auth-mode]').forEach(b=>b.addEventListener('click',()=>chooseMode(b.dataset.authMode)));
 if(qs.get("next")==="create")try{const d=JSON.parse(localStorage.getItem("la_suite_create_draft")||"null");if(d?.email)$("email").value=d.email}catch(e){}
 const authError=new URLSearchParams(location.hash.slice(1)).get("error_description");
 if(authError){show(status,"Ce lien n’est plus valide. Demandez un nouveau lien avec « Mot de passe oublié ».",false);}
 const initial=await user();
 if(initial&&!["recovery","reset"].includes(mode)){try{location.href=await signedInDestination()}catch(e){show(status,e.message,false)}return;}
 form.addEventListener("submit",async e=>{
  e.preventDefault();if(pendingConfirmation||submit.disabled)return;
  form.querySelectorAll("input").forEach(input=>input.removeAttribute("aria-invalid"));
  const invalid=(id,message)=>{const input=$(id);input.setAttribute("aria-invalid","true");input.focus();show(status,message,false)};
  if(mode!=="recovery"&&(!$("email").value.trim()||$("email").validity.typeMismatch))return invalid("email","Saisissez une adresse e-mail valide.");
  if(mode!=="reset"&&!$("password").value)return invalid("password","Saisissez votre mot de passe.");
  if(["signup","recovery"].includes(mode)&&$("password").value.length<10)return invalid("password","Le mot de passe doit contenir au moins 10 caractères.");
  submit.disabled=true;
  const email=$("email").value.trim(),password=$("password").value;
  try{
   if((mode==="signup"||mode==="recovery")&&password!==$("password-confirm").value)throw new Error("Les mots de passe ne correspondent pas.");
   let result;
   if(mode==="reset"){
    const recoveryUrl=new URL("auth.html?mode=recovery",location.href);
    if(["admin","create"].includes(qs.get("next")))recoveryUrl.searchParams.set("next",qs.get("next"));
    result=await sb.auth.resetPasswordForEmail(email,{redirectTo:recoveryUrl.href});
    if(result.error)throw result.error;
    return show(status,"Si cette adresse est associée à un compte, un lien vous sera envoyé. Pensez à vérifier les indésirables.");
   }
   if(mode==="recovery"){
    result=await sb.auth.updateUser({password});if(result.error)throw result.error;
    location.href=await signedInDestination();return;
   }
   if(mode==="signup"){
    result=await sb.auth.signUp({email,password,options:{emailRedirectTo:new URL(authDestination(),location.href).href}});
    if(result.error)throw result.error;
    if(!result.data.session){
     pendingConfirmation=true;confirmationEmail=email;
     ["email-field","password-field","password-confirm-field","auth-options"].forEach(id=>$(id).hidden=true);
     form.querySelectorAll("input").forEach(input=>input.disabled=true);
     submit.hidden=true;$("resend-confirmation").hidden=false;
     $("password").value="";$("password-confirm").value="";
     $("auth-title").textContent="Vérifiez votre boîte mail";
     $("auth-description").textContent="Un lien de confirmation a été demandé pour "+email+".";
     return show(status,"Ouvrez l’e-mail La Suite et cliquez sur le lien pour confirmer votre adresse et accéder directement à votre espace. Pensez à vérifier les indésirables."+(qs.get('next')==='create'?" Votre capsule préparée sera reprise automatiquement dans ce navigateur pendant 24 h.":""));
    }
   }else{
    result=await sb.auth.signInWithPassword({email,password});if(result.error)throw result.error;
   }
   location.href=await signedInDestination();
  }catch(err){
   show(status,frenchAuthError(err),false);
  }finally{submit.disabled=pendingConfirmation}
 });
}

async function initCreate(){
 const form=$("create-capsule");if(!form)return;
 const status=$("status"),dateInput=$("wedding_date"),dateDisplay=$("wedding_date_display"),dateButton=$("wedding_date_button"),emailInput=$("email"),submit=form.querySelector('button[type="submit"]');
 const draftKey="la_suite_create_draft";
 const pad=n=>String(n).padStart(2,"0");
 const iso=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
 const tomorrow=new Date(parisDay()+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
 const minDate=tomorrow.toISOString().slice(0,10),maxDate=latestEventDate();
 $("wedding-date-help").textContent="Date possible jusqu’au "+fdate(maxDate)+".";
 const clearDraft=()=>{try{localStorage.removeItem(draftKey)}catch{}};
 const storeDraft=d=>{try{localStorage.setItem(draftKey,JSON.stringify(d));return true}catch{return false}};

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
  dateInput.min=minDate;dateInput.max=maxDate;
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
   if(!d||Date.now()-Number(d.saved_at||0)>24*60*60*1000){clearDraft();return null}
   return d;
  }catch(e){clearDraft();return null}
 }
 function validateDraft(d){
  if(!d?.couple||!d?.email)return"Complétez les champs obligatoires.";
  if(d.couple.length>50)return"Le nom de la capsule est limité à 50 caractères.";
  if(!/^\S+@\S+\.\S+$/.test(d.email))return"Adresse e-mail invalide.";
  if(!d?.wedding)return"Saisissez une date valide au format JJ/MM/AAAA.";
  if(d.wedding<minDate)return"Choisissez une date d'événement future.";
  if(d.wedding>maxDate)return"Choisissez une date au plus tard le "+frFromIso(maxDate)+" (deux ans maximum).";
  return"";
 }
 const validationFields=[[$("couple"),$("couple-error")],[dateDisplay,$("wedding-date-error")],[emailInput,$("email-error")]];
 function fieldError(input){
  const value=input.value.trim();
  if(input.id==="couple")return !value?"Indiquez le nom de votre capsule.":value.length>50?"Le nom est limité à 50 caractères.":"";
  if(input===dateDisplay){
   if(!value)return "Choisissez la date de votre événement.";
   const date=parseFrDate(value);
   return !date?"Saisissez une date valide au format JJ/MM/AAAA.":date<minDate?"Choisissez une date à partir de demain.":date>maxDate?"Choisissez une date au plus tard le "+frFromIso(maxDate)+" (deux ans maximum).":"";
  }
  return !value?"Indiquez votre adresse e-mail.":input.validity.typeMismatch||!/^\S+@\S+\.\S+$/.test(value)?"Saisissez une adresse e-mail valide.":"";
 }
 function renderFieldError(input,error){
  const message=fieldError(input);
  error.textContent=message;error.hidden=!message;
  if(message)input.setAttribute("aria-invalid","true");else input.removeAttribute("aria-invalid");
  return message;
 }
 function validateFields(){
  let first=null;
  validationFields.forEach(([input,error])=>{if(renderFieldError(input,error)&&!first)first=input});
  if(first){show(status,"Complétez ou corrigez les champs indiqués pour continuer.",false);first.focus();return false}
  return true;
 }
 validationFields.forEach(([input,error])=>input.addEventListener("input",()=>{
  if(input.getAttribute("aria-invalid")==="true")renderFieldError(input,error);
  if(validationFields.every(([field])=>field.getAttribute("aria-invalid")!=="true")&&status.dataset.validation){show(status,"");delete status.dataset.validation}
 }));
 dateInput.addEventListener("change",()=>{if(dateDisplay.getAttribute("aria-invalid")==="true")renderFieldError(dateDisplay,$("wedding-date-error"))});
 async function createCapsule(d,u){
  const err=validateDraft(d);if(err)return show(status,err,false);
  if(!u)return false;
  const access=await capsuleAccess();
  if(access.admin_only){location.replace('admin.html');return true;}
  if(!access.can_create){
   if(access.existing_slug){clearDraft();location.href="dashboard.html?slug="+encodeURIComponent(access.existing_slug);return true}
   if(submit)submit.disabled=false;show(status,access.reason,false);return false;
  }
  if(submit)submit.disabled=true;
  show(status,"Création de la capsule…");
  const existing=await sb.from("capsules").select("slug").eq("id",d.id).maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data){clearDraft();location.href="dashboard.html?slug="+encodeURIComponent(existing.data.slug);return true}
  const{data,error}=await sb.from("capsules").insert({
   id:d.id,
   plan:PLAN_NAMES[d.plan]?d.plan:"premium",
   owner_id:u.id,
   slug:slugify(d.couple)+"-"+rid(),
   couple_name:d.couple,
   wedding_date:d.wedding,
   qr_style:"fleurs",qr_font:"elegant",qr_color:"#95677e",
   welcome_config:{style:"fleurs",font:"elegant",color:"#95677e"},
   welcome_message:null,
   unlock_date:null
  }).select("id,slug,guest_token").single();
  if(error){if(submit)submit.disabled=false;show(status,"Création impossible. Votre préparation est conservée ; réessayez dans quelques instants.",false);return false}
  clearDraft();
  location.href="dashboard.html?slug="+encodeURIComponent(data.slug);
  return true
 }

 if(!configured){
  show(status,"Le service de connexion n'a pas pu être chargé. Rechargez la page.",false);
  return
 }

 const currentUser=await user();
 if(currentUser){
  try{const access=await capsuleAccess();if(access.admin_only){location.replace('admin.html');return;}if(!access.can_create){
   clearDraft();
   if(access.existing_slug){location.href="dashboard.html?slug="+encodeURIComponent(access.existing_slug);return}
   show(status,access.reason,false);submit.disabled=true;return;
  }}catch(error){show(status,"Connexion interrompue. Votre préparation est conservée ; réessayez.",false);submit.disabled=false}
 }
 const pending=readDraft();
 if(currentUser){emailInput.value=currentUser.email;emailInput.readOnly=true;$("email-help").textContent="Capsule enregistrée dans votre compte."}
 if(pending){$("couple").value=pending.couple;dateInput.value=pending.wedding;dateDisplay.value=frFromIso(pending.wedding);if(!currentUser)emailInput.value=pending.email}
 $("plan").value=PLAN_NAMES[qs.get("plan")]?qs.get("plan"):(pending?.plan||"premium");
 const planDetails={photo:"1 Go · Photos et textes.",audio:"2 Go · Photos, textes et audio.",premium:"5 Go · Photos, textes, audio et vidéo."};
 const updatePlanDetails=()=>{$("plan-details").textContent=planDetails[$("plan").value]||planDetails.premium};
 $("plan").addEventListener("change",updatePlanDetails);updatePlanDetails();
 if(qs.get("resume")==="1"&&currentUser&&pending){
  pending.id=pending.id||crypto.randomUUID();
  storeDraft(pending);
  try{if(await createCapsule(pending,currentUser))return}
  catch(error){show(status,"Création impossible. Votre préparation est conservée ; réessayez dans quelques instants.",false)}
  submit.disabled=false;
 }

 form.addEventListener("submit",async e=>{
  e.preventDefault();
  e.stopPropagation();
  if(!validateFields()){status.dataset.validation="true";return}
  delete status.dataset.validation;
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

  if(!storeDraft(d)&&!currentUser){show(status,"Votre navigateur empêche de conserver la préparation. Connectez-vous ou créez votre compte, puis revenez remplir ce formulaire.",false);let link=status.querySelector('a');if(!link){link=document.createElement('a');link.href='auth.html?next=create';link.textContent='Créer mon compte ou me connecter';status.append(document.createElement('br'),link)}return}
  if(submit)submit.disabled=true;

  try{
   const u=await user();

   if(u)return await createCapsule(d,u);
   location.href="auth.html?next=create";
  }catch(err){
   if(submit)submit.disabled=false;
   const msg=String(err?.message||"");
   if(/rate limit|too many requests|429/i.test(msg)){
    return show(status,"Trop de liens ont été demandés récemment. Le service e-mail Supabase a temporairement atteint sa limite. Réessayez plus tard ou utilisez une adresse déjà connectée.",false)
   }
   show(status,"Impossible de continuer : "+(msg||"erreur inconnue"),false);
  }
 })
 form.noValidate=true;
}


let guestState=null,guestType="text",guestBusy=false,guestTransaction=null,guestSelectionVersion=0;
const GUEST_LIMITS={image:10000000,audio:20000000,video:50000000};
function parisDay(value=new Date()){
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(value);
 return ["year","month","day"].map(k=>parts.find(p=>p.type===k).value).join("-");
}
function addMonthsClamped(day,months){
 const [y,m,d]=day.split("-").map(Number),last=new Date(Date.UTC(y,m-1+months+1,0)).getUTCDate();
 return new Date(Date.UTC(y,m-1+months,Math.min(d,last))).toISOString().slice(0,10);
}
const guestIdentities=new Map();
function guestIdentity(){
 const token=qs.get("t")||qs.get("token"),key="la_suite_guest:"+token;
 if(guestIdentities.has(key))return guestIdentities.get(key);
 let id;try{id=localStorage.getItem(key)}catch{}
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||""))id=crypto.randomUUID();
 guestIdentities.set(key,id);try{localStorage.setItem(key,id)}catch{}
 return id;
}
async function guestInvoke(body){
 if(guestIsPreview){
  if(!guestPreviewState)throw Error('Ouvrez cet aperçu depuis votre espace organisateur.');
  if(body.action==='get_status')return {...guestPreviewState};
  if(body.action==='get_intro')return {signed_url:guestPreviewState.preview_intro_url,media_type:guestPreviewState.preview_intro_type};
  throw Error('Mode aperçu : aucun souvenir ne peut être envoyé.');
 }
 if(["init_media","submit_text"].includes(body.action))body={...body,guest_id:guestIdentity()};
 const r=await sb.functions.invoke("guest-upload",{body});
 if(r.error||r.data?.error){
  let message=r.data?.error;
  if(!message&&r.error?.context?.json)try{message=(await r.error.context.json()).error}catch(e){}
  throw new Error(message||"Connexion interrompue. Votre souvenir reste sur cette page : réessayez.");
 }
 return r.data;
}
function setGuestMode(mode){
 const wasCapturing=recorderPreparing||recorder?.state==="recording";recorderGeneration++;recorderPreparing=false;stopRecorder();stopStream();showCapture("");
 if(wasCapturing&&!guestBusy)$("guest-message").querySelector('[type="submit"]').disabled=false;
 document.querySelectorAll(".media-panel").forEach(p=>p.classList.remove("active"));
 $(mode+"-panel")?.classList.add("active");
 document.querySelectorAll("[data-media-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mediaMode===mode));
 ["video","audio"].forEach(k=>{$("prepare-"+k).disabled=false;$("start-"+k).disabled=false;$("prepare-"+k).hidden=false;$("start-"+k).hidden=true;$("stop-"+k).hidden=true;$(k+"-countdown").hidden=true;$(k+"-timer").hidden=true});
 $("audio-indicator").textContent="Microphone prêt à être activé";
}
function chooseGuestType(type){
 guestType=type;guestSelectionVersion++;resetPreview();guestTransaction=null;
 if(!guestBusy)$("guest-message").querySelector('[type="submit"]').disabled=false;show($("status"),"");
 document.querySelectorAll("[data-memory-type]").forEach(b=>{const selected=b.dataset.memoryType===type;b.classList.toggle("active",selected);b.setAttribute("aria-pressed",String(selected))});
 $("capture-choices").hidden=type==="text";$("file-help").hidden=type==="text";
 const importButton=document.querySelector('[data-media-mode="upload"]');
 importButton.querySelector('.media-action-label').textContent=type==="image"?"Choisir une photo":type==="audio"?"Choisir un audio":"Choisir une vidéo";
 importButton.querySelector('i').className=type==="image"?'fa-regular fa-images':type==="audio"?'fa-solid fa-music':'fa-regular fa-file-video';
 $('import-memory-help').textContent=type==='image'?'Depuis votre galerie':'Depuis vos fichiers';$("message_text").required=type==="text";
 $("message-label").innerHTML=type==="text"?"Votre petit mot":'Un petit mot <span class="optional">(facultatif)</span>';
 $("message_text").placeholder=type==="text"?"Écrivez ce que vous aimeriez leur dire…":"Quelques mots pour accompagner votre souvenir…";
 const messageField=$('guest-message-field'),extras=$('guest-extras');
 (type==='text'?$('guest-text-content'):$('guest-extras-body')).prepend(messageField);extras.open=false;
 extras.hidden=type==='text';$('guest-limits').hidden=type==='text';
 const capture=$("capture-memory");capture.dataset.mediaMode=type==="image"?"photo":type;
 capture.querySelector('.media-action-label').textContent=type==="image"?"Prendre une photo":type==="audio"?"M’enregistrer":"Me filmer";
 capture.querySelector('i').className=type==='image'?'fa-solid fa-camera':type==='audio'?'fa-solid fa-microphone':'fa-solid fa-video';
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
  const timeout=setTimeout(()=>finish(new Error("La durée de ce fichier est illisible. Choisissez un autre fichier.")),10000);
  let finished=false;
  function finish(error){if(finished)return;finished=true;const duration=media.duration;clearTimeout(timeout);media.onloadedmetadata=null;media.onerror=null;media.removeAttribute("src");URL.revokeObjectURL(url);error?reject(error):resolve(duration)}
  media.preload="metadata";media.onloadedmetadata=()=>Number.isFinite(media.duration)&&media.duration>0?finish():finish(new Error("La durée de ce fichier est illisible. Enregistrez directement ici."));
  media.onerror=()=>finish(new Error("Ce fichier ne peut pas être lu. Essayez un autre format."));media.src=url;
 });
}
async function acceptGuestFile(file,type,duration,interruption){
 const version=++guestSelectionVersion;resetPreview();guestTransaction=null;
 if(!file)return;
 try{
  $("guest-message").querySelector('[type="submit"]').disabled=true;showCapture("Préparation de votre souvenir…");
  if(file.size===0)throw new Error("Aucun enregistrement récupéré. Réactivez la caméra ou le micro et recommencez.");
  const normalizedType=file.type.split(";")[0];if(group(normalizedType)!==type)throw new Error("Choisissez un fichier correspondant au type de souvenir sélectionné.");
  if(file.size>GUEST_LIMITS[type])throw new Error(type==="image"?"La photo dépasse 10 Mo.":type==="audio"?"L’audio dépasse 20 Mo.":"La vidéo dépasse 50 Mo.");
  if(type==="image")file=await optimizeGuestPhoto(file);
  else{duration=duration||await guestMediaDuration(file);if(duration>(type==="video"?60.1:180.1))throw new Error(type==="video"?"Choisissez une vidéo d’une minute maximum.":"Choisissez un audio de 3 minutes maximum.")}
  if(version!==guestSelectionVersion)return;
  if(file.size>GUEST_LIMITS[type])throw new Error("Ce souvenir dépasse la taille autorisée.");
  if(normalizedType!==file.type&&type!=="image")file=new File([file],file.name,{type:normalizedType});
  preview(file,type);selectedMedia.duration=duration;showCapture(interruption||"Votre souvenir est prêt.",!interruption);
 }catch(error){if(version===guestSelectionVersion)showCapture(error.message,false)}
 finally{if(version===guestSelectionVersion)$("guest-message").querySelector('[type="submit"]').disabled=false}
}
let deliveryTouched=false;
function chooseDelivery(choice){
 const now=choice==="now";$("deliver-now").checked=now;$("delivery-date-wrap").hidden=choice!=="custom";$("delivery_date").required=!now;
 $("delivery-done").hidden=choice!=="custom";
 document.querySelectorAll("[data-delivery]").forEach(b=>{const active=b.dataset.delivery===choice;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active))});
 if(now)$("delivery_date").value="";
 else if(choice!=="custom")$("delivery_date").value=addMonthsClamped(parisDay(),Number(choice));
 else{$("delivery_date").focus()}
 updateDeliveryHelp();guestTransaction=null;
 if(choice!=="custom"&&$('delivery-dialog').open)$('delivery-dialog').close();
}
function updateDeliveryHelp(){
 $("delivery-help").hidden=$("deliver-now").checked;
 $("delivery-help").textContent=$("deliver-now").checked?"":$("delivery_date").value?"Il restera secret jusqu’au "+fdate($("delivery_date").value)+".":"Choisissez une date. Votre souvenir restera secret jusqu’à ce jour.";
 $('delivery-value').textContent=$('deliver-now').checked?'Maintenant':$('delivery_date').value?fdate($('delivery_date').value):'Choisir une date';
}
function initGuestControls(){
 document.querySelectorAll("[data-memory-type]").forEach(b=>b.addEventListener("click",()=>{if(!guestBusy)chooseGuestType(b.dataset.memoryType)}));
 document.querySelectorAll("[data-media-mode]").forEach(b=>b.addEventListener("click",()=>{if(!guestBusy){setGuestMode(b.dataset.mediaMode);if(b.dataset.mediaMode==="upload")$("media-file").click();else if(b.dataset.mediaMode==="photo")$("photo-file").click()}}));
 $("media-file").addEventListener("change",e=>acceptGuestFile(e.target.files?.[0],guestType));
 $("photo-file").addEventListener("change",e=>acceptGuestFile(e.target.files?.[0],"image"));
 $("remove-media").addEventListener("click",()=>{guestSelectionVersion++;resetPreview();guestTransaction=null;$("media-file").value="";$("photo-file").value="";showCapture("")});
 for(const kind of ["video","audio"]){
  $("prepare-"+kind).addEventListener("click",()=>prepareRecorder(kind).catch(error=>showCapture(captureError(error,kind),false)));
  $("start-"+kind).addEventListener("click",()=>startRecorder(kind).catch(()=>showCapture("L’enregistrement n’a pas démarré. Réessayez ou choisissez un fichier.",false)));
  $("stop-"+kind).addEventListener("click",stopRecorder);
 }
 document.querySelectorAll("[data-delivery]").forEach(b=>b.addEventListener("click",()=>{deliveryTouched=true;chooseDelivery(b.dataset.delivery)}));
 let previousDelivery;
 for(const id of ['guest-concept-dialog','guest-welcome-dialog','delivery-dialog']){
  const dialog=$(id);
  dialog.querySelector('.guest-dialog-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()});
  dialog.addEventListener('close',()=>{
   if(id==='guest-welcome-dialog')$('organizer-intro').pause();
   if(id==='delivery-dialog'&&!$('deliver-now').checked&&!$('delivery_date').validity.valid&&previousDelivery){
    chooseDelivery(previousDelivery.choice);$('delivery_date').value=previousDelivery.date;updateDeliveryHelp();
   }
  });
 }
 $('guest-concept-open').addEventListener('click',()=>$('guest-concept-dialog').showModal());
 $('guest-welcome-open').addEventListener('click',()=>$('guest-welcome-dialog').showModal());
 $('delivery-summary').addEventListener('click',()=>{if(guestBusy)return;previousDelivery={choice:document.querySelector('[data-delivery].active')?.dataset.delivery||'now',date:$('delivery_date').value};$('delivery-dialog').showModal()});
 $('delivery-done').addEventListener('click',()=>{if($('delivery_date').reportValidity())$('delivery-dialog').close()});
 $("delivery_date").addEventListener("change",()=>{deliveryTouched=true;guestTransaction=null;updateDeliveryHelp()});
 $("delivery_date").min=parisDay();
 window.addEventListener("beforeunload",e=>{if(!guestIsPreview&&(guestBusy||selectedMedia||$("message_text")?.value.trim())){e.preventDefault();e.returnValue=""}});
 if(guestIsPreview)document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]'))window.parent.postMessage({type:'la-suite-guest-preview-close'},location.origin)});
 document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")interruptCapture("L’enregistrement a été arrêté lorsque vous avez quitté la page. Vérifiez l’aperçu avant l’envoi.")});
 window.addEventListener("pagehide",()=>{recorderGeneration++;recorderPreparing=false;stopRecorder();stopStream()});
}
function renderGuestState(state){
 const el=$("guest-state");const messages={
 suspended:"Les dépôts sont temporairement en pause. Réessayez plus tard.",
 scheduled:"Les dépôts ouvriront le "+fParis(state.opens_at)+".",
 closed:"Les dépôts sont terminés. Les souvenirs déjà envoyés seront dévoilés aux dates choisies.",
 expired:"La période de conservation de cette capsule est terminée.",
 missing_date:"Cette capsule n’est pas encore prête à recevoir des souvenirs.",
 full:"La capsule est pleine pour les fichiers. Vous pouvez toujours laisser un petit mot.",
 open:state.legacy?"Vous pouvez laisser un souvenir dans cette capsule.":"Dépôts jusqu’au "+fParis(new Date(new Date(state.closes_at).getTime()-1000).toISOString())+" à 23 h 59 (Paris)."
 };
 el.textContent=messages[state.state]||"Cette capsule n’est pas disponible.";el.dataset.state=state.state;
 $("guest-message").hidden=!["open","full"].includes(state.state);
 const allowed=state.effective_plan==="photo"?["image","text"]:state.effective_plan==="audio"?["image","audio","text"]:["image","audio","video","text"];
 document.querySelectorAll("[data-memory-type]").forEach(b=>b.hidden=!allowed.includes(b.dataset.memoryType)||(state.state==="full"&&b.dataset.memoryType!=="text"));
 if(!allowed.includes(guestType)||state.state==="full")chooseGuestType("text");
 const max=parisDay(new Date(new Date(state.delivery_before).getTime()-1000));$("delivery_date").max=max;
 document.querySelectorAll("[data-delivery]").forEach(b=>{if(/^\d+$/.test(b.dataset.delivery))b.hidden=addMonthsClamped(parisDay(),Number(b.dataset.delivery))>max});
 if(!deliveryTouched)chooseDelivery("now");
}
function uploadGuestFile(file,transaction){
 if(transaction.uploaded)return Promise.resolve();
 if(!window.tus)throw new Error("Le service d’envoi n’a pas chargé. Gardez cette page ouverte et réessayez.");
 return new Promise((resolve,reject)=>{
  const progress=$("upload-progress");progress.hidden=false;
  if(!transaction.upload){
   const endpoint=cfg.SUPABASE_URL.replace(".supabase.co",".storage.supabase.co")+"/storage/v1/upload/resumable/sign";
   transaction.upload=new tus.Upload(file,{endpoint,headers:{"x-signature":transaction.reserved.token,apikey:cfg.SUPABASE_ANON_KEY,"x-upsert":"false"},
    chunkSize:6*1024*1024,uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,retryDelays:[0,1000,3000,5000],
    onShouldRetry:error=>{const code=error.originalResponse?.getStatus()||0;return code===0||code===408||code===409||code===423||code>=500},
    fingerprint:()=>Promise.resolve("la-suite:"+transaction.requestId),
    metadata:{bucketName:"capsule-media",objectName:transaction.reserved.path,contentType:file.type,cacheControl:"3600"}});
  }
  transaction.upload.options.onProgress=(sent,total)=>{const percent=Math.round(sent/total*100);progress.value=percent;show($("status"),"Envoi de votre souvenir : "+percent+" %. Gardez cette page ouverte.")};
  transaction.upload.options.onError=error=>{
   const code=error.originalResponse?.getStatus()||0;
   if(code===401||code===403){
    // Renew the signed permission for the same reservation on the next attempt.
    transaction.reserved=null;transaction.upload=null;
    return reject(new Error("L’autorisation d’envoi a expiré ou a été refusée. Gardez cette page ouverte et appuyez sur Réessayer pour la renouveler."));
   }
   if(code===413)return reject(new Error("Ce fichier dépasse la taille autorisée. Choisissez un fichier plus léger."));
   reject(new Error("L’envoi a été interrompu. Gardez cette page ouverte et appuyez sur Réessayer pour le reprendre."));
  };
  transaction.upload.options.onSuccess=()=>{transaction.uploaded=true;resolve()};
  transaction.upload.start();
 });
}
async function initCapsule(){
 if(!$("capsule-title"))return;
 const token=qs.get("t")||qs.get("token");
 if(guestIsPreview){
  if(window.parent===window){$('guest-state').textContent='Ouvrez cet aperçu depuis votre espace organisateur.';return}
  $('guest-state').textContent='Préparation de l’aperçu…';
  try{await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{window.removeEventListener('message',receive);reject(Error('L’aperçu n’a pas chargé. Fermez-le puis réessayez.'))},10000);
   function receive(e){
    if(e.origin!==location.origin||e.source!==window.parent||e.data?.type!=='la-suite-guest-preview'||!e.data.capsule)return;
    clearTimeout(timeout);window.removeEventListener('message',receive);guestPreviewState={...e.data.capsule,state:'open',legacy:true};resolve();
   }
   window.addEventListener('message',receive);window.parent.postMessage({type:'la-suite-guest-preview-ready'},location.origin);
  })}catch(error){$('guest-state').textContent=error.message;return}
 }else if(!configured||!token){$("guest-state").textContent="Lien de capsule invalide.";return}
 initGuestControls();chooseGuestType("text");
 let refreshing=false,refreshVersion=0;
 async function refreshGuestState(){
  if(refreshing)return;refreshing=true;const version=++refreshVersion;
  $("organizer-intro").pause();
  $("guest-message").hidden=true;$("guest-retry").hidden=true;$("guest-state").textContent="Chargement de la capsule…";
  try{
   guestState=await guestInvoke({action:"get_status",guest_token:token});
   window.SuiteWelcome.apply(guestState.welcome_config);
   $("capsule-title").textContent=guestState.couple_name;$("capsule-title").closest(".capsule-hero").classList.toggle("guest-long-name",String(guestState.couple_name||"").length>24);$("capsule-welcome").textContent=guestState.welcome_message||"";
   $("capsule-welcome").hidden=!guestState.welcome_message;$("intro-section").hidden=!guestState.welcome_message;
   $('guest-welcome-open').hidden=!guestState.welcome_message;
   $("organizer-intro").hidden=true;$("organizer-intro-image").hidden=true;
   renderGuestState(guestState);
   if(guestIsPreview)$('guest-state').textContent='Mode aperçu · Aucun souvenir ne sera envoyé.';
   if(guestState.has_intro&&!["expired","suspended"].includes(guestState.state))guestInvoke({action:"get_intro",guest_token:token}).then(r=>{
    if(version===refreshVersion&&r.signed_url){const media=$(r.media_type==="image"?"organizer-intro-image":"organizer-intro");media.src=r.signed_url;media.hidden=false;$("intro-section").hidden=false;$('guest-welcome-open').hidden=false}
   }).catch(()=>{});
  }catch(error){$("guest-state").textContent=error.message;$("guest-retry").hidden=false}
  finally{refreshing=false}
 }
 $("guest-retry").addEventListener("click",refreshGuestState);
 await refreshGuestState();
 if(guestIsPreview)window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='la-suite-guest-preview'||!event.data.capsule)return;
  guestPreviewState={...event.data.capsule,state:'open',legacy:true};refreshGuestState();
 });
 $("another-memory").addEventListener("click",async()=>{
  $("guest-success").hidden=true;chooseGuestType("text");deliveryTouched=false;chooseDelivery("now");show($("status"),"");
  await refreshGuestState();
  $("guest-state").scrollIntoView({behavior:"smooth",block:"start"});
 });
 $("guest-message").addEventListener("submit",async e=>{
  e.preventDefault();if(guestBusy)return;
  const name=$("guest_name").value.trim(),text=$("message_text").value.trim(),instant=$("deliver-now").checked,date=$("delivery_date").value,status=$("status");
  if(recorder?.state==="recording"||recorderPreparing)return showCapture("Terminez votre enregistrement avant l’envoi.",false);
  if(guestType!=="text"&&!selectedMedia)return showCapture("Ajoutez votre souvenir, ou choisissez « Petit mot ».",false);
  if(guestType==="text"&&!text)return show(status,"Écrivez votre petit mot.",false);
  if(!instant&&(!date||date<$("delivery_date").min||date>$("delivery_date").max))return show(status,"Choisissez une date entre aujourd’hui et le "+fdate($("delivery_date").max)+".",false);
  if(guestIsPreview){
   $('guest-success').querySelector('h2').textContent='Aperçu de la confirmation';
   $('guest-success-date').textContent='Simulation : aucun souvenir n’a été enregistré.'+(instant?'':' Découverte choisie : '+fdate(date)+'.');
   e.target.reset();resetPreview();$('guest-message').hidden=true;$('guest-success').hidden=false;$('guest-success').focus();return;
  }
  const key=JSON.stringify([name,text,instant,date,selectedMedia?.url]);
  if(!guestTransaction||guestTransaction.key!==key)guestTransaction={key,requestId:crypto.randomUUID(),delivery:instant?new Date().toISOString():date};
  const transaction=guestTransaction,button=e.target.querySelector('[type="submit"]');
  const fields=[...e.target.querySelectorAll("input,textarea,button")],disabled=fields.map(f=>f.disabled);
  guestBusy=true;fields.forEach(f=>f.disabled=true);button.querySelector("span").textContent="Envoi en cours…";$("upload-progress").value=0;
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
   $("guest-success-date").textContent=instant?"Merci pour votre souvenir !":"Il restera secret jusqu’au "+fdate(date)+".";
   e.target.reset();resetPreview();guestTransaction=null;$("guest-message").hidden=true;$("guest-success").hidden=false;$("guest-success").focus();$("guest-success").scrollIntoView({behavior:"smooth",block:"center"});
  }catch(error){show(status,error.message,false);button.querySelector("span").textContent="Réessayer l’envoi"}
  finally{guestBusy=false;fields.forEach((f,i)=>f.disabled=disabled[i]);$("upload-progress").hidden=true;if(!$("guest-success").hidden)button.querySelector("span").textContent="Envoyer mon souvenir"}
 });
}

function videoDuration(file){return guestMediaDuration(file)}

function introKind(c){return c.intro_path?(/\.(jpg|jpeg|png|webp)$/i.test(c.intro_path)?"image":"video"):c.welcome_message?"text":"none"}
let introPreviewRevision=0;
async function renderIntroPreview(c){
 const wrap=$("intro-preview-wrap");if(!wrap)return;
 const revision=++introPreviewRevision;
 wrap.replaceChildren();
 const card=wrap.closest(".intro-preview-card");if(card)card.hidden=introKind(c)==="none"&&!organizerState.intro;
 wrap.hidden=introKind(c)==="none";
 if(c.welcome_message){const text=document.createElement("p");text.className="intro-text-preview";text.textContent=c.welcome_message;wrap.append(text)}
 if(!c.intro_path)return;
 const{data,error}=await sb.storage.from("capsule-media").createSignedUrl(c.intro_path,300);
 if(revision!==introPreviewRevision||ownerSessionEnded)return;
 if(error||!data?.signedUrl){wrap.append(document.createTextNode("Aperçu indisponible. Votre message d’accueil reste enregistré."));return}
 const media=document.createElement(introKind(c)==="image"?"img":"video");media.className="intro-preview";media.src=data.signedUrl;
 if(media.tagName==="IMG")media.alt="Votre image d’accueil";else{media.controls=true;media.playsInline=true}
 wrap.append(media);
}
function uploadIntro(c){
 if(introSavePending)return introSavePending;
 if(!organizerState.intro)return Promise.resolve(true);
 introSavePending=performIntroSave(c).finally(()=>introSavePending=null);return introSavePending;
}
async function performIntroSave(c){
 const kind=$("intro-kind").value,f=$("intro-file")?.files?.[0],s=$("intro-status"),button=$("upload-intro");
 const text=$("intro-text").value.trim();
 if(kind==="text"&&!text){show(s,"Écrivez votre message d’accueil.",false);return false}
 let path=null,introFinalized=false;
 button.disabled=true;organizerState.saving++;saveIndicator();
 const fields=[...document.querySelectorAll(".intro-editor-fields input,.intro-editor-fields select,.intro-editor-fields textarea")];fields.forEach(el=>el.disabled=true);
 try{
  if(kind==="image"||kind==="video"){
   if(!f){if(introKind(c)!==kind||!c.intro_path)throw new Error("Choisissez un fichier pour votre message d’accueil.");path=c.intro_path}
   else{
    const allowed=kind==="image"?["image/jpeg","image/png","image/webp"]:["video/mp4","video/quicktime","video/webm"];
    if(!allowed.includes(f.type))throw new Error(kind==="image"?"Choisissez une image JPG, PNG ou WebP.":"Choisissez une vidéo MP4, MOV ou WebM.");
    if(f.size>(kind==="image"?10000000:50000000))throw new Error(kind==="image"?"L’image dépasse 10 Mo.":"La vidéo dépasse 50 Mo.");
    if(kind==="video"){const duration=await videoDuration(f);if(!Number.isFinite(duration)||duration>12.05)throw new Error("La vidéo doit durer 12 secondes maximum.")}
    show(s,"Envoi du message d’accueil…");
    const prepared=await guestInvoke({action:"init_intro",capsule_id:c.id,file_type:f.type,file_size:f.size});
    path=prepared.path;
    const up=await sb.storage.from("capsule-media").uploadToSignedUrl(path,prepared.token,f,{contentType:f.type,upsert:false});if(up.error)throw up.error;
    await guestInvoke({action:"finalize_intro",capsule_id:c.id,path});
    introFinalized=true;
   }
  }
  const payload={intro_path:path,welcome_message:kind==="none"?null:text||null};
  await updateOwnedCapsule(c,payload);
  Object.assign(c,payload);$("intro-file").value="";organizerState.intro=false;organizerState.error=false;await renderIntroPreview(c);renderIntroDraft(c);
  show(s,"");
  return true;
 }catch(e){organizerState.error=true;show(s,e.message||"Impossible d’enregistrer votre message d’accueil.",false);return false}finally{button.disabled=false;fields.forEach(el=>el.disabled=false);organizerState.saving--;saveIndicator()}
}
function syncIntroFilePicker(c){
 const file=$('intro-file'),button=$('choose-intro-file'),name=$('intro-file-name');if(!file||!button||!name)return;
 const kind=$('intro-kind').value,existing=introKind(c)===kind&&Boolean(c.intro_path);
 button.textContent=kind==='image'?(existing?'Changer l’image':'Choisir une image'):(existing?'Changer la vidéo':'Choisir une vidéo');
 const selected=file.files[0];name.textContent=selected?.name||'';name.title=name.textContent;name.hidden=!selected;
}
function renderIntroDraft(c){
 const wrap=$("intro-live-preview");if(!wrap)return;syncIntroFilePicker(c);
 $("upload-intro").hidden=!organizerState.intro;
 $("intro-preview-wrap").hidden=organizerState.intro||introKind(c)==="none";
 wrap.replaceChildren();if(introPreviewUrl){URL.revokeObjectURL(introPreviewUrl);introPreviewUrl=null}
 const card=wrap.closest(".intro-preview-card");if(card)card.hidden=!organizerState.intro&&introKind(c)==="none";
 if(!organizerState.intro){wrap.hidden=true;return}wrap.hidden=false;
 const kind=$("intro-kind").value,file=$("intro-file").files[0];
 const ready=kind==='text'?Boolean($('intro-text').value.trim()):Boolean(file&&((kind==='image'&&['image/jpeg','image/png','image/webp'].includes(file.type))||(kind==='video'&&file.type.startsWith('video/'))));
 if(!ready){wrap.hidden=true;if(card)card.hidden=true;return;}
 const title=document.createElement("strong");title.textContent="Aperçu";wrap.append(title);
 if(kind==="text"){const text=document.createElement("p");text.className="intro-text-preview";text.textContent=$("intro-text").value||"Votre texte apparaîtra ici.";wrap.append(text)}
 else if(file&&((kind==="image"&&["image/jpeg","image/png","image/webp"].includes(file.type))||(kind==="video"&&file.type.startsWith("video/")))){
  const media=document.createElement(kind==="image"?"img":"video");introPreviewUrl=URL.createObjectURL(file);media.src=introPreviewUrl;media.className="intro-preview";if(kind==="image")media.alt="Aperçu de l’image sélectionnée";else{media.controls=true;media.preload="metadata"}wrap.append(media);
 }else{const hint=document.createElement("p");hint.textContent=kind==="none"?"Les invités accéderont directement au dépôt de souvenirs.":"Choisissez un fichier compatible pour afficher son aperçu.";wrap.append(hint)}
}
function setupIntro(c){
 const kind=$("intro-kind"),file=$("intro-file");kind.value=introKind(c);
 function update(){
  $("intro-text-field").hidden=kind.value==="none";
  $("intro-media-field").hidden=kind.value!=="image"&&kind.value!=="video";
  file.accept=kind.value==="image"?"image/jpeg,image/png,image/webp":"video/mp4,video/quicktime,video/webm";
  $("intro-file-label").textContent=kind.value==="image"?"Votre image":"Votre vidéo";
  $("intro-file-help").textContent=kind.value==="image"?"JPG, PNG ou WebP · 10 Mo maximum.":"MP4, MOV ou WebM · 12 secondes et 50 Mo maximum.";
  $("upload-intro").textContent=kind.value==="none"?"Retirer l’accueil":"Enregistrer l’accueil";syncIntroFilePicker(c);
 }
 $('choose-intro-file').addEventListener('click',()=>file.click());
 kind.addEventListener("change",()=>{file.value="";update();markDirty("intro");renderIntroDraft(c);show($("intro-status"),"")});update();
 file.addEventListener("change",()=>{markDirty("intro");renderIntroDraft(c);show($("intro-status"),"")});
 $("intro-text").addEventListener("input",()=>{markDirty("intro");renderIntroDraft(c)});
 $("upload-intro").addEventListener("click",()=>uploadIntro(c));renderIntroPreview(c);renderIntroDraft(c);
}
const DEFAULT_CARD_TITLE="Notre capsule temporelle";
const DEFAULT_CARD_NOTE="Laissez-nous un souvenir à découvrir plus tard.";
const OLD_CARD_NOTE="Laissez-nous un souvenir à découvrir plus tard, à la date que vous choisissez.";
const OLD_CARD_EXPLANATIONS=["une photo ou un texte","une photo, un audio ou un texte","une photo, un audio, une vidéo ou un texte"].map(formats=>"Flashez ce QR code et déposez-y "+formats+". Choisissez la manière la plus naturelle de partager un souvenir avec nous.");
function capsulePlan(c){return window.SuiteDesign.effectivePlan(c)}
function defaultCardExplanation(plan){
 const formats={photo:"une photo ou un texte",audio:"une photo, un audio ou un texte",premium:"une photo, un audio, une vidéo ou un texte"};
 return "Scannez ce QR code pour déposer "+(formats[plan]||formats.premium)+".";
}
function cardDefault(value,old,fallback,optional=false){return value==null||(!optional&&!value)||value===old?fallback:String(value)}

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
  title:cardDefault(c.print_title,"Laissez-nous un souvenir",c.couple_name||DEFAULT_CARD_TITLE).slice(0,42),
  note:cardDefault(c.print_note===OLD_CARD_NOTE?null:c.print_note,"Scannez ce code pour nous laisser un souvenir.",DEFAULT_CARD_NOTE,true).slice(0,120),
  explanation:cardDefault(OLD_CARD_EXPLANATIONS.includes(c.print_explanation)?null:c.print_explanation,"Vidéo, audio ou photo : choisissez la manière la plus naturelle de partager un souvenir avec nous.",defaultCardExplanation(capsulePlan(c)),true).slice(0,240),
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
  print_title:($("print-title")?.value||c.couple_name||DEFAULT_CARD_TITLE).trim().slice(0,42),
  print_note:($("print-note")?.value??DEFAULT_CARD_NOTE).trim().slice(0,120),
  print_explanation:($("print-explanation")?.value??defaultCardExplanation(capsulePlan(c))).trim().slice(0,240),
  qr_font:$("qr-font")?.value||"elegant",
  qr_style:$("qr-style")?.value||"romantic",
  qr_size:QR_LARGE_SIZE,
  qr_show_initials:Boolean($("qr-show-initials")?.checked),
  qr_show_brand:true,
  welcome_config:window.SuiteWelcome.collectShared?.()||{...window.SuiteWelcome.options(c.welcome_config||{}),...window.SuiteDesign.fields(c),style:window.SuiteDesign.styles.some(s=>s.id===$("qr-style")?.value)||$("qr-style")?.value==="custom"?$("qr-style").value:(c.welcome_config?.style||"capsule"),font:$("qr-font")?.value||"elegant",color:$("qr-color")?.value||"#8b2730"}
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
Object.assign(qrThemes,Object.fromEntries((window.SuiteDesign?.styles||[]).map(s=>[s.id,s])),{custom:{name:"Mon design",background:"#ffffff",font:"elegant",accent:"#8b2730",badge:"plain"}});
const QR_LARGE_SIZE=245;

function qrInk(color){
 const hex=/^#[0-9a-f]{6}$/i.test(color)?color:"#b78b38";
 let rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16));
 const luminance=()=>rgb.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);
 while(luminance()>.10)rgb=rgb.map(x=>Math.floor(x*.9));
 return "#"+rgb.map(x=>x.toString(16).padStart(2,"0")).join("");
}
let qrModelCache=null;
function makeQrCanvas(url,o){
 const key=JSON.stringify([url,qrInk(o.color)]);
 if(qrModelCache?.key!==key){
  const holder=document.createElement("div");
  const code=new QRCode(holder,{text:url,width:512,height:512,colorDark:qrInk(o.color),colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.H});
  qrModelCache={key,model:code._oQRCode};
 }
 // Repaint from the cached matrix: reused canvas bitmaps may be discarded by the browser.
 const model=qrModelCache.model,n=model.getModuleCount(),cell=12,quiet=4;
 const canvas=document.createElement("canvas");canvas.width=canvas.height=(n+quiet*2)*cell;
 const ctx=canvas.getContext("2d");
 ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle=qrInk(o.color);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(model.isDark(y,x))ctx.fillRect((x+quiet)*cell,(y+quiet)*cell,cell,cell);
 return canvas;
}
function drawQrMonogram(ctx,o,cx,cy,size,background){
 const d=size*.18,r=d/2,theme=qrThemes[o.style];
 ctx.save();
 // Keep the monogram readable even on dark or imported artwork.
 ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
 ctx.fillStyle="#ffffff";ctx.fillRect(cx-r,cy-r,d,d);
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
let qrPreviewRevision=0,qrPreviewTimer=null,qrPreviewUrl=null;
function applyQrPreview(url,c){
 const o=qrOptions(c),card=$("qr-artwork-preview");
 if(!card)return;
 $("qr-color-value").textContent=o.color.toUpperCase();
 const revision=++qrPreviewRevision;
 const snapshot={...c};
 clearTimeout(qrPreviewTimer);
 qrPreviewTimer=setTimeout(async()=>{
  try{
   const canvas=await buildPrintCardCanvas(snapshot,url,{preview:true});
   if(revision!==qrPreviewRevision||ownerSessionEnded)return;
   const labels={'print-title':'le titre','print-note':'le message sous le QR','print-explanation':'le texte d’explication'};
   Object.keys(labels).forEach(id=>{const field=$(id),hint=$(id+'-fit');if(field)field.setAttribute('aria-invalid',String(canvas.cardTextIssues.includes(id)));if(hint){hint.hidden=!canvas.cardTextIssues.includes(id);hint.textContent='Texte trop long pour rester lisible : raccourcissez-le.';}});
   const warning=$('organizer-card-readability');if(warning){warning.hidden=!canvas.cardTextIssues.length;warning.textContent=canvas.cardTextIssues.length?'Raccourcissez '+canvas.cardTextIssues.map(id=>labels[id]).join(' et ')+'. L’aperçu est abrégé ; votre texte complet est conservé.':'';}
   const thumbnail=document.createElement('canvas');thumbnail.width=720;thumbnail.height=1080;
   thumbnail.getContext('2d').drawImage(canvas,0,0,thumbnail.width,thumbnail.height);
   const blob=await new Promise(resolve=>thumbnail.toBlob(resolve,'image/png'));
   if(revision!==qrPreviewRevision||ownerSessionEnded)return;
   if(!blob)throw Error('Aperçu indisponible');
   const preview=$("qr-artwork-preview");if(!preview)return;
   const oldUrl=qrPreviewUrl;qrPreviewUrl=URL.createObjectURL(blob);preview.src=qrPreviewUrl;
   if(oldUrl)URL.revokeObjectURL(oldUrl);
  }catch{if(revision===qrPreviewRevision&&!ownerSessionEnded)show($("qr-status"),"Impossible de préparer l’aperçu. Réessayez.",false)}
 },100);
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
// Fit actual glyph bounds, including script flourishes, inside a reserved text rectangle.
function drawPrintTextBox(ctx,text,box,{size,family,weight,maxLines=12,minSize=34,onOverflow}){
 if(!String(text||'').trim())return box.y;
 ctx.textAlign='center';ctx.textBaseline='alphabetic';
 let lines,metrics,lineHeight,ascent,descent,height;
 let fits=false;
 for(;size>=minSize;size--){
  ctx.font=weight+' '+size+'px '+family;
  lines=wrapCanvasLines(ctx,text,box.width,100);metrics=lines.map(line=>ctx.measureText(line));
  ascent=Math.max(...metrics.map(m=>m.actualBoundingBoxAscent||size));
  descent=Math.max(0,...metrics.map(m=>m.actualBoundingBoxDescent||0));
  lineHeight=Math.max(size*1.2,ascent+descent+8);height=ascent+descent+(lines.length-1)*lineHeight;
  fits=lines.length<=maxLines&&height<=box.height&&metrics.every(m=>m.width<=box.width&&m.actualBoundingBoxLeft<=box.width/2&&m.actualBoundingBoxRight<=box.width/2);
  if(fits||size===minSize)break;
 }
 if(!fits){
  onOverflow?.();
  const count=Math.max(1,Math.min(maxLines,Math.floor((box.height-ascent-descent)/lineHeight)+1));
  lines=lines.slice(0,count);
  lines=lines.map((line,i)=>{let value=line+(i===lines.length-1?'…':'');for(let m=ctx.measureText(value);value.length>1&&(m.width>box.width||m.actualBoundingBoxLeft>box.width/2||m.actualBoundingBoxRight>box.width/2);m=ctx.measureText(value))value=value.slice(0,-2)+'…';return value;});
  metrics=lines.map(line=>ctx.measureText(line));ascent=Math.max(...metrics.map(m=>m.actualBoundingBoxAscent||size));descent=Math.max(0,...metrics.map(m=>m.actualBoundingBoxDescent||0));height=ascent+descent+(lines.length-1)*lineHeight;
 }
 ctx.textAlign='center';ctx.textBaseline='alphabetic';
 const y=box.y+(box.center?(box.height-height)/2:0)+ascent;
 lines.forEach((line,i)=>ctx.fillText(line,box.x+box.width/2,y+i*lineHeight));
 return y+(lines.length-1)*lineHeight+descent;
}
async function buildPrintCardCanvas(c,url,{preview=false}={}){
 const o=qrOptions(c);
 const qr=makeQrCanvas(url,o);
 if(document.fonts?.load)try{await Promise.all([document.fonts.load(qrFontWeight(o.font)+' 72px "'+qrFontFamily(o.font)+'"'),document.fonts.load('600 32px "Cormorant Garamond"'),document.fonts.load('400 25px Inter'),document.fonts.load('700 32px Inter')])}catch(e){}
 const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
 const W=1181,H=1772;canvas.width=W;canvas.height=H;
 const issues=[];canvas.cardTextIssues=issues;
 const config=c.welcome_config||{},artwork=window.SuiteDesign.artwork(o.style,{...config,background:window.SuiteDesign.background(c)});
 if(artwork){const image=await loadCanvasImage(artwork);const scale=Math.max(W/image.naturalWidth,H/image.naturalHeight),iw=image.naturalWidth*scale,ih=image.naturalHeight*scale;ctx.drawImage(image,(W-iw)*window.SuiteDesign.position(config.cardX)/100,(H-ih)*window.SuiteDesign.position(config.cardY)/100,iw,ih);}else{drawQrBackdrop(ctx,o,W,H);drawQrDecor(ctx,o,W,H);}
 // The artwork itself reserves the text area; no colored panel covers the design.
 const dark=qrThemes[o.style].dark;
 ctx.fillStyle=dark?'#fffaf1':'#201c1a';
 const ff=qrFontFamily(o.font),titleSize=['romantic','signature'].includes(o.font)?150:o.font==='contemporary'?120:o.font==='refined'?122:140;
 drawPrintTextBox(ctx,o.title,{x:180,y:190,width:W-360,height:195,center:true},{size:titleSize,family:'"'+ff+'", serif',weight:qrFontWeight(o.font),maxLines:3,minSize:56,onOverflow:()=>issues.push('print-title')});
 ctx.font='400 44px Inter,Arial,sans-serif';ctx.fillText(new Date(c.wedding_date+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}),W/2,435);
 drawQrDivider(ctx,o,W/2,490);
 const qsize=660,qx=Math.round((W-qsize)/2),qy=510;
 const background=document.createElement("canvas");background.width=W;background.height=H;
 background.getContext("2d").drawImage(canvas,0,0);
 ctx.imageSmoothingEnabled=false;
 ctx.drawImage(qr,qx,qy,qsize,qsize);
 ctx.imageSmoothingEnabled=true;

 if(o.showInitials)drawQrMonogram(ctx,o,W/2,qy+qsize/2,qsize,background);

 const textBox={x:180,y:1220,width:W-360,height:150};
 ctx.fillStyle=dark?'#fffaf1':'#262220';
 const noteBottom=drawPrintTextBox(ctx,o.note,textBox,{size:56,family:'Inter, Arial, sans-serif',weight:'600',maxLines:6,minSize:38,onOverflow:()=>issues.push('print-note')});
 const explanationY=noteBottom+(o.note?26:0);
 ctx.fillStyle=dark?'#eee2cc':'#554e49';
 drawPrintTextBox(ctx,o.explanation,{...textBox,y:explanationY,height:1540-explanationY},{size:44,family:'Inter, Arial, sans-serif',weight:'400',maxLines:12,minSize:34,onOverflow:()=>issues.push('print-explanation')});


 try{
  const logo=await loadCanvasImage("assets/la-suite-logo.webp?v=20260927-hq");
  const maxW=260,maxH=104,scale=Math.min(maxW/logo.naturalWidth,maxH/logo.naturalHeight);
  const lw=Math.round(logo.naturalWidth*scale),lh=Math.round(logo.naturalHeight*scale);
  // Keep the original alpha, with a light monochrome mark on dark designs.
  const mark=document.createElement('canvas');mark.width=lw;mark.height=lh;
  const markCtx=mark.getContext('2d');markCtx.drawImage(logo,0,0,lw,lh);
  if(dark){markCtx.globalCompositeOperation='source-in';markCtx.fillStyle='#fffaf1';markCtx.fillRect(0,0,lw,lh);}
  ctx.drawImage(mark,(W-lw)/2,H-150,lw,lh)
 }catch(e){
  ctx.textAlign="center";ctx.fillStyle=dark?'#fffaf1':'#211d1d';
  ctx.font='700 34px "Cormorant Garamond", Georgia, serif';
  ctx.fillText("La Suite",W/2,H-105)
 }
 if(issues.length&&!preview)throw new Error('Raccourcissez les textes signalés avant de télécharger ou d’imprimer la fiche. Le QR code seul reste disponible.');
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
 ctx.save();ctx.textAlign='center';ctx.fillStyle='#554e49';ctx.font='600 38px Inter, Arial, sans-serif';ctx.fillText('Comment utiliser votre carte',W/2,y+card.height+120);
 ctx.font='400 30px Inter, Arial, sans-serif';
 ['1. Imprimez sur A4 à 100 %, sans ajuster à la page.', '2. Découpez sur les repères et placez la carte dans un cadre 10 × 15 cm.', '3. Disposez-la sur les tables : vos invités scannent le QR code pour participer.', 'Les dépôts sont ouverts le jour de l’événement et le lendemain.'].forEach((line,i)=>ctx.fillText(line,W/2,y+card.height+180+i*48));ctx.restore();
 return page
}
async function downloadPrintCard(c,url){
 try{
  const page=await buildA4PrintCanvas(c,url);
  if(ownerSessionEnded)return false;
  const filename="la-suite-"+slugify(c.couple_name)+"-A4.png";
  if(window.LaSuiteAndroid?.saveCard){window.LaSuiteAndroid.saveCard(page.toDataURL("image/png"),filename);return true;}
  const a=document.createElement("a");
  a.download=filename;
  a.href=page.toDataURL("image/png");
  a.click();return true;
 }catch(e){show($("qr-status"),e?.message||"Impossible de préparer le fichier.",false);return false;}
}
function setupPrintDownload(c,url){
 const dialog=document.createElement('dialog');dialog.id='print-download-dialog';dialog.className='guest-dialog print-download-dialog';dialog.setAttribute('aria-labelledby','print-download-title');
 dialog.innerHTML='<div class="guest-dialog-head"><h2 id="print-download-title">Télécharger la fiche</h2><button class="guest-dialog-close" type="button" aria-label="Fermer les formats de téléchargement">×</button></div><div class="guest-dialog-body"><div class="print-format-choices"><button type="button" data-print-format="10x15"><i class="fa-regular fa-file-pdf" aria-hidden="true"></i><span><strong>Carte 10 × 15 cm</strong><small>PDF à taille réelle · la fiche seule</small></span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button><button type="button" data-print-format="A4"><i class="fa-regular fa-file-pdf" aria-hidden="true"></i><span><strong>Feuille A4</strong><small>PDF · carte 10 × 15 cm et repères de découpe</small></span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button><button type="button" data-print-format="png"><i class="fa-regular fa-image" aria-hidden="true"></i><span><strong>Image haute définition</strong><small>PNG · version A4</small></span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button></div><button type="button" class="btn secondary" data-print-format="qr"><i class="fa-solid fa-qrcode" aria-hidden="true"></i>QR code seul · PNG</button><p class="microcopy">Pour garder les dimensions exactes, imprimez le PDF à 100 % ou en « Taille réelle ».</p><p id="print-download-status" class="status" role="status" aria-live="polite"></p></div>';
 $('dashboard-content').append(dialog);const buttons=[...dialog.querySelectorAll('[data-print-format]')];
 dialog.querySelector('.guest-dialog-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{if($('download-print-card')?.isConnected)$('download-print-card').focus()});
 $('download-print-card').onclick=()=>{if(ownerSessionEnded)return;show($('print-download-status'),'');dialog.style.removeProperty('left');dialog.style.removeProperty('top');if(matchMedia('(min-width:761px)').matches){dialog.show();const rect=$('download-print-card').getBoundingClientRect(),menu=dialog.getBoundingClientRect();dialog.style.left=Math.max(12,Math.min(rect.left,innerWidth-menu.width-12))+'px';dialog.style.top=Math.max(12,Math.min(rect.bottom+6,innerHeight-menu.height-12))+'px';}else dialog.showModal()};
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&dialog.open){event.preventDefault();dialog.close()}});
 document.addEventListener('click',event=>{if(dialog.open&&!dialog.matches(':modal')&&!dialog.contains(event.target)&&!$('download-print-card').contains(event.target))dialog.close()});
 buttons.forEach(button=>button.onclick=async()=>{
  buttons.forEach(b=>b.disabled=true);show($('print-download-status'),'Préparation de votre fiche…');
  try{
   if(ownerSessionEnded)return;
   Object.assign(c,collectQrCustomization(c));applyQrPreview(url,c);
   if(button.dataset.printFormat==='qr'){const canvas=makeQrCanvas(url,{...qrOptions(c),showInitials:false});const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob||ownerSessionEnded)return;const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download='la-suite-qr-'+slugify(c.couple_name)+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),60000);dialog.close();return;}
   if(button.dataset.printFormat==='png'){if(await downloadPrintCard(c,url)){if(!ownerSessionEnded)dialog.close();}else show($('print-download-status'),$('qr-status').textContent||'Impossible de préparer le fichier.',false);return;}
   const card=await buildPrintCardCanvas(c,url),format=button.dataset.printFormat;
   const pdf=await SuitePrintPdf.create(card,format);if(ownerSessionEnded)return;
   const href=URL.createObjectURL(pdf),a=document.createElement('a');a.href=href;a.download='la-suite-'+slugify(c.couple_name)+'-'+format+'.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),60000);dialog.close();
  }catch(error){show($('print-download-status'),error?.message||'Impossible de préparer le fichier. Réessayez.',false)}finally{buttons.forEach(b=>b.disabled=false)}
 });
}
async function printPrintCard(c,url){
 if(window.LaSuiteAndroid?.printCard){try{const page=await buildA4PrintCanvas(c,url);if(ownerSessionEnded)return;window.LaSuiteAndroid.printCard(page.toDataURL("image/png"));}catch(e){show($("qr-status"),e?.message||"Impossible de lancer l’impression.",false)}return;}
 const win=window.open("","_blank");
 if(!win)return show($("qr-status"),"Autorisez les fenêtres pop-up pour lancer l’impression.",false);
 try{
  win.document.write('<!doctype html><html><head><title>Préparation de l’impression…</title></head><body></body></html>');
  win.document.close();
  const page=await buildA4PrintCanvas(c,url);
  if(ownerSessionEnded){win.close();return;}
  const data=page.toDataURL("image/png");
  win.document.open();
  win.document.write('<!doctype html><html><head><title>Imprimer La Suite</title><style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}img{display:block;width:210mm;height:297mm;object-fit:contain}</style></head><body><img src="'+data+'" alt="Carte La Suite A4"></body></html>');
  win.document.close();
  const img=win.document.querySelector("img");
  img.onload=()=>{if(ownerSessionEnded){win.close();return;}win.focus();win.print()}
 }catch(e){
  try{win.close()}catch(_){}
  show($("qr-status"),e?.message||"Impossible de lancer l’impression.",false)
 }
}
function saveQrCustomization(c,url,silent=false){
 if(ownerSessionEnded)return Promise.resolve(false);
 const payload=collectQrCustomization(c);organizerState.saving++;saveIndicator();
 const run=async()=>{
  try{
   await updateOwnedCapsule(c,payload);
   Object.assign(c,payload);applyQrPreview(url,{...c,...collectQrCustomization(c)});
   if(JSON.stringify(payload)===JSON.stringify(collectQrCustomization(c)))organizerState.qr=false;
   organizerState.error=false;show($("qr-status"),silent?"":"Carte enregistrée.");return true;
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
<div class="owner-overview" id="owner-overview"></div>
<nav class="owner-tabs" role="tablist" aria-label="Votre capsule">
 <button id="owner-tab-configuration" type="button" role="tab" aria-controls="owner-panel-configuration" data-owner-tab-link="configuration"><i class="fa-solid fa-qrcode" aria-hidden="true"></i><span>Personnalisation</span></button>
 <button id="owner-tab-messages" type="button" role="tab" aria-controls="owner-panel-messages" data-owner-tab-link="messages"><i class="fa-regular fa-images" aria-hidden="true"></i><span>Souvenirs</span> <span id="owner-unread-badge" class="owner-unread-badge" hidden></span></button>
 <button id="owner-tab-settings" type="button" role="tab" aria-controls="owner-panel-settings" data-owner-tab-link="settings"><i class="fa-solid fa-sliders" aria-hidden="true"></i><span>Paramètres</span></button>
</nav>
<div class="owner-panel" data-owner-panel="configuration">
<div class="owner-card-and-intro">
<section class="qr-designer-panel">
 <div class="qr-designer-head">
  <div>
   <h2>Votre carte</h2>
  </div>

 </div>

 <div class="qr-designer-grid">
  <div class="qr-designer-controls">
   <div class="qr-control-group">
    ${customizationHeading("tableau","Les mots de votre carte")}<p class="field-help">Les textes sont prêts à l’emploi. Ajustez-les pour qu’ils vous ressemblent.</p>
    <div class="field"><div class="qr-field-label-row"><label for="print-title">Titre de la carte</label><span data-char-count="print-title">0 / 42</span></div><input id="print-title" maxlength="42" value="${esc(o.title)}"></div>
    <div class="field"><div class="qr-field-label-row"><label for="print-note">Petit mot</label><span data-char-count="print-note">0 / 120</span><label class="studio-text-toggle"><input id="print-note-visible" type="checkbox" ${o.note?"checked":""}>Afficher</label></div><textarea id="print-note" maxlength="120" rows="2">${esc(o.note)}</textarea></div>
    <div class="field"><div class="qr-field-label-row"><label for="print-explanation">Texte d'explication</label><span data-char-count="print-explanation">0 / 240</span><label class="studio-text-toggle"><input id="print-explanation-visible" type="checkbox" ${o.explanation?"checked":""}>Afficher</label></div><textarea id="print-explanation" maxlength="240" rows="3">${esc(o.explanation)}</textarea><small id="plan-explanation-help" class="field-help">Texte proposé pour la formule ${esc(PLAN_NAMES[capsulePlan(c)]||"Premium")}.</small></div>
   </div>

   <div class="qr-control-group qr-personalization-group">
    <div class="qr-control-title">
     <div>${customizationHeading("structure","Personnalisation")}<p>Le même design, la même typographie et la même couleur habillent votre fiche QR et l’accueil des invités.</p></div>
    </div>

    <div class="field qr-choice-field customization-card">
     ${customizationHeading("decoration","Design partagé")}
     <input id="qr-style" type="hidden" value="${esc(o.style)}">
     <div class="qr-style-choices qr-theme-gallery" role="group" aria-label="18 ambiances de carte">
      
     </div>
    </div>

    <div class="field qr-choice-field customization-card">
     ${customizationHeading("typographie","Typographie")}
     <input id="qr-font" type="hidden" value="${esc(o.font)}">
     <div class="qr-font-picker" data-qr-font-picker>
      <button class="qr-font-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
       <span class="qr-font-current qr-font-sample-${esc(o.font)}">${esc(o.title)}</span>
       <span class="qr-font-current-name">${o.font==="classic"?"Classique":o.font==="modern"?"Moderne":o.font==="romantic"?"Manuscrite":o.font==="editorial"?"Éditoriale":o.font==="refined"?"Raffinée":o.font==="contemporary"?"Contemporaine":o.font==="signature"?"Signature":"Élégante"}</span>
       <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
      </button>
      <div class="qr-font-menu" role="listbox" hidden>
       <button type="button" role="option" data-qr-font="elegant" class="${o.font==="elegant"?"is-selected":""}">
        <span class="qr-font-sample qr-font-sample-elegant">La Suite</span><small>Élégante</small>
       </button>
       <button type="button" role="option" data-qr-font="classic" class="${o.font==="classic"?"is-selected":""}">
        <span class="qr-font-sample qr-font-sample-classic">La Suite</span><small>Classique</small>
       </button>
       <button type="button" role="option" data-qr-font="modern" class="${o.font==="modern"?"is-selected":""}">
        <span class="qr-font-sample qr-font-sample-modern">La Suite</span><small>Moderne</small>
       </button>
       <button type="button" role="option" data-qr-font="romantic" class="${o.font==="romantic"?"is-selected":""}">
        <span class="qr-font-sample qr-font-sample-romantic">La Suite</span><small>Manuscrite</small>
       </button>
       <button type="button" role="option" data-qr-font="editorial" class="${o.font==="editorial"?"is-selected":""}">
        <span class="qr-font-sample qr-font-sample-editorial">La Suite</span><small>Éditoriale</small>
       </button>
       <button type="button" role="option" data-qr-font="refined" class="${o.font==="refined"?"is-selected":""}">
        <span class="qr-font-sample qr-font-sample-refined">La Suite</span><small>Raffinée</small>
       </button>
       <button type="button" role="option" data-qr-font="contemporary" class="${o.font==="contemporary"?"is-selected":""}">
        <span class="qr-font-sample qr-font-sample-contemporary">La Suite</span><small>Contemporaine</small>
       </button>
       <button type="button" role="option" data-qr-font="signature" class="${o.font==="signature"?"is-selected":""}">
        <span class="qr-font-sample qr-font-sample-signature">La Suite</span><small>Signature</small>
       </button>
      </div>
     </div>
    </div>

    <div class="field qr-choice-field customization-card">
     ${customizationHeading("couleurs","Couleurs")}
     <div class="qr-field-label-row"><label for="qr-color">Couleur principale</label><span id="qr-color-value">${esc(o.color.toUpperCase())}</span></div>
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

    <div class="qr-initials-card customization-card">
     ${customizationHeading("logo","Votre monogramme")}
     <div class="field"><label for="qr-initials-input">Votre monogramme</label><input id="qr-initials-input" maxlength="4" value="${esc(o.initials)}"></div>
     <label class="qr-check qr-check-switch"><input id="qr-show-initials" type="checkbox" ${o.showInitials?"checked":""}><span>Afficher le monogramme au centre</span></label>
    </div>
   </div>


  </div>

  <div class="qr-designer-preview">
   <div class="qr-preview-sticky">
    <div class="qr-preview-label"><span><img class="customization-inline-icon" src="assets/customization/espacement.webp" alt="" width="24" height="24"> Aperçu en direct</span><strong>10 × 15 cm · Portrait</strong></div>
    <div class="qr-preview-stage">
     <img id="qr-artwork-preview" class="qr-artwork-preview" alt="Aperçu de votre carte QR personnalisée, identique à l’impression">
    </div>

    <div class="qr-preview-actions">
     <button class="btn secondary" id="share-link" type="button"><img class="customization-inline-icon" src="assets/customization/lien.webp" alt="" width="24" height="24">Partager</button>
     <a class="btn secondary" id="open-guest-link" href="${esc(url)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>Voir la page invité</a>
     <button class="btn secondary" id="download-print-card" type="button"><i class="fa-solid fa-download" aria-hidden="true"></i>Télécharger</button>
     <button class="btn primary" id="print-print-card" type="button"><i class="fa-solid fa-print" aria-hidden="true"></i>Imprimer</button>
    </div>
    <details class="qr-print-guide">
     <summary>Impression et conseils</summary>
     <p class="field-help">Carte 10 × 15 cm centrée sur une feuille A4 avec repères de découpe.</p>
     <div class="qr-print-guide-grid">
      <div><i class="fa-regular fa-file-lines" aria-hidden="true"></i><span><strong>Imprimez sur A4</strong><small>À 100 %, sans ajuster à la page. Découpez sur les repères.</small></span></div>
      <div><i class="fa-regular fa-image" aria-hidden="true"></i><span><strong>Placez-la dans un cadre</strong><small>Placez la carte dans un cadre 10 × 15 cm ou sur un chevalet.</small></span></div>
      <div><i class="fa-solid fa-qrcode" aria-hidden="true"></i><span><strong>Multipliez les points d’accès</strong><small>Sur les tables ou au bar : les invités scannent le QR code, puis déposent leur souvenir.</small></span></div><div><i class="fa-solid fa-share-nodes" aria-hidden="true"></i><span><strong>Pensez aussi aux absents</strong><small>Partagez aussi le lien aux absents. Dépôts le jour J et le lendemain.</small></span></div>
     </div>
    </details>
    <div id="qr-status" class="status"></div>
   </div>
  </div>
 </div>
</section>


<details open id="organizer-welcome" class="organizer-welcome">
 <summary><span><strong>Accueil des invités</strong><small>Un message avant de déposer un souvenir · facultatif</small></span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary>
<section class="qr-designer-panel intro-video-panel">
 <div class="intro-video-body intro-editor-grid">
  <div class="intro-editor-fields">
   <div class="field"><label for="intro-kind">Votre message d’accueil</label><select id="intro-kind"><option value="none">Sans message d’accueil</option><option value="text">Un texte</option><option value="video">Une vidéo</option><option value="image">Une image</option></select><small class="field-help">Facultatif · modifiable à tout moment.</small></div>
   <div class="field" id="intro-text-field" hidden><label for="intro-text">Votre message</label><textarea id="intro-text" rows="4" maxlength="2000" placeholder="Bienvenue dans notre capsule ! Laissez-nous un petit mot, une émotion, un souvenir…">${esc(c.welcome_message||"")}</textarea><small class="field-help">2 000 caractères maximum.</small></div>
   <div class="field" id="intro-media-field" hidden><label id="intro-file-label" for="intro-file">Votre fichier</label><input id="intro-file" type="file" class="intro-file-native" tabindex="-1"><button id="choose-intro-file" class="btn secondary intro-file-picker" type="button" aria-controls="intro-file">Choisir un fichier</button><span id="intro-file-name" class="intro-file-name" role="status" hidden></span><small class="field-help" id="intro-file-help"></small></div>
   <button id="upload-intro" class="btn primary" type="button">Enregistrer mon message d’accueil</button>
   <div id="intro-status" class="status" role="status" aria-live="polite"></div>
  </div>
  <div class="intro-preview-card"><div id="intro-live-preview" hidden></div><div id="intro-preview-wrap"></div></div>
 </div>
</section>
</details>
</div>
</div>

<div class="owner-panel" data-owner-panel="messages" hidden>
 <section class="owner-messages-hero">
  <div>
   <h2>Vos souvenirs</h2>
   <p>Les souvenirs programmés restent verrouillés jusqu’à leur ouverture.</p>
  </div>
  <div id="next-delivery" class="next-delivery" hidden></div>
 </section>
 <section class="memories-section">
  <div class="section-title-row">
   <p id="memory-count">${memoryCountLabel(count)}</p>
  </div>
  <div class="memory-filters" role="group" aria-label="Filtrer les souvenirs"><button type="button" data-memory-filter="all" aria-pressed="true">Tous</button><button type="button" data-memory-filter="available" aria-pressed="false">Disponibles</button><button type="button" data-memory-filter="locked" aria-pressed="false">À découvrir</button></div>
  <div class="memory-tools"><button id="refresh-memories" class="btn secondary" type="button">Actualiser</button><button id="export-memories" class="btn primary" type="button" disabled>Télécharger les souvenirs ouverts</button></div><p id="export-status" class="status" role="status"></p><p id="memory-status" class="status" role="status"></p><div id="memory-list" class="memory-list"></div>
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
 try{await updateOwnedCapsule(c,{owner_messages_seen_at:seenAt});
  c.owner_messages_seen_at=seenAt;
  updateOwnerUnreadBadge(0)
 }catch{/* Keep the badge until the server confirms the update. */}
}

function compactOwnerEditors(c){
 window.SuiteDesign.storage=sb;
 window.SuiteDesign.mount(c);
}

function setupOwnerTabs(c,manifest){
 const links=[...document.querySelectorAll("[data-owner-tab-link]")];
 const panels=[...document.querySelectorAll("[data-owner-panel]")];
 if(!links.length||!panels.length)return;

 const activate=async(name,updateHash=true)=>{
  const target=["configuration","messages","settings"].includes(name)?name:"configuration";
  links.forEach(link=>{
   const active=link.dataset.ownerTabLink===target;
   link.classList.toggle("is-active",active);
   link.setAttribute("aria-selected",String(active));link.tabIndex=active?0:-1;
  });
  panels.forEach(panel=>{panel.hidden=panel.dataset.ownerPanel!==target});
  if(name==="accueil")$("organizer-welcome").open=true;
  const activation=document.querySelector(".activation-panel");if(activation)activation.hidden=target==="settings"||(c.status==="active"&&!capsuleExpired(c));
  if(updateHash&&matchMedia("(max-width:760px)").matches)window.scrollTo({top:0,behavior:"instant"});
  if(updateHash&&location.hash!=="#"+target)history.replaceState(null,"","#"+target);
  document.body.classList.toggle("studio-card-active",target==="configuration");window.dispatchEvent(new Event("studio-layout"));
  if(target==="messages")await markOwnerMessagesSeen(c,manifest)
 };

 links.forEach(link=>link.addEventListener("click",e=>{
  e.preventDefault();
  activate(link.dataset.ownerTabLink||"configuration")
 }));

 updateOwnerUnreadBadge(ownerUnreadCount(c,manifest));
 links.forEach((link,index)=>link.addEventListener("keydown",e=>{
  let next;if(e.key==="ArrowRight")next=(index+1)%links.length;else if(e.key==="ArrowLeft")next=(index+links.length-1)%links.length;else if(e.key==="Home")next=0;else if(e.key==="End")next=links.length-1;else return;
  e.preventDefault();links[next].focus();activate(links[next].dataset.ownerTabLink);
 }));
 panels.forEach(panel=>{panel.id="owner-panel-"+panel.dataset.ownerPanel;panel.setAttribute("role","tabpanel");panel.setAttribute("aria-labelledby","owner-tab-"+panel.dataset.ownerPanel)});
 window.addEventListener("hashchange",()=>activate(location.hash.slice(1),false));
 activate(location.hash.slice(1),false)
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
   sample.textContent=$("print-title").value||DEFAULT_CARD_TITLE
  }
  if(name)name.textContent=fontNames[value]||fontNames.elegant
 };
 fontTrigger?.addEventListener("click",()=>{
  const open=fontMenu?.hidden!==false;
  if(fontMenu)fontMenu.hidden=false;
  fontTrigger.setAttribute("aria-expanded",String(open))
 });
 fontPicker?.querySelectorAll("[data-qr-font]").forEach(btn=>btn.addEventListener("click",()=>{
  if(!fontInput)return;
  fontInput.value=btn.dataset.qrFont||"elegant";
  if(fontMenu)fontMenu.hidden=false;
  fontTrigger?.setAttribute("aria-expanded","false");
  syncFont();
  dispatch(fontInput)
 }));
 document.addEventListener("click",e=>{
  if(!fontPicker||fontPicker.contains(e.target))return;
  if(fontMenu)fontMenu.hidden=false;
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
  if(fontInput&&styleInput.value!=="custom")fontInput.value=theme.font;
  if(colorInput&&styleInput.value!=="custom")colorInput.value=theme.accent;
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

function capsuleAccessLastDay(usage){return usage?.access_until?usage.access_until+'T12:00:00Z':usage?.retention_years>3&&usage.delivery_before===usage.expires_at?new Date(new Date(usage.expires_at).getTime()-1000).toISOString():usage?.expires_at}
function capsuleExpired(c){return c?.usage?.state==='expired'||Boolean(c?.usage?.expires_at&&new Date(c.usage.expires_at).getTime()<=Date.now())}
const memoryRefreshRetries=new Map(),memoryRefreshInFlight=new Set();
function nextCountdown(c,manifest,onReady){
 clearInterval(countdownTimer);const box=$("next-delivery");box.hidden=false;
 if(capsuleExpired(c)){box.textContent='La période de conservation de cette capsule est terminée.';return}
 for(const id of memoryRefreshRetries.keys())if(!manifest.some(m=>m.id===id&&!m.is_available))memoryRefreshRetries.delete(id);
 const next=manifest.filter(m=>!m.is_available).sort((a,b)=>new Date(a.delivery_at)-new Date(b.delivery_at))[0];
 if(!next){box.hidden=true;return}
 const tick=()=>{
  if(ownerSessionEnded||!box.isConnected){clearInterval(countdownTimer);return}
  if(capsuleExpired(c)){clearInterval(countdownTimer);box.textContent='La période de conservation de cette capsule est terminée.';return}
  const delta=new Date(next.delivery_at)-new Date();
  if(delta<=0){box.innerHTML='<strong>Un souvenir est prêt à être découvert.</strong>';if(document.visibilityState==='visible'&&!memoryRefreshInFlight.has(next.id)&&Date.now()>=(memoryRefreshRetries.get(next.id)||0)){
    memoryRefreshRetries.set(next.id,Date.now()+30000);memoryRefreshInFlight.add(next.id);
    Promise.resolve().then(()=>{if(!ownerSessionEnded&&box.isConnected&&document.visibilityState==='visible')return onReady()}).catch(()=>{}).finally(()=>memoryRefreshInFlight.delete(next.id));
   }return}
  const d=Math.floor(delta/86400000),h=Math.floor((delta%86400000)/3600000),m=Math.floor((delta%3600000)/60000);box.innerHTML='<span>Prochain souvenir dans</span><strong>'+(d?d+' j ':'')+h+' h '+m+' min</strong>';
 };tick();countdownTimer=setInterval(tick,Math.min(60000,Math.max(1000,new Date(next.delivery_at)-Date.now())));
}

let memoryFilter="all";
function applyMemoryFilter(){
 const cards=[...document.querySelectorAll('#memory-list .memory-row')];
 for(const card of cards)card.hidden=memoryFilter!=="all"&&!card.classList.contains(memoryFilter);
 for(const button of document.querySelectorAll('[data-memory-filter]'))button.setAttribute('aria-pressed',String(button.dataset.memoryFilter===memoryFilter));
 let empty=$('memory-filter-empty');
 if(!empty){empty=document.createElement('p');empty.id='memory-filter-empty';empty.className='notice';$('memory-list').after(empty)}
 empty.textContent=memoryFilter==='available'?'Aucun souvenir disponible pour le moment.':'Aucun souvenir dans cette sélection.';
 empty.hidden=!cards.length||cards.some(card=>!card.hidden);
}
let memoryMediaObserver=null;
const pendingMediaUrls=new WeakMap();
async function renderManifest(c,manifest){
 const list=$("memory-list");
 if(!manifest.length){memoryMediaObserver?.disconnect();list.innerHTML='<div class="notice">Aucun souvenir reçu pour le moment.</div>';applyMemoryFilter();return}
 const{data:rows,error}=await sb.from("messages").select("id,guest_name,message_text,media_type,media_path,delivery_at,created_at").eq("capsule_id",c.id);
 if(ownerSessionEnded)return;
 if(error)throw error;
 const map=new Map((rows||[]).map(x=>[x.id,x]));list.replaceChildren();memoryMediaObserver?.disconnect();
 memoryMediaObserver=window.IntersectionObserver?new IntersectionObserver(entries=>{
  for(const entry of entries){if(!entry.isIntersecting)continue;memoryMediaObserver?.unobserve(entry.target);const load=pendingMediaUrls.get(entry.target);pendingMediaUrls.delete(entry.target);if(!ownerSessionEnded)load?.();}
 },{rootMargin:'200px'}):null;
 for(const item of manifest){
  let loadMedia=null;
  const row=map.get(item.id),expired=capsuleExpired(c),available=item.is_available&&!expired;
  const article=document.createElement("article");article.className="memory-row "+(available?"available":"locked");
  article.innerHTML='<div class="memory-icon">'+icon(item.media_type)+'</div><div class="memory-meta"><strong>'+esc(item.guest_name||"Invité")+'</strong><span>'+label(item.media_type)+' · découverte le '+esc(fdate(item.delivery_at))+'</span></div><div class="memory-actions"><span class="lock-badge '+(available?'open':'locked')+'">'+(expired?'Accès terminé':available?'Disponible':'<i class="fa-solid fa-lock" aria-hidden="true"></i> Verrouillé')+'</span></div><div class="memory-content"></div>';
  const content=article.querySelector('.memory-content'),actions=article.querySelector('.memory-actions');
  if(available&&row?.message_text){const text=document.createElement('p');text.className='memory-text';text.textContent=row.message_text;content.append(text)}
  if(available&&row?.media_path){
   const media=document.createElement(row.media_type==="image"?'img':row.media_type==='audio'?'audio':'video');media.className='memory-'+(row.media_type==='image'?'image':row.media_type);if(row.media_type==='image'){media.alt='Souvenir de '+(item.guest_name||'votre invité');media.loading='lazy';media.decoding='async'}else{media.controls=true;media.playsInline=true;media.preload='none'}
   const status=document.createElement('p');status.className='hint';status.setAttribute('role','status');
   const refresh=document.createElement('button');refresh.type='button';refresh.className='mini-link';refresh.textContent='Recharger le média';
   let signedAt=0;
   const renew=async()=>{if(ownerSessionEnded||!article.isConnected)return false;refresh.disabled=true;try{const{data,error}=await sb.storage.from('capsule-media').createSignedUrl(row.media_path,300);if(ownerSessionEnded||!article.isConnected)return false;if(error||!data?.signedUrl)throw error||new Error('Lien indisponible');signedAt=Date.now();media.src=data.signedUrl;status.textContent='';return true}catch(e){status.textContent='Média indisponible. Réessayez avec « Recharger le média ».';return false}finally{refresh.disabled=false}};
   refresh.addEventListener('click',renew);media.addEventListener('error',()=>{status.textContent='La lecture a échoué ou le lien a expiré. Rechargez le média.'});
   if(row.media_type!=='image')media.addEventListener('play',async()=>{if(Date.now()-signedAt>240000){media.pause();if(await renew())media.play().catch(()=>{})}});
   const download=document.createElement('button');download.type='button';download.className='mini-link';download.textContent='Télécharger';
   download.addEventListener('click',async()=>{if(ownerSessionEnded)return;download.disabled=true;try{const{data,error}=await sb.storage.from('capsule-media').createSignedUrl(row.media_path,300,{download:true});if(ownerSessionEnded)return;if(error||!data?.signedUrl)throw error||new Error('Lien indisponible');const link=document.createElement('a');link.href=data.signedUrl;link.download='';document.body.append(link);link.click();link.remove();status.textContent=''}catch(e){status.textContent='Téléchargement impossible. Réessayez.'}finally{download.disabled=false}});
   actions.append(refresh,download);content.append(media,status);loadMedia=renew;
  }else if(available&&!row){content.textContent='Ce souvenir n’a pas pu être chargé. Actualisez la liste.'}
  if(!available){const placeholder=document.createElement('p');placeholder.className='memory-locked-preview';placeholder.innerHTML='<i class="fa-solid fa-lock" aria-hidden="true"></i><span>La surprise vous attend</span>';content.append(placeholder)}
  list.append(article);
  if(loadMedia){if(memoryMediaObserver){pendingMediaUrls.set(article,loadMedia);memoryMediaObserver.observe(article)}else loadMedia();}
 }
 applyMemoryFilter();
}
function latestEventDate(today=parisDay()){
 const d=new Date(today+'T12:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCFullYear(d.getUTCFullYear()+2);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);
}
function tomorrowParis(){const d=new Date(parisDay()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
function openCapsuleSettings(){
 $("owner-tab-settings")?.click();
}
function updateEventDateControls(c){
 const input=$("capsule-date");if(!input)return;
 const modernActive=c.status==="active"&&c.guest_rules_version===1;
 const editable=c.usage?.event_date_editable===true;
 input.disabled=Boolean(c.pendingPayment)||c.usage?.event_date_lock_reason==='custom_period'||modernActive&&!editable;
 if(c.status==='draft'||modernActive)input.min=tomorrowParis();
 input.max=latestEventDate();
 const reasons={custom_period:"Cette capsule possède un calendrier personnalisé. Contactez-nous pour modifier la date de l’événement.",started:"La date est verrouillée depuis le début de l’événement. Contactez-nous pour une correction.",memories:"Un souvenir ou un dépôt en cours existe. Contactez-nous pour une correction de date.",suspended:"Cette capsule est en pause. Contactez-nous pour une correction.",pending_payment:"Un paiement est en cours. La date reste fixée jusqu’à son expiration."};
 input.parentElement.querySelector(".field-help").textContent=c.pendingPayment?reasons.pending_payment:c.usage?.event_date_lock_reason==='custom_period'?reasons.custom_period:modernActive?(editable?"Modifiable jusqu’à la veille de l’événement, tant qu’aucun souvenir n’a été déposé. Aucun nouveau paiement.":reasons[c.usage?.event_date_lock_reason]||"La modification de date est momentanément indisponible. Actualisez pour réessayer."):"Dépôts le jour J et le lendemain.";
}
function setupCapsuleSettings(c){
 const panel=document.createElement('div');panel.className='capsule-settings';
 panel.innerHTML=`<div class="settings-grid"><div class="field"><label for="capsule-name">Nom de la capsule</label><input id="capsule-name" maxlength="50" required value="${esc(c.couple_name)}"></div><div class="field"><label for="capsule-date">Date de l’événement</label><input id="capsule-date" type="date" required ${c.status==='draft'?'min="'+tomorrowParis()+'"':''} ${c.status==="active"&&c.guest_rules_version===1?"disabled":""} value="${esc(c.wedding_date)}"><small class="field-help">Dépôts le jour J et le lendemain.</small></div><div class="field"><label for="capsule-plan">Formule</label><input id="capsule-plan" type="hidden" value="${esc(capsulePlan(c))}"><span id="capsule-plan-name">${esc(PLAN_NAMES[capsulePlan(c)])}</span><small class="field-help">${!c.admin_plan_override&&['free_beta','legacy'].includes(c.activation_source)?'Capsule offerte lors du lancement · tous les formats · 5 Go.':'Formule choisie à la création.'}</small></div><div class="field" id="notification-preference" hidden><label><input id="capsule-notify" type="checkbox" ${c.notify_by_email!==false?'checked':''}> Recevoir les rappels par e-mail</label><small class="field-help">Un récapitulatif par jour maximum, puis des rappels à 30 et 7 jours de l’échéance.</small></div></div>`;
 const settings=document.createElement("section");settings.id="capsule-settings-panel";settings.className="owner-panel studio-settings-panel";settings.dataset.ownerPanel="settings";settings.hidden=true;
 settings.innerHTML='<h2>Paramètres de la capsule</h2><p id="settings-save-error" class="status" role="alert" hidden></p><button id="settings-save-retry" class="btn secondary" type="button" hidden>Réessayer</button>';
 settings.append(panel);
 $("dashboard-content").append(settings);
 updateEventDateControls(c);
 $("settings-save-retry").addEventListener("click",()=>$("save-organizer").click());
 const syncError=()=>{const source=$("organizer-save-error"),target=$("settings-save-error");target.textContent=source?.textContent||"";target.hidden=!target.textContent;$("settings-save-retry").hidden=!target.textContent;};
 queueMicrotask(()=>{syncError();if($("organizer-save-error"))new MutationObserver(syncError).observe($("organizer-save-error"),{childList:true,subtree:true,characterData:true})});
 ['capsule-name','capsule-date','capsule-plan','capsule-notify'].forEach(id=>$(id).addEventListener('input',()=>markDirty('settings')));
}
async function saveCapsuleSettings(c){
 if(!organizerState.settings)return true;
 const name=$("capsule-name").value.trim(),plan=$("capsule-plan").value;let date=$("capsule-date").value;
 if(!name||name.length>50||!/^\d{4}-\d{2}-\d{2}$/.test(date)){show($("organizer-save-error"),'Renseignez un nom et une date valides.',false);openCapsuleSettings();return false}
 const dateChanged=date!==c.wedding_date;
 if((c.status==='draft'||dateChanged&&c.status==='active'&&c.guest_rules_version===1)&&date<tomorrowParis()){show($("organizer-save-error"),'Choisissez une date d’événement à partir de demain.',false);openCapsuleSettings();return false}
 if(dateChanged&&date>latestEventDate()){show($("organizer-save-error"),'Choisissez une date au plus tard le '+fdate(latestEventDate())+' (deux ans maximum).',false);openCapsuleSettings();return false}
 if(dateChanged&&c.status==='active'&&c.guest_rules_version===1&&!confirm("Déplacer l’événement du "+fdate(c.wedding_date)+" au "+fdate(date)+" ?\nLes dépôts seront ouverts à la nouvelle date et le lendemain. Les trois ans de conservation seront recalculés. Votre paiement et votre QR code sont conservés.")){date=c.wedding_date;$("capsule-date").value=date}
 const notify=$("capsule-notify").checked;
 const payload={couple_name:name,wedding_date:date,notify_by_email:notify};
 const oldDefault=defaultCardExplanation(capsulePlan(c));
 try{await updateOwnedCapsule(c,payload)}catch(error){await renderOrganizerLifecycle(c);if($("capsule-date").disabled)$("capsule-date").value=c.wedding_date;throw error}
 Object.assign(c,payload);$("dashboard-title").textContent=name;$("plan-explanation-help").textContent="Texte proposé pour la formule "+PLAN_NAMES[capsulePlan(c)]+".";
 if($("print-explanation").value===oldDefault){$("print-explanation").value=defaultCardExplanation(capsulePlan(c));organizerState.qr=true}
 await renderOrganizerLifecycle(c);
 window.SuiteOrganizerLayout?.syncDate?.();
 organizerState.settings=($("capsule-name").value.trim()!==name||$("capsule-date").value!==date||$("capsule-plan").value!==plan||$("capsule-notify").checked!==notify);return true;
}


let exportingMemories=false;
window.addEventListener('beforeunload',e=>{if(exportingMemories&&!ownerSessionEnded){e.preventDefault();e.returnValue=''}});
async function exportOpenedMemories(c){
 if(exportingMemories)return;
 let writable,parts=[],size=0;const button=$("export-memories"),name='souvenirs-'+slugify(c.couple_name)+'.zip';
 exportingMemories=true;button.disabled=true;
 try{
  // Keep the native picker inside the click gesture, before the first request.
  if(window.showSaveFilePicker){const handle=await window.showSaveFilePicker({suggestedName:name,types:[{description:'Souvenirs ZIP',accept:{'application/zip':['.zip']}}]});writable=await handle.createWritable()}
  const {data:bundle,error}=await sb.rpc('owner_export_bundle',{p_capsule_id:c.id});if(error)throw error;
  if(!bundle?.messages?.length)throw Error('Aucun souvenir ouvert à télécharger. Actualisez la liste.');
  const text=new Blob([bundle.name+' — '+fdate(bundle.date)+'\n\n'+bundle.messages.map(m=>(m.guest_name||'Invité')+' · '+fdate(m.delivery_at)+'\n'+(m.message_text||'Souvenir '+m.media_type)+'\n').join('\n')],{type:'text/plain;charset=utf-8'});
  const entries=[{name:'Vos-messages.txt',size:text.size,load:async()=>text}];
  bundle.messages.filter(m=>m.path).forEach((m,i)=>{const ext=m.path.split('.').pop().replace(/[^a-z0-9]/gi,'').slice(0,8)||'bin';entries.push({name:String(i+1).padStart(4,'0')+'-'+(slugify(m.guest_name||'invite')||'invite')+'.'+ext,size:Number(m.bytes),load:async()=>{const {data,error}=await sb.storage.from('capsule-media').download(m.path);if(error||!data)throw error||Error('Fichier indisponible.');return data}})});
  if(!writable){if(entries.reduce((sum,e)=>sum+e.size+500,0)>150000000)throw Error('Vos souvenirs dépassent 150 Mo. Téléchargez-les depuis Chrome ou Edge sur ordinateur pour les enregistrer directement sur disque.');
   writable={write:async bytes=>{size+=bytes.byteLength;if(size>150000000)throw Error('Archive trop volumineuse pour ce navigateur. Utilisez Chrome ou Edge sur ordinateur.');parts.push(bytes)},close:async()=>{const url=URL.createObjectURL(new Blob(parts,{type:'application/zip'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);parts=[]},abort:async()=>{parts=[]}};
  }
  if(ownerSessionEnded)throw Error("Votre session est terminée. Reconnectez-vous.");
  if(capsuleExpired(c))throw Error("La période de conservation est terminée.");
  await SouvenirZip.write(entries,writable,(i,total)=>show($("export-status"),'Téléchargement : '+i+' / '+total+' fichiers…'),{signal:ownerDownloadSession.signal});if(!ownerSessionEnded)show($("export-status"),'Vos souvenirs ouverts ont été téléchargés.');
 }catch(e){await writable?.abort?.();if(e.name!=='AbortError')show($("export-status"),e.message||'Téléchargement interrompu. Réessayez.',false)}
 finally{exportingMemories=false;button.disabled=capsuleExpired(c)||ownerSessionEnded}
}
async function setupOfferServices(c){
 try{
  const {data,error}=await sb.functions.invoke('suite-billing',{body:{action:'status',capsule_id:c.id}});if(error||!data)return;
  $("notification-preference").hidden=!data.notifications_enabled;
  if(c.status==='draft'&&!data.payments_enabled){const access=await capsuleAccess();if(!access.free_launch){$("activate-capsule").disabled=true;show($("activation-status"),"Le paiement est momentanément indisponible. Votre préparation est conservée.",false);}}
  c.pendingPayment=Boolean(data.pending_payment);if(c.pendingPayment)$("capsule-plan").disabled=true;updateEventDateControls(c);
 }catch(_){}
}

async function renderOrganizerLifecycle(c){
 const {data,error}=await sb.rpc("owner_capsule_usage",{p_capsule_id:c.id});
 if(ownerSessionEnded)return;
 const root=document.querySelector('[data-owner-panel="messages"]');
 let panel=root.querySelector(".capsule-lifecycle");if(!panel){panel=document.createElement("section");panel.className="capsule-lifecycle";root.prepend(panel);}
 if(error||!data){c.usage=null;updateEventDateControls(c);panel.textContent="Les dates et le stockage sont momentanément indisponibles.";document.querySelector('[data-owner-panel="messages"]').prepend(panel);return}
 c.usage=data;
 updateEventDateControls(c);
 const names={suspended:"Dépôts en pause",draft:"En préparation",scheduled:"Prête à partager",open:"Dépôts ouverts",closed:"Souvenirs à découvrir",full:"Stockage rempli",expired:"Conservation terminée",missing_date:"Date à compléter"};
 const ratio=Math.min(100,Math.round(data.used_bytes/data.quota_bytes*100)),warning=ratio>=95?"Il reste très peu de place pour les fichiers. Les petits mots restent possibles.":ratio>=80?"Votre capsule approche de sa limite de stockage.":"";
 panel.innerHTML='<strong>'+esc(names[data.state]||"Votre capsule")+'</strong><span class="owner-storage">'+Math.round(data.used_bytes/1000000)+' Mo / '+(data.quota_bytes/1000000000)+' Go</span><progress max="100" value="'+ratio+'" aria-label="Stockage utilisé"></progress>'+(warning?'<p>'+esc(warning)+'</p>':'');
 let dates=root.querySelector(".owner-dates");if(!dates){dates=document.createElement("details");dates.className="owner-dates";panel.after(dates);}
 dates.innerHTML='<summary>Dates de votre capsule</summary><p>'+esc(data.legacy&&!data.custom_rules?"Cette capsule conserve sa période de dépôt initiale.":"Dépôts du "+fParis(data.opens_at)+" au "+fParis(new Date(new Date(data.closes_at).getTime()-1000).toISOString())+" inclus · heure de Paris.")+'</p><p>Dévoilement jusqu’au '+esc(fParis(new Date(new Date(data.delivery_before).getTime()-1000).toISOString()))+' · Conservation jusqu’au '+esc(fParis(capsuleAccessLastDay(data)))+'.</p>';

}

function setupOrganizerGuestPreview(c,saveAll){
 const link=$('open-guest-link');if(!link)return;
 link.removeAttribute('target');link.setAttribute('role','button');link.setAttribute('aria-haspopup','dialog');link.setAttribute('aria-controls','organizer-guest-preview');link.title='Prévisualiser le parcours invité avant l’événement';
 const dialog=document.createElement('dialog');dialog.id='organizer-guest-preview';dialog.className='organizer-guest-preview';dialog.setAttribute('aria-labelledby','organizer-guest-preview-title');
 dialog.innerHTML='<div class="guest-preview-heading"><div><h2 id="organizer-guest-preview-title">Aperçu côté invité</h2><p>Simulation · disponible avant l’événement</p></div><button type="button" class="guest-dialog-close" aria-label="Fermer l’aperçu invité">×</button></div><p id="guest-preview-loading" role="status">Préparation de votre aperçu…</p><iframe title="Aperçu de la page de dépôt" allow="camera; microphone"></iframe>';
 $('dashboard-content').append(dialog);
 const frame=dialog.querySelector('iframe'),loading=dialog.querySelector('[role=status]');let generation=0,receive=null;
 const close=()=>dialog.close();dialog.querySelector('button').onclick=close;
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}});
 dialog.addEventListener('close',()=>{generation++;if(receive)window.removeEventListener('message',receive);receive=null;frame.removeAttribute('src');frame.hidden=true;link.focus()});
 link.addEventListener('keydown',e=>{if(e.key===' '){e.preventDefault();link.click()}});
 link.addEventListener('click',async e=>{
  e.preventDefault();if(dialog.open||ownerSessionEnded)return;
  const version=++generation;loading.hidden=false;loading.textContent='Préparation de votre aperçu…';frame.hidden=true;dialog.showModal();
  try{
   if(!await saveAll()){if(version===generation&&dialog.open)dialog.close();return}
   let introUrl=null;
   if(c.intro_path){const {data,error}=await sb.storage.from('capsule-media').createSignedUrl(c.intro_path,300);if(error||!data?.signedUrl)throw Error('Le message d’accueil n’a pas chargé. Fermez l’aperçu puis réessayez.');introUrl=data.signedUrl}
   if(version!==generation||!dialog.open||ownerSessionEnded)return;
   const snapshot={couple_name:c.couple_name,wedding_date:c.wedding_date,welcome_message:c.welcome_message,welcome_config:c.welcome_config,effective_plan:capsulePlan(c),delivery_before:c.usage?.delivery_before||addMonthsClamped(c.wedding_date||parisDay(),30)+'T23:59:59Z',has_intro:Boolean(introUrl),preview_intro_url:introUrl,preview_intro_type:introKind(c)};
   receive=event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow||version!==generation||!dialog.open)return;
    if(event.data?.type==='la-suite-guest-preview-close'){close();return}
    if(event.data?.type!=='la-suite-guest-preview-ready')return;
    frame.contentWindow.postMessage({type:'la-suite-guest-preview',capsule:snapshot},location.origin);loading.hidden=true;
   };
   window.addEventListener('message',receive);frame.hidden=false;frame.src=new URL('capsule.html?preview=1',location.href).href;
  }catch(error){if(version===generation&&dialog.open)loading.textContent=error.message}
 });
}
async function initDashboard(){
 if(!$("dashboard-content"))return;
 if(!configured)return $("dashboard-content").innerHTML='<div class="notice">Supabase non configuré.</div>';
 const u=await user();if(!u)return location.href=qs.get("view")==="service"?"auth.html?next=admin":"auth.html";
 if(qs.get('view')==='service')return location.replace('admin.html'+location.hash);
 const {data:adminMember,error:adminError}=await sb.rpc('admin_status');
 if(adminError)return $('dashboard-content').innerHTML='<p class="status show err">Vérification du compte impossible. Rechargez la page.</p>';
 if(adminMember===true)return location.replace('admin.html'+location.hash);

 sb.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||session?.user?.id&&session.user.id!==u.id){ownerSessionEnded=true;ownerDownloadSession.abort(new Error('Votre session est terminée. Reconnectez-vous.'));$('organizer-guest-preview')?.close();$('welcome-editor')?.close();$('print-download-dialog')?.close();$('organizer-card-preview-dialog')?.close();clearInterval(countdownTimer);memoryMediaObserver?.disconnect();Object.assign(organizerState,{qr:false,intro:false,welcome:false,settings:false,saving:0});$("dashboard-content").replaceChildren();$("dashboard-title").textContent='Connexion requise';queueMicrotask(()=>location.replace('auth.html'))}});
 const logout=async()=>{if(organizerState.saving)return false;if(organizerDirty()&&!confirm("Des modifications ne sont pas enregistrées. Quitter quand même ?"))return false;Object.assign(organizerState,{qr:false,intro:false,welcome:false,settings:false});await sb.auth.signOut();location.href="index.html";return true;};
 const{data:caps,error}=await sb.from("capsules").select("id,slug,status,plan,admin_plan_override,activation_source,guest_rules_version,guest_token,couple_name,wedding_date,welcome_message,welcome_config,intro_path,qr_initials,qr_color,print_title,print_note,print_explanation,qr_font,qr_style,qr_size,qr_show_initials,qr_show_brand,suggested_delivery_months,suggested_delivery_date,notify_by_email,owner_messages_seen_at,created_at").order("created_at",{ascending:false});
 if(ownerSessionEnded)return;
 if(error)return $("dashboard-content").innerHTML='<div class="status show err">'+esc(error.message)+'</div>';
 let access;
 try{access=await capsuleAccess()}catch(error){return $("dashboard-content").innerHTML='<div class="status show err">'+esc(error.message)+'</div>'}
 if(ownerSessionEnded)return;
 if(!qs.get("slug")&&caps.length){let last;try{last=localStorage.getItem('la_suite_last_'+u.id)}catch{}const chosen=caps.find(c=>c.slug===last)||caps[0];location.replace("dashboard.html?slug="+encodeURIComponent(chosen.slug)+location.hash);return;}
 const c=caps.find(x=>x.slug===qs.get("slug"));
 await window.SuiteWorkspace.setup({sb,user:u,caps,access,selected:c,canLeave:()=>!organizerDirty()&&!organizerState.saving,logout});
 if(ownerSessionEnded)return;
 if(!caps.length){$("dashboard-title").textContent="Mon espace";$("dashboard-content").innerHTML='<section class="workspace-empty"><h2>Votre première capsule</h2><p>Créez votre capsule, personnalisez votre carte et partagez-la avec vos invités.</p>'+ (access.can_create?'<a class="btn primary" href="create.html">Créer une capsule</a>':'<p>'+esc(access.reason||"Création momentanément indisponible.")+'</p>')+'</section>';return;}
 if(!c)return $("dashboard-content").innerHTML='<div class="notice">Capsule introuvable. Ouvrez « Mon compte », puis « Mes capsules » pour en choisir une autre.</div>';
 try{localStorage.setItem('la_suite_last_'+u.id,c.slug)}catch{}
 $("dashboard-title").textContent=c.couple_name;
 const url=new URL("capsule.html",location.href);url.search="?t="+encodeURIComponent(c.guest_token);
 let manifest=[];
 $("dashboard-content").innerHTML=ownerShell(c,url.href,(manifest||[]).length);
 compactOwnerEditors(c);
 document.querySelectorAll("[data-memory-filter]").forEach(button=>button.addEventListener("click",()=>{memoryFilter=button.dataset.memoryFilter;applyMemoryFilter()}));
 await renderOrganizerLifecycle(c);
 if(ownerSessionEnded)return;
 const freeLaunch=access.free_launch===true;
 const stage=document.createElement("section");stage.className="activation-panel";
 stage.innerHTML=capsuleExpired(c)?'<span class="capsule-badge">Conservation terminée</span><p>La période d’accès est terminée. Vos fichiers déjà téléchargés restent à votre disposition.</p>':c.status==="active"?'<span class="capsule-badge">Capsule active</span><p>Votre lien invité et votre carte QR sont prêts à être partagés.</p>':`<div class="activation-intro"><span class="capsule-badge">En préparation</span><h2>Votre capsule est prête ?</h2><p>Votre QR code sera utilisable par vos invités après l’activation.</p></div><p class="atelier-customization-note">Votre carte QR et la page d’accueil restent personnalisables après activation.</p><button class="btn primary" id="review-activation" type="button">Valider ma capsule</button><dialog id="activation-dialog"><form method="dialog"><button class="dialog-close" aria-label="Fermer">×</button></form><div class="eyebrow">Dernière étape · Activation</div><h2>Tout est prêt ?</h2><p data-activation-summary><strong>${esc(c.couple_name)}</strong> · ${esc(fdate(c.wedding_date))} · ${esc(PLAN_NAMES[capsulePlan(c)]||"Premium")}</p>${freeLaunch?'<p>Votre capsule reste gratuite pendant ses 3 ans d’accès, avec tous les formats et 5 Go.</p>':'<p data-activation-price></p><p>Paiement unique, sans abonnement. Les dépôts seront ouverts le jour de votre événement et le lendemain. Accès pendant 3 ans à compter de l’événement.</p>'}<p class="atelier-customization-note">Votre carte QR et la page d’accueil restent personnalisables après activation.</p><button id="activate-capsule" class="btn primary" type="button">${freeLaunch?"Activer gratuitement":"Continuer vers le paiement"}</button><p id="activation-status" class="status" role="status"></p></dialog>`;
 document.querySelector(".qr-designer-controls").insertBefore(stage,document.querySelector(".design-mobile-footer"));if(c.status==="active"&&!capsuleExpired(c))stage.hidden=true;
 if(c.status!=="active"||capsuleExpired(c)){
  ["share-link","download-print-card","print-print-card"].forEach(id=>{$(id).disabled=true;$(id).title=capsuleExpired(c)?"La période de conservation est terminée":"Activez votre capsule pour partager votre carte"});
  const guestLink=$("open-guest-link");if(guestLink)guestLink.hidden=capsuleExpired(c);
 }
 if(c.status!=="active"&&!capsuleExpired(c)){
  $("review-activation").addEventListener("click",async()=>{if(await saveAll()){ $("activation-dialog").querySelector('[data-activation-summary]').textContent=c.couple_name+" · "+fdate(c.wedding_date)+" · "+PLAN_NAMES[capsulePlan(c)];if(!freeLaunch){$("activation-dialog").querySelector("[data-activation-price]").textContent=PLAN_NAMES[c.plan]+" · "+money(PLAN_PRICES[c.plan])+" · "+({photo:"1 Go · photos et textes",audio:"2 Go · photos, textes et audios",premium:"5 Go · tous les formats"})[c.plan];$("activate-capsule").textContent="Payer "+money(PLAN_PRICES[c.plan])+" et activer";}$("activation-dialog").showModal()}});
  $("activate-capsule").addEventListener("click",async()=>{
   const button=$("activate-capsule");button.disabled=true;
   try{
    if(!await saveAll())throw new Error("Enregistrez toutes les modifications avant de réessayer.");
    if(!freeLaunch){await openCheckout(c);return;}
    const{error}=await sb.rpc("activate_capsule",{p_capsule_id:c.id});if(error)throw error;
    location.href="dashboard.html?slug="+encodeURIComponent(c.slug)+"&activated=1";
   }catch(e){show($("activation-status"),"Activation impossible : "+e.message,false);button.disabled=false}
  });
 }
 setupCapsuleSettings(c);
 setupOfferServices(c);
 if(qs.get("payment")==="cancel")show($("activation-status"),"Paiement annulé. Votre préparation est conservée ; vous pouvez réessayer.",false);
 if(qs.get("payment")==="return"&&c.status!=="active"){
  const note=document.createElement("p");note.className="notice";note.setAttribute("role","status");note.textContent="Confirmation du paiement en cours. Votre capsule s’activera après confirmation par Stripe.";stage.prepend(note);
  let attempts=0;const timer=setInterval(async()=>{if(ownerSessionEnded||++attempts>20){clearInterval(timer);if(!ownerSessionEnded){note.textContent='La confirmation prend plus de temps que prévu. Actualisez pour vérifier l’activation de votre capsule.';const retry=document.createElement('button');retry.type='button';retry.className='btn secondary';retry.textContent='Vérifier l’activation';retry.onclick=()=>location.reload();note.append(document.createElement('br'),retry);}return;}try{const {data}=await sb.from("capsules").select("status").eq("id",c.id).maybeSingle();if(data?.status==="active"){clearInterval(timer);location.replace("dashboard.html?slug="+encodeURIComponent(c.slug)+"&activated=1");}}catch{}},3000);
 }
 $("export-memories").addEventListener("click",()=>exportOpenedMemories(c));
 const savebar=document.createElement('div');savebar.className='organizer-savebar';savebar.hidden=true;savebar.innerHTML='<span id="organizer-save-state" role="status" aria-live="polite">Tout est enregistré</span><button class="btn secondary" id="save-organizer" type="button">Tout enregistrer</button><p id="organizer-save-error" class="status" role="status"></p>';
 $("owner-overview").append(savebar);
 setupOwnerTabs(c,manifest||[]);
 applyQrPreview(url.href,c);
 const liveIds=["print-title","print-note","print-explanation","qr-initials-input","qr-color","qr-font","qr-style","qr-show-initials"];
 let qrSaveTimer=null,autoSaveTimer=null,saveAllPending=null,welcomeDesigner=null;
 function saveAll(){
  if(ownerSessionEnded||!$("save-organizer"))return Promise.resolve(false);
  if(saveAllPending)return saveAllPending;
  clearTimeout(qrSaveTimer);clearTimeout(autoSaveTimer);organizerState.saving++;saveIndicator();$("save-organizer").disabled=true;
  saveAllPending=(async()=>{try{
   if(!await saveCapsuleSettings(c))return false;
   applyQrPreview(url.href,{...c,...collectQrCustomization(c)});
   if(introSavePending&&!await introSavePending)return false;
   if(organizerState.intro&&!await uploadIntro(c))return false;
   if(organizerState.welcome&&welcomeDesigner){const config=welcomeDesigner.collect();await updateOwnedCapsule(c,{welcome_config:config});c.welcome_config=config;if(JSON.stringify(config)===JSON.stringify(welcomeDesigner.collect()))organizerState.welcome=false;}
   if(organizerState.qr&&!await saveQrCustomization(c,url.href,true))return false;
   organizerState.error=false;if(organizerDirty()){show($("organizer-save-error"),"Des modifications ont été faites pendant la sauvegarde. Enregistrez-les avant de continuer.",false);return false}show($("organizer-save-error"),'');return true;
  }catch(e){organizerState.error=true;show($("organizer-save-error"),'Enregistrement impossible : '+e.message,false);return false}
  finally{organizerState.saving--;saveIndicator();saveAllPending=null}})();
  return saveAllPending;
 }
 $("save-organizer").addEventListener('click',saveAll);
 setupOrganizerGuestPreview(c,saveAll);

 const updateDesigner=()=>{
   markDirty("qr");
   welcomeDesigner?.syncShared();
   const sample=document.querySelector('.studio-font-example');if(sample)sample.textContent=$('print-title').value||DEFAULT_CARD_TITLE;
   const select=$('studio-font-select');if(select){select.value=$('qr-font').value;if(sample)sample.className='studio-font-example qr-font-sample-'+select.value;}
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
 for(const [id,fallback] of [['print-note',DEFAULT_CARD_NOTE],['print-explanation',defaultCardExplanation(capsulePlan(c))]]){
  const field=$(id),toggle=$(id+'-visible');field.hidden=!toggle.checked;
  toggle.addEventListener('change',()=>{if(!toggle.checked){field.dataset.previousText=field.value;field.value='';}else field.value=field.dataset.previousText||fallback;field.hidden=!toggle.checked;field.dispatchEvent(new Event('input',{bubbles:true}));});
 }
 $("share-link")?.addEventListener("click",()=>shareGuestLink(url.href));
 setupPrintDownload(c,url.href);
 $("print-print-card")?.addEventListener("click",()=>{
   Object.assign(c,collectQrCustomization(c));
   applyQrPreview(url.href,c);
   printPrintCard(c,url.href);
 });
 setupIntro(c);saveIndicator();
 welcomeDesigner=window.SuiteWelcome.setup({capsule:c,markDirty,scheduleSave:scheduleAutoSave,saveAll});
 window.SuiteOrganizerLayout?.mount(c);
 $('capsule-date').addEventListener('input',()=>{if($('capsule-date').validity.valid)applyQrPreview(url.href,{...c,...collectQrCustomization(c),wedding_date:$('capsule-date').value})});
 function scheduleAutoSave(){
  clearTimeout(autoSaveTimer);
  autoSaveTimer=setTimeout(async()=>{
   if(ownerSessionEnded||organizerState.error)return;
   if(organizerState.saving){scheduleAutoSave();return}
   if(organizerState.settings&&(!$("capsule-name").value.trim()||!$("capsule-date").value))return;
   const kind=$("intro-kind").value;
   if(organizerState.intro&&(kind==="text"&&!$("intro-text").value.trim()||(kind==="image"||kind==="video")&&!$("intro-file").files[0]&&introKind(c)!==kind))return;
   await saveAll();
  },800);
 }
 ["capsule-name","capsule-date","capsule-plan","capsule-notify","intro-kind","intro-file","intro-text"].forEach(id=>{
  $(id).addEventListener("input",scheduleAutoSave);$(id).addEventListener("change",scheduleAutoSave);
 });
 let refreshInProgress=false;
 async function refreshMemories(){
  if(refreshInProgress||ownerSessionEnded)return;refreshInProgress=true;
  const button=$("refresh-memories");button.disabled=true;show($("memory-status"),'Chargement des souvenirs…');
  try{await renderOrganizerLifecycle(c);if(ownerSessionEnded)return;const{data,error}=await sb.rpc('owner_message_manifest',{p_capsule_id:c.id});if(ownerSessionEnded)return;if(error)throw error;manifest.splice(0,manifest.length,...(data||[]));await renderManifest(c,manifest);if(ownerSessionEnded)return;$("export-memories").disabled=exportingMemories||capsuleExpired(c)||!manifest.some(m=>m.is_available);$("memory-count").textContent=memoryCountLabel(manifest.length);nextCountdown(c,manifest,refreshMemories);updateOwnerUnreadBadge(ownerUnreadCount(c,manifest));if(location.hash==='#messages')await markOwnerMessagesSeen(c,manifest);show($("memory-status"),'')}catch(e){show($("memory-status"),'Chargement impossible. Utilisez « Actualiser » pour réessayer.',false)}finally{button.disabled=false;refreshInProgress=false}
 }
 $("refresh-memories").addEventListener('click',refreshMemories);await refreshMemories();
 window.addEventListener('suite-capsule-rules-changed',async e=>{if(e.detail===c.id){const expired=capsuleExpired(c);await refreshMemories();if(expired&&!capsuleExpired(c))location.reload()}});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&(capsuleExpired(c)||manifest.some(m=>!m.is_available&&new Date(m.delivery_at)<=new Date())))refreshMemories()});
 if(capsuleExpired(c)){document.querySelectorAll('#dashboard-content input,#dashboard-content select,#dashboard-content textarea,.owner-panel button,#save-organizer').forEach(e=>e.disabled=true)}
 if(qs.get('activated')==='1'&&c.status==='active'&&!capsuleExpired(c)){
  const success=document.createElement('section');success.className='activation-success';success.innerHTML='<div class="eyebrow">Capsule active</div><h2>Votre capsule est prête à être partagée !</h2><p>Votre carte et votre message d’accueil sont enregistrés. Invitez maintenant vos proches à participer.</p><div class="success-actions"><button class="btn primary" data-success-action="share-link">Partager le lien</button><button class="btn secondary" data-success-action="download-print-card">Télécharger la carte</button><button class="btn secondary" data-success-action="print-print-card">Imprimer</button></div>';
  $("dashboard-content").prepend(success);success.querySelectorAll('[data-success-action]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.successAction).click()));
  history.replaceState(null,'','dashboard.html?slug='+encodeURIComponent(c.slug));
 }
}

initAuth();initCreate();initCapsule();initDashboard();
window.addEventListener("beforeunload",stopStream);
})();
