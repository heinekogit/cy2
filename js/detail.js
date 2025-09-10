// detail.js – 5項目表示対応版（タイトル/日時/距離/時間/速度 + 地図）
import * as legacy from './storage.js'; // フォールバック用（tracks）
const $ = sel => document.querySelector(sel);
const fmtDateTime = (ms) => ms ? new Date(ms).toLocaleString() : '—';
const toKm = (m) => (m ?? 0) / 1000;
const z = n => String(n).padStart(2,'0');
function fmtDuration(sec){
  if(sec == null || !Number.isFinite(sec) || sec <= 0) return '—';
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  const s = Math.floor(sec%60);
  return h>0 ? `${h}:${z(m)}:${z(s)}` : `${m}:${z(s)}`;
}
function toast(msg){
  const hint = $('#hint');
  if(!hint) return;
  hint.textContent = msg;
  hint.hidden = false;
  setTimeout(()=> hint.hidden = true, 2200);
}
function readId(){
  const u = new URL(location.href);
  return u.searchParams.get('id') || (location.hash.startsWith('#id=') ? location.hash.slice(4) : null);
}
function haversine(lat1,lng1,lat2,lng2){
  const R=6371000; const toRad=x=>x*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function totalDistance(points){
  if(!points || points.length<2) return 0;
  let sum=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1], b=points[i];
    sum += haversine(a.lat,a.lng,b.lat,b.lng);
  }
  return sum;
}
function decodePolyline(str){
  if(!str) return [];
  let idx=0, lat=0, lng=0, coords=[];
  while(idx<str.length){
    let b,shift=0,result=0;
    do{ b=str.charCodeAt(idx++)-63; result |= (b & 0x1f) << shift; shift += 5; }while(b>=0x20);
    let dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    shift=0; result=0;
    do{ b=str.charCodeAt(idx++)-63; result |= (b & 0x1f) << shift; shift += 5; }while(b>=0x20);
    let dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat; lng += dlng;
    coords.push([lat/1e5, lng/1e5]);
  }
  return coords.map(([la,ln])=>({lat:la, lng:ln}));
}
function openDB(){
  return new Promise((resolve)=>{
    if(!('indexedDB' in window)){ resolve(null); return; }
    const req = indexedDB.open('route_mvp', 1);
    req.onupgradeneeded = (e)=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains('logs')){
        db.createObjectStore('logs', { keyPath:'id' });
      }
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror  = ()=> resolve(null);
  });
}
async function getFromIndexedDBLogs(id){
  const db = await openDB();
  if(!db) return null;
  return await new Promise((res)=>{
    const tx = db.transaction('logs','readonly');
    const st = tx.objectStore('logs');
    const q = st.get(id);
    q.onsuccess = ()=> res(q.result || null);
    q.onerror   = ()=> res(null);
  });
}
function getFromLocalStorageLogs(id){
  try{
    const arr = JSON.parse(localStorage.getItem('logs') || '[]');
    return arr.find(x=>x?.id===id) || null;
  }catch(_){ return null; }
}
async function getRecord(id){
  let r = await getFromIndexedDBLogs(id);
  if(r) return r;
  r = getFromLocalStorageLogs(id);
  if(r) return r;
  try{ r = await legacy.get(id); }catch(_){ r=null; }
  return r || null;
}
function normalize(rec){
  if(!rec) return null;
  const points = Array.isArray(rec.points) ? rec.points
                : (rec.polyline ? decodePolyline(rec.polyline) : []);
  const distanceM = (rec.distanceMeters ?? rec.distanceM ?? 0) || totalDistance(points);
  const createdAt = rec.endedAt || rec.createdAt || rec.startedAt || null;
  let durationSec = rec.durationSec;
  if((durationSec == null || !Number.isFinite(durationSec)) && rec.startedAt && rec.endedAt){
    const s = Number(rec.startedAt), e = Number(rec.endedAt);
    if(Number.isFinite(s) && Number.isFinite(e) && e > s){
      durationSec = Math.round((e - s)/1000);
    }
  }
  const tags = (rec.meta && Array.isArray(rec.meta.tags)) ? rec.meta.tags : [];
  return {
    id: rec.id,
    name: rec.name || rec.id,
    createdAt,
    startedAt: rec.startedAt ?? null,
    endedAt: rec.endedAt ?? null,
    durationSec: durationSec ?? null,
    distanceM,
    points,
    bbox: rec.bbox || null,
    tags,
  };
}
function drawMap(points, bbox){
  const map = L.map('map', { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  if(!points || points.length===0){
    if(bbox && bbox.southWest && bbox.northEast){
      const sw = [bbox.southWest[0], bbox.southWest[1]];
      const ne = [bbox.northEast[0], bbox.northEast[1]];
      const poly = L.polyline([sw, [sw[0],ne[1]], ne, [ne[0],sw[1]], sw], { weight:1, opacity:0 }).addTo(map);
      map.fitBounds(poly.getBounds(), { padding:[20,20] });
      toast('座標列がないため、範囲のみ表示');
      return;
    }
    map.setView([35.681236,139.767125], 12);
    toast('表示できる位置データがありません');
    return;
  }
  if(points.length===1){
    const p = points[0];
    L.marker([p.lat,p.lng]).addTo(map);
    map.setView([p.lat,p.lng], 16);
    toast('1点のみ：マーカー表示');
    return;
  }
  const latlngs = points.map(p=> [p.lat,p.lng]);
  const poly = L.polyline(latlngs, { weight:4, opacity:0.9 }).addTo(map);
  map.fitBounds(poly.getBounds(), { padding:[20,20] });
}

// ===== 標高・斜度ユーティリティ =====
function distanceOnEarth(a,b){
  const R=6371000, toRad=x=>x*Math.PI/180;
  const dLat=toRad(b.lat-a.lat), dLng=toRad(b.lng-a.lng);
  const la1=toRad(a.lat), la2=toRad(b.lat);
  const s=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}

// ルートをN分割して間引き（Open-Elevation のレート対策）
function samplePoints(points, maxN=200){
  if(!points || points.length===0) return [];
  if(points.length<=maxN) return points;
  const step = Math.ceil(points.length / maxN);
  const res = [];
  for(let i=0;i<points.length;i+=step) res.push(points[i]);
  if(res[res.length-1]!==points[points.length-1]) res.push(points[points.length-1]);
  return res;
}

// Open-Elevation で標高[m]配列を取得（CORSが通らない環境では失敗→null）
async function fetchElevations(points){
  try{
    const qs = samplePoints(points, 200).map(p=>`${p.lat},${p.lng}`).join("|");
    if(!qs) return null;
    const url = `https://api.open-elevation.com/api/v1/lookup?locations=${encodeURIComponent(qs)}`;
    const res = await fetch(url, { mode: 'cors' });
    if(!res.ok) return null;
    const json = await res.json();
    const list = json?.results?.map(r=>r.elevation).filter(x=>Number.isFinite(x));
    if(!list || list.length<2) return null;

    // 間引きした標高を、元の点列長に線形補間して拡張
    if(points.length <= list.length) return list;
    const expanded = new Array(points.length);
    const idxStep = (points.length-1) / (list.length-1);
    for(let i=0;i<points.length;i++){
      const pos = i/idxStep;
      const k = Math.floor(pos);
      if(k>=list.length-1){ expanded[i] = list[list.length-1]; continue; }
      const t = pos - k;
      expanded[i] = list[k]*(1-t) + list[k+1]*t;
    }
    return expanded;
  }catch(_){ return null; }
}

// 総上昇量・総下降量を計算（しきい値でノイズ抑制）
function sumGainLoss(elevs, threshold=2){
  let up=0, down=0;
  for(let i=1;i<elevs.length;i++){
    const d = elevs[i]-elevs[i-1];
    if(d>threshold) up += d;
    else if(d<-threshold) down += -d;
  }
  return { up: Math.round(up), down: Math.round(down) };
}

// SVGに標高プロファイルを描画
function drawElevationSVG(svg, elevs, points){
  const ns = "http://www.w3.org/2000/svg";
  const W = svg.clientWidth || svg.viewBox?.baseVal?.width || 600;
  const H = svg.clientHeight || svg.viewBox?.baseVal?.height || 120;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = '';

  // 横軸=距離[m]、縦軸=標高
  const dist = [0];
  for(let i=1;i<points.length;i++){
    dist[i] = dist[i-1] + distanceOnEarth(points[i-1], points[i]);
  }
  const total = dist[dist.length-1] || 1;
  const minE = Math.min(...elevs), maxE = Math.max(...elevs);
  const pad = 6;
  const x = i => pad + (W-2*pad) * (dist[i]/total);
  const y = e => pad + (H-2*pad) * (1 - (e - minE) / Math.max(1, (maxE-minE)));

  // 面グラフ
  let d = `M ${x(0)} ${y(elevs[0])}`;
  for(let i=1;i<elevs.length;i++) d += ` L ${x(i)} ${y(elevs[i])}`;
  d += ` L ${x(elevs.length-1)} ${H-pad} L ${x(0)} ${H-pad} Z`;
  const path = document.createElementNS(ns,'path');
  path.setAttribute('d', d);
  path.setAttribute('fill','#cfe8ff');
  path.setAttribute('stroke','#5aa0ff');
  path.setAttribute('stroke-width','1');
  svg.appendChild(path);

  // 目盛り（標高）
  const gLine = document.createElementNS(ns,'g');
  const ticks = 3;
  for(let i=0;i<=ticks;i++){
    const e = minE + (maxE-minE)*i/ticks;
    const yy = y(e);
    const line = document.createElementNS(ns,'line');
    line.setAttribute('x1', pad); line.setAttribute('x2', W-pad);
    line.setAttribute('y1', yy);  line.setAttribute('y2', yy);
    line.setAttribute('stroke', '#eee');
    gLine.appendChild(line);

    const label = document.createElementNS(ns,'text');
    label.setAttribute('x', pad+2); label.setAttribute('y', yy-2);
    label.setAttribute('font-size','10'); label.setAttribute('fill','#666');
    label.textContent = `${Math.round(e)} m`;
    svg.appendChild(label);
  }
  svg.appendChild(gLine);
}

// 距離配列（m）を作る
function cumDistances(points){
  const d=[0]; for(let i=1;i<points.length;i++) d[i]=d[i-1]+distanceOnEarth(points[i-1],points[i]); 
  return d;
}

// 距離ベース移動平均（winMeters ≈ 150〜300 が目安）
function smoothByDistance(elevs, dists, winMeters=200){
  const n=elevs.length, out=new Array(n);
  let j0=0, j1=0, sum=0, cnt=0;
  for(let i=0;i<n;i++){
    const left = dists[i]-winMeters/2, right = dists[i]+winMeters/2;
    // 右端を広げる
    while(j1<n && dists[j1] <= right){ sum += elevs[j1]; cnt++; j1++; }
    // 左端を縮める
    while(j0<j1 && dists[j0] < left){ sum -= elevs[j0]; cnt--; j0++; }
    out[i] = cnt>0 ? sum/cnt : elevs[i];
  }
  return out;
}


// 標高を計算して表示（なければスキップ）
async function renderElevation(rec){
  const svg = document.getElementById('elevChart');
  const stats = document.getElementById('elevStats');
  if(!svg || !stats) return;

  // 既に ele を持っているデータ形式にも対応（rec.points[i].ele）
  let elevs = Array.isArray(rec.points) && rec.points.every(p=>Number.isFinite(p.ele))
    ? rec.points.map(p=>p.ele)
    : null;

  if(!elevs){
    elevs = await fetchElevations(rec.points);
    if(!elevs){ stats.textContent = '標高取得できませんでした（オフライン/レート/拒否）'; return; }
  }
  if(elevs.length < 2){ stats.textContent='標高データ不足'; return; }

  const { up, down } = sumGainLoss(elevs, 2);
  const totalDistKm = (rec.distanceM || 0) / 1000;
  const avgGrade = (totalDistKm>0) ? ((elevs[elevs.length-1]-elevs[0]) / (totalDistKm*1000) * 100) : 0;

  stats.textContent = `総上昇量 ${up} m ／ 総下降量 ${down} m ／ 平均勾配 ${avgGrade.toFixed(1)} %`;

  const dists = cumDistances(rec.points);
  const elevSmooth = smoothByDistance(elevs, dists, 200); // ← 200m窓。好みで150/300に

  drawElevationSVG(svg, elevs, rec.points);
}


async function main(){
  const id = readId();
  $('#backBtn')?.addEventListener('click', ()=> history.back());
  $('#shareBtn')?.addEventListener('click', ()=> {
    const url = `${location.origin}${location.pathname}?id=${encodeURIComponent(id||'')}`;
    if(navigator.share){
      navigator.share({ title: document.title, url }).catch(()=>{});
    }else{
      navigator.clipboard?.writeText(url).then(()=> toast('URLをコピーしました'))
        .catch(()=> prompt('下のURLをコピーしてください', url));
    }
  });
  if(!id){ toast('idが指定されていません'); return; }
  const raw = await getRecord(id);
  if(!raw){ toast('データが見つかりません'); return; }
  const rec = normalize(raw);
  $('#name').textContent = rec.name;
  $('#createdAt').textContent = fmtDateTime(rec.createdAt);
  const km = toKm(rec.distanceM);
  $('#distance').textContent = Number.isFinite(km) ? `${km.toFixed(2)} km` : '—';
  const dur = rec.durationSec;
  $('#duration').textContent = fmtDuration(dur);
  let speed = null;
  if(dur && dur > 0 && Number.isFinite(km)){
    const hours = dur / 3600;
    speed = km / hours;
  }
  $('#speed').textContent = (speed && Number.isFinite(speed)) ? `${speed.toFixed(2)} km/h` : '—';
  $('#openInApp')?.setAttribute('href', `index.html#run?id=${encodeURIComponent(rec.id)}`);
  drawMap(rec.points, rec.bbox);

    // ★標高プロファイルを描画（追加部分）
  await renderElevation(rec);

}
main();
