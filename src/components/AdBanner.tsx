import { useEffect, useRef, useState } from "react";

interface AdBannerProps {
  slot: string;
  format?: "auto" | "rectangle" | "horizontal";
  className?: string;
  clientId?: string;
}

declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

export default function AdBanner({ slot, format = "auto", className = "", clientId }: AdBannerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const insRef = useRef<HTMLModElement | null>(null);
  const pushed = useRef(false);
  const [status, setStatus] = useState<"waiting" | "filled" | "unfilled">("waiting");

  const client = clientId || "ca-pub-9823769047605421";

  // Detect dev/preview hosts — Google requires data-adtest="on" outside approved domains
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const search = typeof window !== "undefined" ? window.location.search : "";
  const isProdHost = /(^|\.)mogsy\.(net|app)$/i.test(host);
  const forceTest = /[?&]adtest=on\b/.test(search);
  const adTest = !isProdHost || forceTest;

  // Slot misconfiguration: AdSense requires a numeric slot ID, not "auto"
  const slotLooksInvalid = !slot || slot === "auto" || !/^\d+$/.test(String(slot));

  useEffect(() => {
    if (pushed.current) return;
    // Script is loaded globally in index.html; just push the unit
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch (err) {
      console.warn("[AdSense] push failed:", err);
    }

    // Poll for fill status — AdSense sets data-ad-status to "filled" or "unfilled"
    const start = Date.now();
    const interval = setInterval(() => {
      const el = insRef.current;
      if (!el) return;
      const s = el.getAttribute("data-ad-status");
      if (s === "filled") {
        setStatus("filled");
        clearInterval(interval);
      } else if (s === "unfilled") {
        setStatus("unfilled");
        clearInterval(interval);
      } else if (Date.now() - start > 6000) {
        setStatus("unfilled");
        clearInterval(interval);
      }
    }, 400);
    return () => clearInterval(interval);
  }, [client]);

  return (
    <div ref={wrapRef} className={`relative overflow-hidden ${className}`}>
      {/* Diagnostic placeholder — visible until a real ad fills the slot */}
      {status !== "filled" && (
        <div className="absolute inset-0 z-0 flex flex-col items-center justify-center bg-secondary/60 border border-dashed border-border rounded-xl p-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Google AdSense</p>
          <p className="text-sm font-bold text-foreground mt-1">Ad slot active</p>
          <p className="text-[10px] text-muted-foreground mt-2 break-all">
            {client} · slot {String(slot)}
          </p>
          <p className={`text-[11px] mt-2 font-semibold ${status === "unfilled" ? "text-amber-500" : "text-primary"}`}>
            {status === "waiting" && "Waiting for ad fill…"}
            {status === "unfilled" && "No ad served (unfilled)"}
          </p>
          {adTest && (
            <p className="text-[10px] text-muted-foreground mt-1">Test mode (data-adtest="on")</p>
          )}
          {slotLooksInvalid && (
            <p className="text-[10px] text-amber-500 mt-1">⚠ Slot ID is not numeric — set a real AdSense slot in Admin → Ads</p>
          )}
        </div>
      )}
      <ins
        ref={(el) => { insRef.current = el as HTMLModElement | null; }}
        className="adsbygoogle relative z-10"
        style={{ display: "block", width: "100%", height: "100%", minHeight: 200 }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
        {...(adTest ? { "data-adtest": "on" } : {})}
      />
    </div>
  );
}
