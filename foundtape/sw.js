/* Found Tape — Offline-Cache. Alles liegt lokal, das Spiel läuft ohne Netz. */
const CACHE = 'foundtape-v3';
const FILES = [
  './', './index.html', './game.js', './manifest.webmanifest',
  './lib/three.min.js', './lib/GLTFLoader.js',
  './assets/wall.jpg', './assets/wall2.jpg', './assets/floor.jpg',
  './assets/photo.jpg', './assets/monster.glb',
  './assets/music/tracks.json', './assets/music/handprint.mp3',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Spielcode und Seite immer zuerst aus dem Netz holen: sonst spielt man nach
  // einer Aktualisierung weiter die alte Fassung aus dem Zwischenspeicher.
  const istCode = /\.(html|js|json|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');
  if(istCode){
    e.respondWith(
      fetch(e.request).then(res => {
        if(res.status === 200 && res.type === 'basic'){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
        }
        return res;
      }).catch(() => caches.match(e.request, { ignoreSearch:true })
                        .then(hit => hit || caches.match('./index.html')))
    );
    return;
  }
  // Texturen, Modell und Musik ändern sich kaum: erst der Zwischenspeicher
  e.respondWith(
    caches.match(e.request, { ignoreSearch:true }).then(hit => hit || fetch(e.request).then(res => {
      if(res.status === 200 && res.type === 'basic'){
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      }
      return res;
    }))
  );
});
