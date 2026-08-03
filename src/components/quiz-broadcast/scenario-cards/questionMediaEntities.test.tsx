/**
 * RA3-MEDIA-P4 — normalized question media entities, frontend contract.
 *
 * Every payload below is VERBATIM output of `ranked_public.question_media`
 * against the canonical League tables, for a real accepted-bank candidate
 * (question text quoted above each). They are captured from the backend, not
 * hand-written, so a backend contract change fails here instead of silently
 * degrading the card.
 *
 * Two things are under test and they pull in opposite directions:
 *  - the RICHER path — champions/items/abilities/runes/summoner spells,
 *    role-tagged, resolved to absolute URLs, available to a future theme;
 *  - the OLD path — a subject-only payload frozen before this phase must
 *    classify, select and render exactly as it did.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "@/lib/quiz/api";
import { classifySubject, getCombatCooldownSubject, selectScenario } from "./classify";
import { flattenMediaEntityIcons, getQuestionMediaEntities } from "./questionMediaEntities";
import { CombatCalculationScenarioCard } from "./CombatCalculationScenarioCard";
import { scenarioSourceFromPublicQuestion } from "@/lib/ranked-core/adapters/scenarioSource";

/** Jinx has Infinity Edge and Long Sword. How much flat attack damage do the two items provide in total? */
const JINX = {
  "assets": {
    "subject": {
      "type": "combat_cooldown",
      "champion": "Jinx",
      "champion_icon": "assets/champions/Jinx/icon.png",
      "item_icons": [
        {
          "name": "Infinity Edge",
          "icon": "assets/items/3031.png"
        },
        {
          "name": "Long Sword",
          "icon": "assets/items/1036.png"
        }
      ],
      "champion_splash": "assets/champions/Jinx/splash/0_default.jpg"
    },
    "entities": {
      "champions": [
        {
          "type": "champion",
          "id": "Jinx",
          "name": "Jinx",
          "icon": "assets/champions/Jinx/icon.png",
          "splash": "assets/champions/Jinx/splash/0_default.jpg",
          "loading": "assets/champions/Jinx/loading/0_default.jpg",
          "default_skin": 0,
          "role": "subject"
        }
      ],
      "items": [
        {
          "type": "item",
          "id": 3031,
          "name": "Infinity Edge",
          "icon": "assets/items/3031.png",
          "role": "subject"
        },
        {
          "type": "item",
          "id": 1036,
          "name": "Long Sword",
          "icon": "assets/items/1036.png",
          "role": "subject"
        }
      ],
      "abilities": [],
      "runes": [],
      "summoner_spells": []
    }
  },
  "presentation": {
    "role": "context",
    "timing": "question",
    "spoiler": false,
    "scenario_type": "combat_calculation"
  }
} as const;

/** Syndra has Sorcerer's Shoes and Void Staff. Syndra hits Ornn with Unleashed Power for 750 raw magic damage. Ornn has 120 magic resist. How much post-mitigation damage is dealt after penetration? */
const SYNDRA = {
  "assets": {
    "subject": {
      "type": "combat_cooldown",
      "champion": "Syndra",
      "champion_icon": "assets/champions/Syndra/icon.png",
      "item_icons": [
        {
          "name": "Sorcerer's Shoes",
          "icon": "assets/items/3020.png"
        },
        {
          "name": "Void Staff",
          "icon": "assets/items/3135.png"
        }
      ],
      "champion_splash": "assets/champions/Syndra/splash/0_default.jpg",
      "ability_slot": "R",
      "ability_name": "Unleashed Power",
      "ability_icon": "assets/champions/Syndra/R_SyndraR.png"
    },
    "entities": {
      "champions": [
        {
          "type": "champion",
          "id": "Syndra",
          "name": "Syndra",
          "icon": "assets/champions/Syndra/icon.png",
          "splash": "assets/champions/Syndra/splash/0_default.jpg",
          "loading": "assets/champions/Syndra/loading/0_default.jpg",
          "default_skin": 0,
          "role": "attacker"
        },
        {
          "type": "champion",
          "id": "Ornn",
          "name": "Ornn",
          "icon": "assets/champions/Ornn/icon.png",
          "splash": "assets/champions/Ornn/splash/0_default.jpg",
          "loading": "assets/champions/Ornn/loading/0_default.jpg",
          "default_skin": 0,
          "role": "target"
        }
      ],
      "items": [
        {
          "type": "item",
          "id": 3020,
          "name": "Sorcerer's Shoes",
          "icon": "assets/items/3020.png",
          "role": "attacker"
        },
        {
          "type": "item",
          "id": 3135,
          "name": "Void Staff",
          "icon": "assets/items/3135.png",
          "role": "attacker"
        }
      ],
      "abilities": [
        {
          "type": "ability",
          "id": "Syndra:R",
          "name": "Unleashed Power",
          "champion": "Syndra",
          "slot": "R",
          "icon": "assets/champions/Syndra/R_SyndraR.png",
          "role": "attacker"
        }
      ],
      "runes": [],
      "summoner_spells": []
    }
  },
  "presentation": {
    "role": "context",
    "timing": "question",
    "spoiler": false,
    "scenario_type": "combat_calculation"
  }
} as const;

