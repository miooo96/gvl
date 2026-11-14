/* Mitmach-Rundgang (Auftrag vom 14.11.2026): Beim ersten Öffnen begrüßt die App Herrn Hartung und bietet einen kurzen Rundgang an.
   Im Rundgang zeigt ein Ring den echten Knopf, eine Sprechblase sagt, was zu tun ist. Er tippt selbst – sobald der Schritt erledigt ist
   (an der Ansicht ablesbar), geht es von allein weiter; ist ein Schritt schon erledigt (z. B. Foto vorhanden), wird er übersprungen.
   „Weiter“ überspringt einen Schritt, „Beenden“ hört auf. Neu starten: Ebene 1 → ⋮ → „Rundgang starten“. Hat Tour 11 schon eigene Kunden, startet er nie.
   Der Ring lässt jeden Fingertipp durch (pointer-events: none). Ist ein Dialog offen, der nicht zum Schritt gehört (Notiz, Maß eintragen,
   Fortschritt, Datei-Bogen …), treten Ring und Blase zurück, bis er zu ist. Ob die Begrüßung schon kam, steht in IndexedDB (einstellungen). */
import * as D from "../daten.js";
import { hinweisBogen, ebeneZu, meldung } from "./hilfe.js";
import { eigeneKunden } from "../werte.js";

const ANGEBOTEN = "rundgangAngeboten", GESAMT = 6;
const SPERRE = "Der Rundgang nutzt Tour 11 für erfundene Beispielkunden. In Tour 11 sind schon eigene Kunden – deshalb startet der Rundgang nicht.";
const RAND = 12, LUFT = 12, POLSTER = 6;
const BEISPIEL_MENUE = "Beispieltour zum Ausprobieren laden";
const ZWECK = "Die App füllt Tour 11 mit erfundenen Kunden zum Üben.";
const MASS = "ziehen Sie mit dem Finger eine Linie über die Strecke. Dann den Wert eintippen, z. B. 1,40 m.";
const ABSCHLUSS = "Das PDF können Sie teilen, speichern oder öffnen. Eigene Kunden legen Sie in jeder Tour mit „＋ Neuer Kunde“ an. "
  + "Die Beispieltour löschen Sie über Tour 11 → ⋮ → „Tour löschen“. Den Rundgang finden Sie jederzeit unter ⋮ → „Rundgang starten“.";

const $ = (sel) => document.querySelector(sel);
const adresse = () => location.hash || "#/";
const aufStart = () => /^#\/?$/.test(adresse());
const inTour11 = () => adresse() === "#/tour/11";
const beimKunden = () => adresse().startsWith("#/kunde/");
const beimFoto = () => adresse().startsWith("#/foto/");
const ebene = () => document.getElementById("ebene");
const ebeneOffen = () => !ebene().hidden && ebene().childElementCount > 0;
const menuePunkt = (text) => [...document.querySelectorAll("#ebene .menue button")].find((b) => b.textContent.trim() === text) || null;
const ziehtGerade = () => Boolean($('[data-ziehen][aria-pressed="true"]'));
const pdfBogen = () => { const b = $("#ebene .bogen"); return Boolean(b && b.querySelector("[data-teilen]") && b.querySelector("h2")?.textContent === "PDF fertig"); };

