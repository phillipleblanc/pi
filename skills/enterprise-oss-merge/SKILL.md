---
name: enterprise-oss-merge
description: Merge OSS trunk (spiceai/spiceai) into enterprise trunk (spicehq/spiceai) using JJ. Handles fetching, merging, conflict resolution, runner name replacements, version fixups, Cargo.lock regeneration, push, and PR creation. Use when the enterprise repo needs to be updated with the latest OSS changes.
---

# Enterprise OSS Trunk Merge

Merge the latest OSS trunk (`origin`) into enterprise trunk (`enterprise`) in the `spiceai/spiceai` repo using JJ, then push and create a PR on `spicehq/spiceai`.

## When to use

Use this when the enterprise fork (`spicehq/spiceai`) needs to incorporate the latest changes from the OSS repo (`spiceai/spiceai`).

## Prerequisites

- `jj` available and colocated repo at `~/code/spiceai/spiceai`.
- `gh` authenticated with access to both `spiceai/spiceai` and `spicehq/spiceai`.
- Remotes configured:
  - `origin` → `https://github.com/spiceai/spiceai.git`
  - `enterprise` → `https://github.com/spicehq/spiceai.git`
- A **dedicated workspace** (do not share with other runtime-build tasks). Prefer `~/code/spiceai/three` or create a new one.
- Workspace reserved in `WORKSPACES.md`.

## Workflow

### 1) Reserve workspace and set up

Reserve a workspace in `WORKSPACES.md`, then navigate to it and ensure it's clean:

```bash
cd ~/code/spiceai/three   # or whichever workspace is reserved
jj workspace update-stale 2>/dev/null || true
jj st
```

### 2) Fetch both remotes

```bash
jj git fetch --remote origin
jj git fetch --remote enterprise
```

### 3) Check divergence

Confirm the current state of both trunks:

```bash
jj log -r 'trunk@origin' --no-graph --limit 1
jj log -r 'trunk@enterprise' --no-graph --limit 1
```

If `trunk@enterprise` already contains `trunk@origin` (i.e. no new OSS commits), stop — nothing to merge.

Quick check:

```bash
jj log -r 'trunk@origin & ~::trunk@enterprise' --no-graph --limit 1
```

If this produces no output, the enterprise trunk is already up-to-date.

### 4) Create the merge commit

Create a new JJ change that merges both trunks:

```bash
jj new trunk@enterprise trunk@origin
```

This creates a merge commit with both trunks as parents.

### 5) Resolve conflicts

Check for conflicts:

```bash
jj st
```

If there are conflicts, resolve them. Common conflict patterns:

#### a) `.github/workflows/` files (runner names)

Enterprise uses different runner names. For any conflicted workflow files, take the OSS version and apply runner renames:

```bash
# For each conflicted workflow file:
jj restore --from trunk@origin <file>
```

Then apply the runner name replacements (see Step 6).

#### b) `version.txt` and `Cargo.toml` version

Enterprise uses a different version string. Resolve by keeping the enterprise version:

```bash
jj restore --from trunk@enterprise version.txt
```

For `Cargo.toml`, restore from enterprise to keep the enterprise version:

```bash
jj restore --from trunk@enterprise Cargo.toml
```

Then re-apply any non-version changes from OSS that were in `Cargo.toml` (new dependencies, etc.). Check what OSS changed:

```bash
jj diff --from trunk@enterprise --to trunk@origin Cargo.toml
```

#### c) `Cargo.lock`

Do **not** manually merge `Cargo.lock` during conflict resolution. If it conflicts, restore the enterprise version:

```bash
jj restore --from trunk@enterprise Cargo.lock
```

Then run `cargo check -p runtime-async` later in Step 7 to regenerate `Cargo.lock` consistently.

#### d) Other conflicts

For other files, analyze both sides and produce a clean merge. Use `jj resolve` or manually edit the file and then:

```bash
jj resolve <file>
```

### 6) Apply enterprise runner name replacements

After the merge, replace OSS runner names with enterprise equivalents across workflow files, but **do not modify** `.github/workflows/upstream_merge.yml`.

```bash
rg --files .github/workflows -g '*.yml' -g '*.yaml' \
  | rg -v '^\.github/workflows/upstream_merge\.yml$' \
  | while IFS= read -r file; do
      sed -i '' \
        -e 's/spiceai-dev-runners/spicehq-dev-runners/g' \
        -e 's/spiceai-dev-large-runners/spicehq-dev-large-runners/g' \
        "$file"
    done
```

Verify no OSS runner names remain (excluding `upstream_merge.yml`):

