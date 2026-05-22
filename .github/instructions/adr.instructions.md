---
description: "Use when reviewing code against Architecture Decision Records or deciding whether to create ADRs for PkiStudio repositories."
name: "PkiStudio ADR Rules"
---

# PkiStudio ADR Rules

- Create an ADR only for a meaningfully architectural decision, a long-lived trade-off, or an explicit user request.
- Do not create ADRs for routine implementation details, dependency bumps, small refactors, copy changes, or release mechanics.
- Keep ADR work in the current repository unless the user explicitly asks for cross-repository coordination.
- Prefer `docs/adr/` unless the repository profile names another ADR location.
- When reviewing code, check whether proposed changes are consistent with existing ADRs under `docs/adr/` or the repository's configured ADR location.
- Pay special attention to changes involving external dependencies, database selection or schema strategy, authentication and authorization, API design, cryptographic algorithms or key management, deployment architecture, runtime infrastructure, and major framework or library choices.
- If a change appears to conflict with an existing ADR, point out the relevant ADR and explain the conflict.
- If a pull request introduces an important architectural decision without an ADR, suggest adding a new ADR under `docs/adr/` or the repository's configured ADR location.
- When suggesting an ADR, recommend using the existing ADR template at `docs/adr/0000-template.md` when available.
- Use a short, durable title that names the decision, not the implementation task.
- Include context, decision, consequences, alternatives considered, rollout or migration notes, and related issue or PR links when available.
- Mark status clearly, such as `Proposed`, `Accepted`, `Superseded`, or `Rejected`.
- If an ADR supersedes an older ADR, update both documents so the relationship is discoverable.
- Keep ADRs concise and factual. Record the decision and reasoning, not a full project history.
- Do not treat ADRs as implementation manuals. ADRs should explain why a decision was made, what alternatives were considered, and what consequences are expected.
- Prefer concise, actionable review comments.
