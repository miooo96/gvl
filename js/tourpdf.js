/* Tour-PDF (Entwurf Abschnitt 3): Übersicht mit Seitenzahlen, je Kunde mit Einträgen eine Seite,
   Kunden ohne Einträge kompakt, neue Kunden am Ende. Alle Stammdaten inkl. Schl-Nr. (Mirko 13.11.2026).
   Die Bilder liefert bildFuer(fotoAngaben) – im Browser mit eingezeichneten Maßen, im Test eine feste Datei. */
import { PdfDok, PDF_W, PDF_H, RAND, umbrechen, kuerzen } from "./pdf.js";
import { datumDe, anzeigeName } from "./werte.js";

const B = PDF_W - 2 * RAND, OBEN = 46, UNTEN = PDF_H - 50, ZEILE = 15, KOPFZEILE = 13, TITEL_HOEHE = 120;
const ERSTE = Math.floor((UNTEN - OBEN - TITEL_HOEHE - KOPFZEILE) / ZEILE);
const WEITERE = Math.floor((UNTEN - OBEN - KOPFZEILE) / ZEILE);
const BRAUN = "#612a00", ORANGE = "#de7008", LEISE = "#6b5a4b", LINIE = "#e3d5bf", STREIFEN = "#f6efe4";
const SPALTEN = [[0, 62, "Kd-Nr."], [62, 178, "Name"], [240, 110, "Ort"], [350, 72, "Aut-Nr."], [422, 40, "Fotos"], [462, 53, "Seite"]];

export function gruppen(kunden) {
  const ein = (k) => k.fotos + k.notizen > 0;
  return {
    mit: kunden.filter((k) => k.quelle === "liste" && ein(k)),
    ohne: kunden.filter((k) => k.quelle === "liste" && !ein(k)),
    neu: kunden.filter((k) => k.quelle === "neu"),
  };
}
export function uebersichtSeiten(n) { return n <= ERSTE ? 1 : 1 + Math.ceil((n - ERSTE) / WEITERE); }

