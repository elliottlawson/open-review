# Form Requests

> Rough draft.

- **Validation lives in Form Requests**, not inline in controllers. Inline
  `$request->validate([...])` beyond two or three rules wants a Form Request.
- **Authorization lives in `authorize()`** on the request (or a policy it
  calls) — not as an afterthought inside the controller body.
- **Consume validated data only.** After validation, use `$request->validated()`
  — reading raw `$request->input()` downstream defeats the point.
- **Custom messages and attributes** belong on the request (`messages()`,
  `attributes()`), keeping user-facing text out of controllers.
