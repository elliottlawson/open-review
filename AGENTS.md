# Agent Guide: Open Review

Open Review is a **composable, skill-based code review system**. The product is the
skill stack in `skills/` — agents (opencode, Claude Code, etc.) read and follow the
skills directly.

## Source of Truth

| Path | Purpose |
|---|---|
| `skills/review/SKILL.md` | **Source of truth** for the review process — Step 0 (reference material), pass order, verdict weighing, output discipline |
| `skills/review/passes/<name>/SKILL.md` | The six passes: mission, architecture, implementation, craft, security, performance. Each answers one question and nothing else |
| `skills/infer-conventions/SKILL.md` | Maps where a project keeps its standards and what its stack is — review's Step 0 and document-conventions' discovery |
| `skills/load-conventions/SKILL.md` | Loads the stack's conventions packs on demand — called from passes, and usable when writing code |
| `skills/review-as-json/SKILL.md` | The JSON output contract CI consumes (`verdict`, `findings`, `sectionSummaries`, …) |
| `skills/document-conventions/SKILL.md` | Writes a project's `REVIEW.md` — the natural-language table of contents mapping passes to project docs |
| `skills/setup-ci/SKILL.md` + `workflow-template.yml` | Writes the GitHub Actions workflow |
| `skills/setup-review-loop/SKILL.md` | Wires the review loop into a project's agent instructions (review before every PR) |
| `skills/conventions/<stack>/` | Framework convention packs (laravel, react, inertia). Dual-use standards: for writing *and* reviewing code. Rough drafts |
| `docs/review-passes.md` | Local spec: the canonical definition of each pass (gitignored, not published) |

## The Model

- **Install one skill:** `npx skills add elliottlawson/open-review --skill review`.
- **Everything else resolves at runtime** via `npx skills use elliottlawson/open-review@<name>`
  or raw fetch — `document-conventions`, `setup-ci`, `review-as-json`,
  `infer-conventions`, `load-conventions`, and the conventions packs are
  never installed by end users. (CI installs `review` + `review-as-json`
  per run, which *is* runtime resolution.)
- **Conventions layer (precedence):** project conventions (`REVIEW.md` →
  auto-discovered `AGENTS.md`/docs) **override** framework packs
  (`skills/conventions/<stack>/`) **override** the passes' general merits.
- **Packs are collections:** an index `SKILL.md` routes to sub-files by what the
  change touches. Addressed by leaf name (`@laravel`), regardless of nesting.
- **No publishing step:** `npx skills` resolves straight from GitHub. skills.sh
  listing is optional discoverability (lab #11).

## Skill Style

Skills are instructions, not documentation about instructions. House rules:

1. **Body starts with the do.** No heading restating the name, no "this
   skill is…", no orientation paragraph. First sentence is an instruction.
2. **Every sentence is an imperative or a rule.** If it explains what
   something *is* instead of what to *do*, cut it.
3. **Skills are verbs.** "Use `/load-conventions` for the frameworks the
   change touches" — never "Run `/load-conventions`; read what it points
   to." The description is the trigger; the body is the work. State the
   runtime-resolution mechanics once, in `review`; everywhere else,
   reference by bare slash.
4. **One line per instruction.** If a sentence needs an em-dash caveat to
   stand, it's probably two instructions or none.
5. **Name the target, trust the intelligence.** "Find the project's docs
   and standards," not a checklist of exact filenames.
6. **Process skills are short.** Reference earns length only as rules.

## Downstream

- **open-review-action** — the CI engine. Installs opencode + the skills per run,
  executes `review-as-json` against the PR diff, formats and posts the comment.
  Workflow files reference `elliottlawson/open-review-action@v2`.

## Backlog

The cross-session backlog and eval harness live outside this repo (private).
The gitignored `plans/` directory is for session-local specs:

```
plans/
├── pending/     # Work waiting to be picked up
└── complete/    # Work that has been finished
```

## Change Workflow

1. Document the intended contract (a spec in `plans/pending/` or a lab issue)
   before modifying committed source
2. Edit the skills — the SKILL.md files are the product. Any command a skill
   asks an agent to run must be non-interactive (`-y`, explicit flags) — an
   interactive prompt hangs the run
3. Verify structure: `npx skills add . --list` discovers the expected set
4. If the JSON contract or skill names change, downstream (the action) must change
   in lockstep
5. Move the completed spec from `plans/pending/` to `plans/complete/`
