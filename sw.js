/* ABD Sekolah - Service Worker (mode offline)
   Strategi:
   - Halaman aplikasi : jaringan dulu (maks 4 detik), jika gagal pakai salinan tersimpan
   - Aset & pustaka   : cache dulu, lalu perbarui di latar belakang
   - Supabase (API)   : tidak disentuh; ditangani aplikasi (data lokal + antrean sinkron)
   Naikkan nomor VERSI bila ingin memaksa pembaruan cache. */
const VERSI = 'abd-v2';
const LOKAL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-512-maskable.png'];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSI);
    await Promise.all(LOKAL.map(async u => {
      try { const r = await fetch(u, { cache: 'reload' }); if (r.ok) await c.put(u, r); } catch (_) {}
    }));
    await Promise.all(CDN.map(async u => {
      try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await c.put(u, r); } catch (_) {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSI) await caches.delete(k);
    await self.clients.claim();
  })());
});

const timeout = (p, ms) => new Promise((ok, no) => {
  const t = setTimeout(() => no(new Error('timeout')), ms);
  p.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); no(e); });
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return;

  // Halaman utama
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(VERSI);
      try {
        const r = await timeout(fetch(req), 4000);
        if (r.ok) c.put(req, r.clone());
        return r;
      } catch (_) {
        return (await c.match(req, { ignoreSearch: true })) ||
               (await c.match('./index.html')) ||
               (await c.match('./')) ||
               new Response('Aplikasi belum tersimpan untuk mode offline. Buka sekali saat online.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // Aset lain: cache dulu, perbarui di latar belakang
  const sama = url.origin === self.location.origin || url.hostname === 'cdnjs.cloudflare.com';
  if (!sama) return;
  e.respondWith((async () => {
    const c = await caches.open(VERSI);
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || new Response('', { status: 504 });
  })());
});
