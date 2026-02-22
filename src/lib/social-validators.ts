// Validate social media links/handles
interface ValidationResult {
  valid: boolean;
  message: string;
}

export function validateSocialLink(platform: string, value: string): ValidationResult {
  if (!value || value.trim() === "") return { valid: true, message: "" };

  const v = value.trim();

  switch (platform) {
    case "instagram": {
      // Accept @handle or URL
      if (v.startsWith("@") || /^[a-zA-Z0-9._]{1,30}$/.test(v)) return { valid: true, message: "" };
      if (/instagram\.com\/[a-zA-Z0-9._]+/i.test(v)) return { valid: true, message: "" };
      return { valid: false, message: "Enter a valid Instagram username or link" };
    }
    case "tiktok": {
      if (v.startsWith("@") || /^[a-zA-Z0-9._]{1,24}$/.test(v)) return { valid: true, message: "" };
      if (/tiktok\.com\/@?[a-zA-Z0-9._]+/i.test(v)) return { valid: true, message: "" };
      return { valid: false, message: "Enter a valid TikTok username or link" };
    }
    case "youtube": {
      if (/youtube\.com\/(c\/|channel\/|@)?[a-zA-Z0-9._-]+/i.test(v)) return { valid: true, message: "" };
      if (/youtu\.be/i.test(v)) return { valid: true, message: "" };
      if (/^@?[a-zA-Z0-9._-]{1,50}$/.test(v)) return { valid: true, message: "" };
      return { valid: false, message: "Enter a valid YouTube channel or link" };
    }
    case "x": {
      if (v.startsWith("@") || /^[a-zA-Z0-9_]{1,15}$/.test(v)) return { valid: true, message: "" };
      if (/x\.com\/[a-zA-Z0-9_]+/i.test(v) || /twitter\.com\/[a-zA-Z0-9_]+/i.test(v)) return { valid: true, message: "" };
      return { valid: false, message: "Enter a valid X/Twitter username or link" };
    }
    case "twitch": {
      if (/^[a-zA-Z0-9_]{4,25}$/.test(v)) return { valid: true, message: "" };
      if (/twitch\.tv\/[a-zA-Z0-9_]+/i.test(v)) return { valid: true, message: "" };
      return { valid: false, message: "Enter a valid Twitch username or link" };
    }
    case "website": {
      if (/^https?:\/\/.+\..+/i.test(v)) return { valid: true, message: "" };
      if (/^[a-zA-Z0-9].*\.[a-zA-Z]{2,}/.test(v)) return { valid: true, message: "" };
      return { valid: false, message: "Enter a valid website URL" };
    }
    default:
      return { valid: true, message: "" };
  }
}
