import { useCallback } from "react";
import { toast } from "sonner";

export type PatchHubShareInput = { url: string; title: string };

/**
 * Native sharing is only coherent on touch-first devices, where the system sheet
 * is the expected "share a link" gesture. Desktop browsers that expose
 * `navigator.share` (Edge, Safari) would pop a sheet for what the control calls
 * "Copy link", so desktop always copies.
 */
export function canUseNativeShare(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  try {
    return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

async function copy(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  } catch {
    toast.error("Could not copy link");
  }
}

/** Share through the system sheet when coherent, else copy. Cancel is silent. */
export async function sharePatchHubLink({ url, title }: PatchHubShareInput): Promise<void> {
  if (canUseNativeShare()) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Share failed for another reason: copying is still a working answer.
    }
  }
  await copy(url);
}

export const usePatchHubShare = () => useCallback((input: PatchHubShareInput) => sharePatchHubLink(input), []);
