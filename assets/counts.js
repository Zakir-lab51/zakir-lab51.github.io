/* Zakir Lab — self-counting section headers.
   Any "<n> files" / "<n> subjects" badge is recalculated from the cards
   actually on the page, so the numbers can never drift from reality.
   Badges with words in them ("Public", "New", "Moved to subjects") are
   left alone, and uploaded notes are counted too because cloud.js adds
   its cards before this runs on load and updates the badge afterwards. */
(function () {
  var PATTERN = /^\s*\d+\s+(file|files|subject|subjects)\s*$/i;

  function label(n, word) {
    return n + ' ' + (n === 1 ? word : word + 's');
  }

  function run() {
    document.querySelectorAll('.section-count').forEach(function (el) {
      var match = PATTERN.exec(el.textContent || '');
      if (!match) return;
      var scope = el.closest('section') || document;
      var cards = scope.querySelectorAll('a.note-card').length;
      el.textContent = label(cards, match[1].toLowerCase().replace(/s$/, ''));
    });

    // the sidebar counter on subject pages
    document.querySelectorAll('.pc-meta-box').forEach(function (box) {
      var name = box.querySelector('.pc-meta-label');
      var num = box.querySelector('.pc-meta-num');
      if (!name || !num || !/pdf/i.test(name.textContent || '')) return;
      num.textContent = document.querySelectorAll('a.note-card').length;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
