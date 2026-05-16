/* DŌJŌ JAPAN — GA4 conversion tracking
   ─────────────────────────────────────
   Conversion-worthy events (mark as コンバージョン in GA4 admin):
     - phone_click          : 電話番号タップ（日本語ユーザーの主 CV）
     - instagram_click      : Instagram DM 遷移
     - chatbot_complete     : チャットボット最終ステップ（Instagram DM 開く）
     - cta_trial_click      : 無料体験 CTA クリック
     - terms_pdf_open       : 利用規約 PDF or page open
   Engagement events:
     - chatbot_open / chatbot_language / chatbot_intent / chatbot_copy
     - pricing_view, gym_view (page-level — handled by GA4 page_view)
*/
(() => {
  'use strict';
  if (typeof window === 'undefined') return;

  const send = (name, params) => {
    if (typeof window.gtag !== 'function') return;
    try { window.gtag('event', name, params || {}); } catch (e) {}
  };

  const cleanText = (t) => (t || '').replace(/\s+/g, ' ').trim().slice(0, 80);

  // ---- 1. Phone tap (CV)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="tel:"]');
    if (!a) return;
    send('phone_click', {
      event_category: 'contact',
      event_label: a.getAttribute('href').replace('tel:', ''),
      link_text: cleanText(a.textContent),
      page_path: location.pathname,
    });
  }, { capture: true });

  // ---- 2. Instagram DM click (CV) + route page CTAs through the chatbot
  // Tracking always fires; for page CTAs we cancel navigation and open the
  // chatbot so the user lands in DM with a structured message instead of an
  // empty thread. The bot's own "Open Instagram DM" link (inside .chatbot)
  // is left alone — that step is the actual hand-off.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href*="instagram.com/dojo_japan"]');
    if (!a) return;
    const inChatbot = !!a.closest('.chatbot');
    send('instagram_click', {
      event_category: 'contact',
      event_label: inChatbot ? 'chatbot_dm' : 'page_dm',
      page_path: location.pathname,
      link_text: cleanText(a.textContent),
    });
    if (inChatbot) return;
    const txt = a.textContent || '';
    const isCTA = a.classList.contains('btn') || /\bDM\b/i.test(txt);
    if (!isCTA) return;                       // SNS profile links (e.g. "Instagram @dojo_japan") stay direct
    e.preventDefault();
    const toggle = document.getElementById('chatbotToggle');
    if (toggle) toggle.click();               // triggers lazy-load + open
  }, { capture: true });

  // ---- 3. Free trial CTA click (CV)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    const txt = cleanText(a.textContent);
    const isTrial = href.endsWith('#trial') || href === '#trial' ||
                    /無料体験|FREE TRIAL/i.test(txt) ||
                    a.classList.contains('floating-cta') ||
                    a.classList.contains('gnav__cta');
    if (!isTrial) return;
    send('cta_trial_click', {
      event_category: 'cta',
      event_label: 'free_trial',
      page_path: location.pathname,
      link_text: txt,
    });
  }, { capture: true });

  // ---- 4. Pricing & Trainer page nav clicks (engagement)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (/pricing\.html/.test(href)) {
      send('pricing_nav_click', { event_category: 'navigation', page_path: location.pathname });
    } else if (/trainer\/[a-z]+\.html/i.test(href) || /trainers\.html/.test(href)) {
      send('trainer_nav_click', { event_category: 'navigation', target: href });
    } else if (/gym\.html/.test(href)) {
      send('gym_nav_click', { event_category: 'navigation' });
    } else if (/access\.html/.test(href)) {
      send('access_nav_click', { event_category: 'navigation' });
    } else if (/terms\.html/.test(href)) {
      send('terms_open', { event_category: 'legal' });
    }
  }, { capture: true });

  // ---- 5. Chatbot lifecycle events (dispatched from chatbot.js)
  window.addEventListener('chatbot:open', () => {
    send('chatbot_open', { event_category: 'chatbot', page_path: location.pathname });
  });
  window.addEventListener('chatbot:language', (e) => {
    send('chatbot_language', { event_category: 'chatbot', language: e.detail });
  });
  window.addEventListener('chatbot:intent', (e) => {
    send('chatbot_intent', { event_category: 'chatbot', intent: e.detail });
  });
  window.addEventListener('chatbot:resident', (e) => {
    send('chatbot_resident', { event_category: 'chatbot', resident: e.detail });
  });
  window.addEventListener('chatbot:frequency', (e) => {
    send('chatbot_frequency', { event_category: 'chatbot', frequency: e.detail });
  });
  window.addEventListener('chatbot:copy', (e) => {
    send('chatbot_copy', {
      event_category: 'chatbot',
      intent: e.detail?.intent,
      plan: e.detail?.plan,
      people: e.detail?.people,
      language: e.detail?.lang,
    });
  });
  // ★ Conversion: user reaches the IG DM step (chatbot fully completed)
  window.addEventListener('chatbot:complete', (e) => {
    send('chatbot_complete', {
      event_category: 'conversion',
      intent: e.detail?.intent,
      plan: e.detail?.plan,
      language: e.detail?.lang,
      people: e.detail?.people,
    });
  });

  // ---- 6. Outbound link tracking (for SNS/social check)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[target="_blank"]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    // Skip already-tracked
    if (/instagram\.com\/dojo_japan/.test(href)) return;
    if (/^tel:/.test(href)) return;
    send('outbound_click', {
      event_category: 'outbound',
      link_url: href,
      link_text: cleanText(a.textContent),
    });
  }, { capture: true });

  // ---- 7. Scroll depth (engagement signal — fired once per page)
  let scrollHits = { 25: false, 50: false, 75: false, 100: false };
  let scrollTimer = null;
  window.addEventListener('scroll', () => {
    if (scrollTimer) return;
    scrollTimer = setTimeout(() => {
      scrollTimer = null;
      const dh = document.documentElement;
      const wh = window.innerHeight;
      const sh = dh.scrollHeight - wh;
      if (sh <= 0) return;
      const pct = Math.min(100, Math.round((window.scrollY / sh) * 100));
      [25, 50, 75, 100].forEach(t => {
        if (!scrollHits[t] && pct >= t) {
          scrollHits[t] = true;
          send('scroll_depth', { event_category: 'engagement', percent: t });
        }
      });
    }, 200);
  }, { passive: true });
})();
