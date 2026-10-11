# Compare two chunked Vitest runs (vt-chunks): totals and failing-test sets.
#   python suite-diff.py <baseDir> <candDir>
import glob, os, re, sys

ANSI = re.compile(r"\x1b\[[0-9;]*m")

def read(d):
    totals = {"files": [0, 0], "tests": [0, 0, 0], "errors": 0, "unfinished": []}
    fails, files = set(), set()
    for log in sorted(glob.glob(os.path.join(d, "chunk-*.log"))):
        text = ANSI.sub("", open(log, encoding="utf-8", errors="replace").read())
        m = re.search(r"Test Files\s+(?:(\d+) failed \| )?(\d+) passed", text)
        t = re.search(r"\n\s+Tests\s+(?:(\d+) failed \| )?(\d+) passed(?: \| (\d+) skipped)?", text)
        if not (m and t):
            totals["unfinished"].append(os.path.basename(log))
        else:
            totals["files"][0] += int(m.group(1) or 0); totals["files"][1] += int(m.group(2))
            totals["tests"][0] += int(t.group(1) or 0); totals["tests"][1] += int(t.group(2)); totals["tests"][2] += int(t.group(3) or 0)
        e = re.search(r"Errors\s+(\d+) error", text)
        if e: totals["errors"] += int(e.group(1))
        for line in text.splitlines():
            s = line.strip()
            if s.startswith("× "):
                fails.add(re.sub(r"\s+\d+ms$", "", s[2:]))
            if s.startswith("FAIL ") and ">" not in s:
                files.add(s[5:].strip())
    return totals, fails, files

base, cand = sys.argv[1], sys.argv[2]
bt, bf, bff = read(base)
ct, cf, cff = read(cand)
print("base:", bt)
print("cand:", ct)
print(f"failing tests: base {len(bf)}, cand {len(cf)}")
print("NEW on cand:", *sorted(cf - bf), sep="\n  ")
print("fixed on cand:", *sorted(bf - cf), sep="\n  ")
print("failed-to-run files base:", sorted(bff), "cand:", sorted(cff))
