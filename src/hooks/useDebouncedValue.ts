import { useEffect, useState } from "react";

/** Default settle time for search-as-you-type inputs. */
export const DEFAULT_DEBOUNCE_MS = 250;

/**
 * Trailing-edge debounce of a changing value.
 *
 * Used to key search queries: React Query keys on the debounced value, so
 * intermediate keystrokes never become requests and a slow earlier response
 * belongs to a different key than the current term.
 */
export function useDebouncedValue<T>(value: T, delay = DEFAULT_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
