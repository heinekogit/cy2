// キャッシュ名にバージョンを付与（更新時は変更する）
const CACHE_NAME = 'app-cache-v1';

// インストール時（skipWaitingで即時反映）
self.addEventListener('install', event => {
  self.skipWaiting(); // 新しいSWがすぐにアクティブになる
});

// アクティベート時（古いキャッシュを削除し、即時反映）
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim()) // すぐに制御を引き継ぐ
  );
});

// ネットワーク優先で取得（キャッシュはフォールバック）
self.addEventListener('fetch', event => {
  const req = event.request;
  event.respondWith(
    fetch(req)
      .then(res => {
        // 成功したらキャッシュにも保存
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req)) // オフライン時だけキャッシュ
  );
});
