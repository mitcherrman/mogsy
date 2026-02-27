export interface ProfileTheme {
  id: string;
  label: string;
  isPro: boolean;
  preview: string; // gradient/color for preview swatch
  styles: {
    heroBg: string;
    cardBg: string;
    accentRing: string;
    textAccent: string;
  };
}

export const profileThemes: ProfileTheme[] = [
  {
    id: "default",
    label: "Default",
    isPro: false,
    preview: "bg-gradient-to-r from-primary/20 to-primary/5",
    styles: {
      heroBg: "bg-gradient-to-b from-primary/10 via-primary/5 to-transparent",
      cardBg: "",
      accentRing: "ring-primary/30",
      textAccent: "text-primary",
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    isPro: false,
    preview: "bg-gradient-to-r from-[hsl(230,40%,20%)] to-[hsl(260,30%,30%)]",
    styles: {
      heroBg: "bg-gradient-to-b from-[hsl(230,40%,15%)/0.4] via-[hsl(260,30%,20%)/0.2] to-transparent",
      cardBg: "border-[hsl(260,20%,30%)/0.3]",
      accentRing: "ring-[hsl(260,50%,60%)/0.4]",
      textAccent: "text-[hsl(260,60%,70%)]",
    },
  },
  {
    id: "forest",
    label: "Forest",
    isPro: false,
    preview: "bg-gradient-to-r from-[hsl(140,30%,20%)] to-[hsl(160,40%,30%)]",
    styles: {
      heroBg: "bg-gradient-to-b from-[hsl(140,30%,15%)/0.4] via-[hsl(160,30%,20%)/0.2] to-transparent",
      cardBg: "border-[hsl(150,20%,30%)/0.3]",
      accentRing: "ring-[hsl(150,50%,50%)/0.4]",
      textAccent: "text-[hsl(150,50%,55%)]",
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    isPro: true,
    preview: "bg-gradient-to-r from-[hsl(20,80%,50%)] to-[hsl(340,70%,50%)]",
    styles: {
      heroBg: "bg-gradient-to-b from-[hsl(20,80%,50%)/0.3] via-[hsl(340,60%,50%)/0.15] to-transparent",
      cardBg: "border-[hsl(340,40%,40%)/0.3]",
      accentRing: "ring-[hsl(20,80%,55%)/0.5]",
      textAccent: "text-[hsl(20,80%,60%)]",
    },
  },
  {
    id: "aurora",
    label: "Aurora",
    isPro: true,
    preview: "bg-gradient-to-r from-[hsl(170,60%,40%)] via-[hsl(220,60%,50%)] to-[hsl(280,50%,50%)]",
    styles: {
      heroBg: "bg-gradient-to-b from-[hsl(170,50%,40%)/0.3] via-[hsl(220,50%,45%)/0.2] to-transparent",
      cardBg: "border-[hsl(200,40%,35%)/0.3]",
      accentRing: "ring-[hsl(170,60%,50%)/0.5]",
      textAccent: "text-[hsl(170,60%,55%)]",
    },
  },
  {
    id: "royal",
    label: "Royal",
    isPro: true,
    preview: "bg-gradient-to-r from-[hsl(45,100%,50%)] to-[hsl(280,40%,30%)]",
    styles: {
      heroBg: "bg-gradient-to-b from-[hsl(45,90%,50%)/0.2] via-[hsl(280,30%,25%)/0.15] to-transparent",
      cardBg: "border-[hsl(45,60%,40%)/0.3]",
      accentRing: "ring-[hsl(45,90%,55%)/0.5]",
      textAccent: "text-[hsl(45,90%,55%)]",
    },
  },
];

export function getThemeById(id: string): ProfileTheme {
  return profileThemes.find((t) => t.id === id) || profileThemes[0];
}
