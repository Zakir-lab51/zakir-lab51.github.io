/* Zakir Lab — light / dark switching.
   Loaded in <head> without defer so the saved choice is applied before the
   first paint and the page never flashes white. Pages built earlier have
   their own copy of this logic in an inline script; both read and write the
   same key, so they stay in step. */
(function () {
  var KEY = 'ZAKIR_THEME';

  function saved() {
    try {
      return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch (e) {}
    var dark = theme === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(dark));
      btn.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    });
    document.querySelectorAll('[data-theme-label]').forEach(function (el) {
      el.textContent = dark ? 'Light' : 'Dark';
    });
  }

  apply(saved());

  function bind() {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      if (btn.dataset.themeBound) return;
      btn.dataset.themeBound = '1';
      btn.addEventListener('click', function () {
        apply(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      });
    });
    apply(saved());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  // the older pages call this from their sidebar button
  window.toggleTheme = function () {
    apply(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  };
})();
