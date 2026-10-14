"""Create (or --wipe and recreate) the scratch Role Challenge DB.

  python setup_db.py [--wipe]

Schema comes from the backend's own migrations (Ranked, Study Hall, Daily runs,
role_challenge_runs). Content is the backend's Ranked fixture bank plus sixteen
readable League fundamentals in the certified ``easy_game_knowledge`` families,
so screenshots show real questions. Never touches lol_calc.db.
"""
import os, sys, sqlite3

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

C.ensure_dirs()
os.chdir(C.RUN_DIR)
sys.path.insert(0, C.WORKTREE)
os.environ["LOL_CALC_DB_PATH"] = C.DB_PATH
C.assert_scratch(C.DB_PATH)

if "--wipe" in sys.argv:
    for suffix in ("", "-wal", "-shm", "-journal"):
        try:
            os.remove(C.DB_PATH + suffix)
        except FileNotFoundError:
            pass
    print("wiped", C.DB_PATH)

from migrate_add_ranked_public import migrate as migrate_ranked
from migrate_add_study_hall_attempts import migrate as migrate_study_hall
from migrate_add_daily_runs import migrate as migrate_daily_runs
from migrate_add_role_challenge_runs import migrate as migrate_rc_runs
from canonical_fixture_support import seed_canonical_items
from quiz1_playtest_fixture_support import seed_quiz_bank, insert_question

#: (family, difficulty, key, prompt, options, correct)
RIG_QUESTIONS = (
    ("summoner_spell_cooldown", 1, "flash", "What is Flash's base cooldown?",
     ["180 seconds", "240 seconds", "300 seconds", "360 seconds"], "300 seconds"),
    ("summoner_spell_cooldown", 1, "ignite", "What is Ignite's base cooldown?",
     ["90 seconds", "180 seconds", "240 seconds", "300 seconds"], "180 seconds"),
    ("summoner_spell_cooldown", 1, "heal", "What is Heal's base cooldown?",
     ["120 seconds", "180 seconds", "240 seconds", "300 seconds"], "240 seconds"),
    ("summoner_spell_cooldown", 1, "barrier", "What is Barrier's base cooldown?",
     ["180 seconds", "210 seconds", "240 seconds", "300 seconds"], "180 seconds"),
    ("objective_spawn", 2, "baron", "When does Baron Nashor first spawn?",
     ["10:00", "15:00", "20:00", "25:00"], "20:00"),
    ("objective_spawn", 2, "dragon", "When does the first elemental drake spawn?",
     ["1:30", "5:00", "8:00", "10:00"], "5:00"),
    ("objective_spawn", 2, "elder", "What must happen before the Elder Dragon can spawn?",
     ["A team destroys an inhibitor", "A team claims the Dragon Soul",
      "Baron Nashor is slain", "The game reaches 30:00"], "A team claims the Dragon Soul"),
    ("camp_respawn", 2, "buffs", "How long do Blue Sentinel and Red Brambleback take to respawn?",
     ["2 minutes", "3 minutes", "5 minutes", "6 minutes"], "5 minutes"),
    ("camp_respawn", 2, "scuttle", "How long does the Rift Scuttler take to respawn?",
     ["1:30", "2:30", "4:00", "5:00"], "2:30"),
    ("environment_mechanic", 2, "soul", "How many elemental drakes must one team slay to claim the Dragon Soul?",
     ["2", "3", "4", "5"], "4"),
    ("environment_mechanic", 2, "red", "Which buff does Red Brambleback grant?",
     ["Crest of Insight", "Crest of Cinders", "Hand of Baron", "Aspect of the Dragon"], "Crest of Cinders"),
    ("environment_mechanic", 2, "blue", "Which buff does Blue Sentinel grant?",
     ["Crest of Insight", "Crest of Cinders", "Hand of Baron", "Aspect of the Dragon"], "Crest of Insight"),
    ("environment_mechanic", 2, "inhib", "What happens when you destroy an enemy inhibitor?",
     ["Your team gains gold", "Super minions spawn for your team in that lane",
      "The enemy Nexus loses its turrets", "Baron Nashor spawns"],
     "Super minions spawn for your team in that lane"),
    ("environment_mechanic", 2, "turrets", "How many turrets stand in each lane, not counting Nexus turrets?",
     ["2", "3", "4", "5"], "3"),
    ("environment_mechanic", 2, "nexus", "How many turrets guard each Nexus?",
     ["1", "2", "3", "4"], "2"),
    ("environment_mechanic", 2, "oracle", "Which trinket reveals and disables nearby enemy wards?",
     ["Stealth Ward", "Farsight Alteration", "Oracle Lens", "Control Ward"], "Oracle Lens"),
)

