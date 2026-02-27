export interface ProfileTheme {
  id: string;
  label: string;
  isPro: boolean;
  preview: string; // gradient/color for preview swatch
  styles: {
    /** Full-page background override (inline style) */
    pageBg?: string;
    /** Hero section gradient */
    heroBg: string;
    /** Card wrapper classes */
    cardBg: string;
    /** Avatar ring accent */
    accentRing: string;
    /** Accent text color */
    textAccent: string;
    /** Icon accent color class */
    iconAccent: string;
    /** Stat card bg */
    statBg: string;
    /** Section heading color */
    headingColor: string;
    /** Name color override */
    nameColor: string;
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
      iconAccent: "text-primary",
      statBg: "",
      headingColor: "",
      nameColor: "",
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    isPro: false,
    preview: "bg-gradient-to-r from-[hsl(230,40%,20%)] to-[hsl(260,30%,30%)]",
    styles: {
      pageBg: "linear-gradient(180deg, hsl(230,30%,8%) 0%, hsl(250,20%,12%) 100%)",
      heroBg: "bg-gradient-to-b from-[hsl(250,50%,25%)/0.6] via-[hsl(260,40%,20%)/0.3] to-transparent",
      cardBg: "border-[hsl(260,30%,30%)/0.5] bg-[hsl(240,20%,14%)/0.6]",
      accentRing: "ring-[hsl(260,60%,65%)/0.5]",
      textAccent: "text-[hsl(260,70%,75%)]",
      iconAccent: "text-[hsl(260,60%,70%)]",
      statBg: "bg-[hsl(240,20%,16%)/0.7] border-[hsl(260,30%,30%)/0.4]",
      headingColor: "text-[hsl(260,50%,80%)]",
      nameColor: "text-[hsl(240,30%,92%)]",
    },
  },
  {
    id: "forest",
    label: "Forest",
    isPro: false,
    preview: "bg-gradient-to-r from-[hsl(140,30%,20%)] to-[hsl(160,40%,30%)]",
    styles: {
      pageBg: "linear-gradient(180deg, hsl(150,25%,8%) 0%, hsl(140,20%,10%) 100%)",
      heroBg: "bg-gradient-to-b from-[hsl(150,40%,20%)/0.6] via-[hsl(140,30%,15%)/0.3] to-transparent",
      cardBg: "border-[hsl(150,25%,25%)/0.5] bg-[hsl(145,20%,12%)/0.6]",
      accentRing: "ring-[hsl(150,55%,50%)/0.5]",
      textAccent: "text-[hsl(150,55%,55%)]",
      iconAccent: "text-[hsl(150,50%,55%)]",
      statBg: "bg-[hsl(145,20%,14%)/0.7] border-[hsl(150,25%,25%)/0.4]",
      headingColor: "text-[hsl(150,40%,70%)]",
      nameColor: "text-[hsl(140,20%,90%)]",
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    isPro: true,
    preview: "bg-gradient-to-r from-[hsl(20,80%,50%)] to-[hsl(340,70%,50%)]",
    styles: {
      pageBg: "linear-gradient(180deg, hsl(15,40%,10%) 0%, hsl(340,30%,12%) 100%)",
      heroBg: "bg-gradient-to-b from-[hsl(20,80%,45%)/0.5] via-[hsl(340,60%,40%)/0.25] to-transparent",
      cardBg: "border-[hsl(340,40%,30%)/0.5] bg-[hsl(350,20%,14%)/0.6]",
      accentRing: "ring-[hsl(20,80%,55%)/0.6]",
      textAccent: "text-[hsl(20,85%,65%)]",
      iconAccent: "text-[hsl(25,80%,60%)]",
      statBg: "bg-[hsl(350,20%,16%)/0.7] border-[hsl(340,35%,30%)/0.4]",
      headingColor: "text-[hsl(20,70%,75%)]",
      nameColor: "text-[hsl(30,60%,92%)]",
    },
  },
  {
    id: "aurora",
    label: "Aurora",
    isPro: true,
    preview: "bg-gradient-to-r from-[hsl(170,60%,40%)] via-[hsl(220,60%,50%)] to-[hsl(280,50%,50%)]",
    styles: {
      pageBg: "linear-gradient(180deg, hsl(200,30%,8%) 0%, hsl(260,20%,10%) 100%)",
      heroBg: "bg-gradient-to-b from-[hsl(170,50%,35%)/0.4] via-[hsl(220,50%,40%)/0.25] to-[hsl(280,40%,30%)/0.1]",
      cardBg: "border-[hsl(200,30%,30%)/0.5] bg-[hsl(210,20%,14%)/0.6]",
      accentRing: "ring-[hsl(170,60%,50%)/0.6]",
      textAccent: "text-[hsl(170,60%,60%)]",
      iconAccent: "text-[hsl(180,50%,55%)]",
      statBg: "bg-[hsl(210,20%,16%)/0.7] border-[hsl(200,30%,28%)/0.4]",
      headingColor: "text-[hsl(170,50%,70%)]",
      nameColor: "text-[hsl(190,30%,92%)]",
    },
  },
  {
    id: "royal",
    label: "Royal",
    isPro: true,
    preview: "bg-gradient-to-r from-[hsl(45,100%,50%)] to-[hsl(280,40%,30%)]",
    styles: {
      pageBg: "linear-gradient(180deg, hsl(270,25%,10%) 0%, hsl(280,20%,8%) 100%)",
      heroBg: "bg-gradient-to-b from-[hsl(45,90%,50%)/0.3] via-[hsl(280,30%,25%)/0.2] to-transparent",
      cardBg: "border-[hsl(45,50%,30%)/0.4] bg-[hsl(270,18%,14%)/0.6]",
      accentRing: "ring-[hsl(45,90%,55%)/0.6]",
      textAccent: "text-[hsl(45,90%,60%)]",
      iconAccent: "text-[hsl(45,85%,55%)]",
      statBg: "bg-[hsl(270,18%,16%)/0.7] border-[hsl(45,50%,30%)/0.3]",
      headingColor: "text-[hsl(45,70%,70%)]",
      nameColor: "text-[hsl(45,40%,92%)]",
    },
  },
  {
    id: "lol",
    label: "League of Legends",
    isPro: true,
    preview: "bg-gradient-to-r from-[hsl(220,60%,15%)] via-[hsl(45,100%,50%)] to-[hsl(220,60%,15%)]",
    styles: {
      pageBg: "linear-gradient(180deg, hsl(220,40%,8%) 0%, hsl(215,30%,6%) 100%)",
      heroBg: "bg-gradient-to-b from-[hsl(45,90%,50%)/0.25] via-[hsl(220,50%,20%)/0.3] to-transparent",
      cardBg: "border-[hsl(45,70%,35%)/0.4] bg-[hsl(220,30%,12%)/0.7]",
      accentRing: "ring-[hsl(45,100%,50%)/0.6]",
      textAccent: "text-[hsl(45,100%,60%)]",
      iconAccent: "text-[hsl(45,90%,55%)]",
      statBg: "bg-[hsl(220,30%,14%)/0.7] border-[hsl(45,70%,35%)/0.3]",
      headingColor: "text-[hsl(45,80%,65%)]",
      nameColor: "text-[hsl(45,50%,92%)]",
    },
  },
];

export function getThemeById(id: string): ProfileTheme {
  return profileThemes.find((t) => t.id === id) || profileThemes[0];
}
