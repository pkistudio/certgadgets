---
description: "Use when: running the certgadgets release workflow, including version bump, ADR assessment, wiki maintenance, tag, GitHub Release, WordPress release post, npm first publish, scoped public package access, GitHub Pages status, and Actions checks."
name: "certgadgets release workflow"
argument-hint: "[version|TBD] [#issue] <short release summary>"
agent: "agent"
---

# certgadgets Release Workflow

Run the standard certgadgets release workflow from local release preparation through GitHub Release, WordPress release post, npm publication, and post-publication verification.

Expected invocation examples:

```text
/release 0.1.0 "Initial Certificate Gadgets release"
/release v0.1.0 "Initial npm release"
/release TBD "Prepare certificate validation updates"
/release TBD #12 "Improve validation artifact handling"
```

The release version may be omitted or set to `TBD` while development is still in progress. Do not tag, create a GitHub Release, or publish to npm until the final version is known and the user has explicitly approved the publication step.

## Default Operating Mode

Proceed proactively through checks, focused edits, and local verification. Keep progress updates brief, but pause for explicit confirmation before pushing tags, creating a public GitHub Release, or publishing to npm.

Default assumptions:

- If an issue number is supplied, use that issue as the source of truth for release scope, rationale, release notes, ADR needs, wiki needs, and verification notes.
- Assess whether release-level architectural decisions should be captured in ADRs under `docs/adr/`; do not ask about ADRs by default. Ask the user only when you judge that a new ADR may be warranted and the user has not already requested or declined one.
- Assess whether user-facing behavior, package API behavior, validation behavior, release process expectations, or operating procedures should be reflected in the GitHub Wiki, and keep wiki work separate from the main repository release commit or PR.
- Use the issue body, issue comments, PR body, release notes, or final report to preserve release rationale, ADR status, wiki publication status, verification results, and publication status.

Ask only when:

- The requested version is missing and the workflow has reached a version-required step.
- You judge that the supplied request or issue appears to introduce a meaningful ADR-worthy architectural decision, and the user has not already requested or declined ADR creation.
- The working tree has unrelated uncommitted changes.
- GitHub or npm permissions block progress.
- The requested release scope is ambiguous enough that release notes or package metadata could be wrong.

Confirmation gates:

- Gate 1: local version bump, package metadata, release prompt, and documentation edits.
- Gate 2: commit and push to GitHub.
- Gate 3: tag push and GitHub Release creation.
- Gate 4: npm publication or npm workflow rerun/manual publication if first publish needs intervention.
- Gate 5: post-publication registry, fresh-install, Pages, and Actions verification.

## Required Safety Rules

- This prompt is a workflow guide only and does not grant repository permissions.
- Push, tag, release, and npm operations require the user or token to have the needed permissions.
- npm publication requires package ownership for `@pkistudio/certgadgets` or a configured npm Trusted Publisher for this repository.
- WordPress release posting requires repository secrets `WPCOM_ACCESS_TOKEN` and `WPCOM_SITE_ID`; `WP_RELEASE_CATEGORY_ID` is an optional repository variable.
- Work in the current repository only.
- Check current branch, remote, tags, and working tree before making changes.
- Never discard uncommitted user changes.
- If unrelated local changes exist, stop and ask how to proceed.
- Do not create ADRs for trivial implementation details, routine bug fixes, documentation-only changes, release bookkeeping, or decisions already covered by an existing ADR.
- When adding or updating ADRs, use `docs/adr/0000-template.md` and follow `.github/instructions/adr.instructions.md`: keep one decision per file, focus on why the decision was made, include alternatives and consequences, and keep replaced ADRs as `Superseded` instead of deleting them.
- Do not add a new ADR solely on agent judgment without user confirmation, unless the user explicitly requested ADR creation in the invocation or issue discussion.
- Keep GitHub Wiki work in the wiki repository, normally `/workspaces/certgadgets.wiki`, and do not mix wiki commits into the main repository release commit or PR.
- Do not push wiki changes until the user has asked for publication or confirmed the prepared wiki content.
- Preserve existing package metadata unless the release requires a focused change.
- Do not add `private: true` to prevent npm publication.
- Use non-interactive git commands where possible.

