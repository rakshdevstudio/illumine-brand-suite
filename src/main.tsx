import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { silenceConsoleInProduction } from "@/lib/logger";

silenceConsoleInProduction();

createRoot(document.getElementById("root")!).render(<App />);
