/**
 * Клавиатура iOS. Когда она открыта, видимая область (visualViewport) меньше экрана,
 * а страница может «уехать» вверх. Подгоняем корень приложения ровно под видимую
 * область: поля ввода не прячутся под клавиатуру, а при её закрытии ничего не прыгает.
 */
export function initViewport() {
  const vv = window.visualViewport;
  const html = document.documentElement;
  if (!vv) return;
  // Приложение на главном экране iOS: браузер отдаёт высоту без полосы статус-бара,
  // и снизу остаётся пустая полоса. Там приложение всегда на весь экран — берём высоту экрана.
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const screenH = () => (window.innerWidth > window.innerHeight ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height));
  let full = standalone ? screenH() : vv.height;
  let raf = 0;

  const apply = () => {
    raf = 0;
    const h = vv.height;
    if (h > full) full = h;
    const kbOpen = full - h > (standalone ? 180 : 120);
    html.style.setProperty("--vvh", `${Math.round(standalone && !kbOpen ? full : h)}px`);
    html.style.setProperty("--vvt", `${Math.round(Math.max(vv.offsetTop, 0))}px`);
    html.classList.toggle("kb", kbOpen);
    // Страница целиком не должна прокручиваться — только внутренние списки
    if (!kbOpen && (window.scrollY || document.documentElement.scrollTop)) window.scrollTo(0, 0);
  };
  const sync = () => {
    if (!raf) raf = requestAnimationFrame(apply);
  };

  vv.addEventListener("resize", sync);
  vv.addEventListener("scroll", sync);
  window.addEventListener("orientationchange", () => {
    full = 0;
    setTimeout(() => {
      if (standalone) full = screenH();
      sync();
    }, 350);
  });
  apply();
}

/** Не даём кнопке забрать фокус у поля — клавиатура остаётся открытой, как в Telegram */
export const keepFocus = { onPointerDown: (e: { preventDefault: () => void }) => e.preventDefault() };
