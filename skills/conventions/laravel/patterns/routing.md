# Routing — the request lifecycle

Apply this pattern when the change touches how a request is received and
handled: routes, controllers, form requests, policies, actions, or the
wiring between them.

## The lifecycle

A request flows through a fixed chain. Each stage has one job; keep each
stage thin and route the work to the next:

```
route → controller → form request → policy → action → model → response
```

| Stage | Owns | Lives in |
|---|---|---|
| Route | Which URL + verb maps to which controller method | `routes/` |
| Controller | Receiving the request, returning a response | `app/Http/Controllers/` |
| Form request | Validating the input, authorizing the call | `app/Http/Requests/` |
| Policy | Authorizing the action against the model | `app/Policies/` |
| Action | The business logic | `app/Actions/` |
| Model | Queries and the record | `app/Models/` |

When you find yourself doing the next stage's job at an earlier stage,
move it down the chain.

## Routes

- Define routes in `routes/` (`web.php`, `api.php`), never in a
  controller, model, or action.
- Prefer `Route::resource()` (or `Route::apiResource()` for JSON-only)
  for a standard REST surface over hand-writing each verb.
- Give every route a **name** — `->name('posts.update')` — and reference
  it with `route('posts.update', ...)` in code, never a hardcoded URL
  path. `route()` is the only URL you should generate.
- Use **route model binding** — `public function show(Post $post)` — not
  an `$id` you then look up yourself.
- Keep `routes/` files declarative: one line per route, no closures, no
  business logic, no queries. A closure is a controller you refused to
  write; extract it.
- Group routes by middleware that genuinely applies to the whole group;
  do not wrap every route in middleware it doesn't need.

## Controllers

- A controller **receives a request and returns a response**. Everything
  between those belongs elsewhere: validation to the form request,
  authorization to the policy, logic to the action, data to the model.
- One public method per concern. If a method needs a third parameter
  that isn't the request, or branching on "what kind of" request this
  is, the concern has split — extract an action or a second controller.
- Inject what you need and let the container do the work — type-hint the
  form request and the action in the signature, don't `resolve()` or
  `app()` them inside the method.
- Return the Laravel shape for the channel: a `RedirectResponse` for
  web (`redirect()->route('posts.index')`), a JSON/`Response` for APIs.
- Call the action once, then return. Do not re-run queries, re-fetch
  models, or reach into the request after the action has run.

## Form requests

- **Every controller method that accepts input uses a dedicated form
  request.** No inline `$request->validate()` in controllers.
- One form request per verb per resource: `StorePostRequest`,
  `UpdatePostRequest` — not one "PostRequest" doing double duty with
  conditionals.
- Validation is a contract: name the rules, and trust the result inside
  the controller. Do not re-guard validated keys with `?? null`,
  `filled()`, or `data_get()` in the controller — the request has
  already shaped them.
- Put cross-field or custom-rule logic in `withValidator()` only when
  `rules()` genuinely cannot express it.
- `authorize()` belongs in the request when it has no model to check
  against; prefer the policy when the check is against a model (see
  below).

## Policies

- Authorize every mutating action against the model it touches. A
  controller that checks `$user->can(...)` inline, or reaches into the
  request's user without a policy, is doing authorization by hand.
- Name methods after the controller verb (`view`, `create`, `store`,
  `update`, `delete`). Reference the policy's methods with
  `$this->authorize('update', $post)` in the controller, or
  `authorize()` in the form request when it owns the model.
- Keep authorization out of the model and the action: the policy is the
  one place that answers "may this user do this thing to this thing?"

## Actions

- Extract the business logic into an action — a single-responsibility
  class with one public method (often `__invoke`), named for the verb:
  `CreatePost`, `PublishPost`, `ArchivePost`.
- The controller calls the action; the action does the work; the action
  may not touch the request or response. Pass primitives and models in,
  get a result (a model, a bool, a value) back.
- Do not extract actions for the sake of file count — extract when the
  logic is more than "find, assign, save," when it's reused, or when
  keeping it in the controller would make the controller do two jobs.
- An action that can be expressed as a model query alone (a scope, a
  `where`, a `with`) belongs on the model, not in an action.

## Models

- Keep business logic out of models. Models own queries (scopes,
  relationships, casts); actions own behavior.
- Fetch what you need up front: eager load relationships the response
  will use (`with('comments.author')`), and check N+1 before you render.
- Reference model classes as `Post::class`, never the string
  `'App\Models\Post'` — string class names break refactoring and are
  the single most common wiring mistake.

## Common wiring failures

| Instead of | Use |
|---|---|
| `'App\Models\Post'` / `Post::find($id)` | `Post::class` + route model binding |
| `$request->validate([...])` inline in a controller | a dedicated form request |
| `$user->can('update', $post)` inline in a controller | a policy + `$this->authorize('update', $post)` |
| a route closure with logic | a controller method |
| a controller that queries and computes | an action |

## Verify

Before finalizing a rule that names a specific API, check it against
`search-docs` (if Boost is installed) or
`https://raw.githubusercontent.com/laravel/docs/{installed-version}/routing.md`.
Do not rely on memory for exact signatures.
