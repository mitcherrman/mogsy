import { createRoot } from "react-dom/client";
import "@/index.css";
import AdminFeedback from "@/components/admin/AdminFeedback";

// The real inbox against Supabase REST calls the spec intercepts in the
// browser; nothing reaches a real project.
createRoot(document.getElementById("root")!).render(
  <main className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6"><AdminFeedback /></main>,
);
