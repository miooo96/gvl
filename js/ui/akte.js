/* Ebene 3: Kundenakte – Stammdaten, Fotos, Notizen. Jederzeit ergänzbar, kein Schritt-für-Schritt-Ablauf. */
import * as D from "../daten.js";
import { verkleinern } from "../bild.js";
import { esc, anzeigeName, datumDe, FELDER } from "../werte.js";
import { seite, meldung, menue, frage, eingabe, dateiWaehlen, gehe, ersetze, neuZeichnen, sicher, $ } from "./hilfe.js";

const STAMM = FELDER.filter(([f]) => !["name1", "name2", "name3", "strasse", "plz", "ort"].includes(f));
let urls = [];
const freigeben = () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; };

export async function ansichtAkte(id) {
  freigeben();
  const k = await D.kunde(id);
  if (!k) { ersetze("#/"); return; }
  const [fotos, notizen] = await Promise.all([D.fotosDesKunden(id), D.notizenDesKunden(id)]);
  const bilder = await Promise.all(fotos.map(async (f) => {
    const b = await D.fotoBlob(f.id), u = b ? URL.createObjectURL(b) : "";
    if (u) urls.push(u);
    return { f, u };
  }));
  const adresse = [k.strasse, [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const feld = ([f, name]) => (!k[f] ? "" : f === "tel" || f === "tel2"
    ? `<div class="feld"><i>${name}</i><a href="tel:${esc(k[f].replace(/[^\d+]/g, ""))}">📞 ${esc(k[f])}</a></div>`
    : `<div class="feld"><i>${name}</i><span>${esc(k[f])}</span></div>`);
  seite(`<header class="kopf"><button class="ikon" data-zurueck aria-label="Zurück">←</button>
    <h1>${esc(anzeigeName(k))}<small>Tour ${Number(k.tour)} · ${esc(k.ort)}</small></h1><button class="ikon" data-menue aria-label="Menü">⋮</button></header>
  <main class="inhalt">
    ${k.quelle === "neu" ? '<p class="hinweis">NEU – selbst angelegter Kunde</p>' : ""}
    ${k.nichtInListe ? '<p class="hinweis">Nicht mehr in der Tourliste. Fotos und Notizen bleiben erhalten.</p>' : ""}
    <div class="abschnitt">Stammdaten${k.quelle === "neu" ? "<button data-bearbeiten>Bearbeiten</button>" : ""}</div>
    <div class="karte">
      <div class="feld"><i>Name</i><span><b>${esc(k.name1)}</b>${k.name2 ? `<br>${esc(k.name2)}` : ""}${k.name3 ? `<br>${esc(k.name3)}` : ""}</span></div>
      ${adresse ? `<div class="feld"><i>Adresse</i><span>${esc(adresse)}</span></div>` : ""}
      ${STAMM.map(feld).join("")}
    </div>
    <div class="abschnitt">Fotos (${fotos.length})</div>
    ${fotos.length ? `<div class="bilder">${bilder.map(({ f, u }) => `<button data-foto="${esc(f.id)}" aria-label="Foto öffnen">${u ? `<img src="${u}" alt="">` : ""}${f.masse.length ? '<span class="mass">📏</span>' : ""}</button>`).join("")}</div>` : '<p class="leise">Noch keine Fotos.</p>'}
    <div class="knoepfe"><button class="knopf" data-kamera>📷 Aufnehmen</button><button class="knopf" data-galerie>🖼 Aus Galerie</button></div>
    <div class="abschnitt">Notizen (${notizen.length})<button data-notiz>＋ Notiz</button></div>
    ${notizen.map((n) => `<div class="notiz" data-n="${esc(n.id)}"><small>${datumDe(n.datum)}${n.geaendert ? " · geändert" : ""}</small><p>${esc(n.text)}</p>
      <div class="aktionen"><button data-n-aendern>Bearbeiten</button><button data-n-loeschen>Löschen</button></div></div>`).join("") || '<p class="leise">Noch keine Notizen.</p>'}
  </main>`);
  const meinHash = location.hash;
  // Nach dem Verlassen der Akte (Zurück, spätes „Rückgängig“, langsames Speichern) nie über eine andere Ansicht zeichnen
  const neuZeigen = () => (location.hash === meinHash ? ansichtAkte(id) : neuZeichnen());
  $("[data-zurueck]").onclick = () => history.back();
  const bearbeiten = $("[data-bearbeiten]");
  if (bearbeiten) bearbeiten.onclick = () => gehe(`#/bearbeiten/${encodeURIComponent(id)}`);
  document.querySelectorAll("[data-foto]").forEach((b) => { b.onclick = () => gehe(`#/foto/${encodeURIComponent(b.dataset.foto)}`); });
  $("[data-kamera]").onclick = () => fotosSpeichern(k, dateiWaehlen("image/*", { kamera: true }), neuZeigen);
  $("[data-galerie]").onclick = () => fotosSpeichern(k, dateiWaehlen("image/*", { mehrere: true }), neuZeigen);
  $("[data-notiz]").onclick = sicher(async () => {
    const t = await eingabe("Neue Notiz", "", { mehrzeilig: true, platzhalter: "z. B. Inhaber ab 14 Uhr da" });
    if (t === null || !t.trim()) return;
    await D.notizHinzufuegen(k, t);
    await neuZeigen();
  });
  document.querySelectorAll("[data-n]").forEach((el) => {
    const nid = el.dataset.n, n = notizen.find((x) => x.id === nid);
    el.querySelector("[data-n-aendern]").onclick = sicher(async () => {
      const t = await eingabe("Notiz bearbeiten", n.text, { mehrzeilig: true });
      if (t === null || !t.trim()) return;
      const alt = await D.notizAendern(nid, t);
      await neuZeigen();
      meldung("Notiz geändert", { rueckgaengig: async () => { await D.zurueckholen(alt); await neuZeigen(); } });
    });
    el.querySelector("[data-n-loeschen]").onclick = sicher(async () => {
      const p = await D.notizLoeschen(nid);
      await neuZeigen();
      meldung("Gelöscht", { rueckgaengig: async () => { await D.zurueckholen(p); await neuZeigen(); } });
    });
  });
  $("[data-menue]").onclick = () => menue(anzeigeName(k), akteMenue(k, neuZeigen));
}

async function fotosSpeichern(k, auswahl, danach) {
  const dateien = await auswahl;
  if (!dateien.length) return;
  meldung(dateien.length === 1 ? "Foto wird gespeichert …" : `${dateien.length} Fotos werden gespeichert …`);
  let gut = 0, fehler = "";
  for (const d of dateien) {
    try { const { blob, w, h } = await verkleinern(d); await D.fotoHinzufuegen(k, blob, w, h); gut++; }
    catch (e) { fehler = e && e.message ? e.message : String(e); }
  }
  if (gut === dateien.length) meldung(gut === 1 ? "Foto gespeichert" : `${gut} Fotos gespeichert`);
  else meldung(`${gut} von ${dateien.length} Fotos gespeichert – ${fehler}`, { ms: 10000 });
  await danach();
}

function akteMenue(k, neuZeigen) {
  const m = [];
  if (k.quelle === "neu") m.push({ text: "Kunde bearbeiten", tun: () => gehe(`#/bearbeiten/${encodeURIComponent(k.id)}`) });
  if (k.quelle === "liste") m.push({ text: "Fotos und Notizen dieses Kunden löschen", gefahr: true, tun: sicher(async () => {
    if (!(await frage("Einträge löschen?", "Alle Fotos, Maße und Notizen dieses Kunden werden gelöscht. Die Stammdaten aus der Tourliste bleiben.", "Einträge löschen"))) return;
    const p = await D.eintraegeLoeschen(k.id);
    await neuZeigen();
    meldung("Einträge gelöscht", { rueckgaengig: async () => { await D.zurueckholen(p); await neuZeigen(); } });
  }) });
  if (k.quelle === "neu" || k.nichtInListe) m.push({ text: "Kunde löschen", gefahr: true, tun: sicher(async () => {
    if (!(await frage("Kunde löschen?", `${anzeigeName(k)} wird mit allen Fotos und Notizen gelöscht.`, "Kunde löschen"))) return;
    const p = await D.kundeLoeschen(k.id);
    history.back();
    meldung("Kunde gelöscht", { rueckgaengig: async () => { await D.zurueckholen(p); neuZeichnen(); } });
  }) });
  return m;
}
