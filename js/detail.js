// detail.js (unified version) — reads "logs" from IndexedDB (route_mvp) with fallbacks
// This file is standalone (no import). It will:
// 1) read ?id=... from URL or sessionStorage.detailId
// 2) open IndexedDB: db 'route_mvp', store 'logs' (as used by index.html)
// 3) fallback to localStorage 'logs' (JSON array)
// 4) as last fallback, try legacy storage.js ('tracks' store) if present

const $ = s => document.querySelector(s);

function toast(msg){
  const el = document.getElementById('debug');
  if(el){ el.hidden=false; el.textContent = String(msg); }
  else alert(msg);
}

function getDetailId(){
  const sp = new URLSearchParams(location.search);
  const qid = sp.get('id');
  if(qid) return qid;
  const sid = sessionStorage.getItem('detailId');
  if(sid) return sid;
  return null;
}

function decodePolyline(str){
  if(!str) return [];
  let index=0, lat=0, lng=0, coords=[];
  while(index<str.length){
    let b, shift=0, result=0;
    do{ b=str.charCodeAt(index++)-63; result |= (b & 0x1f) << shift; shift+=5 } while(b>=0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    shift=0; result=0;
    do{ b=str.charCodeAt(index++)-63; result |= (b & 0x1f) << shift; shift+=5 } while(b>=0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat; lng += dlng;
    coords.push([lat/1e5, lng/1e5]);
  }
  return coords;
}

function fmtDateISO(iso){ try{ return new Date(iso).toLocaleString(); }catch{ return '—'; } }
function km(m){ return (m/1000).toFixed(2); }

function openIDB(){
  return new Promise((resolve)=>{
    if(!('indexedDB' in window)) return resolve(null);
    const req = indexedDB.open('route_mvp', 1);
    req.onupgradeneeded = (e)=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains('logs')){
        db.createObjectStore('logs', { keyPath: 'id' });
      }
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> resolve(null);
  });
}

async function idbGet(store, key){
  const db = await openIDB();
  if(!db) return null;
  return await new Promise((res)=>{
    const tx = db.transaction(store, 'readonly');
    const st = tx.objectStore(store);
    const q = st.get(key);
    q.onsuccess = ()=> res(q.result || null);
    q.onerror = ()=> res(null);
  });
}

function lsGetLogs(){
  try{
    const raw = localStorage.getItem('logs');
    return raw ? JSON.parse(raw) : [];
  }catch{ return []; }
}

async function legacyStorageGet(id){
  // optional: if legacy storage.js exists (tracks store), try it
  try{
    // dynamic import if available
    if(!window.__legacy_get){
      const mod = await import('./storage.js');
      window.__legacy_get = mod.get;
    }
    if(window.__legacy_get){
      return await window.__legacy_get(id);
    }
  }catch(_e){}
  return null;
}

async function getRecordById(id){
  // 1) IndexedDB logs
  let rec = await idbGet('logs', id);
  if(rec) return rec;

  // 2) localStorage logs (array)
  const arr = lsGetLogs();
  rec = arr.find(x=>x.id===id);
  if(rec) return rec;

  // 3) legacy storage.js (tracks)
  rec = await legacyStorageGet(id);
  if(rec) return rec;

  return null;
}

function setText(sel, v){
  const el = $(sel);
  if(el) el.textContent = v ?? '—';
}

function drawMap(rec){
  const map = L.map('map');
  let latlngs = [];

  if(rec.polyline){
    latlngs = decodePolyline(rec.polyline).map(([lat,lng])=> [lat,lng]);
  }else if(Array.isArray(rec.points) && rec.points.length){
    latlngs = rec.points.map(p=> [p.lat, p.lng]);
  }

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);

  if(latlngs.length>=2){
    const line = L.polyline(latlngs, { weight:5 }).addTo(map);
    map.fitBounds(line.getBounds(), { padding:[24,24] });
  }else if(latlngs.length===1){
    map.setView(latlngs[0], 16);
    L.marker(latlngs[0]).addTo(map);
  }else if(rec.bbox && Array.isArray(rec.bbox) && rec.bbox.length===4){
    const [[s,w],[n,e]] = [[rec.bbox[1], rec.bbox[0]],[rec.bbox[3], rec.bbox[2]]];
    map.fitBounds([[s,w],[n,e]], { padding:[24,24] });
  }else{
    map.setView([35.6812,139.7671], 13); // fallback: Tokyo
  }
}

async function main(){
  const id = getDetailId();
  if(!id){ toast('idが指定されていません'); return; }

  const rec = await getRecordById(id);
  if(!rec){ toast('データが見つかりません'); return; }

  // meta
  setText('#name', rec.name || rec.title || rec.id);
  setText('#createdAt', rec.endedAt ? fmtDateISO(rec.endedAt) : (rec.createdAt ? fmtDateISO(rec.createdAt) : '—'));

  const distM = rec.distanceMeters ?? rec.distanceM ?? null;
  setText('#distance', (typeof distM==='number') ? `${km(distM)} km` : '—');

  const tags = (rec.meta && rec.meta.tags) ? rec.meta.tags : (rec.tags || []);
  const $tags = document.getElementById('tags');
  if($tags && Array.isArray(tags)){
    for(const t of tags){
      const chip = document.createElement('span');
      chip.className='chip';
      chip.textContent = t;
      $tags.appendChild(chip);
    }
  }

  // actions
  const openInApp = document.getElementById('openInApp');
  if(openInApp){
    openInApp.href = `index.html#replay=${encodeURIComponent(id)}`;
    openInApp.onclick = (e)=>{ /* allow default navigation */ };
  }

  // map
  drawMap(rec);

  // share
  const shareBtn = document.getElementById('shareBtn');
  if(shareBtn){
    shareBtn.addEventListener('click', async ()=>{
      const url = `${location.origin}${location.pathname}?id=${encodeURIComponent(id)}`;
      try{
        if(navigator.share){
          await navigator.share({ title: rec.name||'実走ログ', text:'Run log', url });
        }else{
          await navigator.clipboard.writeText(url);
          toast('URLをコピーしました');
        }
      }catch(e){
        await navigator.clipboard.writeText(url);
        toast('URLをコピーしました');
      }
    });
  }

  // back
  const backBtn = document.getElementById('backBtn');
  if(backBtn){
    backBtn.onclick = ()=> history.length>1 ? history.back() : (location.href='index.html');
  }
}

document.addEventListener('DOMContentLoaded', main);
