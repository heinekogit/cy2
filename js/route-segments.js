(function initRouteSegments(global) {
  const MAX_GAP_MS = 5 * 60 * 1000;
  const MAX_JUMP_DISTANCE_M = 500;

  function parseGeojsonMaybeTwice(input) {
    if (input == null) return null;
    if (typeof input !== 'string') return input;
    try {
      let parsed = JSON.parse(input);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      return parsed;
    } catch (err) {
      console.warn('RouteSegments.parseGeojsonMaybeTwice failed', err);
      return null;
    }
  }

  function normalizeTimestamp(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.round(value);
    }
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return Math.round(asNumber);
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeTrackPoint(point) {
    if (!point) return null;
    if (Array.isArray(point)) {
      let lat = Number(point[0]);
      let lng = Number(point[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
        const swappedLat = lng;
        lng = lat;
        lat = swappedLat;
      }
      const ts = normalizeTimestamp(point[2]);
      return ts == null ? { lat, lng } : { lat, lng, ts };
    }

    const lat = Number(point.lat ?? point.latitude);
    const lng = Number(point.lng ?? point.lon ?? point.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const normalized = { lat, lng };
    const ts = normalizeTimestamp(point.ts ?? point.timestamp);
    const acc = Number(point.acc ?? point.accuracy);
    if (ts != null) normalized.ts = ts;
    if (Number.isFinite(acc)) normalized.acc = acc;
    if (typeof point.isOn === 'boolean') normalized.isOn = point.isOn;
    return normalized;
  }

  function normalizeTrackPoints(points) {
    if (!Array.isArray(points)) return [];
    const out = [];
    for (const point of points) {
      const normalized = normalizeTrackPoint(point);
      if (normalized) out.push(normalized);
    }
    return out;
  }

  function haversineMeters(a, b) {
    const toRad = (deg) => deg * Math.PI / 180;
    const R = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function shouldSplitSegment(prevPoint, nextPoint, options = {}) {
    const maxGapMs = Number.isFinite(options.maxGapMs) ? options.maxGapMs : MAX_GAP_MS;
    const maxJumpDistanceM = Number.isFinite(options.maxJumpDistanceM) ? options.maxJumpDistanceM : MAX_JUMP_DISTANCE_M;

    if (!prevPoint || !nextPoint) return false;

    if (prevPoint.ts != null && nextPoint.ts != null) {
      const gapMs = Math.abs(nextPoint.ts - prevPoint.ts);
      if (gapMs >= maxGapMs) return true;
    }

    const distance = haversineMeters(prevPoint, nextPoint);
    if (Number.isFinite(distance) && distance >= maxJumpDistanceM) return true;

    return false;
  }

  function splitRouteSegments(points, options = {}) {
    const normalized = normalizeTrackPoints(points);
    if (!normalized.length) return [];

    const segments = [];
    let current = [normalized[0]];

    for (let i = 1; i < normalized.length; i += 1) {
      const point = normalized[i];
      const prev = current[current.length - 1];
      if (shouldSplitSegment(prev, point, options)) {
        if (current.length >= 2) segments.push(current);
        current = [point];
        continue;
      }
      current.push(point);
    }

    if (current.length >= 2) segments.push(current);
    return segments;
  }

  function buildTrackGeojson(points) {
    const normalized = normalizeTrackPoints(points);
    return {
      type: 'Feature',
      properties: {
        trackPoints: normalized.map((point) => ({ ...point }))
      },
      geometry: {
        type: 'LineString',
        coordinates: normalized.map((point) => [point.lng, point.lat])
      }
    };
  }

  function extractTrackPointsFromGeojson(input) {
    const geojson = parseGeojsonMaybeTwice(input);
    if (!geojson) return [];

    const directTrackPoints = normalizeTrackPoints(
      geojson?.properties?.trackPoints
      || geojson?.geometry?.properties?.trackPoints
    );
    if (directTrackPoints.length) return directTrackPoints;

    const out = [];
    const pushLineString = (coordinates) => {
      if (!Array.isArray(coordinates)) return;
      for (const pair of coordinates) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const lng = Number(pair[0]);
        const lat = Number(pair[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        out.push({ lat, lng });
      }
    };
    const walkGeometry = (geometry) => {
      if (!geometry) return;
      if (geometry.type === 'LineString') {
        pushLineString(geometry.coordinates);
        return;
      }
      if (geometry.type === 'MultiLineString') {
        for (const line of geometry.coordinates || []) pushLineString(line);
        return;
      }
      if (geometry.type === 'GeometryCollection') {
        for (const child of geometry.geometries || []) walkGeometry(child);
      }
    };

    if (geojson.type === 'Feature') {
      walkGeometry(geojson.geometry);
    } else if (geojson.type === 'FeatureCollection') {
      for (const feature of geojson.features || []) walkGeometry(feature?.geometry);
    } else {
      walkGeometry(geojson);
    }
    return out;
  }

  global.RouteSegments = {
    MAX_GAP_MS,
    MAX_JUMP_DISTANCE_M,
    parseGeojsonMaybeTwice,
    normalizeTimestamp,
    normalizeTrackPoint,
    normalizeTrackPoints,
    haversineMeters,
    shouldSplitSegment,
    splitRouteSegments,
    buildTrackGeojson,
    extractTrackPointsFromGeojson
  };
})(window);
