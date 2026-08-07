---
name: infer-conventions
description: Finds where a project keeps its standards and what its stack is.
license: MIT
metadata:
  version: "1"
---

# Infer conventions

Answer two questions: where does this project keep its standards, and what's its stack? Map, don't judge.

Check for a `REVIEW.md` at the repo root first — if it exists, it's authoritative: read it, then the docs it points to.

Otherwise discover:

- **Agent instructions** — `AGENTS.md` / `CLAUDE.md`; honor what they state about conventions and follow their pointers.
- **Documentation** — where the project keeps its docs, and their index.
- **Conventions** — the project's stated standards.
- **Architecture** — design and decision docs.
- **Stack** — the frameworks, from the project's manifests. Name them plainly (e.g. Laravel, React, Inertia).

Report what you found and where. If the project has no documented standards, say so — never invent any.
