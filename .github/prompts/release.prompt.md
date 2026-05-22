---
description: "Run the standard PkiStudio release workflow for a repository."
name: "PkiStudio Standard Release Workflow"
agent: "agent"
---

# PkiStudio Standard Release Workflow

Run the standard PkiStudio release workflow.

## Default Operating Mode

- Create or use a GitHub issue.
- Create a feature branch.
- Implement the requested change.
- Run local verification.
- Open a PR.
- Wait for user approval before merging.
- After merge approval, prepare version bump, tag, GitHub Release, npm publish, WordPress post, Pages verification, and Actions verification.

## Required Safety Rules

- Work only in the current repository.
- Never discard user changes.
- Never work directly on main for implementation work.
- Do not publish npm or create public GitHub Releases without explicit approval.
- Do not create ADRs unless the change is meaningfully architectural or the user requested one.
- Keep Wiki work separate from the main repository.

## Repository Profile

Before acting, read the repository-specific profile from:

.github/release-profile.md

Use that file for product name, npm package name, version files, build commands, Pages artifact path, Wiki path, and special release hooks.