```bash
rg 'spiceai-dev-runners|spiceai-dev-large-runners' .github/workflows/ -g '!**/upstream_merge.yml'
```

This should produce no output. If it does, fix the remaining references.

### 7) Regenerate `Cargo.lock`

Run this even if there was no `Cargo.lock` conflict:

```bash
cargo check -p runtime-async
```

### 8) Verify enterprise version strings are preserved

```bash
cat version.txt
grep '^version = ' Cargo.toml
```

Both should show the enterprise version (e.g. `2.0.0-enterprise-beta`), **not** the OSS version (e.g. `2.0.0-unstable`).

### 9) Describe the merge commit

```bash
DATE=$(date +%Y-%m-%d)
OSS_SHORT=$(jj log -r 'trunk@origin' --no-graph -T 'commit_id.shortest(8)')
jj describe -m "Merge OSS trunk (${OSS_SHORT}) into enterprise trunk

Merges spiceai/spiceai trunk as of ${DATE} into spicehq/spiceai trunk.
Includes runner name replacements and enterprise version preservation."
```

### 10) Create bookmark and push

```bash
DATE_SHORT=$(date +%y%m%d)
BOOKMARK="phillip/${DATE_SHORT}-oss-merge"

jj bookmark create "${BOOKMARK}"
jj git push --bookmark "${BOOKMARK}" --remote enterprise --allow-new
```

### 11) Create PR on enterprise repo

```bash
DATE=$(date +%Y-%m-%d)
OSS_SHORT=$(jj log -r 'trunk@origin' --no-graph -T 'commit_id.shortest(8)')

gh pr create \
  --repo spicehq/spiceai \
  --head "${BOOKMARK}" \
  --base trunk \
  --title "Merge OSS trunk (${OSS_SHORT}) — ${DATE}" \
  --body "## Automated OSS upstream merge

- **OSS trunk:** \`$(jj log -r 'trunk@origin' --no-graph -T 'commit_id.shortest(12)')\` (spiceai/spiceai)
- **Enterprise trunk:** \`$(jj log -r 'trunk@enterprise' --no-graph -T 'commit_id.shortest(12)')\` (spicehq/spiceai)
- **Date:** ${DATE}

### Changes applied
- Merged latest OSS trunk into enterprise trunk
- Runner names: \`spiceai-dev-runners\` → \`spicehq-dev-runners\`, \`spiceai-dev-large-runners\` → \`spicehq-dev-large-runners\`
- Enterprise version strings preserved (\`version.txt\`, \`Cargo.toml\`)
- \`Cargo.lock\` regenerated via \`cargo check -p runtime-async\`

### Conflict resolution
<describe any conflicts and how they were resolved, or 'No conflicts'>
" \
  --label "kind/upstream-merge"
```

### 12) Monitor CI

```bash
# Get the PR number from the previous step
gh pr checks --watch --repo spicehq/spiceai <PR_NUMBER>
```

If CI fails, fix issues in the same JJ change and push again:

```bash
jj git push --bookmark "${BOOKMARK}" --remote enterprise
```

### 13) Clean up

After the PR is merged:

- Release workspace in `WORKSPACES.md`.
- Update `WORK_IN_PROGRESS.md` if tracked.

## Troubleshooting

### Push rejected (workflow permissions)

If push fails with "refusing to allow a GitHub App to create or update workflow", you need to push with a token that has `workflows` permission, or push using SSH. This typically happens with CI bot tokens, not with personal `gh` auth.

### Bookmark already exists

```bash
jj bookmark delete "${BOOKMARK}"
jj bookmark create "${BOOKMARK}"
```

### Workspace is stale

```bash
jj workspace update-stale
```

### Cargo.lock won't regenerate cleanly

If `cargo check -p runtime-async` fails after restoring `Cargo.lock`:

```bash
jj restore --from trunk@origin Cargo.lock
cargo check -p runtime-async
```

If that also fails, try a full restore and build:

```bash
rm Cargo.lock
cargo generate-lockfile
```

## Quick Reference

| Item | OSS (origin) | Enterprise |
|------|-------------|------------|
| Repo | `spiceai/spiceai` | `spicehq/spiceai` |
| Remote | `origin` | `enterprise` |
| Branch | `trunk` | `trunk` |
| Version example | `2.0.0-unstable` | `2.0.0-enterprise-beta` |
| Runner (standard) | `spiceai-dev-runners` | `spicehq-dev-runners` |
| Runner (large) | `spiceai-dev-large-runners` | `spicehq-dev-large-runners` |
| PR label | — | `kind/upstream-merge` |
