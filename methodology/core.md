# Review Methodology

The core reasoning process for code review. These are project-agnostic steps that every review should follow, regardless of stack or conventions.

## 1. Understand the Mission

Before reading any code, understand what this change is trying to accomplish.

- Read the PR description, commit messages, and any provided context.
- If ticket tracking information is available, use it to understand acceptance criteria and the user story.
- Identify the product or feature area. Knowing the domain helps you evaluate whether the approach makes sense.
- If this is part of a larger effort, understand where this change fits.

The most valuable review feedback comes from understanding *what we are trying to do* and evaluating whether the code achieves it — not from scanning the diff for style issues.

## 2. Evaluate the Approach

Before checking conventions or code quality, evaluate the *strategy*:

- Does this solve the right problem? Sometimes code is well-written but solves the wrong thing, or a symptom instead of the root cause.
- Is this the right level of complexity? Could this be simpler? Is it over-engineered for what it needs to do? Or is it too simple — will it break under real conditions?
- Are there simpler approaches? You are not looking for one "correct" way. You are asking: among the reasonable options, is this a good one?
- Is this the right place for this code? Does it belong in this module, service, or layer? Or does it belong somewhere else architecturally?
- Does this introduce the right abstractions? Or does it couple things that should be separate?

If the approach itself has issues, flag that first. No amount of code quality fixes matter if the approach is wrong.

## 3. Assess Framework & Ecosystem Fit

How does this codebase solve this class of problem?

- Use filesystem tools to explore the project structure, existing patterns, and conventions.
- Use web search (if available) to check the relevant framework or library documentation.
- Is this using framework features the way they were designed?
- Is there a built-in feature that already does this? Developers often hand-roll solutions that the framework or standard library already provides.
- If the code deviates from common framework patterns, is there a good reason?
- Does it follow established ecosystem patterns? (Service classes for business logic, DTOs for data transfer, events for side effects, etc.)
- Are there common pitfalls for this stack? (N+1 queries, missing authorization, silent error swallowing, effect cleanup, etc.)

When you reference framework conventions, link to the relevant documentation so the developer can learn, not just comply.

## 4. Check Project Conventions

Evaluate against project-specific conventions if they are provided.

These are the team's deliberate choices. New deviations need justification.

<!-- Presets are spliced here by the harness when framework presets are configured -->

## 5. Security Review (Cross-Cutting)

Review for security issues at every layer, not just as an afterthought:

- Injection vulnerabilities (SQL, command, XSS, etc.)
- Authentication and authorization gaps
- Data exposure or leakage
- Input validation and sanitization
- Secrets or credentials in code
- Insecure dependencies or configurations

## 6. Code Quality (Last)

This is the detail pass. It should be the *last* thing you evaluate:

- Missing error handling
- Type safety and correctness
- Naming and clarity
- Test quality and coverage
- Logging and observability

**Skip automated style checks** if the project has linting configured. Use filesystem tools to check for common linter config files:
`.eslintrc`, `.prettierrc`, `pint.json`, `pyproject.toml` (with ruff/black), `biome.json`, `phpstan.neon`, etc.
Only flag style issues if you do not see evidence of automated formatting or linting.

**Depth calibration:** Do not treat every review the same. Match your depth to the scope:
- A 2-file bugfix: focus on correctness and safety. Brief approval if clean.
- A 30-file feature: evaluate architecture, conventions, and test coverage deeply.
- A dependency update: if tests pass, approve without detailed review.
