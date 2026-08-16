# Checkpoint — initial Apple Pro Video MCP — 2026-08-16

## The story so far

An MCP TypeScript SDK v2 stdio server exposes seven tools for capability discovery, FCPXML validation/inspection/project generation, opening FCPXML in Final Cut Pro, and read-only Motion template discovery/inspection. Core XML/FCPXML/Motion tests and the dependency-backed MCP protocol test are covered by GitHub Actions. A lightweight Ballast-inspired workflow is now embedded in the repository through `AGENTS.md`, a rule catalog, reusable verification skills, a decision ledger, checkpointing, and labeled knowledge files.

## Decided

- D-001: use the official MCP TypeScript SDK v2 and Zod v4.
- D-002: FCPXML may be written; Motion remains read-only until real-app round trips pass.
- D-003: no shell interpolation for paths or launches.
- D-004: describe validation as structural, not full Apple DTD conformance.
- Ballast is a development/verification convention only; it is not added as a runtime dependency of the MCP.
- Real Final Cut Pro or Motion behavior must stay labeled `unverified` until observed on an actual Mac.

## Waiting on the user

- Run a generated FCPXML through Final Cut Pro on a Mac and export it again for a round-trip fixture.
- Provide one representative custom Motion template for schema-specific inspection tests.

## Next first action

On the target Mac, follow `.claude/skills/fcpxml-roundtrip/SKILL.md`: generate a disposable two-clip FCPXML, import it into Final Cut Pro, export it again, and retain both files plus the inspection outputs under `test/fixtures/roundtrip/`.

## Tried

- The repository initially contained only a bootstrap README and no runnable implementation.
- A stale temporary writer was stopped; the final files were rebuilt in a clean directory before publication.
- Automated and CI evidence cannot substitute for seeing Final Cut Pro or Motion accept and round-trip the artifacts; that boundary is now encoded in agent rules and knowledge files.
