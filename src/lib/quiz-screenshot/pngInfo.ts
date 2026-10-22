/**
 * Read width/height straight from a PNG's IHDR header.
 *
 * Pure and runtime-neutral (works on a Node `Buffer`, which is a Uint8Array,
 * and on browser bytes), so the CLI and the browser export measure the file
 * they actually wrote rather than trusting the size they asked for.
 */
export function pngDimensionsFromBytes(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24) throw new Error("Not a valid PNG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(12) !== 0x49484452 /* "IHDR" */) throw new Error("Not a valid PNG");
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
