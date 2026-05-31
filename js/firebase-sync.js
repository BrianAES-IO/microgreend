/* ════════════════════════════════════════════════════════════
   MGFJ Firebase Sync Layer
   ────────────────────────────────────────────────────────────
   Initialises Firebase (compat SDK) and exposes simple helpers
   that wrap Firestore. Designed so the existing localStorage-
   based code keeps working — the listeners just keep
   localStorage in sync with Firestore behind the scenes.
   ════════════════════════════════════════════════════════════ */

const firebaseConfig = {
  apiKey: "AIzaSyAiSdILGIz4P-cPGmjMmkYFDh3k4a0PjcU",
  authDomain: "microgreens-farm-ja.firebaseapp.com",
  projectId: "microgreens-farm-ja",
  storageBucket: "microgreens-farm-ja.firebasestorage.app",
  messagingSenderId: "623849350114",
  appId: "1:623849350114:web:b66f3adab129d6e7600fbb"
};

(function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.warn('[MGFJ] Firebase SDK not loaded — falling back to localStorage-only mode');
    window._mgfj_firebase_ready = false;
    return;
  }
  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    window._db = firebase.firestore();
    window._auth = firebase.auth();
    /* Enable offline persistence (queues writes while offline) */
    try {
      window._db.enablePersistence({ synchronizeTabs: true }).catch(function(){});
    } catch (e) {}
    window._mgfj_firebase_ready = true;
    console.log('[MGFJ] Firebase initialised: project =', firebaseConfig.projectId);
  } catch (e) {
    console.error('[MGFJ] Firebase init failed', e);
    window._mgfj_firebase_ready = false;
  }
})();

/* ───────────────────────────────────────────────────────────
   DATA SYNC API
   ─────────────────────────────────────────────────────────── */
