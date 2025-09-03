// IndexedDB: route_mvp / tracks
const DB_NAME = 'route_mvp';
const STORE = 'tracks';

function withDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function get(id) {
  try {
    const db = await withDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const st = tx.objectStore(STORE);
      const q = st.get(id);
      q.onsuccess = () => resolve(q.result || null);
      q.onerror = () => reject(q.error);
    });
  } catch (e) {
    // fallback
    const raw = localStorage.getItem('route_mvp_tracks');
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return arr.find(r => r.id === id) || null;
  }
}

export async function getAll() {
  try {
    const db = await withDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const st = tx.objectStore(STORE);
      const q = st.getAll();
      q.onsuccess = () => resolve(q.result || []);
      q.onerror = () => reject(q.error);
    });
  } catch (e) {
    const raw = localStorage.getItem('route_mvp_tracks');
    if (!raw) return [];
    return JSON.parse(raw);
  }
}
