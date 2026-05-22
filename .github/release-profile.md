# certgadgets Release Profile

## Repository

- GitHub repository: `pkistudio/certgadgets`
- Product name: `Certificate Gadgets`
- npm package name: `@pkistudio/certgadgets`
- Hosted Pages URL: `https://pkistudio.github.io/certgadgets/`
- Documentation URL: `https://github.com/pkistudio/certgadgets/wiki`
- ADR path: `docs/adr/`

## Version And Build

- Version files:
  - `package.json`
  - `package-lock.json`
  - `README.md` (`Current version:`)
- Version source: `package.json` is the source for the package and exported API version.
- Install command: `npm ci`
- Build command: `npm run build`
- Verification commands:
  - `npm run check`
  - `npm run build`
- Package preview command: `npm run pack:dry-run`
- Published package verification:
  - `npm view @pkistudio/certgadgets@<version> version dist-tags dist.tarball --json`

## Publishing

- npm publish workflow: `.github/workflows/publish-npm.yml`
- npm publish command in workflow: `npm publish --provenance --access public`
- npm publication requires explicit user approval.
- GitHub Release requires explicit user approval.
- Stable published tags should have a GitHub Release marked as latest unless the user instructs otherwise.
- WordPress post workflow: `.github/workflows/publish-release-to-wordpress.yml`
- WordPress post title pattern: `Certificate Gadgets <tag> をリリースしました`

## Pages And Wiki

- Pages workflow: `.github/workflows/pages.yml`
- Pages artifact path: `dist`
- Wiki path in Codespaces: `/workspaces/certgadgets.wiki`
- Keep Wiki work separate from main repository work unless explicitly requested.

## Special Hooks

- Keep host-specific networking outside the core package. Browser network validation should continue to use host callbacks or the Vite-only development proxy path.
- Updating `@pkistudio/pkistudiojs` for viewer compatibility is normally a dependency and documentation update, not a Certificate Gadgets feature change.
- Browser verification command: `npm run dev -- --port 5173 --strictPort`.
