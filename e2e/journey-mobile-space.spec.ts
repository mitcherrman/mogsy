/** JSPACE1: authentic backend Journey captures, canonical arena and phone chrome. */
import { expect, test, type Page } from "@playwright/test";

const cases = [
  {cap:"j4-olaf", step:15, kind:"four-answer damage question"},
  {cap:"j4-olaf", step:16, kind:"damage calculation reveal"},
  {cap:"j4-olaf", step:19, kind:"post-purchase state"},
  {cap:"j4-olaf", step:20, kind:"post-purchase combat question"},
  {cap:"jattn1-voli", step:30, kind:"last combat calculation reveal"},
  {cap:"jattn1-voli", step:22, kind:"long-form reveal"},
] as const;
const sizes=[{w:509,h:709},{w:390,h:844},{w:360,h:640}] as const;

async function enter(page:Page,w:number,h:number,cap:string,step:number) {
  await page.setViewportSize({width:w,height:h});
  await page.goto("/dev/journey-arena?capture="+cap+"&step="+step+"&host=daily");
  await expect(page.getByTestId("journey-board")).toBeVisible();
  await expect(page.getByTestId("journey-timeline-toggle")).toBeVisible();
  await page.addStyleTag({content:'[data-testid="journey-arena-harness"] > nav {display:none!important}'});
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(750);
}
async function geometry(page:Page) {
  return page.evaluate(()=>{
    const by=(s:string)=>document.querySelector<HTMLElement>(s);
    const box=(e:Element|null)=>{if(!e)return null;const x=e.getBoundingClientRect();
      return {x:x.x,right:x.right,y:x.y,bottom:x.bottom,w:x.width,h:x.height};};
    const q=(s:string)=>box(by(s));
    const board=by('[data-testid="journey-board"]')!;
    const bar=by('[data-testid="ranked-mobile-bottombar"]')!;
    return {
      width:innerWidth,height:innerHeight,
      xscroll:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      yscroll:document.documentElement.scrollHeight-document.documentElement.clientHeight,
      board:q('[data-testid="journey-board"]'),
      band:q('.journey-band'),
      side1:q('[data-testid="journey-side-subject"]'),
      side2:q('[data-testid="journey-side-opponent"]'),
      subjectKit:q('[data-testid="journey-side-subject"] .journey-side__kit'),
      opponentKit:q('[data-testid="journey-side-opponent"] .journey-side__kit'),
      subjectItems:q('[data-testid="journey-side-subject"] .journey-side__items'),
      opponentItems:q('[data-testid="journey-side-opponent"] .journey-side__items'),
      matchbar:q('[data-testid="ranked-mobile-matchbar"]'),
      bar:box(bar),
      tab:q('[data-testid="journey-timeline-toggle"]'),
      answerButtons:[...document.querySelectorAll<HTMLElement>('[data-quiz-choice]')].map(box),
      reveal:q('[data-testid="journey-reveal"]'),
      equation:q('.journey-reveal .journey-reasoning__chain'),
      eqNodes:[...document.querySelectorAll<HTMLElement>('.journey-reveal .journey-node')].map(box),
      regions:[...document.querySelectorAll<HTMLElement>('[data-testid="journey-question"] [data-surface-region]')].map(e=>({region:e.dataset.surfaceRegion,...box(e)})),
      boardScroll:board.scrollHeight-board.clientHeight,
      boardHorizontal:board.scrollWidth-board.clientWidth,
      matchScore:[...document.querySelectorAll<HTMLElement>('[data-testid^="mobile-score-"]')].map(e=>({text:e.textContent,box:box(e)})),
      timer:q('[data-testid="mobile-timer-value"]'),
      timelineDisplay:getComputedStyle(by('#journey-timeline-content')!).display,
    };
  });
}
for(const {w,h} of sizes)for(const c of cases){
 test("Journey "+w+"x"+h+" "+c.cap+" "+c.step+" "+c.kind,async({page})=>{
  await enter(page,w,h,c.cap,c.step);
  const m=await geometry(page);
  console.log("JSPACE_GEOMETRY",w,h,c.cap,c.step,JSON.stringify(m));
  expect(m.xscroll,JSON.stringify(m)).toBeLessThanOrEqual(1);
  expect(m.board?.h,JSON.stringify(m)).toBeGreaterThanOrEqual(w===509?155:95);
  // A decorative layer may extend 1-2px beyond board scroll measurements;
  // functional objects must fit geometrically, checked below.
  expect(m.boardScroll,JSON.stringify(m)).toBeLessThanOrEqual(3);
  expect(m.boardHorizontal,JSON.stringify(m)).toBeLessThanOrEqual(3);
  const b=m.board!;
  for(const sub of [m.side1,m.side2,m.subjectKit,m.opponentKit,m.subjectItems,m.opponentItems]) {
    expect(sub,JSON.stringify(m)).not.toBeNull();
    expect(sub!.y,JSON.stringify(m)).toBeGreaterThanOrEqual(b.y-2);
    expect(sub!.bottom,JSON.stringify(m)).toBeLessThanOrEqual(b.bottom+2);
  }
  expect(m.timelineDisplay).toBe("none");
  expect(m.matchScore.length).toBe(2);
  expect(m.timer).not.toBeNull();
  expect(m.tab?.h).toBeGreaterThanOrEqual(19);
  if(w===509){
    // Dev harness host adds its own page-height reservation; unlike a real
    // Daily route, document.scrollHeight is not a meaningful viewport-fit
    // oracle here. Measure whether the playable content is in the viewport.
    expect(m.bar?.bottom,JSON.stringify(m)).toBeLessThanOrEqual(h+1);
    expect(m.answerButtons.at(-1)?.bottom ?? 0,JSON.stringify(m))
      .toBeLessThanOrEqual(m.bar!.y-1);
  }
  if(m.reveal && m.eqNodes.length) {
    for(const e of m.eqNodes) {
      expect(e?.y,JSON.stringify(m)).toBeGreaterThanOrEqual(m.reveal.y-2);
      expect(e?.bottom,JSON.stringify(m)).toBeLessThanOrEqual(m.reveal.bottom+2);
    }
  }
  if(w===509 && (c.step===15 || c.step===22)){
    await page.screenshot({path:"test-results/jspace-"+c.cap+"-"+c.step+"-"+w+"x"+h+".png",fullPage:false});
  }
 });
}
test("Journey collapsed timeline can expand then collapse without losing controls",async({page})=>{
  await enter(page,509,709,"j4-olaf",15);
  const toggle=page.getByTestId("journey-timeline-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded","false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded","true");
  await expect(page.locator("#journey-timeline-content")).toBeVisible();
  await expect(page.getByTestId("ranked-mobile-bottombar")).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded","false");
  await expect(page.locator("#journey-timeline-content")).toBeHidden();
});
test("ordinary mobile quiz has no Journey timeline disclosure",async({page})=>{
  await page.setViewportSize({width:509,height:709});
  await page.goto("/dev/ranked-shell-probe?q=opts4&frame=0&lol=1&progression=0");
  await expect(page.getByTestId("ranked-mobile-bottombar")).toBeVisible();
  await expect(page.getByTestId("journey-timeline-toggle")).toHaveCount(0);
  await expect(page.locator("#journey-timeline-content")).toBeVisible();
});
