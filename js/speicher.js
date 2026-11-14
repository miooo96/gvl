/* Gerätespeicher (IndexedDB) der GVL-App.
   ⛔ Kundendaten NIE im Web-Speicher des Browsers (Schlüssel-Wert-Ablage) – sie bleiben in dieser Datenbank auf dem Gerät.
   Bilddateien liegen getrennt („fotodaten"), damit Listen und Zählungen keine Bilder laden.
   Version 2: „einstellungen“ (z. B. ob der Rundgang schon angeboten wurde). Beim Hochzählen werden nur fehlende Bereiche angelegt –
   vorhandene Kunden, Fotos und Notizen bleiben unberührt. */
const NAME = "gvl-app", VERSION = 2;
const BEREICHE = {
  touren: { key: "nr", indizes: [] },
  kunden: { key: "id", indizes: ["tour"] },
  fotos: { key: "id", indizes: ["kunde", "tour"] },
  fotodaten: { key: "id", indizes: [] },
  notizen: { key: "id", indizes: ["kunde", "tour"] },
  einstellungen: { key: "k", indizes: [] },
};
let offen = null;
const anfrage = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export function oeffnen() {
  if (offen) return offen;
  offen = new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const [name, b] of Object.entries(BEREICHE)) {
        if (db.objectStoreNames.contains(name)) continue;
        const s = db.createObjectStore(name, { keyPath: b.key });
        b.indizes.forEach((i) => s.createIndex(i, i));
      }
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => { db.close(); offen = null; };
      db.onclose = () => { offen = null; };   // vom Browser geschlossen (z. B. Speicher geräumt) – beim nächsten Zugriff neu öffnen
      res(db);
    };
    r.onerror = () => { offen = null; rej(r.error); };
  });
  return offen;
}
const lesend = async (bereich) => (await oeffnen()).transaction(bereich).objectStore(bereich);
export async function alle(bereich) { return anfrage((await lesend(bereich)).getAll()); }
export async function holen(bereich, schluessel) { return anfrage((await lesend(bereich)).get(schluessel)); }
export async function nachIndex(bereich, index, wert) { return anfrage((await lesend(bereich)).index(index).getAll(wert)); }

async function aendern(bereich, tun) {
  const db = await oeffnen();
  return new Promise((res, rej) => {
    const t = db.transaction(bereich, "readwrite");
    t.oncomplete = () => res();
    t.onerror = (e) => rej(e.target.error || t.error || new Error("Speichern fehlgeschlagen"));
    t.onabort = () => rej(t.error || new Error("Speichern abgebrochen"));
    try { tun(t.objectStore(bereich)); } catch (e) { try { t.abort(); } catch { /* schon beendet */ } rej(e); }
  });
}
export function schreiben(bereich, ...objekte) { return aendern(bereich, (s) => objekte.forEach((o) => s.put(o))); }
export function entfernen(bereich, ...schluessel) { return aendern(bereich, (s) => schluessel.forEach((k) => s.delete(k))); }

export async function dauerhaftAnfordern() {
  try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch { return false; }
}
export async function zuruecksetzenFuerTests() {
  if (offen) { (await offen).close(); offen = null; }
  await anfrage(indexedDB.deleteDatabase(NAME));
}
