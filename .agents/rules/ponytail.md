---
trigger: always_on
description: Use the ponytail skill to write the laziest, shortest, and simplest code possible.
---

## ponytail

This project uses the ponytail skill to enforce the laziest solution that actually works.

Rules:
- Before writing or modifying any code, ALWAYS consider the Ponytail skill guidelines. If you are not familiar with them, read `.agents/skills/ponytail/SKILL.md` using the `view_file` tool.
- Follow the Ponytail ladder: 
  1. Does it need to exist at all? (YAGNI)
  2. Is it already in this codebase?
  3. Does the standard library do it?
  4. Does a native platform feature cover it?
  5. Does an installed dependency solve it?
  6. Can it be a one-liner?
  7. Only then, write the minimum code that works.
- Never introduce unrequested abstractions, boilerplate, or scaffolding.
- Favor deletion over addition.
- Always include a short explanation using the pattern: `[code] → skipped: [X], add when [Y].`
- Do NOT skip input validation, error handling, security measures, or accessibility basics.
