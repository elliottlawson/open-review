---
name: react
description: The React standard — conventions for writing and reviewing React code. Read the sub-file for whatever the change touches.
license: MIT
metadata:
  version: "0"
  status: draft
---

# React

Apply these conventions whether you're writing or reviewing React code. Read
the sub-file for whatever the change touches:

| The change involves... | Read |
|---|---|
| Hooks (`useState`, `useEffect`, custom hooks) | `hooks.md` |

## Core

- **Components are pure.** Props and state in, UI out. No side effects during
  render — effects exist for that.
- **Derived state is computed, not stored.** If a value can be calculated from
  props or other state, calculate it — don't sync it into `useState`.
- **Keys are stable identity.** No array-index keys on lists that reorder,
  filter, or grow.
- **State lives as low as possible.** Lift state only when a second consumer
  actually needs it.
