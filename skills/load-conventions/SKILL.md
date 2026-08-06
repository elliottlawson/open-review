---
name: load-conventions
description: Loads the conventions packs for a project's stack — the framework standards to write or review against, on demand.
license: MIT
metadata:
  version: "1"
---

# Load conventions

Given the project's stack and what the change touches, load the matching conventions packs (e.g. `laravel`, `react`, `inertia`).

For each framework in the stack: if the pack is installed locally, read it; otherwise resolve it at runtime (`npx skills use elliottlawson/open-review@<name>`, or fetch the pack's `SKILL.md` from GitHub). A pack is that framework's standard — its index routes you to sub-files based on what the change touches; read only those.

Load on demand. If nothing in scope touches a framework's domain — a workflow-only diff, a docs-only change — don't load its pack at all.

Precedence: the project's documented conventions override packs; packs override general merits. Where the project documents a topic, the pack stays out of it.
