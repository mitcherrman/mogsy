import DOMPurify, { type Config } from "dompurify";

/** Strict allowlist for rich-text block content (no scripts, no event handlers, no iframes). */
const RICH_TEXT_CONFIG: Config = {
  ALLOWED_TAGS: [
    "b", "strong", "i", "em", "u", "s", "strike", "sub", "sup",
    "a", "br", "p", "span", "ul", "ol", "li", "blockquote",
    "code", "pre", "h1", "h2", "h3", "h4", "h5", "h6",
    "mark", "small",
  ],
  ALLOWED_ATTR: ["href", "title", "target", "rel"],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "style"],
};

/** Embed block — limited iframe/img allowance for trusted embed snippets. */
const EMBED_CONFIG: Config = {
  ALLOWED_TAGS: [
    "iframe", "a", "p", "div", "span", "br", "img",
    "b", "strong", "i", "em", "u", "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "blockquote",
  ],
  ALLOWED_ATTR: [
    "href", "title", "target", "rel",
    "src", "width", "height", "alt", "loading",
    "allow", "allowfullscreen", "frameborder", "referrerpolicy",
  ],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
  FORBID_TAGS: ["script", "style", "object", "form"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "style"],
};

export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(String(html), RICH_TEXT_CONFIG) as unknown as string;
}

export function sanitizeEmbed(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(String(html), EMBED_CONFIG) as unknown as string;
}
