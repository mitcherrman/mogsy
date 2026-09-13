import json, sys, collections
from pathlib import Path
REPO = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(REPO))
import os; os.chdir(REPO)
from mastery.facts.sources import open_read_only, resolve_db_path
from mastery.facts.projection import project_champion
from mastery.knowledge import build_bank
from mastery.matchup import compose_matchup
from mastery.matchup import contract as M
from mastery.manifest_session.adapter import dedupe_by_effective_question
from mastery.publication_gate.gate import eligible_candidates
from mastery.synthesis.service import synthesize_champion_mastery, synthesize_matchup_mastery
from mastery.synthesis.applied_chain import synthesize_applied_chain_mastery
from mastery.identity import get_identity_registry

CHAMPIONS = ["Ahri", "Zed", "Olaf", "Jarvan IV", "Soraka"]
MATCHUPS = [("Ahri","Syndra"),("Zed","Yasuo"),("Olaf","Soraka"),("Jarvan IV","Ahri"),("Syndra","Ahri")]
COUNTS=[3,5,8]; SALTS=[None,"gr1p3-seedA","gr1p3-seedB"]

def runs(v):
    L=r=0; p=object()
    for x in v:
        r=r+1 if x==p else 1; L=max(L,r); p=x
    return L

def steps(pub):
    out=[]
    for s in pub.artifact.ordered_steps:
        d=s.to_dict()
        out.append({"cat":d["question_family"],"cmp":d["interaction_kind"]!="atomic_recall",
                    "key":d["candidate_key"],"sem":(d["prompt"],tuple(sorted(map(str,d["answer_options"] or ())))),
                    "ans":str(d["correct_answer"])})
    return out

conn=open_read_only(resolve_db_path(None))
R={"champion":[], "matchup":[], "applied_chain":{}, "roster":{}}

for c in CHAMPIONS:
    ident=get_identity_registry().try_resolve(c)
    fs=project_champion(conn,ident.champion_id)
    el=dedupe_by_effective_question(eligible_candidates(build_bank(conn,ident.champion_id,fact_set=fs).candidates))
    rec={"champion":ident.champion_id,"eligible":len(el),
         "eligible_by_category":dict(sorted(collections.Counter(x.category.value for x in el).items())),"slices":{}}
    for n in COUNTS:
        for salt in SALTS:
            pub,_=synthesize_champion_mastery(conn,c,question_count=n,selection_salt=salt)
            st=steps(pub); cats=[x["cat"] for x in st]
            rec["slices"][f"n{n}/salt={salt}"]={"seq":cats,"categories_used":len(set(cats)),
                "longest_run":runs(cats),"distinct_semantic":len({x["sem"] for x in st}),
                "keys":[x["key"] for x in st],"set_id":pub.mastery_set_id}
    R["champion"].append(rec)

for a,b in MATCHUPS:
    ia=get_identity_registry().try_resolve(a); ib=get_identity_registry().try_resolve(b)
    fa=project_champion(conn,ia.champion_id); fb=project_champion(conn,ib.champion_id)
    bank=compose_matchup(conn,ia.champion_id,ib.champion_id,fact_sets=[fa,fb])
    atomic=[]
    for fs in (fa,fb): atomic.extend(build_bank(conn,fs.champion_id,fact_set=fs).candidates)
    el=dedupe_by_effective_question(eligible_candidates(list(bank.candidates)+atomic))
    cmpc=collections.Counter(x.category.value for x in el if isinstance(x,M.MatchupQuestionCandidate))
    atomc=collections.Counter(x.category.value for x in el if not isinstance(x,M.MatchupQuestionCandidate))
    rec={"pair":[ia.champion_id,ib.champion_id],"eligible":len(el),
         "eligible_comparison":dict(sorted(cmpc.items())),"eligible_atomic":dict(sorted(atomc.items())),"slices":{}}
    for n in COUNTS+[13,16]:
        for salt in SALTS:
            pub,_=synthesize_matchup_mastery(conn,a,b,question_count=n,selection_salt=salt)
            st=steps(pub); cats=[x["cat"] for x in st]
            rec["slices"][f"n{n}/salt={salt}"]={"seq":cats,"comparison_steps":sum(1 for x in st if x["cmp"]),
                "atomic_steps":sum(1 for x in st if not x["cmp"]),"longest_run":runs(cats),
                "comparisons_lead":[x["cmp"] for x in st]==sorted([x["cmp"] for x in st],reverse=True),
                "distinct_semantic":len({x["sem"] for x in st}),"set_id":pub.mastery_set_id}
    R["matchup"].append(rec)

for n in (2,4,14,17):
    try:
        pub=synthesize_applied_chain_mastery(conn,"jarvan","Q","olaf",question_count=n)
        st=steps(pub)
        g=collections.Counter(( x["ans"], x["sem"][1]) for x in st)
        R["applied_chain"][f"n{n}"]={"items":[s.to_dict()["phase"] for s in pub.artifact.ordered_steps],
            "distinct_answer_option_tasks":len(g),"steps":n,
            "identical_task_groups":[list(k) for k,v in g.items() if v>1],
            "prompt0":pub.artifact.ordered_steps[0].to_dict()["prompt"]}
    except Exception as e:
        R["applied_chain"][f"n{n}"]={"error":f"{type(e).__name__}: {e}"}

t=collections.Counter()
for cid in sorted(get_identity_registry().all_ids()):
    pub,_=synthesize_champion_mastery(conn,cid,question_count=3)
    for s in pub.artifact.ordered_steps: t[s.to_dict()["question_family"]]+=1
R["roster"]={"champions":len(get_identity_registry().all_ids()),"first_three_by_category":dict(sorted(t.items()))}
print(json.dumps(R,indent=1,sort_keys=True))
