/* Fachliche Abläufe der GVL-App über dem Gerätespeicher. */
import * as S from "./speicher.js";
import { pruefeTourdatei, abgleich } from "./tourdatei.js";
import { ANZAHL_TOUREN, SICHERUNG_WARNUNG_TAGE, FELD_NAMEN, neueId, norm, tageSeit } from "./werte.js";

export async function tourEinspielen(obj) {
  const p = pruefeTourdatei(obj);
  if (!p.ok) return p;
  const { nr } = p.tour;
  const a = abgleich(await S.nachIndex("kunden", "tour", nr), p.tour);
  const alt = await S.holen("touren", nr);
  // Kunden zuerst, Tour zuletzt: scheitert das Schreiben, bleibt der alte Stand sichtbar (kein halbes Laden).
  await S.schreiben("kunden", ...a.schreiben);
  // Neue Kennung (zweiter Automat dazu/weg): Fotos und Notizen ziehen mit um, erst danach verschwindet die alte Kennung
  for (const { von, nach } of a.umzug) {
    const [fotos, notizen] = await Promise.all([S.nachIndex("fotos", "kunde", von), S.nachIndex("notizen", "kunde", von)]);
    if (fotos.length) await S.schreiben("fotos", ...fotos.map((f) => ({ ...f, kunde: nach })));
    if (notizen.length) await S.schreiben("notizen", ...notizen.map((n) => ({ ...n, kunde: nach })));
    await S.entfernen("kunden", von);
  }
  await S.schreiben("touren", { ...(alt || {}), nr, stand: p.tour.stand, geladen: new Date().toISOString() });
  return { ok: true, fehler: [], nr, anzahl: p.tour.kunden.length, neu: a.anzahlNeu, fehlend: a.anzahlFehlend };
}

export const tour = (nr) => S.holen("touren", nr);

/* Leere Tour ohne Datei: der Außendienstler legt seine Kunden einzeln selbst an. Eine vorhandene Tour bleibt unberührt. */
export async function tourAnlegen(nr) {
  const alt = await tour(nr);
  if (alt) return alt;
  const rec = { nr, stand: "", geladen: new Date().toISOString() };
  await S.schreiben("touren", rec);
  return rec;
}

export function sicherungsWarnung(letzte, hatEintraege, jetzt = new Date()) {
  if (!hatEintraege) return false;
  return !letzte || tageSeit(letzte, jetzt) > SICHERUNG_WARNUNG_TAGE;
}

const zaehle = (liste) => liste.reduce((z, x) => ((z[x.kunde] = (z[x.kunde] || 0) + 1), z), {});
const tourInhalt = (nr) => Promise.all([S.nachIndex("kunden", "tour", nr), S.nachIndex("fotos", "tour", nr), S.nachIndex("notizen", "tour", nr)]);

export async function tourenUebersicht(jetzt = new Date()) {
  const touren = new Map((await S.alle("touren")).map((t) => [t.nr, t]));
  const liste = [];
  for (let nr = 1; nr <= ANZAHL_TOUREN; nr++) {
    const t = touren.get(nr);
    if (!t) { liste.push({ nr, geladen: false }); continue; }
    const [kunden, fotos, notizen] = await tourInhalt(nr);
    const mit = new Set([...fotos, ...notizen].map((x) => x.kunde)).size;
    const neu = kunden.filter((k) => k.quelle === "neu").length;
    liste.push({ nr, geladen: true, stand: t.stand, kunden: kunden.length, mitEintraegen: mit, neu,
      letzteSicherung: t.letzteSicherung || null, warnung: sicherungsWarnung(t.letzteSicherung, mit + neu > 0, jetzt) });
  }
  return liste;
}

export async function kundenDerTour(nr) {
  const [kunden, fotos, notizen] = await tourInhalt(nr);
  const zf = zaehle(fotos), zn = zaehle(notizen);
  const rang = (k) => (k.quelle === "liste" ? 0 : 1);
  return kunden.map((k) => ({ ...k, fotos: zf[k.id] || 0, notizen: zn[k.id] || 0 }))
    .sort((a, b) => rang(a) - rang(b) || (a.pos ?? 0) - (b.pos ?? 0) || String(a.angelegt).localeCompare(String(b.angelegt)));
}

export function filtern(liste, suche, filter = "alle") {
  const q = norm(suche).trim();
  return liste.filter((k) =>
    (filter === "eintraege" ? k.fotos + k.notizen > 0 : filter === "neu" ? k.quelle === "neu" : true) &&
    (!q || norm([k.name1, k.name2, k.name3, k.ort, k.autNr].join(" ")).includes(q)));
}

export const kunde = (id) => S.holen("kunden", id);

const jetztIso = () => new Date().toISOString();
const bereinigt = (felder) => Object.fromEntries(FELD_NAMEN.map((f) => [f, String(felder[f] ?? "").trim()]));
const pflicht = (f) => { if (!f.name1 || !f.ort) throw new Error("Name-1 und Ort sind Pflicht."); return f; };

