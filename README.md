# Apple Pro Video MCP

A local Model Context Protocol server for Final Cut Pro FCPXML and Apple Motion template workflows on macOS.

> **MVP status:** the MCP server, XML parser, FCPXML generator, filesystem safeguards, and automated tests are implemented. A real Final Cut Pro import/export round trip and real Motion project fixtures still need to be verified on an editing Mac.

## Available tools

| Tool | Purpose | Side effect |
|---|---|---|
| `system_capabilities` | Detect macOS, Node.js, Final Cut Pro, Motion, helper commands, and template roots | Read-only |
| `fcpxml_validate` | Check XML structure, FCPXML root/version, IDs, references, and time values | Read-only |
| `fcpxml_inspect` | Summarize projects, events, clips, titles, markers, resources, and durations | Read-only |
| `fcpxml_create_project` | Generate a frame-quantized FCPXML project from local media paths | Creates `.fcpxml` |
| `finalcut_open_fcpxml` | Open an `.fcpxml` file or `.fcpxmld` bundle in Final Cut Pro | Launches app/import UI |
| `motion_list_templates` | Find installed `.moti`, `.motr`, `.moef`, and `.motn` templates | Read-only |
| `motion_inspect_template` | Inspect Motion XML metadata and publish-like parameters | Read-only |

Motion mutation is intentionally excluded from the first release. The MCP can inspect Motion project files, but it will not rewrite or install them until the behavior is verified with real Motion and Final Cut Pro round trips.

## Requirements

- macOS for Final Cut Pro launching and the standard Motion template locations
- Node.js 20 or later
- Final Cut Pro and Motion are optional for XML-only tools

The server uses the official MCP TypeScript SDK v2 and Zod for tool schemas.

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

Use an absolute path to `src/index.js`:

```json
{
  "mcpServers": {
    "apple-pro-video": {
      "command": "node",
      "args": [
        "/Users/YOUR_NAME/Developer/Apple-Pro-Video-MCP/src/index.js"
      ]
    }
  }
}
```

A template is included in [`mcp-config.example.json`](mcp-config.example.json). Save the configuration and fully restart the MCP host.

The server sends protocol traffic only through stdout. Startup and error diagnostics go to stderr, so they do not corrupt the MCP stdio stream.

## Run it directly

```bash
npm start
```

The process waits for an MCP client on stdin/stdout. To open the official MCP Inspector:

```bash
npm run inspect
```

The Inspector command may download its own package the first time it runs.

## First use

Check the Mac before editing anything:

```text
Call system_capabilities. Tell me whether Final Cut Pro and Motion are installed,
and show the Motion template roots that exist.
```

Validate and inspect an export:

```text
Validate and inspect /Users/me/Desktop/sample.fcpxml.
Report unresolved references, project names, clip counts, markers, titles,
and sequence durations.
```

Both FCPXML tools accept either an absolute/`~/` path or inline XML. Exactly one must be provided.

## Create an FCPXML project

Natural-language example:

```text
Create /Users/me/Desktop/interview-selects.fcpxml.
Project name: Interview Selects
Event name: AI Edits
Frame rate: 29.97
Resolution: 1920x1080
Use these clips in order:
- /Users/me/Movies/A001.mov, use the first 12.5 seconds
- /Users/me/Movies/A002.mov, start at 3 seconds and use 8 seconds
Do not overwrite an existing file.
```

Equivalent `fcpxml_create_project` arguments:

```json
{
  "outputPath": "/Users/me/Desktop/interview-selects.fcpxml",
  "projectName": "Interview Selects",
  "eventName": "AI Edits",
  "frameRate": "29.97",
  "width": 1920,
  "height": 1080,
  "overwrite": false,
  "clips": [
    {
      "path": "/Users/me/Movies/A001.mov",
      "durationSeconds": 12.5
    },
    {
      "path": "/Users/me/Movies/A002.mov",
      "sourceStartSeconds": 3,
      "durationSeconds": 8
    }
  ]
}
```

Supported frame rates are `23.976`, `24`, `25`, `29.97`, `30`, `50`, `59.94`, and `60`. Durations and source starts are rounded to the nearest frame and written as exact rational FCP times.

Every media path must exist by default. Use `allowMissingMedia: true` only when intentionally creating an offline-media project.

Then ask:

```text
Open /Users/me/Desktop/interview-selects.fcpxml in Final Cut Pro.
```

The launch tool invokes `/usr/bin/open` with an argument array. It never embeds a user path in a shell command.

## Work with FCPXML bundles

`fcpxml_validate`, `fcpxml_inspect`, and `finalcut_open_fcpxml` accept both:

```text
/absolute/path/Project.fcpxml
/absolute/path/Project.fcpxmld
```

For `.fcpxmld`, the reader prefers `Info.fcpxml`, then performs a bounded search inside the bundle without following symbolic links.

## Inspect Motion templates

List titles:

```text
List Motion templates of kind title. Limit the result to 100.
```

Inspect a template:

```text
Inspect this Motion title and list publish-like parameters:
/Users/me/Movies/Motion Templates.localized/Titles/Custom/Lower Third/Lower Third.moti
```

Default search roots:

```text
~/Movies/Motion Templates.localized
~/Movies/Motion Templates
/Library/Application Support/Final Cut Pro/Templates.localized
/Library/Application Support/Final Cut Pro/Templates
```

Supported extensions:

| Extension | Kind |
|---|---|
| `.moti` | Title |
| `.motr` | Transition |
| `.moef` | Effect |
| `.motn` | Generator |

Motion discovery does not follow symbolic links.

## Safety behavior

- FCPXML input is capped at 10 MB; Motion template input is capped at 20 MB.
- Custom XML entities, external DTDs, and internal-subset DTDs are rejected.
- File arguments must be absolute or start with `~/`.
- Existing `.fcpxml` output is preserved unless `overwrite: true` is explicit.
- Non-overwrite creation uses a temporary file and an exclusive destination operation.
- App launching uses `execFile` with argument arrays rather than shell interpolation.
- Recursive template and bundle searches skip symbolic links and have depth/result bounds.

These measures reduce accidental damage; they are not a security sandbox. Run the MCP under the macOS account and filesystem permissions appropriate for the editing project.

## Development and verification

```bash
npm install
npm run lint
npm test
npm run check
```

Automated coverage includes:

- XML entity, attribute, root, and DTD failure modes
- exact 29.97 fps rational time conversion
- clip offset and duration generation
- existing-output protection
- duplicate resource ID and unresolved reference reporting
- `.fcpxmld` bundle discovery
- Motion template listing and generic publish-parameter inspection
- real stdio MCP initialization, tool listing, and tool calling

GitHub Actions runs the complete suite on macOS with Node.js 20 and 22.

## Verification boundary

Automated tests verify the server and generated document structure. They do **not** prove that a specific installed Final Cut Pro version accepts every generated project or that generic Motion XML observations have the same meaning across Motion versions.

The next verification step is to generate a two-clip project on the target Mac, import it into Final Cut Pro, export it again, and retain both files as a round-trip fixture. See [`memory/CHECKPOINT.md`](memory/CHECKPOINT.md).

## License

MIT
