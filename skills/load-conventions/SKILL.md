---
name: load-conventions
description: Loads the conventions for a project's frameworks — the standards to write or review against, on demand.
license: MIT
metadata:
  version: "1"
---

# Load conventions

The open-review repo keeps coding conventions per framework, grouped by framework in `skills/conventions/` — `/laravel`, `/react`, `/inertia`. Load the ones for the frameworks you're working on; if the change doesn't touch a framework, skip it. Each one starts with an index that points at detailed files by topic — read only the topics the change touches.

If the project documents its own conventions for a topic, follow those. Where it doesn't, these are the standard.
