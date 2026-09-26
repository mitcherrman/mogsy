# JX2 — Journey Formulas & Calculator (V1)

A small **Calc** button in the Journey board header, next to **State**. It opens a bottom `Sheet` (the same pattern as the State sheet) with a formula notecard on top and a basic calculator underneath.

- The sheet's content is capped at `max-w-md` and centred.
- It overlays the arena on phones (375/390) and on desktop, and never takes a player rail.

## Formula source decision

I checked `src/lib/lol-glossary/registry.ts` against the backend (`League_Combat_Simulator`).

- **Armor** (`armor`): exact. Its formula `100 / (100 + effective_armor)` for armor ≥ 0 matches `damage_mitigation.apply_resistance`. Reused.
- **Ability haste** (`actual-cooldown`): exact. It matches `mastery/calculations/cooldown.py`. Reused.
- **Physical penetration / lethality**: **not in the glossary.** It has only magic-pen entries, and the "penetration" lines the audit cited are category labels, not formulas. The one missing entry is stated in `lib/journey/formulas.ts`, following `penetration.py`:
  - percent pen first, then flat pen (lethality 1:1, no level scaling since V14.1);
  - it only applies to positive armor, and it clamps at 0.
- **Magic resistance / magic pen**: **excluded.** Journey Combat children are physical only. `combat_working.v1` has `calculation: "physical_ability_damage"`, and its penetration block holds only lethality, % armor pen and flat armor pen.

So the glossary is exact for what it covers, but it isn't complete for Journey. `lib/journey/formulas.ts` is the whitelist: it pulls glossary formula strings where they exist and adds only the penetration line.

## Supported formulas (display order)

1. **Ability haste → cooldown:** `actual_cooldown = base_cooldown × 100 / (100 + ability_haste)` (from the glossary).
2. **Armor penetration & lethality:**
   - `armor_after_percent = armor × (1 − armor_pen_percent)`
   - `effective_armor = max(0, armor_after_percent − (lethality + flat_armor_pen))`
3. **Armor → physical damage:**
   - `physical_multiplier = 100 / (100 + effective_armor)` (from the glossary)
   - `post_mitigation_damage = raw_damage × physical_multiplier`

These are left out deliberately: MR / magic pen, negative-armor mitigation (Journey target armor is level armor), shields, and bonus-armor pen.

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
  - pins the formula ids to the backend's current Journey objectives;
  - checks there is no magic, MR or shield text;
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

If the backend starts asking a new mechanic (for example magic damage in Journey Combat), add it to `JOURNEY_FORMULAS` and update the pin test in the same change.
