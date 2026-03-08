import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Camera, Crown, CheckCircle2, XCircle, Search,
  Smartphone, Monitor, Play, Globe, User, Maximize2, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useScreenshot } from "@/hooks/useScreenshot";
import { useAnimationSound } from "@/hooks/useAnimationSound";
import MatchupCapture from "@/components/MatchupCapture";
import CardAnimationRouter from "@/components/animations/CardAnimationRouter";
import EloChangeIndicator from "@/components/EloChangeIndicator";
import TierBadge from "@/components/TierBadge";
import UserAvatar from "@/components/UserAvatar";
import { profileThemes } from "@/lib/profile-themes";
import { CARD_ANIMATIONS } from "@/lib/card-animations";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSitewideTheme } from "@/hooks/useSitewideTheme";
import { toast } from "sonner";

type DemoMode = "swipe-collections" | "swipe-users" | "aura-check";

interface CardData {
  name: string;
  subtitle: string;
  imageUrl: string;
  aura: number;
  rank: number;
  eloDelta: number;
  globalDirection: "up" | "down" | "none";
  isWinner: boolean;
  isPro: boolean;
  profileFrame: string;
  tier: string;
  leagueName: string;
}

const defaultCard = (side: "left" | "right"): CardData => ({
  name: side === "left" ? "Item A" : "Item B",
  subtitle: "",
  imageUrl: "",
  aura: 1200,
  rank: side === "left" ? 1 : 2,
  eloDelta: side === "left" ? 16 : -16,
  globalDirection: side === "left" ? "up" : "down",
  isWinner: side === "left",
  isPro: false,
  profileFrame: "default",
  tier: "silver",
  leagueName: "Collection",
});

