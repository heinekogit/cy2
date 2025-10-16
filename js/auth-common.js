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
    if (window.__auth_init) return;
    window.__auth_init = true;

    const target = opts.redirectUrl || 'index.html';

    document.addEventListener('click', async (ev) => {
      const el = ev.target.closest('[data-signout]');
      if (!el) return;
      ev.preventDefault();
      try { await client.auth.signOut(); } catch (e) { console.warn(e); }
      location.replace(withV(target));
    }, { capture: true });

    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        if (!/index\.html$|login\.html$/.test(location.pathname)) {
          location.replace(withV(target));
        }
      }
    });
  };

  Auth.getMyAccountId = async function (client) {
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session?.user?.id) return null;
      const { data, error } = await client
        .from('users')
        .select('account_id')
        .eq('id', session.user.id)
        .maybeSingle();
      if (error) throw error;
      return data?.account_id || null;
    } catch (e) {
      console.warn('getMyAccountId failed', e);
      return null;
    }
  };

  global.AuthCommon = Auth;
})(window);
