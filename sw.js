const CACHE = "phomemo-d30-v1";

// Local assets — pre-cached on install so the app works fully offline
const LOCAL_ASSETS = [
	"/",
	"/index.html",
	"/index.js",
	"/index.css",
	"/src/printer.js",
	"/manifest.json",
	"/icon.svg",
	"/icon-maskable.svg",
];

// CDN assets — also pre-cached so the app works without internet access
const CDN_ASSETS = [
	"https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.3/css/bootstrap.min.css",
	"https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.3/js/bootstrap.min.js",
	"https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js",
	"https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.1/qrcode.min.js",
	"https://cdn.jsdelivr.net/npm/canvas-txt@4.1.1/+esm",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll([...LOCAL_ASSETS, ...CDN_ASSETS]))
	);
	// Activate immediately without waiting for existing tabs to close
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	// Remove any caches from older versions
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
			)
	);
	self.clients.claim();
});

self.addEventListener("fetch", (event) => {
	// Only handle GET requests
	if (event.request.method !== "GET") return;

	event.respondWith(
		caches.match(event.request).then((cached) => {
			// Serve from cache, fall back to network
			return cached ?? fetch(event.request);
		})
	);
});
