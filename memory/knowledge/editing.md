# Editing and subtitle knowledge

This file separates deterministic repository behavior from unverified media-analysis, ASR quality, and Final Cut application behavior.

## confirmed

### Vibe transcript v1 imports preserve repository-visible segment and word timing

- Date: 2026-08-16
- Scope: `vibe_transcript_import` and the versioned interchange contract
- Evidence: the Vibe project exposes `TranscriptSegment(s,e,t,words)` and `TranscriptWord(word,s,e)` data; its isolated exchange branch serializes those fields as `vibe-video-analyzer/transcript` v1; Apple MCP tests cover schema validation, segment/word normalization, missing-word reporting, media existence checks, cross-machine `mediaPath` override, and stdio tool invocation; the code-bearing Apple revision passed GitHub Actions on Node.js 20 and 22.
- Limit: this confirms data-shape preservation after a JSON file exists. It does not confirm that the Vibe CLI can run in the user's current Python environment or that the timestamps are accurate against audio.

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
- Evidence: tests cover punctuation/pause splitting, Korean line wrapping, optional filler-token omission, SRT timestamp rendering, and existing-output protection; MCP stdio integration calls the tools; GitHub Actions passed on Node.js 20 and 22.
- Limit: this confirms generated SRT text and filesystem behavior, not alignment after import into Final Cut Pro.

## observed

- Vibe's source code directly produces segment and word objects with absolute start/end seconds through Faster-Whisper or its MPS path, with optional WhisperX alignment. This was observed in repository source on 2026-08-16, not in a completed transcription run on the user's Mac.
- No retained observation yet of a Vibe JSON export produced by the actual restored runtime.
- No retained observation yet of an SRT sidecar imported alongside a generated FCPXML timeline in Final Cut Pro.

## assumed

### VibeCoding_VideoAnalyzer is the preferred first Korean ASR provider for this project

- Date: 2026-08-16
- Reason: it is the user's existing local project, already supports Korean, word timestamps, VAD, Faster-Whisper, and optional WhisperX, and avoids introducing a second unrelated transcription stack.
- Status: assumed until the branch runs successfully on the target Mac and its timestamps are checked against real audio.

### A separate SRT sidecar is the safest first caption integration path

- Date: 2026-08-16
- Reason: it avoids guessing version-sensitive FCPXML caption/title structures while allowing deterministic caption timing output.
- Status: assumed for the target workflow until a real Final Cut project imports the generated FCPXML and SRT and the timing is inspected.

## unknown

- Whether the Vibe Python environment and local models are currently available on the user's Mac.
- Whether Faster-Whisper alone or optional WhisperX alignment gives better Korean timing on the user's actual clips.
- How accurate timestamps remain across noisy audio, multiple speakers, music, and rapid speech.
- Whether the target Final Cut Pro version imports the generated SRT with the expected timeline origin and role.
- How styled short-form subtitles should be represented and round-tripped through Motion titles or FCPXML.
- How visual quality metrics should be produced from actual frames rather than text/caller judgment.

## Next evidence needed

1. Restore the Vibe runtime and model on the target Mac.
2. Run `transcribe_cli.py` on a short real clip and retain the generated `.vibe-transcript.json`.
3. Compare several word timestamps against the audio and record whether WhisperX alignment was enabled.
4. Run `vibe_transcript_import`, `highlight_rank`, `edit_plan_build`, `subtitle_segment`, `subtitle_write_srt`, and `fcpxml_create_project`.
5. Import the generated FCPXML and SRT into a disposable Final Cut library.
6. Inspect cut timing and subtitle alignment, export FCPXML again, and retain artifacts and notes under `test/fixtures/roundtrip/`.
