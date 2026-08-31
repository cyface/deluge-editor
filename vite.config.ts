/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset URLs: the same build serves from a domain root (Cloudflare,
  // `vite preview`) and from a subpath (GitHub Pages at /deluge-editor/).
  // Fine while the app is a single page with no router.
  base: './',
  plugins: [svelte()],
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // core/xml uses DOMParser; happy-dom provides it in Node.
    environment: 'happy-dom',
  },
})
