@AGENTS.md

Build conventions: `docs/CONVENTIONS.md` · Requirements: `docs/requisitos.md`

## Ultracode / multi-agent use

When ultracode is on, the goal is still the best outcome — but be considerate: size the effort to what the task actually needs instead of defaulting to the biggest workflow.

- Trivial or mechanical work (one file, a config tweak, a quick lookup) is done directly — no workflow, no subagents.
- There is no fixed agent limit. Use as many agents as the work genuinely benefits from (broad audits, adversarial verification, large cross-cutting changes) — every agent should earn its place.
- Run competing candidate panels or extra verification rounds when they materially improve the result, not by reflex.
- Pick the model per stage: the default model for design-heavy, core or judgment work; Sonnet (or lower effort) for well-specified, mechanical pieces and routine verification.
- Say up front how many agents a workflow will run and on which models, and why that size.
