import { defineConfig } from 'vite'

export default defineConfig({
  base: './', // works under the GitHub Pages subpath
  publicDir: 'fonts', // the test font and its license ship with the page
  worker: { format: 'es' },
})
