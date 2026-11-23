# Memory rules

- Memory lives in ~/void/memory and is shared by all agents and all providers.
- Each turn your context holds MEMORY.md and RULES.md (long files are cut with a "truncated" marker: read the whole file with your file tools) and, for the manager only, tasks.md (the Open section and the 5 newest Done items).
- Child sessions (delegate or task tool) read memory but never write tasks.md or the journal; the manager records what a child found.
- Use absolute paths with your normal file tools: expand ~ to the real home directory.
- To save a fact, decision or preference, write one new file facts/<slug>.md with frontmatter `name`, `description`, `type` (user|project|decision|preference|reference) and the fact as the body. Then add one index line to MEMORY.md: `- [Title](facts/<slug>.md) — hook`.
- Update an existing fact instead of duplicating it.
- When an index line is relevant to the work, read the matching facts/ file.
- Only the manager keeps tasks.md current: add each new task under Open as `- [<session id>] <task>` and move finished ones to the top of Done (newest first; only the newest 50 are kept). When the owner stops a session, its Open entries are moved to Done marked "(stopped)" automatically.
- Only the manager, at the end of meaningful work, appends one line to journal/<YYYY-MM-DD>.md.
- When the user says "запомни" or "remember", save the fact immediately.
