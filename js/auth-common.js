// js/auth-common.js
;(function (global) {
  const Auth = {};
  const LS_ACCOUNT_ID = 'sb.account_id';
  const LS_USER_ID = 'sb.user_id';
  let cachedUserId = null;

  const safeStorage = {
    get(key) {
      try { return global.localStorage.getItem(key); } catch (_) { return null; }
    },
    set(key, value) {
      try { global.localStorage.setItem(key, value); } catch (_) {}
    },
    remove(key) {
      try { global.localStorage.removeItem(key); } catch (_) {}
    }
  };

  function setAccountCache(accountId, userId) {
    if (accountId) safeStorage.set(LS_ACCOUNT_ID, accountId);
    if (userId) {
      safeStorage.set(LS_USER_ID, userId);
      cachedUserId = userId;
    }
  }

  function clearAccountCache() {
    safeStorage.remove(LS_ACCOUNT_ID);
    safeStorage.remove(LS_USER_ID);
    cachedUserId = null;
  }

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
      clearAccountCache();
      location.replace(withV(target));
    }, { capture: true });

    client.auth.onAuthStateChange((event, session) => {
      if (session?.user?.id) {
        cachedUserId = session.user.id;
        safeStorage.set(LS_USER_ID, cachedUserId);
      } else if (event === 'SIGNED_OUT') {
        clearAccountCache();
      }
      if (event === 'SIGNED_OUT') {
        if (!/index\.html$|login\.html$/.test(location.pathname)) {
          location.replace(withV(target));
        }
      }
    });
  };

  Auth.getMyAccountId = async function (client) {
    try {
      const cached = safeStorage.get(LS_ACCOUNT_ID);
      if (cached) return cached;

      let userId = cachedUserId || safeStorage.get(LS_USER_ID);
      if (!userId) {
        try {
          const res = await Promise.race([
            client.auth.getUser(),
            new Promise((resolve) => setTimeout(() => resolve({ data: { user: null }, error: new Error('timeout') }), 1500))
          ]);
          if (res?.data?.user?.id) {
            userId = res.data.user.id;
            cachedUserId = userId;
            safeStorage.set(LS_USER_ID, userId);
          }
        } catch (err) {
          console.warn('getUser failed', err);
        }
      }
      if (!userId) return null;

      const { data, error } = await client
        .from('users')
        .select('account_id')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      const accountId = data?.account_id || null;
      if (accountId) setAccountCache(accountId, userId);
      return accountId;
    } catch (e) {
      console.warn('getMyAccountId failed', e);
      return null;
    }
  };

  Auth.setCachedAccount = (accountId, userId) => setAccountCache(accountId, userId);

  global.AuthCommon = Auth;
})(window);
