---
name: inertia
description: The Inertia standard — conventions for writing and reviewing Inertia.js code, the bridge between Laravel backends and React/Vue frontends.
license: MIT
metadata:
  version: "0"
  status: draft
---

# Inertia

> Rough draft — the seed of the Inertia standard. Evolves via dogfooding and evals.

The bridge: Laravel serves, the frontend renders. Apply alongside the `laravel`
and `react` packs.

## Server side

- **Controllers return `Inertia::render()`**, not views or raw JSON for page
  responses.
- **Props are lazy.** Wrap expensive values in closures so they resolve only
  when the page actually needs them — otherwise every partial reload pays for
  every query.
- **Shared data lives in middleware** (`HandleInertiaRequests::share()`), not
  repeated per controller.
- **Only what the page needs.** Passing entire models or unbounded collections
  as props ships the database to the browser — shape props deliberately.

## Client side

- **Forms use `useForm` (or `<Form>`)** — not hand-rolled fetch/axios against
  the same endpoints. Validation errors come back through the form helper.
- **Page components are thin.** Data arrives as props; a page component that
  fetches its own data on mount is working against the pattern.
- **Partial reloads** (`router.reload({ only: [...] })`) instead of full visits
  when only part of the page's data changed.
