# Actions

> Rough draft.

- **Business logic lives in Action classes** — single-purpose, invokable
  (`app/Actions/...`). One action does one thing; compose actions rather than
  grow them.
- **Controllers delegate.** A controller method should read as: authorize,
  validate, call an action, return a response. If it does more, that's the
  finding.
- **No logic in routes or Blade.** Closures in `routes/` and `@php` blocks are
  where maintainability goes to die.
- **Actions are testable units.** If an action can't be tested without HTTP,
  the seam is in the wrong place.