/** Ornn started with Doran's Shield and one Health Potion. Ornn later bought Bami's Cinder and Cloth Armor. How much gold has Ornn spent in total? */
const ORNN = {
  "assets": {
    "subject": {
      "type": "combat_cooldown",
      "champion": "Ornn",
      "champion_icon": "assets/champions/Ornn/icon.png",
      "item_icons": [
        {
          "name": "Doran's Shield",
          "icon": "assets/items/1054.png"
        },
        {
          "name": "Health Potion",
          "icon": "assets/items/2003.png"
        },
        {
          "name": "Bami's Cinder",
          "icon": "assets/items/6660.png"
        },
        {
          "name": "Cloth Armor",
          "icon": "assets/items/1029.png"
        }
      ],
      "champion_splash": "assets/champions/Ornn/splash/0_default.jpg"
    },
    "entities": {
      "champions": [
        {
          "type": "champion",
          "id": "Ornn",
          "name": "Ornn",
          "icon": "assets/champions/Ornn/icon.png",
          "splash": "assets/champions/Ornn/splash/0_default.jpg",
          "loading": "assets/champions/Ornn/loading/0_default.jpg",
          "default_skin": 0,
          "role": "subject"
        }
      ],
      "items": [
        {
          "type": "item",
          "id": 1054,
          "name": "Doran's Shield",
          "icon": "assets/items/1054.png",
          "role": "subject"
        },
        {
          "type": "item",
          "id": 2003,
          "name": "Health Potion",
          "icon": "assets/items/2003.png",
          "role": "subject"
        },
        {
          "type": "item",
          "id": 6660,
          "name": "Bami's Cinder",
          "icon": "assets/items/6660.png",
          "role": "subject"
        },
        {
          "type": "item",
          "id": 1029,
          "name": "Cloth Armor",
          "icon": "assets/items/1029.png",
          "role": "subject"
        }
      ],
      "abilities": [],
      "runes": [],
      "summoner_spells": []
    }
  },
  "presentation": {
    "role": "context",
    "timing": "question",
    "spoiler": false,
    "scenario_type": "combat_calculation"
  }
} as const;

