# @phillipleblanc/pi

[Pi](https://github.com/badlogic/pi) extensions and skills for Spice.ai development workflows.

## Install

```bash
pi install https://github.com/phillipleblanc/pi
```

## Contents

### Extensions

- **sticky-title** — Displays a sticky header widget with an LLM-generated session title. Auto-generates after the first exchange, with `/title` and `/title-generate` commands.

### Skills

- **dependabot-batch-merge** — Batch-merge all open Dependabot PR branches into one JJ change, validate with lint, push a single branch, create one GitHub PR, and close superseded Dependabot PRs.
- **enterprise-oss-merge** — Merge OSS trunk (spiceai/spiceai) into enterprise trunk (spicehq/spiceai) using JJ. Handles fetching, merging, conflict resolution, runner name replacements, version fixups, Cargo.lock regeneration, push, and PR creation.
- **spice-testing** — Run and test Spice runtime with custom spicepods using tmux. Start spiced, run SQL queries, or test Spice scenarios interactively.
