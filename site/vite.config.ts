import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages derives this from the repository name, so it is not a preference: the site
// is served at https://alegauss.github.io/piano/ and every canonical, asset path and sitemap
// entry carries the prefix. Renaming the repository moves all of them at once, and moves
// the sample pack the app downloads from /piano/pack/ with them.
export const BASE = '/piano/'

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss()],
  build: {
    // docs/ is roadkeep's, never a web root, so the site builds to its own dist/. The Pages
    // workflows copy the sample pack into dist/pack/ after this, which is why the build may
    // empty the folder: nothing else lives in it yet when it runs.
    outDir: 'dist',
    emptyOutDir: true,
  },
})