/** Caitlyn's Piltover Peacemaker would deal 600 raw physical damage. Ahri buys Chain Vest, raising armor from 60 to 100. How much less post-mitigation damage does the hit deal after the purchase? */
const AFTER_PURCHASE = {
  "assets": {
    "subject": {
      "type": "combat_cooldown",
      "champion": "Caitlyn",
      "champion_icon": "assets/champions/Caitlyn/icon.png",
      "item_icons": [],
      "champion_splash": "assets/champions/Caitlyn/splash/0_default.jpg",
      "ability_slot": "Q",
      "ability_name": "Piltover Peacemaker",
      "ability_icon": "assets/champions/Caitlyn/Q_CaitlynQ.png"
    },
    "entities": {
      "champions": [
        {
          "type": "champion",
          "id": "Caitlyn",
          "name": "Caitlyn",
          "icon": "assets/champions/Caitlyn/icon.png",
          "splash": "assets/champions/Caitlyn/splash/0_default.jpg",
          "loading": "assets/champions/Caitlyn/loading/0_default.jpg",
          "default_skin": 0,
          "role": "attacker"
        },
        {
          "type": "champion",
          "id": "Ahri",
          "name": "Ahri",
          "icon": "assets/champions/Ahri/icon.png",
          "splash": "assets/champions/Ahri/splash/0_default.jpg",
          "loading": "assets/champions/Ahri/loading/0_default.jpg",
          "default_skin": 0,
          "role": "target"
        }
      ],
      "items": [
        {
          "type": "item",
          "id": 1031,
          "name": "Chain Vest",
          "icon": "assets/items/1031.png",
          "role": "target"
        }
      ],
      "abilities": [
        {
          "type": "ability",
          "id": "Caitlyn:Q",
          "name": "Piltover Peacemaker",
          "champion": "Caitlyn",
          "slot": "Q",
          "icon": "assets/champions/Caitlyn/Q_CaitlynQ.png",
          "role": "attacker"
        }
      ],
      "runes": [],
      "summoner_spells": []
    }
  },
  "presentation": {
    "role": "context",
    "timing": "question",
    "spoiler": false,
    "scenario_type": "combat_calculation"
  }
} as const;

/** A payload frozen BEFORE this phase: subject only, no entities key. */
const LEGACY_SUBJECT_ONLY = {
  assets: {
    subject: {
      type: "combat_cooldown",
      champion: "Ornn",
      champion_icon: "assets/champions/Ornn/icon.png",
      champion_splash: "assets/champions/Ornn/splash/0_default.jpg",
      item_icons: [
        { name: "Doran's Shield", icon: "assets/items/1054.png" },
        { name: "Health Potion", icon: "assets/items/2003.png" },
      ],
    },
  },
  presentation: { role: "context", timing: "question", spoiler: false, scenario_type: "combat_calculation" },
} as const;

const API = "https://web-production-83e53.up.railway.app";

function question(metadata: unknown, id = "q1"): QuizQuestion {
  return {
    id,
    category: "ranked",
    question_text: "How much?",
    format: "multiple_choice",
    choices: ["85", "80", "90", "75"],
    metadata: metadata as QuizQuestion["metadata"],
  };
}

// ============================================================ entity contract

