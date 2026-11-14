/* Neuer Kunde / selbst angelegten Kunden bearbeiten. Pflicht: Name-1 und Ort. Nach dem Anlegen öffnet sich sofort die Akte. */
import * as D from "../daten.js";
import { FELDER, LAGEN, esc } from "../werte.js";
import { seite, meldung, ersetze, $ } from "./hilfe.js";

export async function ansichtKundenform({ tour, id }) {
  const alt = id ? await D.kunde(id) : null;
  if (id && (!alt || alt.quelle !== "neu")) { ersetze("#/"); return; }
  const w = alt || {};
  const nr = alt ? alt.tour : tour;
  const feld = ([f, name]) => (f === "lage"
    ? `<label for="f-${f}">${name}</label><select id="f-${f}" name="${f}"><option value="">–</option>${LAGEN.map((l) => `<option${w.lage === l ? " selected" : ""}>${l}</option>`).join("")}</select>`
    : `<label for="f-${f}">${name}${f === "name1" || f === "ort" ? " *" : ""}</label><input id="f-${f}" name="${f}" value="${esc(w[f] || "")}"${f.startsWith("tel") ? ' type="tel"' : ""}${f === "plz" ? ' inputmode="numeric"' : ""}>`);
  seite(`<header class="kopf"><button class="ikon" data-zurueck aria-label="Abbrechen">✕</button>
    <h1>${alt ? "Kunde bearbeiten" : "Neuer Kunde"}<small>Tour ${nr}</small></h1></header>
  <main class="inhalt form"><form data-form>
    ${FELDER.map(feld).join("")}
    <p class="leise">* Pflichtfeld. Kd-Nr., Aut-Nr. und Schl-Nr. dürfen leer bleiben.</p>
    <div class="knoepfe"><button type="button" class="knopf" data-abbrechen>Abbrechen</button><button type="submit" class="knopf haupt">Speichern</button></div>
  </form></main>`);
  $("[data-zurueck]").onclick = () => history.back();
  $("[data-abbrechen]").onclick = () => history.back();
  $("[data-form]").onsubmit = async (e) => {
    e.preventDefault();
    const felder = Object.fromEntries(new FormData(e.target));
    try {
      const k = alt ? await D.kundeAendern(alt.id, felder) : await D.neuerKunde(nr, felder);
      meldung(alt ? "Gespeichert" : "Kunde angelegt");
      if (alt) history.back(); else ersetze(`#/kunde/${encodeURIComponent(k.id)}`);
    } catch (err) { meldung(err.message); }
  };
}
