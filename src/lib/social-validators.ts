// Validate social media links - ONLY full URLs accepted, no usernames or @handles
interface ValidationResult {
  valid: boolean;
  message: string;
}

export function validateSocialLink(platform: string, value: string): ValidationResult {
  if (!value || value.trim() === "") return { valid: true, message: "" };

  const v = value.trim();

  // Reject bare usernames and @handles for all social platforms
  if (platform !== "website") {
    if (v.startsWith("@")) {
      return { valid: false, message: `Paste the full ${platform} URL, not a username (e.g. no @ symbols)` };
    }
    // If it doesn't contain a dot or protocol, it's likely just a username
    if (!v.includes(".") && !v.includes("://")) {
      return { valid: false, message: `Paste the full link from ${platform}, not just a username` };
    }
  }

  switch (platform) {
    case "instagram": {
      if (/^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._]+\/?/i.test(v)) return { valid: true, message: "" };
      return { valid: false, message: "Paste a valid Instagram link (e.g. https://instagram.com/yourname)" };
    }
    case "tiktok": {
      if (/^https?:\/\/(www\.)?tiktok\.com\/@?[a-zA-Z0-9._]+\/?/i.test(v)) return { valid: true, message: "" };
      return { valid: false, message: "Paste a valid TikTok link (e.g. https://tiktok.com/@yourname)" };
    }
    case "youtube": {
      if (/^https?:\/\/(www\.)?youtube\.com\/(c\/|channel\/|@)?[a-zA-Z0-9._-]+\/?/i.test(v)) return { valid: true, message: "" };
      if (/^https?:\/\/youtu\.be\//i.test(v)) return { valid: true, message: "" };
      return { valid: false, message: "Paste a valid YouTube link (e.g. https://youtube.com/@yourchannel)" };
    }
    case "x": {
      if (/^https?:\/\/(www\.)?(x|twitter)\.com\/[a-zA-Z0-9_]+\/?/i.test(v)) return { valid: true, message: "" };
      return { valid: false, message: "Paste a valid X/Twitter link (e.g. https://x.com/yourhandle)" };
    }
    case "twitch": {
      if (/^https?:\/\/(www\.)?twitch\.tv\/[a-zA-Z0-9_]+\/?/i.test(v)) return { valid: true, message: "" };
      return { valid: false, message: "Paste a valid Twitch link (e.g. https://twitch.tv/yourname)" };
    }
    case "website": {
      if (/^https?:\/\/.+\..+/i.test(v)) return { valid: true, message: "" };
      if (/^[a-zA-Z0-9].*\.[a-zA-Z]{2,}/.test(v)) return { valid: true, message: "" };
      return { valid: false, message: "Enter a valid website URL (e.g. https://yourwebsite.com)" };
    }
    default:
      return { valid: true, message: "" };
  }
}
