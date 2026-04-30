# Preset: Next.js

## Version Detection
- Read `package.json` → `dependencies.next` to determine version
- Check for App Router (`app/` directory) vs Pages Router (`pages/` directory)
- Check for TypeScript (`typescript` in devDependencies)

## Framework Patterns to Verify
When reviewing Next.js code, check:
- **App Router**: Are Server Components used by default? Client Components only when needed?
- **Data Fetching**: Are fetch calls properly cached? Server actions used for mutations?
- **Routing**: Are route groups, parallel routes, and intercepting routes used appropriately?
- **Metadata**: Is metadata exported from layout/page files?
- **Loading/Error States**: Are loading.tsx and error.tsx files present?
- **Middleware**: Is middleware used for auth/redirects?

## Common Pitfalls to Flag
- Using 'use client' unnecessarily
- Fetching data in client components when server components would work
- Missing loading and error states
- Incorrect caching strategies
- Using `router.push` in server components
- Missing Suspense boundaries
- Not using Next.js Image component for optimization

## Documentation References
When flagging framework deviations, link to the relevant Next.js docs:
- "See https://nextjs.org/docs/app/building-your-application"
- "See https://nextjs.org/docs/app/building-your-application/data-fetching"
