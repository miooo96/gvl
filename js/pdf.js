/* Kleiner PDF-Schreiber ohne fremde Bibliothek (aus „Besichtigung“ übernommen).
   Schriften: Helvetica / Helvetica-Bold (PDF-Standardschriften, WinAnsi-Kodierung).
   Breiten aus den Adobe-Schriftmaßen statt aus dem Browser – damit Umbruch im Handy und in Node gleich ist.
   Inhalt ungepackt, damit pdftotext ihn in den Prüfungen lesen kann. */
export const PDF_W = 595.28, PDF_H = 841.89, RAND = 40;
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
  1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
  333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELV_B = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
  975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
  333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const EXTRA = { "Ä": [667, 722], "Ö": [778, 778], "Ü": [722, 722], "ä": [556, 556], "ö": [556, 611], "ü": [556, 611], "ß": [611, 611],
  "é": [556, 556], "€": [556, 556], "„": [333, 500], "“": [333, 500], "”": [333, 500], "‚": [222, 278], "‘": [222, 278], "’": [222, 278],
  "–": [556, 556], "—": [1000, 1000], "…": [1000, 1000], "•": [350, 350], "°": [400, 400], "·": [278, 278], "§": [556, 556] };
export const BREITEN = { normal: HELV, fett: HELV_B };

function zeichenBreite(ch, fett) {
  const c = ch.codePointAt(0);
  if (c >= 32 && c <= 126) return (fett ? HELV_B : HELV)[c - 32];
  const e = EXTRA[ch];
  return e ? e[fett ? 1 : 0] : 556;
}
export function textBreite(t, gr, fett = false) {
  let s = 0;
  for (const ch of String(t ?? "")) s += zeichenBreite(ch, fett);
  return (s * gr) / 1000;
}
export function umbrechen(t, maxW, gr, fett = false) {
  const zeilen = [];
  for (const absatz of String(t ?? "").split(/\n/)) {
    let z = "";
    for (const w of absatz.split(/\s+/).filter(Boolean)) {
      const v = z ? z + " " + w : w;
      if (!z || textBreite(v, gr, fett) <= maxW) z = v; else { zeilen.push(z); z = w; }
    }
    zeilen.push(z);
  }
  return zeilen;
}
export function kuerzen(t, maxW, gr, fett = false) {
  t = String(t ?? "");
  if (textBreite(t, gr, fett) <= maxW) return t;
  while (t.length > 1 && textBreite(t + "…", gr, fett) > maxW) t = t.slice(0, -1);
  return t + "…";
}
const WINANSI = { "€": 128, "‚": 130, "„": 132, "…": 133, "‰": 137, "Š": 138, "Œ": 140, "Ž": 142, "‘": 145, "’": 146, "“": 147, "”": 148,
  "•": 149, "–": 150, "—": 151, "™": 153, "š": 154, "œ": 156, "ž": 158, "Ÿ": 159 };
// Buchstaben ohne Zerlegung in Grundbuchstabe + Zeichen (z. B. türkisches ı, polnisches ł)
const ERSATZ = { "ı": "i", "ł": "l", "Ł": "L", "đ": "d", "Đ": "D" };
// Zeichen außerhalb von WinAnsi: Grundbuchstabe (ğ → g, ş → s) statt „?“ – Namen bleiben lesbar
function winAnsi(ch) {
  if (WINANSI[ch] !== undefined) return WINANSI[ch];
  const c = ch.codePointAt(0);
  if (c <= 255) return c;
  const basis = ch.normalize("NFD").codePointAt(0);
  if (basis <= 255) return basis;
  return ERSATZ[ch] ? ERSATZ[ch].charCodeAt(0) : 63;
}
export function pdfStr(s) {
  let o = "";
  for (const ch of String(s ?? "")) {
    const z = String.fromCharCode(winAnsi(ch));
    o += z === "(" || z === ")" || z === "\\" ? "\\" + z : z;
  }
  return "(" + o + ")";
}
const zahl = (n) => String(Math.round(n * 100) / 100);

// Titel und Autor im Info-Bereich als UTF-16 (sonst zeigen PDF-Betrachter „–" und „„" verstümmelt an)
function infoStr(s) {
  let h = "FEFF";
  for (const ch of String(s ?? "")) {
    const c = ch.codePointAt(0);
    if (c > 0xffff) { const v = c - 0x10000; h += (0xd800 + (v >> 10)).toString(16).padStart(4, "0") + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, "0"); }
    else h += c.toString(16).padStart(4, "0");
  }
  return "<" + h.toUpperCase() + ">";
}

