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
    /** Primary body text */
    textColor: string;
    /** Muted / secondary text */
    mutedColor: string;
    /** Inner card / list item bg */
    innerBg: string;
    /** Inner card border */
    innerBorder: string;
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
      textColor: "",
      mutedColor: "",
      innerBg: "",
      innerBorder: "",
    },
  },
  {
    id: "light",
    label: "Light",
    isPro: false,
    preview: "bg-gradient-to-r from-[hsl(0,0%,100%)] to-[hsl(210,30%,97%)]",
    styles: {
      pageBg: "linear-gradient(180deg, hsl(210,30%,97%) 0%, hsl(0,0%,100%) 100%)",
      heroBg: "bg-gradient-to-b from-[hsl(210,80%,50%)/0.06] via-[hsl(210,30%,97%)/0.5] to-transparent",
      cardBg: "border-[hsl(220,20%,18%)/0.18] bg-[hsl(0,0%,100%)/0.95] shadow-sm",
      accentRing: "ring-[hsl(220,20%,18%)/0.25]",
      textAccent: "text-[hsl(210,80%,45%)]",
      iconAccent: "text-[hsl(210,80%,45%)]",
      statBg: "bg-[hsl(0,0%,100%)/0.9] border-[hsl(220,20%,18%)/0.15]",
      headingColor: "text-[hsl(222,47%,11%)]",
      nameColor: "text-[hsl(222,47%,11%)]",
      textColor: "text-[hsl(222,47%,11%)]",
      mutedColor: "text-[hsl(220,10%,40%)]",
      innerBg: "bg-[hsl(220,15%,96%)/0.8]",
      innerBorder: "border-[hsl(220,20%,18%)/0.12]",
    },
  },
  {
    id: "dark",
    label: "Dark",
    isPro: false,
    preview: "bg-gradient-to-r from-[hsl(222,47%,11%)] to-[hsl(217,32%,17%)]",
    styles: {
      pageBg: "linear-gradient(180deg, hsl(222,47%,11%) 0%, hsl(217,32%,14%) 100%)",
      heroBg: "bg-gradient-to-b from-[hsl(210,80%,65%)/0.12] via-[hsl(222,47%,11%)/0.5] to-transparent",
      cardBg: "border-[hsl(215,19%,34%)/0.5] bg-[hsl(217,32%,17%)/0.7]",
      accentRing: "ring-[hsl(210,80%,65%)/0.4]",
      textAccent: "text-[hsl(210,80%,65%)]",
      iconAccent: "text-[hsl(210,80%,65%)]",
      statBg: "bg-[hsl(217,32%,17%)/0.8] border-[hsl(215,19%,34%)/0.4]",
      headingColor: "text-[hsl(210,40%,98%)]",
      nameColor: "text-[hsl(210,40%,98%)]",
      textColor: "text-[hsl(210,40%,98%)]",
      mutedColor: "text-[hsl(215,16%,55%)]",
      innerBg: "bg-[hsl(222,40%,14%)/0.7]",
      innerBorder: "border-[hsl(215,19%,34%)/0.5]",
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
      textColor: "text-[hsl(240,20%,85%)]",
      mutedColor: "text-[hsl(240,15%,60%)]",
      innerBg: "bg-[hsl(240,20%,18%)/0.6]",
      innerBorder: "border-[hsl(260,25%,28%)/0.5]",
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
      textColor: "text-[hsl(140,15%,82%)]",
      mutedColor: "text-[hsl(140,12%,55%)]",
      innerBg: "bg-[hsl(145,18%,16%)/0.6]",
      innerBorder: "border-[hsl(150,20%,24%)/0.5]",
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
      textColor: "text-[hsl(20,30%,85%)]",
      mutedColor: "text-[hsl(350,15%,58%)]",
      innerBg: "bg-[hsl(350,18%,18%)/0.6]",
      innerBorder: "border-[hsl(340,30%,28%)/0.5]",
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
      textColor: "text-[hsl(200,20%,84%)]",
      mutedColor: "text-[hsl(210,15%,56%)]",
      innerBg: "bg-[hsl(210,18%,17%)/0.6]",
      innerBorder: "border-[hsl(200,25%,26%)/0.5]",
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
      textColor: "text-[hsl(280,15%,84%)]",
      mutedColor: "text-[hsl(270,12%,55%)]",
      innerBg: "bg-[hsl(270,16%,17%)/0.6]",
      innerBorder: "border-[hsl(45,40%,28%)/0.4]",
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
      textColor: "text-[hsl(220,20%,82%)]",
      mutedColor: "text-[hsl(220,15%,52%)]",
      innerBg: "bg-[hsl(220,25%,15%)/0.6]",
      innerBorder: "border-[hsl(45,60%,30%)/0.4]",
    },
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    isPro: true,
    preview: "bg-gradient-to-r from-[hsl(320,100%,50%)] via-[hsl(180,100%,50%)] to-[hsl(280,100%,40%)]",
    styles: {
      pageBg: "linear-gradient(180deg, hsl(260,30%,6%) 0%, hsl(280,20%,4%) 100%)",
      heroBg: "bg-gradient-to-b from-[hsl(320,100%,50%)/0.25] via-[hsl(280,60%,30%)/0.15] to-transparent",
      cardBg: "border-[hsl(180,100%,50%)/0.3] bg-[hsl(260,25%,10%)/0.8]",
      accentRing: "ring-[hsl(320,100%,55%)/0.6]",
      textAccent: "text-[hsl(180,100%,60%)]",
      iconAccent: "text-[hsl(320,100%,65%)]",
      statBg: "bg-[hsl(260,25%,12%)/0.8] border-[hsl(180,100%,50%)/0.25]",
      headingColor: "text-[hsl(180,100%,65%)]",
      nameColor: "text-[hsl(320,80%,90%)]",
      textColor: "text-[hsl(260,20%,85%)]",
      mutedColor: "text-[hsl(260,15%,55%)]",
      innerBg: "bg-[hsl(260,20%,14%)/0.7]",
      innerBorder: "border-[hsl(320,80%,40%)/0.3]",
    },
  },
];

export function getThemeById(id: string): ProfileTheme {
  return profileThemes.find((t) => t.id === id) || profileThemes[0];
}
