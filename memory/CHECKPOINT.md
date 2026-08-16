# Checkpoint — editing foundation and subtitles — 2026-08-16

## The story so far

Apple Pro Video MCP is now version 0.2.0 with eleven tools. In addition to capability discovery, FCPXML generation/inspection, Final Cut launching, and read-only Motion inspection, it now has a deterministic editing foundation: `highlight_rank`, `edit_plan_build`, `subtitle_segment`, and `subtitle_write_srt`. The pipeline can rank caller-assessed candidates, assemble source ranges, retime supplied word timestamps, create readable subtitle cues, and write a protected SRT sidecar. The code-bearing revision passed GitHub Actions on macOS with Node.js 20 and 22.

## Decided

- D-001: use the official MCP TypeScript SDK v2 and Zod v4.
- D-002: FCPXML may be written; Motion remains read-only until real-app round trips pass.
- D-003: no shell interpolation for paths or launches.
- D-004: describe validation as structural, not full Apple DTD conformance.
- D-005: highlight scores are transparent calculations over caller-supplied assessments; the MCP does not claim to watch video.
- D-006: captions first ship as a protected SRT sidecar; guessed FCPXML caption/title mutation remains gated.
- D-007: transcript words are retimed through the same explicit edit plan used to create FCPXML clips.
- Ballast remains a development/verification convention, not a runtime dependency.

## Waiting on the user

- On a Mac with Final Cut Pro, provide one short source clip or two small clips and run the complete FCPXML + SRT import check.
- Choose or supply an ASR capable of producing Korean word-level timestamps; the MCP currently consumes timestamps but does not generate them.
- Provide one representative custom Motion template later for schema-specific inspection tests.

## Next first action

On the target Mac or through Grok, obtain word-level timestamps for a short interview clip, follow `docs/EDITING_PIPELINE.ko.md` to run `highlight_rank` → `edit_plan_build` → `fcpxml_create_project` and `subtitle_segment` → `subtitle_write_srt`, then import the generated FCPXML and SRT into a disposable Final Cut library and record cut/subtitle alignment under `test/fixtures/roundtrip/`.

## Tried

- The initial repository contained only a bootstrap README; the MCP implementation was built on `agent/initial-mcp`.
- Automated tests prove ranking, retiming, segmentation, SRT rendering, protected writes, and MCP registration/calls, but cannot prove the quality of caller ratings or ASR timestamps.
- Automated and CI evidence cannot substitute for seeing Final Cut Pro accept and align the generated FCPXML and SRT; that boundary is encoded in rules and knowledge files.
