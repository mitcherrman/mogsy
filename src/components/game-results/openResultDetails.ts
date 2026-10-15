/**
 * RC8 — open the compact end screen's "Match details" in place and bring it
 * into view. For a match whose review lives only on this screen (Role
 * Challenge is excluded from Ranked history by design). Returns whether a
 * disclosure was found.
 */
export function openResultDetails(root: ParentNode = document): boolean {
  const details = root.querySelector<HTMLDetailsElement>('[data-testid="result-details"]');
  if (!details) return false;
  details.open = true;
  details.scrollIntoView({ block: "nearest", behavior: "smooth" });
  details.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
  return true;
}
