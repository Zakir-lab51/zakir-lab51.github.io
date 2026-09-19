/* Zakir Lab — Supabase connection: leaderboard, suggestions, uploaded notes,
   student sign-in (Google) and synced progress.
   The publishable key is meant to be public; row level security in
   supabase/*.sql decides what each visitor or signed-in student can do.
   Pages that support accounts load supabase-js before this file. */
(function () {
  var URL = 'https://sxnkgfxodpnxpxrhyqzx.supabase.co';
  var KEY = 'sb_publishable_m0WTfbZtSKNInLbEhTB4og_4GlXwXv8';
  var NAME_KEY = 'ZAKIR_PLAYER_NAME';
  var RECENTS_KEY = 'ZAKIR_RECENT_FILES_V1';

  // ── auth (optional: only when supabase-js is on the page) ──
  var client = null;
  if (window.supabase && window.supabase.createClient) {
    client = window.supabase.createClient(URL, KEY, {
      auth: { storageKey: 'zakir-student-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  function session() {
    if (!client) return Promise.resolve(null);
    return client.auth.getSession().then(function (r) { return r.data.session; }, function () { return null; });
  }

  function request(path, options) {
    options = options || {};
    return session().then(function (s) {
      var headers = {
        apikey: KEY,
        Authorization: 'Bearer ' + (s ? s.access_token : KEY),
        'Content-Type': 'application/json'
      };
      for (var h in options.headers || {}) headers[h] = options.headers[h];
      return fetch(URL + '/rest/v1/' + path, {
        method: options.method || 'GET',
        headers: headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    }).then(function (res) {
      return res.text().then(function (text) {
        if (!res.ok) throw new Error(res.status + ' ' + text);
        // inserts with "return=minimal" answer 201 with an empty body
        return text ? JSON.parse(text) : null;
      });
    });
  }

  function playerName() {
    try {
      var n = (localStorage.getItem(NAME_KEY) || '').trim();
      return n && n !== 'You' ? n.slice(0, 40) : '';
    } catch (e) { return ''; }
  }

  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) {}
  }

  // ── recents sync: union by URL, newest open wins, clears respected ──
  function readLocalRecents() {
    try {
      var v = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
      return Array.isArray(v) ? v.filter(function (x) { return x && x.url; }) : [];
    } catch (e) { return []; }
  }

  function mergeRecents(a, b, clearedAt) {
    var byUrl = {};
    a.concat(b).forEach(function (item) {
      var prev = byUrl[item.url];
      if (!prev || String(item.openedAt || '') > String(prev.openedAt || '')) byUrl[item.url] = item;
    });
    return Object.keys(byUrl).map(function (k) { return byUrl[k]; })
      .filter(function (x) { return !clearedAt || String(x.openedAt || '') > clearedAt; })
      .sort(function (x, y) { return String(y.openedAt || '').localeCompare(String(x.openedAt || '')); })
      .slice(0, 20);
  }

  var syncing = null;
  function syncRecents(opts) {
    opts = opts || {};
    if (syncing) return syncing;
    syncing = session().then(function (s) {
      if (!s) return null;
      var uid = s.user.id;
      return request('progress?select=recents,recents_cleared_at&user_id=eq.' + uid).then(function (rows) {
        var cloud = rows && rows[0] ? rows[0] : { recents: [], recents_cleared_at: null };
        var clearedAt = opts.clear ? new Date().toISOString() : cloud.recents_cleared_at;
        var merged = opts.clear ? [] : mergeRecents(readLocalRecents(), cloud.recents || [], clearedAt);
        try { localStorage.setItem(RECENTS_KEY, JSON.stringify(merged)); } catch (e) {}
        emit('zakir:recents-updated', merged);
        return request('progress?on_conflict=user_id', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: { user_id: uid, recents: merged, recents_cleared_at: clearedAt, updated_at: new Date().toISOString() }
        }).then(function () { return merged; });
      });
    }).catch(function (err) {
      console.warn('[ZakirCloud] progress not synced:', err.message);
      return null;
    }).then(function (r) { syncing = null; return r; });
    return syncing;
  }

  window.ZakirCloud = {
    playerName: playerName,
    enabled: !!client,

    /* ── accounts ── */
    session: session,

    profile: function () {
      return session().then(function (s) {
        if (!s) return null;
        return request('profiles?select=display_name,created_at&id=eq.' + s.user.id).then(function (rows) {
          return { user: s.user, displayName: rows && rows[0] ? rows[0].display_name : '' };
        });
      });
    },

    rename: function (name) {
      return session().then(function (s) {
        if (!s) throw new Error('Not signed in');
        return request('profiles?id=eq.' + s.user.id, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: { display_name: String(name).trim().slice(0, 40) }
        });
      });
    },

    signIn: function (returnTo) {
      if (!client) return Promise.reject(new Error('Sign-in is not available on this page'));
      return client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: returnTo || location.href.split('#')[0] }
      });
    },

    signOut: function () {
      return client ? client.auth.signOut() : Promise.resolve();
    },

    myScores: function (limit) {
      return session().then(function (s) {
        if (!s) return [];
        return request('scores?select=title,correct,wrong,skip,total,percent,created_at&user_id=eq.' + s.user.id +
                       '&order=created_at.desc&limit=' + (limit || 200));
      });
    },

    syncRecents: syncRecents,
    clearRecents: function () { return syncRecents({ clear: true }); },

    /* ── leaderboard ── */
    /* entry = { title, correct, wrong, skip, total, percent } from a quiz page */
    submitScore: function (entry) {
      var total = entry.total | 0;
      var correct = entry.correct | 0, wrong = entry.wrong | 0;
      // nothing answered → not a real attempt, keep it off the board
      if (!total || correct + wrong === 0) return Promise.resolve(false);
      return request('scores', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: {
          // for signed-in students the server replaces this with their profile name
          player: playerName() || 'Anonymous',
          title: String(entry.title || 'Quiz').slice(0, 120),
          correct: correct,
          wrong: wrong,
          skip: total - correct - wrong,
          total: total,
          percent: Math.round(correct * 100 / total)
        }
      }).then(function () { return true; }, function (err) {
        console.warn('[ZakirCloud] score not saved:', err.message);
        return false;
      });
    },

    topScores: function (title, limit, verifiedOnly) {
      var q = 'scores?select=player,title,correct,total,percent,created_at,verified' +
              '&order=percent.desc,correct.desc,created_at.asc&limit=' + (limit || 50);
      if (title) q += '&title=eq.' + encodeURIComponent(title);
      if (verifiedOnly) q += '&verified=is.true';
      return request(q);
    },

    testTitles: function () {
      return request('scores?select=title&order=title.asc&limit=1000').then(function (rows) {
        var seen = {};
        return rows.map(function (r) { return r.title; })
                   .filter(function (t) { return seen[t] ? false : (seen[t] = true); });
      });
    },

    /* ── uploaded notes ── */
    notesFor: function (subject) {
      return request('notes?select=title,file_path,created_at&subject=eq.' + encodeURIComponent(subject) +
                     '&order=created_at.desc&limit=200');
    },

    fileUrl: function (path) {
      return URL + '/storage/v1/object/public/notes/' + path.split('/').map(encodeURIComponent).join('/');
    },

    /* ── suggestions ── */
    sendSuggestion: function (s) {
      return request('suggestions', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: {
          name: (s.name || '').trim().slice(0, 80) || null,
          topic: (s.topic || '').trim().slice(0, 200) || null,
          message: (s.message || '').trim().slice(0, 2000),
          page: location.pathname.slice(0, 200)
        }
      });
    }
  };

  // ── account state: tell the page, keep progress in sync ──
  if (client) {
    client.auth.onAuthStateChange(function (event, s) {
      emit('zakir:auth', s);
      if (s && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) syncRecents();
    });
    // a PDF opened on this page → push the updated recents shortly after
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href$=".pdf"], a[data-cloud-note], a[data-recent-url]');
      if (a) setTimeout(syncRecents, 150);
    }, true);
  }

  // mark nav "Account" links with the signed-in state
  function markAccountLinks(s) {
    document.querySelectorAll('a[data-account-link]').forEach(function (a) {
      a.textContent = s ? 'My Account' : 'Sign in';
    });
  }
  window.addEventListener('zakir:auth', function (e) { markAccountLinks(e.detail); });

  /* Subject pages load this file with data-subject="anatomy" etc. and get
     the notes uploaded from /admin/ added to the top of their PDF grid. */
  var subject = document.currentScript && document.currentScript.getAttribute('data-subject');
  if (!subject) return;

  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // same record format as the page's own recents tracker
  function trackRecent(link) {
    try {
      var label = document.querySelector('.eyebrow-text');
      var section = label ? label.textContent.replace(/\s+/g, ' ').trim() : 'PDF Library';
      var item = {
        title: link.querySelector('h2').textContent.trim(),
        url: link.href,
        section: section,
        tag: section,
        openedAt: new Date().toISOString()
      };
      var list = readLocalRecents().filter(function (x) { return x.url !== item.url; });
      list.unshift(item);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 20)));
    } catch (e) {}
  }

  function mount() {
    var grid = document.querySelector('.notes-grid');
    if (!grid) return;
    window.ZakirCloud.notesFor(subject).then(function (notes) {
      if (!notes || !notes.length) return;
      var html = notes.map(function (n) {
        return '<a class="note-card" data-cloud-note href="' + esc(window.ZakirCloud.fileUrl(n.file_path)) +
               '" target="_blank" rel="noopener"><h2>' + esc(n.title) + '</h2>' +
               '<div class="note-footer"><span>Open PDF</span><span class="note-arrow">&rarr;</span></div></a>';
      }).join('');
      grid.insertAdjacentHTML('afterbegin', html);
      grid.querySelectorAll('a[data-cloud-note]').forEach(function (a) {
        a.addEventListener('click', function () { trackRecent(a); });
      });
      var count = document.querySelector('.section-row .section-count');
      if (count) {
        var n = grid.querySelectorAll('a.note-card').length;
        count.textContent = n + (n === 1 ? ' file' : ' files');
      }
    }).catch(function (err) {
      console.warn('[ZakirCloud] uploaded notes not loaded:', err.message);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
