/** Audit only. No layout modification, API requests or production mutation. */
import { test, expect } from "@playwright/test";

const SIZES = [[509,709],[390,844],[360,640]] as const;
const QUESTIONS = ["opts4", "media", "stressA", "realMax", "family"] as const;
for (const [width,height] of SIZES) for (const shape of QUESTIONS) {
  test(`budget ${width}x${height} ${shape}`,async({page})=>{
    await page.setViewportSize({width,height});
    await page.goto(`/dev/ranked-shell-probe?q=${shape}&progression=0&points=4:7-5&name=Kalista_Enjoyer&role=mid&orole=support&lol=1`);
    await page.waitForSelector('[data-testid="ranked-question"]');
    await page.waitForSelector('[data-testid="ranked-mobile-bottombar"]');
    await page.evaluate(()=>document.fonts.ready);
    await page.addStyleTag({content:`
    @media (max-width:639.98px) and (max-height:760px) {
      .ranked-shell[data-phone-arena="true"] [data-testid="ranked-question-body"] > * > .question-surface-stack {
        --qs-media-h: 5.5rem;
        --qs-prompt-h: 3.75rem;
      }
      .ranked-shell[data-phone-arena="true"] [data-testid="scenario-hero"] {
        max-height: 100px !important;
      }
      .ranked-shell[data-phone-arena="true"] .ranked-folio {
        --qs-media-max: 100px;
      }
      .ranked-shell[data-phone-arena="true"]::before,
      .ranked-academy[data-phone-arena="true"]::before {
        inset: 0 !important;
      }
    }
    `});
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
        horizontalOverflowers:[...document.querySelectorAll<HTMLElement>("body *")].map(el=>{
          const r=el.getBoundingClientRect();return {tag:el.tagName,cl:(el.className||"").toString().slice(0,70),test:el.dataset.testid,right:Math.round(r.right),left:Math.round(r.left),width:Math.round(r.width),scrollWidth:el.scrollWidth};
        }).filter(el=>el.right>innerWidth+2||el.left< -3||el.scrollWidth>el.width+3).slice(0,12),
        normalBarTop:(()=>{if(!bar)return null;bar.style.position="static";const y=Math.round(bar.getBoundingClientRect().top);bar.style.position="";return y})(),
        styles:{stackGap:css(stack,"gap"),heroMax:css(find('[data-testid="scenario-hero"]'),"max-height"),heroTransform:css(find('[data-testid="scenario-hero"]'),"transform"),heroComputedHeight:css(find('[data-testid="scenario-hero"]'),"height"),mediaMin:css(media,"min-height"),promptMin:css(prompt,"min-height"),answerMin:css(answers,"min-height"),bottomPosition:css(bar,"position"),stageOverflow:css(stage,"overflow")}
      };
    });
    console.log("PHONE_BUDGET",width,height,shape,JSON.stringify(m));
    expect(m.stage).not.toBeNull();
    expect(m.choices.length).toBeGreaterThan(0);
  })
}
