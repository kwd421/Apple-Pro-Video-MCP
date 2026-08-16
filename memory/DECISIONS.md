# Decisions

## D-001 — Official MCP TypeScript SDK v2

Status: active  
Date: 2026-08-16

Use `@modelcontextprotocol/server` v2 with its stdio entry point. Use Zod v4 schemas for tool validation. This keeps protocol negotiation and transport behavior aligned with the maintained MCP implementation.

## D-002 — FCPXML writes; Motion reads

Status: active  
Date: 2026-08-16

The first release may create and open FCPXML. Motion project files remain inspection-only until mutations have passed real Motion and Final Cut Pro round-trip checks.

## D-003 — No shell interpolation

Status: active  
Date: 2026-08-16

External commands are invoked with executable/argument arrays. User-provided paths are never embedded in a shell command.

## D-004 — Structural XML validation is labeled accurately

Status: active  
Date: 2026-08-16

`fcpxml_validate` checks well-formed XML, IDs, references, time syntax, and core structure. It must not be described as a complete validation against every Apple FCPXML DTD rule.
