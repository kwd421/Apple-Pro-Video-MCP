import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { buildEditPlan, rankHighlights } from './editing.js';
import { createFcpxmlProject, inspectFcpxml, validateFcpxml } from './fcpxml.js';
import { inspectMotionTemplate, listMotionTemplates } from './motion.js';
import { segmentSubtitles, writeSubtitleSrt } from './subtitles.js';
import { openFcpxmlInFinalCut, systemCapabilities } from './system.js';

const SERVER_NAME = 'apple-pro-video-mcp';
const SERVER_VERSION = '0.2.0';

const pathOrXmlSchema = z.object({
  path: z.string().min(1).optional().describe('Absolute path or ~/ path to .fcpxml or .fcpxmld.'),
  xml: z.string().min(1).optional().describe('Inline FCPXML text.')
}).refine((value) => Number(Boolean(value.path)) + Number(Boolean(value.xml)) === 1, {
  message: 'Provide exactly one of path or xml.'
});

const clipSchema = z.object({
  path: z.string().min(1).describe('Absolute local media path or ~/ path.'),
  name: z.string().min(1).optional(),
  durationSeconds: z.number().finite().positive(),
  sourceStartSeconds: z.number().finite().min(0).default(0),
  hasAudio: z.boolean().default(true)
});

const scoreSchema = z.number().finite().min(0).max(100);
const highlightMetricsSchema = z.object({
  hook: scoreSchema,
  payoff: scoreSchema,
  clarity: scoreSchema,
  emotion: scoreSchema,
  novelty: scoreSchema,
  editability: scoreSchema,
  visual: scoreSchema
});
const highlightPenaltiesSchema = z.object({
  contextDependency: scoreSchema.optional(),
  repetition: scoreSchema.optional(),
  disfluency: scoreSchema.optional(),
  noise: scoreSchema.optional(),
  longSetup: scoreSchema.optional(),
  weakEnding: scoreSchema.optional()
}).default({});
const wordSchema = z.object({
  text: z.string().min(1),
  startSeconds: z.number().finite().min(0),
  endSeconds: z.number().finite().positive(),
  confidence: z.number().finite().min(0).max(1).optional()
});
const subtitleCueSchema = z.object({
  startSeconds: z.number().finite().min(0),
  endSeconds: z.number().finite().positive(),
  text: z.string().min(1).optional(),
  lines: z.array(z.string().min(1)).min(1).max(4).optional()
}).refine((cue) => Boolean(cue.text) || Boolean(cue.lines), {
  message: 'Each cue must contain text or lines.'
});

function success(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value
  };
}

function failure(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: { error: message },
    isError: true
  };
}

function register(server, name, config, handler) {
  server.registerTool(name, config, async (input) => {
    try {
      return success(await handler(input));
    } catch (error) {
      return failure(error);
    }
  });
}

