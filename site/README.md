# Piano site

The public site at <https://alegauss.github.io/piano/>: a self-contained Vite + React 19 +
TypeScript + Tailwind v4 workspace. It is standalone: the root `npm ci` does not install it
and the root build does not need it. It builds to `site/dist/` and never writes into `docs/`,
which is roadkeep's.

## Commands

```
npm ci             # once
npm run dev        # generate, then the dev server at /piano/
npm run build      # generate → tsc → client → og image → SSR → prerender
npm test           # the site's own claims, against what the build produced
npm run typecheck  # tsc -b, no emit
npm run preview    # serve the built dist/
```

`npm run build` is the gate, and it is one command on purpose. It regenerates the product
facts from this repository, type-checks, builds the client, rasterises the social card, builds
the SSR bundle and prerenders every route with its Markdown twin, `manifest.json`,
`sitemap.xml` and `robots.txt`. A drifted `<head>` template, a route with no page, or a tool
the copy names that the server no longer registers fails it. `npm test` then asserts the built
output, so it runs after the build rather than instead of it.

## Where things live

| Path                                                      | What                                                                                                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/site-content.ts`                                 | **All copy.** Sections only render it, so a claim is one array element a reviewer can check                                        |
| `scripts/product.mjs` → `src/lib/product.generated.ts`    | **Every name and number** about the product: tools, commands, levels, bundled scores, version, licence, whether there is a release |
| `src/lib/features.ts`                                     | The depth pages, one record each; the route, the `<head>` and the page all come off the record                                     |
| `src/routes.tsx`                                          | The route table and its metadata, asserted against each other at import time                                                       |
| `src/lib/theme.ts` + the pre-paint script in `index.html` | The theme follows the OS, a stored choice overrides it, applied before first paint                                                 |
| `src/index.css`                                           | The tokens, which are the app's own palette from `tokens.css`, and the layout                                                      |
| `src/components/sections/`                                | One component per landing section; the order in `pages/Landing.tsx` is the argument                                                |
| `scripts/prerender.mjs`, `scripts/markdown.mjs`           | Per-route HTML, the Markdown twin converted from the same render, the manifest and the sitemap                                     |
| `scripts/*.test.mjs`                                      | The site's claims, asserted against the sources and against `dist/`                                                                |

## Publishing

The site shares GitHub Pages with the sample pack the app downloads from `/piano/pack/`, and a
Pages deployment replaces everything that was there. So the site is never published on its
own: `.github/workflows/pages.yml` and the release workflow both build the site, copy the pack
into `dist/pack/`, and deploy the two together. `site.yml` builds and tests the site on every
push and pull request, and deploys nothing.

To publish a change to the site, run the **Sample pack** workflow by hand
(`workflow_dispatch`). The pack comes from its cache, so the run is quick.

GitHub Pages derives the base path from the repository name, so `base` is `/piano/`, written
in `vite.config.ts` and `src/lib/paths.ts`. Renaming the repository moves every published URL,
the pack's included.

## Deliberate non-goals

No third-party fonts (the app's own system stacks), no analytics, no cookie banner. The one
script from elsewhere is the house ad slot, drawn in its own shadow root with no identifiers
and no storage.
