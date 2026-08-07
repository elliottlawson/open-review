---
name: laravel
description: The Laravel standard — conventions for writing and reviewing Laravel code. Read the sub-file for whatever the change touches.
license: MIT
metadata:
  version: "0"
  status: draft
---

# Laravel

Apply these conventions when you're writing or reviewing Laravel code. Read
the sub-file for whatever the change touches:

| The change involves... | Read |
|---|---|
| Models, relationships, queries, migrations | `eloquent.md` |
| Validating or authorizing incoming requests | `form-requests.md` |
| Business logic, controllers, where logic lives | `actions.md` |
| `Inertia::render`, page props, shared data | the `inertia` conventions |

## Core

- **Thin controllers.** A controller receives a request and returns a response.
  Everything between belongs elsewhere — actions, form requests, models.
- **Framework-native over hand-rolled.** If Laravel ships it (validation,
  authorization, collections, queues, caching), use it before building it.
- **Convention over configuration.** Default locations and naming (`app/`,
  resource controllers, route model binding) unless the project documents
  otherwise.
