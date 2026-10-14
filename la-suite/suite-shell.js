(() => {
  const burgers = document.querySelectorAll("[data-suite-burger]");
  burgers.forEach((burger) => {
    const header = burger.closest(".forge-style-header");
    const nav = header?.querySelector("[data-suite-nav]");
    if (!nav) return;
    const close = (restoreFocus = false) => {
      nav.classList.remove("open");
      burger.setAttribute("aria-expanded", "false");
      if (restoreFocus) burger.focus();
    };

    burger.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      burger.setAttribute("aria-expanded", String(open));
    });

    nav.addEventListener("click", (event) => {
      if (!event.target.closest("a,button")) return;
      close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.classList.contains("open")) {
        event.preventDefault();close(true);
      }
    });
    document.addEventListener("click", (event) => {
      if (!header.contains(event.target)) close();
    });
    matchMedia("(max-width:900px)").addEventListener("change", () => close());
  });
})();


(() => {
  let dialog=null,trigger=null;
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');if(!link||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const url=new URL(link.href,location.href);if(url.origin!==location.origin||!url.pathname.endsWith('/cgv.html'))return;
    event.preventDefault();trigger=link;
    if(!dialog){
      dialog=document.createElement('dialog');dialog.setAttribute('aria-labelledby','suite-cgv-title');
      dialog.style.cssText='width:min(820px,calc(100vw - 24px));height:calc(100dvh - 24px);max-width:none;max-height:none;padding:0;border:0;border-radius:16px;overflow:hidden;background:#fffdf8;color:#292724';
      dialog.innerHTML='<div style="display:flex;flex-direction:column;height:100%"><header style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #ddd7cd;flex:none"><h2 id="suite-cgv-title" style="margin:0;font:600 18px/1.3 Inter,Arial,sans-serif">Conditions générales de vente</h2><button type="button" aria-label="Fermer les conditions générales de vente" style="flex:none;width:44px;height:44px;border:1px solid #ddd7cd;border-radius:10px;background:#fffdf8;color:#292724;font:28px Arial,sans-serif">×</button></header><iframe title="Conditions générales de vente" style="width:100%;flex:1;min-height:0;border:0;background:#fffdf8"></iframe></div>';
      dialog.querySelector('button').onclick=()=>dialog.close();
      dialog.addEventListener('close',()=>{dialog.querySelector('iframe').src='about:blank';trigger?.focus({preventScroll:true});});
      dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const box=dialog.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)dialog.close();});
      document.body.append(dialog);
    }
    dialog.querySelector('iframe').src=url.href;if(!dialog.open)dialog.showModal();
  });
})();
