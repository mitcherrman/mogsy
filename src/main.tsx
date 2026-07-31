import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installChunkLoadRecovery } from "@/lib/chunk-recovery";
import { retireStartupShell } from "@/lib/startup-shell-teardown";

installChunkLoadRecovery();

const container = document.getElementById("root")!;
createRoot(container).render(<App />);

retireStartupShell(container);
