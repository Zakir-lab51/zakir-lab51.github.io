/* Zakir Lab — keep PDFs inside the home-screen app.
   When the site runs as the installed app, a PDF link would open Safari's
   pop-up sheet on top of it. This sends the tap to /viewer/ instead, which
   shows the PDF inside the app with a back button. In a normal browser tab
   nothing changes: PDFs still open in a new tab.
   Loaded on every page that lists PDFs (subject pages, Recents, Study). */
(function () {
  function installed() {
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  // bubble phase on purpose: each page's own recents tracker has already run
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!installed()) return;
    var link = e.target.closest && e.target.closest('a[href]');
    if (!link) return;
    var url;
    try { url = new URL(link.getAttribute('href'), location.href); } catch (err) { return; }
    if (!/\.pdf$/i.test(url.pathname) && !link.hasAttribute('data-cloud-note')) return;

    var heading = link.querySelector('h2');
    var title = (heading ? heading.textContent : link.textContent).replace(/\s+/g, ' ').trim();
    e.preventDefault();
    location.href = '/viewer/?src=' + encodeURIComponent(url.href) + '&title=' + encodeURIComponent(title || 'PDF');
  });
})();