## Inputs

Derive these from the invocation when possible:

- `version`: release version, normalized to both `X.Y.Z` and `vX.Y.Z` forms.
- `issueNumber`: existing GitHub issue number when the invocation includes a `#<number>` reference or an unambiguous issue URL.
- `summary`: short release summary.
- `releaseNotes`: user-facing changes and important package/API notes.
- `architectureDecision`: release-level design decision, if the request or issue includes one that should be recorded in `docs/adr/`.
- `wikiWork`: user-facing documentation or operating procedure updates that should be reflected in the GitHub Wiki.
- `verificationPlan`: expected local checks. If not supplied, run the standard checks below.

## Standard Release Notes Shape

Use this shape for GitHub Release notes unless the user supplies a more specific format:

```md
## Highlights
- ...

## npm
- Package: `@pkistudio/certgadgets@X.Y.Z`
- Entry points: `@pkistudio/certgadgets`, `@pkistudio/certgadgets/core`, `@pkistudio/certgadgets/validation`, `@pkistudio/certgadgets/app`, `@pkistudio/certgadgets/styles.css`

## Verification
- `npm run check`
- `npm run build`
- `npm run pack:dry-run`
```

## Workflow

1. Preflight
   - Confirm the repository is `pkistudio/certgadgets` unless the user intentionally targets another repo.
   - Confirm the current branch, default branch, and remote.
   - Check for unrelated uncommitted changes.
   - If `issueNumber` is known, fetch the existing issue and use its title, body, requirements, labels, and discussion as source context. Do not create a duplicate issue.
   - Check whether the requested tag already exists locally or remotely.
   - Check whether `@pkistudio/certgadgets@<version>` is already published on npm.
   - If npm returns `E404`, treat that as expected for the first package publication and continue with first-publish safeguards.

2. Assess ADR Needs
   - Review `docs/adr/` before release preparation when the change involves external dependencies, package export strategy, public API design, certificate parsing semantics, validation semantics, OCSP/AIA/CRL behavior, host integration boundaries, deployment architecture, runtime infrastructure, release automation, or major framework or library choices.
   - Treat ADR creation as an exception path, not a required release checklist question.
   - Ask the user about ADR creation only when you judge that the change introduces a meaningful architectural decision that is not already covered by an existing ADR.
   - If you do not judge the change to be ADR-worthy, continue without asking the user about ADRs.
   - Do not ask about ADRs for routine fixes, implementation details, local refactors, documentation-only changes, release bookkeeping, or decisions already covered by an existing ADR.
   - If the user already requested ADR creation, proceed with the ADR without asking again.
   - If the user already declined ADR creation for the release scope, continue without asking again.
   - When asking, briefly explain the suspected decision, why it may deserve an ADR, and the proposed ADR title. Keep the question concise and offer a clear yes/no path.
   - If the user confirms, add a new ADR under `docs/adr/` using `docs/adr/0000-template.md` and `.github/instructions/adr.instructions.md`.
   - Number new ADRs sequentially and use a concise kebab-case filename such as `0001-keep-host-neutral-validation-networking.md`.
   - In the ADR, reference the source issue, PR, release notes, related design notes, and any related ADRs in the `Related` section when available.
   - If the release follows an existing ADR, mention that ADR in the PR body, release notes, or final report instead of creating a duplicate ADR.
   - If the release scope appears to conflict with an existing ADR, stop and ask how to proceed before making the conflicting change.

