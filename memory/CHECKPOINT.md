# Checkpoint — Vibe transcript to Final Cut pipeline — 2026-08-16

## The story so far

Apple Pro Video MCP is now version 0.3.0 with twelve tools. It can import a versioned word-timestamp JSON from the user's `VibeCoding_VideoAnalyzer`, expose candidate ranges and edit-plan segments, rank explicitly assessed highlights, assemble selected source ranges, retime transcript words, generate a protected FCPXML project and SRT sidecar, open the FCPXML in Final Cut Pro, and inspect Motion templates read-only. The Vibe integration is isolated behind `vibe-video-analyzer/transcript` v1 rather than coupling Node MCP code to the Python GUI. The code-bearing Apple revision passed GitHub Actions on macOS with Node.js 20 and 22.

A separate Vibe branch and draft PR add a standard-library exchange module plus a headless transcription CLI without modifying the existing engine timing, GUI, playback, or word-highlight paths. Its lightweight Python CI initially found only a terminal-wrapping-sensitive assertion; that test was corrected and rerun.

## Decided

- D-001: use the official MCP TypeScript SDK v2 and Zod v4.
- D-002: FCPXML may be written; Motion remains read-only until real-app round trips pass.
- D-003: no shell interpolation for paths or launches.
- D-004: describe validation as structural, not full Apple DTD conformance.
- D-005: highlight scores are transparent calculations over caller-supplied assessments; the MCP does not claim to watch video.
- D-006: captions first ship as a protected SRT sidecar; guessed FCPXML caption/title mutation remains gated.
- D-007: transcript words are retimed through the same explicit edit plan used to create FCPXML clips.
- D-008: integrate Vibe through a versioned JSON contract, not shared GUI state or Python imports inside the Node MCP.
- Ballast remains a development/verification convention, not a runtime dependency.

## Waiting on the user

- Restore the existing Vibe Python environment and model files on the Mac, or let Grok reconstruct them.
- Choose one short Korean interview clip for the first retained end-to-end fixture.
- On a Mac with Final Cut Pro, run the Vibe JSON → FCPXML + SRT import and alignment check.
- Provide one representative custom Motion template later for schema-specific inspection tests.

## Next first action

On the target Mac or through Grok, use `kwd421/VibeCoding_VideoAnalyzer` branch `agent/transcript-exchange` to generate a new `.vibe-transcript.json` from one short clip. Then use `docs/VIBE_INTEGRATION.ko.md` in this repository to run `vibe_transcript_import` → `highlight_rank` → `edit_plan_build` → `fcpxml_create_project` and `subtitle_segment` → `subtitle_write_srt`. Finally follow `.claude/skills/fcpxml-roundtrip/SKILL.md` and retain the Vibe JSON, generated FCPXML/SRT, Final Cut re-export, versions, errors, and alignment notes under `test/fixtures/roundtrip/<date>-<case>/`.

## Tried

- The initial Apple repository contained only a bootstrap README; the MCP implementation was built on `agent/initial-mcp`.
- Reusing the user's Vibe project is preferable to introducing a second ASR stack, but its actual macOS environment and models are not present in this execution environment.
- Vibe's existing source already emits absolute segment/word times. Because previous edits to its word-sync path caused regressions, this integration serializes current outputs without changing those algorithms.
- Automated tests prove the exchange/import shapes, ranking, retiming, segmentation, protected writes, and MCP calls, but cannot prove ASR accuracy or actual Final Cut alignment.
