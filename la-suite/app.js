(function(){
  const qs = new URLSearchParams(location.search);

  function slugify(value){
    return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,50);
  }
  function randomId(){
    return Math.random().toString(36).slice(2,8);
  }
  function show(el,msg,ok=true){
    if(!el) return;
    el.textContent=msg;
    el.className="status show "+(ok?"ok":"err");
  }

  const createForm=document.getElementById("create-capsule");
  if(createForm){
    createForm.addEventListener("submit",e=>{
      e.preventDefault();
      const data=new FormData(createForm);
      const couple=data.get("couple").trim();
      const capsule={
        id: crypto.randomUUID ? crypto.randomUUID() : randomId()+Date.now(),
        slug: slugify(couple)+"-"+randomId(),
        couple_name: couple,
        wedding_date:data.get("wedding_date"),
        unlock_date:data.get("unlock_date"),
        welcome_message:data.get("welcome_message")||"",
        created_at:new Date().toISOString()
      };
      const all=JSON.parse(localStorage.getItem("la-suite-capsules")||"[]");
      all.push(capsule);
      localStorage.setItem("la-suite-capsules",JSON.stringify(all));
      localStorage.setItem("la-suite-current",capsule.slug);
      show(document.getElementById("status"),"Capsule créée en mode prototype. Ouverture du tableau de bord…");
      setTimeout(()=>location.href="dashboard.html?slug="+encodeURIComponent(capsule.slug),600);
    });
  }

  const title=document.getElementById("capsule-title");
  if(title){
    const slug=qs.get("slug");
    const all=JSON.parse(localStorage.getItem("la-suite-capsules")||"[]");
    const capsule=all.find(c=>c.slug===slug);
    if(capsule){
      title.textContent=capsule.couple_name;
      document.getElementById("capsule-date").textContent="À ouvrir le "+new Date(capsule.unlock_date+"T12:00:00").toLocaleDateString("fr-FR");
    }else{
      title.textContent="Capsule de démonstration";
      document.getElementById("capsule-date").textContent="Lien de démonstration local";
    }
  }

  const guestForm=document.getElementById("guest-message");
  if(guestForm){
    guestForm.addEventListener("submit",e=>{
      e.preventDefault();
      const file=document.getElementById("video").files[0];
      if(file && file.size>100*1024*1024){
        return show(document.getElementById("status"),"La vidéo dépasse 100 Mo pour ce prototype.",false);
      }
      show(document.getElementById("status"),"Parcours validé. Le stockage vidéo cloud sera activé à l'étape Supabase.");
      guestForm.reset();
    });
  }

  const dash=document.getElementById("dashboard-content");
  if(dash){
    const slug=qs.get("slug")||localStorage.getItem("la-suite-current");
    const all=JSON.parse(localStorage.getItem("la-suite-capsules")||"[]");
    const capsule=all.find(c=>c.slug===slug);
    if(!capsule){
      dash.innerHTML='<div class="notice">Aucune capsule locale trouvée. <a href="create.html"><strong>Créer une capsule</strong></a>.</div>';
    }else{
      const guestUrl=new URL("capsule.html",location.href);
      guestUrl.search="?slug="+encodeURIComponent(capsule.slug);
      dash.innerHTML=
        '<div class="card"><h3>'+escapeHtml(capsule.couple_name)+'</h3>'+
        '<p>Date de l’événement : '+escapeHtml(capsule.wedding_date)+'</p>'+
        '<p>Ouverture : '+escapeHtml(capsule.unlock_date)+'</p>'+
        '<p style="margin-top:14px"><a class="btn primary" href="'+guestUrl.href+'">Tester la page invité</a></p>'+
        '<p style="word-break:break-all;margin-top:14px;color:var(--muted)">'+guestUrl.href+'</p></div>';
    }
  }

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  }
})();