export class PdfDok {
  constructor(titel, autor) { this.seiten = []; this.bilder = []; this.titel = titel; this.autor = autor; this.y = 0; this.s = null; }
  seite(w = PDF_W, h = PDF_H) { this.s = { ops: [], bilder: [], w, h }; this.seiten.push(this.s); this.y = 0; }
  zuSeite(i) { this.s = this.seiten[i]; }
  get anzahl() { return this.seiten.length; }
  farbe(hex, strich) {
    const h = hex.length === 4 ? "#" + [...hex.slice(1)].map((c) => c + c).join("") : hex;
    const n = parseInt(h.slice(1), 16);
    this.s.ops.push(`${zahl(((n >> 16) & 255) / 255)} ${zahl(((n >> 8) & 255) / 255)} ${zahl((n & 255) / 255)} ${strich ? "RG" : "rg"}`);
  }
  rechteck(x, y, w, h, hex) { this.farbe(hex); this.s.ops.push(`${zahl(x)} ${zahl(this.s.h - y - h)} ${zahl(w)} ${zahl(h)} re f`); }
  linie(x1, y1, x2, y2, hex, breite = 0.6) {
    this.farbe(hex, true);
    this.s.ops.push(`${zahl(breite)} w ${zahl(x1)} ${zahl(this.s.h - y1)} m ${zahl(x2)} ${zahl(this.s.h - y2)} l S`);
  }
  text(t, x, y, gr, o = {}) {
    this.farbe(o.farbe || "#2b1a0e");
    const xx = o.rechts ? x - textBreite(t, gr, o.fett) : x;
    this.s.ops.push(`BT /${o.fett ? "F2" : "F1"} ${gr} Tf ${zahl(xx)} ${zahl(this.s.h - y - gr * 0.82)} Td ${pdfStr(t)} Tj ET`);
  }
  absatz(t, x, y, maxW, gr, o = {}) {
    const z = umbrechen(t, maxW, gr, o.fett);
    z.forEach((l, i) => this.text(l, x, y + i * gr * 1.32, gr, o));
    return z.length * gr * 1.32;
  }
  bildNeu(b) { this.bilder.push(b); return this.bilder.length - 1; }
  bild(i, x, y, w, h) {
    if (!this.s.bilder.includes(i)) this.s.bilder.push(i);
    this.s.ops.push(`q ${zahl(w)} 0 0 ${zahl(h)} ${zahl(x)} ${zahl(this.s.h - y - h)} cm /Im${i} Do Q`);
  }
  blob() {
    const teile = [], offs = []; let pos = 0;
    const enc = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
    const add = (d) => { const u = typeof d === "string" ? enc(d) : d; teile.push(u); pos += u.length; };
    const obj = (n, kopf, strom) => { offs[n] = pos; add(`${n} 0 obj\n${kopf}\n`); if (strom) { add("stream\n"); add(strom); add("\nendstream\n"); } add("endobj\n"); };
    const nb = this.bilder.length, bildNr = (i) => 6 + i, seiteNr = (j) => 6 + nb + 2 * j, inhaltNr = (j) => 7 + nb + 2 * j;
    const gesamt = 5 + nb + 2 * this.seiten.length;
    add("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, `<< /Type /Pages /Kids [${this.seiten.map((_, j) => seiteNr(j) + " 0 R").join(" ")}] /Count ${this.seiten.length} >>`);
    obj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    obj(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    obj(5, `<< /Title ${infoStr(this.titel)} /Author ${infoStr(this.autor)} /Creator (GVL) >>`);
    this.bilder.forEach((b, i) => obj(bildNr(i), `<< /Type /XObject /Subtype /Image /Width ${b.w} /Height ${b.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${b.bytes.length} >>`, b.bytes));
    this.seiten.forEach((s, j) => {
      obj(seiteNr(j), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${s.w} ${s.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ` +
        `/XObject << ${s.bilder.map((i) => `/Im${i} ${bildNr(i)} 0 R`).join(" ")} >> >> /Contents ${inhaltNr(j)} 0 R >>`);
      const inhalt = enc(s.ops.join("\n"));
      obj(inhaltNr(j), `<< /Length ${inhalt.length} >>`, inhalt);
    });
    const xref = pos;
    let x = `xref\n0 ${gesamt + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= gesamt; n++) x += String(offs[n]).padStart(10, "0") + " 00000 n \n";
    add(x + `trailer\n<< /Size ${gesamt + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(teile, { type: "application/pdf" });
  }
}