describe("getQuestionMediaEntities", () => {
  it("returns null for a subject-only payload frozen before this phase", () => {
    expect(getQuestionMediaEntities(question(LEGACY_SUBJECT_ONLY))).toBeNull();
  });

  it("returns null when there is no metadata at all", () => {
    expect(getQuestionMediaEntities(question(undefined))).toBeNull();
    expect(getQuestionMediaEntities(question({ assets: { subject: { type: "item", name: "X" } } }))).toBeNull();
  });

  it("reads one champion and its items from the Jinx inventory payload", () => {
    const entities = getQuestionMediaEntities(question(JINX))!;
    expect(entities.champions.map((c) => c.name)).toEqual(["Jinx"]);
    expect(entities.items.map((i) => i.name)).toEqual(["Infinity Edge", "Long Sword"]);
    expect(entities.abilities).toEqual([]);

    const [jinx] = entities.champions;
    expect(jinx.role).toBe("subject");
    // Every champion art option the theme redesign may pick from.
    expect(jinx.icon).toBe(`${API}/assets/champions/Jinx/icon.png`);
    expect(jinx.splash).toBe(`${API}/assets/champions/Jinx/splash/0_default.jpg`);
    expect(jinx.loading).toBe(`${API}/assets/champions/Jinx/loading/0_default.jpg`);
    expect(jinx.defaultSkin).toBe(0);
    expect(entities.items.map((i) => i.icon)).toEqual([
      `${API}/assets/items/3031.png`,
      `${API}/assets/items/1036.png`,
    ]);
  });

  it("reads both champions, the ability and both items from the Syndra payload", () => {
    const entities = getQuestionMediaEntities(question(SYNDRA))!;
    expect(entities.champions.map((c) => [c.name, c.role])).toEqual([
      ["Syndra", "attacker"],
      ["Ornn", "target"],
    ]);
    expect(entities.items.map((i) => i.name)).toEqual(["Sorcerer's Shoes", "Void Staff"]);
    expect(entities.abilities).toHaveLength(1);
    const [ult] = entities.abilities;
    expect(ult).toMatchObject({ name: "Unleashed Power", champion: "Syndra", slot: "R", role: "attacker" });
    expect(ult.icon).toBe(`${API}/assets/champions/Syndra/R_SyndraR.png`);
  });

  it("keeps the target's items attributed to the target, never merged", () => {
    const entities = getQuestionMediaEntities(question(AFTER_PURCHASE))!;
    expect(entities.items.map((i) => [i.name, i.role])).toEqual([["Chain Vest", "target"]]);
    // The shipped subject has an EMPTY item row for this question — the entity
    // collection is where the bought item becomes reachable at all.
    expect(getCombatCooldownSubject(question(AFTER_PURCHASE))!.itemIcons).toEqual([]);
  });

  it("exposes two usable champion icons for a two-champion scenario", () => {
    const icons = getQuestionMediaEntities(question(SYNDRA))!.champions.map((c) => c.icon);
    expect(icons).toHaveLength(2);
    expect(new Set(icons).size).toBe(2);
    expect(icons.every((i) => typeof i === "string" && i.startsWith(API))).toBe(true);
  });

  it("resolves relative backend paths against the API origin and passes absolutes through", () => {
    const entities = getQuestionMediaEntities(
      question({
        assets: {
          entities: {
            champions: [{ name: "Ahri", role: "subject", icon: "assets/champions/Ahri/icon.png" }],
            items: [{ name: "Remote", role: "subject", icon: "https://cdn.example/x.png" }],
          },
        },
      }),
    )!;
    expect(entities.champions[0].icon).toBe(`${API}/assets/champions/Ahri/icon.png`);
    expect(entities.items[0].icon).toBe("https://cdn.example/x.png");
  });

  it("degrades safely on a malformed or partial collection", () => {
    const entities = getQuestionMediaEntities(
      question({
        assets: {
          entities: {
            champions: [
              { name: "Ahri", role: "subject" }, // no icon/splash/loading
              { role: "target", icon: "assets/champions/Ornn/icon.png" }, // no name
              "nonsense",
            ],
            items: "not-an-array",
          },
        },
      }),
    )!;
    expect(entities.champions).toEqual([
      { name: "Ahri", role: "subject", icon: null, splash: null, loading: null },
    ]);
    expect(entities.items).toEqual([]);
    expect(entities.runes).toEqual([]);
    expect(entities.summonerSpells).toEqual([]);
  });

  it("normalizes an unknown role to context rather than dropping the entity", () => {
    const entities = getQuestionMediaEntities(
      question({ assets: { entities: { items: [{ name: "Long Sword", role: "mystery", icon: "assets/items/1036.png" }] } } }),
    )!;
    expect(entities.items[0].role).toBe("context");
  });

  it("reads canonical runes and summoner spells through the same shape", () => {
    const entities = getQuestionMediaEntities(
      question({
        assets: {
          entities: {
            runes: [{ type: "rune", id: 8005, name: "Press the Attack", role: "subject", icon: "assets/runes/8005.png" }],
            summoner_spells: [{ type: "summoner_spell", id: 4, name: "Flash", role: "subject", icon: "assets/spells/SummonerFlash.png" }],
          },
        },
      }),
    )!;
    expect(entities.runes[0]).toMatchObject({ id: 8005, name: "Press the Attack", role: "subject" });
    expect(entities.summonerSpells[0]).toMatchObject({ id: 4, name: "Flash", role: "subject" });
  });
});