export default function AdminDemo() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const captureRef = useRef<HTMLDivElement>(null);
  const { capture } = useScreenshot(captureRef);
  const { playAnimationSound } = useAnimationSound();

  const [mode, setMode] = useState<DemoMode>("swipe-collections");
  const [themeId, setThemeId] = useState("default");
  const [animationId, setAnimationId] = useState("default");
  const [deviceFrame, setDeviceFrame] = useState<"phone" | "full">("phone");
  const [leagueName, setLeagueName] = useState("Demo League");
  const [cardA, setCardA] = useState<CardData>(defaultCard("left"));
  const [cardB, setCardB] = useState<CardData>(defaultCard("right"));

  // Animation playback
  const [animWinner, setAnimWinner] = useState<0 | 1 | null>(null);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);

  // Aura Check state
  const [auraScore, setAuraScore] = useState(5);
  const [auraStreak, setAuraStreak] = useState(3);
  const [auraBest, setAuraBest] = useState(7);
  const [auraRevealed, setAuraRevealed] = useState(false);
  const [auraOnFire, setAuraOnFire] = useState(true);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchTarget, setSearchTarget] = useState<"a" | "b" | null>(null);

  const theme = profileThemes.find(t => t.id === themeId) || profileThemes[0];
  const { visualThemeId: sitewideThemeId } = useSitewideTheme();

  // Save the sitewide theme classes on mount, restore on unmount
  const savedClassesRef = useRef<string>("");
  useEffect(() => {
    savedClassesRef.current = document.documentElement.className;
    return () => {
      document.documentElement.className = savedClassesRef.current;
    };
  }, []);

  // Override <html> with the demo-selected theme, ignoring sitewide cycle changes
  useEffect(() => {
    const root = document.documentElement;
    root.className = root.className.replace(/theme-\S+/g, "").trim();

    if (themeId === "default") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
    } else {
      root.classList.add("dark");
      root.classList.add(`theme-${themeId}`);
    }
  }, [themeId]);

  // Block sitewide cycle theme from overriding the demo page
  useEffect(() => {
    if (!sitewideThemeId || sitewideThemeId === "default") return;
    // When the cycle changes the root classes, re-apply demo theme
    const observer = new MutationObserver(() => {
      const root = document.documentElement;
      const hasWrongTheme = Array.from(root.classList).some(
        c => c.startsWith("theme-") && c !== `theme-${themeId}`
      );
      if (hasWrongTheme) {
        root.className = root.className.replace(/theme-\S+/g, "").trim();
        if (themeId !== "default") {
          root.classList.add("dark", `theme-${themeId}`);
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [themeId, sitewideThemeId]);

  const searchItems = useCallback(async (query: string) => {
    if (!query || query.length < 2) { setSearchResults([]); return; }
    if (mode === "swipe-users" || mode === "aura-check") {
      const { data } = await supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url")
        .ilike("display_name", `%${query}%`)
        .limit(10);
      setSearchResults(data?.map(p => ({ id: p.id, name: p.display_name, imageUrl: p.avatar_url, type: "user" })) || []);
    } else {
      const { data } = await supabase
        .from("preset_items")
        .select("id, name, image_url, elo, subtitle")
        .ilike("name", `%${query}%`)
        .limit(10);
      setSearchResults(data?.map(i => ({ id: i.id, name: i.name, imageUrl: i.image_url, aura: i.elo, subtitle: i.subtitle, type: "preset" })) || []);
    }
  }, [mode]);

  const applySearchResult = (result: any, target: "a" | "b") => {
    const setter = target === "a" ? setCardA : setCardB;
    setter(prev => ({
      ...prev,
      name: result.name || prev.name,
      imageUrl: result.imageUrl || prev.imageUrl,
      subtitle: result.subtitle || prev.subtitle,
      aura: result.aura || prev.aura,
    }));
    setSearchTarget(null);
    setSearchResults([]);
    setSearchQuery("");
  };

  const handlePlayAnimation = () => {
    const winner = cardA.isWinner ? 0 : 1;
    playAnimationSound(animationId);
    setAnimWinner(winner as 0 | 1);
  };

  const handleAnimComplete = useCallback(() => {
    // Keep overlay briefly then clear
    setTimeout(() => setAnimWinner(null), 300);
  }, []);

  const themeStyle = theme.styles.pageBg ? { background: theme.styles.pageBg } : {};

  // Render card controls inline (not as a component, to preserve focus)
  const renderCardControls = (card: CardData, setCard: React.Dispatch<React.SetStateAction<CardData>>, side: "a" | "b") => (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-foreground">Card {side.toUpperCase()}</h3>

      {/* Search */}
      <div>
        <Label className="text-xs">Search {mode === "swipe-collections" ? "Items" : "Users"}</Label>
        <div className="relative">
          <Input
            placeholder="Search..."
            value={searchTarget === side ? searchQuery : ""}
            onFocus={() => setSearchTarget(side)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchTarget(side);
              searchItems(e.target.value);
            }}
            className="h-8 text-xs pr-8"
          />
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        </div>
        {searchTarget === side && searchResults.length > 0 && (
          <div className="mt-1 border border-border rounded-lg bg-card max-h-32 overflow-y-auto">
            {searchResults.map((r) => (
              <button
                key={r.id}
                onClick={() => applySearchResult(r, side)}
                className="w-full px-2 py-1.5 text-left text-xs hover:bg-secondary flex items-center gap-2"
              >
                {r.imageUrl ? (
                  <img src={r.imageUrl} className="h-5 w-5 rounded object-cover" />
                ) : (
                  <div className="h-5 w-5 rounded bg-muted flex items-center justify-center text-[8px] font-bold text-muted-foreground">{r.name?.charAt(0)}</div>
                )}
                <span className="truncate">{r.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Name</Label>
          <Input value={card.name} onChange={e => setCard(prev => ({ ...prev, name: e.target.value }))} className="h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs">Subtitle</Label>
          <Input value={card.subtitle} onChange={e => setCard(prev => ({ ...prev, subtitle: e.target.value }))} className="h-8 text-xs" />
        </div>
      </div>

      <div>
        <Label className="text-xs">Image URL</Label>
        <Input value={card.imageUrl} onChange={e => setCard(prev => ({ ...prev, imageUrl: e.target.value }))} className="h-8 text-xs" placeholder="https://..." />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Aura</Label>
          <Input type="number" value={card.aura} onChange={e => setCard(prev => ({ ...prev, aura: Number(e.target.value) }))} className="h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs">Rank #</Label>
          <Input type="number" value={card.rank} onChange={e => setCard(prev => ({ ...prev, rank: Number(e.target.value) }))} className="h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs">Elo Δ</Label>
          <Input type="number" value={card.eloDelta} onChange={e => setCard(prev => ({ ...prev, eloDelta: Number(e.target.value) }))} className="h-8 text-xs" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Switch
            checked={card.isWinner}
            onCheckedChange={(v) => {
              setCard(prev => ({ ...prev, isWinner: v }));
              const otherSetter = side === "a" ? setCardB : setCardA;
              otherSetter(prev => ({ ...prev, isWinner: !v }));
            }}
          />
          <Label className="text-xs">Winner</Label>
        </div>
        <Select value={card.globalDirection} onValueChange={v => setCard(prev => ({ ...prev, globalDirection: v as any }))}>
          <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="up">↑ Up</SelectItem>
            <SelectItem value="down">↓ Down</SelectItem>
            <SelectItem value="none">— None</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === "swipe-users" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Frame</Label>
            <Select value={card.profileFrame} onValueChange={v => setCard(prev => ({ ...prev, profileFrame: v }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["default", "gold", "neon", "fire", "diamond"].map(f => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tier</Label>
            <Select value={card.tier} onValueChange={v => setCard(prev => ({ ...prev, tier: v }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["bronze", "silver", "gold", "platinum"].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 col-span-2">
            <Switch checked={card.isPro} onCheckedChange={v => setCard(prev => ({ ...prev, isPro: v }))} />
            <Label className="text-xs">Pro Badge</Label>
          </div>
        </div>
      )}

      {mode === "aura-check" && (
        <div>
          <Label className="text-xs">League Label</Label>
          <Input value={card.leagueName} onChange={e => setCard(prev => ({ ...prev, leagueName: e.target.value }))} className="h-8 text-xs" />
        </div>
      )}
    </div>
  );

  const controlsContent = (
    <div className="space-y-5 p-4">
      {/* Mode */}
      <div>
        <Label className="text-xs font-bold">Mode</Label>
        <Select value={mode} onValueChange={v => setMode(v as DemoMode)}>
          <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="swipe-collections">Swipe (Collections)</SelectItem>
            <SelectItem value="swipe-users">Swipe (Users)</SelectItem>
            <SelectItem value="aura-check">Aura Check</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Theme */}
      <div>
        <Label className="text-xs font-bold">Theme</Label>
        <Select value={themeId} onValueChange={setThemeId}>
          <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {profileThemes.filter(t => t.id !== "cycle").map(t => (
              <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Animation + Play */}
      {mode !== "aura-check" && (
        <div>
          <Label className="text-xs font-bold">Animation</Label>
          <div className="flex gap-1.5 mt-1">
            <Select value={animationId} onValueChange={setAnimationId}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CARD_ANIMATIONS.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.icon} {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-8 px-2" onClick={handlePlayAnimation}>
              <Play className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* League Name */}
      <div>
        <Label className="text-xs font-bold">League Name</Label>
        <Input value={leagueName} onChange={e => setLeagueName(e.target.value)} className="h-8 text-xs mt-1" />
      </div>

      {/* Device Frame */}
      <div className="flex gap-2">
        <Button
          variant={deviceFrame === "phone" ? "default" : "outline"}
          size="sm"
          onClick={() => setDeviceFrame("phone")}
          className="flex-1 gap-1"
        >
          <Smartphone className="h-3.5 w-3.5" /> Phone
        </Button>
        <Button
          variant={deviceFrame === "full" ? "default" : "outline"}
          size="sm"
          onClick={() => setDeviceFrame("full")}
          className="flex-1 gap-1"
        >
          <Monitor className="h-3.5 w-3.5" /> Full
        </Button>
      </div>

      {/* Aura Check controls */}
      {mode === "aura-check" && (
        <div className="space-y-3 border-t border-border pt-3">
          <h3 className="text-xs font-bold text-foreground">Aura Check Settings</h3>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Score</Label>
              <Input type="number" value={auraScore} onChange={e => setAuraScore(Number(e.target.value))} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Streak</Label>
              <Input type="number" value={auraStreak} onChange={e => setAuraStreak(Number(e.target.value))} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Best</Label>
              <Input type="number" value={auraBest} onChange={e => setAuraBest(Number(e.target.value))} className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Switch checked={auraRevealed} onCheckedChange={setAuraRevealed} />
              <Label className="text-xs">Revealed</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch checked={auraOnFire} onCheckedChange={setAuraOnFire} />
              <Label className="text-xs">On Fire</Label>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-border pt-3">
        {renderCardControls(cardA, setCardA, "a")}
      </div>
      <div className="border-t border-border pt-3">
        {renderCardControls(cardB, setCardB, "b")}
      </div>
    </div>
  );

  // Frame classes for profile cards
  const frameClasses: Record<string, string> = {
    default: "",
    gold: "ring-4 ring-yellow-400/60",
    neon: "ring-4 ring-primary/60 shadow-[0_0_20px_hsl(210_80%_60%/0.4)]",
    fire: "ring-4 ring-orange-500/60 shadow-[0_0_20px_hsl(25_100%_50%/0.4)]",
    diamond: "ring-4 ring-cyan-300/60 shadow-[0_0_20px_hsl(180_80%_70%/0.4)]",
  };

  const renderSwipeCard = (card: CardData, idx: 0 | 1) => {
    const isWinner = card.isWinner;
    const isLoser = !card.isWinner;
    const isUserMode = mode === "swipe-users";
    const frame = isUserMode ? (frameClasses[card.profileFrame] || "") : "";

    return (
      <div className="flex flex-col flex-1 min-h-0 rounded-2xl border border-border bg-card overflow-hidden">
        <div
          className={`relative overflow-hidden transition-all duration-300 ${
            isWinner
              ? "ring-2 ring-primary shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
              : "opacity-50"
          }`}
        >
          <div className={`w-full aspect-[3/4] bg-muted/30 overflow-hidden ${frame}`}>
            {card.imageUrl ? (
              <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover" />
            ) : isUserMode ? (
              <div className="w-full h-full bg-gradient-to-b from-muted-foreground/30 to-muted-foreground/50 flex items-center justify-center">
                <User className="h-12 w-12 text-muted-foreground/70" />
              </div>
            ) : (
              <span className="flex h-full w-full items-center justify-center text-4xl font-black text-muted-foreground/30">
                {card.name.charAt(0)}
              </span>
            )}
          </div>

          {isWinner && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground rounded-full p-1.5 shadow-lg"
            >
              <Crown className="h-4 w-4" />
            </motion.div>
          )}

          {isUserMode && card.isPro && (
            <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-primary flex items-center justify-center">
              <Crown className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
          )}
        </div>

        <div className="px-2 py-1.5 flex-shrink-0">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <h3 className="text-sm font-extrabold text-foreground truncate">{card.name}</h3>
              {isUserMode && <TierBadge tier={card.tier} />}
            </div>
            {card.subtitle && <p className="text-[10px] text-muted-foreground truncate">{card.subtitle}</p>}
          </div>
          <div className="flex items-center justify-center gap-3 mt-0.5">
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
              <span className="font-semibold text-primary">{card.aura}</span>
              <span className="text-muted-foreground/70">#{card.rank}</span>
              <span className="mx-1 text-muted-foreground/30">|</span>
              <Globe className="h-2.5 w-2.5 text-blue-400/70" />
              <span className="font-semibold text-blue-400">{card.aura}</span>
              <span className="text-blue-400/70">#{card.rank}</span>
            </span>
          </div>
          <div className="flex justify-center mt-0.5">
            <EloChangeIndicator
              change={card.eloDelta}
              globalDirection={card.globalDirection}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderAuraCard = (card: CardData, idx: 0 | 1) => {
    const isHigher = card.aura >= (idx === 0 ? cardB : cardA).aura;

    return (
      <div
        className={`relative rounded-2xl border bg-card overflow-hidden flex flex-col ${
          auraRevealed
            ? isHigher
              ? "border-emerald-500/50 ring-2 ring-emerald-500/30"
              : "border-red-500/30 opacity-70"
            : auraOnFire
            ? "border-orange-500/50 shadow-[0_0_15px_hsl(25_100%_50%/0.3)]"
            : "border-border"
        }`}
      >
        <div className="aspect-[3/4] w-full bg-muted overflow-hidden relative">
          {card.imageUrl ? (
            <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-5xl font-black text-muted-foreground/20">
              {card.name.charAt(0)}
            </span>
          )}

          <AnimatePresence>
            {auraRevealed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`absolute inset-0 flex flex-col items-center justify-center ${
                  isHigher ? "bg-emerald-500/20" : "bg-red-500/20"
                }`}
              >
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                >
                  {isHigher ? (
                    <CheckCircle2 className="h-12 w-12 text-emerald-400 drop-shadow-lg" />
                  ) : (
                    <XCircle className="h-12 w-12 text-red-400 drop-shadow-lg" />
                  )}
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mt-2 rounded-full bg-background/80 backdrop-blur-sm px-3 py-1"
                >
                  <span className="text-sm font-bold text-foreground">
                    <span className="uppercase tracking-wider">Aura</span>: {card.aura}
                  </span>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-3">
          <h3 className="text-sm font-bold text-foreground truncate">{card.name}</h3>
          <p className="text-[10px] text-muted-foreground truncate">{card.leagueName}</p>
          {auraRevealed && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`text-xs font-bold mt-1 ${isHigher ? "text-emerald-400" : "text-red-400"}`}
            >
              {isHigher ? "Higher ✓" : "Lower ✗"}
            </motion.p>
          )}
        </div>
      </div>
    );
  };

  const previewContent = (
    <div
      className={`rounded-2xl border border-border overflow-hidden transition-all ${
        deviceFrame === "phone" ? "max-w-[375px] mx-auto" : "w-full"
      }`}
      style={themeStyle}
    >
      <div className="p-3">
        {mode === "aura-check" ? (
          /* Aura Check preview */
          <div>
            <div className="flex items-center justify-center gap-6 mb-3">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Score</p>
                <p className="text-2xl font-black text-primary">{auraScore}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Streak</p>
                <p className="text-2xl font-black text-foreground">{auraStreak}🔥</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Best</p>
                <p className="text-2xl font-black text-muted-foreground">{auraBest}</p>
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground mb-3">
              Who's ranked higher in their league?
            </p>
            <MatchupCapture ref={captureRef} leagueName={leagueName}>
              <div className="grid grid-cols-2 gap-3">
                {renderAuraCard(cardA, 0)}
                {renderAuraCard(cardB, 1)}
              </div>
            </MatchupCapture>
            {auraRevealed && (
              <motion.p
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
                className={`text-lg font-black text-center mt-3 ${
                  cardA.aura >= cardB.aura ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {cardA.aura >= cardB.aura ? "Correct! 🎉" : "Wrong! 😬" }
              </motion.p>
            )}
          </div>
        ) : (
          /* Swipe preview */
          <MatchupCapture ref={captureRef} leagueName={leagueName}>
            <div className="flex gap-1 relative">
              {renderSwipeCard(cardA, 0)}
              <div className="flex items-center justify-center shrink-0">
                <span className="text-xs font-black text-muted-foreground/60 select-none">VS</span>
              </div>
              {renderSwipeCard(cardB, 1)}

              <CardAnimationRouter
                animationId={animationId}
                winnerSide={animWinner}
                items={[cardA, cardB].map(c => ({
                  imageUrl: c.imageUrl || null,
                  name: c.name,
                  subtitle: c.subtitle,
                  localElo: c.aura,
                  localRank: c.rank,
                  globalElo: c.aura,
                  globalRank: c.rank,
                  eloVisible: true,
                  rankVisible: true,
                  eloChange: c.eloDelta,
                  rankOld: null,
                  rankNew: null,
                  globalDirection: c.globalDirection,
                }))}
                onComplete={handleAnimComplete}
              />
            </div>
          </MatchupCapture>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen px-3 py-4" style={themeStyle}>
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-extrabold text-foreground flex-1">Demo Studio</h1>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFullscreenPreview(true)}>
            <Maximize2 className="h-3.5 w-3.5" /> Preview
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={capture}>
            <Camera className="h-3.5 w-3.5" /> Screenshot
          </Button>
        </div>

        {isMobile ? (
          /* Mobile: sheet for controls, full preview */
          <div>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="w-full mb-3">
                  Edit Controls
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
                {controlsContent}
              </SheetContent>
            </Sheet>
            {previewContent}
          </div>
        ) : (
          /* Desktop: side by side */
          <div className="grid grid-cols-[320px_1fr] gap-4">
            <div className="border border-border rounded-xl bg-card overflow-y-auto max-h-[calc(100vh-120px)]">
              {controlsContent}
            </div>
            <div className="flex items-start justify-center">
              {previewContent}
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen swipe-game preview */}
      <AnimatePresence>
        {fullscreenPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col"
            style={themeStyle}
          >
            {/* Top bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setFullscreenPreview(false)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-bold text-foreground truncate flex-1">{leagueName}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setFullscreenPreview(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Card area */}
            <div className="flex-1 flex items-center justify-center p-4 overflow-hidden" style={{ background: theme?.styles?.pageBg || "hsl(var(--background))" }}>
              <div className={`w-full ${deviceFrame === "phone" ? "max-w-[375px]" : "max-w-[600px]"}`}>
                {mode === "aura-check" ? (
                  <div>
                    <div className="flex items-center justify-center gap-6 mb-4">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Score</p>
                        <p className="text-2xl font-black text-primary">{auraScore}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Streak</p>
                        <p className="text-2xl font-black text-foreground">{auraStreak}🔥</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Best</p>
                        <p className="text-2xl font-black text-muted-foreground">{auraBest}</p>
                      </div>
                    </div>
                    <p className="text-center text-sm text-muted-foreground mb-3">Who's ranked higher in their league?</p>
                    <div className="grid grid-cols-2 gap-3">
                      {renderAuraCard(cardA, 0)}
                      {renderAuraCard(cardB, 1)}
                    </div>
                    {auraRevealed && (
                      <motion.p
                        initial={{ scale: 0.5 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 15 }}
                        className={`text-lg font-black text-center mt-3 ${
                          cardA.aura >= cardB.aura ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {cardA.aura >= cardB.aura ? "Correct! 🎉" : "Wrong! 😬"}
                      </motion.p>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-1 relative">
                    {renderSwipeCard(cardA, 0)}
                    <div className="flex items-center justify-center shrink-0">
                      <span className="text-xs font-black text-muted-foreground/60 select-none">VS</span>
                    </div>
                    {renderSwipeCard(cardB, 1)}
                    <CardAnimationRouter
                      animationId={animationId}
                      winnerSide={animWinner}
                      items={[cardA, cardB].map(c => ({
                        imageUrl: c.imageUrl || null,
                        name: c.name,
                        subtitle: c.subtitle,
                        localElo: c.aura,
                        localRank: c.rank,
                        globalElo: c.aura,
                        globalRank: c.rank,
                        eloVisible: true,
                        rankVisible: true,
                        eloChange: c.eloDelta,
                        rankOld: null,
                        rankNew: null,
                        globalDirection: c.globalDirection,
                      }))}
                      onComplete={handleAnimComplete}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Bottom bar */}
            <div className="flex items-center justify-center gap-4 px-4 py-3 border-t border-border bg-card/80 backdrop-blur-sm">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={capture}>
                <Camera className="h-3.5 w-3.5" /> Screenshot
              </Button>
              {mode !== "aura-check" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    const winner = cardA.isWinner ? 0 : 1;
                    setAnimWinner(winner as 0 | 1);
                    playAnimationSound(animationId);
                  }}
                >
                  <Play className="h-3.5 w-3.5" /> Play Animation
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

