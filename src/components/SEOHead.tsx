import { useEffect } from "react";
import { SITE_URL } from "@/lib/site-config";

interface SEOHeadProps {
  title: string;
  description: string;
  /** Optional override for the canonical / og:url path. Defaults to current pathname. */
  path?: string;
  image?: string;
}

function upsertMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export default function SEOHead({ title, description, path, image }: SEOHeadProps) {
  useEffect(() => {
    document.title = title;
    upsertMeta('meta[name="description"]', "name", "description", description);

    const routePath = path ?? (typeof window !== "undefined" ? window.location.pathname : "/");
    const url = `${SITE_URL}${routePath}`;

    // Canonical — self-reference per route
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", url);

    // Open Graph
    upsertMeta('meta[property="og:title"]', "property", "og:title", title);
    upsertMeta('meta[property="og:description"]', "property", "og:description", description);
    upsertMeta('meta[property="og:url"]', "property", "og:url", url);
    if (image) upsertMeta('meta[property="og:image"]', "property", "og:image", image);

    // Twitter
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    if (image) upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", image);
  }, [title, description, path, image]);

  return null;
}