migrate_ranked(C.DB_PATH)
migrate_study_hall(C.DB_PATH)
migrate_daily_runs(C.DB_PATH)
migrate_rc_runs(C.DB_PATH)
conn = sqlite3.connect(C.DB_PATH)
try:
    exists = conn.execute("SELECT name FROM sqlite_master WHERE name='quiz_questions'").fetchone()
finally:
    conn.close()
if not exists:
    conn = sqlite3.connect(C.DB_PATH)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS items (item_name TEXT, item_type TEXT, cost INTEGER);
        CREATE TABLE IF NOT EXISTS item_sheet_metadata (item_name TEXT, gold_cost REAL, asset_path TEXT);
    """)
    names = {f"Item {i:03d}": 100 + i * 50 for i in range(40)}
    seed_canonical_items(conn, names)
    for i in range(40):
        conn.execute("INSERT INTO items VALUES (?, 'legendary', ?)", (f"Item {i:03d}", 100 + i * 50))
        conn.execute("INSERT INTO item_sheet_metadata VALUES (?, ?, ?)",
                     (f"Item {i:03d}", float(100 + i * 50), f"assets/items/{i}.png"))
    conn.commit()
    conn.close()
    seed_quiz_bank(C.DB_PATH)
    conn = sqlite3.connect(C.DB_PATH)
    for family, difficulty, key, prompt, options, correct in RIG_QUESTIONS:
        insert_question(conn, question_key=f"{family}:rig-{key}", difficulty=difficulty,
                        options=options, correct_value=correct, prompt=prompt,
                        category=f"{family} category")
    conn.commit()
    conn.close()
# The Quiz Hub page also reads the legacy quiz tables (sets, progress,
# achievements, history). Their init scripts hard-code "lol_calc.db"; run each
# against the scratch DB by substituting that one constant, never the real file.
LEGACY_INIT = ("init_quiz_tables.py", "init_quiz_sets.py", "init_quiz_category_progress.py",
               "init_quiz_progression_tables.py", "init_quiz_achievements.py",
               "init_quiz_admin_tables.py")
for script in LEGACY_INIT:
    src = open(os.path.join(C.WORKTREE, script), encoding="utf8").read()
    assert 'DB_PATH = "lol_calc.db"' in src, script
    src = src.replace('DB_PATH = "lol_calc.db"', f"DB_PATH = {C.DB_PATH!r}")
    exec(compile(src, script, "exec"), {"__name__": "__main__", "__file__": script})
from migrate_quiz_attempts_v2 import migrate as migrate_attempts_v2
from migrate_add_quiz_sessions import migrate as migrate_quiz_sessions
from migrate_add_quiz_history_identity import migrate as migrate_history_identity
from migrate_add_quiz_packs import migrate as migrate_quiz_packs
for step in (migrate_attempts_v2, migrate_quiz_sessions, migrate_history_identity, migrate_quiz_packs):
    step(C.DB_PATH)

conn = sqlite3.connect(C.DB_PATH)
try:
    n = conn.execute("SELECT COUNT(*) FROM quiz_questions WHERE question_key LIKE '%:rig-%'").fetchone()[0]
    t = len(conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall())
    print(f"scratch db ready: {C.DB_PATH} tables={t} rig_questions={n}")
finally:
    conn.close()
