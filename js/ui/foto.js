/* Großansicht eines Fotos mit Maße-Werkzeug. Linien werden als Koordinaten (0–1) neben dem Foto gespeichert –
   das Original bleibt unverändert. Ins Bild gezeichnet wird nur fürs PDF (bild.js). */
import * as D from "../daten.js";
import { esc, neueId, datumDe } from "../werte.js";
import { seite, meldung, eingabe, neuZeichnen, sicher, $ } from "./hilfe.js";

let url = null;

export async function ansichtFoto(id) {
  if (url) { URL.revokeObjectURL(url); url = null; }
  let f = await D.foto(id);
  if (!f) { history.back(); return; }
  const [k, alle, blob] = await Promise.all([D.kunde(f.kunde), D.fotosDesKunden(f.kunde), D.fotoBlob(id)]);
  url = URL.createObjectURL(blob);
  const nr = alle.findIndex((x) => x.id === id) + 1;
  const verlauf = [];
  let ziehen = false;
  // „gespeichert“: das Datum ist der Tag des Speicherns in der App, nicht unbedingt der Aufnahmetag
  const unter = [k ? k.name1 : "", f.aufgenommen ? `gespeichert ${datumDe(f.aufgenommen)}` : ""].filter(Boolean).join(" · ");
  seite(`<div class="foto-seite"><header class="kopf"><button class="ikon" data-zurueck aria-label="Zurück">←</button>
    <h1>Foto ${nr} von ${alle.length}<small>${esc(unter)}</small></h1></header>
    <div class="foto-rahmen" data-rahmen><img src="${url}" alt="" draggable="false"><svg viewBox="0 0 ${Number(f.w)} ${Number(f.h)}" preserveAspectRatio="none" data-svg></svg></div>
    <p class="unterschrift" data-unterschrift></p>
    <nav class="leiste"><button data-ziehen aria-pressed="false"><b>↔</b>Maß ziehen</button><button data-beschriftung><b>✎</b>Beschriftung</button>
      <button data-rueck><b>↶</b>Rückgängig</button><button data-loeschen><b>🗑</b>Löschen</button></nav></div>`);
  const svg = $("[data-svg]");
  const meinHash = location.hash;
  // Linien in Bildschirm-Pixeln bemessen – draußen gut sichtbar und mit dem Finger gut zu treffen
  const proPx = () => f.w / Math.max(1, svg.getBoundingClientRect().width);

  const zeichnen = () => {
    if (!svg.isConnected) return;   // Ansicht schon verlassen – nichts zeichnen
    const p = proPx(), dicke = 4 * p, strich = 9 * p, schrift = 15 * p;
    svg.innerHTML = f.masse.map((m) => {
      const x1 = m.x1 * f.w, y1 = m.y1 * f.h, x2 = m.x2 * f.w, y2 = m.y2 * f.h, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const l = Math.hypot(x2 - x1, y2 - y1) || 1, nx = (-(y2 - y1) / l) * strich, ny = ((x2 - x1) / l) * strich;
      const bw = (m.wert.length * 0.62 + 1) * schrift, bh = schrift * 1.6;
      return `<g data-mass="${esc(m.id)}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#de7008" stroke-width="${dicke}" stroke-linecap="round"/>
        <line x1="${x1 - nx}" y1="${y1 - ny}" x2="${x1 + nx}" y2="${y1 + ny}" stroke="#de7008" stroke-width="${dicke}" stroke-linecap="round"/>
        <line x1="${x2 - nx}" y1="${y2 - ny}" x2="${x2 + nx}" y2="${y2 + ny}" stroke="#de7008" stroke-width="${dicke}" stroke-linecap="round"/>
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="${44 * p}"/>
        <rect x="${mx - bw / 2}" y="${my - bh / 2}" width="${bw}" height="${bh}" rx="${3 * p}" fill="#de7008"/>
        <text x="${mx}" y="${my}" fill="#fff" font-size="${schrift}" font-weight="700" text-anchor="middle" dominant-baseline="central">${esc(m.wert)}</text></g>`;
    }).join("");
    const u = $("[data-unterschrift]");
    if (u) u.textContent = f.beschriftung ? `„${f.beschriftung}“` : "Noch keine Beschriftung";
    svg.querySelectorAll("[data-mass]").forEach((g) => { g.onclick = sicher(async () => { if (!ziehen) await massBearbeiten(g.dataset.mass); }); });
  };
  // Erst speichern, dann übernehmen: scheitert das Speichern, bleibt die Ansicht beim gespeicherten Stand (Meldung über sicher)
  const speichern = async (neu) => { await D.fotoAendern(neu); verlauf.push(f); f = neu; zeichnen(); };
  async function rueck() {
    if (!verlauf.length) { meldung("Nichts rückgängig zu machen"); return; }
    const vorher = verlauf[verlauf.length - 1];
    await D.fotoAendern(vorher); verlauf.pop(); f = vorher; zeichnen();
  }
  async function massBearbeiten(mid) {
    const m = f.masse.find((x) => x.id === mid);
    const w = await eingabe("Maß ändern (leer = Linie löschen)", m.wert);
    if (w === null) return;
    const wert = w.trim(), vorher = f;
    await speichern({ ...f, masse: wert ? f.masse.map((x) => (x.id === mid ? { ...x, wert } : x)) : f.masse.filter((x) => x.id !== mid) });
    if (!wert) meldung("Maßlinie gelöscht", { rueckgaengig: sicher(async () => {   // genau diese Löschung zurücknehmen
      await D.fotoAendern(vorher);
      if (location.hash === meinHash) { verlauf.push(f); f = vorher; zeichnen(); }
    }) });
  }

  const punkt = (e) => {
    const r = svg.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  let start = null, vorschau = null;
  const aufraeumen = () => { start = null; if (vorschau) vorschau.remove(); vorschau = null; };
  svg.addEventListener("pointerdown", (e) => {
    if (!ziehen || start) return;   // nur ein Finger zur Zeit
    e.preventDefault(); svg.setPointerCapture(e.pointerId); start = { ...punkt(e), id: e.pointerId };
    const p = proPx();
    vorschau = document.createElementNS(svg.namespaceURI, "line");
    vorschau.setAttribute("stroke", "#de7008"); vorschau.setAttribute("stroke-width", String(4 * p)); vorschau.setAttribute("stroke-dasharray", String(12 * p));
    svg.appendChild(vorschau);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!start || e.pointerId !== start.id || !vorschau) return;
    const p = punkt(e);
    vorschau.setAttribute("x1", start.x * f.w); vorschau.setAttribute("y1", start.y * f.h);
    vorschau.setAttribute("x2", p.x * f.w); vorschau.setAttribute("y2", p.y * f.h);
  });
  svg.addEventListener("pointercancel", (e) => { if (start && e.pointerId === start.id) aufraeumen(); });
  svg.addEventListener("pointerup", sicher(async (e) => {
    if (!start || e.pointerId !== start.id) return;
    const p = punkt(e), s0 = start;
    aufraeumen();
    if (Math.hypot((p.x - s0.x) * f.w, (p.y - s0.y) * f.h) < f.w / 40) { meldung("Linie zu kurz – mit dem Finger über die Strecke ziehen"); return; }
    const wert = await eingabe("Maß eintragen", "", { platzhalter: "z. B. 1,40 m" });
    if (wert === null || !wert.trim()) { zeichnen(); return; }
    await speichern({ ...f, masse: [...f.masse, { id: neueId("m"), x1: s0.x, y1: s0.y, x2: p.x, y2: p.y, wert: wert.trim() }] });
  }));

  $("[data-ziehen]").onclick = (e) => {
    ziehen = !ziehen;
    e.currentTarget.setAttribute("aria-pressed", String(ziehen));
    $("[data-rahmen]").classList.toggle("ziehen", ziehen);
    if (ziehen) meldung("Mit dem Finger über die Strecke ziehen", { ms: 3000 });
  };
  $("[data-beschriftung]").onclick = sicher(async () => {
    const w = await eingabe("Beschriftung", f.beschriftung, { platzhalter: "z. B. Seitenwand rechts" });
    if (w !== null) await speichern({ ...f, beschriftung: w.trim() });
  });
  $("[data-rueck]").onclick = sicher(rueck);
  $("[data-loeschen]").onclick = sicher(async () => {
    const p = await D.fotoLoeschen(id);
    history.back();
    meldung("Foto gelöscht", { rueckgaengig: sicher(async () => { await D.zurueckholen(p); neuZeichnen(); }) });
  });
  $("[data-zurueck]").onclick = () => history.back();
  zeichnen();
}
