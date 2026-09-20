import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  writes: [] as Array<{ table: string; value: unknown }>,
  publishSettings: vi.fn(),
  storageUpload: vi.fn(async () => ({ error: null })),
  refreshAudioStudio: vi.fn(async () => ({
    config: { assets: [], playlists: [], eventBindings: [], modeBindings: [] },
  })),
}));

vi.mock("@/lib/audio/sound-settings-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audio/sound-settings-runtime")>();
  return { ...actual, publishSoundSettings: mocks.publishSettings };
});
vi.mock("@/lib/audio/audio-studio-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audio/audio-studio-runtime")>();
  return { ...actual, refreshAudioStudioRuntime: mocks.refreshAudioStudio };
});
vi.mock("@/pages/welcome/tomeAudio", () => ({ tomeAudioEngine: { scribble: vi.fn(), pageTurn: vi.fn() } }));
vi.mock("@/lib/audio/play-sfx", () => ({ playSfxEngine: { play: vi.fn() }, resetPlaySfxGuards: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const result = (table: string, key?: string) => {
    if (table === "app_settings" && key === "sound_settings") return { data: null, error: null };
    if (table === "app_settings" && key === "custom_sound_urls") return { data: null, error: null };
    return { data: [], error: null };
  };
  const makeBuilder = (table: string) => {
    let selectedKey: string | undefined;
    const builder: Record<string, unknown> = {};
    Object.assign(builder, {
      select: () => builder,
      eq: (_column: string, value: string) => { selectedKey = value; return builder; },
      maybeSingle: () => Promise.resolve(result(table, selectedKey)),
      upsert: (value: unknown) => {
        mocks.writes.push({ table, value });
        return Promise.resolve({ data: null, error: null });
      },
      delete: () => builder,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result(table, selectedKey)).then(resolve),
    });
    return builder;
  };
  return {
    supabase: {
      from: (table: string) => makeBuilder(table),
      storage: { from: () => ({
        upload: mocks.storageUpload,
        getPublicUrl: () => ({ data: { publicUrl: "https://cdn.test/launch.mp3" } }),
      }) },
    },
  };
});

import AdminSounds from "./AdminSounds";

afterEach(() => {
  cleanup();
  mocks.writes.length = 0;
  vi.clearAllMocks();
});

describe("AdminSounds", () => {
  it("renders Academy Hub rows and saves their toggle through sound_settings", async () => {
    render(<AdminSounds />);
    const landing = await screen.findByText("Book Landing");
    expect(screen.getByText("Academy Hub")).toBeTruthy();
    expect(screen.getByText("Book Page Ruffle")).toBeTruthy();
    const row = landing.closest(".rounded-xl")!;
    fireEvent.click(row.querySelector('[role="switch"]')!);
    fireEvent.click(screen.getByRole("button", { name: "Save Sound Settings" }));

    await waitFor(() => expect(mocks.publishSettings).toHaveBeenCalled());
    const settingsWrite = mocks.writes.find(({ table, value }) =>
      table === "app_settings" && (value as { key?: string }).key === "sound_settings");
    expect(settingsWrite).toBeTruthy();
    expect((settingsWrite!.value as { value: Record<string, boolean> }).value.play_book_land).toBe(false);
    expect(mocks.refreshAudioStudio).toHaveBeenCalledTimes(1);
  });

  it("turns an uploaded replacement into an Audio Studio asset and event binding", async () => {
    render(<AdminSounds />);
    const label = await screen.findByText("Launch Chime");
    const row = label.closest(".rounded-xl")!;
    fireEvent.click(row.querySelector('button[title="Upload custom sound"]')!);
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(["audio"], "launch.mp3", { type: "audio/mpeg" })] } });
    await waitFor(() => expect(mocks.storageUpload).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Save Sound Settings" }));
    await waitFor(() => expect(mocks.refreshAudioStudio).toHaveBeenCalledTimes(1));

    const assetWrite = mocks.writes.find(({ table }) => table === "audio_assets");
    const bindingWrite = mocks.writes.find(({ table }) => table === "audio_event_bindings");
    expect(assetWrite?.value).toEqual([expect.objectContaining({
      kind: "sfx", source_url: "https://cdn.test/launch.mp3",
    })]);
    expect(bindingWrite?.value).toEqual([expect.objectContaining({
      event_key: "landing.enter", source_type: "asset", enabled: true,
    })]);
  });
});
