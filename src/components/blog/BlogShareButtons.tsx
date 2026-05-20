import { useState } from "react";
import { Link2, Twitter, Facebook, Linkedin, Share2, Check } from "lucide-react";
import { toast } from "sonner";
import { SITE_URL } from "@/lib/site-config";

interface Props {
  slug: string;
  title: string;
  description?: string | null;
}

export default function BlogShareButtons({ slug, title, description }: Props) {
  const [copied, setCopied] = useState(false);
  const url = `${SITE_URL}/blog/${slug}`;
  const text = encodeURIComponent(title);
  const desc = encodeURIComponent(description || title);
  const enc = encodeURIComponent(url);

  const links = [
    { name: "X", icon: Twitter, href: `https://twitter.com/intent/tweet?text=${text}&url=${enc}` },
    { name: "Facebook", icon: Facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${enc}` },
    { name: "LinkedIn", icon: Linkedin, href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc}` },
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy link");
    }
  };

  const nativeShare = async () => {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title, text: description || title, url });
    } catch {
      // user cancelled
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 my-8 py-4 border-y border-border">
      <span className="text-xs uppercase tracking-widest blog-muted font-bold mr-1">Share</span>
      {typeof navigator !== "undefined" && (navigator as Navigator & { share?: unknown }).share && (
        <button
          onClick={nativeShare}
          aria-label="Share via device"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 min-h-9"
        >
          <Share2 className="h-3.5 w-3.5" /> Share
        </button>
      )}
      {links.map(({ name, icon: Icon, href }) => (
        <a
          key={name}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Share on ${name}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card text-foreground border border-border text-xs font-semibold hover:border-primary/40 min-h-9"
        >
          <Icon className="h-3.5 w-3.5" /> {name}
        </a>
      ))}
      <button
        onClick={copy}
        aria-label="Copy link"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card text-foreground border border-border text-xs font-semibold hover:border-primary/40 min-h-9"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}