// js/app-common.js
// Shared helpers for auth and payload building across pages.
;(function (global) {
  const RouteOrigins = ['from_log', 'drawn', 'from_run'];
  const RouteTypes = ['from_run', 'manual', 'planned'];

  function assertAllowed(value, allowed, label) {
    if (!allowed.includes(value)) {
      throw new Error(`${label} must be one of: ${allowed.join(', ')}`);
    }
  }

  function buildRoutePayload(opts) {
    const {
      name = '新しいルート',
      isPublic = false,
      accountId,
      ownerAccountId,
      origin = 'from_log',
      routeType = 'from_run'
    } = opts || {};

    if (!accountId) throw new Error('accountId is required for routes payload');
    const ownerId = ownerAccountId || accountId;
    assertAllowed(origin, RouteOrigins, 'origin');
    assertAllowed(routeType, RouteTypes, 'route_type');

    return {
      is_public: !!isPublic,
      name,
      account_id: accountId,
      owner_account_id: ownerId,
      origin,
      route_type: routeType
    };
  }

  function formatErrorMessage(prefix, err) {
    const msg = err && err.message ? err.message : (err || '不明なエラー');
    return prefix ? `${prefix}: ${msg}` : String(msg);
  }

  function alertError(prefix, err) {
    alert(formatErrorMessage(prefix, err));
  }

  function toastError(toastFn, prefix, err) {
    const msg = formatErrorMessage(prefix, err);
    if (typeof toastFn === 'function') {
      toastFn(msg);
    } else {
      alert(msg);
    }
  }

  function withTimeout(promise, ms, label = 'timeout') {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} (${ms}ms)`)), ms))
    ]);
  }

  async function getSessionWithRefresh(supabase) {
    let session = null;
    let user = null;
    let sessionError = null;
    try {
      const { data, error } = await withTimeout(supabase.auth.getSession(), 3000, 'getSession timeout');
      session = data?.session || null;
      user = session?.user || null;
      sessionError = error || null;
    } catch (e) {
      sessionError = e;
    }

    if (!session) {
      try {
        const { data, error } = await withTimeout(supabase.auth.refreshSession(), 3000, 'refreshSession timeout');
        session = data?.session || null;
        user = session?.user || null;
        if (error && !sessionError) sessionError = error;
      } catch (e) {
        if (!sessionError) sessionError = e;
      }
    }

    return { session, user, sessionError };
  }

  async function ensureAuth(opts = {}) {
    const {
      redirectToLogin = false,
      supabase = global.supabaseClient,
      getAccountId
    } = opts || {};

    console.log('[ensureAuth] start', {
      hasClient: !!supabase,
      visibility: global.document?.visibilityState,
      path: global.location?.pathname
    });

    if (!supabase) {
      return { ok: false, user: null, session: null, ensuredAccountId: null, error: 'supabaseClient missing' };
    }

    const { session, user, sessionError } = await getSessionWithRefresh(supabase);

    if (!user) {
      const err = sessionError || new Error('auth_required');
      err.code = err.code || 'auth_required';
      if (redirectToLogin) {
        const redirect = (global.location?.pathname || '') + (global.location?.search || '');
        global.location.href = `login.html?redirect=${encodeURIComponent(redirect)}`;
      }
      console.log('[ensureAuth] end (no user)', {
        hasUser: false,
        visibility: global.document?.visibilityState,
        path: global.location?.pathname
      });
      return { ok: false, user: null, session, ensuredAccountId: null, error: err };
    }

    let ensuredAccountId = null;
    if (typeof getAccountId === 'function') {
      try {
        ensuredAccountId = await getAccountId();
      } catch (e) {
        console.warn('ensureAuth getAccountId failed', e);
      }
    }

    if (!ensuredAccountId) {
      try {
        const { data: row, error: accErr } = await supabase
          .from('users')
          .select('account_id')
          .eq('id', user.id)
          .maybeSingle();
        if (!accErr) ensuredAccountId = row?.account_id || null;
      } catch (e) {
        console.warn('ensureAuth account fetch failed', e);
      }
    }

    console.log('[ensureAuth] end', {
      hasUser: !!user,
      userId: user?.id || null,
      ensuredAccountId,
      visibility: global.document?.visibilityState,
      path: global.location?.pathname
    });

    return { ok: true, user, session, ensuredAccountId, error: null };
  }

  function createEnsureAuth({ supabase, getAccountId }) {
    return async function ensureAuthCompat() {
      const res = await ensureAuth({ supabase, getAccountId, redirectToLogin: false });
      if (!res.ok) {
        const err = res.error || new Error('auth_required');
        err.code = err.code || 'auth_required';
        throw err;
      }
      return { user: res.user, accountId: res.ensuredAccountId };
    };
  }

  function logSupabaseError(context, err) {
    const msg = err?.message || err;
    console.error(`[${context}]`, msg, err);
  }

  global.AppCommon = {
    buildRoutePayload,
    ensureAuth,
    createEnsureAuth,
    logSupabaseError,
    formatErrorMessage,
    alertError,
    toastError,
    RouteOrigins,
    RouteTypes
  };
})(window);
