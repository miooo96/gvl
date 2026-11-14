/* Offline-Speicher der GVL-App. Netz zuerst, Zwischenspeicher nur ohne Netz (Lehre vom 05.09.2026:
   nie eine alte Fassung, solange Empfang besteht). Gespeichert wird nur das Programm – Kundendaten liegen in IndexedDB.
   Bei jeder Programmänderung CACHE hochzählen. */
const CACHE = "gvl-v12";
const DATEIEN = [
  "./", "index.html", "app.css", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
  "js/werte.js", "js/tourdatei.js", "js/speicher.js", "js/daten.js", "js/zip.js", "js/pdf.js", "js/tourpdf.js", "js/sicherung.js", "js/teilen.js",
  "js/ui/app.js", "js/ui/hilfe.js",
  "js/ui/touren.js",
  "js/bild.js",
  "js/ui/liste.js",
  "js/ui/akte.js",
  "js/ui/kundenform.js",
  "js/ui/foto.js",
  "js/ui/rundgang.js",
  "beispiel/tour-11.json",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (ev) => {
  ev.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (ev) => {
  if (ev.request.method !== "GET") return;
  const r = ev.request;
  const netz = r.mode === "navigate" ? fetch(r.url, { cache: "no-cache" }).then((a) => (a.redirected ? fetch(r) : a)) : fetch(r, { cache: "no-cache" });
  ev.respondWith(netz.then((antwort) => {
    if (antwort.ok && antwort.status === 200) {   // nur gute Antworten in den Offline-Speicher
      const kopie = antwort.clone();
      caches.open(CACHE).then((c) => c.put(r, kopie)).catch(() => {});
    }
    return antwort;
  }).catch(() => caches.match(r).then((t) => t || caches.match("index.html"))));
});
