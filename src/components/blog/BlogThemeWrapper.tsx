import { useEffect, useMemo } from "react";
import { getBlogTheme, FONT_PAIRS, ensureBlogFontsLoaded } from "@/lib/blog/themes";
import type { BlogTheme } from "@/lib/blog/types";

/** Wraps blog content with .blog-scope and injects CSS variables for theme/fonts/accent. */
export default function BlogThemeWrapper({
  theme,
  children,
  className = "",
}: {
  theme: BlogTheme | null | undefined;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    ensureBlogFontsLoaded();
  }, []);

  const style = useMemo(() => {
    const preset = getBlogTheme(theme?.preset);
    const pair = theme?.headingFont && FONT_PAIRS[theme.headingFont]
      ? FONT_PAIRS[theme.headingFont]
      : FONT_PAIRS["space-grotesk-dm-sans"];
    const vars: Record<string, string> = { ...preset.vars };
    if (theme?.accent) vars["--blog-accent"] = theme.accent;
    vars["--blog-heading-font"] = pair.heading;
    vars["--blog-body-font"] = pair.body;
    return vars as React.CSSProperties;
  }, [theme]);

  return (
    <div className={`blog-scope ${className}`} style={style}>
      {children}
    </div>
  );
}