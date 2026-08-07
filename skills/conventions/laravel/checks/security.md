# Security

Apply this check to the whole change, not one topic. It answers one
question: **can this change be abused?**

For topic-specific security rules, read the pattern that owns the code
you're judging — a controller's authorization lives in `routing`, a
query's injection risk in `eloquent`, uploaded files' validation in
`validation`. This check covers what cuts across all of them.

## Boundaries and trust

- Fix trust at the boundary. Validate, sanitize, and authorize once at
  the entry point (form request, policy, middleware) — then trust the
  data inward. Do not stack defensive re-checks through the call stack;
  that's how security rules go stale.
- Never trust input that arrives without a documented boundary: request
  bodies, query strings, webhook payloads, decoded import rows. Treat
  each as untrusted until a form request, validator, or explicit cast
  has shaped it.

## Input safety

- Every mutation reads from validated data. If a handler uses raw input
  where a validated value should be, the boundary was skipped — flag it.
- File uploads: validate type and size (`image`, `max:2048`, `mimes`),
  store behind the public/filesystem boundary, and serve via the storage
  abstraction, never `public_path()` on user input.

## Injection and SQL

- Queries build on bound parameters, never string interpolation of user
  input. Raw SQL is allowed only with `whereRaw(..., [bound])` — flag
  any interpolated `$request`/`$user` value inside a SQL string.
- Redirect targets and `href`s built from input are open-redirect risks.
  Validate the domain or use a known-allowlist route.

## Secrets and exposure

- No secrets in committed code, migrations, or seeders — read from
  `config/` and `.env`. A committed key, token, or credential is
  critical, regardless of scope.
- Responses don't leak internals: no stack traces, no raw exception
  messages, no columns (tokens, hashes, emails) the consumer shouldn't
  see. Check every new payload, not just the authenticated endpoints.

## Authorization

- Every mutating action is authorized against the resource it touches —
  through a policy, not an inline `if`. Flag an unguarded mutation or a
  controller that gates access by comparing IDs by hand.
- Watch IDOR: a handler that loads `$id` from the request and operates
  without scoping to the authenticated user or checking the policy leaks
  other users' records. Scope queries to the owner (`->where('user_id', auth()->id())`)
  or authorize against the fetched model.

## Session and mass assignment

- Mass assignment is a vulnerability only when a model is explicitly
  unguarded — `$guarded = []`, `Model::unguard()`, or a fillable list that
  includes fields a caller can't be trusted with. Modern Laravel (11+)
  defaults to `$guarded = ['*']`, so *absent* `$fillable` is a functional
  break, not a security hole: flag it as a bug, not as mass assignment.
- Mass-assigning untrusted request input through `create()`/`fill()`
  needs an explicit boundary — an explicit `$fillable` or a validated
  shape from a form request. Flag request input feeding a fillable list
  that includes fields the caller must not control (e.g. `user_id`,
  `role`).
- CSRF applies to state-changing web requests; ensure the middleware
  protects them. Logout and session-invalidating flows rotate the
  session identifier.

## Check with the patterns

When a finding touches code a pattern owns, cite the pattern's rule and
point at it. The patterns are the standard for that topic; this check
provides the change-wide lens.

## Verify

Before flagging a security rule on a specific API, confirm the mechanism
against `search-docs` (if Boost is installed) or the installed
framework's source. Do not flag on a remembered signature.
