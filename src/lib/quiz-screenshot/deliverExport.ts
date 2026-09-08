/**
 * CON1 — hand the exported cards to the operator's downloads folder.
 *
 * One card is saved directly. More than one is zipped, in the SAME directory
 * shape a local run writes (`<run>/question_000123/<format>_<state>.png`), so a
 * browser export and a CLI run of the same selection are interchangeable
 * downstream. JSZip is already the repo's archive tool; nothing new is added.
 */
import JSZip from "jszip";
import type { ExportedFile } from "./runBrowserExport";

/** Save one blob under one name. Extracted so tests can observe the anchor. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously can race the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export type DeliveryResult = { kind: "png" | "zip"; fileName: string; fileCount: number };

export async function deliverExportedFiles(
  files: readonly ExportedFile[],
  zipFileName: string,
): Promise<DeliveryResult | null> {
  if (files.length === 0) return null;
  if (files.length === 1) {
    downloadBlob(files[0].blob, files[0].fileName);
    return { kind: "png", fileName: files[0].fileName, fileCount: 1 };
  }
  const zip = new JSZip();
  for (const file of files) zip.file(file.path, file.blob);
  const archive = await zip.generateAsync({ type: "blob" });
  downloadBlob(archive, zipFileName);
  return { kind: "zip", fileName: zipFileName, fileCount: files.length };
}
