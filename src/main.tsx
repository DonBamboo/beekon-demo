import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { detectBrowserCompatibility, debugInfo } from "./lib/debug-utils.ts";
import { supabase } from "./integrations/supabase/client";

// Run browser compatibility check on app startup
detectBrowserCompatibility();

// Development helper: Expose supabase client globally for testing
if (import.meta.env.DEV) {
  (window as any).supabase = supabase;
  debugInfo(
    'Development mode: Supabase client exposed globally for testing',
    'ApplicationBootstrap',
    {
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL || 'Not configured',
      hasPublishableKey: !!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      developmentMode: true
    },
    'general'
  );
}

createRoot(document.getElementById("root")!).render(<App />);
