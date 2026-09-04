import { describe, expect, it } from "vitest";
import {
  COMMUNITY_CHANNEL_ORDER,
  resolveCommunityChannels,
  secondaryCommunityChannels,
} from "./links";

describe("community channel resolution", () => {
  it("reports every channel as closed when nothing is configured", () => {
    const channels = resolveCommunityChannels({});
    expect(channels.map((c) => c.id)).toEqual(COMMUNITY_CHANNEL_ORDER);
    expect(channels.every((c) => c.url === null)).toBe(true);
  });

  it("opens a channel when its env var holds an https URL", () => {
    const channels = resolveCommunityChannels({
      VITE_COMMUNITY_DISCORD_URL: "https://discord.gg/example",
    });
    expect(channels.find((c) => c.id === "discord")?.url).toBe("https://discord.gg/example");
    expect(channels.find((c) => c.id === "youtube")?.url).toBeNull();
  });

  it("fails closed on anything that is not an absolute https URL", () => {
    // A placeholder, a typo, a bare handle or a hostile scheme must all read as
    // "not open yet" — never as a link the front page will render.
    for (const bad of [
      "",
      "   ",
      "TODO",
      "@mogzy",
      "discord.gg/example",
      "http://discord.gg/example",
      "javascript:alert(1)",
      undefined,
      null,
      42,
    ]) {
      const channels = resolveCommunityChannels({ VITE_COMMUNITY_DISCORD_URL: bad });
      expect(channels.find((c) => c.id === "discord")?.url).toBeNull();
    }
  });

  it("leads with Discord and leaves the rest as the secondary row", () => {
    expect(COMMUNITY_CHANNEL_ORDER[0]).toBe("discord");
    const secondary = secondaryCommunityChannels(resolveCommunityChannels({}));
    expect(secondary.map((c) => c.id)).toEqual(["youtube", "tiktok", "instagram", "x"]);
  });

  it("names the env var an operator has to set for each channel", () => {
    for (const channel of resolveCommunityChannels({})) {
      expect(channel.envVar).toMatch(/^VITE_COMMUNITY_[A-Z]+_URL$/);
    }
  });
});
