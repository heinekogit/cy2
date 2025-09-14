  // ① 追加：runs への insert
  export async function dbPut(store, obj) {
    if (store !== 'logs') return;  // MVPは logs=実走ログだけを先に移行
    // 既存オブジェクトからSupabaseのカラムにマッピング
    const row = {
      name: obj.name ?? null,
      started_at: obj.startedAt ? new Date(obj.startedAt).toISOString() : null,
      ended_at:   obj.endedAt   ? new Date(obj.endedAt).toISOString()   : null,
      mode:       obj.routeId ? 'follow_route' : 'free',
      route_id:   obj.routeId ?? null,

      // 線・指標
      polyline:     obj.polyline ?? null,
      geojson:      obj.geojson  ?? null,
      point_count:  obj.pointCount ?? null,
      distance_m:   obj.distanceMeters ?? null,
      duration_s:   obj.durationSec ?? null,
      avg_speed_kmh: (obj.distanceMeters && obj.durationSec)
        ? (obj.distanceMeters/1000) / (obj.durationSec/3600)
        : null,
      bbox: obj.bbox ?? null
    };

    const { data, error } = await supabase.from('runs').insert([row]).select().single();
    if (error) { console.error('[dbPut runs] ', error); throw error; }
    return data; // 返ってきた行（id含む）
  }

  // ② 取得：最新順で一覧
  export async function dbGetAll(store) {
    if (store !== 'logs') return [];
    const { data, error } = await supabase
      .from('runs')
      .select('id, name, started_at, ended_at, distance_m, duration_s, avg_speed_kmh, route_id, mode')
      .order('ended_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) { console.error('[dbGetAll runs] ', error); return []; }
    // 既存UIが期待する形に軽く合わせる（必要なら）
    return data.map(r => ({
      id: r.id,
      name: r.name,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      distanceMeters: r.distance_m,
      durationSec: r.duration_s,
      avgSpeedKmh: r.avg_speed_kmh,
      routeId: r.route_id,
      mode: r.mode
    }));
  }

  // ③ 削除：id 指定で
  export async function dbDelete(store, id) {
    if (store !== 'logs') return;
    const { error } = await supabase.from('runs').delete().eq('id', id);
    if (error) { console.error('[dbDelete runs] ', error); throw error; }
  }

  // ④ （必要なら）単体取得
  export async function dbGetById(store, id) {
    if (store !== 'logs') return null;
    const { data, error } = await supabase.from('runs').select('*').eq('id', id).single();
    if (error) { console.error('[dbGetById runs] ', error); return null; }
    return data;
  }
