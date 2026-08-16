# Decisions

## D-001 — Use the official MCP SDK v2
- Date: 2026-08-16
- Status: active
- Decision: Use `@modelcontextprotocol/server` v2 and its stdio entry point instead of maintaining a custom MCP protocol implementation.
- Reason: MCP protocol negotiation and compatibility evolve independently from Apple Pro Video domain logic.

## D-002 — Keep Motion mutation out of the MVP
- Date: 2026-08-16
- Status: active
- Decision: Motion support is read-only template discovery and XML inspection.
- Reason: Project-file mutation is not promoted until real Motion and Final Cut round-trip fixtures prove the relevant fields and installation behavior.

## D-003 — Label FCPXML validation as structural
- Date: 2026-08-16
- Status: active
- Decision: The built-in XML and reference checks are structural validation, not full Apple DTD conformance.
- Reason: Avoid overstating compatibility without app-level import/export verification.
