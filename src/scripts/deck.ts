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
  const laserBtn = $<HTMLButtonElement>('laser');
  const laserCanvas = $<HTMLCanvasElement>('laserCanvas');
  const total = slides.length;
  let current = 0;
  let lastFocus: HTMLElement | null = null;

  // ── 2026 Laser Pointer & Spotlight Engine (Figma Slides / Pitch / Screen Studio style) ──
  const ctx = laserCanvas?.getContext('2d') ?? null;
  const laserIndicator = document.getElementById('laserIndicator');
  let laserToggled = false;
  let laserHeld = false;
  let isMouseDown = false;
  let holdTimer: number | null = null;
  let pointerX = -100;
  let pointerY = -100;
  let smoothX = -100;
  let smoothY = -100;
  let pointerVisible = false;
  let rafId: number | null = null;
  let spotlightFade = 0; // 0..1 smooth fade for spotlight mode

  interface LaserTheme {
    id: 'rose-violet' | 'cyber-cyan' | 'spotlight';
    label: string;
    headColor: string;
    midColor: string;
    tailColor: string;
    glowColor: string;
    ringContrast: string;
  }

  const LASER_THEMES: LaserTheme[] = [
    {
      id: 'rose-violet',
      label: 'Neon Rose (Figma Slides)',
      headColor: '#ff2456',
      midColor: '#ec4899',
      tailColor: 'rgba(139, 92, 246, 0)',
      glowColor: 'rgba(255, 36, 86, 0.75)',
      ringContrast: 'rgba(255, 255, 255, 0.95)',
    },
    {
      id: 'cyber-cyan',
      label: 'Electric Cyan (Raycast / Linear)',
      headColor: '#00d2ff',
      midColor: '#6366f1',
      tailColor: 'rgba(124, 58, 237, 0)',
      glowColor: 'rgba(0, 210, 255, 0.75)',
      ringContrast: 'rgba(15, 23, 42, 0.85)',
    },
    {
      id: 'spotlight',
      label: 'Spotlight Pro (Прожектор)',
      headColor: '#ff2456',
      midColor: '#a855f7',
      tailColor: 'rgba(168, 85, 247, 0)',
      glowColor: 'rgba(255, 36, 86, 0.65)',
      ringContrast: 'rgba(255, 255, 255, 0.95)',
    },
  ];
  let themeIndex = 0;

  interface TrailPoint {
    x: number;
    y: number;
    t: number;
  }
  interface PulseRipple {
    x: number;
    y: number;
    t: number;
  }
  const trail: TrailPoint[] = [];
  const ripples: PulseRipple[] = [];
  const TRAIL_MAX_AGE = 210; // ms — snappy, zero lag
  const RIPPLE_MAX_AGE = 440; // ms

  function resizeLaserCanvas() {
    if (!laserCanvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    laserCanvas.width = Math.round(w * dpr);
    laserCanvas.height = Math.round(h * dpr);
    laserCanvas.style.width = `${w}px`;
    laserCanvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function isLaserActive() {
    return laserToggled || laserHeld;
  }

  function syncLaserIndicator() {
    const theme = LASER_THEMES[themeIndex];
    if (laserIndicator) {
      laserIndicator.style.backgroundColor = theme.headColor;
      laserIndicator.style.boxShadow = `0 0 8px ${theme.headColor}`;
    }
    if (laserBtn) {
      laserBtn.title = `Лазерна указка: ${theme.label} (L — увімк/вимк, Shift+L — змінити стиль)`;
    }
  }

  function syncLaserState() {
    const active = isLaserActive();
    document.body.classList.toggle('laser-active', active);
    if (laserBtn) {
      laserBtn.setAttribute('aria-pressed', String(active));
    }
    syncLaserIndicator();
    if (laserCanvas) {
      if (active) {
        laserCanvas.hidden = false;
        resizeLaserCanvas();
        startLaserLoop();
      } else if (trail.length === 0 && ripples.length === 0 && spotlightFade <= 0.01) {
        laserCanvas.hidden = true;
      }
    }
  }

  function toggleLaser(force?: boolean) {
    laserToggled = force !== undefined ? force : !laserToggled;
    if (!laserToggled) {
      laserHeld = false;
    }
    syncLaserState();
  }

  function cycleLaserTheme() {
    themeIndex = (themeIndex + 1) % LASER_THEMES.length;
    if (!isLaserActive()) {
      toggleLaser(true);
    } else {
      syncLaserState();
      if (pointerVisible && pointerX >= 0) {
        addRipple(pointerX, pointerY);
      }
      startLaserLoop();
    }
  }

  function addRipple(x: number, y: number) {
    ripples.push({ x, y, t: performance.now() });
    startLaserLoop();
  }

  // Draws a single continuous closed polygon ribbon (zero overlapping joints, pure luminous color)
  function drawTaperedRibbon(
    pts: TrailPoint[],
    now: number,
    maxRadius: number,
    theme: LaserTheme,
    isInnerCore = false
  ) {
    if (!ctx || pts.length < 2) return;

    const leftPts: { x: number; y: number }[] = [];
    const rightPts: { x: number; y: number }[] = [];
    const n = pts.length;

    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const prevP = pts[Math.max(0, i - 1)];
      const nextP = pts[Math.min(n - 1, i + 1)];

      let dx = nextP.x - prevP.x;
      let dy = nextP.y - prevP.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;

      // Perpendicular normal
      const nx = -dy;
      const ny = dx;

      const age = now - p.t;
      const life = Math.max(0, 1 - age / TRAIL_MAX_AGE);
      const indexFactor = i / (n - 1);
      // Smooth cubic-like taper to 0 at the tail
      const radius = maxRadius * Math.pow(life * indexFactor, isInnerCore ? 1.8 : 1.35);

      leftPts.push({ x: p.x + nx * radius, y: p.y + ny * radius });
      rightPts.push({ x: p.x - nx * radius, y: p.y - ny * radius });
    }

    const tail = pts[0];
    const head = pts[n - 1];

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);

    // Smooth curve along left edge
    for (let i = 0; i < n - 1; i++) {
      const mx = (leftPts[i].x + leftPts[i + 1].x) * 0.5;
      const my = (leftPts[i].y + leftPts[i + 1].y) * 0.5;
      ctx.quadraticCurveTo(leftPts[i].x, leftPts[i].y, mx, my);
    }
    ctx.lineTo(leftPts[n - 1].x, leftPts[n - 1].y);

    // Round cap at head
    ctx.lineTo(rightPts[n - 1].x, rightPts[n - 1].y);

    // Smooth curve back along right edge
    for (let i = n - 1; i > 0; i--) {
      const mx = (rightPts[i].x + rightPts[i - 1].x) * 0.5;
      const my = (rightPts[i].y + rightPts[i - 1].y) * 0.5;
      ctx.quadraticCurveTo(rightPts[i].x, rightPts[i].y, mx, my);
    }
    ctx.lineTo(tail.x, tail.y);
    ctx.closePath();

    if (isInnerCore) {
      const coreGrad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      coreGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.35)');
      coreGrad.addColorStop(1, 'rgba(255, 255, 255, 0.95)');
      ctx.fillStyle = coreGrad;
    } else {
      const grad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      grad.addColorStop(0, theme.tailColor);
      grad.addColorStop(0.45, theme.midColor);
      grad.addColorStop(1, theme.headColor);
      ctx.fillStyle = grad;
      ctx.shadowColor = theme.glowColor;
      ctx.shadowBlur = 14;
    }

    ctx.fill();
    ctx.restore();
  }

  function renderLaserFrame(now: number) {
    if (!ctx || !laserCanvas) {
      rafId = null;
      return;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    const active = isLaserActive();
    const theme = LASER_THEMES[themeIndex];

    // Smoothly interpolate pointer for silky curves
    if (pointerX >= 0 && pointerY >= 0) {
      if (smoothX < 0) {
        smoothX = pointerX;
        smoothY = pointerY;
      } else {
        smoothX += (pointerX - smoothX) * 0.55;
        smoothY += (pointerY - smoothY) * 0.55;
      }
    }

    // Keep feeding head point while moving so ribbon stays connected to cursor
    if (active && pointerVisible && smoothX >= 0) {
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(smoothX - last.x, smoothY - last.y) > 1.2) {
        trail.push({ x: smoothX, y: smoothY, t: now });
      }
    }

    // Prune expired points and ripples
    while (trail.length > 0 && now - trail[0].t > TRAIL_MAX_AGE) {
      trail.shift();
    }
    while (ripples.length > 0 && now - ripples[0].t > RIPPLE_MAX_AGE) {
      ripples.shift();
    }

    // 0. Optional Spotlight Mode backdrop
    const wantSpotlight = active && theme.id === 'spotlight' && pointerVisible && smoothX >= 0;
    spotlightFade += ((wantSpotlight ? 1 : 0) - spotlightFade) * 0.22;
    if (spotlightFade > 0.01 && smoothX >= 0) {
      const spotRadius = (isMouseDown ? 175 : 130) * (0.9 + 0.1 * spotlightFade);
      ctx.save();
      const spotGrad = ctx.createRadialGradient(
        smoothX,
        smoothY,
        spotRadius * 0.72,
        smoothX,
        smoothY,
        spotRadius * 1.45
      );
      spotGrad.addColorStop(0, 'rgba(15, 23, 42, 0)');
      spotGrad.addColorStop(0.55, `rgba(15, 23, 42, ${0.18 * spotlightFade})`);
      spotGrad.addColorStop(1, `rgba(15, 23, 42, ${0.58 * spotlightFade})`);
      ctx.fillStyle = spotGrad;
      ctx.fillRect(0, 0, w, h);

      // Crisp glassmorphic lens ring around spotlight
      ctx.beginPath();
      ctx.arc(smoothX, smoothY, spotRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.45 * spotlightFade})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // 1. Draw single-polygon tapered ribbon trail (zero overlap, vibrant neon gradient)
    const boost = isMouseDown ? 1.3 : 1;
    if (trail.length > 1) {
      const renderPts =
        active && pointerVisible && pointerX >= 0
          ? [...trail, { x: pointerX, y: pointerY, t: now }]
          : trail;
      drawTaperedRibbon(renderPts, now, 5.2 * boost, theme, false);
      drawTaperedRibbon(renderPts, now, 2.1 * boost, theme, true);
    }

    // 2. Draw click/hold ripples
    for (const r of ripples) {
      const progress = Math.min(1, (now - r.t) / RIPPLE_MAX_AGE);
      const ease = 1 - Math.pow(1 - progress, 3);
      const radius = 8 + ease * 36;
      const alpha = (1 - progress) * 0.85;

      ctx.save();
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = theme.headColor;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = theme.glowColor;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2.2 * (1 - progress) + 0.8;
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw crisp 2026 laser head at exact hardware cursor (pointerX, pointerY)
    if (active && pointerVisible && pointerX >= 0 && pointerY >= 0) {
      ctx.save();

      // Soft pure radial bloom (single hue — never muddy!)
      const haloRadius = 22 * boost;
      const halo = ctx.createRadialGradient(pointerX, pointerY, 1, pointerX, pointerY, haloRadius);
      halo.addColorStop(0, theme.glowColor);
      halo.addColorStop(0.5, theme.midColor + '33');
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(pointerX, pointerY, haloRadius, 0, Math.PI * 2);
      ctx.fill();

      // High-contrast outer ring with drop-shadow so it pops on white & dark backgrounds alike
      ctx.shadowColor = theme.glowColor;
      ctx.shadowBlur = 12 * boost;
      ctx.beginPath();
      ctx.arc(pointerX, pointerY, 6.2 * boost, 0, Math.PI * 2);
      ctx.fillStyle = theme.headColor;
      ctx.fill();

      // Crisp inner ring
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(pointerX, pointerY, 6.2 * boost, 0, Math.PI * 2);
      ctx.strokeStyle = theme.ringContrast;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // White-hot laser core
      ctx.beginPath();
      ctx.arc(pointerX, pointerY, 2.6 * boost, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.restore();
    }

    if (active || trail.length > 0 || ripples.length > 0 || spotlightFade > 0.01) {
      rafId = requestAnimationFrame(renderLaserFrame);
    } else {
      rafId = null;
      if (laserCanvas) laserCanvas.hidden = true;
    }
  }

  function startLaserLoop() {
    if (rafId === null) {
      rafId = requestAnimationFrame(renderLaserFrame);
    }
  }

  window.addEventListener('resize', resizeLaserCanvas);
  if (laserBtn) {
    laserBtn.onclick = (e) => {
      if (e.shiftKey) {
        cycleLaserTheme();
      } else {
        toggleLaser();
      }
      laserBtn.blur();
    };
    laserBtn.oncontextmenu = (e) => {
      e.preventDefault();
      cycleLaserTheme();
      laserBtn.blur();
    };
  }
  syncLaserIndicator();

  document.addEventListener('pointermove', (e) => {
    pointerX = e.clientX;
    pointerY = e.clientY;
    if (smoothX < 0) {
      smoothX = pointerX;
      smoothY = pointerY;
    }
    pointerVisible = true;
    if (isLaserActive()) {
      const now = performance.now();
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(pointerX - last.x, pointerY - last.y) > 2) {
        trail.push({ x: pointerX, y: pointerY, t: now });
      }
      startLaserLoop();
    }
  }, { passive: true });

  document.addEventListener('pointerleave', () => {
    pointerVisible = false;
  });

  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    isMouseDown = true;
    pointerX = e.clientX;
    pointerY = e.clientY;
    pointerVisible = true;

    const target = e.target instanceof Element ? e.target : null;
    const isInteractive = Boolean(target?.closest('button,a,input,textarea,select,[contenteditable],header,footer,#overview'));

    if (isLaserActive()) {
      addRipple(pointerX, pointerY);
      return;
    }

    // Hold left mouse button on slide area to temporarily activate laser
    if (!isInteractive && overview.hidden) {
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = window.setTimeout(() => {
        if (isMouseDown && !laserToggled) {
          laserHeld = true;
          syncLaserState();
          trail.push({ x: pointerX, y: pointerY, t: performance.now() });
          addRipple(pointerX, pointerY);
        }
      }, 160);
    }
  });

  window.addEventListener('pointerup', () => {
    isMouseDown = false;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (laserHeld) {
      laserHeld = false;
      syncLaserState();
    }
  });

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
    s.scrollTop = 0;
    const copy = s.querySelector<HTMLElement>('.slide-copy');
    if (copy) copy.scrollTop = 0;
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
    const currentItem = overview.querySelector<HTMLElement>('.slide-item[aria-current="true"]');
    if (currentItem) {
      currentItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
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
  prev.onclick = () => {
    go(current - 1);
    prev.blur();
  };
  next.onclick = () => {
    go(current + 1);
    next.blur();
  };
  fullscreen.onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
    fullscreen.blur();
  };

  window.addEventListener('hashchange', render);

  // ── Mouse wheel navigation (respects inner scrollable containers) ──
  let wheelCooldown = false;
  document.addEventListener('wheel', (e) => {
    if (!overview.hidden) return;
    if (wheelCooldown) return;

    const s = slides[current];
    const copy = s?.querySelector<HTMLElement>('.slide-copy');
    for (const box of [copy, s]) {
      if (box && box.scrollHeight > box.clientHeight + 4) {
        if (e.deltaY > 0 && box.scrollTop + box.clientHeight < box.scrollHeight - 4) return;
        if (e.deltaY < 0 && box.scrollTop > 4) return;
      }
    }

    const delta = e.deltaY + e.deltaX;
    if (Math.abs(delta) < 25) return;

    e.preventDefault();
    wheelCooldown = true;
    setTimeout(() => { wheelCooldown = false; }, 550);

    if (delta > 0) go(current + 1);
    else           go(current - 1);
  }, { passive: false });

  // ── Touch swipe navigation for mobile ──
  let touchStartX = 0;
  let touchStartY = 0;
  document.addEventListener('touchstart', (e) => {
    if (!overview.hidden || e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!overview.hidden || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      if (dx < 0) go(current + 1);
      else        go(current - 1);
    }
  }, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overview.hidden) return closeOverview();
    if (e.key === 'Escape' && laserToggled) {
      toggleLaser(false);
      return;
    }
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
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input,textarea,select,[contenteditable]')) return;
    if (e.key === ' ' && target?.closest('button,a')) return;
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
    } else if (e.code === 'KeyL' || e.key.toLowerCase() === 'l') {
      e.preventDefault();
      if (e.shiftKey) {
        cycleLaserTheme();
      } else {
        toggleLaser();
      }
    } else if (e.key === 'Alt' && !laserToggled && !laserHeld) {
      laserHeld = true;
      syncLaserState();
    } else if (e.code === 'KeyF' || e.key.toLowerCase() === 'f') {
      fullscreen.click();
    } else if (e.code === 'KeyO' || e.code === 'KeyM' || e.key.toLowerCase() === 'o' || e.key.toLowerCase() === 'm') {
      e.preventDefault();
      openOverview();
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === 'Alt' && laserHeld) {
      laserHeld = false;
      syncLaserState();
    }
  });

  render();
}
