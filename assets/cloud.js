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
})();
