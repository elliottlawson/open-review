# Eloquent

> Rough draft.

- **Eager load.** Relationships loaded in a loop are an N+1 — use `with()`,
  and constrain the eager load when you only need some columns or a filtered set.
- **No queries in controllers or Blade.** Queries live in actions, query
  classes, scopes, or the model itself.
- **Mass assignment is deliberate.** `$fillable` (or `$guarded`) reflects what
  a request may legitimately set — never `Model::create($request->all())`.
- **Scopes for reusable constraints.** A `where` clause repeated in two places
  wants to be a scope.
- **Fetch what you need.** `select()` columns and `cursor()`/`chunk()` for
  large sets; don't hydrate thousands of models to count them.
- **Migrations are reversible and additive where possible.** Renames and drops
  on live tables need a stated deployment story.
