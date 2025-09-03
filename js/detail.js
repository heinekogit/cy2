import { get } from './storage.js';

const $ = s => document.querySelector(s);
const fmtDate = ms => new Date(ms).toLocaleString();

function haversine(lat1,lng1,lat2,lng2){
  const R=6371000; const toRad=x=>x*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function totalDistance(points){
  if(!points || points.length<2) return 0;
  let sum=0; for(let i=1;i<points.length;i++){
    const a=points[i-1], b=points[i];
    sum += haversine(a.lat,a.lng,b.lat,b.lng);
  } return sum;
}

function readId(){
  const u = new URL(location.href);
  return u.searchParams.get('id') || (location.hash.startsWith('#id=') ? location.hash.slice(4) : null);
}

function chip(text){
  const el = document.createElement('span');
  el.className='chip'; el.textContent=text; return el;
}

function copy(text){
  navigator.clipboard?.writeText(text).then(()=>{
    toast('URLをコピーしました');
  }).catch(()=>{
    prompt('下のURLを手動でコピーしてください', text);
  });
}

function toast(msg){
  const hint = $('#hint');
  hint.textContent = msg; hint.hidden = false;
  setTimeout(()=> hint.hidden = true, 2200);
}

async function main(){
  const id = readId();
  $('#backBtn').addEventListener('click', ()=> history.back());
  $('#shareBtn').addEventListener('click', ()=> {
    const url = `${location.origin}${location.pathname}?id=${encodeURIComponent(id)}`;
    copy(url);
  });

  if(!id){ toast('idが指定されていません'); return; }
  const rec = await get(id);
  if(!rec){ toast('データが見つかりません'); return; }

  // meta
  $('#name').textContent = rec.name || rec.id;
  $('#createdAt').textContent = rec.createdAt ? fmtDate(rec.createdAt) : '—';
  const dist = rec.distanceM ?? totalDistance(rec.points||[]);
  $('#distance').textContent = dist ? `${(dist/1000).toFixed(2)} km` : '—';
  const tags = (rec.meta?.tags)||[]; tags.forEach(t=> $('#tags').appendChild(chip(t)));
  $('#openInApp').href = `index.html#run?id=${encodeURIComponent(id)}`;

  // map
  const map = L.map('map', { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OSM' }).addTo(map);

  const pts = rec.points || [];
  if(pts.length===0){
    toast('表示できる位置データがありません');
    map.setView([35.681236,139.767125], 12); // fallback: Tokyo
    return;
  }
  if(pts.length===1){
    const p = pts[0];
    L.marker([p.lat,p.lng]).addTo(map);
    map.setView([p.lat,p.lng], 16);
    toast('1点のみ：マーカー表示');
    return;
  }
  // 2点以上 → ライン表示
  const latlngs = pts.map(p=> [p.lat,p.lng]);
  const poly = L.polyline(latlngs, { color:'#4cc9f0', weight:4, opacity:0.9 }).addTo(map);
  map.fitBounds(poly.getBounds(), { padding:[20,20] });
}

main();
