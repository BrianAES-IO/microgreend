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
    /* Firestore is required for sync */
    window._db = firebase.firestore();
    /* Auth is optional — public pages don't load the auth SDK */
    if (typeof firebase.auth === 'function') {
      try { window._auth = firebase.auth(); } catch (e) { console.warn('[MGFJ] Auth init skipped', e.message); }
    }
    /* Storage is optional — only on admin */
    if (typeof firebase.storage === 'function') {
      try { window._storage = firebase.storage(); } catch (e) {}
    }
    /* Enable offline persistence (queues writes while offline) */
    try {
      window._db.enablePersistence({ synchronizeTabs: true }).catch(function(){});
    } catch (e) {}
    window._mgfj_firebase_ready = true;
    console.log('[MGFJ] Firebase initialised: project =', firebaseConfig.projectId,
      '| auth:', !!window._auth, '| storage:', !!window._storage);
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

  saveAvailability(obj)     { return this._saveState('public_state', 'availability', obj); },
  subscribeAvailability(cb) { return this._subscribeState('public_state', 'availability', cb); },

  saveDeliveryParishes(arr)     { return this._saveState('public_state', 'delivery_parishes', arr); },
  subscribeDeliveryParishes(cb) { return this._subscribeState('public_state', 'delivery_parishes', cb); },

  /* Weekly stock limits per crop (admin sets) */
  saveStockLimits(obj)     { return this._saveState('public_state', 'stock_limits', obj); },
  subscribeStockLimits(cb) { return this._subscribeState('public_state', 'stock_limits', cb); },

  /* ── LIVE PRESENCE (active visitors) ──
     Each visitor writes a heartbeat doc to `presence/{sessionId}`.
     Admin subscribes to the whole collection to see who's online,
     what page they're on, and whether they're mid-order. */
  presenceHeartbeat(sessionId, data) {
    if (!this.ready() || !sessionId) return Promise.resolve(false);
    return window._db.collection('presence').doc(sessionId).set(
      Object.assign({}, data, { lastSeen: firebase.firestore.FieldValue.serverTimestamp() }),
      { merge: true }
    ).then(function(){ return true; }).catch(function(){ return false; });
  },
  presenceRemove(sessionId) {
    if (!this.ready() || !sessionId) return Promise.resolve(false);
    return window._db.collection('presence').doc(sessionId).delete().catch(function(){});
  },
  subscribePresence(onChange) {
    if (!this.ready()) { onChange([]); return function(){}; }
    return window._db.collection('presence').onSnapshot(function(snap) {
      const list = snap.docs.map(function(d) {
        const x = d.data() || {};
        let lastSeenMs = 0;
        if (x.lastSeen && typeof x.lastSeen.toMillis === 'function') lastSeenMs = x.lastSeen.toMillis();
        return {
          id: d.id,
          page: x.page || '',
          status: x.status || 'browsing',
          parish: x.parish || '',
          cartCount: x.cartCount || 0,
          cartValue: x.cartValue || 0,
          ref: x.ref || '',
          device: x.device || '',
          startedAt: x.startedAt || null,
          lastSeenMs: lastSeenMs
        };
      });
      onChange(list);
    }, function(err){ console.warn('[MGFJ] presence listener:', err.message); });
  },

  /* ── WEEKLY STOCK COUNTERS (public, per delivery week) ──
     stock_counts/{weekKey} = { cropId: soldQty, ... }
     Anonymous customers increment these as they order; the order
     page reads them to know how much of each crop is left. */
  async incrementStock(weekKey, items) {
    if (!this.ready()) return false;
    try {
      const patch = {};
      items.forEach(function(it) {
        patch[it.cropId] = firebase.firestore.FieldValue.increment(it.qty);
      });
      await window._db.collection('stock_counts').doc(weekKey).set(patch, { merge: true });
      return true;
    } catch (e) { console.error('[MGFJ] incrementStock failed', e); return false; }
  },
  subscribeStockCounts(weekKey, onChange) {
    if (!this.ready()) { onChange({}); return function(){}; }
    return window._db.collection('stock_counts').doc(weekKey).onSnapshot(function(doc) {
      onChange(doc.exists ? (doc.data() || {}) : {});
    }, function(err){ console.warn('[MGFJ] stock_counts listener:', err.message); });
  },
  async resetStockCounts(weekKey) {
    if (!this.ready()) return false;
    try { await window._db.collection('stock_counts').doc(weekKey).delete(); return true; }
    catch (e) { console.error('[MGFJ] resetStockCounts failed', e); return false; }
  },
  async getStockCountsOnce(weekKey) {
    if (!this.ready()) return {};
    try { const d = await window._db.collection('stock_counts').doc(weekKey).get(); return d.exists ? (d.data()||{}) : {}; }
    catch (e) { return {}; }
  },

  /* ── ADMIN-ONLY STATE ── */
  saveAdminState(key, data)      { return this._saveState('admin_state', key, data); },
  subscribeAdminState(key, cb)   { return this._subscribeState('admin_state', key, cb); },

  /* ══════════════════════════════════════════════════════
     PER-SLOT IMAGE DOCS  (no Firebase Storage required)
     ────────────────────────────────────────────────────
     Each image slot is its own doc in `site_images`, holding
     either a URL or a compressed base64 string. One image per
     doc keeps every doc well under Firestore's 1MB limit, so
     uploads work on the free (Spark) plan, sync across
     devices, and survive cache clears.
     ══════════════════════════════════════════════════════ */
  async saveImageDoc(slotId, value) {
    if (!this.ready()) return false;
    try {
      await window._db.collection('site_images').doc(slotId).set({
        v: value,
        _updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return true;
    } catch (e) { console.error('[MGFJ] saveImageDoc ' + slotId + ' failed', e); return false; }
  },
  async deleteImageDoc(slotId) {
    if (!this.ready()) return false;
    try { await window._db.collection('site_images').doc(slotId).delete(); return true; }
    catch (e) { console.error('[MGFJ] deleteImageDoc failed', e); return false; }
  },
  /* Subscribe to the whole collection — returns a {slotId: value} map */
  subscribeImageDocs(onChange) {
    if (!this.ready()) { onChange({}); return function(){}; }
    return window._db.collection('site_images').onSnapshot(function(snap) {
      const map = {};
      snap.forEach(function(doc){ const d = doc.data(); if (d && d.v) map[doc.id] = d.v; });
      onChange(map);
    }, function(err){ console.warn('[MGFJ] image docs listener:', err.message); });
  },

  /* Client-side image compressor — resizes + re-encodes so the
     base64 result fits comfortably in a Firestore doc.
     Returns a Promise<dataURL>. */
  compressImage(file, maxDim, quality) {
    maxDim = maxDim || 1100;
    quality = quality || 0.82;
    return new Promise(function(resolve, reject) {
      const reader = new FileReader();
      reader.onerror = function(){ reject(new Error('Could not read file')); };
      reader.onload = function(e) {
        const img = new Image();
        img.onerror = function(){ reject(new Error('Could not decode image')); };
        img.onload = function() {
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else        { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          /* PNG with transparency (e.g. logos) -> keep PNG, else JPEG */
          const isPng = /png$/i.test(file.type);
          let out = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', quality);
          /* If still too big (>~900KB), step quality down for JPEG */
          if (out.length > 900000 && !isPng) {
            out = canvas.toDataURL('image/jpeg', 0.6);
          }
          if (out.length > 950000) {
            reject(new Error('Image is too large even after compression. Try a smaller image.'));
            return;
          }
          resolve(out);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  /* ══════════════════════════════════════════════════════
     FIREBASE STORAGE — for image file uploads
     (Firestore docs are limited to ~1MB so files have to
     go to Storage and we just save the URL in Firestore.)
     ══════════════════════════════════════════════════════ */
  storageReady() { return !!window._storage; },

  /* Upload a File/Blob to Firebase Storage and resolve to its public URL.
     onProgress(0-100) is optional. Times out if no bytes transferred in 15 s. */
  uploadImage(file, slotId, onProgress) {
    return new Promise(function(resolve, reject) {
      if (!window._storage) { reject(new Error('Firebase Storage not initialised — enable it in your Firebase Console at console.firebase.google.com')); return; }
      if (!firebase.auth().currentUser) { reject(new Error('Not signed in — refresh the page and log in again')); return; }
      const safeName = (slotId || 'upload') + '_' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      console.log('[MGFJ] Uploading to Storage:', 'site_images/' + safeName, file.size + ' bytes');
      const ref = window._storage.ref('site_images/' + safeName);
      const task = ref.put(file, { contentType: file.type });
      let lastBytes = 0;
      let stuckTicks = 0;
      const stuckChecker = setInterval(function() {
        if (lastBytes === 0) {
          stuckTicks++;
          if (stuckTicks >= 5) {  /* 5 seconds with no progress = stuck */
            clearInterval(stuckChecker);
            task.cancel();
            reject(new Error('Upload stuck at 0% — likely cause: Firebase Storage is not enabled or security rules deny writes. Open Firebase Console → Storage to check.'));
          }
        }
      }, 1000);
      task.on('state_changed',
        function(snap) {
          lastBytes = snap.bytesTransferred;
          if (typeof onProgress === 'function') {
            onProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100));
          }
        },
        function(err) {
          clearInterval(stuckChecker);
          console.error('[MGFJ] Storage upload error:', err.code, err.message);
          /* Translate common error codes to actionable messages */
          let msg = err.message || err.code || 'unknown error';
          if (err.code === 'storage/unauthorized') msg = 'Storage rules block this upload. In Firebase Console → Storage → Rules, make sure authenticated writes are allowed for site_images/.';
          else if (err.code === 'storage/canceled') msg = msg; /* keep our message */
          else if (err.code === 'storage/unknown') msg = 'Unknown Storage error. Most likely Firebase Storage is not enabled — visit console.firebase.google.com → Storage → Get started.';
          else if (err.code === 'storage/quota-exceeded') msg = 'Storage quota exceeded.';
          reject(new Error(msg));
        },
        function() {
          clearInterval(stuckChecker);
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

    /* Images — push each slot as its own doc (avoids 1MB blob limit) */
    progressCb('Migrating images…');
    const imgMap = (function(){ try { return JSON.parse(localStorage.getItem('mgfj_images')||'{}'); } catch { return {}; } })();
    results.images = 0;
    for (const slotId of Object.keys(imgMap)) {
      if (!imgMap[slotId]) continue;
      try { await window.MGFJ_Sync.saveImageDoc(slotId, imgMap[slotId]); results.images++; }
      catch (e) { results.errors.push('image ' + slotId + ': ' + e.message); }
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
