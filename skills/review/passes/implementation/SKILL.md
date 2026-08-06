---
name: implementation
description: Judges whether the code is written correctly for this project — framework usage, conventions, tests, and dependencies.
license: MIT
metadata:
  version: "1"
---

# Implementation

The architecture pass judged the shape; this pass judges the code inside it. Is the work written correctly for this project, and is it proven?

- **Framework usage.** Is this using the framework the way it's designed, or hand-rolled? Before flagging a hand-rolled implementation, check the framework's docs for a built-in that already does it, and cite the docs in the finding. If the framework doesn't ship one, don't invent the finding.
- **Conventions.** Does the code follow this project's documented conventions? These are deliberate choices; deviations need justification.
- **Tests.** Is the change tested? Do the assertions prove something real — happy path, failure paths, edge cases — or just exercise the code?
- **Dependencies.** Are new or upgraded dependencies justified? Is the added surface area worth it?

If the code violates the framework or the project's rules, that's a finding here. Shape and placement issues belong to architecture; naming and readability belong to craft.

## Not in scope

- Approach, placement, data model — the architecture pass
- Naming, clarity, readability — the craft pass
