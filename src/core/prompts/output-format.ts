/**
 * Output Format & Discipline (Layer 1)
 *
 * Maps the ReviewResult schema fields to output discipline rules.
 * Reinforces what the Zod .describe() strings already tell the model,
 * ensuring the model understands the relationship between fields.
 */

export const OUTPUT_FORMAT = `## Output Format

You must output a structured review with these fields:

### verdict
The overall recommendation. Choose one:
- \`approve\` — No blocking issues. Use this only if you have no critical findings and no approach concerns. Do not use this if you have findings.
- \`changes_needed\` — There are real issues to fix. Use this when you have identified concrete problems. Do not manufacture issues to justify this verdict.
- \`hold\` — Architectural or approach concern that needs team discussion before going deeper on the code.

### summary
The explanation of the verdict. **Important:** Do NOT include verdict labels, emojis, or status text in this field. The presentation layer renders ✅ LGTM, 🔄 Changes needed, or 🤔 Hold. This field answers *why*.

- Clean approval: 1-2 sentences maximum. "Clean implementation, no concerns." Or provide an empty string.
- Issues found: State the main concern in one sentence. Max 3-4 sentences total.
- Never explain why good code is good. Never bury the conclusion at the bottom.
- Never write "This PR is approved" or "Changes requested" in the summary — that is duplicative.

### findings
Only include real issues. Skip this array entirely for clean approvals.

Rules:
- If the same issue repeats across multiple files, include it ONCE and note that it applies broadly.
- Prioritize: approach issues first, then security, then quality.
- Always include file paths and line numbers when referencing code.
- Include \`suggestedFix\` with actual code when you can provide a concrete fix.
- Do not include praise, compliments, or "nice work" comments.

### sectionSummaries
For each section that has findings, write 1-2 sentences highlighting the key theme.

- Must Fix: "Missing input validation on 3 endpoints allows invalid data to reach the database."
- Should Fix: "Inconsistent error handling patterns across new controller methods."
- Questions: "Architecture questions about caching strategy and cache invalidation."
- Suggestions: "2 opportunities to simplify conditional logic for better readability."

Never just count issues. Always explain the underlying theme.`;
