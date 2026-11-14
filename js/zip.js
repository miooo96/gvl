/* ZIP schreiben und lesen ohne Bibliothek (aus „Besichtigung" übernommen).
   Geschrieben wird ungepackt („stored") – Fotos sind schon JPEG. Gelesen wird stückweise. */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes, c = 0) {
  c = c ^ 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function crcBlob(blob) {
  let c = 0; const STUECK = 8 * 1048576;
  for (let o = 0; o < blob.size; o += STUECK) c = crc32(new Uint8Array(await blob.slice(o, o + STUECK).arrayBuffer()), c);
  return c;
}
function dosZeit(d) {
  return { zeit: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), datum: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

export async function zipBauen(eintraege, fortschritt) {
  const enc = new TextEncoder(), teile = [], zentral = []; let pos = 0; const z = dosZeit(new Date());
  for (let i = 0; i < eintraege.length; i++) {
    const { name, blob } = eintraege[i]; const nb = enc.encode(name);
    const crc = await crcBlob(blob); const gr = blob.size;
    if (pos + gr > 0xffffffff) throw new Error("ZIP wäre größer als 4 GB");
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, z.zeit, true); lh.setUint16(12, z.datum, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, gr, true); lh.setUint32(22, gr, true); lh.setUint16(26, nb.length, true); lh.setUint16(28, 0, true);
    teile.push(lh.buffer, nb, blob);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, z.zeit, true); ch.setUint16(14, z.datum, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, gr, true); ch.setUint32(24, gr, true); ch.setUint16(28, nb.length, true);
    ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true); ch.setUint32(42, pos, true);
    zentral.push(ch.buffer, nb);
    pos += 30 + nb.length + gr;
    if (fortschritt) fortschritt(i + 1, eintraege.length);
  }
  const zgr = zentral.reduce((s, t) => s + t.byteLength, 0);
  const ende = new DataView(new ArrayBuffer(22));
  ende.setUint32(0, 0x06054b50, true); ende.setUint16(8, eintraege.length, true); ende.setUint16(10, eintraege.length, true);
  ende.setUint32(12, zgr, true); ende.setUint32(16, pos, true);
  return new Blob([...teile, ...zentral, ende.buffer], { type: "application/zip" });
}

export async function zipLesen(datei) {
  const teil = async (a, b) => new Uint8Array(await datei.slice(a, b).arrayBuffer());
  const schwanz = await teil(Math.max(0, datei.size - 65557), datei.size);
  let p = -1;
  for (let i = schwanz.length - 22; i >= 0; i--)
    if (schwanz[i] === 0x50 && schwanz[i + 1] === 0x4b && schwanz[i + 2] === 5 && schwanz[i + 3] === 6) { p = i; break; }
  if (p < 0) throw new Error("Das ist keine ZIP-Datei.");
  const ende = new DataView(schwanz.buffer, p);
  const anzahl = ende.getUint16(10, true), cdGr = ende.getUint32(12, true), cdPos = ende.getUint32(16, true);
  if (cdPos === 0xffffffff || anzahl === 0xffff) throw new Error("Diese ZIP ist zu groß für das Handy (ZIP64).");
  const cd = await teil(cdPos, cdPos + cdGr), dv = new DataView(cd.buffer), dec = new TextDecoder();
  const liste = [];
  for (let i = 0, q = 0; i < anzahl && q + 46 <= cd.length && dv.getUint32(q, true) === 0x02014b50; i++) {
    const nl = dv.getUint16(q + 28, true);
    liste.push({ name: dec.decode(cd.subarray(q + 46, q + 46 + nl)).normalize("NFC"), packart: dv.getUint16(q + 10, true),
      gr: dv.getUint32(q + 20, true), lh: dv.getUint32(q + 42, true) });
    q += 46 + nl + dv.getUint16(q + 30, true) + dv.getUint16(q + 32, true);
  }
  if (liste.length !== anzahl) throw new Error("Die ZIP-Datei ist beschädigt.");
  for (const e of liste) e.inhalt = async () => {
    const k = new DataView((await teil(e.lh, e.lh + 30)).buffer);
    const start = e.lh + 30 + k.getUint16(26, true) + k.getUint16(28, true), roh = datei.slice(start, start + e.gr);
    if (e.packart === 0) return roh;
    if (e.packart === 8 && typeof DecompressionStream !== "undefined")
      return await new Response(roh.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
    throw new Error("Diese ZIP ist gepackt, wie es das Handy nicht lesen kann.");
  };
  return liste.filter((e) => !e.name.endsWith("/") && !/(^|\/)(__MACOSX|\._)/.test(e.name));
}
