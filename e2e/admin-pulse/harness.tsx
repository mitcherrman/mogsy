// PULSE-2B browser harness: the Admin Pulse Workspace on the in-memory
// prototype repository (no Supabase, no auth). The owner gate itself is
// covered by AdminPulsePage.test.tsx and the PGlite migration suite.
//   ?still=1   framer animations jump to their end (layout screenshots)
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { MotionGlobalConfig } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import { AdminPulseWorkspace } from "@/components/admin/pulse/AdminPulseWorkspace";
import { createMemoryPulseRepository } from "@/lib/admin/pulse/memoryRepository";
import { prototypeSeed } from "@/lib/admin/pulse/prototypeSeed";

MotionGlobalConfig.skipAnimations = new URLSearchParams(location.search).get("still") === "1";
const repository = createMemoryPulseRepository(prototypeSeed(), { latencyMs: 60 });

// App.tsx provides react-query to every route; the Pulse device reads champion art through it.
const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <MemoryRouter>
      <main className="mx-auto w-full max-w-[1400px] px-3 py-4 sm:px-6">
        <AdminPulseWorkspace repository={repository} />
      </main>
    </MemoryRouter>
  </QueryClientProvider>,
);
