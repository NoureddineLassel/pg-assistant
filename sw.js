/* عامل الخدمة: يجعل البرنامج يعمل دون اتصال بالإنترنت بعد أول فتح */
const CACHE = "pg-assistant-v15";
const CORE = ["./", "index.html", "styles.css", "data.js", "i18n.js", "themes.js", "app.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/logo.png", "icons/icon-64.png", "vendor/fonts/fonts.css", "icons/icon-apple-180.png", "icons/icon-apple-152.png", "icons/icon-apple-167.png", "icons/icon-apple-1024.png", "vendor/pdfjs/pdf.min.js", "vendor/pdfjs/pdf.worker.min.js"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(CORE);
    /* كل ملفات الخطوط المذكورة في fonts.css حتى يعمل البرنامج بخطوطه دون اتصال من أول تثبيت */
    const css = await (await fetch("vendor/fonts/fonts.css")).text();
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => "vendor/fonts/" + m[1]);
    await c.addAll(urls);
  }));
  self.skipWaiting();
});
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  /* الشبكة أولا حتى تصل التحديثات فورا، والنسخة المخزنة عند انقطاع الاتصال */
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok || res.type === "opaque") { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
    return res;
  }).catch(() => caches.match(e.request)));
});
