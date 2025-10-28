// js/routing.js
// 単一公開 API: routing.getRoute(waypoints, mode)

export const routing = {
  async getRoute(waypoints, mode = 'cycling') {
    return mapboxRoute(waypoints, mode);
    // 将来 Google に切り替える場合は、上記を googleRoute に差し替え
  }
};

const MAPBOX_TOKEN = window.MAPBOX_TOKEN;

async function mapboxRoute(pts, mode) {
  if (!MAPBOX_TOKEN) throw new Error('Mapbox token is not set');
  if (!Array.isArray(pts) || pts.length < 2) {
    throw new Error('need >= 2 waypoints');
  }
  const profile = mode === 'walking' ? 'walking' : mode === 'driving' ? 'driving' : 'cycling';
  const path = pts.map(p => `${p.lng},${p.lat}`).join(';');
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${path}?geometries=polyline&overview=full&access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`mapbox http ${res.status}`);
  }
  const json = await res.json();
  const polyline = json?.routes?.[0]?.geometry;
  if (!polyline) {
    throw new Error('no route geometry');
  }
  const latlngs = decodePolyline(polyline); // [[lat,lng], ...]
  const geojson = {
    type: 'LineString',
    coordinates: latlngs.map(([lat, lng]) => [lng, lat])
  };
  return { geojson, polyline };
}

function decodePolyline(str) {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coords = [];
  while (index < str.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;
    coords.push([lat * 1e-5, lng * 1e-5]);
  }
  return coords;
}

async function googleRoute(_pts, _mode) {
  throw new Error('googleRoute not implemented');
}
