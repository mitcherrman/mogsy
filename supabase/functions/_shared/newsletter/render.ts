// EMAIL1 — message rendering. Pure TypeScript, no template engine: every piece
// of text that reaches HTML goes through escapeHtml, and the only markup an
// author can produce is the small allow-list in renderMarkdown. Campaign copy
// is written by the owner, but the preview and the sent email are the same
// code path, so what the owner reviews is what recipients get.

import { EMAIL_TOPIC_LABELS, type EmailTopic } from "./topics.ts";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const MAX_SUBJECT_LENGTH = 150;
export const MAX_PREHEADER_LENGTH = 200;
export const MAX_BODY_LENGTH = 20_000;

/** https only, no whitespace/control characters, bounded length. */
export function isSafeHttpsUrl(url: string): boolean {
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (url.length > 2000 || /[\s\u0000-\u001f<>"']/.test(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
}

function inline(escaped: string): string {
  // Input is ALREADY escaped, so a `"` cannot terminate the href attribute and
  // `<` cannot open a tag. Links must be https; anything else stays as text.
  let out = escaped.replace(/\[([^\]\n]{1,200})\]\((https:\/\/[^\s)]{1,2000})\)/g, (m, text: string, href: string) => {
    const raw = href.replace(/&amp;/g, "&");
    return isSafeHttpsUrl(raw) ? `<a href="${href}" style="color:#7c5cff">${text}</a>` : m;
  });
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g, "$1<em>$2</em>");
  return out;
}

/** Headings (#, ##, ###), bullet lists (- or *), paragraphs, **bold**, *italic*, [text](https://…). */
export function renderMarkdown(source: string): string {
  const blocks = source.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/);
  const html: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const heading = /^(#{1,3})\s+(.+)$/.exec(lines[0]);
    if (heading && lines.length === 1) {
      const level = heading[1].length + 1; // # -> h2: the email title is h1
      html.push(
        `<h${level} style="margin:24px 0 8px;font-size:${level === 2 ? 20 : 17}px;line-height:1.3;color:#111">${inline(escapeHtml(heading[2]))}</h${level}>`,
      );
    } else if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      const items = lines.map((l) => `<li style="margin:4px 0">${inline(escapeHtml(l.replace(/^\s*[-*]\s+/, "")))}</li>`);
      html.push(`<ul style="margin:12px 0;padding-left:22px">${items.join("")}</ul>`);
    } else {
      html.push(`<p style="margin:12px 0;line-height:1.55">${inline(escapeHtml(lines.join("\n"))).replace(/\n/g, "<br>")}</p>`);
    }
  }
  return html.join("\n");
}

export function markdownToText(source: string): string {
  return source
    .replace(/\r\n?/g, "\n")
    .replace(/\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .trim();
}

export interface CampaignRenderInput {
  subject: string;
  preheader?: string | null;
  bodyMarkdown: string;
  topic: EmailTopic;
  siteName: string;
  siteUrl: string;
  /** Required for a real send (CAN-SPAM). Placeholder text is used in previews. */
  postalAddress: string | null;
  unsubscribeUrl: string;
  preferencesUrl: string;
}

export interface RenderedMessage {
  html: string;
  text: string;
}

function shell(opts: { title: string; preheader: string; inner: string; footerHtml: string }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(opts.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#222">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;overflow:hidden">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px"><tr><td style="padding:28px 28px 8px">
<h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:#111">${escapeHtml(opts.title)}</h1>
${opts.inner}
</td></tr><tr><td style="padding:16px 28px 28px;border-top:1px solid #eee;font-size:12px;line-height:1.5;color:#666">
${opts.footerHtml}
</td></tr></table></td></tr></table></body></html>`;
}

export function renderCampaign(i: CampaignRenderInput): RenderedMessage {
  const address = i.postalAddress?.trim() || "[postal address not configured — sending is blocked until it is]";
  const topicLabel = EMAIL_TOPIC_LABELS[i.topic];
  const footerHtml = `You are receiving this because you asked for “${escapeHtml(topicLabel)}” emails from ${escapeHtml(i.siteName)}.<br>
<a href="${escapeHtml(i.unsubscribeUrl)}" style="color:#666">Unsubscribe</a> · <a href="${escapeHtml(i.preferencesUrl)}" style="color:#666">Email preferences</a><br>
${escapeHtml(i.siteName)} · ${escapeHtml(address).replace(/\n/g, "<br>")}`;
  const html = shell({
    title: i.subject,
    preheader: i.preheader ?? "",
    inner: renderMarkdown(i.bodyMarkdown),
    footerHtml,
  });
  const text = [
    i.subject,
    "",
    markdownToText(i.bodyMarkdown),
    "",
    "--",
    `You are receiving this because you asked for "${topicLabel}" emails from ${i.siteName}.`,
    `Unsubscribe: ${i.unsubscribeUrl}`,
    `Email preferences: ${i.preferencesUrl}`,
    `${i.siteName} · ${address}`,
  ].join("\n");
  return { html, text };
}

export interface ConfirmationRenderInput {
  siteName: string;
  siteUrl: string;
  topics: EmailTopic[];
  confirmUrl: string;
  ttlHours: number;
}

export function renderConfirmation(i: ConfirmationRenderInput): RenderedMessage {
  const items = i.topics.map((t) => `<li style="margin:4px 0">${escapeHtml(EMAIL_TOPIC_LABELS[t])}</li>`).join("");
  const inner = `<p style="margin:12px 0;line-height:1.55">Someone — hopefully you — asked ${escapeHtml(i.siteName)} to email this address about:</p>
<ul style="margin:12px 0;padding-left:22px">${items}</ul>
<p style="margin:20px 0"><a href="${escapeHtml(i.confirmUrl)}" style="display:inline-block;background:#7c5cff;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">Confirm my subscription</a></p>
<p style="margin:12px 0;line-height:1.55;font-size:13px;color:#555">This link works for ${i.ttlHours} hours. If you didn't ask for this, ignore this email and you won't be subscribed — nothing happens until you confirm.</p>`;
  const html = shell({
    title: "Confirm your Mogzy email preferences",
    preheader: "One click to confirm. If this wasn't you, ignore this email.",
    inner,
    footerHtml: `${escapeHtml(i.siteName)} · <a href="${escapeHtml(i.siteUrl)}" style="color:#666">${escapeHtml(i.siteUrl.replace(/^https?:\/\//, ""))}</a>`,
  });
  const text = [
    "Confirm your Mogzy email preferences",
    "",
    `Someone - hopefully you - asked ${i.siteName} to email this address about:`,
    ...i.topics.map((t) => `- ${EMAIL_TOPIC_LABELS[t]}`),
    "",
    `Confirm: ${i.confirmUrl}`,
    "",
    `This link works for ${i.ttlHours} hours. If you didn't ask for this, ignore this email - nothing happens until you confirm.`,
  ].join("\n");
  return { html, text };
}
