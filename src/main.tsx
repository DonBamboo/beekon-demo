import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { detectBrowserCompatibility } from "./lib/debug-utils.ts";

// Run browser compatibility check on app startup
detectBrowserCompatibility();

createRoot(document.getElementById("root")!).render(<App />);
