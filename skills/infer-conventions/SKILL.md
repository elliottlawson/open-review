---
name: infer-conventions
description: Finds where a project keeps its standards and what its stack is.
license: MIT
metadata:
  version: "1"
---

# Infer conventions

Locate the project's standards and stack, and read them into context.

If the repo root has a `REVIEW.md`, read it, then the docs it points to — it overrides anything found below.

Otherwise find:

- **Agent instructions** — `AGENTS.md` / `CLAUDE.md`; honor what they state about conventions and follow their pointers.
- **Documentation** — where the project keeps its docs, and their index.
- **Conventions** — the project's stated standards.
- **Architecture** — design and decision docs.
- **Stack** — the frameworks, from the project's manifests. Name them plainly (e.g. Laravel, React, Inertia).

Done when the project's standards and stack are in context.
