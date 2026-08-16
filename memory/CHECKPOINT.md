# Checkpoint — initial Apple Pro Video MCP — 2026-08-16

## The story so far

An MCP TypeScript SDK v2 stdio server exposes seven tools for capability discovery, FCPXML validation/inspection/project generation, opening FCPXML in Final Cut Pro, and read-only Motion template discovery/inspection. Core XML/FCPXML/Motion tests pass locally; the complete dependency-backed MCP test runs in GitHub Actions.

## Decided

- D-001: use the official MCP TypeScript SDK v2 and Zod v4.
- D-002: FCPXML may be written; Motion remains read-only until real-app round trips pass.
- D-003: no shell interpolation for paths or launches.
- D-004: describe validation as structural, not full Apple DTD conformance.

## Waiting on the user

- Run a generated FCPXML through Final Cut Pro on a Mac and export it again for a round-trip fixture.
- Provide one representative custom Motion template for schema-specific inspection tests.

## Next first action

Generate a two-clip FCPXML on the target Mac, import it into Final Cut Pro, export it, and save both files under `test/fixtures/roundtrip/`.

## Tried

- The repository initially contained only a bootstrap README and no runnable implementation.
- A stale temporary writer was stopped; the final files were rebuilt in a clean directory before publication.
