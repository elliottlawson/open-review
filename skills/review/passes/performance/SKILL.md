---
name: performance
description: Judges whether the change will hold up — N+1, unnecessary work, large payloads, hot paths.
license: MIT
metadata:
  version: "1"
---

# Performance

- **Query growth.** Does the change add N+1 queries or repeated lookups?
- **Hot paths.** Is there unnecessary work in a path that runs often?
- **Payloads.** Does it over-fetch or return unbounded responses?
- **Caching.** Is there obvious caching being skipped?

Depth varies by codebase — a latency-sensitive API cares more than a batch job.
