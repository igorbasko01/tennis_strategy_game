import { defineConfig } from 'vite';

// Relative base so the build works both at a GitHub Pages sub-path
// (/<repo>/) and at the root of a Cloudflare Pages domain.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 800,
  },
});