window.MGFJ_Sync = {
  ready: function() { return !!window._mgfj_firebase_ready; },

  /* ── ORDERS ── */
  /* Customer-facing: submit a new order. Writes to Firestore;
     localStorage append is handled by the caller (legacy code). */
  async submitOrder(order) {
    if (!this.ready()) return false;
    try {
      const data = Object.assign({}, order, {
        _createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        _source: 'order.html'
      });
      await window._db.collection('orders').doc(order.id).set(data);
      console.log('[MGFJ] Order submitted to Firestore:', order.id);
      return true;
    } catch (e) {
      console.error('[MGFJ] submitOrder failed', e);
      return false;
    }
  },

  /* Admin-facing: subscribe to ALL orders. Calls onChange(arr) each time
     anything changes. Returns an unsubscribe function. */
  subscribeOrders(onChange) {
    if (!this.ready()) { onChange([]); return function(){}; }
    return window._db.collection('orders')
      .orderBy('_createdAt', 'desc')
      .onSnapshot(function(snap) {
        const orders = snap.docs.map(function(d) {
          const data = d.data();
          delete data._createdAt;
          delete data._source;
          return data;
        });
        onChange(orders);
      }, function(err) {
        console.error('[MGFJ] orders listener error:', err);
      });
  },

  /* Admin updates an order (status change, delivery confirmation, etc.) */
  async updateOrder(id, patch) {
    if (!this.ready()) return false;
    try {
      await window._db.collection('orders').doc(id).set(patch, { merge: true });
      return true;
    } catch (e) {
      console.error('[MGFJ] updateOrder failed', e);
      return false;
    }
  },

  /* Admin deletes an order */
  async deleteOrder(id) {
    if (!this.ready()) return false;
    try { await window._db.collection('orders').doc(id).delete(); return true; }
    catch (e) { console.error('[MGFJ] deleteOrder failed', e); return false; }
  },

  /* Bulk save (used after large admin operations) */
  async saveOrders(orders) {
    if (!this.ready()) return false;
    const batch = window._db.batch();
    orders.forEach(function(o) {
      batch.set(window._db.collection('orders').doc(o.id), Object.assign({}, o, {
        _updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }), { merge: true });
    });
    try { await batch.commit(); return true; }
    catch (e) { console.error('[MGFJ] saveOrders batch failed', e); return false; }
  },

  /* ── MESSAGES (contact form) ── */
  async submitMessage(msg) {
    if (!this.ready()) return false;
    try {
      const id = msg.id || ('MSG-' + Date.now());
      await window._db.collection('messages').doc(id).set(Object.assign({}, msg, {
        id: id,
        _createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }));
      return true;
    } catch (e) { console.error('[MGFJ] submitMessage failed', e); return false; }
  },

  subscribeMessages(onChange) {
    if (!this.ready()) { onChange([]); return function(){}; }
    return window._db.collection('messages')
      .orderBy('_createdAt', 'desc')
      .onSnapshot(function(snap) {
        onChange(snap.docs.map(function(d){ const x=d.data(); delete x._createdAt; return x; }));
      }, function(e){ console.error('[MGFJ] messages listener', e); });
  },

  async updateMessage(id, patch) {
    if (!this.ready()) return false;
    try { await window._db.collection('messages').doc(id).set(patch, {merge:true}); return true; }
    catch (e) { console.error('[MGFJ] updateMessage', e); return false; }
  },

  /* ── LEADS (newsletter, etc.) ── */
  async submitLead(lead) {
    if (!this.ready()) return false;
    try {
      const id = lead.id || ('LEAD-' + Date.now());
      await window._db.collection('leads').doc(id).set(Object.assign({}, lead, {
        id: id,
        _createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }));
      return true;
    } catch (e) { console.error('[MGFJ] submitLead failed', e); return false; }
  },

  subscribeLeads(onChange) {
    if (!this.ready()) { onChange([]); return function(){}; }
    return window._db.collection('leads')
      .orderBy('_createdAt', 'desc')
      .onSnapshot(function(snap) {
        onChange(snap.docs.map(function(d){ const x=d.data(); delete x._createdAt; return x; }));
      });
  },

  /* ── ONE-TIME MIGRATION FROM LOCALSTORAGE ── */
  /* Pushes everything currently in admin's localStorage up to Firestore.
     Safe to run multiple times — uses merge so duplicates are overwritten,
     not duplicated. */
  async migrateLocalStorageToFirestore(progressCb) {
    if (!this.ready()) return { ok:false, error:'Firebase not ready' };
    progressCb = progressCb || function(){};
    const results = { orders:0, messages:0, leads:0, errors:[] };

    const safe = function(key) {
      try { return JSON.parse(localStorage.getItem(key) || '[]'); }
      catch { return []; }
    };

    /* Orders */
    const orders = safe('mgfj_orders');
    progressCb('Migrating ' + orders.length + ' orders…');
    for (const o of orders) {
      try {
        await window._db.collection('orders').doc(o.id).set(Object.assign({}, o, {
          _createdAt: firebase.firestore.Timestamp.fromDate(new Date(o.createdAt || Date.now())),
          _migrated: true
        }), { merge: true });
        results.orders++;
      } catch (e) { results.errors.push('order ' + o.id + ': ' + e.message); }
    }

    /* Messages */
    const messages = safe('mgfj_messages');
    progressCb('Migrating ' + messages.length + ' messages…');
    for (const m of messages) {
      try {
        const id = m.id || ('MSG-' + Date.now() + '-' + Math.random().toString(36).slice(2,6));
        await window._db.collection('messages').doc(id).set(Object.assign({}, m, {
          id: id,
          _createdAt: firebase.firestore.Timestamp.fromDate(new Date(m.createdAt || m.date || Date.now())),
          _migrated: true
        }), { merge: true });
        results.messages++;
      } catch (e) { results.errors.push('message: ' + e.message); }
    }

    /* Leads */
    const leads = safe('mgfj_leads');
    progressCb('Migrating ' + leads.length + ' leads…');
    for (const l of leads) {
      try {
        const id = l.id || ('LEAD-' + Date.now() + '-' + Math.random().toString(36).slice(2,6));
        await window._db.collection('leads').doc(id).set(Object.assign({}, l, {
          id: id,
          _createdAt: firebase.firestore.Timestamp.fromDate(new Date(l.createdAt || l.date || Date.now())),
          _migrated: true
        }), { merge: true });
        results.leads++;
      } catch (e) { results.errors.push('lead: ' + e.message); }
    }

    progressCb('Done.');
    return { ok:true, results: results };
  }
};

/* ───────────────────────────────────────────────────────────
   AUTH API
   ─────────────────────────────────────────────────────────── */
window.MGFJ_Auth = {
  ready: function() { return !!window._auth; },
  signIn(email, password) {
    if (!this.ready()) return Promise.reject(new Error('Auth not ready'));
    return window._auth.signInWithEmailAndPassword(email, password);
  },
  signOut() {
    if (!this.ready()) return Promise.resolve();
    return window._auth.signOut();
  },
  onAuthChange(cb) {
    if (!this.ready()) { cb(null); return function(){}; }
    return window._auth.onAuthStateChanged(cb);
  },
  currentUser() {
    return this.ready() ? window._auth.currentUser : null;
  },
  sendPasswordReset(email) {
    if (!this.ready()) return Promise.reject(new Error('Auth not ready'));
    return window._auth.sendPasswordResetEmail(email);
  }
};
