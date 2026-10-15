/** Audit only. No layout modification, API requests or production mutation. */
import { test, expect } from "@playwright/test";

const SIZES = [[509,709],[509,844],[390,844],[360,740],[360,640],[430,740]] as const;
const QUESTIONS = ["opts4", "media", "stressA", "realMax", "family"] as const;
for (const [width,height] of SIZES) for (const shape of QUESTIONS) {
  test(`budget ${width}x${height} ${shape}`,async({page})=>{
    await page.setViewportSize({width,height});
    await page.goto(`/dev/ranked-shell-probe?q=${shape}&progression=0&points=4:7-5&name=Kalista_Enjoyer&role=mid&orole=support&lol=1`);
    await page.waitForSelector('[data-testid="ranked-question"]');
    await page.waitForSelector('[data-testid="ranked-mobile-bottombar"]');
    await page.evaluate(()=>document.fonts.ready);
    const m=await page.evaluate(()=>{
      const find=(s:string)=>document.querySelector<HTMLElement>(s);
      const rect=(s:string)=>{
        const el=find(s);if(!el)return null;const r=el.getBoundingClientRect();
        return {y:Math.round(r.y),h:Math.round(r.height),bottom:Math.round(r.bottom),x:Math.round(r.x),w:Math.round(r.width)};
      };
      const stack=find('.question-surface-stack');
      const media=find('[data-surface-region="media"]');
      const prompt=find('[data-surface-region="prompt"]');
      const answers=find('[data-surface-region="answers"]');
      const stage=find('[data-testid="ranked-question"]');
      const shell=find('.ranked-academy[data-phone-arena="true"]');
      const bar=find('[data-testid="ranked-mobile-bottombar"]');
      const css=(el:HTMLElement|null,prop:string)=>el?getComputedStyle(el).getPropertyValue(prop).trim():null;
      return {
        viewport:{width:innerWidth,height:innerHeight},
        page:{scrollY,scrollHeight:document.documentElement.scrollHeight,clientHeight:document.documentElement.clientHeight,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth},
        shell:rect('.ranked-academy[data-phone-arena="true"]'),
        stage:rect('[data-testid="ranked-question"]'),
        match:rect('[data-testid="ranked-match"]'),
        media:rect('[data-surface-region="media"]'),
        hero:rect('[data-testid="scenario-hero"]'),
        mediaCompact:rect('[data-testid="scenario-compact"]'),
        promptRegion:rect('[data-surface-region="prompt"]'),
        promptText:rect('[data-surface-region="prompt"] h2'),
        category:rect('[data-surface-region="prompt"] .scenario-category'),
        answerRegion:rect('[data-surface-region="answers"]'),
        answerGrid:rect('[data-testid="answer-grid"]'),
        choices:[...document.querySelectorAll<HTMLElement>('[data-quiz-choice]')].map(e=>{const r=e.getBoundingClientRect();return {y:Math.round(r.y),bottom:Math.round(r.bottom),h:Math.round(r.height)}}),
        bottomBar:rect('[data-testid="ranked-mobile-bottombar"]'),
        stack:rect('.question-surface-stack'),
        tokens:{media:css(stack,"--qs-media-h"),prompt:css(stack,"--qs-prompt-h"),answers:css(stack,"--qs-answers-h"),max:css(stack,"--qs-media-max")},
        styles:{stackGap:css(stack,"gap"),heroMax:css(find('[data-testid="scenario-hero"]'),"max-height"),mediaMin:css(media,"min-height"),promptMin:css(prompt,"min-height"),answerMin:css(answers,"min-height"),bottomPosition:css(bar,"position"),stageOverflow:css(stage,"overflow")}
      };
    });
    console.log("PHONE_BUDGET",width,height,shape,JSON.stringify(m));
    expect(m.stage).not.toBeNull();
    expect(m.choices.length).toBeGreaterThan(0);
  })
}
