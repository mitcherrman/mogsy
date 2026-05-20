/**
 * Shared types for the blog system. Stored content lives in
 * `blog_posts.content` (jsonb) and follows one of three shapes
 * depending on the editor mode the admin chose for that post.
 */

export type BlogEditorMode = "blocks" | "rich" | "canvas";
export type BlogPostStatus = "draft" | "scheduled" | "published";

export type BlogAnimation =
  | "none"
  | "fade-in"
  | "slide-up"
  | "scale-in"
  | "parallax"
  | "shimmer";

export interface BlockStyle {
  align?: "left" | "center" | "right";
  fontFamily?: string;
  color?: string;
  background?: string;
  paddingY?: number;
  paddingX?: number;
  maxWidth?: number;
  animation?: BlogAnimation;
  fontSize?: number;
  fontWeight?: number;
  letterSpacing?: number;
  italic?: boolean;
  uppercase?: boolean;
}

export type BlockType =
  | "heading"
  | "paragraph"
  | "image"
  | "video"
  | "quote"
  | "callout"
  | "divider"
  | "columns"
  | "button"
  | "embed"
  | "spacer"
  | "item-card"
  | "profile-card"
  | "leaderboard"
  | "chart"
  | "adsense";

export interface BlogBlock {
  id: string;
  type: BlockType;
  /** Block-specific props (text content, src urls, embedded ids, etc.) */
  props: Record<string, any>;
  style?: BlockStyle;
}

export interface BlocksContent {
  mode: "blocks";
  blocks: BlogBlock[];
}

export interface RichContent {
  mode: "rich";
  /** Tiptap JSON document */
  doc: any;
  /** Inline Mogsy widgets referenced by the doc (id -> props) */
  widgets?: Record<string, { type: BlockType; props: Record<string, any> }>;
}

export interface CanvasNode {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  zIndex?: number;
  props: Record<string, any>;
  style?: BlockStyle;
}

export interface CanvasContent {
  mode: "canvas";
  w: number;
  h: number;
  nodes: CanvasNode[];
}

export type BlogContent = BlocksContent | RichContent | CanvasContent;

export interface BlogTheme {
  /** id of a preset in lib/blog/themes.ts */
  preset?: string;
  accent?: string; // hex
  headingFont?: string;
  bodyFont?: string;
  cover?: "full-bleed" | "boxed" | "split";
}

export interface BlogPostRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  cover_url: string | null;
  author_user_id: string;
  editor_mode: BlogEditorMode;
  content: BlogContent | Record<string, never>;
  theme: BlogTheme;
  tags: string[];
  category: string | null;
  status: BlogPostStatus;
  published_at: string | null;
  scheduled_at: string | null;
  views: number;
  seo_title: string | null;
  seo_description: string | null;
  og_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Heading",
  paragraph: "Text",
  image: "Image",
  video: "Video / GIF",
  quote: "Quote",
  callout: "Callout",
  divider: "Divider",
  columns: "Columns",
  button: "Button",
  embed: "Embed",
  spacer: "Spacer",
  "item-card": "Mogsy item card",
  "profile-card": "Profile card",
  leaderboard: "Leaderboard",
  chart: "Chart",
  adsense: "Ad slot (AdSense)",
};
