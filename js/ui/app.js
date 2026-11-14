/* Einstieg und Wegweiser. Drei Ebenen über die Adresse (#/…), damit die Android-Zurück-Taste genau eine Ebene zurückgeht. */
import { dauerhaftAnfordern } from "../speicher.js";
import { ebeneZu, meldung } from "./hilfe.js";
import { begruessen } from "./rundgang.js";

const WEGE = [
  [/^#\/?$/, () => import("./touren.js").then((m) => m.ansichtTouren())],
  [/^#\/tour\/(\d+)$/, (t) => import("./liste.js").then((m) => m.ansichtListe(Number(t[1])))],
  [/^#\/kunde\/(.+)$/, (t) => import("./akte.js").then((m) => m.ansichtAkte(decodeURIComponent(t[1])))],
  [/^#\/foto\/(.+)$/, (t) => import("./foto.js").then((m) => m.ansichtFoto(decodeURIComponent(t[1])))],
  [/^#\/neu\/(\d+)$/, (t) => import("./kundenform.js").then((m) => m.ansichtKundenform({ tour: Number(t[1]) }))],
  [/^#\/bearbeiten\/(.+)$/, (t) => import("./kundenform.js").then((m) => m.ansichtKundenform({ id: decodeURIComponent(t[1]) }))],
];
const scrollStand = new Map();
let aktuell = null, lauf = 0, zuletztFertig = 0, begruessungGeprueft = false;

async function zeigen() {
  const nr = ++lauf;   // jede Navigation bekommt eine Nummer – nur die neueste darf die Seite bestimmen
  if (aktuell) scrollStand.set(aktuell, window.scrollY);
  ebeneZu();
  const h = location.hash || "#/";
  try {
    for (const [muster, ansicht] of WEGE) {
      const t = h.match(muster);
      if (!t) continue;
      await ansicht(t);
      if (nr !== lauf) { if (zuletztFertig === lauf) zeigen(); return; }   // veraltet: neuere Ansicht ggf. neu zeichnen
      // Erster Start: Begrüßung mit Angebot des Rundgangs – steht schon, wenn die Ansicht als bereit gilt
      if (!begruessungGeprueft && muster === WEGE[0][0]) {
        begruessungGeprueft = await begruessen(() => nr === lauf);
        if (nr !== lauf) { if (zuletztFertig === lauf) zeigen(); return; }
      }
      aktuell = h; zuletztFertig = nr;
      window.scrollTo(0, scrollStand.get(h) || 0);
      document.body.dataset.bereit = h;
      return;
    }
    location.replace("#/");
  } catch (e) {
    if (nr !== lauf) return;
    meldung("Ansicht konnte nicht geöffnet werden: " + (e && e.message ? e.message : String(e)), { ms: 10000 });
    if (h !== "#/") location.replace("#/");
  }
}
window.addEventListener("hashchange", zeigen);
zeigen();
dauerhaftAnfordern();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
