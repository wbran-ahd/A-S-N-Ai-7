/**
 * One place that hands a file to the browser.
 *
 * Used by the CSV/JSON backup (the shopkeeper's second safety net) and by the
 * overflow archive that keeps months older than the cloud cap on disk. No
 * dependency, no network: a Blob and a synthetic click.
 */
export function downloadFile(filename: string, content: string, mime: string): boolean {
  try {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    /* Revoke after the click has been handled so Safari does not cancel it. */
    window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
    return true;
  } catch {
    return false;
  }
}

/** A dated JSON download — the archive format the import path already reads. */
export function downloadJson(filename: string, data: unknown): boolean {
  return downloadFile(filename, JSON.stringify(data, null, 2), "application/json");
}