/* Je Schritt: nr (für „Schritt n von 6“), wo (auf welcher Ansicht das Ziel steht), ziel (das echte Element), text, erledigt (an der Ansicht ablesbar). */
const SCHRITTE = [
  { nr: 1, wo: aufStart,
    // Karte „Beispieltour laden“, solange gar keine Kunden da sind – sonst derselbe Weg über ⋮
    ziel: () => menuePunkt(BEISPIEL_MENUE) || $("[data-beispiel]") || (ebeneOffen() ? null : $("[data-menue]")),
    text: () => (menuePunkt(BEISPIEL_MENUE) ? `Tippen Sie auf „${BEISPIEL_MENUE}“. ${ZWECK}`
      : $("[data-beispiel]") ? `Tippen Sie auf „Beispieltour laden“. ${ZWECK}`
      : `Tippen Sie auf ⋮ und dann auf „${BEISPIEL_MENUE}“. ${ZWECK}`),
    // erledigt, sobald Tour 11 Kunden hat – Beispielkunden oder eigene (dann geht es mit diesen weiter)
    erledigt: () => Boolean($('[data-tour="11"]:not([data-kunden="0"])')) },
  { nr: 2, wo: aufStart, ziel: () => $('[data-tour="11"]') || $('[data-leer="11"]'),
    text: "Das ist Ihre Tour 11. Tippen Sie darauf, um die Kundenliste zu öffnen.", erledigt: inTour11 },
  { nr: 3, wo: inTour11, ziel: () => $("[data-suche]"), unten: true,   // Blase unten: die ersten Kunden unter der Suche bleiben frei
    text: "Hier suchen Sie nach Name, Ort oder Automatennummer. Tippen Sie dann auf einen Kunden.", erledigt: beimKunden },
  { nr: 4, wo: beimKunden, ziel: () => $("[data-kamera]")?.closest(".knoepfe") || null,   // beide Knöpfe: Aufnehmen und Aus Galerie
    text: "Hier hinterlegen Sie Fotos – mit „Aufnehmen“ oder „Aus Galerie“. Machen Sie jetzt ein Foto.", erledigt: () => Boolean($("[data-foto]")) },
  { nr: 4, wo: beimKunden, ziel: () => $("[data-foto]"), text: "Tippen Sie auf das Foto, um es groß zu öffnen.", erledigt: beimFoto },
  { nr: 4, wo: beimFoto,
    // nach „Maß ziehen“ wandert der Ring auf das Foto – dort zieht er die Linie, das Foto bleibt hell
    ziel: () => (ziehtGerade() ? $("[data-rahmen]") : $("[data-ziehen]")),
    text: () => (ziehtGerade() ? `Jetzt ${MASS}` : `Tippen Sie auf „Maß ziehen“ und ${MASS}`), erledigt: () => Boolean($("[data-mass]")) },
  { nr: 4, wo: beimFoto, ziel: () => $("[data-zurueck]"), text: "Fertig gemessen. Mit dem Pfeil geht es zurück zum Kunden.", erledigt: beimKunden },
  { nr: 5, wo: beimKunden, ziel: () => $("[data-notiz]"),
    text: "Mit „＋ Notiz“ schreiben Sie Hinweise zum Kunden, z. B. „Inhaber ab 14 Uhr da“.", erledigt: () => Boolean($(".notiz")) },
  { nr: 6, wo: beimKunden, ziel: () => $("[data-zurueck]"), text: "Zurück zur Tour.", erledigt: inTour11 },
  { nr: 6, wo: inTour11,
    // solange das Menü offen ist, zeigt der Ring auf „PDF dieser Tour“ im Menü
    ziel: () => menuePunkt("PDF dieser Tour") || (ebeneOffen() ? null : $("[data-menue]")),
    text: () => (menuePunkt("PDF dieser Tour") ? "Tippen Sie jetzt auf „PDF dieser Tour“. Die App erstellt das PDF der ganzen Tour."
      : "Über ⋮ erstellen Sie das PDF der ganzen Tour. Tippen Sie auf ⋮ und dann auf „PDF dieser Tour“."), erledigt: pdfBogen },
];

let lauf = null, geplant = 0;
const planen = () => { if (lauf && !geplant) geplant = requestAnimationFrame(aktualisieren); };
const klemmen = (x, min, max) => Math.max(min, Math.min(max, x));
const px = (el, eig, wert) => { const w = `${Math.round(wert)}px`; if (el.style[eig] !== w) el.style[eig] = w; };

/* Erster Start: Begrüßung. Liefert true, sobald geprüft ist (gezeigt oder schon angeboten), false, wenn die Ansicht inzwischen veraltet ist. */
export async function begruessen(nochAktuell = () => true) {
  let angeboten;
  try { angeboten = await D.einstellung(ANGEBOTEN); } catch { return true; }   // Speicher nicht lesbar: den Start nicht aufhalten
  if (angeboten) return true;
  if (!nochAktuell()) return false;
  let gewaehlt = false;
  // Erst vermerken, dann schließen – ist der Bogen zu, steht die Wahl im Speicher (auch wenn gleich danach neu geladen wird)
  const waehlen = (starten) => async () => {
    if (gewaehlt) return;
    gewaehlt = true;
    try { await D.einstellungSetzen(ANGEBOTEN, true); }
    catch (e) { meldung("Nicht gespeichert: " + (e && e.message ? e.message : String(e)), { ms: 10000 }); }
    ebeneZu();
    if (starten) rundgangStarten();
  };
  hinweisBogen("Willkommen, Herr Hartung",
    "In zwei, drei Minuten zeigt Ihnen die App die wichtigsten Schritte – mit erfundenen Beispielkunden. Sie tippen selbst, die App zeigt Ihnen wo.", [
      { text: "Rundgang starten", kennung: "rundgang-start", haupt: true, tun: waehlen(true) },
      { text: "Später", kennung: "rundgang-spaeter", tun: waehlen(false) },
    ]);
  return true;
}

/* Nie über eigene Kunden: Der Rundgang nutzt Tour 11 für die erfundenen Beispielkunden. Stehen dort schon eigene Kunden (dieselbe Regel wie beim
   Laden der Beispieltour, werte.js eigeneKunden), gälte Schritt 1 als erledigt, und die Schritte 4 und 5 ließen ihn Foto und Notiz an einem echten
   Kunden anlegen. Dann startet er nicht – auch nicht aus der Begrüßung (der Merker „angeboten“ ist dort schon gesetzt). */
