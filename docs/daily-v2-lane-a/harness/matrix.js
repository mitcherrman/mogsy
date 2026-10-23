window.__cases = [
 {name:'correct-item', q:'card=0&outcome=correct'},
 {name:'wrong-2line-long', q:'card=3&outcome=incorrect&long=1'},
 {name:'timeout-item', q:'card=0&outcome=timeout'},
 {name:'classification-wrong', q:'card=1&outcome=incorrect'},
 {name:'recognition-wrong', q:'card=2&outcome=incorrect'},
 {name:'legacy-null', q:'card=0&outcome=incorrect&null=1'},
 {name:'armor-correct', q:'card=4&outcome=correct&l=1,984%20HP&r=1,861%20HP'},
];
window.__runMatrix = async (widths, cases, keep) => {
  const out = [];
  const wrap = document.createElement('div'); wrap.id='matrix'; wrap.style.cssText='position:fixed;inset:0;background:#000;overflow:auto;z-index:99999;display:flex;flex-wrap:wrap;gap:6px;padding:6px;align-content:flex-start';
  document.body.appendChild(wrap);
  for (const w of widths) for (const c of cases) {
    const f = document.createElement('iframe'); f.width=w; f.height=420; f.style.cssText='flex:none;border:0;background:#10131a';
    f.src = '/.harness-a/index.html?' + c.q + '&_=' + Math.random(); wrap.appendChild(f);
    await new Promise(r => f.onload = r);
    await new Promise(r => setTimeout(r, 3200));
    const d = f.contentDocument; const R = (sel) => { const e = d.querySelector(sel); if(!e) return null; const r=e.getBoundingClientRect(); return {t:r.top,b:r.bottom,l:r.left,r:r.right,h:r.height,w:r.width}; };
    const res = {w, case:c.name, vw:f.contentWindow.innerWidth, sw:d.documentElement.scrollWidth, row:R('[data-testid="mr-card-row"]')?.h, surface:R('[data-testid="mr-surface"]')?.h};
    for (const side of ['left','right']) {
      const card=R(`[data-testid="mr-choice-${side}"]`), art=R(`[data-testid="mr-choice-${side}"] [data-testid="mr-card-art"]`), lab=R(`[data-testid="mr-choice-${side}-label"]`);
      const val=R(`[data-testid="mr-value-${side}"]`) || R(`[data-testid="mr-reveal-label-${side}"]`), tag=R(`[data-testid="mr-tag-${side}"]`);
      const txt = d.querySelector(`[data-testid="mr-value-${side}"] span, [data-testid="mr-reveal-label-${side}"] span`);
      res[side] = { card: card && [Math.round(card.w),Math.round(card.h)], hasVal: !!val,
        valInside: val ? (val.l>=card.l && val.r<=card.r && val.b<=card.b) : null,
        gapLabelVal: (val && lab) ? Math.round(val.t-lab.b) : null,
        gapArtVal: (val && art) ? Math.round(val.t-art.b) : null,
        gapTagArt: (tag && art) ? Math.round(art.t-tag.b) : null,
        truncated: txt ? txt.scrollWidth>txt.clientWidth : null };
    }
    out.push(res);
  }
  if (!keep) wrap.remove();
  return out;
};
window.__sum = (res)=>res.map(r=>`${r.w}|${r.case}|vw${r.vw}|sw${r.sw}|row${r.row}|surf${r.surface}|L:${JSON.stringify([r.left.card,r.left.hasVal,r.left.valInside,r.left.gapLabelVal,r.left.gapArtVal,r.left.gapTagArt,r.left.truncated])}|R:${JSON.stringify([r.right.hasVal,r.right.valInside,r.right.gapLabelVal,r.right.gapArtVal,r.right.truncated])}`).join('\n');
