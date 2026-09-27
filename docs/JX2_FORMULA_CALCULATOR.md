# JX2 — Journey Formulas & Calculator (V1)

A small **Calc** button in the Journey board header, next to **State**. It opens a bottom `Sheet` (the same pattern as the State sheet) with a formula notecard on top and a basic calculator underneath.

- The sheet's content is capped at `max-w-md` and centred.
- It overlays the arena on phones (375/390) and on desktop, and never takes a player rail.

## Reference availability vs. question support

These are two separate things:

- **Formula reference availability** means the notecard lists a formula. It is a general Mogzy mechanics reference: the simple default formulas a player may reasonably need.
- **Journey question-generation support** is what the backend actually asks. Today that is ability cooldowns and **physical** ability damage only (`combat_working.v1`: armor, lethality, % armor pen, flat armor pen).

Listing magic resistance does **not** mean Journey asks magic-damage Combat questions.

## Formula source decision

I checked `src/lib/lol-glossary/registry.ts` against the backend (`League_Combat_Simulator`).

- **Ability haste** (`actual-cooldown`), **armor** (`armor`) and **magic resistance** (`magic-resistance`): exact canonical entries, reused verbatim. They match `mastery/calculations/cooldown.py` and `damage_mitigation.apply_resistance`.
- **Physical penetration / lethality**: not in the glossary. It is stated once in `lib/journey/formulas.ts`, taken from `penetration.py`:
  - percent pen first, then flat pen;
  - lethality counts 1:1, with no level scaling since V14.1;
  - it applies to positive armor only and clamps at 0.
- **Movement speed / soft caps**: the glossary has no entry, so it is **left out** for later. Nothing was invented or researched.

## Formula list (display order)

1. **Ability haste → cooldown:** `actual_cooldown = base_cooldown × 100 / (100 + ability_haste)` (from the glossary).
2. **Armor penetration & lethality:**
   - `armor_after_percent = armor × (1 − armor_pen_percent)`
   - `effective_armor = max(0, armor_after_percent − (lethality + flat_armor_pen))`
3. **Armor → physical damage:**
   - `physical_multiplier = 100 / (100 + effective_armor) when effective_armor ≥ 0` (from the glossary)
   - `post_mitigation_damage = raw_damage × physical_multiplier`
4. **Magic resistance → magic damage** (reference only; not a Journey question today):
   - `magic_multiplier = 100 / (100 + effective_magic_resistance) when effective_magic_resistance ≥ 0` (from the glossary)
   - `post_mitigation_damage = raw_damage × magic_multiplier`

Not listed: movement speed, magic penetration, negative-resistance mitigation, shields and bonus-armor pen.

## Calculator

- Keys: digits, `.`, `+ − × ÷`, `( )`, ⌫, C, =.
- It uses a recursive-descent parser, not `eval`.
- An incomplete or non-finite expression (such as ÷0) turns the display red instead of guessing.
- There is no game-state auto-fill, no history and no solver.

## Files

- New:
  - `src/lib/journey/formulas.ts`
  - `src/lib/journey/calculator.ts`
  - `src/components/journey/workbench/JourneyWorkbenchSheet.tsx` (`JourneyFormulaCard` + sheet)
  - `src/components/journey/workbench/BasicCalculator.tsx`
- Edited:
  - `JourneyStateBoard.tsx`: an optional `onOpenFormulas` prop and the button only. The two header buttons are grouped so `space-between` still works.
  - `JourneyModuleStage.tsx`: the open state and the mounted sheet.
- Backend: untouched.

## Tests

- `src/lib/journey/formulas.test.ts`:
  - pins the four reference formula ids;
  - checks there is no movement-speed, shield, bonus-armor-pen or magic-pen text;
  - checks the glossary strings are reused verbatim;
  - checks the penetration order;
  - checks the worked examples.
- `src/lib/journey/calculator.test.ts`: precedence, parentheses, invalid input, float formatting, and key-input rules.
- `src/components/journey/workbench/JourneyWorkbenchSheet.test.tsx`: the card sits above the calculator, and compute, backspace, clear and error all work.
- `JourneyModuleStage.test.tsx`: the header button opens the sheet, and the question stays mounted.

Running `vitest run src/components/journey src/lib/journey` gives 153/153 passing.

## Not verified

- I didn't do a real-browser pass at 375/390, because jsdom has no layout. The sheet reuses the State sheet's bottom-sheet pattern, and its keypad is 4 columns of 44px-tall buttons inside `max-w-md`, so it should fit a 343px content width. Check it by eye before release.

## Drift rule

To add a reference formula, first add an exact canonical glossary entry, then add it to `JOURNEY_FORMULAS` and update the pin test. Question support is a separate backend decision.
