import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installChunkLoadRecovery } from "@/lib/chunk-recovery";

installChunkLoadRecovery();

createRoot(document.getElementById("root")!).render(<App />);

// Fade out the static shell once React has painted
requestAnimationFrame(() => {
  const shell = document.getElementById("initial-shell");
  if (shell) {
    shell.style.opacity = "0";
    setTimeout(() => shell.remove(), 350);
  }
});
