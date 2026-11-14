/* Bilder im Browser: beim Speichern verkleinern, fürs PDF Maße einzeichnen. Das gespeicherte Original wird nie verändert. */
import { FOTO_MAX, FOTO_QUALITAET, PDF_FOTO_MAX, PDF_FOTO_QUALITAET } from "./werte.js";

const ORANGE = "#de7008";
async function zeichenflaeche(blob, max) {
  let b;
  try { b = await createImageBitmap(blob, { imageOrientation: "from-image" }); }
  catch { throw new Error("Foto konnte nicht gelesen werden – dieses Bildformat kann das Handy hier nicht öffnen."); }
  const f = Math.min(1, max / Math.max(b.width, b.height));
  const c = document.createElement("canvas");
  c.width = Math.round(b.width * f); c.height = Math.round(b.height * f);
  const x = c.getContext("2d");
  x.imageSmoothingQuality = "high";
  x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(b, 0, 0, c.width, c.height);
  if (b.close) b.close();
  return { c, x };
}
const alsJpeg = (c, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Foto konnte nicht gespeichert werden."))), "image/jpeg", q));

export async function verkleinern(datei) {
  const { c } = await zeichenflaeche(datei, FOTO_MAX);
  return { blob: await alsJpeg(c, FOTO_QUALITAET), w: c.width, h: c.height };
}

export function masseZeichnen(x, w, h, masse) {
  const dicke = Math.max(3, w / 320), strich = dicke * 4, schrift = Math.max(16, Math.round(w / 34));
  for (const m of masse) {
    const x1 = m.x1 * w, y1 = m.y1 * h, x2 = m.x2 * w, y2 = m.y2 * h;
    const l = Math.hypot(x2 - x1, y2 - y1) || 1, nx = (-(y2 - y1) / l) * strich, ny = ((x2 - x1) / l) * strich;
    x.lineCap = "round"; x.strokeStyle = ORANGE; x.lineWidth = dicke;
    x.beginPath();
    x.moveTo(x1, y1); x.lineTo(x2, y2);
    x.moveTo(x1 - nx, y1 - ny); x.lineTo(x1 + nx, y1 + ny);
    x.moveTo(x2 - nx, y2 - ny); x.lineTo(x2 + nx, y2 + ny);
    x.stroke();
    if (!m.wert) continue;
    x.font = `bold ${schrift}px Roboto, Arial, sans-serif`;
    const bw = x.measureText(m.wert).width + schrift, bh = schrift * 1.5;
    const mx = Math.min(Math.max((x1 + x2) / 2, bw / 2), w - bw / 2), my = Math.min(Math.max((y1 + y2) / 2, bh / 2), h - bh / 2);
    x.fillStyle = ORANGE; x.fillRect(mx - bw / 2, my - bh / 2, bw, bh);
    x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(m.wert, mx, my);
  }
}

const fuerPdfFertig = async (c) => ({ bytes: new Uint8Array(await (await alsJpeg(c, PDF_FOTO_QUALITAET)).arrayBuffer()), w: c.width, h: c.height });

export async function fuerPdf(blob, masse = []) {
  const { c, x } = await zeichenflaeche(blob, PDF_FOTO_MAX);
  masseZeichnen(x, c.width, c.height, masse);
  return fuerPdfFertig(c);
}

/* Ersatz im PDF für ein Foto, das sich nicht lesen lässt – das PDF entsteht trotzdem. */
export async function platzhalter() {
  const c = document.createElement("canvas");
  c.width = 800; c.height = 600;
  const x = c.getContext("2d");
  x.fillStyle = "#e6e6e6"; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#333333"; x.font = "bold 48px Roboto, Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText("Foto nicht lesbar", c.width / 2, c.height / 2);
  return fuerPdfFertig(c);
}
