/**
 * PGM1 — the public catalog read. A public GET: no bearer is sent and no
 * identity is ever minted (USERS1), exactly like the Role Challenge catalog.
 */
import { useQuery } from "@tanstack/react-query";
import { RANKED_API_BASE } from "@/lib/ranked-public/client";
import { readPublicModeCatalog, type PublicModeCatalog } from "./contracts";

export class PublicModeCatalogError extends Error {
  constructor(public kind: "backend" | "network" | "invalid_response", public status: number, message: string) {
    super(message);
    this.name = "PublicModeCatalogError";
  }
}

export const PUBLIC_MODES_PATH = "/api/game-modes";

export async function fetchPublicModeCatalog(signal?: AbortSignal): Promise<PublicModeCatalog> {
  let response: Response;
  try {
    response = await fetch(RANKED_API_BASE + PUBLIC_MODES_PATH, { method: "GET", signal });
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") throw e;
    throw new PublicModeCatalogError("network", 0, "could not reach More Challenges");
  }
  if (!response.ok) {
    throw new PublicModeCatalogError("backend", response.status, `request failed (${response.status})`);
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new PublicModeCatalogError("invalid_response", response.status, "malformed catalog");
  }
  try {
    return readPublicModeCatalog(json);
  } catch (e) {
    throw new PublicModeCatalogError("invalid_response", response.status,
      e instanceof Error ? e.message : "catalog failed validation");
  }
}

export const PUBLIC_MODES_QUERY_KEY = ["public-game-modes"] as const;

/**
 * Read on entry. Availability can change (the owner's Daily pause), so the
 * cache is short and a focus refetch is allowed; nothing polls.
 */
export function usePublicModeCatalog() {
  return useQuery<PublicModeCatalog>({
    queryKey: PUBLIC_MODES_QUERY_KEY,
    queryFn: ({ signal }) => fetchPublicModeCatalog(signal),
    staleTime: 60_000,
    refetchInterval: false,
    retry: 1,
  });
}
