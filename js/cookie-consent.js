/* ═══════════════════════════════════════════════════════════════
   Micro-Greens Farm Ja — Cookie Consent Manager v1.0
   Compliance: Jamaica Data Protection Act · GDPR · CCPA
   Storage: localStorage (mgfj_cookie_consent, mgfj_consent_log)
═══════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var POLICY_VERSION = '1.0';
  var STORAGE_KEY    = 'mgfj_cookie_consent';
  var LOG_KEY        = 'mgfj_consent_log';

  var CATEGORIES = {
    necessary: {
      label:       'Strictly Necessary',
      description: 'Required for the website to function. Includes your order cart, security settings, and session state. These cannot be disabled.',
      examples:    'Cart, session, security tokens',
      required:    true
    },
    functional: {
      label:       'Functional',
      description: 'Remember your preferences between visits to give you a better experience.',
      examples:    'Dismissed banners, language settings',
      required:    false
    },
    analytics: {
      label:       'Analytics',
      description: 'Help us understand how visitors use the site so we can improve it. Data is aggregated and anonymous.',
      examples:    'Page views, time on site, traffic sources',
      required:    false
    },
    marketing: {
      label:       'Marketing',
      description: 'Allow us to show you relevant ads and measure campaign performance across other websites.',
      examples:    'Instagram ads, retargeting pixels',
      required:    false
    }
  };

  /* ── Storage ─────────────────────────────────────────── */
  function getConsent() {
    try {
      var c = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (c && c.version === POLICY_VERSION) return c;
    } catch (e) {}
    return null;
  }

  function saveConsent(choices) {
    var record = {
      version:   POLICY_VERSION,
      timestamp: new Date().toISOString(),
      choices:   choices,
      agent:     (navigator.userAgent || '').slice(0, 100)
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
      var log = [];
      try { log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch(e) {}
      log.unshift(record);
      localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, 100)));
    } catch (e) {}
    root.MGFJ_CONSENT = choices;
    try {
      document.dispatchEvent(new CustomEvent('mgfj:consent', { detail: choices, bubbles: true }));
    } catch (e) {}
  }

  /* ── Banner ──────────────────────────────────────────── */
  function renderBanner() {
    if (document.getElementById('cc-banner')) return;
    var el = document.createElement('div');
    el.id = 'cc-banner';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Cookie consent');
    el.innerHTML = [
      '<div class="cc-inner">',
        '<div class="cc-text">',
          '<strong>We use cookies</strong>',
          '<p>We use cookies to enhance your browsing experience, analyse site traffic, and support marketing.',
          ' See our <a href="cookies.html">Cookie Policy</a> and <a href="privacy.html">Privacy Policy</a>.</p>',
        '</div>',
        '<div class="cc-actions">',
          '<button class="cc-btn cc-ghost" onclick="CookieConsent.openPreferences()">Manage preferences</button>',
          '<button class="cc-btn cc-ghost" onclick="CookieConsent.rejectNonEssential()">Reject non-essential</button>',
          '<button class="cc-btn cc-solid" onclick="CookieConsent.acceptAll()">Accept all</button>',
        '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(el);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.classList.add('cc-show'); });
    });
  }

  /* ── Preferences Modal ───────────────────────────────── */
  function renderModal() {
    if (document.getElementById('cc-modal')) return;
    var cats = Object.entries(CATEGORIES).map(function (pair) {
      var k = pair[0]; var v = pair[1];
      return [
        '<div class="cc-cat">',
          '<div class="cc-cat-info">',
            '<strong>' + esc(v.label) + (v.required ? ' <em class="cc-always">(Always active)</em>' : '') + '</strong>',
            '<p>' + esc(v.description) + '</p>',
            '<small>' + esc(v.examples) + '</small>',
          '</div>',
          '<label class="cc-toggle" aria-label="' + esc(v.label) + '">',
            '<input type="checkbox" id="cc-' + k + '"' + (v.required ? ' checked disabled' : ' checked') + '>',
            '<span class="cc-knob"></span>',
          '</label>',
        '</div>'
      ].join('');
    }).join('');

    var modal = document.createElement('div');
    modal.id = 'cc-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'cc-modal-h');
    modal.style.display = 'none';
    modal.innerHTML = [
      '<div class="cc-modal-card">',
        '<div class="cc-modal-head">',
          '<h3 id="cc-modal-h">Cookie Preferences</h3>',
          '<button class="cc-modal-x" onclick="CookieConsent.closePreferences()" aria-label="Close">&times;</button>',
        '</div>',
        '<div class="cc-modal-body">',
          '<p class="cc-intro">Choose which cookies you allow. You can change your preferences at any time.</p>',
          cats,
        '</div>',
        '<div class="cc-modal-foot">',
          '<button class="cc-btn cc-ghost" onclick="CookieConsent.rejectNonEssential()">Reject non-essential</button>',
          '<button class="cc-btn cc-solid" onclick="CookieConsent.savePreferences()">Save my preferences</button>',
        '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);
  }

  /* ── Public actions ──────────────────────────────────── */
  function acceptAll() {
    var c = {};
    Object.keys(CATEGORIES).forEach(function (k) { c[k] = true; });
    saveConsent(c);
    closeBanner();
    closePreferences();
  }

  function rejectNonEssential() {
    var c = {};
    Object.keys(CATEGORIES).forEach(function (k) { c[k] = !!CATEGORIES[k].required; });
    saveConsent(c);
    closeBanner();
    closePreferences();
  }

  function savePreferences() {
    var c = {};
    Object.keys(CATEGORIES).forEach(function (k) {
      var el = document.getElementById('cc-' + k);
      c[k] = CATEGORIES[k].required || (el ? el.checked : false);
    });
    saveConsent(c);
    closeBanner();
    closePreferences();
  }

  function openPreferences() {
    renderModal();
    var m = document.getElementById('cc-modal');
    if (!m) return;
    m.style.display = 'flex';
    requestAnimationFrame(function () { m.classList.add('cc-show'); });
  }

  function closePreferences() {
    var m = document.getElementById('cc-modal');
    if (!m) return;
    m.classList.remove('cc-show');
    setTimeout(function () { m.style.display = 'none'; }, 350);
  }

  function closeBanner() {
    var b = document.getElementById('cc-banner');
    if (!b) return;
    b.classList.remove('cc-show');
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 450);
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Init ────────────────────────────────────────────── */
  function init() {
    var existing = getConsent();
    if (existing) { root.MGFJ_CONSENT = existing.choices; return; }
    setTimeout(renderBanner, 1000);
  }

  /* ── Public API ──────────────────────────────────────── */
  root.CookieConsent = {
    init:               init,
    acceptAll:          acceptAll,
    rejectNonEssential: rejectNonEssential,
    savePreferences:    savePreferences,
    openPreferences:    openPreferences,
    closePreferences:   closePreferences,
    getConsent:         getConsent
  };

})(window);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', CookieConsent.init);
} else {
  CookieConsent.init();
}
