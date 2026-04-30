# Preset: React

## Version Detection
- Read `package.json` → `dependencies.react` to determine version
- Check for TypeScript (`typescript` in devDependencies)
- Check for React 18+ features (concurrent mode, Suspense)

## Framework Patterns to Verify
When reviewing React code, check:
- **Component Structure**: Are components properly decomposed? Single responsibility?
- **Hooks**: Are hooks used correctly? No conditional hooks, proper dependency arrays?
- **State Management**: Is state lifted appropriately? No unnecessary prop drilling?
- **Effects**: Are useEffect dependencies correct? Cleanup functions present?
- **Memoization**: Are useMemo/useCallback used where needed (not everywhere)?
- **TypeScript**: Are props properly typed? No `any` types?

## Common Pitfalls to Flag
- Missing dependency arrays in useEffect
- Stale closures in event handlers
- Missing key props in lists
- Direct state mutation
- Unnecessary re-renders (missing memo, inline objects/functions in JSX)
- Missing error boundaries
- Accessibility issues (missing alt text, aria labels)

## Documentation References
When flagging framework deviations, link to the relevant React docs:
- "See https://react.dev/learn/thinking-in-react"
- "See https://react.dev/reference/react/useEffect"
