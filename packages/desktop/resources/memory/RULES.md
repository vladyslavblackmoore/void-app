# Memory rules

- Memory lives in ~/void/memory and is shared by all agents and all providers.
- MEMORY.md, tasks.md and RULES.md are already in your context each turn.
- Use absolute paths with your normal file tools: expand ~ to the real home directory.
- To save a fact, decision or preference, write one new file facts/<slug>.md with frontmatter `name`, `description`, `type` (user|project|decision|preference|reference) and the fact as the body. Then add one index line to MEMORY.md: `- [Title](facts/<slug>.md) — hook`.
- Update an existing fact instead of duplicating it.
- When an index line is relevant to the work, read the matching facts/ file.
- Keep tasks.md current: add new tasks under Open, move finished ones to Done.
- At the end of meaningful work, append one line to journal/<YYYY-MM-DD>.md.
- When the user says "запомни" or "remember", save the fact immediately.
