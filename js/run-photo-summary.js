// js/run-photo-summary.js
// Keeps photo summary card in sync and links to route-photos.html
;(function (global) {
  function attachPhotoSummary({ summaryEl, countEl, linkEl, getRouteId, buildUrl }) {
    if (!summaryEl || !countEl || !linkEl) return;
    linkEl.addEventListener('click', () => {
      const rid = getRouteId();
      if (!rid) return;
      const url = buildUrl(rid);
      if (url) location.href = url;
    });
  }

  global.RunPhotoSummary = { attachPhotoSummary };
})(window);
