---
name: infer-conventions
description: Finds where a project keeps its standards and what its stack is.
license: MIT
metadata:
  version: "1"
---

# Infer conventions

Answer two questions: where does this project keep its standards, and what's its stack? Map, don't judge.

First, check for a `REVIEW.md` at the repo root. If it exists, it's authoritative — read it, then read the docs it points to.

If there's no `REVIEW.md`, discover:

- **Agent instructions.** Read the repo's `AGENTS.md` (or `CLAUDE.md`) at the root; honor anything they state about conventions, and follow their pointers to the docs that matter.
- **Documentation.** Look for a `knowledge/` or `docs/` directory. If there's a `knowledge/table-of-contents.md` or `docs/README.md`, read it — it's the index. Otherwise list the directory and read anything that looks like standards.
- **Conventions.** Find the project's stated standards — `knowledge/technical/conventions.md`, `CONTRIBUTING.md`, `.cursor/rules/`, or similar.
- **Architecture.** Any architecture or design docs.
- **Stack.** Identify the frameworks from `composer.json` / `package.json` / `Cargo.toml`. Name them plainly (e.g. Laravel, React, Inertia).

Missing files are fine — skip them silently. Report what you found and where. If the project has no documented standards, say so plainly — never invent any.
