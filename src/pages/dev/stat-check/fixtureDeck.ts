import type { StatCheckCard } from "./statCheckEngine";

const C = (
  name: string,
  hp: number,
  hpPerLevel: number,
  ad: number,
  adPerLevel: number,
  armor: number,
  armorPerLevel: number,
  magicResist: number,
  moveSpeed: number,
  attackRange: number,
  attackSpeed: number,
  attackSpeedPerLevel: number,
): StatCheckCard => ({
  id: name,
  name,
  stats: { hp, hpPerLevel, ad, adPerLevel, armor, armorPerLevel, magicResist, moveSpeed, attackRange, attackSpeed, attackSpeedPerLevel },
});

// Standalone prototype fallback. These are deterministic tuning fixtures, not
// a production stat database; the route prefers League Docs champion stats.
export const STAT_CHECK_FIXTURE_DECK: StatCheckCard[] = [
  C("Aatrox", 650, 114, 60, 5, 38, 4.45, 32, 345, 175, 0.651, 2.5),
  C("Ahri", 590, 104, 53, 3, 21, 4.7, 30, 330, 550, 0.668, 2.2),
  C("Akali", 600, 119, 62, 3.3, 23, 5, 37, 345, 125, 0.625, 3.2),
  C("Alistar", 685, 120, 62, 3.75, 47, 4.7, 32, 330, 125, 0.625, 2.1),
  C("Annie", 560, 96, 50, 2.6, 19, 4, 30, 335, 625, 0.579, 1.36),
  C("Ashe", 610, 101, 59, 2.95, 26, 4.6, 30, 325, 600, 0.658, 3.33),
  C("Blitzcrank", 650, 109, 62, 3.5, 40, 5, 32, 325, 125, 0.625, 1.13),
  C("Braum", 610, 112, 55, 3.2, 47, 5, 32, 335, 125, 0.644, 3.5),
  C("Caitlyn", 580, 107, 62, 3.8, 28, 4.7, 30, 325, 650, 0.681, 4),
  C("Darius", 652, 114, 64, 5, 39, 5.2, 32, 340, 175, 0.625, 1),
  C("Ezreal", 600, 102, 60, 2.5, 24, 4.7, 30, 325, 550, 0.625, 2.5),
  C("Fiora", 620, 99, 68, 3.3, 33, 4.7, 32, 345, 150, 0.69, 3.2),
  C("Garen", 690, 98, 69, 4.5, 38, 5, 32, 340, 175, 0.625, 3.65),
  C("Janna", 570, 84, 52, 3, 28, 4.5, 30, 330, 500, 0.625, 2.95),
  C("Jhin", 655, 107, 59, 4.4, 24, 4.7, 30, 330, 550, 0.625, 4.7),
  C("Jinx", 630, 100, 59, 3.15, 26, 4.7, 30, 325, 525, 0.625, 1.4),
  C("Leona", 646, 101, 60, 3, 43, 5.2, 32, 335, 125, 0.625, 2.9),
  C("Lux", 580, 99, 54, 3.3, 19, 4, 30, 330, 550, 0.669, 2),
  C("Malphite", 644, 104, 62, 4, 37, 4.75, 28, 335, 125, 0.736, 3.4),
  C("Master Yi", 669, 100, 66, 3, 33, 4.2, 32, 355, 175, 0.679, 2),
  C("Morgana", 630, 104, 56, 3.5, 25, 4.3, 30, 335, 450, 0.625, 1.53),
  C("Rammus", 675, 94, 56, 3.5, 40, 5.2, 32, 335, 125, 0.656, 2.22),
  C("Sona", 550, 91, 49, 3, 26, 4.3, 30, 325, 550, 0.644, 2.3),
  C("Vayne", 550, 103, 60, 2.35, 23, 4.6, 30, 330, 550, 0.658, 3.3),
];
