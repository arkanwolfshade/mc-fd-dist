// Keeps the app's own files available during an outage. It never touches /api, so
// data is always live, and writes during an outage are handled by the outbox.
const CACHE = "shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);

  // Script and style names change with each build, so read them from the page.
  const page = await (await cache.match("/")).text();
  const assets = [...page.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
  await cache.addAll(assets);
  await precacheFonts(cache, assets);
}

// Fonts are named in the stylesheet, not the page, so without this an offline reload right after
// the first visit shows the fallback font. A browser that supports woff2 never asks for the
// .woff copies. One that fails to load is skipped, so it can never stop the app being installed.
async function precacheFonts(cache, assets) {
  const sheets = assets.filter((asset) => asset.endsWith(".css"));
  const texts = await Promise.all(sheets.map(async (sheet) => (await cache.match(sheet)).text()));
  const fonts = texts.flatMap((css) =>
    [...css.matchAll(/url\((\/assets\/[^)]+\.woff2)\)/g)].map((match) => match[1]),
  );
  await Promise.allSettled(fonts.map((font) => cache.add(font)));
}

async function removeOldCaches() {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
}

// The newest page when online, so that updates arrive on the next load.
async function pageFirstFromNetwork() {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch("/");
    if (response.ok) await cache.put("/", response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match("/");
    if (cached) return cached;
    throw error;
  }
}

// Build files have unique names, so a cached copy is always correct.
async function fileFromCacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(removeOldCaches().then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    request.mode === "navigate" ? pageFirstFromNetwork() : fileFromCacheFirst(request),
  );
});
