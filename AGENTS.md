# Project Guidelines

## Project Overview

Certificate Gadgets is a browser-based certificate investigation tool and reusable TypeScript API. The package is published as `@pkistudio/certgadgets`.

Key files:

- `src/core.ts`: certificate parsing helpers, tree models, DER/PEM/HEX/Base64 utilities, and the core package API.
- `src/validation.ts`: network-assisted certificate validation planning, response assessment, and validation artifacts.
- `src/app.ts`: browser application shell, certificate tree, detail pane, validation pane, embedded PkiStudioJS viewer integration, and host callbacks.
- `src/viewer.ts`: standalone PkiStudioJS viewer-only page bootstrap.
- `src/version.ts`: build-time package version source used by exported APIs.
- `README.md`: user-facing feature, API, package, and deployment documentation.

## Development Commands

Run these for normal code changes before handing work back:

```sh
npm run check
npm run build
```

Use the VS Code task `Start certgadgets server` or run this when browser verification is needed:

```sh
npm run dev -- --port 5173 --strictPort
```

For package or release-related changes, also run:

```sh
npm run pack:dry-run
```

When checking published package state, use the scoped package name:

```sh
npm view @pkistudio/certgadgets version --json
```

## Architecture Notes

- Keep `package.json` as the source for the package and exported API version.
- Preserve the current Vite and TypeScript build model unless the task explicitly requires changing it.
- Keep UI-specific browser behavior in `src/app.ts`; keep reusable parsing and validation behavior in `src/core.ts` and `src/validation.ts`.
- `@pkistudio/pkistudiojs/viewer` is embedded for ASN.1 inspection. Certificate Gadgets owns certificate loading, validation, and selected-item routing.
- The embedded PkiStudioJS viewer is read-only in Certificate Gadgets. Do not enable PkiStudioJS edit, insert, delete, load, or close actions unless the user explicitly asks for a behavior change in Certificate Gadgets.
- Updating `@pkistudio/pkistudiojs` for viewer compatibility is normally a dependency and documentation update. Do not infer a Certificate Gadgets feature change from a PkiStudioJS feature release.
- Keep host-specific networking outside the core package. Browser network validation should continue to use host callbacks or the Vite-only development proxy path.
- Keep exported entry points stable: `@pkistudio/certgadgets`, `@pkistudio/certgadgets/core`, `@pkistudio/certgadgets/validation`, `@pkistudio/certgadgets/app`, and `@pkistudio/certgadgets/styles.css`.

## Coding Conventions

- Follow the existing TypeScript style and keep changes focused.
- Avoid unrelated UI restyling, large formatting churn, or broad refactors during release and dependency-update tasks.
- Update README or docs when public API behavior, package exports, embedded viewer behavior, validation behavior, or release workflow expectations change.
- Keep version metadata synchronized across `package.json`, `package-lock.json`, and the README `Current version` line when bumping versions.
- Use `@pkistudio/certgadgets` in npm install, import, and documentation examples.
- Use `@pkistudio/pkistudiojs` as an external dependency; do not vendor PkiStudioJS assets into this repository.

## GitHub And Release Notes

- Prefer `gh` for GitHub issue, PR, tag, and release operations when available.
- The standard release workflow is documented in `.github/prompts/release.prompt.md`.
- Do not merge PRs unless the user explicitly asks to proceed.
- After merge is explicitly approved and required versions, credentials, and checks are in place, proceed with tags, GitHub Releases, npm publication, workflow reruns, and post-publication verification without asking for separate confirmations unless something is blocked or ambiguous.
- For release work, use a PR path: branch, focused commit, push, PR, CI, merge, annotated tag, GitHub Release, npm publication, and final verification.
- npm publication targets `@pkistudio/certgadgets` and should be verified after publishing with:

  ```sh
  npm view @pkistudio/certgadgets@<version> version dist-tags dist.tarball --json
  ```

- GitHub Releases should be created for published stable tags and marked as the latest release unless the user instructs otherwise.
- In Codespaces or devcontainers, the default `GITHUB_TOKEN` may not have branch protection administration permissions. Use browser authentication for those operations:

  ```sh
  env -u GITHUB_TOKEN gh auth login --web --scopes repo
  ```
