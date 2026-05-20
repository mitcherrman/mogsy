/**
 * Theme presets for blog posts. Each preset is exposed as a set of
 * CSS variables consumed by .blog-scope so that styling never leaks
 * to the rest of the app shell.
 */

export interface BlogThemePreset {
  id: string;
  label: string;
  vars: Record<string, string>;
}

export const FONT_PAIRS: Record<string, { heading: string; body: string; label: string }> = {
  "space-grotesk-dm-sans": { label: "Modern Tech", heading: "'Space Grotesk', sans-serif", body: "'DM Sans', sans-serif" },
  "syne-plus-jakarta": { label: "Creative Startup", heading: "'Syne', sans-serif", body: "'Plus Jakarta Sans', sans-serif" },
  "instrument-serif-work-sans": { label: "Editorial", heading: "'Instrument Serif', serif", body: "'Work Sans', sans-serif" },
  "dm-serif-display-fira-sans": { label: "Brand Storytelling", heading: "'DM Serif Display', serif", body: "'Fira Sans', sans-serif" },
  "cormorant-karla": { label: "Luxury", heading: "'Cormorant Garamond', serif", body: "'Karla', sans-serif" },
  "bebas-neue-barlow": { label: "Sports / Bold", heading: "'Bebas Neue', sans-serif", body: "'Barlow', sans-serif" },
  "archivo-black-hind": { label: "News / Activism", heading: "'Archivo Black', sans-serif", body: "'Hind', sans-serif" },
  "abril-fatface-cabin": { label: "Creative Portfolio", heading: "'Abril Fatface', serif", body: "'Cabin', sans-serif" },
};

/**
 * Inject the Google Fonts link for every pair once on the client.
 * The font list is small so we just request all of them in one stylesheet.
 */
export function ensureBlogFontsLoaded() {
  if (typeof document === "undefined") return;
  const id = "blog-google-fonts";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?" +
    [
      "family=Space+Grotesk:wght@400;500;600;700",
      "family=DM+Sans:wght@400;500;600;700",
      "family=Syne:wght@500;700;800",
      "family=Plus+Jakarta+Sans:wght@400;500;600;700",
      "family=Instrument+Serif:ital@0;1",
      "family=Work+Sans:wght@400;500;600",
      "family=DM+Serif+Display:ital@0;1",
      "family=Fira+Sans:wght@400;500;600",
      "family=Cormorant+Garamond:wght@400;500;600;700",
      "family=Karla:wght@400;500;600",
      "family=Bebas+Neue",
      "family=Barlow:wght@400;500;600",
      "family=Archivo+Black",
      "family=Hind:wght@400;500;600",
      "family=Abril+Fatface",
      "family=Cabin:wght@400;500;600",
    ].join("&") +
    "&display=swap";
  document.head.appendChild(link);
}

export const BLOG_THEMES: BlogThemePreset[] = [
  {
    id: "editorial",
    label: "Dark Editorial",
    vars: {
      "--blog-bg": "#0a0a14",
      "--blog-surface": "#11111c",
      "--blog-text": "#e8e8f0",
      "--blog-muted": "#8a8aa3",
      "--blog-accent": "#a78bfa",
      "--blog-border": "rgba(255,255,255,0.08)",
    },
  },
  {
    id: "neon",
    label: "Neon",
    vars: {
      "--blog-bg": "#06061a",
      "--blog-surface": "#0f0f2e",
      "--blog-text": "#f0f0ff",
      "--blog-muted": "#7676b0",
      "--blog-accent": "#73ffb8",
      "--blog-border": "rgba(115,255,184,0.18)",
    },
  },
  {
    id: "paper",
    label: "Paper",
    vars: {
      "--blog-bg": "#f5f3ee",
      "--blog-surface": "#ffffff",
      "--blog-text": "#1a1a1a",
      "--blog-muted": "#6b6b66",
      "--blog-accent": "#c4654a",
      "--blog-border": "rgba(0,0,0,0.1)",
    },
  },
  {
    id: "magazine",
    label: "Magazine",
    vars: {
      "--blog-bg": "#fafbfc",
      "--blog-surface": "#ffffff",
      "--blog-text": "#0d1b2a",
      "--blog-muted": "#5a6b7d",
      "--blog-accent": "#0f3460",
      "--blog-border": "rgba(15,52,96,0.15)",
    },
  },
  {
    id: "brutalist",
    label: "Brutalist",
    vars: {
      "--blog-bg": "#ffffff",
      "--blog-surface": "#ffeb3b",
      "--blog-text": "#0a0a0a",
      "--blog-muted": "#444",
      "--blog-accent": "#ff5722",
      "--blog-border": "#0a0a0a",
    },
  },
  {
    id: "vapor",
    label: "Vapor",
    vars: {
      "--blog-bg": "#1a1a2e",
      "--blog-surface": "#2a2a4a",
      "--blog-text": "#fdf3ff",
      "--blog-muted": "#a594c4",
      "--blog-accent": "#ff79c6",
      "--blog-border": "rgba(255,121,198,0.25)",
    },
  },
  {
    id: "noir-gold",
    label: "Noir & Gold",
    vars: {
      "--blog-bg": "#0d0d0d",
      "--blog-surface": "#1a1a1a",
      "--blog-text": "#f0d78c",
      "--blog-muted": "#a08a4c",
      "--blog-accent": "#c9a84c",
      "--blog-border": "rgba(201,168,76,0.25)",
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    vars: {
      "--blog-bg": "#1a0a14",
      "--blog-surface": "#2a141e",
      "--blog-text": "#fff0e8",
      "--blog-muted": "#c98e7a",
      "--blog-accent": "#ff6b35",
      "--blog-border": "rgba(255,107,53,0.2)",
    },
  },
];

export const DEFAULT_BLOG_THEME = BLOG_THEMES[0];

export function getBlogTheme(id?: string | null): BlogThemePreset {
  return BLOG_THEMES.find((t) => t.id === id) ?? DEFAULT_BLOG_THEME;
}
