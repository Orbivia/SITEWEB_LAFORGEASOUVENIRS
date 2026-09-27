(function(){
  const qs = new URLSearchParams(location.search);
  const cfg = window.LA_SUITE_CONFIG || {};
  const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const sb = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const maxVideoBytes = cfg.MAX_VIDEO_BYTES || 100 * 1024 * 1024;

  function slugify(value){
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,50);
  }
  function randomId(){ return Math.random().toString(36).slice(2,8); }
  function show(el,msg,ok=true){
    if(!el) return;
    el.textContent=msg;
    el.className="status show "+(ok?"ok":"err");
  }
  function escapeHtml(str){
    return String(str == null ? "" : str).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  }
  function formatDate(value){
    if(!value) return "—";
    const d = new Date(String(value).length === 10 ? value+"T12:00:00" : value);
    return d.toLocaleDateString("fr-FR");
  }
  async function requireUser(){
    if(!sb) return null;
    const { data } = await sb.auth.getUser();
    return data?.user || null;
  }
  function localCapsules(){ return JSON.parse(localStorage.getItem("la-suite-capsules")||"[]"); }
  function saveLocalCapsule(capsule){
    const all = localCapsules();
    all.push(capsule);
    localStorage.setItem("la-suite-capsules",JSON.stringify(all));
    localStorage.setItem("la-suite-current",capsule.slug);
  }

  async function initAuth(){
    const form=document.getElementById("auth-form");
    if(!form) return;
    const status=document.getElementById("status");

    if(!configured){
      show(status,"Supabase n'est pas encore configuré.",false);
      return;
    }

    const user=await requireUser();
    if(user){
      show(status,"Vous êtes déjà connecté. Redirection…");
      setTimeout(()=>location.href="dashboard.html",500);
      return;
    }

    form.addEventListener("submit",async e=>{
      e.preventDefault();
      const email=document.getElementById("email").value.trim();
      const redirectTo=new URL("dashboard.html",location.href).href;
      show(status,"Envoi du lien de connexion…");
      const { error }=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo}});
      if(error) return show(status,"Impossible d'envoyer le lien : "+error.message,false);
      show(status,"Lien envoyé. Consultez votre boîte mail.");
      form.reset();
    });
  }

  async function initCreate(){
    const form=document.getElementById("create-capsule");
    if(!form) return;
    const status=document.getElementById("status");

    form.addEventListener("submit",async e=>{
      e.preventDefault();
      const data=new FormData(form);
      const couple=String(data.get("couple")||"").trim();
      const weddingDate=String(data.get("wedding_date")||"");
      const unlockDate=String(data.get("unlock_date")||"");
      const welcomeMessage=String(data.get("welcome_message")||"").trim();

      if(!couple || !weddingDate || !unlockDate) return show(status,"Complétez les champs obligatoires.",false);
      if(new Date(unlockDate+"T12:00:00") <= new Date(weddingDate+"T12:00:00")){
        return show(status,"La date d'ouverture doit être postérieure à la date de l'événement.",false);
      }

      if(!configured){
        const capsule={
          id: crypto.randomUUID ? crypto.randomUUID() : randomId()+Date.now(),
          slug: slugify(couple)+"-"+randomId(),
          guest_token: randomId()+randomId()+randomId()+randomId(),
          couple_name: couple,
          wedding_date:weddingDate,
          unlock_date:unlockDate,
          welcome_message:welcomeMessage,
          created_at:new Date().toISOString()
        };
        saveLocalCapsule(capsule);
        show(status,"Capsule créée en mode prototype local. Ouverture du tableau de bord…");
        return setTimeout(()=>location.href="dashboard.html?slug="+encodeURIComponent(capsule.slug),600);
      }

      const user=await requireUser();
      if(!user) return location.href="auth.html";

      show(status,"Création de la capsule…");
      const payload={
        owner_id:user.id,
        slug:slugify(couple)+"-"+randomId(),
        couple_name:couple,
        wedding_date:weddingDate,
        unlock_date:new Date(unlockDate+"T12:00:00").toISOString(),
        welcome_message:welcomeMessage || null
      };
      const { data:created,error }=await sb.from("capsules")
        .insert(payload)
        .select("id,slug,guest_token,couple_name,wedding_date,unlock_date,welcome_message")
        .single();
      if(error) return show(status,"Création impossible : "+error.message,false);

      localStorage.setItem("la-suite-current",created.slug);
      show(status,"Capsule créée. Ouverture du tableau de bord…");
      setTimeout(()=>location.href="dashboard.html?slug="+encodeURIComponent(created.slug),500);
    });
  }

  async function initCapsule(){
    const title=document.getElementById("capsule-title");
    if(!title) return;
    const status=document.getElementById("status");
    const token=qs.get("t") || qs.get("token");

    let capsule=null;
    if(configured && token){
      const { data,error }=await sb.rpc("get_capsule_public",{p_guest_token:token});
      if(error || !data || !data.length){
        title.textContent="Capsule introuvable";
        document.getElementById("guest-message").style.display="none";
        return show(status,"Ce lien n'est pas valide ou la capsule n'existe plus.",false);
      }
      capsule=data[0];
    }else{
      const slug=qs.get("slug");
      capsule=localCapsules().find(c=>c.slug===slug);
      if(!capsule){
        title.textContent="Capsule de démonstration";
        document.getElementById("capsule-date").textContent="Mode prototype local";
      }
    }

    if(capsule){
      title.textContent=capsule.couple_name;
      document.getElementById("capsule-date").textContent="Cette capsule sera ouverte le "+formatDate(capsule.unlock_date);
      const welcome=document.getElementById("capsule-welcome");
      if(welcome && capsule.welcome_message) welcome.textContent=capsule.welcome_message;
    }

    const form=document.getElementById("guest-message");
    form.addEventListener("submit",async e=>{
      e.preventDefault();
      const guestName=document.getElementById("guest_name").value.trim();
      const messageText=document.getElementById("message_text").value.trim();
      const file=document.getElementById("video").files[0];

      if(!guestName) return show(status,"Indiquez votre prénom.",false);
      if(!messageText && !file) return show(status,"Ajoutez un message ou une vidéo.",false);
      if(file && file.size>maxVideoBytes) return show(status,"La vidéo dépasse la limite de 100 Mo.",false);
      if(file && !["video/mp4","video/quicktime","video/webm"].includes(file.type)){
        return show(status,"Format vidéo non pris en charge. Utilisez MP4, MOV ou WebM.",false);
      }

      if(!configured || !token){
        show(status,"Parcours prototype validé. Le fichier n'est pas envoyé sans configuration Supabase.");
        form.reset();
        return;
      }

      try{
        show(status,"Envoi de votre souvenir…");
        if(!file){
          const { data,error }=await sb.functions.invoke("guest-upload",{
            body:{action:"submit_text",guest_token:token,guest_name:guestName,message_text:messageText}
          });
          if(error || data?.error) throw new Error(data?.error || error.message);
        }else{
          const init=await sb.functions.invoke("guest-upload",{
            body:{
              action:"init_video",
              guest_token:token,
              guest_name:guestName,
              message_text:messageText,
              file_type:file.type,
              file_size:file.size
            }
          });
          if(init.error || init.data?.error) throw new Error(init.data?.error || init.error.message);

          const path=init.data.path;
          const uploadToken=init.data.token;
          const messageId=init.data.message_id;

          const up=await sb.storage.from("capsule-media").uploadToSignedUrl(path,uploadToken,file,{
            contentType:file.type,
            upsert:false
          });
          if(up.error) throw up.error;

          const fin=await sb.functions.invoke("guest-upload",{
            body:{action:"finalize_video",guest_token:token,message_id:messageId,path}
          });
          if(fin.error || fin.data?.error) throw new Error(fin.data?.error || fin.error.message);
        }

        form.reset();
        show(status,"Votre souvenir a bien été déposé. Merci.");
      }catch(err){
        show(status,"Envoi impossible : "+(err?.message || "erreur inconnue"),false);
      }
    });
  }

  async function initDashboard(){
    const dash=document.getElementById("dashboard-content");
    if(!dash) return;

    if(!configured){
      const slug=qs.get("slug")||localStorage.getItem("la-suite-current");
      const capsule=localCapsules().find(c=>c.slug===slug);
      if(!capsule){
        dash.innerHTML='<div class="notice">Aucune capsule locale trouvée. <a href="create.html"><strong>Créer une capsule</strong></a>.</div>';
        return;
      }
      const guestUrl=new URL("capsule.html",location.href);
      guestUrl.search="?slug="+encodeURIComponent(capsule.slug);
      dash.innerHTML=renderCapsuleCard(capsule,guestUrl.href,null,true);
      renderQr(guestUrl.href);
      return;
    }

    const user=await requireUser();
    if(!user) return location.href="auth.html";

    const logout=document.getElementById("logout");
    if(logout) logout.addEventListener("click",async()=>{
      await sb.auth.signOut();
      location.href="index.html";
    });

    dash.innerHTML='<p class="hint">Chargement…</p>';
    const { data:capsules,error }=await sb.from("capsules")
      .select("id,slug,guest_token,couple_name,wedding_date,unlock_date,welcome_message,created_at")
      .order("created_at",{ascending:false});
    if(error){
      dash.innerHTML='<div class="status show err">Impossible de charger les capsules : '+escapeHtml(error.message)+'</div>';
      return;
    }
    if(!capsules.length){
      dash.innerHTML='<div class="notice">Aucune capsule pour le moment. <a href="create.html"><strong>Créer votre première capsule</strong></a>.</div>';
      return;
    }

    const requested=qs.get("slug");
    const capsule=(requested && capsules.find(c=>c.slug===requested)) || capsules[0];
    const { data:stats }=await sb.rpc("owner_capsule_stats",{p_capsule_id:capsule.id});
    const count=stats?.[0]?.message_count ?? 0;
    const guestUrl=new URL("capsule.html",location.href);
    guestUrl.search="?t="+encodeURIComponent(capsule.guest_token);
    dash.innerHTML=renderCapsuleCard(capsule,guestUrl.href,count,false);
    renderQr(guestUrl.href);

    if(new Date(capsule.unlock_date)<=new Date()){
      const { data:messages,error:msgError }=await sb.from("messages")
        .select("id,guest_name,message_text,video_path,created_at")
        .eq("capsule_id",capsule.id)
        .order("created_at",{ascending:true});
      const zone=document.getElementById("opened-content");
      if(zone){
        if(msgError) zone.innerHTML='<div class="status show err">Impossible de charger les souvenirs.</div>';
        else zone.innerHTML=await renderMessages(messages||[]);
      }
    }
  }

  function renderCapsuleCard(c,guestUrl,count,isLocal){
    const locked=new Date(c.unlock_date)>new Date();
    return '<div class="card">'+
      '<h3>'+escapeHtml(c.couple_name)+'</h3>'+
      '<p>Date de l’événement : '+escapeHtml(formatDate(c.wedding_date))+'</p>'+
      '<p>Ouverture : '+escapeHtml(formatDate(c.unlock_date))+'</p>'+
      (count===null?'':'<p><strong>'+escapeHtml(count)+'</strong> souvenir(s) déposé(s)</p>')+
      '<p><span class="lock-badge '+(locked?'locked':'open')+'">'+(locked?'Capsule fermée':'Capsule ouverte')+'</span></p>'+
      '<div class="qr-wrap"><div id="qrcode"></div></div>'+
      '<p style="margin-top:14px"><a class="btn primary" href="'+guestUrl+'">Ouvrir la page invité</a></p>'+
      '<p class="share-url">'+escapeHtml(guestUrl)+'</p>'+
      (isLocal?'<div class="notice">Mode local : ce lien ne fonctionne que dans ce navigateur.</div>':'')+
      '</div>'+
      '<div id="opened-content" style="margin-top:18px"></div>';
  }

  function renderQr(url){
    const el=document.getElementById("qrcode");
    if(!el || !window.QRCode) return;
    new QRCode(el,{text:url,width:180,height:180,correctLevel:QRCode.CorrectLevel.M});
  }

  async function renderMessages(messages){
    if(!messages.length) return '<div class="notice">Aucun souvenir déposé.</div>';
    const chunks=[];
    for(const m of messages){
      let media='';
      if(m.video_path){
        const { data,error }=await sb.storage.from("capsule-media").createSignedUrl(m.video_path,300);
        if(!error && data?.signedUrl) media='<video controls preload="metadata" class="memory-video" src="'+data.signedUrl+'"></video>';
      }
      chunks.push('<article class="card memory"><h3>'+escapeHtml(m.guest_name||"Invité")+'</h3>'+
        (m.message_text?'<p>'+escapeHtml(m.message_text)+'</p>':'')+media+
        '<small>'+escapeHtml(new Date(m.created_at).toLocaleString("fr-FR"))+'</small></article>');
    }
    return '<div class="memory-list">'+chunks.join("")+'</div>';
  }

  initAuth();
  initCreate();
  initCapsule();
  initDashboard();
})();