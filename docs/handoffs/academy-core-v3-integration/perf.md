# Academy Core V3 - integration performance (median of N reps)

main = origin/main build (/lol = existing Home Hub); cand = integration build (/lol = Academy Core).
Static server mimics the production cache policy; CDP 10 Mbps / 40 ms; real Railway / Supabase hosts.

## Journey: Landing (/) -> automatic hand-off -> /lol (cold context)

| viewport | build | n | home arrival (ms) | CTA visible | all 4 rooms | covers decoded | book painting | CLS | bytes before hand-off KB (reqs) | bytes after hand-off KB (reqs) | total KB | image KB | retired Hall art / chunk | duplicate network URLs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1366x768 | main | 3 | 2779 | 3047 | 3047 | 4554 | 3168 | 0.0196 | 2023 (173) | 1515 (98) | 3539 | 2222 | ['/assets/LolHub-CGbJ05_a.js', '/assets/academy-library-desktop-D8EmW-OF.webp'] | ['analytics_eventsx2', 'app_settings?select=key%2Cvaluex2'] |
| 1366x768 | cand | 3 | 2873 | 3132 | 3132 | 3132 | 3132 | 0.0197 | 2450 (176) | 806 (99) | 3257 | 1898 | none | ['analytics_eventsx2'] |
| 390x844 | main | 3 | 2743 | 2933 | 2933 | None | 4714 | 0.0026 | 1593 (173) | 1568 (95) | 3161 | 1845 | ['/assets/LolHub-CGbJ05_a.js', '/assets/academy-library-mobile-CaMkwpzl.webp', '/assets/book-spine-flat-v2-CeEWCvGR.webp'] | ['analytics_eventsx2', 'app_settings?select=key%2Cvaluex2'] |
| 390x844 | cand | 3 | 2752 | 3000 | 3000 | 3000 | 4476 | 0.0026 | 2129 (175) | 1128 (100) | 3257 | 1898 | none | ['analytics_eventsx2'] |

## Direct cold /lol and warm reload

| viewport | build | n | cold FCP | cold CTA | cold covers decoded | cold book | cold KB (img) | cold reqs | warm CTA | warm KB | warm reqs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1366x768 | main | 3 | 1148 | 1452 | 3414 | 3613 | 3471 (2163) | 267 | 403 | 37 | 253 |
| 1366x768 | cand | 3 | 1124 | 1276 | 2946 | 3165 | 3189 (1839) | 271 | 412 | 32 | 260 |
| 390x844 | main | 3 | 1200 | 1494 | None | 3360 | 3094 (1786) | 264 | 691 | 37 | 250 |
| 390x844 | cand | 3 | 1164 | 1281 | 2946 | 3197 | 3189 (1839) | 271 | 461 | 1701 | 260 |

## Interaction (after the cold journey, 1x CPU unless noted)

| viewport | cpu | build | hover -> state (ms) | max long task (ms) | click -> Archives content (ms) |
|---|---|---|---|---|---|
| 1366x768 | 1x | main | 144 | 0 | 147 |
| 1366x768 | 1x | cand | 129 | 0 | 335 |
| 1366x768 | 4x | main | 170 | 0 | 347 |
| 1366x768 | 4x | cand | 438 | 71 | 433 |
