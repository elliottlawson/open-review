# Contributing Presets

How to write and contribute presets for Open Review.

## What is a Preset?

A preset is a framework-specific review guide that adds awareness at step 3 of the methodology (Assess Framework & Ecosystem Fit). Presets tell the agent:

- What patterns to verify
- What pitfalls to flag
- What documentation to reference

## Preset Format

Presets are markdown files with a specific structure:

```markdown
# Preset: Framework Name

## Version Detection
How to detect the framework version from project files.

## Framework Patterns to Verify
When reviewing [Framework] code, check:
- Pattern 1
- Pattern 2

## Common Pitfalls to Flag
- Pitfall 1
- Pitfall 2

## Documentation References
When flagging framework deviations, link to the relevant docs:
- "See https://docs.framework.com/..."
```

## Writing a Good Preset

### Be Specific

Don't just list features. Tell the agent exactly what to look for:

```markdown
# Bad
- Check for proper error handling

# Good
- All API endpoints must have try/catch blocks with specific error types
- Database queries must handle connection failures gracefully
```

### Reference Documentation

Link to official documentation so developers can learn:

```markdown
- "See https://laravel.com/docs/validation#form-request-validation"
```

### Focus on Common Mistakes

Presets should catch the most common issues for that framework:

```markdown
## Common Pitfalls to Flag
- N+1 queries (missing `with()` eager loading)
- Missing authorization checks
- Inline validation instead of FormRequest
```

## Adding a New Preset

1. Create `presets/your-framework.md`
2. Follow the format above
3. Add detection rules in `src/core/framework-detector.ts`
4. Test with `open-review init` to verify detection

## Preset Location

Presets live in two places:

- **Built-in**: `presets/` in the open-review repo (bundled with npm package)
- **Local**: `.open-review/presets/` in user's repo (copied by `init`)

Local presets override built-in presets with the same name.

## Detection Rules

Framework detection is defined in `src/core/framework-detector.ts`:

```typescript
{
  name: 'Framework Name',
  preset: 'framework-name',
  detect: (dir) => {
    return existsSync(join(dir, 'config-file.json'));
  },
}
```

Detection can check for:
- Config files (`package.json`, `composer.json`, etc.)
- Dependencies in package files
- Directory structure (`artisan`, `next.config.js`, etc.)
