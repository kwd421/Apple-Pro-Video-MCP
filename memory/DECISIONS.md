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

## D-005 — Highlight scoring stays transparent and caller-supplied

Status: active  
Date: 2026-08-16

`highlight_rank` combines explicit caller-supplied ratings with profile weights and visible penalty caps. It must not claim to have watched, understood, or fact-checked video. A future media-analysis layer may produce the inputs, but the ranking calculation remains inspectable.

## D-006 — Build captions as an SRT sidecar before guessing FCPXML caption structures

Status: active  
Date: 2026-08-16

The first caption-writing path segments word timestamps and writes protected SRT files. Embedding captions or styled subtitles directly in FCPXML is deferred until real Final Cut import/export fixtures establish the target structures and semantics.

## D-007 — Retime transcript words through an explicit edit plan

Status: active  
Date: 2026-08-16

Selected source ranges are assembled by `edit_plan_build`. Source-relative absolute word timestamps are clipped to each selected range and mapped onto the new timeline before subtitle segmentation. This keeps cut decisions and subtitle timing linked through one deterministic plan.
