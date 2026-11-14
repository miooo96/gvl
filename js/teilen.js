/* Teilen, Speichern, Öffnen einer fertigen Datei. Kein await vor navigator.share (sonst ist der Fingertipp verbraucht). */
export function herunterladen(datei) {
  const url = URL.createObjectURL(datei), a = document.createElement("a");
  a.href = url; a.download = datei.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function teilen(datei) {
  if (navigator.canShare && navigator.share && navigator.canShare({ files: [datei] })) {
    try { await navigator.share({ files: [datei], title: datei.name }); return "geteilt"; }
    catch (e) { if (e && e.name === "AbortError") return "abgebrochen"; }
  }
  herunterladen(datei);
  return "geladen";
}
export function oeffnen(datei) {
  const url = URL.createObjectURL(datei);
  if (!window.open(url, "_blank")) location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 300000);
}
