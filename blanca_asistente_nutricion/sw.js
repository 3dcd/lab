const CACHE='blanca-almuerzo-previews-v3';
const ASSETS=[
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './images/almuerzo/almuerzo_01_thumb.jpg',
  './images/almuerzo/almuerzo_01.jpg',
  './images/almuerzo/almuerzo_02_thumb.jpg',
  './images/almuerzo/almuerzo_02.jpg',
  './images/almuerzo/almuerzo_03_thumb.jpg',
  './images/almuerzo/almuerzo_03.jpg',
  './images/almuerzo/almuerzo_04_thumb.jpg',
  './images/almuerzo/almuerzo_04.jpg',
  './images/almuerzo/almuerzo_05_thumb.jpg',
  './images/almuerzo/almuerzo_05.jpg',
  './images/almuerzo/almuerzo_06_thumb.jpg',
  './images/almuerzo/almuerzo_06.jpg',
  './images/almuerzo/almuerzo_07_thumb.jpg',
  './images/almuerzo/almuerzo_07.jpg',
  './images/almuerzo/almuerzo_08_thumb.jpg',
  './images/almuerzo/almuerzo_08.jpg',
  './images/almuerzo/almuerzo_09_thumb.jpg',
  './images/almuerzo/almuerzo_09.jpg',
  './images/almuerzo/almuerzo_10_thumb.jpg',
  './images/almuerzo/almuerzo_10.jpg',
  './images/almuerzo/almuerzo_11_thumb.jpg',
  './images/almuerzo/almuerzo_11.jpg',
  './images/almuerzo/almuerzo_12_thumb.jpg',
  './images/almuerzo/almuerzo_12.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
