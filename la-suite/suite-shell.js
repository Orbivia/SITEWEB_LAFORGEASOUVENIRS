(() => {
  const burgers = document.querySelectorAll("[data-suite-burger]");
  burgers.forEach((burger) => {
    const header = burger.closest(".forge-style-header");
    const nav = header?.querySelector("[data-suite-nav]");
    if (!nav) return;

    burger.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      burger.setAttribute("aria-expanded", String(open));
    });

    nav.addEventListener("click", (event) => {
      if (!event.target.closest("a,button")) return;
      nav.classList.remove("open");
      burger.setAttribute("aria-expanded", "false");
    });
  });
})();
