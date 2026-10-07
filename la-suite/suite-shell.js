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

