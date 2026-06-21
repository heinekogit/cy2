;(function (global) {
  const Profile = {};
  const DEFAULT_COLUMNS = 'id,account_id,display_name,profile_image,home_lat,home_lng,home_name';

  async function getCurrentUser(client) {
    if (!client?.auth) return null;
    try {
      const { data } = await client.auth.getUser();
      if (data?.user?.id) return data.user;
    } catch (_) {}
    try {
      const { data } = await client.auth.getSession();
      if (data?.session?.user?.id) return data.session.user;
    } catch (_) {}
    return null;
  }

  function cleanPatch(values) {
    const out = {};
    for (const [key, value] of Object.entries(values || {})) {
      if (value !== undefined) out[key] = value;
    }
    return out;
  }

  function isProfileColumnsMissingError(err) {
    const text = `${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`.toLowerCase();
    return (
      text.includes('display_name') ||
      text.includes('profile_image') ||
      text.includes('home_lat') ||
      text.includes('home_lng') ||
      text.includes('home_name')
    );
  }

  function profileColumnsMissingMessage() {
    return 'users テーブルに profile 用カラムが未追加です。sql/20260622_profile_settings.sql を適用してください。';
  }

  Profile.getCurrentUser = getCurrentUser;
  Profile.DEFAULT_COLUMNS = DEFAULT_COLUMNS;
  Profile.isProfileColumnsMissingError = isProfileColumnsMissingError;
  Profile.profileColumnsMissingMessage = profileColumnsMissingMessage;

  Profile.getMyProfile = async function (client, columns = DEFAULT_COLUMNS) {
    const user = await getCurrentUser(client);
    if (!user?.id) return { user: null, data: null, error: new Error('auth_required') };
    try {
      const { data, error } = await client
        .from('users')
        .select(columns)
        .eq('id', user.id)
        .maybeSingle();
      return { user, data, error };
    } catch (error) {
      return { user, data: null, error };
    }
  };

  Profile.updateMyProfile = async function (client, values, columns = DEFAULT_COLUMNS) {
    const user = await getCurrentUser(client);
    if (!user?.id) return { user: null, data: null, error: new Error('auth_required') };
    const patch = cleanPatch(values);
    try {
      const { data, error } = await client
        .from('users')
        .update(patch)
        .eq('id', user.id)
        .select(columns)
        .maybeSingle();
      return { user, data, error };
    } catch (error) {
      return { user, data: null, error };
    }
  };

  global.ProfileCommon = Profile;
})(window);
