# Preset: Laravel

## Version Detection
- Read `composer.json` → `require.laravel/framework` to determine version
- Consult https://laravel.com/docs/{version}/ for authoritative guidance

## Framework Patterns to Verify
When reviewing Laravel code, check:
- **Eloquent ORM**: Are relationships, scopes, and accessors used appropriately?
- **Form Requests**: Is validation in dedicated Form Request classes, not inline?
- **Controllers**: Are resourceful methods used (index, store, show, update, destroy)? Custom actions in invokable controllers?
- **Middleware**: Is auth and tenant scoping handled via middleware?
- **Events/Listeners**: Are side effects dispatched through events?

## Common Pitfalls to Flag
- N+1 queries (missing `with()` eager loading)
- Missing authorization checks (policies, gates)
- Raw SQL bypassing Eloquent scopes
- Inline validation instead of FormRequest
- Not using framework helpers (`collect()`, `str()`, `throw_if()`)

## Documentation References
When flagging framework deviations, link to the relevant Laravel docs:
- "See https://laravel.com/docs/{version}/validation#form-request-validation"
- "See https://laravel.com/docs/{version}/eloquent-relationships#eager-loading"
