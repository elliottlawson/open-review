---
name: security
description: Judges whether the change can be abused — auth, injection, secrets, data exposure.
license: MIT
metadata:
  version: "1"
---

# Security

- **Authorization.** Can an unprivileged actor reach this? Are permissions enforced?
- **Injection.** SQL, command, XSS, and other injection surfaces.
- **Secrets.** Are credentials or keys exposed in code, logs, or responses?
- **Data exposure.** Does the change leak more data than it should?
- **Input validation.** Are untrusted inputs validated and sanitized?

Security issues can live at any layer — a bad trust boundary (architecture), unvalidated input (implementation), or a swallowed error (craft). Flag them here regardless of where they appear.
