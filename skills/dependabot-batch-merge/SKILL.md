---
name: dependabot-batch-merge
description: Batch-merge all open Dependabot PR branches into one JJ change, validate with lint, push a single branch, create one GitHub PR, and close superseded Dependabot PRs. Use when consolidating dependency update PRs in spiceai/spiceai.
---

# Dependabot Batch Merge (spiceai/spiceai)

Consolidate all open Dependabot PRs into a single `feature-deps` JJ change.

## When to use

Use this workflow when `spiceai/spiceai` has many open Dependabot PRs and you want one combined PR.

## Prerequisites

- `gh` authenticated with repo access.
- `jj` available.
- A dedicated workspace (do not share with other runtime-build tasks).
- Run from a clean `spiceai/spiceai` workspace (for example `~/code/spiceai/three`).

## Workflow

### 1) Discover open Dependabot PRs

```bash
cd ~/code/spiceai/three

gh pr list \
  --repo spiceai/spiceai \
  --state open \
  --search "author:app/dependabot" \
  --json number,title,headRefName,url \
  --limit 100
```

If none are open, stop.

### 2) Build branch ref list and create a single JJ change

```bash
refs=$(gh pr list \
  --repo spiceai/spiceai \
  --state open \
  --search "author:app/dependabot" \
  --json headRefName \
  --jq '.[].headRefName + "@origin"' | paste -sd ' ' -)

echo "$refs"
jj new $refs
```

Notes:
- This follows the preferred pattern: `jj new dependabot/...@origin dependabot/...@origin ...`
- Include all open Dependabot PRs (cargo, github_actions, etc.).

### 3) Create and track the consolidated bookmark

```bash
jj bookmark create feature-deps
jj bookmark track feature-deps --remote origin
```

### 4) Resolve Cargo.lock conflicts (preferred approach)

If merged Dependabot branches leave `Cargo.lock` in a bad/conflicted state, do **not** manually merge lockfile chunks.

Use this workflow instead:

```bash
jj restore --from trunk Cargo.lock
cargo check -p runtime-async
```

This restores `Cargo.lock` from `trunk` and regenerates it consistently via a lightweight check.

### 5) Validate and fix breakages

```bash
make lint-rust
```

Important:
- Do not use short timeouts.
- If lint or compilation fails, fix issues in this same change until clean.

### 6) Push the bookmark

```bash
jj git push -b feature-deps
```

### 7) Create a GitHub PR for `feature-deps`

```bash
gh pr create \
  --repo spiceai/spiceai \
  --head feature-deps \
  --base trunk \
  --title "build(deps): batch merge dependabot updates" \
  --body "## Summary
- Consolidates all currently open Dependabot PR branches into one change
- Validated with make lint-rust

## Follow-up
- Superseded Dependabot PRs will be closed in favor of this PR"
```

Capture the created PR URL for the next step.

### 8) Close superseded Dependabot PRs

Get current Dependabot PR numbers and close each one with a replacement note.

```bash
replacement_pr_url="<NEW_PR_URL>"

for pr in $(gh pr list \
  --repo spiceai/spiceai \
  --state open \
  --search "author:app/dependabot" \
  --json number \
  --jq '.[].number'); do
  gh pr close "$pr" \
    --repo spiceai/spiceai \
    --comment "Superseded by consolidated dependency update PR: $replacement_pr_url"
done
```

## Final checks

- `feature-deps` is pushed and tracked.
- Consolidated PR exists and is open.
- Superseded Dependabot PRs are closed.
- Workspace status is clean or contains only expected follow-up changes.
