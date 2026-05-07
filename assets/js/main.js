/* DOJO JAPAN — TOP page interactions */
(() => {
  'use strict';

  /* ---------- Preloader (TOP only) ----------
     Time-driven: animate 0% → 100% over 1500ms regardless of asset load,
     then fade out. Asset loading does NOT block this (was a deadlock
     when below-the-fold lazy images couldn't trigger). */
  const preloader = document.getElementById('preloader');
  if (preloader) {
    const fill = document.getElementById('preloaderFill');
    const pctEl = document.getElementById('preloaderPct');
    document.body.style.overflow = 'hidden';

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      preloader.classList.add('is-done');
      document.body.style.overflow = '';
    };

    // Animate 0 → 100 % over exactly 600 ms, then fade
    const start = performance.now();
    const duration = 600;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const pct = Math.round(t * 100);
      if (fill) fill.style.width = pct + '%';
      if (pctEl) pctEl.textContent = pct + '%';
      preloader.setAttribute('aria-valuenow', String(pct));
      if (t < 1) requestAnimationFrame(tick);
      else finish();
    };
    requestAnimationFrame(tick);

    // Failsafe (e.g. if rAF is paused on a hidden tab)
    setTimeout(finish, 900);
  }

  /* ---------- Header scroll state ---------- */
  const header = document.getElementById('siteHeader');
  const onScroll = () => {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 24);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Hamburger ---------- */
  const hamb = document.getElementById('hamburger');
  const gnav = document.getElementById('gnav');
  if (hamb && gnav) {
    hamb.addEventListener('click', () => {
      const open = gnav.classList.toggle('is-open');
      hamb.classList.toggle('is-open', open);
      hamb.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    });
    gnav.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        gnav.classList.remove('is-open');
        hamb.classList.remove('is-open');
        hamb.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
  }

  /* ---------- Movie: thumbnail switching + play ---------- */
  const player = document.getElementById('moviePlayer');
  if (player) {
    const video = player.querySelector('video');
    const playBtn = player.querySelector('.movie__play');
    const thumbs = document.querySelectorAll('.movie__thumb');

    const startPlayback = () => {
      player.classList.add('is-playing');
      video.controls = true;
      try { video.play(); } catch (_) {}
    };
    if (playBtn) {
      playBtn.addEventListener('click', startPlayback);
    }
    video.addEventListener('play', () => player.classList.add('is-playing'));
    video.addEventListener('pause', () => {
      // keep controls visible after pause for easy resume
    });

    const swap = (src, poster) => {
      if (!src) return;
      // Pause and reload with new source
      try { video.pause(); } catch (_) {}
      const source = video.querySelector('source');
      if (source) source.src = src;
      video.poster = poster || video.poster;
      video.load();
      // Reveal play button overlay again on swap
      player.classList.remove('is-playing');
      video.controls = false;
    };

    thumbs.forEach(t => {
      const click = () => {
        thumbs.forEach(x => x.classList.remove('is-active'));
        t.classList.add('is-active');
        swap(t.dataset.src, t.dataset.poster);
      };
      t.addEventListener('click', click);
      t.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); click(); }
      });
    });
  }

  /* ---------- GYM cells: highlight on scroll-in (SP visual cue) -------- */
  const gymCells = document.querySelectorAll('.gym__cell');
  if (gymCells.length) {
    const gio = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        en.target.classList.toggle('is-in-view', en.isIntersecting);
      });
    }, { threshold: 0.55 });
    gymCells.forEach(c => gio.observe(c));
  }

  /* ---------- Reveal on scroll ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.05, rootMargin: '0px 0px -10% 0px' });
  const revealEls = document.querySelectorAll('.section-head, .trainer__select, .trainer__more-wrap, .movie__title, .movie__stage, .movie__thumbs, .movie__more-wrap, .gym-slider__viewport, .gym__grid, .lesson__list, .system__grid, .trial__inner, .access__grid');
  revealEls.forEach(el => {
    el.classList.add('reveal');
    io.observe(el);
    // Immediate check: if element is already inside the viewport at page load,
    // mark it visible right away. iOS Safari sometimes delays IO for elements
    // that are above-the-fold on initial render.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.classList.add('is-in');
      io.unobserve(el);
    }
  });
  // Defensive failsafe: after 2.5 s force-show any reveal that did not trigger.
  // Guards against IO edge-cases on iOS Safari / WebView.
  setTimeout(() => {
    document.querySelectorAll('.reveal:not(.is-in)').forEach(el => el.classList.add('is-in'));
  }, 2500);

  /* ---------- Hero video: lazy load after first paint ----------
     The <video> ships without <source> (data-src holds the URL).
     We inject the source AFTER window.load so the 8 MB MP4 never
     competes with the LCP. Poster image is shown in the meantime. */
  const heroVid = document.querySelector('.hero__video');
  if (heroVid) {
    // iOS Safari requires explicit muted + playsinline before play()
    heroVid.muted = true;
    heroVid.defaultMuted = true;
    heroVid.setAttribute('muted', '');
    heroVid.setAttribute('playsinline', '');
    heroVid.setAttribute('webkit-playsinline', '');

    const tryPlay = () => heroVid.play().catch(() => {});

    const activateHeroVideo = () => {
      const src = heroVid.dataset.src;
      if (!src || heroVid.querySelector('source')) return;
      const source = document.createElement('source');
      source.src = src;
      source.type = 'video/mp4';
      heroVid.appendChild(source);
      heroVid.preload = 'auto';
      heroVid.load();
    };

    // Pull the MP4 only after the page is fully idle.
    // Use requestIdleCallback when available (1.2s deadline), fallback to a
    // 1500ms post-load timeout. First user interaction also triggers loading.
    let activated = false;
    const activateOnce = () => {
      if (activated) return;
      activated = true;
      activateHeroVideo();
    };
    const scheduleActivate = () => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(activateOnce, { timeout: 2000 });
      } else {
        setTimeout(activateOnce, 1500);
      }
    };
    if (document.readyState === 'complete') {
      scheduleActivate();
    } else {
      window.addEventListener('load', scheduleActivate, { once: true });
    }
    // Also activate on first user interaction (covers slow-network cases)
    ['touchstart','click','scroll'].forEach(ev =>
      document.addEventListener(ev, activateOnce, { once: true, passive: true })
    );

    heroVid.addEventListener('loadedmetadata', tryPlay, { once: true });
    heroVid.addEventListener('canplay', tryPlay, { once: true });

    // iOS sometimes blocks until first user gesture — recover on any tap/scroll
    const userKick = () => {
      tryPlay();
      ['touchstart','click','scroll'].forEach(ev => document.removeEventListener(ev, userKick));
    };
    ['touchstart','click','scroll'].forEach(ev =>
      document.addEventListener(ev, userKick, { once: true, passive: true })
    );

    // Pause when off-screen, resume when back
    const heroIo = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) tryPlay();
        else heroVid.pause();
      });
    }, { threshold: 0.1 });
    heroIo.observe(heroVid);

    // If the tab becomes active again, kick playback
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tryPlay();
    });
  }

  /* ---------- Trainer slider — continuous marquee ----------
     Cards drift infinitely from right to left at constant speed (CSS
     animation). Tap on a card still navigates because the card is a
     real <a>. Pause on touch/hover; pause when off-screen. */
  const trainerViewport = document.querySelector('.trainer__viewport');
  const trainerList     = document.querySelector('.trainer__select');

  if (trainerViewport && trainerList) {
    // Hide arrow nav — not needed for continuous marquee
    document.querySelectorAll('.trainer__arrow').forEach(a => { a.style.display = 'none'; });

    // Clone the original cards once: layout becomes [originals][clones]
    // so translate from 0 → -50% loops seamlessly.
    const originals = [...trainerList.children];
    originals.forEach(card => {
      const clone = card.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.querySelectorAll('a').forEach(a => a.setAttribute('tabindex', '-1'));
      trainerList.appendChild(clone);
    });

    // Mark the slider as marquee-mode so CSS keyframes apply.
    trainerList.classList.add('is-marquee');

    // Pause on hover (desktop)
    trainerViewport.addEventListener('mouseenter', () => trainerList.classList.add('is-paused'));
    trainerViewport.addEventListener('mouseleave', () => trainerList.classList.remove('is-paused'));

    // Pause on touch (mobile) — resume after a moment so it doesn't freeze
    let touchT = null;
    trainerList.addEventListener('touchstart', () => {
      trainerList.classList.add('is-paused');
      clearTimeout(touchT);
    }, { passive: true });
    trainerList.addEventListener('touchend', () => {
      clearTimeout(touchT);
      touchT = setTimeout(() => trainerList.classList.remove('is-paused'), 1500);
    }, { passive: true });

    // Pause when section is off-screen (battery saver)
    const tio = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) trainerList.classList.remove('is-offscreen');
        else trainerList.classList.add('is-offscreen');
      });
    }, { threshold: 0.05 });
    tio.observe(trainerViewport);

    // Respect reduced-motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      trainerList.classList.add('is-paused');
    }
  }
})();
