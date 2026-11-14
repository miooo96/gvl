/* Ebene 2: Kundenliste einer Tour mit Suche, Filter, „+ Neuer Kunde“ und Tour-Menü (PDF, Sicherung, Laden, Löschen). */
import * as D from "../daten.js";
import { sicherungBauen, sicherungVermerken } from "../sicherung.js";
import { tourPdf } from "../tourpdf.js";
import { fuerPdf, platzhalter } from "../bild.js";
import { esc, anzeigeName, heute, tourDatei, datumDe } from "../werte.js";
import { seite, meldung, menue, frage, fortschritt, dateiBogen, gehe, ersetze, neuZeichnen, $ } from "./hilfe.js";
import { tourLadenDialog, wiederherstellenDialog } from "./touren.js";

const zustand = new Map();   // je Tour: Suchtext und Filter – nur im Arbeitsspeicher

function zeileHtml(k) {
  const zeichen = [k.fotos ? `📷 ${k.fotos}` : "", k.notizen ? "📝" : ""].filter(Boolean).join(" ");
  const marke = k.quelle === "neu" ? '<span class="marke">NEU</span>' : k.nichtInListe ? '<span class="marke grau">nicht in Liste</span>' : "";
  const unter = [k.ort, k.autNr || (k.quelle === "neu" ? "noch keine Aut-Nr." : "")].filter(Boolean).join(" · ");
  return `<button class="zeile" data-kunde="${esc(k.id)}"><span class="name"><b>${esc(anzeigeName(k))}</b><span>${esc(unter)}</span></span><span class="zeichen">${zeichen}</span>${marke}</button>`;
}

export async function ansichtListe(nr) {
  const kunden = await D.kundenDerTour(nr);
  // Ohne Tour-Eintrag (nie angelegt oder gelöscht) gibt es nichts zu zeigen; eine angelegte leere Tour bleibt offen
  if (!kunden.length && !(await D.tour(nr))) { ersetze("#/"); return; }
  const z = zustand.get(nr) || { suche: "", filter: "alle" };
  zustand.set(nr, z);
  const mit = kunden.filter((k) => k.fotos + k.notizen > 0).length, neu = kunden.filter((k) => k.quelle === "neu").length;
  seite(`<header class="kopf"><button class="ikon" data-zurueck aria-label="Zurück">←</button>
    <h1>Tour ${nr}<small>${kunden.length} Kunden · ${mit} mit Einträgen · ${neu} neu</small></h1>
    <button class="ikon" data-menue aria-label="Menü">⋮</button></header>
  <main class="inhalt">
    <input class="suche" type="search" placeholder="🔍 Name, Ort oder Aut-Nr." value="${esc(z.suche)}" data-suche>
    <div class="chips">${[["alle", "Alle"], ["eintraege", "Mit Einträgen"], ["neu", "Neu"]].map(([w, t]) => `<button class="chip" data-filter="${w}" aria-pressed="${z.filter === w}">${t}</button>`).join("")}</div>
    <div data-liste></div>
  </main>
  <button class="fab" data-neu>＋ Neuer Kunde</button>`);
  const zeichnen = () => {
    const treffer = D.filtern(kunden, z.suche, z.filter);
    $("[data-liste]").innerHTML = treffer.length ? treffer.map(zeileHtml).join("")
      : kunden.length ? '<p class="leer">Keine Kunden gefunden.</p>'
      : '<p class="leer">Noch keine Kunden. Mit „＋ Neuer Kunde“ anlegen – oder über ⋮ eine Tourliste laden.</p>';
    document.querySelectorAll("[data-kunde]").forEach((b) => { b.onclick = () => gehe(`#/kunde/${encodeURIComponent(b.dataset.kunde)}`); });
  };
  zeichnen();
  $("[data-suche]").oninput = (e) => { z.suche = e.target.value; zeichnen(); };
  document.querySelectorAll("[data-filter]").forEach((b) => {
    b.onclick = () => {
      z.filter = b.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
      zeichnen();
    };
  });
  $("[data-zurueck]").onclick = () => history.back();
  $("[data-neu]").onclick = () => gehe(`#/neu/${nr}`);
  $("[data-menue]").onclick = () => menue(`Tour ${nr}`, [
    { text: "PDF dieser Tour", tun: () => pdfErstellen(nr) },
    { text: "Sicherung erstellen", tun: () => sicherungErstellen(nr) },
    { text: "Aus Sicherung wiederherstellen", tun: () => wiederherstellenDialog(() => ansichtListe(nr)) },
    { text: "Tourliste laden", tun: () => tourLadenDialog(() => ansichtListe(nr)) },
    { text: "Tour löschen", gefahr: true, tun: () => tourLoeschenFragen(nr) },
  ]);
}

async function pdfErstellen(nr) {
  const f = fortschritt(`PDF für Tour ${nr} wird erstellt`);
  try {
    const kunden = await D.kundenDerTour(nr);
    const fotosJe = new Map(), notizenJe = new Map();
    for (const k of kunden) {
      if (k.fotos) fotosJe.set(k.id, await D.fotosDesKunden(k.id));
      if (k.notizen) notizenJe.set(k.id, await D.notizenDesKunden(k.id));
    }
    // Ein unlesbares Foto bricht das PDF nicht ab: es steht als Platzhalter drin, die Zahl wird gemeldet
    let unlesbar = 0;
    const bildFuer = async (angaben) => {
      try {
        const b = await D.fotoBlob(angaben.id);
        if (!b) throw new Error("Bilddatei fehlt");
        return await fuerPdf(b, angaben.masse);
      } catch { unlesbar++; return platzhalter(); }
    };
    const blob = await tourPdf({ nr, stand: heute(), kunden, fotosJe, notizenJe }, bildFuer, (i, n) => f.setzen(i, n));
    f.fertig();
    dateiBogen(new File([blob], `${tourDatei(nr)} – Stand ${heute()}.pdf`, { type: "application/pdf" }), "PDF fertig");
    if (unlesbar) meldung(`${unlesbar} Foto(s) nicht lesbar – im PDF als Platzhalter`, { ms: 10000 });
  } catch (e) {
    f.fertig();
    meldung("PDF nicht erstellt: " + e.message, { ms: 10000 });
  }
}

async function sicherungErstellen(nr) {
  meldung("Sicherung wird erstellt …");
  try { dateiBogen(await sicherungBauen(nr), "Sicherung fertig", { oeffnenAnbieten: false, nachAblage: () => sicherungVermerken(nr) }); }
  catch (e) { meldung("Sicherung nicht erstellt: " + e.message, { ms: 10000 }); }
}

async function tourLoeschenFragen(nr) {
  try {
    const letzte = await D.letzteSicherung(nr);
    const text = `Alle Kunden, Fotos und Notizen von Tour ${nr} werden vom Handy gelöscht. `
      + (letzte ? `Letzte Sicherung: ${datumDe(letzte)}.` : "Von dieser Tour gibt es noch keine Sicherung.");
    if (!(await frage(`Tour ${nr} löschen?`, text, "Tour löschen"))) return;
    const r = await D.tourLoeschen(nr);
    meldung(`Tour ${nr} gelöscht (${r.kunden} Kunden, ${r.fotos} Fotos, ${r.notizen} Notizen)`);
    ersetze("#/");   // ersetzen statt neu ablegen – sonst führt Zurück wieder in die gelöschte Tour
  } catch (e) {
    meldung("Tour nicht gelöscht: " + e.message, { ms: 10000 });
    neuZeichnen();
  }
}
