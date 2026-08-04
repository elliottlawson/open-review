---
name: architecture
description: Judges the high-level shape of the solution — the architectural pattern, structure, placement, and data model.
license: MIT
metadata:
  version: "1"
---

# Architecture

Judge the solution at the system level, not the code level.

- **Architectural pattern.** What pattern is the work built on — and is it the right one for this problem?
- **Decomposition.** How is the work split into pieces? Are the pieces in the right modules, layers, or services?
- **Dependency direction.** Do the pieces depend on each other the right way, or is something coupled that should be separate?
- **Data model.** Is the schema and migration shape right? How does state flow through the change?
- **Right-sized.** Over-built for what it needs, or too thin to hold up?

A decision that would ripple across the codebase is architecture. Localized details — how the framework is used, conventions, tests, naming — are judged by the implementation and craft passes, not here.

If the shape is wrong, say so first. Nothing else matters until the shape is right.
