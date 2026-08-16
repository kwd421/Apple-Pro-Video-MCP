---
name: fcpxml-roundtrip
description: Verify generated or modified FCPXML and optional SRT subtitles against a real Final Cut Pro import/export round trip. Use before claiming Final Cut compatibility or after changing FCPXML generation, edit-plan timing, or subtitle alignment semantics.
---

# FCPXML and subtitle round-trip verification

## When to use

Use this procedure after any change that affects generated FCPXML structure, timing, resource references, edit-plan mapping, effects, titles, roles, captions, subtitles, or timeline layout, and before promoting an app-compatibility claim to `confirmed`.

## Procedure

1. Run the repository checks first:

   ```bash
   npm install
   npm run check
   ```

2. Run `system_capabilities` and record the Final Cut Pro installation path and Node version.
3. Work in a disposable directory and a disposable Final Cut library/event. Never use a production library.
4. Choose two small local clips. When testing subtitles, obtain word-level timestamps for at least one clip and record which ASR or source produced them.
5. When testing the 0.2 editing pipeline:
   - create or assess several candidates;
   - run `highlight_rank`;
   - place the selected segments in an explicit narrative order;
   - run `edit_plan_build`;
   - retain its JSON output.
6. Use the returned `fcpxmlClips` with `fcpxml_create_project` to generate a new uniquely named FCPXML fixture. Never overwrite an existing user project or fixture.
7. Run `fcpxml_validate` and `fcpxml_inspect` on the generated file. Save the JSON outputs with the fixture notes.
8. When subtitle timing is under test:
   - pass `timelineWords` to `subtitle_segment`;
   - save the cue JSON;
   - write a new uniquely named SRT with `subtitle_write_srt`;
   - do not overwrite an existing SRT fixture.
9. Open the generated FCPXML with `finalcut_open_fcpxml` and import it into the disposable test library/event.
10. Inspect the timeline for:
    - clip order;
    - source in-points;
    - durations;
    - total project duration;
    - audio presence;
    - obvious relink/import warnings.
11. If an SRT was generated, import it into the same test project and inspect:
    - timeline origin;
    - first and last cue timing;
    - cue text and line breaks;
    - drift at cut boundaries;
    - whether removed source ranges incorrectly retain words;
    - whether any cue crosses an unintended cut.
12. Export the imported project back to FCPXML from Final Cut Pro under a new filename.
13. Run `fcpxml_validate` and `fcpxml_inspect` on the exported file.
14. Compare the generated and exported documents semantically. Attribute ordering, resource IDs, and harmless normalization may differ; focus on timeline meaning.
15. Save all artifacts under `test/fixtures/roundtrip/<date>-<case>/`:
    - source description, not private media unless intentionally committed;
    - ranking input/output when used;
    - edit-plan input/output;
    - generated FCPXML;
    - generated SRT and cue JSON when used;
    - Final Cut-exported FCPXML;
    - validation/inspection output;
    - app version and alignment notes.
16. Only after the app test succeeds may the tested behavior be labeled `observed`. Promote to `confirmed` only when the behavior is also supported by current primary Apple documentation or repeated across the supported app versions you intend to claim.

## Traps

- Final Cut may normalize resource IDs or structure on export; byte equality is not the goal.
- A structurally valid FCPXML file can still be rejected by Final Cut.
- Repository-confirmed SRT rendering does not prove Final Cut subtitle alignment.
- ASR errors and edit-plan retiming errors are distinct; retain the original word timestamps and the remapped timeline words.
- Importing into a production library creates unnecessary risk; use a disposable library/event.
- Never silently replace an existing fixture. Keep each round trip append-only by date/case.

## Verified

Not yet verified on a real Final Cut Pro installation.

## Evidence

Repository XML, ranking, edit-plan, subtitle, and MCP tests pass in CI, but no retained real-app FCPXML + SRT round-trip fixture is present yet. Therefore Final Cut application compatibility and subtitle alignment remain `unknown`/`unverified` until this procedure passes.
