/* Bausteine der Oberfläche: Seite, Meldung mit Rückgängig, Rückfrage, Eingabe, Menü, Fortschritt, Datei-Bogen, Dateiwahl, Wegweiser. */
import { esc, mb } from "../werte.js";
import { teilen, herunterladen, oeffnen } from "../teilen.js";

export const $ = (sel, wurzel = document) => wurzel.querySelector(sel);
export function seite(html) { document.getElementById("app").innerHTML = html; }
export const gehe = (hash) => { location.hash = hash; };
export const ersetze = (hash) => { location.replace(hash); };
export const neuZeichnen = () => window.dispatchEvent(new HashChangeEvent("hashchange"));

const fehlerText = (e) => (e && e.message ? e.message : String(e));
let meldungZeit = null;
export function meldung(text, { rueckgaengig = null, ms = 6000 } = {}) {
  const m = document.getElementById("meldung");
  m.innerHTML = `<span>${esc(text)}</span>${rueckgaengig ? '<button type="button" data-rueck>Rückgängig</button>' : ""}`;
  m.hidden = false;
  clearTimeout(meldungZeit);
  meldungZeit = setTimeout(() => { m.hidden = true; }, ms);
  if (rueckgaengig) m.querySelector("[data-rueck]").onclick = async () => {
    m.hidden = true; clearTimeout(meldungZeit);
    try { await rueckgaengig(); } catch (e) { meldung("Rückgängig fehlgeschlagen: " + fehlerText(e), { ms: 10000 }); }
  };
}
// Speicherfehler nie verschlucken: jede Aktion meldet, wenn etwas nicht gespeichert wurde
export const sicher = (fn) => async (...args) => { try { await fn(...args); } catch (e) { meldung("Nicht gespeichert: " + fehlerText(e), { ms: 10000 }); } };

function ebene(html) {
  const e = document.getElementById("ebene");
  e.innerHTML = `<div class="bogen" role="dialog">${html}</div>`;
  e.hidden = false;
  return e;
}
export function ebeneZu() { const e = document.getElementById("ebene"); e.hidden = true; e.innerHTML = ""; e.onclick = null; }

export function frage(titel, text, jaText = "Löschen") {
  return new Promise((res) => {
    const e = ebene(`<h2>${esc(titel)}</h2><p>${esc(text)}</p><button class="knopf haupt" data-ja>${esc(jaText)}</button><button class="knopf" data-nein>Abbrechen</button>`);
    const fertig = (w) => { ebeneZu(); res(w); };
    e.querySelector("[data-ja]").onclick = () => fertig(true);
    e.querySelector("[data-nein]").onclick = () => fertig(false);
    e.onclick = (ev) => { if (ev.target === e) fertig(false); };
  });
}
export function eingabe(titel, vorgabe = "", { mehrzeilig = false, platzhalter = "" } = {}) {
  return new Promise((res) => {
    const feld = mehrzeilig
      ? `<textarea rows="5" data-feld placeholder="${esc(platzhalter)}">${esc(vorgabe)}</textarea>`
      : `<input data-feld value="${esc(vorgabe)}" placeholder="${esc(platzhalter)}">`;
    const e = ebene(`<h2>${esc(titel)}</h2>${feld}<button class="knopf haupt" data-ok>Übernehmen</button><button class="knopf" data-nein>Abbrechen</button>`);
    const f = e.querySelector("[data-feld]");
    f.focus();
    e.querySelector("[data-ok]").onclick = () => { const w = f.value; ebeneZu(); res(w); };
    e.querySelector("[data-nein]").onclick = () => { ebeneZu(); res(null); };
  });
}
export function menue(titel, eintraege) {
  const e = ebene(`<h2>${esc(titel)}</h2><div class="menue">${eintraege.map((m, i) => `<button data-i="${i}" class="${m.gefahr ? "gefahr" : ""}">${esc(m.text)}</button>`).join("")}</div><button class="knopf" data-nein>Schließen</button>`);
  e.querySelectorAll("[data-i]").forEach((b) => { b.onclick = () => { ebeneZu(); eintraege[Number(b.dataset.i)].tun(); }; });
  e.querySelector("[data-nein]").onclick = ebeneZu;
  e.onclick = (ev) => { if (ev.target === e) ebeneZu(); };
}
export function fortschritt(titel) {
  const e = ebene(`<h2>${esc(titel)}</h2><div class="balken"><div data-b></div></div><p class="leise" data-t>Bitte warten …</p>`);
  return {
    setzen(i, n) { e.querySelector("[data-b]").style.width = `${Math.round((100 * i) / Math.max(1, n))}%`; e.querySelector("[data-t]").textContent = `Foto ${i} von ${n}`; },
    fertig: ebeneZu,
  };
}
/* Fertige Datei → Bogen mit eigenen Knöpfen. Geteilt wird erst beim Tipp auf „Teilen“ (frischer Fingertipp).
   nachAblage läuft erst, wenn die Datei wirklich geteilt oder im Download-Ordner abgelegt ist – nie schon beim Erstellen
   (Chrome am Android-Handy kann z. B. ZIP-Dateien nicht teilen und lädt sie dann still herunter). */
