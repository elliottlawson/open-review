---
name: craft
description: Judges whether the code is done well — naming, clarity, and readability.
license: MIT
metadata:
  version: "1"
---

# Craft

The implementation pass judged whether the code follows the rules; this pass judges whether it's pleasant to read.

- **Naming.** Do names say what the thing is?
- **Clarity.** Is the flow easy to follow without a map?
- **Size.** Is each piece doing one thing, or doing too much?
- **Duplication.** Is the same logic repeated where it could be shared?
- **Error handling.** Are errors surfaced cleanly, or swallowed?

Skip what tooling already enforces: if the project has linting or formatting configured (`.eslintrc`, `biome.json`, `.prettierrc`, `pint.json`, `phpstan.neon`, `pyproject.toml` with ruff/black), don't flag the style issues it covers.

Nothing architectural, nothing rule-breaking — just whether the next person will understand this easily.

## Not in scope

- Framework usage and conventions — the implementation pass
- Shape and placement — the architecture pass
