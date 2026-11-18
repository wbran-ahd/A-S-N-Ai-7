import { vlyPlugin } from "@vly-ai/integrations";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * Link previews need absolute URLs (WhatsApp and Facebook do not resolve
 * relative `og:image` paths), but the origin is only known per deployment.
 * `%PUBLIC_ORIGIN%` in index.html is replaced at build/serve time from
 * `VITE_PUBLIC_ORIGIN`; unset it and the tags stay relative, which is the right
 * behaviour for localhost where no scraper will ever look.
 */
function publicOriginPlugin(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), "");
  const origin = (env.VITE_PUBLIC_ORIGIN ?? "").trim().replace(/\/+$/, "");
  return {
    name: "sauti-public-origin",
    transformIndexHtml(html) {
      return html.replaceAll("%PUBLIC_ORIGIN%", origin);
    },
  };
}

/**
 * Production Content-Security-Policy (task 9).
 *
 * Injected only into the build: `vite dev` relies on an inline
 * react-refresh preamble, so a strict policy would break development while
 * protecting nothing (the dev server never leaves the machine). Every deployed
 * build gets the full policy below.
 *
 * Notes on the allowlist:
 *   • style-src allows inline styles because Tailwind and React both emit them;
 *   • connect-src lists exactly the APIs the app talks to (Firebase auth and
 *     Firestore, Cloud Functions, Sentry, PostHog, Z.ai) — nothing else;
 *   • frame-src 'none' and object-src 'none' close the classic XSS footholds.
 *
 * CSP is a second line of defence: Firestore rules remain the real boundary.
 */
function cspPlugin(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net https://*.run.app https://*.sentry.io https://*.posthog.com https://api.z.ai",
    "upgrade-insecure-requests",
  ].join("; ");
  return {
    name: "sauti-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "</head>",
        `  <meta http-equiv="Content-Security-Policy" content="${policy}" />\n</head>`,
      );
    },
  };
}

/**
 * Dev host allowlist (task 9).
 *
 * `allowedHosts: true` accepted any Host header, which is what DNS-rebinding
 * attacks rely on. Only loopback is allowed by default; a hosted preview adds
 * its own hostname through VITE_ALLOWED_HOSTS (comma separated) for that run.
 */
function devAllowedHosts(): string[] {
  const extra = (process.env.VITE_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  return ["localhost", "127.0.0.1", ...extra];
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), vlyPlugin(), tailwindcss(), publicOriginPlugin(mode), cspPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Force a single copy of React across all packages (including vlyPlugin).
    // Without this, @vly-ai/integrations can resolve its own React copy, which
    // triggers "Invalid hook call" errors at runtime.
    dedupe: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
  },
  build: {
    // `hidden` emits maps without referencing them from the bundles: a Sentry
    // release can upload them (task 9) while browsers never serve them.
    sourcemap: 'hidden',
    // Optimize chunk splitting
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching and lazy loading
        manualChunks: {
          // Vendor chunks for large libraries
          'react-vendor': ['react', 'react-dom', 'react-router'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          // Only packages that are actually installed may be named here: a
          // stale entry is a *build* error (Rollup: "Could not resolve entry
          // module"), not a warning. The 24-package radix list and the `forms`
          // chunk (react-hook-form / @hookform/resolvers / zod) outlived the
          // dead shadcn components they belonged to and broke `vite build`.
          'radix-ui': [
            '@radix-ui/react-collapsible',
            '@radix-ui/react-dialog',
            '@radix-ui/react-slot',
          ],
          // Heavy optional libraries - separate chunks for better lazy loading
          'framer-motion': ['framer-motion'],
        },
        // Optimize chunk size
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Increase chunk size warning limit for better chunking
    chunkSizeWarningLimit: 1000,
    // Target modern browsers for better optimization
    target: 'esnext',
    // Minify options - using esbuild (faster than terser)
    minify: 'esbuild',
  },
  // Optimize dependencies
  optimizeDeps: {
    // Only scan the app entry HTML; avoids crawling unrelated *.html files
    // if a legacy snapshot accidentally contains leaked package folders.
    entries: ['index.html'],
    include: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      'react-router',
      'framer-motion',
      // vlyPlugin() injects this import at serve time, so the dep scanner
      // never sees it. Without it here the first page load discovers it,
      // re-optimizes and full-reloads the preview mid-screenshot.
      '@vly-ai/integrations',
      // Audit #6: every lazily-imported runtime dep is pre-bundled up front so
      // the dep optimizer stops discovering things one wave at a time — each
      // discovery re-ran the optimizer, bumped the browser hash and made every
      // already-transformed module 504 mid-session (the white preview bug).
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'firebase/app-check',
      'sonner',
    ],
  },
  // Performance hints
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: devAllowedHosts(),
    hmr: false,
  },
}));
