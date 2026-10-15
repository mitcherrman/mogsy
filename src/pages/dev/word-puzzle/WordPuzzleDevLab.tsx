/**
 * INT1 — the DEVELOPMENT-ONLY host for `/dev/word-puzzle`. It is the only
 * module that imports the round fixture (the answer bank), and App.tsx
 * registers it behind `import.meta.env.DEV`, so a production build drops it
 * and the fixture with it.
 */
import fixture from "@/lib/word-puzzle/__fixtures__/wordPuzzleRounds.json";
import type { WordPuzzleRoundFile } from "./labAuthority";
import WordPuzzleLab from "./WordPuzzleLab";

const ROUNDS = (fixture as unknown as WordPuzzleRoundFile).rounds;

export default function WordPuzzleDevLab() {
  return <WordPuzzleLab rounds={ROUNDS} />;
}
