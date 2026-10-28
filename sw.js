// Service worker d'«A taula!»: l'app funciona sense connexió i pot mostrar avisos amb l'app tancada.
// Sempre es fa servir la versió més nova si hi ha internet; sense, la que es va guardar l'últim cop.
const CACHE = "a-taula-v1";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); } return res; })
    .catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match("index.html"))));
});
// En tocar un avís, s'obre (o es porta al davant) l'app
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(L => { const w = L.find(c => "focus" in c); return w ? w.focus() : self.clients.openWindow("./"); }));
});
// Chrome desperta el service worker de tant en tant (només amb l'app instal·lada): si ja és l'hora d'un avís i no s'ha mostrat, es mostra
self.addEventListener("periodicsync", e => { if (e.tag === "avisos") e.waitUntil(checkAvisos()); });
function db() { return new Promise((res, rej) => { const q = indexedDB.open("a-taula-avisos", 1); q.onupgradeneeded = () => q.result.createObjectStore("k"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function get(k) { const d = await db(); return new Promise(res => { const t = d.transaction("k").objectStore("k").get(k); t.onsuccess = () => { res(t.result); d.close(); }; t.onerror = () => { res(null); d.close(); }; }); }
async function set(k, v) { const d = await db(); return new Promise(res => { const t = d.transaction("k", "readwrite").objectStore("k").put(v, k); t.onsuccess = () => { res(true); d.close(); }; t.onerror = () => { res(false); d.close(); }; }); }
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
async function checkAvisos() {
  const pla = await get("pla"); if (!pla?.on) return;
  const now = new Date(), ds = iso(now), day = pla.days?.[ds]; if (!day) return;
  const vist = (await get("vist")) || {};
  for (const kind of ["mati", "vespre"]) {
    const [h, m] = String(day.t?.[kind] || "").split(":").map(Number), at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0), key = `${ds}|${kind}`;
    if (vist[key] || now < at || !day[kind] || (kind === "mati" && now - at > 6 * 3600e3)) continue;
    vist[key] = 1; await set("vist", vist);
    const txt = kind === "vespre" ? { title: "Abans d'anar a dormir: revisa les tasques d'avui", body: day.vespre.body } : day.mati;
    await self.registration.showNotification(txt.title, { body: txt.body, tag: "avis-" + kind, icon: "icon-192.png", badge: "icon-192.png", lang: "ca" });
  }
}
