import SEOHead from "@/components/SEOHead";
import ProPlayArenaRun from "@/components/pro-play/arena-run/ProPlayArenaRun";
import { useProPlayArenaController } from "@/lib/pro-play/arena";
import { WORLDS_EXPERIENCE_BASE } from "@/lib/pro-play/worldsExperience/productionGate";
import {
  PRO_PLAY_WORLDS_QUIZ_PRESET,
  PRO_PLAY_WORLDS_QUIZ_ROUTE,
} from "@/lib/pro-play/routes";

/**
 * W26Q — the Worlds 2026 quiz: ten questions, every one about this year's
 * World Championship, played in the same canonical arena as the Pro Play Quiz.
 *
 * Everything that makes it "Worlds-only" is the SERVER's: the page asks for
 * the `worlds_2026` preset, and the backend plans all ten questions from
 * verified Worlds 2026 facts (completed results, certified bracket outcomes,
 * the certified field) and freezes them at start. There is no general Pro Play
 * fallback anywhere in that path — if there are not enough verified questions,
 * the start is refused with `PP_PRESET_UNAVAILABLE`, and this page shows that
 * honestly instead of a quiz.
 *
 * Grading, replay, reveal and the arena frame are the Pro Play Quiz's own
 * (`useProPlayArenaController` + `ProPlayArenaRun`), unchanged. The only
 * differences are the preset id, the mode label ("Worlds 2026 Quiz", which the
 * server's session confirms), and the way back (to the Worlds page).
 *
 * W26Q-UX: it is also the one-screen presentation. Nothing scrolls at any
 * width, the header row carries the position and `mogzy.lol`, and a graded
 * reveal moves the run on by itself after its hold — there is no Next / See
 * results control (the general Pro Play Quiz keeps both).
 */
export default function Worlds2026Quiz() {
  const controller = useProPlayArenaController({
    preset: PRO_PLAY_WORLDS_QUIZ_PRESET,
    modeLabel: "Worlds 2026 Quiz",
  });
  return (
    <>
      <SEOHead
        title="Worlds 2026 Quiz | Mogzy"
        description="Ten questions on the 2026 League of Legends World Championship: results, the bracket and the field."
        path={PRO_PLAY_WORLDS_QUIZ_ROUTE}
      />
      <h1 className="sr-only">Worlds 2026 Quiz</h1>
      <ProPlayArenaRun
        controller={controller}
        exitTo={WORLDS_EXPERIENCE_BASE}
        exitLabel="Back to Worlds"
        unavailableNote="Every question comes from verified Worlds 2026 results, bracket and field facts only — never from earlier Worlds. More become available as matches finish."
        backLink
        presentation="one-screen"
      />
    </>
  );
}
