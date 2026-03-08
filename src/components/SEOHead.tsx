import { useEffect } from "react";
import { SITE_URL } from "@/lib/site-config";

interface SEOHeadProps {
  title: string;
  description: string;
}

export default function SEOHead({ title, description }: SEOHeadProps) {
  useEffect(() => {
    document.title = title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", description);
    }
  }, [title, description]);

  return null;
}