describe("flattenMediaEntityIcons", () => {
  it("orders champions, then abilities, then items — and drops icon-less entities", () => {
    const flat = flattenMediaEntityIcons(getQuestionMediaEntities(question(SYNDRA)));
    expect(flat.map((e) => [e.kind, e.name])).toEqual([
      ["champion", "Syndra"],
      ["champion", "Ornn"],
      ["ability", "Unleashed Power"],
      ["item", "Sorcerer's Shoes"],
      ["item", "Void Staff"],
    ]);
    expect(flattenMediaEntityIcons(null)).toEqual([]);
    expect(
      flattenMediaEntityIcons(getQuestionMediaEntities(question({ assets: { entities: { items: [{ name: "No Icon", role: "subject" }] } } }))),
    ).toEqual([]);
  });
});

// ==================================================== shipped pipeline intact

describe("existing selection pipeline is unaffected", () => {
  it("still selects the combat card for every real payload, old and new", () => {
    for (const payload of [JINX, SYNDRA, ORNN, AFTER_PURCHASE, LEGACY_SUBJECT_ONLY]) {
      const selection = selectScenario(question(payload), false, null);
      expect(selection.card).toBe("combat_calculation");
    }
  });

  it("leaves classifySubject and the subject fields untouched by the new key", () => {
    expect(classifySubject(question(SYNDRA))).toEqual(classifySubject(question(LEGACY_SUBJECT_ONLY)));
    const combat = getCombatCooldownSubject(question(SYNDRA))!;
    expect(combat.champion).toBe("Syndra");
    expect(combat.abilitySlot).toBe("R");
    expect(combat.abilityName).toBe("Unleashed Power");
    expect(combat.itemIcons.map((i) => i.name)).toEqual(["Sorcerer's Shoes", "Void Staff"]);
  });

  it("carries entities through the Ranked adapter without a bespoke schema", () => {
    const source = scenarioSourceFromPublicQuestion({
      questionId: "r1",
      category: "post_mitigation_damage",
      prompt: "How much post-mitigation damage is dealt?",
      options: ["610", "469", "455", "539"],
      presentation: SYNDRA as unknown as Record<string, unknown>,
    } as Parameters<typeof scenarioSourceFromPublicQuestion>[0])!;
    expect(getQuestionMediaEntities(source)!.champions).toHaveLength(2);
  });

  it("returns a legacy payload's combat subject with entities null", () => {
    expect(getCombatCooldownSubject(question(LEGACY_SUBJECT_ONLY))!.entities).toBeNull();
  });
});

// ================================================= minimal visible behavior

/**
 * The card change is deliberately small: prove the payload is complete, change
 * nothing else. These assert BOTH halves — the strip appears with every premise
 * entity, and the pre-existing card structure is byte-for-byte the same.
 */
function renderCard(payload: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const subject = getCombatCooldownSubject(question(payload))!;
  return render(
    <QueryClientProvider client={client}>
      <CombatCalculationScenarioCard subject={subject} />
    </QueryClientProvider>,
  );
}

function stripIcons() {
  return within(screen.getByTestId("scenario-entity-strip")).getAllByRole("listitem");
}

