/**
 * USERS1 — traffic classification, behaviourally.
 *
 * The three properties worth defending, in order of how much damage their
 * absence caused:
 *
 *   1. UNKNOWN IS NOT HUMAN. A browser that has done nothing is `unknown`, and
 *      only a trusted input event moves it. The old numbers were wrong because
 *      "we saw a page load" was treated as "we saw a person".
 *   2. THE MARKER CANNOT LAUNDER. A caller may mark itself internal or
 *      automation — both of which REMOVE it from the default KPIs — and may
 *      not mark itself human.
 *   3. IT IS NOT A SECURITY CONTROL, and nothing here pretends it is.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installLocalStorageStub } from "@/test/localStorageStub";
import {
  TRAFFIC_MARKER_KEY,
  canPromoteToHuman,
  classifyTraffic,
  isTrafficClass,
  resolveTrafficMarker,
} from "./traffic";
import { toSessionRow } from "./attribution";
import { EMPTY_TOUCH } from "./attribution";

let resetStorage: () => void;

beforeEach(() => {
  resetStorage = installLocalStorageStub();
});
afterEach(() => resetStorage());

const base = { search: "", hostname: "mogzy.lol", userAgent: "Mozilla/5.0 Chrome/131", webdriver: false };

describe("USERS1 — a browser starts unknown", () => {
  it("classifies an ordinary browser on the live host as unknown, not human", () => {
    const signal = classifyTraffic(base);
    expect(signal.trafficClass).toBe("unknown");
    expect(signal.trafficSource).toBeNull();
  });

  it("never returns human from classification at all — that class has one source", () => {
    const cases = [
      base,
      { ...base, hostname: "localhost" },
      { ...base, webdriver: true },
      { ...base, userAgent: "Googlebot/2.1" },
      { ...base, search: "?mgz_traffic=internal&mgz_source=claude" },
      // The one a hostile or careless caller would try.
      { ...base, search: "?mgz_traffic=human" },
      { ...base, injected: { class: "human", source: "me" } },
    ];
    for (const input of cases) {
      expect(classifyTraffic(input).trafficClass, JSON.stringify(input)).not.toBe("human");
    }
  });
});

describe("USERS1 — automation is recognised, and says why", () => {
  it("treats a driver-controlled browser as automation", () => {
    const signal = classifyTraffic({ ...base, webdriver: true });
    expect(signal.trafficClass).toBe("automation");
    expect(signal.trafficSource).toBe("webdriver");
    expect(signal.classificationReason).toMatch(/webdriver/);
  });

  it("recognises headless and crawler user agents, and names the token it matched", () => {
    for (const [ua, token] of [
      ["Mozilla/5.0 HeadlessChrome/120", "headlesschrome"],
      ["Googlebot/2.1 (+http://www.google.com/bot.html)", "googlebot"],
      ["python-requests/2.31.0", "python-requests"],
      ["Mozilla/5.0 (compatible; ClaudeBot/1.0)", "claudebot"],
    ] as const) {
      const signal = classifyTraffic({ ...base, userAgent: ua });
      expect(signal.trafficClass, ua).toBe("automation");
      expect(signal.trafficSource, ua).toBe(token);
    }
  });

  it("does not pretend detection is complete — an unmatched agent stays unknown", () => {
    const signal = classifyTraffic({ ...base, userAgent: "SomeNewHarness/1.0" });
    expect(signal.trafficClass).toBe("unknown");
  });
});

describe("USERS1 — our own traffic is internal", () => {
  it("classifies localhost and the preview hosts as internal", () => {
    for (const host of ["localhost", "127.0.0.1", "abc.lovable.app", "x.lovableproject.com"]) {
      expect(classifyTraffic({ ...base, hostname: host }).trafficClass, host).toBe("internal");
    }
  });

  it("accepts the documented query marker and PERSISTS it for the browser", () => {
    const first = classifyTraffic({ ...base, search: "?mgz_traffic=internal&mgz_source=claude" });
    expect(first.trafficClass).toBe("internal");
    expect(first.trafficSource).toBe("claude");

    // The next page load has no query string and must still be internal —
    // otherwise only an agent's first request would ever be excluded.
    const second = classifyTraffic(base);
    expect(second.trafficClass).toBe("internal");
    expect(second.trafficSource).toBe("claude");
  });

  it("accepts an injected marker, which is how a Playwright addInitScript marks a run", () => {
    const signal = classifyTraffic({
      ...base,
      injected: { class: "internal", source: "playwright" },
    });
    expect(signal.trafficClass).toBe("internal");
    expect(signal.trafficSource).toBe("playwright");
  });

  it("lets a person take their own browser back", () => {
    classifyTraffic({ ...base, search: "?mgz_traffic=internal&mgz_source=smoke_test" });
    expect(classifyTraffic(base).trafficClass).toBe("internal");
    expect(classifyTraffic({ ...base, search: "?mgz_traffic=clear" }).trafficClass).toBe("unknown");
    expect(classifyTraffic(base).trafficClass).toBe("unknown");
    expect(resolveTrafficMarker({ ...base })).toBeNull();
  });

  it("ignores a corrupt stored marker rather than throwing", () => {
    localStorage.setItem(TRAFFIC_MARKER_KEY, "{not json");
    expect(classifyTraffic(base).trafficClass).toBe("unknown");
  });
});

describe("USERS1 — the row a client is allowed to write", () => {
  it("writes the class on the SESSION row, where one visit is one verdict", () => {
    const row = toSessionRow("s1", "v1", EMPTY_TOUCH, {
      trafficClass: "automation",
      trafficSource: "playwright",
      classificationReason: "navigator.webdriver is true",
    });
    expect(row.traffic_class).toBe("automation");
    expect(row.traffic_source).toBe("playwright");
    expect(row.classification_reason).toBe("navigator.webdriver is true");
  });

  it("downgrades a human signal to unknown on the wire — the RLS refuses it anyway", () => {
    const row = toSessionRow("s1", "v1", EMPTY_TOUCH, {
      trafficClass: "human",
      trafficSource: null,
      classificationReason: "trusted human input event",
    });
    expect(row.traffic_class).toBe("unknown");
  });

  it("defaults to unknown when no signal is supplied at all", () => {
    expect(toSessionRow("s1", "v1", EMPTY_TOUCH).traffic_class).toBe("unknown");
  });
});

describe("USERS1 — promotion is refused where a trusted event would lie", () => {
  it("will not promote a driver-controlled browser, whose input IS reported as trusted", () => {
    expect(canPromoteToHuman({ webdriver: true })).toBe(false);
    expect(canPromoteToHuman({ webdriver: false })).toBe(true);
  });
});

describe("USERS1 — vocabulary", () => {
  it("knows its four classes and nothing else", () => {
    for (const c of ["human", "automation", "internal", "unknown"]) {
      expect(isTrafficClass(c), c).toBe(true);
    }
    for (const c of ["bot", "", "HUMAN", null, undefined, 1]) {
      expect(isTrafficClass(c), String(c)).toBe(false);
    }
  });
});
