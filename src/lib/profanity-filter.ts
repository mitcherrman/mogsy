// Basic profanity filter for display names
const BLOCKED_WORDS = [
  "fuck", "shit", "ass", "bitch", "damn", "cunt", "dick", "cock", "pussy",
  "bastard", "slut", "whore", "fag", "faggot", "nigger", "nigga", "retard",
  "rape", "nazi", "penis", "vagina", "anus", "dildo", "porn", "hentai",
  "wank", "twat", "prick", "bollocks", "arsehole", "asshole", "motherfucker",
  "bullshit", "jackass", "dumbass", "dipshit", "shithead", "fuckface",
  "cocksucker", "cumshot", "blowjob", "handjob", "jerkoff",
];

export function containsProfanity(text: string): boolean {
  const lower = text.toLowerCase().replace(/[^a-z]/g, " ");
  return BLOCKED_WORDS.some((word) => {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    return regex.test(lower);
  });
}

export function getProfanityMessage(): string {
  return "Display name contains inappropriate language. Please choose a different name.";
}
