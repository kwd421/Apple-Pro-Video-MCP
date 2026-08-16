# Motion knowledge

This file stores reusable Apple Motion template findings. Literal XML observations and semantic interpretations must stay separate.

## confirmed

### The MCP recognizes the four template file extensions used by the MVP

- Date: 2026-08-16
- Scope: repository behavior
- Mapping:
  - `.moti` → title
  - `.motr` → transition
  - `.moef` → effect
  - `.motn` → generator
- Evidence: `src/motion.js` and repository tests.
- Limit: this confirms how the MCP classifies files, not complete Motion file-format semantics.

### Template discovery is read-only and skips symbolic links

- Date: 2026-08-16
- Evidence: implementation and repository tests/inspection.
- Limit: filesystem permissions may hide folders; missing/inaccessible paths are not interpreted as proof that no templates exist.

## observed

The test suite observes a synthetic XML fixture with a publish-like element and confirms that `motion_inspect_template` reports it. This is an observation about the parser, not a real Motion-produced project.

## assumed

### Publish-like XML names/attributes may identify Final Cut-exposed parameters

- Date: 2026-08-16
- Status: assumed
- Reason: the inspector currently reports elements whose names or attributes appear to indicate publishing.
- Limit: no representative Motion-produced fixture has yet proven the semantic mapping.

## unknown

- Exact field semantics for published parameters across current Motion template kinds.
- Which identifiers and metadata Motion rewrites when opening/saving a template.
- Which changes survive installation and are exposed correctly in Final Cut Pro.
- Whether schema details differ materially across Motion versions targeted by this project.

## Next evidence needed

Follow `.claude/skills/motion-template-inspection/SKILL.md` with a representative custom template copied from the target Mac. Retain the before/after fixture and app-version notes before implementing mutation.
