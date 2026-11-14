/* Sicherung je Tour: ZIP mit tour.json (Stammdaten, Notizen, Foto-Angaben samt Maßen) und fotos/<id>.jpg.
   Einspielen überschreibt nie und legt nichts doppelt an – vorhandene Einträge werden übersprungen. */
import { zipBauen, zipLesen } from "./zip.js";
import * as S from "./speicher.js";
import { heute, tourDatei, FELD_NAMEN, ANZAHL_TOUREN } from "./werte.js";

export const FORMAT = "gvl-sicherung";

/* Baut nur die Datei. Das Datum steht in tour.json (kommt beim Wiederherstellen mit) – auf dem Handy vermerkt wird
   es erst mit sicherungVermerken, wenn die Datei geteilt oder im Download-Ordner abgelegt ist. */
export async function sicherungBauen(nr, jetzt = new Date()) {
  const tour = await S.holen("touren", nr);
  if (!tour) throw new Error(`Tour ${nr} ist nicht geladen.`);
  const [kunden, fotos, notizen] = await Promise.all([S.nachIndex("kunden", "tour", nr), S.nachIndex("fotos", "tour", nr), S.nachIndex("notizen", "tour", nr)]);
  const daten = { format: FORMAT, version: 1, erstellt: jetzt.toISOString(), tour: { ...tour, letzteSicherung: jetzt.toISOString() }, kunden, fotos, notizen };
  const eintraege = [{ name: "tour.json", blob: new Blob([JSON.stringify(daten)], { type: "application/json" }) }];
  for (const f of fotos) {
    const d = await S.holen("fotodaten", f.id);
    if (d) eintraege.push({ name: `fotos/${f.id}.jpg`, blob: d.blob });
  }
  const zip = await zipBauen(eintraege);
  return new File([zip], `${tourDatei(nr)} – Sicherung ${heute(jetzt)}.zip`, { type: "application/zip" });
}

/* Erst wenn die Sicherung das Handy verlassen hat (geteilt) oder im Download-Ordner liegt, gilt die Tour als gesichert. */
export async function sicherungVermerken(nr, jetzt = new Date()) {
  const tour = await S.holen("touren", nr);
  if (tour) await S.schreiben("touren", { ...tour, letzteSicherung: jetzt.toISOString() });
}

async function fehlende(bereich, recs) {
  const neu = [];
  for (const r of recs) if (!(await S.holen(bereich, r.id))) neu.push(r);
  return neu;
}

/* Jeder Eintrag wird vor dem Schreiben geprüft und auf die bekannten Felder gebracht. Eine veränderte Sicherung kann so
   nichts Fremdes (z. B. Programmcode in einem Zahlenfeld) in die App bringen – Ungültiges wird übersprungen und gezählt. */
const BESCHAEDIGT = "Die Sicherung ist beschädigt.";
const istText = (x) => typeof x === "string";
const istZahl = (x) => typeof x === "number" && Number.isFinite(x);
const istAnteil = (x) => istZahl(x) && x >= 0 && x <= 1;
const istObjekt = (x) => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const feldText = (x) => (x === undefined || x === null ? "" : ["string", "number", "boolean"].includes(typeof x) ? String(x) : null);
const mitText = (name, x) => (istText(x) ? { [name]: x } : {});

function tourGueltig(t) {
  if (!istObjekt(t) || !Number.isInteger(t.nr) || t.nr < 1 || t.nr > ANZAHL_TOUREN) throw new Error(BESCHAEDIGT);
  return { nr: t.nr, stand: istText(t.stand) ? t.stand : "", ...mitText("geladen", t.geladen), ...mitText("letzteSicherung", t.letzteSicherung) };
}
function kundeGueltig(k, nr) {
  if (!istObjekt(k) || !istText(k.id) || k.tour !== nr || (k.quelle !== "liste" && k.quelle !== "neu")) return null;
  const pos = k.pos ?? null, nichtInListe = k.nichtInListe ?? false;
  if ((pos !== null && !istZahl(pos)) || typeof nichtInListe !== "boolean") return null;
  const felder = FELD_NAMEN.map((f) => [f, feldText(k[f])]);
  if (felder.some(([, w]) => w === null)) return null;
  return { ...Object.fromEntries(felder), id: k.id, tour: nr, quelle: k.quelle, pos, nichtInListe, ...mitText("angelegt", k.angelegt) };
}
const massGueltig = (m) => (istObjekt(m) && istText(m.id) && [m.x1, m.y1, m.x2, m.y2].every(istAnteil) && istText(m.wert)
  ? { id: m.id, x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2, wert: m.wert } : null);