export async function rundgangStarten() {
  try {
    if (eigeneKunden(await D.kundenDerTour(11)).length) { meldung(SPERRE, { ms: 12000 }); return; }
  } catch (e) { meldung("Rundgang nicht gestartet: " + (e && e.message ? e.message : String(e)), { ms: 10000 }); return; }
  rundgangBeenden();
  const ring = document.createElement("div");
  ring.className = "rundgang-ring";
  ring.hidden = true;
  const blase = document.createElement("div");
  blase.className = "rundgang-blase";
  blase.hidden = true;
  blase.setAttribute("aria-live", "polite");
  blase.innerHTML = '<span class="rundgang-pfeil" data-rundgang-pfeil></span><small data-rundgang-schritt></small><p data-rundgang-text></p>'
    + '<div class="rundgang-knoepfe"><button type="button" data-rundgang-beenden>Beenden</button><button type="button" data-rundgang-weiter>Weiter</button></div>';
  document.body.append(ring, blase);
  blase.querySelector("[data-rundgang-beenden]").onclick = () => rundgangBeenden();
  blase.querySelector("[data-rundgang-weiter]").onclick = () => { if (lauf) { weiterZu(lauf.i + 1); planen(); } };

  const beobachter = new MutationObserver(planen);
  beobachter.observe(document.getElementById("app"), { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-pressed", "hidden"] });
  beobachter.observe(ebene(), { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });
  beobachter.observe(document.getElementById("meldung"), { childList: true, attributes: true, attributeFilter: ["hidden"] });
  beobachter.observe(document.body, { attributes: true, attributeFilter: ["data-bereit"] });
  const ereignisse = [[window, "scroll", true], [window, "resize", false], [window, "hashchange", false], [document, "load", true]];
  if (window.visualViewport) ereignisse.push([window.visualViewport, "resize", false]);
  ereignisse.forEach(([z, art, fangen]) => z.addEventListener(art, planen, fangen));
  const abmelden = () => { beobachter.disconnect(); ereignisse.forEach(([z, art, fangen]) => z.removeEventListener(art, planen, fangen)); };

  lauf = { i: 0, gescrollt: false, ende: false, endeBogen: null, ring, blase, abmelden,
    pfeil: blase.querySelector("[data-rundgang-pfeil]"), schritt: blase.querySelector("[data-rundgang-schritt]"), text: blase.querySelector("[data-rundgang-text]") };
  planen();
}

export function rundgangBeenden() {
  if (!lauf) return;
  lauf.abmelden();
  document.getElementById("meldung").classList.remove("rundgang-oben");
  lauf.ring.remove();
  lauf.blase.remove();
  lauf = null;
  cancelAnimationFrame(geplant);
  geplant = 0;
}

function weiterZu(i) { lauf.i = i; lauf.gescrollt = false; }
function verbergen() { lauf.ring.hidden = true; lauf.blase.hidden = true; }

function aktualisieren() {
  geplant = 0;
  if (!lauf) return;
  if (lauf.ende) { verbergen(); abschluss(); return; }
  // Neue Ansicht wird noch gezeichnet: Ring weg, Blase bleibt, bis die Ansicht steht (der Wegweiser setzt dann data-bereit)
  if (document.body.dataset.bereit !== adresse()) { lauf.ring.hidden = true; return; }
  while (lauf.i < SCHRITTE.length && SCHRITTE[lauf.i].erledigt()) weiterZu(lauf.i + 1);
  if (lauf.i >= SCHRITTE.length) { lauf.ende = true; verbergen(); abschluss(); return; }
  const s = SCHRITTE[lauf.i];
  const ziel = s.wo() ? s.ziel() : null;
  // Ein Dialog, der nicht zum Schritt gehört, bleibt frei bedienbar
  if (ebeneOffen() && !(ziel && ebene().contains(ziel))) { verbergen(); return; }

  const text = typeof s.text === "function" ? s.text() : s.text, marke = `Schritt ${s.nr} von ${GESAMT}`;
  if (lauf.text.textContent !== text) lauf.text.textContent = text;
  if (lauf.schritt.textContent !== marke) lauf.schritt.textContent = marke;
  lauf.blase.hidden = false;

  if (ziel && !lauf.gescrollt) {   // einmal je Schritt ins Bild holen, danach scrollt nur noch er selbst
    lauf.gescrollt = true;
    if (!ganzFrei(ziel)) ziel.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  const r = ziel ? imBild(ziel) : null;
  meldungAusDemWeg(r);
  if (r) { const rr = ringSetzen(r); blaseSetzen(s.unten ? null : rr, (r.left + r.right) / 2); }
  else { lauf.ring.hidden = true; blaseSetzen(null, 0); }   // Ziel nicht auf dieser Ansicht: Blase unten, ohne Ring
}

function abschluss() {
  if (!lauf.endeBogen) {
    if (ebeneOffen()) return;   // erst, wenn der PDF-Bogen zu ist – Teilen, Speichern und Öffnen bleiben solange frei
    lauf.endeBogen = hinweisBogen("Geschafft!", ABSCHLUSS, [
      { text: "Los geht’s", kennung: "rundgang-fertig", haupt: true, tun: () => { ebeneZu(); rundgangBeenden(); } },
    ]).firstElementChild;
    return;
  }
  if (!lauf.endeBogen.isConnected) rundgangBeenden();   // anders geschlossen (z. B. Zurück-Taste)
}

/* Steht das Ziel unten, wo sonst die Meldung erscheint (z. B. Kachel Tour 11 direkt nach „Beispieltour geladen …“), rückt die Meldung
   nach oben – sie bleibt lesbar (auch Fehler und „Rückgängig“), das Ziel bleibt frei. */
const MELDUNG_UNTEN = 84;   // Abstand der Meldung vom unteren Rand (app.css .meldung)
function meldungAusDemWeg(r) {
  const m = document.getElementById("meldung");
  m.classList.toggle("rundgang-oben", Boolean(r) && r.bottom > window.innerHeight - MELDUNG_UNTEN - m.offsetHeight - LUFT);
}
const breite = () => document.documentElement.clientWidth || window.innerWidth;
function imBild(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < breite() ? r : null;
}
// Feste Leisten unten (Foto-Ansicht) hält die Blase frei
function untenBelegt() { const l = $(".leiste"); return l ? l.getBoundingClientRect().height : 0; }
function ganzFrei(el) {
  if (el.closest("#ebene, .kopf, .leiste")) return true;   // feste Teile stehen immer im Bild
  const r = el.getBoundingClientRect(), kopf = $(".kopf");
  const oben = kopf ? Math.max(0, kopf.getBoundingClientRect().bottom) : 0;
  return r.top >= oben && r.bottom <= window.innerHeight - untenBelegt();
}

function ringSetzen(r) {
  const vw = breite(), vh = window.innerHeight;
  const l = Math.max(2, r.left - POLSTER), t = Math.max(2, r.top - POLSTER);
  const re = Math.min(vw - 2, r.right + POLSTER), u = Math.min(vh - 2, r.bottom + POLSTER);
  const { ring } = lauf;
  px(ring, "left", l); px(ring, "top", t); px(ring, "width", re - l); px(ring, "height", u - t);
  ring.hidden = false;
  return { top: t, bottom: u };
}

/* Über oder unter dem Ring, je nachdem, wo Platz ist; nie aus dem Bild. Eine sichtbare Meldung wird nicht überdeckt, wenn es Platz gibt. */
function blaseSetzen(rr, mitte) {
  const { blase, pfeil } = lauf, vw = breite(), vh = window.innerHeight;
  const h = blase.offsetHeight, w = blase.offsetWidth, unten = RAND + untenBelegt();
  let top, seite = "";
  if (!rr) top = vh - unten - h;
  else if (vh - unten - (rr.bottom + LUFT) >= h) { top = rr.bottom + LUFT; seite = "oben"; }
  else if (rr.top - LUFT - RAND >= h) { top = rr.top - LUFT - h; seite = "unten"; }
  else top = vh - unten - rr.bottom >= rr.top ? vh - unten - h : RAND;
  const m = document.getElementById("meldung");
  if (!m.hidden) {
    const mr = m.getBoundingClientRect();
    if (top < mr.bottom && top + h > mr.top && mr.top - LUFT - h >= RAND && (!rr || seite !== "oben")) top = mr.top - LUFT - h;
  }
  top = klemmen(top, RAND, Math.max(RAND, vh - h - RAND));
  const left = rr ? klemmen(mitte - w / 2, RAND, Math.max(RAND, vw - w - RAND)) : Math.max(RAND, (vw - w) / 2);
  px(blase, "top", top); px(blase, "left", left);
  // Pfeil zeigt auf das Ziel – nur, wenn die Blase direkt darüber oder darunter steht
  const pfeilSeite = rr && seite && (seite === "oben" ? top === rr.bottom + LUFT : top === rr.top - LUFT - h) ? seite : "";
  pfeil.hidden = !pfeilSeite;
  pfeil.classList.toggle("oben", pfeilSeite === "oben");
  pfeil.classList.toggle("unten", pfeilSeite === "unten");
  if (pfeilSeite) px(pfeil, "left", klemmen(mitte - left - 7, 14, w - 28));
}