describe("CombatCalculationScenarioCard entity strip", () => {
  it("shows the champion icon and both item icons for the Jinx question", () => {
    renderCard(JINX);
    expect(stripIcons().map((n) => n.getAttribute("aria-label"))).toEqual([
      "Jinx (champion)",
      "Infinity Edge (item)",
      "Long Sword (item)",
    ]);
    const img = within(stripIcons()[1]).getByRole("presentation");
    expect(img).toHaveAttribute("src", `${API}/assets/items/3031.png`);
  });

  it("shows two champion icons, the ability icon and both items for Syndra", () => {
    renderCard(SYNDRA);
    expect(stripIcons().map((n) => n.getAttribute("aria-label"))).toEqual([
      "Syndra (champion)",
      "Ornn (champion)",
      "Unleashed Power (ability)",
      "Sorcerer's Shoes (item)",
      "Void Staff (item)",
    ]);
    expect(stripIcons().filter((n) => n.getAttribute("data-entity-kind") === "champion")).toHaveLength(2);
  });

  it("surfaces the target's purchased item that the card body cannot show", () => {
    renderCard(AFTER_PURCHASE);
    const labels = stripIcons().map((n) => n.getAttribute("aria-label"));
    expect(labels).toContain("Chain Vest (item)");
    expect(labels).toContain("Ahri (champion)");
    // The card body's item section is still empty — nothing was relocated.
    expect(screen.queryByText("Loadout · Items")).not.toBeInTheDocument();
  });

  it("labels every icon accessibly and draws no text inside the artwork", () => {
    renderCard(SYNDRA);
    const strip = screen.getByTestId("scenario-entity-strip");
    expect(strip).toHaveAttribute("aria-label", "Scenario entities");
    for (const slot of stripIcons()) {
      expect(slot.getAttribute("aria-label")).toBeTruthy();
      expect(slot).toHaveAttribute("title");
      expect(slot.textContent).toBe("");                    // no labels over art
      // Decorative: the accessible name lives on the slot, not duplicated.
      expect(within(slot).getByRole("presentation")).toHaveAttribute("alt", "");
    }
  });

  it("keeps a fixed-size slot with a monogram when an image fails to load", () => {
    renderCard(JINX);
    const slot = stripIcons()[0];
    fireEvent.error(within(slot).getByRole("presentation"));
    expect(within(slot).queryByRole("presentation")).not.toBeInTheDocument();
    expect(slot.textContent).toBe("J");
    expect(slot.className).toContain("h-6 w-6");             // slot did not collapse
    expect(stripIcons()).toHaveLength(3);                    // strip did not reflow
  });

  it("renders no strip at all for a payload frozen before this phase", () => {
    renderCard(LEGACY_SUBJECT_ONLY);
    expect(screen.queryByTestId("scenario-entity-strip")).not.toBeInTheDocument();
    // ...and the card it always rendered is unchanged.
    expect(screen.getByText("Ornn")).toBeInTheDocument();
    expect(screen.getByText("Loadout · Items")).toBeInTheDocument();
    expect(screen.getByText("Doran's Shield")).toBeInTheDocument();
  });

  it("leaves the card body identical whether or not entities are present", () => {
    const withEntities = renderCard(ORNN).container.querySelector(".absolute.inset-x-0.bottom-0")!.innerHTML;
    screen.getByTestId("scenario-entity-strip");                       // strip IS there
    const legacy = { assets: { subject: (ORNN as { assets: { subject: unknown } }).assets.subject }, presentation: ORNN.presentation };
    const withoutEntities = renderCard(legacy).container.querySelector(".absolute.inset-x-0.bottom-0")!.innerHTML;
    expect(withEntities).toBe(withoutEntities);
  });
});

// ============================================ RA3-MEDIA-P5 — ability entities

/**
 * "In which ability slot does Darius cast Decimate?" — VERBATIM output of
 * `ranked_public.question_media` for the shipped `placeholder-rm-ability` card.
 *
 * Two things are unusual and both are deliberate on the backend:
 *  - there is no `slot` and no `ability_slot`: the slot is the ANSWER;
 *  - the ability icon is a route, not an `assets/` path, because the file on
 *    disk is `Q_DariusCleave.png` and its name would give the answer away.
 * The frontend's job is to render it and to add neither back.
 */
