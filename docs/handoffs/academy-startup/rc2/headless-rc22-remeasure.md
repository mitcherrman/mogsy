| scenario | browser | conditions | path | n | mount | startup surface after hand-off | frames | visible covers | Patch | complete w/o Patch | complete | worst frame (mount→+2.5 s) | dropped ms | fps 3–8 s | veil lift | lift reason | complete at lift | worst frame after lift |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| H2-rc22 | chromium headless 1366×768@1 | cold, 4g | / | 2 | 294 (274–313) | 0 (0–0) | 494 (379–608) | 294 (274–313) | 427 (379–474) | 494 (379–608) | 494 (379–608) | 275 (267–283) | 2166 (2133–2199) | 9 (9.1–9.4) | 1685 (1657–1713) | timeout×1 ready×1 | 2/2 | 217 (150–283) |
| H5-rc22 | chromium headless 390×844@3 mobile-emu | cold, 4g | / | 2 | 155 (95–214) | 0 (0–0) | 155 (95–214) | 155 (95–214) | 1671 (1664–1678) | 155 (95–214) | 155 (95–214) | 100 (83–117) | 858 (233–1482) | 28 (26.9–28.2) | 479 (311–647) | ready×2 | 2/2 | 67 (50–83) |

Network milestones (response end, same origin as above; favicon = number of favicon downloads):

| scenario | n | Academy chunk | manifest | book frame | covers | Patch detail | Quiz chunk | favicon fetches |
|---|---|---|---|---|---|---|---|---|
| H2-rc22 | 2 | -1678 (-1722–-1634) | -1714 (-1764–-1664) | 436 (388–484) | 121 (68–174) | -986 (-1004–-968) | 1915 (1744–2085) | 0 (0–0) |
| H5-rc22 | 2 | -1720 (-1727–-1713) | -1707 (-1727–-1687) | -382 (-411–-353) | -548 (-569–-528) | 155 (45–265) | 1785 (1651–1919) | 0 (0–0) |
