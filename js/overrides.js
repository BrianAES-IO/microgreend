/* ══════════════════════════════════════════════════════
   Micro-Greens Farm Ja — Site Overrides
   js/overrides.js  (include on every page AFTER main.js)
   Reads admin settings from localStorage and applies them:
   • Image overrides (logo, heroes, products, sections)
   • Discount-code awareness
   • Affiliate tracking
══════════════════════════════════════════════════════ */

(function MGFJ_Overrides() {
  'use strict';

  /* ── helpers ─────────────────────────────────────── */
  function ls(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  }

  function setImg(el, src) {
    if (!el || !src) return;
    el.src = src;
    el.onerror = null; // prevent infinite onerror loop
  }

  const imgs = ls('mgfj_images', {});
  const page = location.pathname.split('/').pop() || 'index.html';

  /* ── apply image overrides ───────────────────────── */
  function applyImageOverrides() {
    /* Logo — all pages */
    if (imgs.site_logo) {
      document.querySelectorAll('img.nav-logo-img').forEach(el => setImg(el, imgs.site_logo));
      /* Also update any favicon-style marks */
      document.querySelectorAll('.topbar-logo img').forEach(el => setImg(el, imgs.site_logo));
    }

    /* Page heroes */
    const heroMap = {
      'index.html':   'index_hero',
      'order.html':   'order_hero',
      'about.html':   'about_hero',
      'learn.html':   'learn_hero',
      'contact.html': 'contact_hero',
    };
    const hid = heroMap[page];
    if (hid && imgs[hid]) {
      const heroEl = document.querySelector(
        '.page-hero-media img, .hero-media img, .hero img'
      );
      if (heroEl) setImg(heroEl, imgs[hid]);
    }

    /* Homepage-specific sections */
    if (page === 'index.html' || page === '') {
      if (imgs.index_about) {
        const el = document.querySelector(
          '.img-frame .img-rounded, .stack-img-front, .multi-img-stack img:last-child'
        );
        if (el) setImg(el, imgs.index_about);
      }
      if (imgs.index_cta) {
        const el = document.querySelector('.cta-banner-bg img');
        if (el) setImg(el, imgs.index_cta);
      }
      if (imgs.index_process) {
        const el = document.querySelector('.process-img, [data-img-slot="index_process"]');
        if (el) setImg(el, imgs.index_process);
      }
    }

    /* About page gallery */
    if (page === 'about.html') {
      const gal = document.querySelectorAll('.about-gallery img');
      if (imgs.about_gallery1 && gal[0]) setImg(gal[0], imgs.about_gallery1);
      if (imgs.about_gallery2 && gal[1]) setImg(gal[1], imgs.about_gallery2);
      if (imgs.about_gallery3 && gal[2]) setImg(gal[2], imgs.about_gallery3);
      if (imgs.about_story) {
        const el = document.querySelector('.img-frame img, .img-rounded, .about-story-img');
        if (el) setImg(el, imgs.about_story);
      }
    }

    /* Learn page */
    if (page === 'learn.html') {
      if (imgs.learn_section1) {
        const el = document.querySelector('[data-img-slot="learn_section1"], .learn-img-1');
        if (el) setImg(el, imgs.learn_section1);
      }
      if (imgs.learn_section2) {
        const el = document.querySelector('[data-img-slot="learn_section2"], .learn-img-2');
        if (el) setImg(el, imgs.learn_section2);
      }
    }

    /* Generic data-img-slot attributes */
    document.querySelectorAll('[data-img-slot]').forEach(el => {
      const slot = el.getAttribute('data-img-slot');
      if (imgs[slot]) setImg(el, imgs[slot]);
    });

    /* Product images — by data-product-id containers */
    document.querySelectorAll('[data-product-id]').forEach(container => {
      const pid = container.getAttribute('data-product-id');
      const imgEl = container.querySelector('.pco-img img, .product-img, img');
      if (imgEl && imgs['img_' + pid]) setImg(imgEl, imgs['img_' + pid]);
    });

    /* Product images — by class pattern used on order page */
    ['sunflower','radish','pea-shoots','broccoli','basil','amaranth','arugula'].forEach(pid => {
      if (!imgs['img_' + pid]) return;
      document.querySelectorAll(`.prod-img-${pid}, [data-pid="${pid}"] img`).forEach(el => {
        setImg(el, imgs['img_' + pid]);
      });
    });

    /* Variety images */
    const varMap = {
      'variety_sun':  ['sunflower'],
      'variety_rad':  ['radish'],
      'variety_pea':  ['pea-shoots','pea'],
      'variety_broc': ['broccoli'],
      'variety_bas':  ['basil'],
    };
    Object.entries(varMap).forEach(([slotId, pids]) => {
      if (!imgs[slotId]) return;
      pids.forEach(pid => {
        document.querySelectorAll(`[data-variety="${pid}"] img, .variety-img-${pid}`).forEach(el => {
          setImg(el, imgs[slotId]);
        });
      });
    });
  }

  /* Run immediately & watch for dynamic content */
  applyImageOverrides();

  if (typeof MutationObserver !== 'undefined') {
    const obs = new MutationObserver(() => applyImageOverrides());
    obs.observe(document.body, { childList: true, subtree: true });
    /* Stop watching after 8 s to avoid performance hit */
    setTimeout(() => obs.disconnect(), 8000);
  }

  /* ── Discount-code helpers (used by order.html) ──── */
  window.MGFJ_Discount = {
    validate(code) {
      if (!code) return null;
      const codes = ls('mgfj_discounts', []);
      const now   = new Date();
      const found = codes.find(c =>
        c.code.toUpperCase() === code.toUpperCase() &&
        c.active &&
        (!c.expiresAt || new Date(c.expiresAt) > now) &&
        (!c.maxUses || c.usedCount < c.maxUses)
      );
      return found || null;
    },
    apply(subtotal, deliveryFee, code) {
      const d = this.validate(code);
      if (!d) return { discount: 0, newTotal: subtotal + deliveryFee, code: null };
      let discount = 0;
      if (d.type === 'percent')    discount = Math.round(subtotal * d.value / 100);
      if (d.type === 'fixed')      discount = Math.min(d.value, subtotal);
      if (d.type === 'freedelivery') discount = deliveryFee;
      discount = Math.min(discount, subtotal + deliveryFee);
      return { discount, newTotal: subtotal + deliveryFee - discount, code: d };
    },
    recordUse(code) {
      const codes = ls('mgfj_discounts', []);
      const idx   = codes.findIndex(c => c.code.toUpperCase() === code.toUpperCase());
      if (idx >= 0) {
        codes[idx].usedCount = (codes[idx].usedCount || 0) + 1;
        codes[idx].lastUsed  = new Date().toISOString();
        localStorage.setItem('mgfj_discounts', JSON.stringify(codes));
      }
    },
  };

  /* ── Affiliate tracking ───────────────────────────── */
  (function trackAffiliate() {
    const ref = new URLSearchParams(location.search).get('ref');
    if (!ref) return;
    sessionStorage.setItem('mgfj_aff_ref', ref.toUpperCase());
    /* Record visit */
    const affs = ls('mgfj_affiliates', []);
    const idx  = affs.findIndex(a => a.code.toUpperCase() === ref.toUpperCase());
    if (idx >= 0) {
      affs[idx].visits = (affs[idx].visits || 0) + 1;
      affs[idx].lastVisit = new Date().toISOString();
      localStorage.setItem('mgfj_affiliates', JSON.stringify(affs));
    }
  })();

  window.MGFJ_Affiliate = {
    getCurrent() { return sessionStorage.getItem('mgfj_aff_ref') || null; },
    recordOrder(orderId, total) {
      const ref = this.getCurrent();
      if (!ref) return;
      const affs = ls('mgfj_affiliates', []);
      const idx  = affs.findIndex(a => a.code.toUpperCase() === ref.toUpperCase());
      if (idx < 0) return;
      const comm = Math.round(total * (affs[idx].commissionPct || 10) / 100);
      affs[idx].orders     = (affs[idx].orders || 0) + 1;
      affs[idx].totalSales = (affs[idx].totalSales || 0) + total;
      affs[idx].commissionOwed = (affs[idx].commissionOwed || 0) + comm;
      affs[idx].orderLog = affs[idx].orderLog || [];
      affs[idx].orderLog.push({ orderId, total, comm, at: new Date().toISOString() });
      localStorage.setItem('mgfj_affiliates', JSON.stringify(affs));
    },
  };

  /* Expose image overrides globally */
  window.MGFJ = window.MGFJ || {};
  window.MGFJ.imageOverrides  = imgs;
  window.MGFJ.getProductImage = pid => imgs['img_' + pid] || null;
  window.MGFJ.applyImageOverrides = applyImageOverrides;

  /* ══════════════════════════════════════════════════════
     FIREBASE LIVE SYNC (customer-facing)
     ────────────────────────────────────────────────────
     Subscribes to public_state changes from Firestore so
     admin updates (products, prices, images, discounts,
     affiliates) reach customer browsers in real time.
     Updates localStorage cache then re-renders / re-applies.
     Gracefully no-ops if firebase-sync.js isn't loaded.
     ══════════════════════════════════════════════════════ */
  function startPublicSync() {
    if (!window.MGFJ_Sync || !window.MGFJ_Sync.ready()) {
      /* Retry shortly in case Firebase is still initialising */
      setTimeout(startPublicSync, 1000);
      return;
    }

    /* Images — refresh localStorage + re-apply on the page */
    window.MGFJ_Sync.subscribeImages(function(data) {
      if (!data || typeof data !== 'object') return;
      try {
        localStorage.setItem('mgfj_images', JSON.stringify(data));
        /* Update the in-memory copy used by helpers */
        Object.keys(window.MGFJ.imageOverrides).forEach(function(k){ delete window.MGFJ.imageOverrides[k]; });
        Object.assign(window.MGFJ.imageOverrides, data);
        /* Re-apply to the page */
        applyImageOverrides();
      } catch (e) { console.warn('[MGFJ] image sync apply failed', e); }
    });

    /* Products — refresh localStorage + tell any live page to re-render */
    window.MGFJ_Sync.subscribeProducts(function(data) {
      if (!Array.isArray(data)) return;
      try {
        localStorage.setItem('mgfj_products', JSON.stringify(data));
        /* If on order page, ask it to re-render the product grid */
        if (typeof window.renderProducts === 'function')      window.renderProducts();
        if (typeof window.renderProductGrid === 'function')   window.renderProductGrid();
        if (typeof window.renderSummary === 'function')       window.renderSummary();
      } catch (e) { console.warn('[MGFJ] product sync apply failed', e); }
    });

    /* Discounts */
    window.MGFJ_Sync.subscribeDiscounts(function(data) {
      if (!Array.isArray(data)) return;
      try { localStorage.setItem('mgfj_discounts', JSON.stringify(data)); }
      catch (e) {}
    });

    /* Affiliates */
    window.MGFJ_Sync.subscribeAffiliates(function(data) {
      if (!Array.isArray(data)) return;
      try { localStorage.setItem('mgfj_affiliates', JSON.stringify(data)); }
      catch (e) {}
    });

    console.log('[MGFJ overrides] Public sync started — listening for admin changes');
  }
  /* Wait a tick for firebase-sync.js to finish initialising */
  setTimeout(startPublicSync, 300);

})();
