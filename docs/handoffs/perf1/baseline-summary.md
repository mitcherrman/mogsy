
### baseline-all — cold (ms from navigation start, median of 2)

| viewport | FCP | Landing Mogzy | auto start | at /lol | /lol bg | shell/spines | covers (4) | Patch book (desktop) | Hub Mogzy | image bytes by hand-off+3s |
|---|---|---|---|---|---|---|---|---|---|---|
| 1440x900 | 877 | not before hand-off | 2605 | 3536 | 13047 | 15516 | 9642 | 16037 | 8825 | 0.57 MB |
| 1366x768 | 829 | not before hand-off | 2595 | 3528 | 13012 | 15512 | 5870 | — | 9379 | 1.11 MB |
| 1024x768 | 841 | not before hand-off | 2603 | 3504 | 13053 | 15495 | 5929 | — | 9428 | 1.11 MB |
| 390x844 | 805 | not before hand-off | 2587 | 3382 | 13413 | 12180 | — | — | 9196 | 1.11 MB |
| 375x667 | 794 | not before hand-off | 2577 | 3369 | 13643 | 14161 | — | — | 9627 | 1.11 MB |
| 1440x900-rm | 1000 | not before hand-off | 1244 | 1477 | 11703 | 14345 | 3729 | — | 10961 | 1.09 MB |
| 390x844-rm | 988 | not before hand-off | 1237 | 1470 | 12153 | 8979 | — | — | 11020 | 1.09 MB |
| direct/lol@1440x900 | 1123 | not before hand-off | — | 626 | 11011 | 13368 | 3577 | 13789 | 12868 | 1.11 MB |
| direct/lol@390x844 | 1083 | not before hand-off | — | 612 | 11531 | 8222 | — | — | 12849 | 0.87 MB |

| journey (cold) | click→URL | click→content | route fallback seen | images pending at content | click→visible images settled | Leaguecraft guide Mogzy (click→) |
|---|---|---|---|---|---|---|
| 1440x900 /quiz | 10 | 59 | yes, yes (duration not recorded in this run; see the handoff) | 8/8 | 16165 | 14298 |
| 390x844 /quiz | 12 | 57 | yes, yes (duration not recorded in this run; see the handoff) | 1/1 | 12821 | 14212 |
| 1440x900 /combat-lab | 13 | 83 | yes, yes (duration not recorded in this run; see the handoff) | 0/0 | 83 | n/a |
| 390x844 /combat-lab | 13 | 79 | yes, yes (duration not recorded in this run; see the handoff) | 0/0 | 79 | n/a |
| 1440x900 /lol/docs | 14 | 2764 | yes, yes (duration not recorded in this run; see the handoff) | 0/0 | 2764 | n/a |
| 390x844 /lol/docs | 11 | 4084 | yes, yes (duration not recorded in this run; see the handoff) | 0/0 | 4085 | n/a |
| 1440x900 /lol/pro-play | 15 | 3206 | yes, yes (duration not recorded in this run; see the handoff) | 2/2 | 3533 | n/a |
| 390x844 /lol/pro-play | 13 | 5014 | yes, yes (duration not recorded in this run; see the handoff) | 1/1 | 5213 | n/a |
| direct/lol@1440x900 /lol/docs | 15 | 7316 | yes 289f/7337ms, yes 298f/7220ms | 0/0 | 7317 | n/a |

### baseline-all — warm (ms from navigation start, median of 2)

| viewport | FCP | Landing Mogzy | auto start | at /lol | /lol bg | shell/spines | covers (4) | Patch book (desktop) | Hub Mogzy | image bytes by hand-off+3s |
|---|---|---|---|---|---|---|---|---|---|---|
| 1440x900 | 417 | 402 | 2154 | 3125 | 3306 | 3307 | 3449 | 3307 | 3291 | 0.00 MB |
| 1366x768 | 402 | 400 | 2162 | 3087 | 3256 | 3256 | 3379 | — | 3241 | 0.00 MB |
| 1024x768 | 382 | 397 | 2144 | 2997 | 3198 | 3199 | 3281 | — | 3178 | 0.00 MB |
| 390x844 | 362 | 377 | 2143 | 2934 | 3112 | 3119 | — | — | 3083 | 0.44 MB |
| 375x667 | 361 | 395 | 2143 | 2927 | 3112 | 3161 | — | — | 3075 | 0.77 MB |
| 1440x900-rm | 429 | 375 | 799 | 1010 | 1570 | 1570 | 1303 | — | 1199 | 0.00 MB |
| 390x844-rm | 400 | 383 | 782 | 1007 | 1549 | 1607 | — | — | 1234 | 0.00 MB |
| direct/lol@1440x900 | 947 | not before hand-off | — | 195 | 1044 | 1109 | 1001 | 1110 | 1110 | 0.00 MB |
| direct/lol@390x844 | 845 | not before hand-off | — | 144 | 1012 | 1071 | — | — | 1071 | 0.09 MB |

| journey (warm) | click→URL | click→content | route fallback seen | images pending at content | click→visible images settled | Leaguecraft guide Mogzy (click→) |
|---|---|---|---|---|---|---|
| 1440x900 /quiz | 8 | 58 | yes, yes (duration not recorded in this run; see the handoff) | 7/7 | 221 | — |
| 390x844 /quiz | 13 | 54 | yes, yes (duration not recorded in this run; see the handoff) | 1/1 | 713 | — |
| 1440x900 /combat-lab | 14 | 88 | yes, yes (duration not recorded in this run; see the handoff) | 0/0 | 88 | n/a |
| 390x844 /combat-lab | 13 | 79 | yes, yes (duration not recorded in this run; see the handoff) | 0/0 | 80 | n/a |
| 1440x900 /lol/docs | 16 | 170 | yes, yes (duration not recorded in this run; see the handoff) | 0/0 | 170 | n/a |
| 390x844 /lol/docs | 13 | 88 | yes, yes (duration not recorded in this run; see the handoff) | 0/0 | 89 | n/a |
| 1440x900 /lol/pro-play | 17 | 521 | yes, yes (duration not recorded in this run; see the handoff) | 2/2 | 538 | n/a |
| 390x844 /lol/pro-play | 14 | 321 | yes, yes (duration not recorded in this run; see the handoff) | 1/1 | 330 | n/a |
| direct/lol@1440x900 /lol/docs | 16 | 97 | yes 4f/65ms, yes 3f/59ms | 0/0 | 97 | n/a |