const DARIUS_ABILITY = {
  "assets": {
    "subject": {
      "type": "combat_cooldown",
      "champion": "Darius",
      "champion_icon": "assets/champions/Darius/icon.png",
      "item_icons": [],
      "champion_splash": "assets/champions/Darius/splash/0_default.jpg",
      "ability_name": "Decimate",
      "ability_icon": "api/ranked/media/ability-icon/Darius/Decimate.png",
      "badge": "Champion Ability"
    },
    "entities": {
      "champions": [
        {
          "type": "champion",
          "id": "Darius",
          "name": "Darius",
          "icon": "assets/champions/Darius/icon.png",
          "splash": "assets/champions/Darius/splash/0_default.jpg",
          "loading": "assets/champions/Darius/loading/0_default.jpg",
          "default_skin": 0,
          "role": "subject"
        }
      ],
      "items": [],
      "abilities": [
        {
          "type": "ability",
          "id": "Darius:Decimate",
          "name": "Decimate",
          "champion": "Darius",
          "icon": "api/ranked/media/ability-icon/Darius/Decimate.png",
          "role": "subject"
        }
      ],
      "runes": [],
      "summoner_spells": []
    }
  },
  "presentation": {
    "role": "context",
    "timing": "question",
    "spoiler": false,
    "scenario_type": "combat_calculation"
  }
} as const;

/** The same question shape with items in the premise — Example 3 of the brief:
 *  champion + ability + items must all survive together. */
const ABILITY_WITH_ITEMS = {
  assets: {
    subject: {
      type: "combat_cooldown",
      champion: "Ahri",
      champion_icon: "assets/champions/Ahri/icon.png",
      champion_splash: "assets/champions/Ahri/splash/0_default.jpg",
      ability_name: "Charm",
      ability_icon: "api/ranked/media/ability-icon/Ahri/Charm.png",
      item_icons: [{ name: "Void Staff", icon: "assets/items/3135.png" }],
      badge: "Champion Ability",
    },
    entities: {
      champions: [
        { type: "champion", id: "Ahri", name: "Ahri", icon: "assets/champions/Ahri/icon.png", role: "subject" },
      ],
      items: [{ type: "item", id: 3135, name: "Void Staff", icon: "assets/items/3135.png", role: "subject" }],
      abilities: [
        {
          type: "ability",
          id: "Ahri:Charm",
          name: "Charm",
          champion: "Ahri",
          icon: "api/ranked/media/ability-icon/Ahri/Charm.png",
          role: "subject",
        },
      ],
      runes: [],
      summoner_spells: [],
    },
  },
  presentation: { role: "context", timing: "question", spoiler: false, scenario_type: "combat_calculation" },
} as const;

/** The Ranked question this payload belongs to: slot-shaped options. */
function slotQuestion(metadata: unknown, id = "ability1"): QuizQuestion {
  return {
    id,
    category: "ability_identity",
    question_text: "In which ability slot does Darius cast Decimate?",
    format: "multiple_choice",
    choices: ["Q", "W", "E", "R"],
    metadata: metadata as QuizQuestion["metadata"],
  };
}