const adresse = (k) => [k.strasse, [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
const stammzeilen = (k) => [["Kd-Nr.", k.kdNr], ["Adresse", adresse(k)], ["Telefon", k.tel], ["2. Telefon", k.tel2],
  ["Aut-Nr.", k.autNr], ["Schl-Nr.", k.schlNr], ["Innen/Außen", k.lage]].filter(([, w]) => w);

export async function tourPdf({ nr, stand, kunden, fotosJe, notizenJe }, bildFuer, fortschritt = () => {}) {
  const doc = new PdfDok(`Tour ${nr} – Stand ${datumDe(stand)}`, "GVL");
  const { mit, ohne, neu } = gruppen(kunden);
  const seiteVon = new Map();
  const neueSeite = () => { doc.seite(); doc.y = OBEN; };
  const fortsetzung = (k) => { neueSeite(); doc.text(`${k.name1} (Fortsetzung)`, RAND, doc.y, 9, { farbe: LEISE }); doc.y += 16; };
  const fotosGesamt = [...fotosJe.values()].reduce((s, l) => s + l.length, 0);
  let fotosFertig = 0;

  // 1. Übersicht: Seiten vorhalten, gefüllt wird am Ende, wenn alle Seitenzahlen feststehen
  for (let i = 0; i < uebersichtSeiten(kunden.length); i++) neueSeite();

  // 2./4. Kunde auf eigener Seite
  const eigeneSeite = async (k, marke) => {
    neueSeite(); seiteVon.set(k.id, doc.anzahl);
    if (marke) { doc.text(marke, RAND, doc.y, 9, { fett: true, farbe: ORANGE }); doc.y += 14; }
    doc.y += doc.absatz(anzeigeName(k), RAND, doc.y, B, 16, { fett: true, farbe: BRAUN });
    if (k.name3) { doc.text(k.name3, RAND, doc.y, 10, { farbe: LEISE }); doc.y += 14; }
    if (k.nichtInListe) { doc.text("Nicht mehr in der Tourliste", RAND, doc.y, 9, { fett: true, farbe: ORANGE }); doc.y += 13; }
    doc.y += 4;
    for (const [name, wert] of stammzeilen(k)) {
      doc.text(name, RAND, doc.y, 9.5, { farbe: LEISE });
      doc.y += doc.absatz(wert, RAND + 80, doc.y, B - 80, 9.5) + 1;
    }
    const notizen = notizenJe.get(k.id) || [];
    if (notizen.length) {
      doc.y += 10; doc.text("Notizen", RAND, doc.y, 10, { fett: true, farbe: BRAUN }); doc.y += 15;
      const NZ = 9.5 * 1.32;   // Zeilenhöhe der Notizen
      for (const n of notizen) {
        const zeilen = umbrechen(n.text, B - 80, 9.5);
        if (doc.y + Math.min(zeilen.length, 3) * NZ > UNTEN) fortsetzung(k);   // Datum nie allein am Seitenende
        doc.text(datumDe(n.datum), RAND, doc.y, 9.5, { fett: true });
        for (const z of zeilen) {   // lange Notizen laufen Zeile für Zeile auf Folgeseiten weiter – nichts geht verloren
          if (doc.y + NZ > UNTEN) fortsetzung(k);
          doc.text(z, RAND + 80, doc.y, 9.5);
          doc.y += NZ;
        }
        doc.y += 5;
      }
    }
    const fotos = fotosJe.get(k.id) || [];
    for (let i = 0; i < fotos.length; i++) {
      const bild = await bildFuer(fotos[i]);
      let w = B, h = (bild.h / bild.w) * w;
      const maxH = UNTEN - OBEN - 30 - 18;
      if (h > maxH) { h = maxH; w = (bild.w / bild.h) * h; }
      if (doc.y + 10 + h + 18 > UNTEN) fortsetzung(k); else doc.y += 10;
      doc.bild(doc.bildNeu(bild), RAND + (B - w) / 2, doc.y, w, h);
      doc.y += h + 4;
      const { beschriftung: u, aufgenommen: am } = fotos[i];   // gespeichert = Tag des Speicherns in der App, nicht der Aufnahme
      const unterschrift = [`Foto ${i + 1} von ${fotos.length}`, am ? `gespeichert ${datumDe(am)}` : "", u].filter(Boolean).join(" · ");
      doc.text(kuerzen(unterschrift, B, 8.5), RAND, doc.y, 8.5, { farbe: LEISE });
      doc.y += 14;
      fortschritt(++fotosFertig, fotosGesamt);
    }
  };
  for (const k of mit) await eigeneSeite(k, "");

  // 3. Kunden ohne Einträge: kompakt, mehrere pro Seite
  if (ohne.length) {
    neueSeite();
    doc.text(`Kunden ohne Einträge (${ohne.length})`, RAND, doc.y, 13, { fett: true, farbe: BRAUN }); doc.y += 22;
    for (const k of ohne) {
      if (doc.y + 44 > UNTEN) neueSeite();
      seiteVon.set(k.id, doc.anzahl);
      const name = [anzeigeName(k), k.name3].filter(Boolean).join(" · ") + (k.nichtInListe ? " – nicht mehr in der Tourliste" : "");
      const z1 = [`Kd-Nr. ${k.kdNr}`, k.autNr && `Aut-Nr. ${k.autNr}`, k.schlNr && `Schl-Nr. ${k.schlNr}`, k.lage].filter(Boolean).join(" · ");
      const z2 = [adresse(k), k.tel && `Tel. ${k.tel}`, k.tel2 && `2. Tel. ${k.tel2}`].filter(Boolean).join(" · ");
      doc.text(kuerzen(name, B, 10.5, true), RAND, doc.y, 10.5, { fett: true });
      doc.text(kuerzen(z1, B, 9), RAND, doc.y + 14, 9);
      doc.text(kuerzen(z2, B, 9), RAND, doc.y + 26, 9, { farbe: LEISE });
      doc.linie(RAND, doc.y + 40, RAND + B, doc.y + 40, LINIE);
      doc.y += 46;
    }
  }
  for (const k of neu) await eigeneSeite(k, "NEUER KUNDE");

  // 1. Übersicht füllen
  doc.zuSeite(0); doc.y = OBEN;
  doc.text(`Tour ${nr}`, RAND, doc.y, 22, { fett: true, farbe: BRAUN }); doc.y += 32;
  doc.text(`Stand ${datumDe(stand)}`, RAND, doc.y, 10.5, { farbe: LEISE }); doc.y += 22;
  doc.rechteck(RAND, doc.y, B, 34, STREIFEN); doc.rechteck(RAND, doc.y, 3, 34, ORANGE);
  doc.text(`${kunden.length} Kunden · ${kunden.filter((k) => k.fotos > 0).length} mit Fotos · ${neu.length} neu`, RAND + 12, doc.y + 11, 11, { fett: true });
  doc.y = OBEN + TITEL_HOEHE;
  const kopf = () => { SPALTEN.forEach(([x, , t]) => doc.text(t, RAND + x, doc.y, 8, { fett: true, farbe: LEISE })); doc.y += KOPFZEILE; };
  kopf();
  let platz = ERSTE, s = 0;
  kunden.forEach((k, i) => {
    if (platz === 0) { s += 1; doc.zuSeite(s); doc.y = OBEN; kopf(); platz = WEITERE; }
    if (i % 2 === 0) doc.rechteck(RAND - 4, doc.y - 3, B + 8, ZEILE, STREIFEN);
    const name = (k.quelle === "neu" ? "NEU · " : "") + anzeigeName(k);
    const werte = [k.kdNr || "–", name, k.ort, k.autNr || "–", String(k.fotos || 0), String(seiteVon.get(k.id))];
    SPALTEN.forEach(([x, w], j) => doc.text(kuerzen(werte[j], w - 6, 9, j === 1), RAND + x, doc.y, 9, { fett: j === 1 }));
    doc.y += ZEILE; platz -= 1;
  });

  // Kopf- und Fußzeile auf jeder Seite
  for (let i = 0; i < doc.anzahl; i++) {
    doc.zuSeite(i);
    doc.text(`Tour ${nr} · Stand ${datumDe(stand)}`, RAND, 14, 8.5, { farbe: LEISE });
    doc.text("Für Herrn Hartung", PDF_W - RAND, 14, 8.5, { rechts: true, farbe: LEISE });
    doc.linie(RAND, 28, PDF_W - RAND, 28, LINIE);
    doc.text(`Seite ${i + 1} von ${doc.anzahl}`, PDF_W - RAND, PDF_H - 32, 8.5, { rechts: true, farbe: LEISE });
  }
  return doc.blob();
}
