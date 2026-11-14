/* Tourdatei prüfen und mit dem Gerätestand abgleichen. Reine Funktionen, kein Speicherzugriff. */
import { FELD_NAMEN, LAGEN, ANZAHL_TOUREN } from "./werte.js";

export function pruefeTourdatei(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, fehler: ["Die Datei enthält keine Tourdaten."] };
  const fehler = [];
  if (obj.format !== "gvl-tour") fehler.push("Das ist keine Tourdatei (Feld „format“ fehlt oder ist falsch).");
  if (obj.version !== 1) fehler.push("Unbekannte Fassung der Tourdatei.");
  if (!Number.isInteger(obj.tour) || obj.tour < 1 || obj.tour > ANZAHL_TOUREN) fehler.push(`Tournummer fehlt oder liegt nicht zwischen 1 und ${ANZAHL_TOUREN}.`);
  if (!Array.isArray(obj.kunden)) fehler.push("Feld „kunden“ fehlt.");
  else obj.kunden.forEach((k, i) => {
    if (!k || typeof k !== "object") { fehler.push(`Kunde ${i + 1}: kein gültiger Eintrag.`); return; }
    if (!String(k.kdNr ?? "").trim()) fehler.push(`Kunde ${i + 1}: Kd-Nr. fehlt.`);
    if (!String(k.name1 ?? "").trim()) fehler.push(`Kunde ${i + 1}: Name-1 fehlt.`);
    if (k.lage && !LAGEN.includes(k.lage)) fehler.push(`Kunde ${i + 1}: Innen/Außen ist „${k.lage}“.`);
  });
  if (fehler.length) return { ok: false, fehler };
  const kunden = obj.kunden.map((k) => Object.fromEntries(FELD_NAMEN.map((f) => [f, String(k[f] ?? "").trim()])));
  return { ok: true, fehler: [], tour: { nr: obj.tour, stand: String(obj.stand ?? ""), kunden } };
}

export function schluesselListe(nr, kunden) {
  const proKd = {};
  kunden.forEach((k) => { proKd[k.kdNr] = (proKd[k.kdNr] || 0) + 1; });
  const vergeben = {};
  return kunden.map((k) => {
    let id = `t${nr}:${k.kdNr}` + (proKd[k.kdNr] > 1 ? `:${k.autNr}` : "");
    vergeben[id] = (vergeben[id] || 0) + 1;
    if (vergeben[id] > 1) id += `#${vergeben[id]}`;
    return id;
  });
}

/* Die Kennung trägt die Aut-Nr. nur, wenn die Kd-Nr. mehrfach vorkommt – kommt ein zweiter Automat beim selben Kunden
   dazu oder fällt weg, ändert sie sich (t3:D1 ↔ t3:D1:A1). Derselbe Automat (gleiche Kd-Nr. und Aut-Nr.) zieht dann um:
   umzug nennt alte und neue Kennung, damit Fotos und Notizen mitkommen. */
export function abgleich(vorhandene, tour) {
  const ids = schluesselListe(tour.nr, tour.kunden);
  const alt = new Map(vorhandene.filter((k) => k.quelle === "liste").map((k) => [k.id, k]));
  const neu = new Set(ids);
  const frei = [...alt.values()].filter((k) => !neu.has(k.id));   // nicht mehr unter ihrer Kennung in der Liste
  const umzug = [];
  let anzahlNeu = 0;
  const schreiben = tour.kunden.map((k, i) => {
    let vorher = alt.get(ids[i]);
    if (!vorher) {
      const j = frei.findIndex((a) => a.kdNr === k.kdNr && a.autNr === k.autNr);
      if (j >= 0) { vorher = frei.splice(j, 1)[0]; umzug.push({ von: vorher.id, nach: ids[i] }); }
      else anzahlNeu++;
    }
    return { ...(vorher || {}), ...k, id: ids[i], tour: tour.nr, quelle: "liste", pos: i, nichtInListe: false };
  });
  const fehlend = frei.map((k) => ({ ...k, nichtInListe: true }));
  return { schreiben: [...schreiben, ...fehlend], anzahlNeu, anzahlFehlend: fehlend.length, umzug };
}