const DOWNLOAD_HINWEIS = "Teilen ist für diese Datei hier nicht möglich – sie liegt jetzt im Download-Ordner. Bitte von dort auf PC oder USB-Stick kopieren.";
export function dateiBogen(datei, titel, { oeffnenAnbieten = true, nachAblage = null } = {}) {
  const e = ebene(`<h2>${esc(titel)}</h2><p>${esc(datei.name)}<br><span class="leise" data-groesse>${mb(datei.size)}</span></p>
    <button class="knopf haupt" data-teilen>Teilen</button><button class="knopf" data-speichern>Speichern</button>
    ${oeffnenAnbieten ? '<button class="knopf" data-oeffnen>Öffnen</button>' : ""}<button class="knopf" data-nein>Schließen</button>`);
  // liefert "" oder einen Zusatz für die Meldung, falls das Vermerken scheitert
  const abgelegt = async () => {
    if (!nachAblage) return "";
    try { await nachAblage(); return ""; } catch (err) { return ` (nicht vermerkt: ${fehlerText(err)})`; }
  };
  e.querySelector("[data-teilen]").onclick = async () => {
    const r = await teilen(datei);   // teilen() ruft navigator.share sofort auf – kein await davor
    if (r !== "geteilt" && r !== "geladen") return;
    const zusatz = await abgelegt();
    if (r === "geladen") meldung(DOWNLOAD_HINWEIS + zusatz, { ms: 12000 });
    else if (zusatz) meldung("Geteilt" + zusatz, { ms: 10000 });
  };
  e.querySelector("[data-speichern]").onclick = async () => {
    herunterladen(datei);
    const zusatz = await abgelegt();
    meldung("Im Download-Ordner gespeichert" + zusatz, zusatz ? { ms: 10000 } : {});
  };
  if (oeffnenAnbieten) e.querySelector("[data-oeffnen]").onclick = () => oeffnen(datei);
  e.querySelector("[data-nein]").onclick = ebeneZu;
}
/* Muss direkt im Klick aufgerufen werden (ohne await davor), sonst öffnet Android die Auswahl nicht. */
export function dateiWaehlen(accept, { mehrere = false, kamera = false } = {}) {
  return new Promise((res) => {
    const i = document.createElement("input");
    i.type = "file"; i.accept = accept; i.multiple = mehrere;
    if (kamera) i.setAttribute("capture", "environment");
    i.style.display = "none";
    document.body.appendChild(i);
    i.onchange = () => { res([...i.files]); i.remove(); };
    i.oncancel = () => { res([]); i.remove(); };
    i.click();
  });
}
export async function jsonLesen(datei) { try { return JSON.parse(await datei.text()); } catch { return null; } }
