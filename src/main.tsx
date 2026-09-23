import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installChunkLoadRecovery } from "@/lib/chunk-recovery";
import { retireStartupShell } from "@/lib/startup-shell-teardown";
import { installHumanSignalWatcher } from "@/lib/analytics/humanSignal";

installChunkLoadRecovery();

// USERS1 — the only thing that promotes a session to traffic_class = 'human'.
// Wired at the entry point so it covers every route, and so that a reader of
// main.tsx can see that this is where audience classification begins.
installHumanSignalWatcher();

const container = document.getElementById("root")!;
createRoot(container).render(<App />);

retireStartupShell(container);
