// Lifemaxx AI — Service Worker
// Strategy: cache-first with background revalidation (stale-while-revalidate)
// Supabase API calls always bypass the cache.

const CACHE_NAME = 'lifemaxx-v1';

const PRECACHE_LOCAL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
];

const PRECACHE_CDN = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap',
];

// ── Install: pre-cache everything ──────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting(); // activate immediately without waiting for old SW to die
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Local files must succeed
      await cache.addAll(PRECACHE_LOCAL);
      // CDN files: best-effort (don't fail install if a CDN is slow)
      await Promise.allSettled(
        PRECACHE_CDN.map(url =>
          fetch(url)
            .then(res => { if (res.ok) cache.put(url, res); })
            .catch(() => {})
        )
      );
    })
  );
});

// ── Activate: claim clients, delete stale caches ───────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      ),
    ])
  );
});

// ── Fetch: stale-while-revalidate ──────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache Supabase API or auth calls — always hit the network
  if (url.hostname.includes('supabase.co')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(request);

      // Kick off a network fetch to keep cache fresh
      const fresh = fetch(request)
        .then(res => {
          if (res && res.status === 200) cache.put(request, res.clone());
          return res;
        })
        .catch(() => null);

      // Return cached version instantly; if nothing cached, wait for network
      return cached ?? (await fresh) ?? new Response('Offline — open the app while connected first.', { status: 503 });
    })
  );
});
