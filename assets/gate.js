/* Zakir Lab — sign-in wall.
   Loaded first, without defer, on every page except the homepage, /account/
   and /admin/. A visitor with no saved student session is sent to the sign-in
   page and brought back here afterwards. This is a convenience wall, not
   access control: the site's files are public on GitHub Pages. */
(function () {
  var KEY = 'zakir-student-auth';

  function signInUrl() {
    var here = location.pathname + location.search + location.hash;
    return '/account/?next=' + encodeURIComponent(here);
  }

  function hasSession() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return false;
      var s = JSON.parse(raw);
      // an expired access token is fine: supabase-js renews it with the refresh token
      return !!(s && (s.refresh_token || (s.currentSession && s.currentSession.refresh_token)));
    } catch (e) {
      return false;
    }
  }

  function leave() {
    document.documentElement.style.display = 'none';
    location.replace(signInUrl());
  }

  if (!hasSession()) {
    leave();
    return;
  }

  // on pages that talk to Supabase, a revoked or unrenewable session also leaves
  window.addEventListener('zakir:auth', function (e) {
    if (!e.detail) leave();
  });
})();