3. Assess Wiki Needs
   - Use the GitHub Wiki for user-facing operational guidance, reusable API guidance, validation workflows, release process notes, screenshots, and documentation that should be browsed outside the package README.
   - Keep README updates in the main repository when they describe package installation, package exports, current version, or npm-facing documentation. Use the wiki for expanded workflows and maintenance guidance.
   - If wiki changes are needed, work in `/workspaces/certgadgets.wiki` when it exists. If it is missing, run `.devcontainer/setup-wiki.sh` or clone `https://github.com/pkistudio/certgadgets.wiki.git` next to the main workspace.
   - Follow the existing wiki structure and PkiStudioJS-style conventions: Markdown pages at the wiki root, `_Sidebar.md` for navigation, `images/` for screenshots, and root `favicon.ico` for the wiki favicon.
   - Validate wiki links and image references before committing. For Gollum preview, use the VS Code task `Start certgadgets wiki` or run `gollum --host 0.0.0.0 --port 4567 /workspaces/certgadgets.wiki`; if port `4567` is already in use, use a temporary alternate port and stop it when done.
   - Commit wiki changes in the wiki repository separately from main repository release changes.
   - Push wiki changes only after the user has asked for publication or confirmed the prepared wiki content. Record pushed wiki commit hashes in the issue, PR body, release notes, or final report when relevant.

4. Prepare Version and Package Metadata
   - Update `package.json` `version`; this is the source for the app and exported API version.
   - Update `package-lock.json` root package version.
   - Update `README.md` current version and any release-relevant npm/API documentation.
   - Ensure scoped npm first publication is public by setting:

     ```json
     "publishConfig": {
       "access": "public"
     }
     ```

   - Recheck npm exports, package `files`, type declarations, and build output expectations.

5. Verify Locally
   - Run:

     ```sh
     npm run check
     npm run build
     npm run pack:dry-run
     ```

   - Inspect the dry-run file list and package size for accidental omissions or unrelated files.
   - Use the existing VS Code task `Start certgadgets server` or run `npm run dev` when browser verification is needed.
   - For wiki changes, preview with Gollum and verify affected pages, sidebar links, images, and favicon assets.
   - Stop any verification server started for the release.

6. Commit and Push
   - Review the diff before committing.
   - Commit focused release-preparation changes.
   - Push the branch or `main` only after confirming the intended release path.
   - If wiki changes were made, commit them separately in `/workspaces/certgadgets.wiki` and push `master` only after the user confirms publication.

7. Tag and Create GitHub Release
   - Normalize the tag to `vX.Y.Z`.
   - Create an annotated tag on the release commit.
   - Push the tag only after Gate 3 approval.
   - Create a GitHub Release named `vX.Y.Z`, latest stable, not draft and not prerelease unless instructed otherwise.
   - Confirm the `Publish release to WordPress` workflow starts after the GitHub Release is published.

8. Publish npm
   - Preferred first publish command from an authenticated npm owner account:

     ```sh
     npm publish --access public
     ```

   - If Trusted Publishing is configured later, verify the workflow filename, npm trusted publisher repository, and any environment name before rerunning.
   - For scoped packages, `E404`, `ENEEDAUTH`, `EOTP`, or `You must be logged in` are common first-publish blockers.
   - If npm asks for a one-time password, collect it from the user and send only the OTP response to the prompt.
   - If npm reports no permission for `@pkistudio`, stop and ask the user to confirm npm organization membership or package creation rights.
   - Do not retry the same version after a successful publish; npm versions are immutable.

9. Confirm Final State
    - Verify the GitHub tag exists on the release commit.
    - Verify the GitHub Release is published.
    - Verify the WordPress release post workflow completed or any posting failure is clearly reported.
    - Verify wiki changes are pushed, intentionally deferred, or not applicable.
    - Verify `npm view @pkistudio/certgadgets@X.Y.Z version dist-tags dist.tarball --json` returns the expected version.
    - Verify a fresh temporary install can import the public entry points when practical.
    - Verify GitHub Pages deployment from any Pages workflow completed, failed, or is clearly reported as not configured.
    - Verify relevant GitHub Actions completed or are still running.

## Final Response Format

Keep the final response concise and include:

- Release link and tag
- WordPress release post status
- npm package/version status
- ADR status, if applicable
- Wiki publication status, if applicable
- Verification summary
- Pages and Actions status
- Any follow-up needed
