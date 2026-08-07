---
name: load-conventions
description: Loads the conventions packs for a project's stack — the framework standards to write or review against, on demand.
license: MIT
metadata:
  version: "1"
---

# Load conventions

Load the conventions pack for each framework in the project's stack — read it locally if installed, otherwise resolve it at runtime (`npx skills use elliottlawson/open-review@<name>`, or fetch the pack's `SKILL.md` from GitHub). Packs are named for their framework (`laravel`, `react`, `inertia`); each pack's index routes to sub-files by what the change touches — read only those. Load only packs whose domain the change touches.

Precedence: the project's documented conventions override packs; packs override general merits. Where the project documents a topic, the pack stays out of it.
