const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const pad = (n: number) => String(n).padStart(2, '0');

export function initDeck(): void {
  const slides = [...document.querySelectorAll<HTMLElement>('#slide > .slide')];
  const items = [...document.querySelectorAll<HTMLAnchorElement>('#slideList .slide-item')];
  const overview = $('overview');
  const overviewButton = $<HTMLButtonElement>('overviewButton');
  const prev = $<HTMLButtonElement>('prev');
  const next = $<HTMLButtonElement>('next');
  const fullscreen = $<HTMLButtonElement>('fullscreen');
  const total = slides.length;
  let current = 0;
  let lastFocus: HTMLElement | null = null;

  const getIndex = () => {
    const m = location.hash.match(/^#\/slide\/(\d+)$/);
    return Math.max(0, Math.min(total - 1, m ? Number(m[1]) - 1 : 0));
  };

  function render() {
    current = getIndex();
    const s = slides[current];
    slides.forEach((el, i) => (el.hidden = i !== current));
    items.forEach((el, i) => (i === current ? el.setAttribute('aria-current', 'true') : el.removeAttribute('aria-current')));
    $('counter').textContent = `${pad(current + 1)} / ${total}`;
    $('sectionLabel').textContent = (s.dataset.section ?? '').toUpperCase();
    $('progressBar').style.width = `${((current + 1) / total) * 100}%`;
    prev.disabled = current === 0;
    next.disabled = current === total - 1;
    document.title = `${s.dataset.title} — APPS.UCU`;
    window.scrollTo(0, 0);
  }

  function go(i: number) {
    if (i < 0 || i >= total) return;
    location.hash = `/slide/${i + 1}`;
  }

  function openOverview() {
    lastFocus = document.activeElement as HTMLElement | null;
    overview.hidden = false;
    overviewButton.setAttribute('aria-expanded', 'true');
    $('closeOverview').focus();
  }

  function closeOverview() {
    overview.hidden = true;
    overviewButton.setAttribute('aria-expanded', 'false');
    lastFocus?.focus();
  }

  overviewButton.onclick = openOverview;
  $('closeOverview').onclick = closeOverview;
  overview.onclick = (e) => {
    const t = e.target as HTMLElement;
    if (t === overview || t.closest('.slide-item')) closeOverview();
  };
  prev.onclick = () => go(current - 1);
  next.onclick = () => go(current + 1);
  fullscreen.onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  window.addEventListener('hashchange', render);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overview.hidden) return closeOverview();
    if (!overview.hidden) {
      if (e.key === 'Tab') {
        const f = [...overview.querySelectorAll<HTMLElement>('button,a')];
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
          e.preventDefault();
          f[0].focus();
        }
      }
      return;
    }
    if ((e.target as HTMLElement).closest('button,a,input,textarea,select,[contenteditable]')) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
      e.preventDefault();
      go(current + 1);
    } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      go(current - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      go(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      go(total - 1);
    } else if (e.key.toLowerCase() === 'f') fullscreen.click();
  });

  let wheelLock = 0;
  document.addEventListener(
    'wheel',
    (e) => {
      if (!overview.hidden || Math.abs(e.deltaY) < 10) return;
      const now = Date.now();
      if (now - wheelLock < 600) return;
      wheelLock = now;
      go(current + (e.deltaY > 0 ? 1 : -1));
    },
    { passive: true },
  );

  render();
}
