# Academy Core V3 - integration performance (median of N reps)

main = origin/main build (/lol = existing Home Hub); cand = integration build (/lol = Academy Core).
Static server mimics the production cache policy; CDP 10 Mbps / 40 ms; real Railway / Supabase hosts.

## Journey: Landing (/) -> automatic hand-off -> /lol (cold context)

| viewport | build | n | home arrival (ms) | CTA visible | all 4 rooms | covers decoded | book painting | CLS | bytes before hand-off KB (reqs) | bytes after hand-off KB (reqs) | total KB | image KB | retired Hall art / chunk | duplicate network URLs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1366x768 | main | 3 | 2751 | 2904 | 2904 | 4475 | 3197 | 0.0196 | 2024 (173) | 1515 (98) | 3539 | 2222 | ['/assets/LolHub-DJxZPPZa.js', '/assets/academy-library-desktop-D8EmW-OF.webp'] | ['analytics_eventsx2', 'app_settings?select=key%2Cvaluex2'] |
| 1366x768 | cand | 3 | 2758 | 2990 | 2990 | 2990 | 3025 | 0.0197 | 2451 (176) | 806 (99) | 3257 | 1898 | none | ['analytics_eventsx2'] |
| 390x844 | main | 3 | 2700 | 2898 | 2898 | None | 4660 | 0.0026 | 1584 (172) | 1578 (96) | 3162 | 1845 | ['/assets/LolHub-DJxZPPZa.js', '/assets/academy-library-mobile-CaMkwpzl.webp', '/assets/book-spine-flat-v2-CeEWCvGR.webp'] | ['analytics_eventsx2', 'app_settings?select=key%2Cvaluex2'] |
| 390x844 | cand | 3 | 2705 | 2909 | 2909 | 2909 | 4444 | 0.0026 | 2129 (175) | 1128 (100) | 3257 | 1898 | none | ['analytics_eventsx2'] |

## Direct cold /lol and warm reload

| viewport | build | n | cold FCP | cold CTA | cold covers decoded | cold book | cold KB (img) | cold reqs | warm CTA | warm KB | warm reqs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1366x768 | main | 3 | 1080 | 1424 | 3358 | 3607 | 3471 (2163) | 267 | 335 | 37 | 253 |
| 1366x768 | cand | 3 | 1108 | 1230 | 2917 | 3156 | 3190 (1839) | 271 | 298 | 32 | 260 |
| 390x844 | main | 3 | 1076 | 1394 | None | 3320 | 3094 (1786) | 264 | 329 | 37 | 250 |
| 390x844 | cand | 3 | 1064 | 1188 | 2908 | 3142 | 3190 (1839) | 271 | 321 | 32 | 260 |

## Interaction (after the cold journey, 1x CPU unless noted)

| viewport | cpu | build | hover -> state (ms) | max long task (ms) | click -> Archives content (ms) |
|---|---|---|---|---|---|
| 1366x768 | 1x | main | 113 | 0 | 79 |
| 1366x768 | 1x | cand | 92 | 0 | 304 |
| 1366x768 | 4x | main | 151 | 0 | 245 |
| 1366x768 | 4x | cand | 267 | 0 | 364 |
