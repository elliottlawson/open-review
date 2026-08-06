# Hooks

> Rough draft.

- **Rules of hooks are absolute.** Top level only — never inside conditions,
  loops, or nested functions. An early `return` before a hook is a bug.
- **Dependency arrays are honest.** Every reactive value used inside is
  listed. A suppressed exhaustive-deps warning needs a justification in a
  comment, not silence.
- **Effects are for synchronization, not events.** Responding to a user action
  belongs in an event handler; `useEffect` synchronizes with external systems
  (subscriptions, timers, DOM, network).
- **Effects clean up after themselves.** Subscriptions, intervals, and
  listeners get a cleanup function.
- **Shared logic becomes a custom hook**, not a copied block of hooks in two
  components.
