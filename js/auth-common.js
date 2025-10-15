// js/auth-common.js
;(function (global) {
  const Auth = {};

  function withV(url) {
    const v = (window.APP_VERSION || '');
    const u = new URL(url, location.href);
    if (!u.searchParams.get('v')) u.searchParams.set('v', v);
    return u.toString();
  }

  Auth.init = function (client, opts = {}) {
    const target = opts.redirectUrl || 'index.html';

    // 全ページ共通のサインアウトボタン
    document.addEventListener('click', async (ev) => {
      const el = ev.target.closest('[data-signout]');
      if (!el) return;
      ev.preventDefault();
      try { await client.auth.signOut(); } catch(e){ console.warn(e); }
      location.replace(withV(target));
    }, { capture:true });

    // 他タブでサインアウトされた時にも発火
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        const isLogin = /login\.html$/.test(location.pathname);
        if (!isLogin) location.replace(withV(target));
      }
    });
  };

  global.AuthCommon = Auth;
})(window);