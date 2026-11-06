/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const DJANGO_DEV_ORIGIN = 'http://127.0.0.1:8000'

// Django + WhiteNoise serves `dist/` under /static/ in production; dev stays at /.
// `vite preview` (used by the Playwright e2e) must serve the build under the same base.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/static/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: DJANGO_DEV_ORIGIN, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'], // e2e/ belongs to Playwright
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      // Map rendering needs WebGL (not available in jsdom); its pure helpers are covered.
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/App.tsx',
        'src/vite-env.d.ts',
        'src/features/map/RouteMap.tsx',
        'src/features/map/RouteLayers.tsx',
      ],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
}))
