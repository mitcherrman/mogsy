import { useEffect } from "react";
import BroadcastRenderer from "@/components/quiz-broadcast/BroadcastRenderer";
import { useBroadcastSubscriber } from "@/lib/quiz-broadcast/useBroadcastEngine";

/**
 * Broadcast Window — completely clean, no chrome, no controls. Designed for
 * OBS Window Capture. Subscribes to snapshots from the Studio over
 * BroadcastChannel and renders them via the shared BroadcastRenderer.
 */
export default function QuizBroadcastView() {
  const { snapshot } = useBroadcastSubscriber();
  useEffect(() => {
    document.title = "Mogsy Quiz Broadcast";
    // Hide scrollbars so OBS gets a pristine frame.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.style.background = "#000";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return <BroadcastRenderer snapshot={snapshot} />;
}