---
description: "Use when preparing, verifying, approving, or publishing releases for PkiStudio repositories."
name: "PkiStudio Release Rules"
---

# PkiStudio Release Rules

- Read `.github/release-profile.md` before taking release-related action.
- Use the profile as the source of truth for product name, package name, version files, build commands, Pages artifact paths, Wiki paths, and repository-specific release hooks.
- Work from an issue and feature branch for implementation work. Do not implement directly on `main`.
- Never discard user changes or overwrite local work without explicit approval.
- Run the repository's local verification commands before opening or updating a release PR.
- Do not merge, tag, publish npm packages, create public GitHub Releases, post to WordPress, or modify Wiki content without explicit approval for that step.
- Keep Wiki edits separate from main repository changes unless the user explicitly asks to combine planning context.
- Treat version bumps, changelog updates, tags, GitHub Releases, npm publish, WordPress posts, Pages checks, and Actions verification as separate release checkpoints.
- If verification fails, stop and report the failing command, relevant output, and the next recommended fix.
- Do not create an ADR for a release unless the release includes a meaningful architectural decision or the user requests one.