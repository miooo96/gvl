/* Feste Werte und kleine Helfer der GVL-App. Keine Abhängigkeiten – läuft im Browser und in Node. */
export const FELDER = [
  ["kdNr", "Kd-Nr."], ["name1", "Name-1"], ["name2", "Name-2"], ["name3", "Name-3"],
  ["strasse", "Straße"], ["plz", "PLZ"], ["ort", "Ort"], ["tel", "Telefon"], ["tel2", "2. Telefon"],
  ["autNr", "Aut-Nr."], ["schlNr", "Schl-Nr."], ["lage", "Innen/Außen"],
];
export const FELD_NAMEN = FELDER.map(([f]) => f);
export const LAGEN = ["Innen", "Außen"];
export const ANZAHL_TOUREN = 11;
export const SICHERUNG_WARNUNG_TAGE = 7;
export const FOTO_MAX = 2400, FOTO_QUALITAET = 0.85;
export const PDF_FOTO_MAX = 1600, PDF_FOTO_QUALITAET = 0.75;

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function norm(s) {
  return String(s ?? "").toLowerCase().replace(/ß/g, "ss").normalize("NFKD").replace(/[̀-ͯ]/g, "");
}
const zwei = (n) => String(n).padStart(2, "0");
export function heute(d = new Date()) { return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`; }
export function datumDe(wert) {
  const d = typeof wert === "string" && /^\d{4}-\d{2}-\d{2}$/.test(wert) ? new Date(wert + "T12:00:00") : new Date(wert);
  return `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()}`;
}
export function tageSeit(iso, jetzt = new Date()) { return Math.floor((jetzt - new Date(iso)) / 86400000); }
export function mb(bytes) {
  return (bytes / 1048576).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " MB";
}
export function tourDatei(nr) { return "Tour " + zwei(nr); }
export function neueId(praefix) { return `${praefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
export function anzeigeName(k) { return [k.name1, k.name2].filter(Boolean).join(" "); }
