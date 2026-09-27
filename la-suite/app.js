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
 const status=$("status");
 form.addEventListener("submit",async e=>{
  e.preventDefault();const fd=new FormData(form),couple=String(fd.get("couple")||"").trim(),wedding=String(fd.get("wedding_date")||""),welcome=String(fd.get("welcome_message")||"").trim();
  if(!couple||!wedding)return show(status,"Complétez les champs obligatoires.",false);
  if(!configured)return show(status,"Supabase n'est pas configuré.",false);
  const u=await user();if(!u)return location.href="auth.html";
  show(status,"Création de la capsule…");
  const{data,error}=await sb.from("capsules").insert({owner_id:u.id,slug:slugify(couple)+"-"+rid(),couple_name:couple,wedding_date:wedding,welcome_message:welcome||null,unlock_date:null}).select("id,slug,guest_token").single();
  if(error)return show(status,"Création impossible : "+error.message,false);
  location.href="dashboard.html?slug="+encodeURIComponent(data.slug)
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

async function uploadIntro(c){
 const f=$("intro-file")?.files?.[0],s=$("intro-status");if(!f)return show(s,"Choisissez une vidéo.",false);
 if(!f.type.startsWith("video/"))return show(s,"Choisissez un fichier vidéo.",false);
 if(f.size>maxBytes)return show(s,"La vidéo dépasse 100 Mo.",false);
 const path=c.id+"/organizer/intro."+ext(f.type);show(s,"Envoi de la vidéo…");
 const up=await sb.storage.from("capsule-media").upload(path,f,{contentType:f.type,upsert:true});if(up.error)return show(s,up.error.message,false);
 const{error}=await sb.from("capsules").update({intro_path:path}).eq("id",c.id);if(error)return show(s,error.message,false);
 show(s,"Vidéo d'accueil enregistrée.");setTimeout(()=>location.reload(),400)
}

function ownerShell(c,url,count){return `
<div class="dashboard-grid">
<section class="card dashboard-card"><div class="eyebrow">Votre QR code</div><h3>${esc(c.couple_name)}</h3><p>Événement : ${esc(fdate(c.wedding_date))}</p><div class="qr-wrap"><div id="qrcode"></div></div><a class="btn primary" href="${url}">Ouvrir la page invité</a><p class="share-url">${esc(url)}</p></section>
<section class="card dashboard-card"><div class="eyebrow">Vidéo d'accueil</div><h3>Le message vu après le scan</h3><div id="intro-preview-wrap"></div><input id="intro-file" type="file" accept="video/*"><button id="upload-intro" class="btn secondary" type="button">Enregistrer cette vidéo</button><div id="intro-status" class="status"></div></section>
</div>
<section class="memories-section"><div class="section-title-row"><div><div class="eyebrow">Souvenirs reçus</div><h2>${count} contenu(s)</h2></div></div><div id="memory-list" class="memory-list"></div></section>`}

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
 const{data:caps,error}=await sb.from("capsules").select("id,slug,guest_token,couple_name,wedding_date,welcome_message,intro_path,created_at").order("created_at",{ascending:false});
 if(error)return $("dashboard-content").innerHTML='<div class="status show err">'+esc(error.message)+'</div>';
 if(!caps.length)return $("dashboard-content").innerHTML='<div class="notice">Aucune capsule. <a href="create.html"><strong>Créer une capsule</strong></a>.</div>';
 const c=(qs.get("slug")&&caps.find(x=>x.slug===qs.get("slug")))||caps[0];$("dashboard-title").textContent=c.couple_name;
 const url=new URL("capsule.html",location.href);url.search="?t="+encodeURIComponent(c.guest_token);
 const{data:manifest,error:me}=await sb.rpc("owner_message_manifest",{p_capsule_id:c.id});if(me)return $("dashboard-content").innerHTML='<div class="status show err">'+esc(me.message)+'</div>';
 $("dashboard-content").innerHTML=ownerShell(c,url.href,(manifest||[]).length);
 if(window.QRCode)new QRCode($("qrcode"),{text:url.href,width:180,height:180,correctLevel:QRCode.CorrectLevel.M});
 $("upload-intro").addEventListener("click",()=>uploadIntro(c));
 if(c.intro_path){const s=await sb.storage.from("capsule-media").createSignedUrl(c.intro_path,300);if(s.data?.signedUrl)$("intro-preview-wrap").innerHTML='<video class="intro-preview" controls src="'+s.data.signedUrl+'"></video>'}
 nextCountdown(manifest||[]);await renderManifest(c,manifest||[])
}

initAuth();initCreate();initCapsule();initDashboard();
window.addEventListener("beforeunload",stopStream);
})();