export async function neuerKunde(nr, felder) {
  const rec = { ...pflicht(bereinigt(felder)), id: neueId("neu"), tour: nr, quelle: "neu", pos: null, nichtInListe: false, angelegt: jetztIso() };
  await S.schreiben("kunden", rec);
  return rec;
}
export async function kundeAendern(id, felder) {
  const alt = await S.holen("kunden", id);
  if (!alt || alt.quelle !== "neu") throw new Error("Nur selbst angelegte Kunden lassen sich ändern.");
  const rec = { ...alt, ...pflicht(bereinigt(felder)) };
  await S.schreiben("kunden", rec);
  return rec;
}

export async function fotoHinzufuegen(k, blob, w, h) {
  const angaben = { id: neueId("f"), kunde: k.id, tour: k.tour, w, h, beschriftung: "", aufgenommen: jetztIso(), masse: [] };
  await S.schreiben("fotodaten", { id: angaben.id, blob });
  await S.schreiben("fotos", angaben);
  return angaben;
}
export async function fotosDesKunden(kundeId) {
  return (await S.nachIndex("fotos", "kunde", kundeId)).sort((a, b) => a.aufgenommen.localeCompare(b.aufgenommen));
}
export const foto = (id) => S.holen("fotos", id);
export async function fotoBlob(id) { return (await S.holen("fotodaten", id))?.blob || null; }
export async function fotoAendern(angaben) {
  const alt = await S.holen("fotos", angaben.id);
  await S.schreiben("fotos", angaben);
  return { fotos: [alt] };
}

export async function notizenDesKunden(kundeId) {
  return (await S.nachIndex("notizen", "kunde", kundeId)).sort((a, b) => b.datum.localeCompare(a.datum));
}
const notizText = (text) => { const t = String(text ?? "").trim(); if (!t) throw new Error("Die Notiz ist leer."); return t; };
export async function notizHinzufuegen(k, text) {
  const n = { id: neueId("n"), kunde: k.id, tour: k.tour, text: notizText(text), datum: jetztIso() };
  await S.schreiben("notizen", n);
  return n;
}
export async function notizAendern(id, text) {
  const alt = await S.holen("notizen", id);
  await S.schreiben("notizen", { ...alt, text: notizText(text), geaendert: jetztIso() });
  return { notizen: [alt] };
}

async function eintraegeHolen(kundeId) {
  const fotos = await S.nachIndex("fotos", "kunde", kundeId);
  const fotodaten = (await Promise.all(fotos.map((f) => S.holen("fotodaten", f.id)))).filter(Boolean);
  return { fotos, fotodaten, notizen: await S.nachIndex("notizen", "kunde", kundeId) };
}
// Löschen: Notizen, dann Bilddatei, dann Foto-Angaben, Kunde zuletzt – ein Abbruch lässt sich wiederholen, nichts verwaist.
const LOESCH_REIHENFOLGE = ["notizen", "fotodaten", "fotos", "kunden"];
// Rückgängig: Kunde zuerst, Bilddatei vor Foto-Angaben – nie ein Foto ohne Bild.
const RUECK_REIHENFOLGE = ["kunden", "fotodaten", "fotos", "notizen"];
async function paketEntfernen(paket) {
  for (const bereich of LOESCH_REIHENFOLGE) {
    const recs = (paket[bereich] || []).filter(Boolean);
    if (recs.length) await S.entfernen(bereich, ...recs.map((r) => r.id));
  }
}
export async function fotoLoeschen(id) {
  const p = { fotos: [await S.holen("fotos", id)].filter(Boolean), fotodaten: [await S.holen("fotodaten", id)].filter(Boolean) };
  await paketEntfernen(p);
  return p;
}
export async function notizLoeschen(id) {
  const p = { notizen: [await S.holen("notizen", id)].filter(Boolean) };
  await paketEntfernen(p);
  return p;
}
export async function eintraegeLoeschen(kundeId) {
  const p = await eintraegeHolen(kundeId);
  await paketEntfernen(p);
  return p;
}
export async function kundeLoeschen(id) {
  const k = await S.holen("kunden", id);
  if (!k) return { kunden: [] };
  if (k.quelle === "liste" && !k.nichtInListe) throw new Error("Kunden aus der Tourliste werden nicht gelöscht, nur ihre Einträge.");
  const p = { kunden: [k], ...(await eintraegeHolen(id)) };
  await paketEntfernen(p);
  return p;
}
export async function zurueckholen(paket) {
  for (const bereich of RUECK_REIHENFOLGE) {
    const recs = (paket[bereich] || []).filter(Boolean);
    if (recs.length) await S.schreiben(bereich, ...recs);
  }
}
export async function tourLoeschen(nr) {
  const [kunden, fotos, notizen] = await tourInhalt(nr);
  await S.entfernen("fotodaten", ...fotos.map((f) => f.id));
  await S.entfernen("fotos", ...fotos.map((f) => f.id));
  await S.entfernen("notizen", ...notizen.map((n) => n.id));
  await S.entfernen("kunden", ...kunden.map((k) => k.id));
  await S.entfernen("touren", nr);
  return { kunden: kunden.length, fotos: fotos.length, notizen: notizen.length };
}
export async function letzteSicherung(nr) { return (await S.holen("touren", nr))?.letzteSicherung || null; }
