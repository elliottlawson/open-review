---
name: laravel
description: The Laravel standard — conventions for writing and reviewing Laravel code. Pattern files teach how to do a task; check files judge a change.
license: MIT
metadata:
  version: "1"
  status: draft
---

# Laravel

Apply these conventions when writing or reviewing Laravel code.

## Core

- **Thin controllers.** A controller receives a request and returns a
  response. Everything between belongs elsewhere — actions, form
  requests, models.
- **Framework-native over hand-rolled.** If Laravel ships it (validation,
  authorization, collections, queues, caching), use it before building it.
- **Convention over configuration.** Default locations and naming (`app/`,
  resource controllers, route model binding) unless the project documents
  otherwise.
- **Verify named APIs.** When a rule names an API you're unsure of, check
  `search-docs` if Boost is installed, or fetch the installed version's
  docs at `https://raw.githubusercontent.com/laravel/docs/{installed-version}/{topic}.md`.
  Don't rely on memory for exact signatures.

## What are you doing? (patterns)

Read the pattern for whatever the change touches:

| The change involves... | Read |
|---|---|
| Routes, controllers, form requests, policies, actions — how a request flows | `patterns/routing.md` |
| Models, queries, scopes, migrations, eager loading / N+1 | `patterns/routing.md` → **Models** |

## What are you judging? (checks)

Run the check for the pass you're on:

| Pass | Read |
|---|---|
| security | `checks/security.md` |

Patterns carry their topic's quality rules; checks carry the change-wide
verdict and point back at patterns.

## Precedence

The project's own documented conventions (REVIEW.md / AGENTS.md / docs)
override this standard. Where the project speaks, follow the project.
