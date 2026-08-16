# Apple Pro Video MCP

A local Model Context Protocol server for Final Cut Pro FCPXML, transparent edit planning, SRT subtitles, and read-only Apple Motion template inspection on macOS.

> **MVP status:** repository and MCP protocol behavior are covered by automated tests. Real Final Cut Pro import/export and Motion round-trip compatibility remain unverified until retained fixtures are produced on an editing Mac.

[한국어 안내](README.ko.md) · [Editing pipeline](docs/EDITING_PIPELINE.md) · [편집 판단·자막 파이프라인](docs/EDITING_PIPELINE.ko.md)

## Tools

| Tool | Purpose | Side effect |
|---|---|---|
| `system_capabilities` | Detect macOS, Node.js, Final Cut Pro, Motion, helper commands, and template roots | Read-only |
| `highlight_rank` | Rank caller-assessed transcript/scene candidates with visible profile weights and penalties | Read-only |
| `edit_plan_build` | Assemble selected source ranges and retime supplied word timestamps onto the new timeline | Read-only |
| `subtitle_segment` | Convert supplied word timestamps into readable subtitle cues and SRT text | Read-only |
| `subtitle_write_srt` | Write validated cues to a protected `.srt` output | Creates `.srt` |
| `fcpxml_validate` | Check XML structure, root/version, IDs, references, and time values | Read-only |
| `fcpxml_inspect` | Summarize projects, events, clips, titles, markers, resources, and durations | Read-only |
| `fcpxml_create_project` | Generate a frame-quantized FCPXML project from local media ranges | Creates `.fcpxml` |
| `finalcut_open_fcpxml` | Open an `.fcpxml` file or `.fcpxmld` bundle in Final Cut Pro | Launches app/import UI |
| `motion_list_templates` | Find installed `.moti`, `.motr`, `.moef`, and `.motn` templates | Read-only |
| `motion_inspect_template` | Inspect Motion XML metadata and publish-like parameters | Read-only |

The editing tools do not watch video or transcribe audio by themselves. They validate and transform candidate assessments and word timestamps supplied by a model, human, or external ASR system.

## Requirements

- Node.js 20 or later
- macOS for Final Cut Pro launching and standard Motion template locations
- Final Cut Pro and Motion are optional for XML, ranking, planning, and subtitle-only tools

The server uses the official MCP TypeScript SDK v2 and Zod v4.

## Install

Until the initial pull request is merged, use the feature branch:

```bash
git clone https://github.com/kwd421/Apple-Pro-Video-MCP.git
cd Apple-Pro-Video-MCP
git switch agent/initial-mcp

npm install
npm run check
```

## Connect an MCP client

Use an absolute path to `src/index.js` and preferably an absolute Node path:

```json
{
  "mcpServers": {
    "apple-pro-video": {
      "command": "/opt/homebrew/bin/node",
      "args": [
        "/Users/YOUR_NAME/Developer/Apple-Pro-Video-MCP/src/index.js"
      ]
    }
  }
}
```

A template is included in [`mcp-config.example.json`](mcp-config.example.json). Fully restart the MCP host after saving the configuration.

The server writes protocol traffic only to stdout. Startup and error diagnostics go to stderr.

## Inspect locally

```bash
npm run inspect
```

Then call `system_capabilities` and confirm that all eleven tools are listed.

## Basic FCPXML workflow

```text
Create /Users/me/Desktop/interview-selects.fcpxml.
Project name: Interview Selects
Frame rate: 29.97
Use /Users/me/Movies/A001.mov from 0 for 12.5 seconds,
then /Users/me/Movies/A002.mov from 3 seconds for 8 seconds.
Do not overwrite existing files.
```

The generator supports `23.976`, `24`, `25`, `29.97`, `30`, `50`, `59.94`, and `60` fps. Source starts and durations are quantized to frames and written as rational FCP times.

Then ask the client to validate, inspect, and open the generated document in Final Cut Pro.

## Editing and subtitle workflow

The intended foundation is:

```text
external transcript/analysis
  → highlight_rank
  → edit_plan_build
      ├─ fcpxmlClips → fcpxml_create_project
      └─ timelineWords → subtitle_segment → subtitle_write_srt
```

See [`docs/EDITING_PIPELINE.md`](docs/EDITING_PIPELINE.md) or [`docs/EDITING_PIPELINE.ko.md`](docs/EDITING_PIPELINE.ko.md) for metrics, profiles, JSON examples, Korean subtitle settings, and the current verification boundary.

## Motion workflow

Motion support remains read-only. The MCP can locate templates and inspect generic XML metadata, but it will not rewrite or install Motion projects until representative fixtures and a real Motion/Final Cut round trip exist.

## Safety behavior

- FCPXML input is capped at 10 MB; Motion input is capped at 20 MB.
- Custom XML entities, external DTDs, and internal-subset DTDs are rejected.
- File arguments must be absolute or start with `~/`.
- Existing `.fcpxml` and `.srt` outputs are preserved unless `overwrite: true` is explicit.
- Non-overwrite writes use a temporary file plus an exclusive destination operation.
- App launching uses executable-plus-argument arrays rather than shell interpolation.
- Recursive searches skip symbolic links and enforce depth/result bounds.

These measures reduce accidental damage; they are not a security sandbox.

## Development and verification

```bash
npm install
npm run lint
npm test
npm run check
```

Automated coverage includes XML failure modes, exact frame timing, FCPXML generation and protection, Motion discovery, highlight ranking, overlap filtering, edit-plan retiming, subtitle segmentation, SRT rendering/protection, and real stdio MCP initialization/list/call paths.

Automated tests do **not** prove that a particular Final Cut Pro version accepts every generated document or that an SRT aligns correctly after import. The next real-app check is documented in [`.claude/skills/fcpxml-roundtrip/SKILL.md`](.claude/skills/fcpxml-roundtrip/SKILL.md).

## License

MIT
