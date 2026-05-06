/* DOJO JAPAN — TOP page interactions */
(() => {
  'use strict';

  /* ---------- Preloader (TOP only) ---------- */
  const preloader = document.getElementById('preloader');
  if (preloader) {
    const fill = document.getElementById('preloaderFill');
    const pctEl = document.getElementById('preloaderPct');
    // Track these critical assets (in DOM order). The hero video and gym images
    // are the heaviest items, so this gives a reasonably accurate percentage.
    const targets = [
      ...document.querySelectorAll('.hero__video'),
      ...document.querySelectorAll('.brand__logo'),
      ...document.querySelectorAll('.trainer-card__photo img'),
      ...document.querySelectorAll('.gym-slider__slide img'),
      ...document.querySelectorAll('.movie__thumb img'),
    ];
    const total = Math.max(targets.length + 2, 6); // +css/+fonts symbolic
    let loaded = 0;
    const step = () => {
      loaded = Math.min(loaded + 1, total);
      const pct = Math.round((loaded / total) * 100);
      if (fill) fill.style.width = pct + '%';
      if (pctEl) pctEl.textContent = pct + '%';
      preloader.setAttribute('aria-valuenow', String(pct));
      if (loaded >= total) finish();
    };
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      // small delay so the 100% renders briefly
      setTimeout(() => {
        preloader.classList.add('is-done');
        document.body.style.overflow = '';
      }, 300);
    };
    document.body.style.overflow = 'hidden';

    targets.forEach(el => {
      const isVideo = el.tagName === 'VIDEO';
      const isImg = el.tagName === 'IMG';
      const ok = () => step();
      if (isImg) {
        if (el.complete && el.naturalWidth) ok();
        else {
          el.addEventListener('load', ok, { once: true });
          el.addEventListener('error', ok, { once: true });
        }
      } else if (isVideo) {
        // Don't wait for full canplay (would force eager video download).
        // loadedmetadata fires after only a few hundred KB are fetched —
        // good enough to mark the page as "loaded" for the preloader.
        if (el.readyState >= 1) ok();
        else {
          el.addEventListener('loadedmetadata', ok, { once: true });
          el.addEventListener('error', ok, { once: true });
        }
      } else {
        ok();
      }
    });

    // CSS / fonts symbolic ticks
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(step).catch(step);
    } else { step(); }
    window.addEventListener('load', step, { once: true });

    // Hard cap at 3 seconds — never block longer than this on the preloader.
    setTimeout(() => { while (loaded < total) step(); }, 3000);
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

  /* ---------- Hero video: iOS-safe autoplay + battery saver ---------- */
  const heroVid = document.querySelector('.hero__video');
  if (heroVid) {
    // iOS Safari requires explicit muted + playsinline before play()
    heroVid.muted = true;
    heroVid.defaultMuted = true;
    heroVid.setAttribute('muted', '');
    heroVid.setAttribute('playsinline', '');
    heroVid.setAttribute('webkit-playsinline', '');

    const tryPlay = () => heroVid.play().catch(() => {});

    // Try as soon as we can
    if (heroVid.readyState >= 2) tryPlay();
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

  /* ---------- Trainer slider ----------
     Two execution paths to avoid past mobile breakage:
       Desktop (≥769px): JS-driven cloned-card slider with transform.
       Mobile  (≤768px): native scroll-snap + JS-driven scrollTo for
                         arrow nav and auto-advance, so it coexists with
                         touch swipes instead of fighting them. */
  const trainerViewport = document.querySelector('.trainer__viewport');
  const trainerList     = document.querySelector('.trainer__select');
  const trainerPrev     = document.getElementById('trainerPrev');
  const trainerNext     = document.getElementById('trainerNext');
  const isDesktopSlider = window.matchMedia('(min-width: 769px)').matches;

  /* ----- MOBILE PATH -----
     Index-based; explicit scrollLeft calculation so the last card (card 4)
     is reached reliably even when its centered position equals maxScrollLeft.
     scrollIntoView was unreliable for the last item — switching to a direct
     scrollTo({left:N}) eliminates that edge case.
     Also: auto-mode disables the scroll-sync listener while a programmatic
     scroll is in flight, so the listener can never overwrite idx mid-animation. */
  if (trainerViewport && trainerList && !isDesktopSlider) {
    const cards = [...trainerList.children];
    const N = cards.length;
    let idx = 0;
    let isProgrammatic = false;
    let progClearT = null;

    const targetScrollFor = (i) => {
      const card = cards[i];
      if (!card) return 0;
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const max = Math.max(0, trainerList.scrollWidth - trainerList.clientWidth);
      const want = cardCenter - trainerList.clientWidth / 2;
      return Math.max(0, Math.min(max, Math.round(want)));
    };

    // Custom rAF smooth-scroll. Avoids native scrollTo({behavior:'smooth'}),
    // which on iOS Safari can scroll the PAGE vertically to "bring the
    // element into view" before doing the horizontal scroll.
    let rafId = null;
    const animateScrollLeft = (target, duration = 380) => {
      cancelAnimationFrame(rafId);
      const startLeft = trainerList.scrollLeft;
      const dist = target - startLeft;
      if (Math.abs(dist) < 1) return;
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
        trainerList.scrollLeft = startLeft + dist * ease;
        if (p < 1) rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    };

    const scrollToIdx = (i) => {
      isProgrammatic = true;
      clearTimeout(progClearT);
      animateScrollLeft(targetScrollFor(i));
      progClearT = setTimeout(() => { isProgrammatic = false; }, 500);
    };

    const goNext = () => { idx = (idx + 1) % N; scrollToIdx(idx); };
    const goPrev = () => { idx = (idx - 1 + N) % N; scrollToIdx(idx); };

    // Sync idx with manual swipes only (suppressed during programmatic scroll).
    let scrollSyncT = null;
    const syncIdxFromScroll = () => {
      if (isProgrammatic) return;
      clearTimeout(scrollSyncT);
      scrollSyncT = setTimeout(() => {
        const vw = window.innerWidth;
        const center = vw / 2;
        let best = 0, bestDist = Infinity;
        cards.forEach((card, i) => {
          const r = card.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const d = Math.abs(cx - center);
          if (d < bestDist) { bestDist = d; best = i; }
        });
        idx = best;
      }, 140);
    };
    trainerList.addEventListener('scroll', syncIdxFromScroll, { passive: true });

    const INTERVAL_MS = 1100;
    let timer = null;
    const start = () => { if (timer) return; timer = setInterval(goNext, INTERVAL_MS); };
    const stop  = () => { if (timer) { clearInterval(timer); timer = null; } };

    if (trainerPrev) trainerPrev.addEventListener('click', () => { stop(); goPrev(); setTimeout(start, INTERVAL_MS * 2); });
    if (trainerNext) trainerNext.addEventListener('click', () => { stop(); goNext(); setTimeout(start, INTERVAL_MS * 2); });

    // Pause auto while user is swiping; resume after they're done.
    let touchPauseT = null;
    const userPause = () => {
      stop();
      clearTimeout(touchPauseT);
      touchPauseT = setTimeout(start, INTERVAL_MS * 2);
    };
    trainerList.addEventListener('touchstart', userPause, { passive: true });
    trainerList.addEventListener('touchend',   userPause, { passive: true });

    // Pause when off-screen
    const tio = new IntersectionObserver((entries) => {
      entries.forEach(en => en.isIntersecting ? start() : stop());
    }, { threshold: 0.2 });
    tio.observe(trainerViewport);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) stop();
  }

  /* ----- DESKTOP PATH ----- */
  if (trainerViewport && trainerList && isDesktopSlider) {
    const originals = [...trainerList.children];
    const N = originals.length;

    // Clone cards on BOTH sides so we have a seamless loop in either direction.
    // Final layout: [front-clones (N)] [originals (N)] [back-clones (N)]
    const makeClone = (card) => {
      const c = card.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      c.querySelectorAll('a').forEach(a => a.setAttribute('tabindex', '-1'));
      return c;
    };
    originals.forEach(card => trainerList.appendChild(makeClone(card)));
    [...originals].reverse().forEach(card =>
      trainerList.insertBefore(makeClone(card), trainerList.firstChild)
    );

    // Index points into the full (3N) array.
    // The valid "centered" range is [N, 2N). When index falls outside, we
    // silently snap it back without animation so the loop is invisible.
    let index = N;
    const cardWidth = () => originals[0].getBoundingClientRect().width;

    const setPosition = (animate) => {
      if (!animate) trainerList.classList.add('is-no-transition');
      trainerList.style.transform = `translate3d(${-index * cardWidth()}px, 0, 0)`;
      if (!animate) {
        // force layout flush before re-enabling transition
        void trainerList.offsetWidth;
        trainerList.classList.remove('is-no-transition');
      }
    };
    setPosition(false);

    // Re-position on resize (card widths change with viewport)
    let resizeT;
    window.addEventListener('resize', () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => setPosition(false), 150);
    }, { passive: true });

    const next = () => { index++; setPosition(true); };
    const prev = () => { index--; setPosition(true); };

    // After a sliding transition finishes, normalize the index back into [N, 2N)
    // by jumping silently to the equivalent position in the originals.
    trainerList.addEventListener('transitionend', () => {
      if (index >= 2 * N) { index -= N; setPosition(false); }
      else if (index < N) { index += N; setPosition(false); }
    });

    // Auto-advance
    const INTERVAL_MS = 900;
    let timer = null;
    const start = () => { if (timer) return; timer = setInterval(next, INTERVAL_MS); };
    const stop  = () => { if (timer) { clearInterval(timer); timer = null; } };

    // Arrow nav — pauses auto for a moment, then resumes
    const userNudge = (dir) => {
      stop();
      dir > 0 ? next() : prev();
      setTimeout(start, INTERVAL_MS);
    };
    if (trainerPrev) trainerPrev.addEventListener('click', () => userNudge(-1));
    if (trainerNext) trainerNext.addEventListener('click', () => userNudge(+1));

    // Pause on hover (PC only effectively)
    trainerViewport.addEventListener('mouseenter', stop);
    trainerViewport.addEventListener('mouseleave', start);
    trainerViewport.addEventListener('focusin',  stop);
    trainerViewport.addEventListener('focusout', start);

    // Pause when off-screen (battery saver)
    const tio = new IntersectionObserver((entries) => {
      entries.forEach(en => en.isIntersecting ? start() : stop());
    }, { threshold: 0.2 });
    tio.observe(trainerViewport);

    // Honor reduced-motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      stop();
    }
  }
})();
