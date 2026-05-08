---
description: "Use when: running the certgadgets release workflow, including version bump, tag, GitHub Release, npm first publish, scoped public package access, GitHub Pages status, and Actions checks."
name: "certgadgets release workflow"
argument-hint: "[version|TBD] <short release summary>"
agent: "agent"
---

# certgadgets Release Workflow

Run the standard certgadgets release workflow from local release preparation through GitHub Release, npm publication, and post-publication verification.

Expected invocation examples:

```text
/release 0.1.0 "Initial Certificate Gadgets release"
/release v0.1.0 "Initial npm release"
/release TBD "Prepare certificate validation updates"
```

The release version may be omitted or set to `TBD` while development is still in progress. Do not tag, create a GitHub Release, or publish to npm until the final version is known and the user has explicitly approved the publication step.

## Default Operating Mode

Proceed proactively through checks, focused edits, and local verification. Keep progress updates brief, but pause for explicit confirmation before pushing tags, creating a public GitHub Release, or publishing to npm.

Ask only when:

- The requested version is missing and the workflow has reached a version-required step.
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
- Work in the current repository only.
- Check current branch, remote, tags, and working tree before making changes.
- Never discard uncommitted user changes.
- If unrelated local changes exist, stop and ask how to proceed.
- Preserve existing package metadata unless the release requires a focused change.
- Do not add `private: true` to prevent npm publication.
- Use non-interactive git commands where possible.

## Inputs

Derive these from the invocation when possible:

- `version`: release version, normalized to both `X.Y.Z` and `vX.Y.Z` forms.
- `summary`: short release summary.
- `releaseNotes`: user-facing changes and important package/API notes.
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
   - Check whether the requested tag already exists locally or remotely.
   - Check whether `@pkistudio/certgadgets@<version>` is already published on npm.
   - If npm returns `E404`, treat that as expected for the first package publication and continue with first-publish safeguards.

2. Prepare Version and Package Metadata
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

3. Verify Locally
   - Run:

     ```sh
     npm run check
     npm run build
     npm run pack:dry-run
     ```

   - Inspect the dry-run file list and package size for accidental omissions or unrelated files.
   - Use the existing VS Code task `Start certgadgets server` or run `npm run dev` when browser verification is needed.
   - Stop any verification server started for the release.

4. Commit and Push
   - Review the diff before committing.
   - Commit focused release-preparation changes.
   - Push the branch or `main` only after confirming the intended release path.

5. Tag and Create GitHub Release
   - Normalize the tag to `vX.Y.Z`.
   - Create an annotated tag on the release commit.
   - Push the tag only after Gate 3 approval.
   - Create a GitHub Release named `vX.Y.Z`, latest stable, not draft and not prerelease unless instructed otherwise.

6. Publish npm
   - Preferred first publish command from an authenticated npm owner account:

     ```sh
     npm publish --access public
     ```

   - If Trusted Publishing is configured later, verify the workflow filename, npm trusted publisher repository, and any environment name before rerunning.
   - For scoped packages, `E404`, `ENEEDAUTH`, `EOTP`, or `You must be logged in` are common first-publish blockers.
   - If npm asks for a one-time password, collect it from the user and send only the OTP response to the prompt.
   - If npm reports no permission for `@pkistudio`, stop and ask the user to confirm npm organization membership or package creation rights.
   - Do not retry the same version after a successful publish; npm versions are immutable.

7. Confirm Final State
   - Verify:
     - GitHub tag exists on the release commit.
     - GitHub Release is published.
     - `npm view @pkistudio/certgadgets@X.Y.Z version dist-tags dist.tarball --json` returns the expected version.
     - A fresh temporary install can import the public entry points when practical.
     - GitHub Pages deployment from any Pages workflow completed, failed, or is clearly reported as not configured.
     - Relevant GitHub Actions completed or are still running.

## Final Response Format

Keep the final response concise and include:

- Release link and tag
- npm package/version status
- Verification summary
- Pages and Actions status
- Any follow-up needed
