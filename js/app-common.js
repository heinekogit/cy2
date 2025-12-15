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

  function createEnsureAuth({ supabase, getAccountId }) {
    let cachedUser = null;
    let cachedAccountId = null;

    return async function ensureAuth() {
      if (cachedUser && cachedAccountId) return { user: cachedUser, accountId: cachedAccountId };

      const { data, error } = await supabase.auth.getSession();
      const session = data?.session || null;
      const user = session?.user || null;
      if (error || !user) {
        const err = new Error('auth_required');
        err.code = 'auth_required';
        throw err;
      }

      cachedUser = user;

      if (typeof getAccountId === 'function') {
        try {
          const ensured = await getAccountId();
          if (ensured) cachedAccountId = ensured;
        } catch (e) {
          console.warn('ensureAuth getAccountId failed', e);
        }
      }

      if (!cachedAccountId) {
        const { data: row, error: accErr } = await supabase
          .from('users')
          .select('account_id')
          .eq('id', user.id)
          .maybeSingle();
        if (accErr) throw accErr;
        cachedAccountId = row?.account_id || null;
      }

      if (!cachedAccountId) {
        const err = new Error('account_missing');
        err.code = 'account_missing';
        throw err;
      }

      return { user, accountId: cachedAccountId };
    };
  }

  function logSupabaseError(context, err) {
    const msg = err?.message || err;
    console.error(`[${context}]`, msg, err);
  }

  global.AppCommon = {
    buildRoutePayload,
    createEnsureAuth,
    logSupabaseError,
    RouteOrigins,
    RouteTypes
  };
})(window);
