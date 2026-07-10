import { useEffect } from "react";
import { SITE_URL } from "@/lib/site-config";

interface SEOHeadProps {
  title: string;
  description: string;
  /** Optional override for the canonical / og:url path. Defaults to current pathname. */
  path?: string;
  image?: string;
  /** Optional JSON-LD structured data object(s) injected for this route. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  /** og:type, defaults to "website". Use "article" for blog posts. */
  type?: "website" | "article" | "profile";
  /** Article-specific Open Graph metadata, applied when type === "article". */
  article?: {
    publishedTime?: string | null;
    modifiedTime?: string | null;
    section?: string | null;
    tags?: string[] | null;
    author?: string | null;
  };
  /** Comma-separated keywords for the page. */
  keywords?: string;
  /** Ask crawlers not to index this route (utility/OBS/diagnostic pages). */
  noindex?: boolean;
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

export default function SEOHead({ title, description, path, image, jsonLd, type, article, keywords, noindex }: SEOHeadProps) {
  useEffect(() => {
    document.title = title;
    upsertMeta('meta[name="description"]', "name", "description", description);

    // Robots: set noindex on utility routes, and clear it again when a normal
    // route mounts (meta tags persist across SPA navigations).
    if (noindex) {
      upsertMeta('meta[name="robots"]', "name", "robots", "noindex, nofollow");
    } else {
      document.head.querySelector('meta[name="robots"]')?.remove();
    }

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
    upsertMeta('meta[property="og:type"]', "property", "og:type", type ?? "website");
    upsertMeta('meta[property="og:site_name"]', "property", "og:site_name", "Mogsy");
    if (image) upsertMeta('meta[property="og:image"]', "property", "og:image", image);

    // Twitter
    upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", image ? "summary_large_image" : "summary");
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    if (image) upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", image);

    if (keywords) upsertMeta('meta[name="keywords"]', "name", "keywords", keywords);

    // Article metadata + per-tag <meta property="article:tag"> nodes
    const articleNodes: HTMLMetaElement[] = [];
    if (type === "article" && article) {
      if (article.publishedTime) upsertMeta('meta[property="article:published_time"]', "property", "article:published_time", article.publishedTime);
      if (article.modifiedTime) upsertMeta('meta[property="article:modified_time"]', "property", "article:modified_time", article.modifiedTime);
      if (article.section) upsertMeta('meta[property="article:section"]', "property", "article:section", article.section);
      if (article.author) upsertMeta('meta[property="article:author"]', "property", "article:author", article.author);
      for (const tag of article.tags ?? []) {
        const node = document.createElement("meta");
        node.setAttribute("property", "article:tag");
        node.setAttribute("content", tag);
        node.dataset.seoRoute = "true";
        document.head.appendChild(node);
        articleNodes.push(node);
      }
    }

    // Per-route JSON-LD. Tagged so we can clean up on unmount/route change.
    const ldNodes: HTMLScriptElement[] = [];
    if (jsonLd) {
      const items = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
      for (const item of items) {
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.dataset.seoRoute = "true";
        script.text = JSON.stringify(item);
        document.head.appendChild(script);
        ldNodes.push(script);
      }
    }
    return () => {
      for (const node of ldNodes) node.remove();
      for (const node of articleNodes) node.remove();
    };
  }, [title, description, path, image, jsonLd, type, article, keywords, noindex]);

  return null;
}
