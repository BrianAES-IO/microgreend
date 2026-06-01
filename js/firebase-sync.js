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
    /* Storage is optional — only loaded on admin.html */
    if (typeof firebase.storage === 'function') {
      try { window._storage = firebase.storage(); } catch (e) {}
    }
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

  /* ════════════════════════════════════════════════════════
     STATE DOCS — generic sync for arbitrary key/value blobs
     ────────────────────────────────────────────────────────
     • public_state/<key>  — readable by anyone, writable only by admin
     • admin_state/<key>   — admin only (both read & write)
     Stored as { data: <anything-JSON-serializable>, _updatedAt: ts }
     ════════════════════════════════════════════════════════ */

  /* Generic save: writes a state document */
  async _saveState(scope, key, data) {
    if (!this.ready()) return false;
    try {
      await window._db.collection(scope).doc(key).set({
        data: data,
        _updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return true;
    } catch (e) {
      console.error('[MGFJ] _saveState ' + scope + '/' + key + ' failed', e);
      return false;
    }
  },

  /* Generic subscribe: fires callback(data) on every change */
  _subscribeState(scope, key, onChange) {
    if (!this.ready()) { onChange(null); return function(){}; }
    return window._db.collection(scope).doc(key).onSnapshot(function(doc) {
      const d = doc.data();
      onChange(d ? d.data : null);
    }, function(err) {
      console.warn('[MGFJ] _subscribeState ' + scope + '/' + key + ':', err.message);
    });
  },

  /* ── PUBLIC STATE (customer-readable) ── */
  saveProducts(arr)      { return this._saveState('public_state', 'products', arr); },
  subscribeProducts(cb)  { return this._subscribeState('public_state', 'products', cb); },

  saveImages(obj)        { return this._saveState('public_state', 'images', obj); },
  subscribeImages(cb)    { return this._subscribeState('public_state', 'images', cb); },

  saveDiscounts(arr)     { return this._saveState('public_state', 'discounts', arr); },
  subscribeDiscounts(cb) { return this._subscribeState('public_state', 'discounts', cb); },

  saveAffiliates(arr)    { return this._saveState('public_state', 'affiliates', arr); },
  subscribeAffiliates(cb){ return this._subscribeState('public_state', 'affiliates', cb); },

  /* ── ADMIN-ONLY STATE ── */
  saveAdminState(key, data)      { return this._saveState('admin_state', key, data); },
  subscribeAdminState(key, cb)   { return this._subscribeState('admin_state', key, cb); },

  /* ══════════════════════════════════════════════════════
     FIREBASE STORAGE — for image file uploads
     (Firestore docs are limited to ~1MB so files have to
     go to Storage and we just save the URL in Firestore.)
     ══════════════════════════════════════════════════════ */
  storageReady() { return !!window._storage; },

  /* Upload a File/Blob to Firebase Storage and resolve to its public URL.
     onProgress(0-100) is optional. */
  uploadImage(file, slotId, onProgress) {
    return new Promise(function(resolve, reject) {
      if (!window._storage) { reject(new Error('Firebase Storage not initialised')); return; }
      const safeName = (slotId || 'upload') + '_' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const ref = window._storage.ref('site_images/' + safeName);
      const task = ref.put(file, { contentType: file.type });
      task.on('state_changed',
        function(snap) {
          if (typeof onProgress === 'function') {
            onProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100));
          }
        },
        function(err) { reject(err); },
        function() {
          ref.getDownloadURL().then(resolve, reject);
        }
      );
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

    /* Public state docs */
    const publicMap = [
      { key:'mgfj_products',  fn:'saveProducts',   label:'products'   },
      { key:'mgfj_images',    fn:'saveImages',     label:'images'     },
      { key:'mgfj_discounts', fn:'saveDiscounts',  label:'discounts'  },
      { key:'mgfj_affiliates',fn:'saveAffiliates', label:'affiliates' }
    ];
    for (const p of publicMap) {
      progressCb('Migrating ' + p.label + '…');
      const val = (function(){ try { return JSON.parse(localStorage.getItem(p.key)); } catch { return null; } })();
      if (val !== null && val !== undefined) {
        try { await window.MGFJ_Sync[p.fn](val); results[p.label] = Array.isArray(val) ? val.length : 1; }
        catch (e) { results.errors.push(p.label + ': ' + e.message); }
      }
    }

    /* Admin-only state docs */
    const adminKeys = [
      'b2b_clients','b2b_orders','expenses','employees','payroll',
      'plantings','planting_goals','audit','marketing_posts','blog_posts',
      'route_origin','route_overrides'
    ];
    for (const k of adminKeys) {
      const localKey = 'mgfj_' + k;
      const val = (function(){ try { return JSON.parse(localStorage.getItem(localKey)); } catch { return null; } })();
      if (val !== null && val !== undefined) {
        try { await window.MGFJ_Sync.saveAdminState(k, val); results['admin_'+k] = Array.isArray(val) ? val.length : 1; }
        catch (e) { results.errors.push(k + ': ' + e.message); }
      }
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
