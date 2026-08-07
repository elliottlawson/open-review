---
name: load-conventions
description: Loads the conventions packs for a project's stack — the framework standards to write or review against, on demand.
license: MIT
metadata:
  version: "1"
---

# Load conventions

Use the conventions pack for each framework in the project's stack — packs are named for their framework (`/laravel`, `/react`, `/inertia`). Each pack's index routes to sub-files by what the change touches — read only those. Load only packs whose domain the change touches.

Precedence: the project's documented conventions override packs; packs override general merits. Where the project documents a topic, the pack stays out of it.
