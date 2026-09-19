/* Zakir Lab — Supabase connection (shared leaderboard + suggestions).
   The publishable key is meant to be public; row level security in
   supabase/setup.sql decides what it can do (read/add scores, add suggestions). */
(function () {
  var URL = 'https://sxnkgfxodpnxpxrhyqzx.supabase.co';
  var KEY = 'sb_publishable_m0WTfbZtSKNInLbEhTB4og_4GlXwXv8';
  var NAME_KEY = 'ZAKIR_PLAYER_NAME';

  function request(path, options) {
    options = options || {};
    var headers = {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json'
    };
    for (var h in options.headers || {}) headers[h] = options.headers[h];
    return fetch(URL + '/rest/v1/' + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
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

  window.ZakirCloud = {
    playerName: playerName,

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

    topScores: function (title, limit) {
      var q = 'scores?select=player,title,correct,total,percent,created_at' +
              '&order=percent.desc,correct.desc,created_at.asc&limit=' + (limit || 50);
      if (title) q += '&title=eq.' + encodeURIComponent(title);
      return request(q);
    },

    testTitles: function () {
      return request('scores?select=title&order=title.asc&limit=1000').then(function (rows) {
        var seen = {};
        return rows.map(function (r) { return r.title; })
                   .filter(function (t) { return seen[t] ? false : (seen[t] = true); });
      });
    },

    notesFor: function (subject) {
      return request('notes?select=title,file_path,created_at&subject=eq.' + encodeURIComponent(subject) +
                     '&order=created_at.desc&limit=200');
    },

    fileUrl: function (path) {
      return URL + '/storage/v1/object/public/notes/' + path.split('/').map(encodeURIComponent).join('/');
    },

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
      var key = 'ZAKIR_RECENT_FILES_V1';
      var label = document.querySelector('.eyebrow-text');
      var section = label ? label.textContent.replace(/\s+/g, ' ').trim() : 'PDF Library';
      var item = {
        title: link.querySelector('h2').textContent.trim(),
        url: link.href,
        section: section,
        tag: section,
        openedAt: new Date().toISOString()
      };
      var list = JSON.parse(localStorage.getItem(key) || '[]');
      list = (Array.isArray(list) ? list : []).filter(function (x) { return x && x.url !== item.url; });
      list.unshift(item);
      localStorage.setItem(key, JSON.stringify(list.slice(0, 20)));
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
