// PULSE-2B — the scene-specific half of the item editor. One form per
// authorable kind; field names match validation.ts so issues land in place.
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AuthorablePulseItem } from "@/lib/admin/pulse/contract";
import { isoToLocalInput, localInputToIso } from "@/lib/admin/pulse/usePulseWorkspace";
import type { PulseIssue } from "@/lib/admin/pulse/validation";

import { DateTimeField, NullableTextField, NumberField, SelectField, TextField } from "./fields";

interface Props {
  payload: AuthorablePulseItem;
  onChange(next: AuthorablePulseItem): void;
  issues: readonly PulseIssue[];
  disabled?: boolean;
}

export function PulsePayloadFields({ payload: p, onChange, issues, disabled }: Props) {
  const set = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => onChange({ ...p, [k]: v } as AuthorablePulseItem);
  const common = { issues, disabled };

  const titleField = (
    <TextField {...common} label="Accessible title" field="title" value={p.title} onChange={(v) => set("title", v)}
      hint="One sentence for screen readers and the expanded view's heading." testId="pulse-field-title" />
  );

  switch (p.kind) {
    case "news":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField {...common} label="Kicker" value={p.kicker} onChange={(v) => onChange({ ...p, kicker: v })} />
          <TextField {...common} label="Date label" value={p.dateLabel} onChange={(v) => onChange({ ...p, dateLabel: v })} hint="Shown as written, e.g. “This week”." />
          <TextField {...common} className="sm:col-span-2" label="Headline" field="headline" value={p.headline}
            onChange={(v) => onChange({ ...p, headline: v })} testId="pulse-field-headline" />
          <TextField {...common} className="sm:col-span-2" label="Summary" field="summary" multiline value={p.summary}
            onChange={(v) => onChange({ ...p, summary: v })} testId="pulse-field-summary" />
          <TextField {...common} className="sm:col-span-2" label="Article (expanded view)" field="body" multiline
            hint="Blank lines separate paragraphs." value={p.body.join("\n\n")}
            onChange={(v) => onChange({ ...p, body: v.split(/\n{2,}/) })} />
          <div className="sm:col-span-2">{titleField}</div>
          <NullableTextField {...common} label="Link (optional)" field="href" value={p.href} placeholder="/lol/patch-deck"
            onChange={(v) => onChange({ ...p, href: v })} hint="A Mogzy path." testId="pulse-field-href" />
          <TextField {...common} label="Button label" value={p.ctaLabel} onChange={(v) => onChange({ ...p, ctaLabel: v })} />
          <NullableTextField {...common} label="Background champion (optional)" value={p.artChampion ?? null}
            onChange={(v) => onChange({ ...p, artChampion: v ?? undefined })} hint="Champion name from the asset manifest." />
          {p.variant === "event" && (
            <DateTimeField {...common} label="Event starts" field="startsAt" value={isoToLocalInput(p.startsAt ?? null)}
              onChange={(v) => onChange({ ...p, startsAt: localInputToIso(v) ?? undefined })} hint="Drives the live countdown." />
          )}
        </div>
      );

    case "question":
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField {...common} label="Subject" value={p.subject} onChange={(v) => onChange({ ...p, subject: v })} />
            <TextField {...common} label="Practice link" field="practiceHref" value={p.practiceHref} onChange={(v) => onChange({ ...p, practiceHref: v })} />
          </div>
          <TextField {...common} label="Question" value={p.prompt} onChange={(v) => onChange({ ...p, prompt: v })} testId="pulse-field-prompt" />
          <fieldset className="space-y-2" aria-label="Answers">
            <legend className="text-[11px] font-semibold">Answers (select the correct one)</legend>
            {p.options.map((o, i) => (
              <div key={o.id} className="flex items-center gap-2">
                <input type="radio" name={`correct-${p.id}`} aria-label={`Answer ${i + 1} is correct`} checked={p.correctId === o.id}
                  disabled={disabled} onChange={() => onChange({ ...p, correctId: o.id })} />
                <input className="w-full rounded-md border bg-background px-2 py-1 text-xs" aria-label={`Answer ${i + 1}`} value={o.label}
                  disabled={disabled} onChange={(e) => onChange({ ...p, options: p.options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) })} />
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Remove answer ${i + 1}`}
                  disabled={disabled || p.options.length <= 2}
                  onClick={() => {
                    const options = p.options.filter((x) => x.id !== o.id);
                    onChange({ ...p, options, correctId: p.correctId === o.id ? options[0].id : p.correctId });
                  }}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            ))}
            {p.options.length < 4 && (
              <Button type="button" size="sm" variant="outline" disabled={disabled}
                onClick={() => onChange({ ...p, options: [...p.options, { id: nextOptionId(p.options.map((o) => o.id)), label: "" }] })}>
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> Add answer
              </Button>
            )}
          </fieldset>
          <TextField {...common} label="Explanation (after answering)" multiline value={p.explanation} onChange={(v) => onChange({ ...p, explanation: v })} />
          {titleField}
          <p className="text-[11px] text-muted-foreground">Nothing is submitted or scored: the scene only reveals right/wrong.</p>
        </div>
      );

    case "minigame":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField {...common} label="Name" value={p.name} onChange={(v) => onChange({ ...p, name: v })} />
          <TextField {...common} label="Tagline" value={p.tagline} onChange={(v) => onChange({ ...p, tagline: v })} />
          <TextField {...common} label="Play link" field="playHref" value={p.playHref} onChange={(v) => onChange({ ...p, playHref: v })} />
          <TextField {...common} label="Play label" value={p.playLabel} onChange={(v) => onChange({ ...p, playLabel: v })} />
          <NumberField {...common} label="Gold window start (°)" value={p.demo.windowStartDeg} min={0} max={359}
            onChange={(v) => onChange({ ...p, demo: { ...p.demo, windowStartDeg: v ?? 0 } })} />
          <NumberField {...common} label="Gold window size (°)" value={p.demo.windowSizeDeg} min={1} max={359}
            onChange={(v) => onChange({ ...p, demo: { ...p.demo, windowSizeDeg: v ?? 0 } })} />
          <div className="sm:col-span-2">{titleField}</div>
        </div>
      );

    case "sponsor":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField {...common} label="Sponsor name" value={p.sponsorName} onChange={(v) => onChange({ ...p, sponsorName: v })} testId="pulse-field-sponsor" />
          <TextField {...common} label="Campaign title" value={p.campaignTitle} onChange={(v) => onChange({ ...p, campaignTitle: v })} />
          <TextField {...common} className="sm:col-span-2" label="Tagline" value={p.tagline} onChange={(v) => onChange({ ...p, tagline: v })} />
          <NullableTextField {...common} label="Destination (https)" field="href" value={p.href} placeholder="https://"
            onChange={(v) => onChange({ ...p, href: v })} hint="Opens with rel=sponsored noopener. Empty = inert button." />
          <TextField {...common} label="Button label" value={p.ctaLabel} onChange={(v) => onChange({ ...p, ctaLabel: v })} />
          <NullableTextField {...common} className="sm:col-span-2" label="Artwork URL (https, optional)" field="artUrl" value={p.artUrl}
            onChange={(v) => onChange({ ...p, artUrl: v })} />
          <div className="sm:col-span-2">{titleField}</div>
          <p className="sm:col-span-2 text-[11px] text-muted-foreground">The scene always carries the permanent SPONSORED band.</p>
        </div>
      );

    case "creator": {
      const m = p.media;
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField {...common} label="Creator name" value={p.creatorName} onChange={(v) => onChange({ ...p, creatorName: v })} />
          <TextField {...common} label="Creator tag" value={p.creatorTag} onChange={(v) => onChange({ ...p, creatorTag: v })} />
          <SelectField {...common} label="Platform" value={m.platform}
            options={[{ value: "youtube", label: "YouTube video" }, { value: "twitch", label: "Twitch channel" }]}
            onChange={(platform) => onChange({
              ...p,
              media: platform === "youtube"
                ? { platform, videoId: null, title: m.title, durationLabel: "", thumbnailUrl: m.thumbnailUrl }
                : { platform, channel: null, title: m.title, live: false, viewersLabel: "", thumbnailUrl: m.thumbnailUrl },
            })} />
          {m.platform === "youtube"
            ? <NullableTextField {...common} label="YouTube video id" field="media" value={m.videoId} placeholder="11 characters"
                onChange={(v) => onChange({ ...p, media: { ...m, videoId: v } })} />
            : <NullableTextField {...common} label="Twitch channel" field="media" value={m.channel}
                onChange={(v) => onChange({ ...p, media: { ...m, channel: v } })} hint="LIVE is never set by hand." />}
          <TextField {...common} className="sm:col-span-2" label="Media title" value={m.title} onChange={(v) => onChange({ ...p, media: { ...m, title: v } })} />
          {m.platform === "youtube" && (
            <TextField {...common} label="Duration label" value={m.durationLabel} onChange={(v) => onChange({ ...p, media: { ...m, durationLabel: v } })} />
          )}
          <NullableTextField {...common} label="Thumbnail URL (https, optional)" field="thumbnailUrl" value={m.thumbnailUrl}
            onChange={(v) => onChange({ ...p, media: { ...m, thumbnailUrl: v } as typeof m })} />
          <div className="sm:col-span-2">{titleField}</div>
        </div>
      );
    }
  }
}

function nextOptionId(ids: string[]): string {
  for (const c of "abcdefgh") if (!ids.includes(c)) return c;
  return `o${ids.length}`;
}
