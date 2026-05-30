/* ══════════════════════════════════════════════════════
   Micro-Greens Farm Ja — Shared JS
   js/main.js
══════════════════════════════════════════════════════ */

/* ── NAV ─────────────────────────────────────────────── */
(function initNav() {
  const nav   = document.getElementById('site-nav');
  const burger= document.getElementById('burger');
  const drawer= document.getElementById('nav-drawer');
  if (!nav) return;

  // Active link
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(a => {
    const href = a.getAttribute('href').split('/').pop();
    if (href === path) a.classList.add('active');
  });

  // Sticky + background on scroll
  function onScroll() {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile burger
  if (burger && drawer) {
    burger.addEventListener('click', () => {
      const open = drawer.classList.toggle('open');
      burger.setAttribute('aria-expanded', open);
      burger.innerHTML = open
        ? '<span></span><span></span><span></span>'
        : '<span></span><span></span><span></span>';
      burger.classList.toggle('active', open);
      document.body.classList.toggle('drawer-open', open);
    });

    // Close on nav link click (mobile)
    drawer.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        drawer.classList.remove('open');
        burger.classList.remove('active');
        burger.setAttribute('aria-expanded', false);
        document.body.classList.remove('drawer-open');
      });
    });
  }
})();

/* ── SCROLL REVEAL ───────────────────────────────────── */
(function initReveal() {
  const items = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
  if (!items.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  items.forEach(el => io.observe(el));
})();

/* ── BACK TO TOP ─────────────────────────────────────── */
(function initBackToTop() {
  const btn = document.getElementById('back-top');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 500);
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
})();

/* ── HARVEST DATE HELPER ─────────────────────────────── */
function getNextHarvestInfo() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun … 6=Sat
  const daysToSat = (6 - day + 7) % 7 || 7; // always a future Saturday

  // This cycle's Saturday and its Friday noon cutoff
  const thisSaturday = new Date(now);
  thisSaturday.setDate(now.getDate() + daysToSat);
  thisSaturday.setHours(0, 0, 0, 0);

  const cutoffFriday = new Date(thisSaturday);
  cutoffFriday.setDate(thisSaturday.getDate() - 1);
  cutoffFriday.setHours(12, 0, 0, 0);

  const cutoffPassed = now > cutoffFriday;

  // If the window for THIS Saturday has closed, the next delivery is
  // the FOLLOWING Saturday (one week later).
  const deliverySaturday = cutoffPassed
    ? new Date(thisSaturday.getTime() + 7 * 24 * 60 * 60 * 1000)
    : thisSaturday;

  // Corresponding order deadline for the upcoming delivery
  const nextDeadline = new Date(deliverySaturday);
  nextDeadline.setDate(deliverySaturday.getDate() - 1);
  nextDeadline.setHours(12, 0, 0, 0);

  const fmt     = d => d.toLocaleDateString('en-JM', { weekday: 'long', month: 'long', day: 'numeric' });
  const fmtTime = d => d.toLocaleDateString('en-JM', { weekday: 'long', month: 'long', day: 'numeric' }) + ' at 12:00 noon';

  return {
    thisSaturday,
    cutoffFriday,
    deliverySaturday,          // the Saturday customers will actually receive an order for
    nextDeadline,              // the deadline for the deliverySaturday cycle
    thisSaturdayStr:     fmt(thisSaturday),
    deliverySaturdayStr: fmt(deliverySaturday),
    fridayStr:           fmtTime(cutoffFriday),
    nextDeadlineStr:     fmtTime(nextDeadline),
    cutoffPassed,
  };
}

/* ── INJECT HARVEST BANNERS ──────────────────────────── */
(function injectHarvestInfo() {
  const info = getNextHarvestInfo();

  // [data-harvest-date] always shows the date orders will actually be delivered
  document.querySelectorAll('[data-harvest-date]').forEach(el => {
    el.textContent = info.deliverySaturdayStr;
  });

  // [data-order-deadline] shows the deadline that applies to the upcoming delivery
  document.querySelectorAll('[data-order-deadline]').forEach(el => {
    el.textContent = info.nextDeadlineStr;
  });

  // Cutoff warning — visible only when this cycle's window has closed
  document.querySelectorAll('[data-cutoff-warning]').forEach(el => {
    if (info.cutoffPassed) {
      el.style.display = '';
      // Closed Saturday (for context)
      el.querySelectorAll('[data-closed-sat]').forEach(e => {
        e.textContent = info.thisSaturdayStr;
      });
      // Following Saturday (actual delivery)
      el.querySelectorAll('[data-next-sat]').forEach(e => {
        e.textContent = info.deliverySaturdayStr;
      });
      // New deadline
      el.querySelectorAll('[data-next-deadline]').forEach(e => {
        e.textContent = info.nextDeadlineStr;
      });
    } else {
      el.style.display = 'none';
    }
  });
})();

/* ── CART BADGE ──────────────────────────────────────── */
function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  try {
    const cart = JSON.parse(localStorage.getItem('mgfj_cart') || '[]');
    const total = cart.reduce((s, i) => s + i.qty, 0);
    badge.textContent = total;
    badge.style.display = total ? 'flex' : 'none';
  } catch { badge.style.display = 'none'; }
}
updateCartBadge();

/* expose helpers globally */
window.MGFJ = { getNextHarvestInfo, updateCartBadge };
