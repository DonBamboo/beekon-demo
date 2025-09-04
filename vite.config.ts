import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDevelopment = mode === 'development';
  
  // Validate critical environment variables are not using placeholder values
  const validateEnvVars = () => {
    const criticalVars = ['VITE_SUPABASE_URL', 'VITE_N8N_URL'];
    const placeholderPattern = /YOUR_.*_HERE/;
    
    for (const varName of criticalVars) {
      const value = process.env[varName];
      if (!value || placeholderPattern.test(value)) {
        if (mode === 'production') {
          throw new Error(`Production build requires valid ${varName}. Please update your environment configuration.`);
        } else {
          console.warn(`Warning: ${varName} is not properly configured. Application may not function correctly.`);
        }
      }
    }
  };
  
  validateEnvVars();
  
  return {
    server: {
      host: "::",
      port: 8080,
      open: false,
      cors: {
        origin: isDevelopment ? true : ['https://lovable.dev'], // Restrict CORS in production
        credentials: false,
      },
      headers: isDevelopment ? {
        // Development: Basic security headers without strict restrictions
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer-when-downgrade',
      } : {
        // Production: Full security headers
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-DNS-Prefetch-Control': 'off',
        'X-Download-Options': 'noopen',
      },
      hmr: {
        overlay: true,
      },
    },
    plugins: [
      react({
        devTarget: 'es2015',
      }),
      isDevelopment && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      sourcemap: isDevelopment ? 'inline' : false,
      minify: mode === 'production' ? 'esbuild' : false,
      chunkSizeWarningLimit: 500, // Smaller chunks for better caching
      target: 'es2015',
      // Security: Remove sensitive information from build
      define: mode === 'production' ? {
        'process.env.NODE_ENV': '"production"',
        __DEV__: 'false',
        'console.log': '(() => {})',
        'console.warn': '(() => {})',
        'console.error': '(() => {})',
      } : undefined,
      rollupOptions: {
        treeshake: {
          moduleSideEffects: false,
        },
        output: {
          manualChunks: {
            // Core React and routing
            vendor: ['react', 'react-dom', 'react-router-dom'],
            
            // Data fetching and state management
            query: ['@tanstack/react-query'],
            supabase: ['@supabase/supabase-js'],
            
            // UI components - split into smaller chunks
            radix: [
              '@radix-ui/react-accordion', 
              '@radix-ui/react-alert-dialog',
              '@radix-ui/react-avatar',
              '@radix-ui/react-checkbox',
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-label',
              '@radix-ui/react-navigation-menu',
              '@radix-ui/react-popover',
              '@radix-ui/react-progress',
              '@radix-ui/react-radio-group',
              '@radix-ui/react-scroll-area',
              '@radix-ui/react-select',
              '@radix-ui/react-separator',
              '@radix-ui/react-slot',
              '@radix-ui/react-switch',
              '@radix-ui/react-tabs',
              '@radix-ui/react-toast',
              '@radix-ui/react-toggle',
              '@radix-ui/react-tooltip'
            ],
            
            // Utility libraries
            utils: ['clsx', 'tailwind-merge', 'class-variance-authority'],
            
            // Form handling
            forms: ['react-hook-form', '@hookform/resolvers', 'zod'],
            
            // Icons - separate chunk as they can be large
            icons: ['lucide-react'],
            
            // Charts - separate chunk as they are feature-specific
            charts: ['recharts'],
            
            // Date and time utilities
            date: ['date-fns'],
            
            // Markdown rendering
            markdown: ['react-markdown', 'remark-gfm'],
            
            // Notifications
            toast: ['sonner'],
            
            // Theming
            theme: ['next-themes'],
            
            // Other UI components
            ui: ['embla-carousel-react', 'vaul', 'input-otp', 'react-resizable-panels'],
          },
          // Split route chunks by functionality
          chunkFileNames: (chunkInfo) => {
            const facadeModuleId = chunkInfo.facadeModuleId;
            if (facadeModuleId) {
              if (facadeModuleId.includes('pages/Analysis')) {
                return 'chunks/analysis-[hash].js';
              }
              if (facadeModuleId.includes('pages/Competitors')) {
                return 'chunks/competitors-[hash].js';
              }
              if (facadeModuleId.includes('pages/Dashboard')) {
                return 'chunks/dashboard-[hash].js';
              }
              if (facadeModuleId.includes('pages/Settings')) {
                return 'chunks/settings-[hash].js';
              }
              if (facadeModuleId.includes('pages/Websites')) {
                return 'chunks/websites-[hash].js';
              }
            }
            return 'chunks/[name]-[hash].js';
          },
        },
      },
    },
    define: {
      __DEV__: JSON.stringify(isDevelopment),
      __PROD__: JSON.stringify(mode === 'production'),
    },
    optimizeDeps: {
      include: ['react', 'react-dom'],
      exclude: isDevelopment ? ['@vite/client'] : [],
    },
    css: {
      devSourcemap: isDevelopment,
    },
    esbuild: {
      drop: mode === 'production' ? ['console', 'debugger'] : [],
      // Security: Minify and obfuscate in production
      legalComments: mode === 'production' ? 'none' : 'inline',
    },
    // Environment variable filtering - prevent exposure of sensitive vars
    envPrefix: ['VITE_'],
    envDir: '.',
  };
});
