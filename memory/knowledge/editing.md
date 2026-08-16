# Editing and subtitle knowledge

This file separates deterministic repository behavior from unverified media-analysis and Final Cut application behavior.

## confirmed

### Highlight ranking is a deterministic calculation over supplied assessments

- Date: 2026-08-16
- Scope: repository implementation
- Evidence: `src/editing.js` exposes fixed profile weights and penalty caps; unit tests cover ranking, penalty deduction, overlap exclusion, and duration-budget selection; GitHub Actions passed on Node.js 20 and 22.
- Limit: the MCP does not watch video or create the ratings. Poor or biased assessments produce poor rankings.

### Edit plans retime supplied word timestamps onto the assembled timeline

- Date: 2026-08-16
- Scope: `edit_plan_build`
- Evidence: unit tests cover two reordered source ranges, clipping words outside selected ranges, timeline offsets, and FCPXML clip arguments; GitHub Actions passed on Node.js 20 and 22.
- Limit: input timestamps must already exist and be sorted. This does not verify ASR accuracy.

### Subtitle segmentation and protected SRT writing work at repository level

- Date: 2026-08-16
- Scope: `subtitle_segment` and `subtitle_write_srt`
- Evidence: tests cover punctuation/pause splitting, Korean line wrapping, optional filler-token omission, SRT timestamp rendering, and existing-output protection; MCP stdio integration calls the new tools; GitHub Actions passed on Node.js 20 and 22.
- Limit: this confirms generated SRT text and filesystem behavior, not alignment after import into Final Cut Pro.

## observed

No retained observation yet of an SRT sidecar imported alongside a generated FCPXML timeline in Final Cut Pro.

## assumed

### A separate SRT sidecar is the safest first caption integration path

- Date: 2026-08-16
- Reason: it avoids guessing undocumented or version-sensitive FCPXML caption/title structures while allowing deterministic caption timing output.
- Status: assumed for the target workflow until a real Final Cut project imports the generated FCPXML and SRT and the timing is inspected.

## unknown

- Which local or remote ASR should provide Korean word timestamps.
- How accurate those timestamps remain across noisy audio, multiple speakers, and music.
- Whether the target Final Cut Pro version imports the generated SRT with the expected timeline origin and role.
- How styled short-form subtitles should be represented and round-tripped through Motion titles or FCPXML.
- How visual quality metrics should be produced from actual frames rather than caller judgment.

## Next evidence needed

1. Produce word-level timestamps for a short real clip using a chosen ASR.
2. Run `highlight_rank`, `edit_plan_build`, `subtitle_segment`, `subtitle_write_srt`, and `fcpxml_create_project`.
3. Import the generated FCPXML and SRT into a disposable Final Cut library.
4. Inspect cut timing and subtitle alignment, export FCPXML again, and retain the artifacts and notes under `test/fixtures/roundtrip/`.
