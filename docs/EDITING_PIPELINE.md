# Editing and subtitle pipeline

Apple Pro Video MCP 0.2 adds deterministic foundations for selecting candidate ranges, assembling an edit, and producing subtitle sidecars.

The server does not watch video or transcribe audio by itself. A model, human, or external ASR system must supply candidate assessments and word-level timestamps.

## Pipeline

```text
media
  → external transcript/analysis
  → highlight_rank
  → edit_plan_build
      ├─ fcpxmlClips → fcpxml_create_project
      └─ timelineWords → subtitle_segment → subtitle_write_srt
  → FCPXML + SRT
  → real Final Cut Pro import check
```

## Highlight ranking

`highlight_rank` accepts 0–100 values for:

- `hook`
- `payoff`
- `clarity`
- `emotion`
- `novelty`
- `editability`
- `visual`

Profiles: `interview_short`, `lecture`, `entertainment`, `vlog`, and `product`.

Optional penalty intensities: `contextDependency`, `repetition`, `disfluency`, `noise`, `longSetup`, and `weakEnding`.

The output shows every weight, metric contribution, penalty deduction, ranked candidate, overlap skip, and duration-budget skip.

## Edit-plan retiming

`edit_plan_build` receives ordered source ranges. It calculates timeline offsets, returns `fcpxmlClips` for `fcpxml_create_project`, and clips/remaps supplied source word timestamps to `timelineWords`.

Input word timestamps are absolute positions in the original source media. They must already be sorted.

## Subtitle segmentation

`subtitle_segment` groups supplied words using punctuation, pauses, cue duration, line capacity, and word-count limits. It returns structured cues and rendered SRT text.

`omitTokens` is opt-in and exact-match only. It is empty by default to avoid silently deleting speech.

`subtitle_write_srt` writes cues to an `.srt` file and preserves existing output unless `overwrite: true` is explicit.

## Verification boundary

Repository tests confirm calculation, retiming, segmentation, SRT rendering, protected writes, and MCP tool registration/calls. They do not prove:

- that candidate ratings reflect actual video quality;
- that an ASR transcript is accurate;
- that a generated FCPXML imports into a specific Final Cut Pro version;
- that the generated SRT aligns after Final Cut import;
- that styled subtitles round-trip through Motion or FCPXML.

The next check is a retained real-app fixture containing the source description, generated FCPXML, generated SRT, Final Cut export, and alignment notes.

See the Korean guide for full JSON examples: [`EDITING_PIPELINE.ko.md`](EDITING_PIPELINE.ko.md).
