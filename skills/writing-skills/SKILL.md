---
name: writing-skills
description: The rules for writing skills — apply when creating or editing any SKILL.md.
license: MIT
metadata:
  version: "1"
---

# Writing skills

Write skills as instructions, not documentation about instructions. Apply these rules to every line.

1. **Body starts with the do.** No heading restating the name, no "this skill is…", no orientation paragraph. The first sentence is an instruction.
2. **Every sentence is an imperative or a rule.** If a sentence explains what something *is* instead of what to *do*, fold it into the instruction or cut it. State occasions with "when", not "whether" — instructions don't hedge conditions.
3. **Skills are verbs.** The description is the trigger; the body is the work. State shared mechanics once, in the skill users install (`review` here); everywhere else, reference other skills by bare slash.
4. **One line per instruction.** If a sentence needs an em-dash caveat to stand, it's probably two instructions or none.
5. **Name the target, trust the intelligence.** "Find the project's docs and standards," not a checklist of exact filenames.
6. **Plain English only.** The agent reads the skill cold, without your session context. No coined terms — say "the framework's conventions," not "the pack"; say what happens, not "rides along".
7. **State the IO.** What the skill takes in, what it produces, and what done looks like — however small the skill.
8. **Process skills are short.** Reference earns length only as rules.
9. **Delegate, don't restate.** When one skill calls another, reference it and stop — never re-enumerate the callee's steps, counts, or internals. Every restated detail couples the skills and becomes a lie when the callee changes. Bad: "follow it exactly: Step 0, all six passes in order, then the verdict." Good: "follow it exactly."
10. **Every sentence must change what the agent does.** Cut consequence, motivation, and reassurance. Two tests: could the agent mistake the sentence for a task? Does deleting it lose a capability? Bad: a done-when ending "every PR then gets a review posted as a comment" — it reads as a todo and controls nothing.
11. **State only what's always true.** Don't promote an example to a rule — a pairing, a framework, one instance standing for a category. If it's an example, mark it as one. Bad: Inertia's conventions naming React as the standing companion, when the pairing is Laravel plus any frontend.
12. **Setup skills are idempotent.** Define the absent, current, and stale behavior, and never silently rewrite what a previous run wrote. Make any text the skill injects evergreen — no counts, versions, or paths that move — so staleness is rare.

Done when every line of the skill survives all twelve.
