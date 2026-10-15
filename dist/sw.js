// 오프라인용 캐시: 한 번 연 파일은 저장해 두고, 인터넷이 없으면 저장본을 써요.
const CACHE = 'usual-saviors-v2';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
// 그림·소리는 저장본을 바로 보여 주고 뒤에서 새 파일로 갈아 둬요. 나머지는 인터넷 먼저.
const MEDIA = /\.(webp|png|jpe?g|mp3|ogg|svg)$/i;
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (MEDIA.test(new URL(req.url).pathname)) {
      const hit = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req).then(res => { if (res.status === 200) cache.put(req, res.clone()).catch(() => { }); return res; });
      if (hit) { e.waitUntil(fresh.catch(() => { })); return hit; }
      return fresh;
    }
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
