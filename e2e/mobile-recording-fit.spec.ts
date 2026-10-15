import { test, expect } from "@playwright/test";
/** MVFIT1 — real CanonicalArena, no extra Frame, no backend. */
const shapes = ["opts4","media","stressA","realMax","family"] as const;
const sizes = [
  {w:509,h:709}, // Shorts target
  {w:509,h:739}, // just before reserves finish expanding
  {w:509,h:761}, // just after old 760px breakpoint
  {w:390,h:844}, // ordinary phone must remain unchanged
  {w:600,h:820}, // wider short phone - media aspect stress
  {w:360,h:640}, // fallback allowed only for truly long content
] as const;
const uri = (q:string) => "/dev/ranked-shell-probe?q="+q+"&frame=0&lol=1&points=4:7-5&name=Kalista_Enjoyer&role=mid&orole=support&progression=0";
async function openShape(page:import("@playwright/test").Page,q:string){
  await page.goto(uri(q));
  await page.waitForSelector('[data-testid="ranked-mobile-bottombar"]');
  await page.waitForSelector('[data-testid="ranked-question"]');
  await page.evaluate(()=>document.fonts.ready);
  // The real QuizAnswerOptions has a 350ms entrance with 150ms+70ms/item
  // stagger. Sample settled geometry, not intermediate transform offsets.
  await page.waitForTimeout(850);
}
async function inspect(page:import("@playwright/test").Page){
  return page.evaluate(()=>{
    const sel=(s:string)=>document.querySelector<HTMLElement>(s);
    const rect=(e:HTMLElement)=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,h:r.height}};
    const stage=sel('[data-testid="ranked-question"]')!;
    const bar=sel('[data-testid="ranked-mobile-bottombar"]')!;
    const choices=[...document.querySelectorAll<HTMLElement>("[data-quiz-choice]")].map(rect);
    const stack=sel(".question-surface-stack")!;
    const s=getComputedStyle(stack);
    return {
      vertical:document.documentElement.scrollHeight-document.documentElement.clientHeight,
      horizontal:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      stage:rect(stage),bar:rect(bar),choices,
      media:rect(sel('[data-surface-region="media"]')!),
      prompt:rect(sel('[data-surface-region="prompt"]')!),
      mediaReserve:s.getPropertyValue("--qs-media-h").trim(),
      promptReserve:s.getPropertyValue("--qs-prompt-h").trim(),
      answerReserve:s.getPropertyValue("--qs-answers-h").trim(),
      nestedScroll:[stage,...stage.querySelectorAll<HTMLElement>("*")].some(el=>/auto|scroll/.test(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+1),
    };
  });
}
for(const vp of sizes)for(const shape of shapes){
  test("mobile fit "+vp.w+"x"+vp.h+" "+shape,async({page})=>{
    await page.setViewportSize({width:vp.w,height:vp.h});
    await openShape(page,shape);
    let m=await inspect(page);
    console.log("MVFIT",vp.w,vp.h,shape,JSON.stringify(m));
    expect(m.choices.length).toBe(4);
    expect(m.horizontal,JSON.stringify(m)).toBeLessThanOrEqual(1);
    expect(m.bar.h).toBeGreaterThan(45);
    expect(m.bar.top).toBeGreaterThanOrEqual(-1);
    expect(m.bar.bottom).toBeLessThanOrEqual(vp.h+1);
    expect(m.nestedScroll,JSON.stringify(m)).toBe(false);
    for(const a of m.choices){
      expect(a.top,JSON.stringify(m)).toBeGreaterThanOrEqual(m.stage.top-1);
      expect(a.bottom,JSON.stringify(m)).toBeLessThanOrEqual(m.stage.bottom+1);
      expect(a.left).toBeGreaterThanOrEqual(m.stage.left-1);
      expect(a.right).toBeLessThanOrEqual(m.stage.right+1);
      expect(a.h).toBeGreaterThanOrEqual(47.9);
    }
    if(vp.w===509 || vp.h>=740 || shape==="opts4"){
      expect(m.vertical,JSON.stringify(m)).toBeLessThanOrEqual(1);
      expect(m.choices[3].bottom,JSON.stringify(m)).toBeLessThanOrEqual(m.bar.top-1);
    }else{
      await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
      m=await inspect(page);
      expect(m.choices[3].bottom,JSON.stringify(m)).toBeLessThanOrEqual(m.bar.top-1);
    }
    if(vp.w===509 && shape==="media"){
      await page.screenshot({path:"test-results/mvfit-"+vp.w+"x"+vp.h+"-item.png",fullPage:false});
    }
  });
}
test("509x709: answer position remains stable across question families",async({page})=>{
  await page.setViewportSize({width:509,height:709});
  const positions:number[]=[];
  for(const shape of shapes){
    await openShape(page,shape);
    positions.push((await inspect(page)).choices[0].top);
  }
  const spread=Math.max(...positions)-Math.min(...positions);
  console.log("MVFIT_SPREAD",JSON.stringify({positions,spread}));
  expect(spread).toBeLessThanOrEqual(1);
});
