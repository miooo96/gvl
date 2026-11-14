/* Ebene 1: Touren. Eine Tour ohne Eintrag zeigt „Öffnen →“ und legt sich beim Antippen leer an (Kunden selbst anlegen);
   Tourliste laden, Wiederherstellen aus einer Sicherung und die Beispieltour (Tour 11, erfundene Kunden) stehen im Menü;
   solange noch gar keine Kunden da sind, bietet eine Karte die Beispieltour direkt an. Der Rundgang lässt sich hier jederzeit neu starten. */
import * as D from "../daten.js";
import { sicherungEinspielen } from "../sicherung.js";
import { esc, tageSeit, eigeneKunden } from "../werte.js";
import { seite, meldung, menue, frage, dateiWaehlen, jsonLesen, gehe, sicher, $ } from "./hilfe.js";
import { rundgangStarten } from "./rundgang.js";

const tageText = (n) => (n <= 0 ? "heute" : n === 1 ? "gestern" : `vor ${n} Tagen`);
const sicherungText = (t) => (!t.letzteSicherung
  ? (t.warnung ? "⚠ Noch nie gesichert" : "–")
  : `${t.warnung ? "⚠" : "✓"} Sicherung ${tageText(tageSeit(t.letzteSicherung))}`);

export async function ansichtTouren() {
  const touren = await D.tourenUebersicht();
  const geladen = touren.filter((t) => t.geladen);
  const summe = geladen.reduce((s, t) => s + t.kunden, 0), neu = geladen.reduce((s, t) => s + t.neu, 0);
  seite(`<header class="kopf"><h1>Touren<small>Für Herrn Hartung</small></h1><button class="ikon" data-menue aria-label="Menü">⋮</button></header>
  <main class="inhalt">
    <p class="leise" data-summe>${geladen.length} von 11 Touren angelegt · ${summe.toLocaleString("de-DE")} Kunden · ${neu} neu</p>${summe === 0 ? `
    <div class="karte hinweis-beispiel"><b>Zum Ausprobieren</b><p class="leise">Lädt Tour 11 mit erfundenen Kunden. Danach einfach über Tour 11 → ⋮ → „Tour löschen“ wieder entfernen.</p><button class="knopf haupt" data-beispiel>Beispieltour laden</button></div>` : ""}
    <div class="kacheln">${touren.map((t) => (t.geladen ? `
      <button class="kachel" data-tour="${t.nr}" data-kunden="${t.kunden}"><b>Tour ${t.nr}</b><span>${t.kunden} Kunden</span>
        <span>${t.mitEintraegen ? `${t.mitEintraegen} mit Einträgen` : "noch keine Einträge"}${t.neu ? ` · <em>${t.neu} neu</em>` : ""}</span>
        <span class="sicherung${t.warnung ? " warnung" : ""}">${esc(sicherungText(t))}</span></button>` : `
      <button class="kachel" data-leer="${t.nr}"><b>Tour ${t.nr}</b><span>noch keine Kunden</span><span class="laden">Öffnen →</span></button>`)).join("")}
    </div>
  </main>`);
  document.querySelectorAll("[data-tour]").forEach((b) => { b.onclick = () => gehe(`#/tour/${b.dataset.tour}`); });
  document.querySelectorAll("[data-leer]").forEach((b) => {
    b.onclick = sicher(async () => {
      const nr = Number(b.dataset.leer);
      await D.tourAnlegen(nr);
      gehe(`#/tour/${nr}`);
    });
  });
  const karte = $("[data-beispiel]");
  if (karte) karte.onclick = () => beispielLaden();
  $("[data-menue]").onclick = () => menue("Touren", [
    { text: "Tour laden", tun: () => tourLadenDialog() },
    { text: "Aus Sicherung wiederherstellen", tun: () => wiederherstellenDialog() },
    { text: "Beispieltour zum Ausprobieren laden", tun: () => beispielLaden() },
    { text: "Rundgang starten", tun: () => rundgangStarten() },
  ]);
}

/* Tour 11 mit erfundenen Kunden aus beispiel/tour-11.json (liegt im Offline-Speicher). Kunden aus der Datei kommen zu vorhandenen dazu –
   Fotos und Notizen bleiben; deshalb Rückfrage, wenn Tour 11 schon (erfundene) Kunden hat.
   Nie über eigene Kunden (werte.js, eigeneKunden): Ein selbst angelegter Kunde oder eine Kd-Nr. ohne „D9“ sperrt das Laden – sonst würde
   „Tour löschen“ später auch seine Kunden, Fotos und Notizen entfernen. Doppeltipp: solange ein Laden läuft, tut jeder weitere Aufruf nichts. */
let beispielLaeuft = false;
export async function beispielLaden(nachher = ansichtTouren) {
  if (beispielLaeuft) return;
  beispielLaeuft = true;
  try {
    const kunden = await D.kundenDerTour(11);
    if (eigeneKunden(kunden).length) {
      meldung("Tour 11 enthält schon eigene Kunden – die Beispieltour wird dort nicht geladen, damit nichts vermischt wird.", { ms: 12000 });
      return;
    }
    if (kunden.length
      && !(await frage("Beispieltour laden?", "Tour 11 enthält schon Kunden. Die erfundenen Kunden kommen dazu, vorhandene Einträge bleiben erhalten.", "Laden"))) return;
    const antwort = await fetch("beispiel/tour-11.json");
    if (!antwort.ok) throw new Error(`Datei nicht erreichbar (${antwort.status})`);
    const r = await D.tourEinspielen(await antwort.json());
    if (!r.ok) throw new Error(r.fehler.slice(0, 2).join(" "));
    meldung(`Beispieltour geladen: Tour 11 mit ${r.anzahl} erfundenen Kunden. Entfernen über Tour 11 → ⋮ → „Tour löschen“.`, { ms: 10000 });
    await nachher();
  } catch (e) { meldung("Beispieltour nicht geladen: " + (e && e.message ? e.message : String(e)), { ms: 10000 }); }
  finally { beispielLaeuft = false; }
}

export async function tourLadenDialog(nachher = ansichtTouren) {
  const [datei] = await dateiWaehlen(".json,application/json");
  if (!datei) return;
  const r = await D.tourEinspielen(await jsonLesen(datei));
  if (!r.ok) { meldung(`Tour nicht geladen: ${r.fehler.slice(0, 2).join(" ")}`, { ms: 10000 }); return; }
  meldung(`Tour ${r.nr} geladen: ${r.anzahl} Kunden` + (r.fehlend ? ` · ${r.fehlend} nicht mehr in der Tourliste` : ""));
  await nachher();
}

export async function wiederherstellenDialog(nachher = ansichtTouren) {
  const [datei] = await dateiWaehlen(".zip,application/zip");
  if (!datei) return;
  try {
    const z = await sicherungEinspielen(datei);
    meldung(`Tour ${z.nr} wiederhergestellt: ${z.kunden} Kunden, ${z.fotos} Fotos, ${z.notizen} Notizen neu` + (z.uebersprungen ? ` · ${z.uebersprungen} schon vorhanden` : "")
      + (z.ungueltig ? ` · ${z.ungueltig} ungültig übersprungen` : ""), { ms: 9000 });
  } catch (e) { meldung(e.message, { ms: 9000 }); }
  await nachher();
}