export function createServer() {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  register(server, 'system_capabilities', {
    title: 'Apple Pro Video system capabilities',
    description: 'Inspect macOS, Final Cut Pro and Motion installation paths, command availability, and Motion template roots.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async () => systemCapabilities());

  register(server, 'highlight_rank', {
    title: 'Rank edit highlight candidates',
    description: 'Apply a transparent profile-specific score to caller-assessed transcript or scene candidates, then recommend a non-overlapping duration-bounded selection. This tool does not watch video by itself.',
    inputSchema: z.object({
      profile: z.enum(['interview_short', 'lecture', 'entertainment', 'vlog', 'product']).default('interview_short'),
      targetDurationSeconds: z.number().finite().min(1).max(86400).default(60),
      maxSelected: z.number().int().min(1).max(100).default(20),
      maxOverrunSeconds: z.number().finite().min(0).max(60).default(3),
      allowOverlaps: z.boolean().default(false),
      candidates: z.array(z.object({
        id: z.string().min(1).optional(),
        sourceId: z.string().min(1).optional(),
        startSeconds: z.number().finite().min(0),
        endSeconds: z.number().finite().positive(),
        text: z.string().min(1),
        metrics: highlightMetricsSchema,
        penalties: highlightPenaltiesSchema.optional()
      })).min(1).max(500)
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, rankHighlights);

  register(server, 'edit_plan_build', {
    title: 'Build and retime an edit plan',
    description: 'Assemble ordered source segments into a deterministic timeline, produce clip arguments for FCPXML generation, and retime supplied source word timestamps onto the assembled timeline.',
    inputSchema: z.object({
      targetDurationSeconds: z.number().finite().min(1).max(86400).optional(),
      segments: z.array(z.object({
        id: z.string().min(1).optional(),
        path: z.string().min(1),
        name: z.string().min(1).optional(),
        sourceStartSeconds: z.number().finite().min(0).default(0),
        durationSeconds: z.number().finite().positive(),
        hasAudio: z.boolean().default(true),
        rationale: z.string().min(1).optional(),
        score: scoreSchema.optional(),
        words: z.array(wordSchema).max(100000).optional()
      })).min(1).max(500)
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, buildEditPlan);

  register(server, 'subtitle_segment', {
    title: 'Segment word timestamps into subtitle cues',
    description: 'Turn caller-provided word timestamps into punctuation-, pause-, length-, and duration-aware subtitle cues and SRT text. This tool does not transcribe audio.',
    inputSchema: z.object({
      words: z.array(wordSchema).min(1).max(100000),
      maxCharactersPerLine: z.number().int().min(4).max(80).default(18),
      maxLines: z.number().int().min(1).max(4).default(2),
      maxCueDurationSeconds: z.number().finite().min(0.25).max(15).default(3.5),
      minCueDurationSeconds: z.number().finite().min(0.1).max(10).default(0.7),
      gapBreakSeconds: z.number().finite().min(0).max(5).default(0.45),
      maxWordsPerCue: z.number().int().min(1).max(50).default(10),
      punctuationBreak: z.boolean().default(true),
      omitTokens: z.array(z.string().min(1)).max(100).default([])
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, segmentSubtitles);

  register(server, 'subtitle_write_srt', {
    title: 'Write an SRT subtitle file',
    description: 'Write validated subtitle cues to an .srt file. Existing output is preserved unless overwrite is true.',
    inputSchema: z.object({
      outputPath: z.string().min(1),
      overwrite: z.boolean().default(false),
      cues: z.array(subtitleCueSchema).min(1).max(100000)
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, writeSubtitleSrt);

  register(server, 'fcpxml_validate', {
    title: 'Validate FCPXML structure',
    description: 'Parse FCPXML and check root/version, XML structure, resource identifiers, references, and time values. This is structural validation, not the full Apple DTD.',
    inputSchema: pathOrXmlSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, validateFcpxml);

  register(server, 'fcpxml_inspect', {
    title: 'Inspect FCPXML',
    description: 'Summarize projects, events, timeline elements, resources, names, and sequence durations in FCPXML.',
    inputSchema: pathOrXmlSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, inspectFcpxml);

  register(server, 'fcpxml_create_project', {
    title: 'Create an FCPXML project',
    description: 'Create an FCPXML 1.11 project from an ordered list of local media clips with frame-quantized durations. Existing output is preserved unless overwrite is true.',
    inputSchema: z.object({
      outputPath: z.string().min(1).describe('Absolute or ~/ output path ending in .fcpxml.'),
      projectName: z.string().min(1),
      eventName: z.string().min(1).optional(),
      frameRate: z.enum(['23.976', '24', '25', '29.97', '30', '50', '59.94', '60']).default('29.97'),
      width: z.number().int().min(16).max(16384).default(1920),
      height: z.number().int().min(16).max(16384).default(1080),
      overwrite: z.boolean().default(false),
      allowMissingMedia: z.boolean().default(false),
      clips: z.array(clipSchema).min(1).max(500)
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, createFcpxmlProject);

  register(server, 'finalcut_open_fcpxml', {
    title: 'Open FCPXML in Final Cut Pro',
    description: 'Open an existing .fcpxml file or .fcpxmld bundle using macOS /usr/bin/open without invoking a shell.',
    inputSchema: z.object({
      path: z.string().min(1),
      appName: z.string().min(1).default('Final Cut Pro')
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  }, openFcpxmlInFinalCut);

  register(server, 'motion_list_templates', {
    title: 'List Motion templates',
    description: 'Recursively list installed Motion titles, transitions, effects, and generators without following symbolic links.',
    inputSchema: z.object({
      roots: z.array(z.string().min(1)).min(1).optional(),
      kinds: z.array(z.enum(['title', 'transition', 'effect', 'generator'])).min(1).optional(),
      maxResults: z.number().int().min(1).max(2000).default(500),
      maxDepth: z.number().int().min(1).max(20).default(8)
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, listMotionTemplates);

  register(server, 'motion_inspect_template', {
    title: 'Inspect a Motion template',
    description: 'Read a .moti, .motr, .moef, or .motn Motion XML project and report metadata, element counts, and publish-like parameters. Read-only.',
    inputSchema: z.object({ path: z.string().min(1) }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, inspectMotionTemplate);

  return server;
}

export const serverMetadata = Object.freeze({ name: SERVER_NAME, version: SERVER_VERSION });