describe("ability premise entities", () => {
  it("reads the champion and the named ability off an ability-identity payload", () => {
    const entities = getQuestionMediaEntities(slotQuestion(DARIUS_ABILITY))!;
    expect(entities.champions.map((c) => c.name)).toEqual(["Darius"]);
    expect(entities.abilities).toHaveLength(1);
    const [decimate] = entities.abilities;
    expect(decimate).toMatchObject({ id: "Darius:Decimate", name: "Decimate", champion: "Darius", role: "subject" });
    expect(decimate.icon).toBe(`${API}/api/ranked/media/ability-icon/Darius/Decimate.png`);
  });

  it("leaves slot undefined when the backend withheld it, rather than inventing one", () => {
    const [decimate] = getQuestionMediaEntities(slotQuestion(DARIUS_ABILITY))!.abilities;
    expect(decimate.slot).toBeUndefined();
    expect(getCombatCooldownSubject(slotQuestion(DARIUS_ABILITY))!.abilitySlot).toBeUndefined();
  });

  it("still reads slot for a damage payload that states one", () => {
    expect(getQuestionMediaEntities(question(SYNDRA))!.abilities[0].slot).toBe("R");
    expect(getCombatCooldownSubject(question(SYNDRA))!.abilitySlot).toBe("R");
  });

  it("flattens champion then ability for the icon strip", () => {
    expect(flattenMediaEntityIcons(getQuestionMediaEntities(slotQuestion(DARIUS_ABILITY))).map((e) => [e.kind, e.name])).toEqual([
      ["champion", "Darius"],
      ["ability", "Decimate"],
    ]);
  });

  it("carries champion, ability and items together without dropping any", () => {
    const entities = getQuestionMediaEntities(slotQuestion(ABILITY_WITH_ITEMS))!;
    expect(entities.champions.map((c) => c.name)).toEqual(["Ahri"]);
    expect(entities.abilities.map((a) => a.name)).toEqual(["Charm"]);
    expect(entities.items.map((i) => i.name)).toEqual(["Void Staff"]);
  });

  it("selects the multi-entity card so both the champion and the ability render", () => {
    expect(selectScenario(slotQuestion(DARIUS_ABILITY), false, "Q").card).toBe("combat_calculation");
  });

  it("no longer falls through to the empty card the way a bare ability subject does", () => {
    // The shape this replaced: an ability subject with no icon and no champion
    // media classified as a label-only "spell" and rendered nothing.
    const before = { assets: { subject: { type: "ability", name: "Decimate", champion: "Darius" } }, presentation: { scenario_type: "ability", timing: "question", role: "context", spoiler: false } };
    expect(selectScenario(slotQuestion(before), false, "Q").card).toBe("empty");
    expect(selectScenario(slotQuestion(DARIUS_ABILITY), false, "Q").card).toBe("combat_calculation");
  });
});

describe("CombatCalculationScenarioCard with an ability premise", () => {
  it("renders the champion and the ability icon for Darius / Decimate", () => {
    renderCard(DARIUS_ABILITY);
    expect(screen.getByText("Darius")).toBeInTheDocument();
    expect(screen.getByText("Decimate")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Decimate" })).toHaveAttribute(
      "src",
      `${API}/api/ranked/media/ability-icon/Darius/Decimate.png`,
    );
    expect(stripIcons().map((n) => n.getAttribute("aria-label"))).toEqual([
      "Darius (champion)",
      "Decimate (ability)",
    ]);
  });

  it("draws no slot badge and no slot subtitle when the slot is the answer", () => {
    const { container } = renderCard(DARIUS_ABILITY);
    // The generic "Ability" micro-label, never "Ability · Slot Q".
    expect(screen.getByText("Ability")).toBeInTheDocument();
    expect(screen.queryByText(/Slot [QWER]/)).not.toBeInTheDocument();
    // Nothing anywhere in the rendered card names the answer.
    for (const slot of ["Q", "W", "E", "R"]) {
      expect(container.innerHTML.split(/[^A-Za-z0-9]+/)).not.toContain(slot);
    }
  });

  it("labels the card by its premise family instead of Combat Calculation", () => {
    renderCard(DARIUS_ABILITY);
    expect(screen.getByText("Champion Ability")).toBeInTheDocument();
    expect(screen.queryByText("Combat Calculation")).not.toBeInTheDocument();
  });

  it("keeps the shipped badge for every payload that carries none", () => {
    for (const payload of [JINX, SYNDRA, ORNN, AFTER_PURCHASE, LEGACY_SUBJECT_ONLY]) {
      const { unmount } = renderCard(payload);
      expect(screen.getByText("Combat Calculation")).toBeInTheDocument();
      unmount();
    }
  });

  it("renders the ability alongside items when the premise has both", () => {
    renderCard(ABILITY_WITH_ITEMS);
    expect(screen.getByText("Ahri")).toBeInTheDocument();
    expect(screen.getByText("Charm")).toBeInTheDocument();
    expect(screen.getByText("Void Staff")).toBeInTheDocument();
    expect(stripIcons().map((n) => n.getAttribute("data-entity-kind"))).toEqual([
      "champion",
      "ability",
      "item",
    ]);
  });

  it("still draws the slot badge for a damage question that states its slot", () => {
    renderCard(SYNDRA);
    expect(screen.getByText("Ability · Slot R")).toBeInTheDocument();
  });
});
