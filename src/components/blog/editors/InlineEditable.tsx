import { useEffect, useRef } from "react";

interface Props {
  html: string;
  onChange: (html: string) => void;
  tag?: keyof JSX.IntrinsicElements;
  className?: string;
  placeholder?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void;
  onFocus?: () => void;
  ariaLabel?: string;
  dataBlockId?: string;
}

/**
 * Uncontrolled contentEditable bound to an HTML string. The DOM is the source
 * of truth while focused; we only sync `html` back in when it changes from
 * the outside (e.g. on first mount or when another tab/operation rewrites it).
 */
export default function InlineEditable({
  html,
  onChange,
  tag = "div",
  className,
  placeholder,
  style,
  multiline = true,
  onKeyDown,
  onFocus,
  ariaLabel,
  dataBlockId,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const lastSynced = useRef(html);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (html !== lastSynced.current && html !== el.innerHTML) {
      el.innerHTML = html ?? "";
      lastSynced.current = html;
    }
  }, [html]);

  const Tag = tag as any;
  return (
    <Tag
      ref={ref as any}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline={multiline}
      data-block-id={dataBlockId}
      data-placeholder={placeholder}
      spellCheck
      className={`blog-editable outline-none focus:outline-none ${className ?? ""}`}
      style={style}
      onFocus={onFocus}
      onInput={(e) => {
        const v = (e.currentTarget as HTMLElement).innerHTML;
        lastSynced.current = v;
        onChange(v);
      }}
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") e.preventDefault();
        onKeyDown?.(e);
      }}
      onPaste={(e) => {
        // Force plain text paste to avoid pulling Word/Docs styles in
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      }}
      dangerouslySetInnerHTML={{ __html: html ?? "" }}
    />
  );
}
