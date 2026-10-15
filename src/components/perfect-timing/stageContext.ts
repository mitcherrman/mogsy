/**
 * PERFECT TIMING — the stage model's context. The arena host provides it; the
 * lab renderer's Viewport reads it. In its own module so the view builder and
 * the host component can share it without a circular import.
 */
import { createContext } from "react";
import type { PtStageModel } from "@/lib/perfect-timing/viewModel";

export const PerfectTimingStageContext = createContext<PtStageModel | null>(null);
