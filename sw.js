// オフライン用。ファイルを変えたら VERSION を上げる。
const VERSION = 'levelup-v3';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'fonts/orbitron.woff2',
  'icons/icon-180.png', 'icons/icon-512.png',
  'js/app.js', 'js/store.js',
  'js/logic/dates.js', 'js/logic/leveling.js', 'js/logic/penalty.js', 'js/logic/recovery.js',
  'js/logic/recovery-pool.js', 'js/logic/engine.js',
  'js/ui/util.js', 'js/ui/home.js', 'js/ui/quests.js', 'js/ui/record.js', 'js/ui/settings.js',
  'js/ui/editor.js', 'js/ui/fx.js', 'js/ui/drag.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// キャッシュ優先。ネットにつながっていれば裏で最新に入れ替える。
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => null);
    return hit ?? (await net) ?? new Response('オフラインです', { status: 503 });
  }));
});