function fotoGueltig(f, nr) {
  if (!istObjekt(f) || !istText(f.id) || !istText(f.kunde) || f.tour !== nr) return null;
  const beschriftung = f.beschriftung ?? "";
  if (!istZahl(f.w) || f.w <= 0 || !istZahl(f.h) || f.h <= 0 || !istText(beschriftung) || !istText(f.aufgenommen) || !Array.isArray(f.masse)) return null;
  const masse = f.masse.map(massGueltig);
  if (masse.includes(null)) return null;
  return { id: f.id, kunde: f.kunde, tour: nr, w: f.w, h: f.h, beschriftung, aufgenommen: f.aufgenommen, masse };
}
function notizGueltig(n, nr) {
  if (!istObjekt(n) || !istText(n.id) || !istText(n.kunde) || n.tour !== nr || !istText(n.text) || !istText(n.datum)) return null;
  return { id: n.id, kunde: n.kunde, tour: nr, text: n.text, datum: n.datum, ...mitText("geaendert", n.geaendert) };
}

export async function sicherungEinspielen(datei) {
  const liste = await zipLesen(datei);
  const eintrag = liste.find((e) => e.name === "tour.json");
  if (!eintrag) throw new Error("Das ist keine Sicherung der GVL-App.");
  let daten;
  try { daten = JSON.parse(await (await eintrag.inhalt()).text()); } catch { throw new Error(BESCHAEDIGT); }
  if (!daten || daten.format !== FORMAT || daten.version !== 1) throw new Error("Das ist keine Sicherung der GVL-App.");
  const tour = tourGueltig(daten.tour), { nr } = tour;
  if (![daten.kunden, daten.fotos, daten.notizen].every(Array.isArray)) throw new Error(BESCHAEDIGT);
  const gueltige = (recs, pruefen) => recs.map((r) => pruefen(r, nr)).filter(Boolean);
  const gut = { kunden: gueltige(daten.kunden, kundeGueltig), fotos: gueltige(daten.fotos, fotoGueltig), notizen: gueltige(daten.notizen, notizGueltig) };
  const anzahl = (d) => d.kunden.length + d.fotos.length + d.notizen.length;
  const dateien = new Map(liste.map((e) => [e.name, e]));
  // War die Tour schon auf dem Handy, gilt deren (neuere) Tourliste: wer dort fehlt, kommt als „nicht mehr in der Tourliste“ zurück
  const tourWarDa = Boolean(await S.holen("touren", nr));
  if (!tourWarDa) await S.schreiben("touren", tour);
  const kunden = (await fehlende("kunden", gut.kunden)).map((k) => (tourWarDa && k.quelle === "liste" ? { ...k, nichtInListe: true } : k));
  const notizen = await fehlende("notizen", gut.notizen);
  const fotos = (await fehlende("fotos", gut.fotos)).filter((f) => dateien.has(`fotos/${f.id}.jpg`));
  if (kunden.length) await S.schreiben("kunden", ...kunden);
  if (notizen.length) await S.schreiben("notizen", ...notizen);
  for (const f of fotos) {
    const bytes = await (await dateien.get(`fotos/${f.id}.jpg`).inhalt()).arrayBuffer();
    await S.schreiben("fotodaten", { id: f.id, blob: new Blob([bytes], { type: "image/jpeg" }) });
    await S.schreiben("fotos", f);
  }
  return { nr, kunden: kunden.length, fotos: fotos.length, notizen: notizen.length,
    uebersprungen: anzahl(gut) - kunden.length - notizen.length - fotos.length, ungueltig: anzahl(daten) - anzahl(gut) };
}
