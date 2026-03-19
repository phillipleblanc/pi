---
name: cmux-terminal
description: Manage terminal sessions with cmux as a replacement for tmux. Create workspaces, panes, tabs, read screen output, send commands, and use sidebar status/progress/logging. Use when you need to run background processes, monitor long-running commands, launch parallel tasks, or orchestrate multi-terminal workflows.
---

# cmux Terminal Management

cmux is a native terminal (built on Ghostty) with a CLI for programmatic control via Unix socket. It replaces tmux for all terminal multiplexing needs. Unlike tmux, cmux uses the native terminal renderer — no re-emulation, no detach/attach, no TERM quirks.

## Core Concepts

### Hierarchy

```
Window (OS window)
└── Workspace (vertical tab in the sidebar, like a tmux session)
    └── Pane (a split region, like a tmux pane)
        └── Surface (a tab within a pane — terminal or browser)
```

- **Window**: A macOS window. Usually just one.
- **Workspace**: Shown as vertical tabs in the left sidebar. The primary unit of organization (analogous to a tmux session).
- **Pane**: A split region inside a workspace. Panes tile left/right/up/down.
- **Surface**: A tab within a pane. Each surface is a terminal (or browser). A pane can have multiple surfaces as tabs.

### Referencing Objects

Commands accept three formats for IDs:
- **Refs**: `workspace:1`, `pane:3`, `surface:5` (stable short refs)
- **UUIDs**: Full UUIDs (from env vars or `--id-format uuids`)
- **Indexes**: Numeric index (0-based)

Use `--id-format both` on list commands to see refs and UUIDs together.

### Environment Variables

cmux auto-sets these in every terminal it spawns:
- `CMUX_WORKSPACE_ID` — UUID of the containing workspace
- `CMUX_SURFACE_ID` — UUID of the current surface
- `CMUX_TAB_ID` — UUID of the current tab

Commands default to the caller's workspace/surface when flags are omitted, so commands run inside a cmux terminal "just work" without explicit IDs.

---

## Quick Reference: tmux → cmux

| tmux | cmux |
|------|------|
| `tmux new-session -d -s NAME` | `cmux new-workspace [--cwd PATH]` then `cmux rename-workspace --workspace REF "NAME"` |
| `tmux new-session -d -s NAME -c DIR` | `cmux new-workspace --cwd DIR` + rename |
| `tmux send-keys -t SESSION "cmd" Enter` | `cmux send --workspace REF "cmd"` + `cmux send-key --workspace REF enter` |
| `tmux send-keys -t SESSION C-c` | `cmux send-key --workspace REF ctrl+c` |
| `tmux capture-pane -t SESSION -p` | `cmux read-screen --workspace REF --lines N` |
| `tmux capture-pane -t SESSION -p -S -500` | `cmux read-screen --workspace REF --scrollback --lines 500` |
| `tmux split-window -h` | `cmux new-split right --workspace REF` |
| `tmux split-window -v` | `cmux new-split down --workspace REF` |
| `tmux kill-session -t NAME` | `cmux close-workspace --workspace REF` |
| `tmux list-sessions` | `cmux list-workspaces` |
| `tmux list-windows -t SESSION` | `cmux list-panes --workspace REF` |
| `tmux list-panes -t SESSION` | `cmux list-pane-surfaces --workspace REF` |
| `tmux select-window -t SESSION:N` | `cmux select-workspace --workspace REF` |
| `tmux resize-pane -R 10` | `cmux resize-pane --pane REF -R --amount 10` |
| `tmux swap-pane` | `cmux swap-pane --pane REF --target-pane REF` |
| N/A | `cmux tree --all` (full hierarchy view) |
| N/A | `cmux notify --title "Done" --body "Task finished"` |
| N/A | `cmux set-status KEY VALUE --icon EMOJI` |
| N/A | `cmux set-progress 0.75 --label "Building..."` |
| N/A | `cmux log --level info -- "message"` |

---

## Common Operations

### Inspect Current State

```bash
# Full hierarchy of all windows/workspaces/panes/surfaces
cmux tree --all

# List workspaces (like tmux list-sessions)
cmux list-workspaces

# Show current workspace/surface identity
cmux identify

# Show surfaces in a workspace (like tmux list-panes)
cmux list-panels --workspace workspace:N
```

### Create a Workspace and Run a Command

```bash
# Create workspace in a specific directory
cmux new-workspace --cwd ~/code/myproject
# Returns: OK workspace:N

# Rename it
cmux rename-workspace --workspace workspace:N "my-task"

# Send a command to it
cmux send --workspace workspace:N 'make build'
cmux send-key --workspace workspace:N enter

# Wait and read output
sleep 3
cmux read-screen --workspace workspace:N --lines 50
```

### Create a Workspace with Initial Command

```bash
# Create and immediately run a command
cmux new-workspace --cwd ~/code/myproject --command "make build"
```

### Read Screen Output

```bash
# Read last N lines of visible screen
cmux read-screen --workspace workspace:N --lines 30

# Read including scrollback history
cmux read-screen --workspace workspace:N --scrollback --lines 500

# Read a specific surface (when workspace has multiple tabs/panes)
cmux read-screen --workspace workspace:N --surface surface:M --lines 50
```

### Send Text and Keys

```bash
# Send text (does NOT press enter)
cmux send --workspace workspace:N 'echo hello'

# Press enter
cmux send-key --workspace workspace:N enter

# Send Ctrl+C to interrupt
cmux send-key --workspace workspace:N ctrl+c

# Send to a specific surface
cmux send --workspace workspace:N --surface surface:M 'command'
cmux send-key --workspace workspace:N --surface surface:M enter
```

### Create Splits (Multiple Panes)

```bash
# Split right (vertical split)
cmux new-split right --workspace workspace:N
# Returns: OK surface:M workspace:N

# Split down (horizontal split)
cmux new-split down --workspace workspace:N

# Split a specific pane
cmux new-split right --workspace workspace:N --pane pane:P
```

### Create Tabs (Multiple Surfaces in a Pane)

```bash
# Add a new terminal tab to a pane
cmux new-surface --type terminal --pane pane:P --workspace workspace:N
# Returns: OK surface:M pane:P workspace:N
```

### Close and Clean Up

```bash
# Close a single surface (tab)
cmux close-surface --surface surface:M --workspace workspace:N

# Close an entire workspace
cmux close-workspace --workspace workspace:N

# Close a window
cmux close-window --window window:N
```

### Focus and Navigate

```bash
# Switch to a workspace
cmux select-workspace --workspace workspace:N

# Focus a specific pane
cmux focus-pane --pane pane:P --workspace workspace:N

# Navigate between workspaces
cmux next-window
cmux previous-window
cmux last-window
cmux last-pane --workspace workspace:N
```

### Search

```bash
# Find workspaces by name or content
cmux find-window "search-term"
cmux find-window --content "search-term"

# Find and select
cmux find-window --select "search-term"
```

---

## Sidebar Features (Status, Progress, Logging)

cmux has a built-in sidebar per workspace that can show status, progress, and logs. These are visible in the workspace's sidebar panel in the UI.

### Status Key-Value Pairs

```bash
# Set a status entry (shown in sidebar)
cmux set-status "task" "Building runtime" --icon "🔨" --workspace workspace:N
cmux set-status "branch" "feature/xyz" --icon "🌿" --color "#00FF00" --workspace workspace:N

# Clear a status entry
cmux clear-status "task" --workspace workspace:N

# List all status entries
cmux list-status --workspace workspace:N
```

### Progress Bar

```bash
# Set progress (0.0 to 1.0)
cmux set-progress 0.5 --label "Running tests..." --workspace workspace:N

# Clear progress
cmux clear-progress --workspace workspace:N
```

### Log Messages

```bash
# Add log entries
cmux log --level info --source "build" --workspace workspace:N -- "Compilation started"
cmux log --level error --source "test" --workspace workspace:N -- "Test failed: test_foo"

# List log entries
cmux list-log --limit 20 --workspace workspace:N

# Clear log
cmux clear-log --workspace workspace:N
```

### Full Sidebar State

```bash
cmux sidebar-state --workspace workspace:N
```

---

## Notifications

```bash
# Desktop notification
cmux notify --title "Build Complete" --body "All tests passed" --workspace workspace:N

# List notifications
cmux list-notifications

# Clear notifications
cmux clear-notifications
```

---

## Synchronization (wait-for)

Coordinate between workspaces/processes:

```bash
# In one terminal: wait for a signal (blocks up to timeout)
cmux wait-for "build-done" --timeout 60

# In another terminal: signal it
cmux wait-for --signal "build-done"
```

---

## Clipboard Buffers

```bash
# Store text in a named buffer
cmux set-buffer --name "output" "some captured text"

# List buffers
cmux list-buffers

# Paste a buffer into a surface
cmux paste-buffer --name "output" --workspace workspace:N --surface surface:M
```

---

## Patterns for Agent Workflows

### Pattern: Launch a Background Process and Monitor It

Replace the tmux pattern of `tmux new-session -d -s NAME -c DIR` + `tmux send-keys`:

```bash
# Create workspace
WS_REF=$(cmux new-workspace --cwd ~/code/myproject 2>/dev/null | awk '{print $2}')
cmux rename-workspace --workspace "$WS_REF" "spiced-test"

# Start process
cmux send --workspace "$WS_REF" '~/.spice/bin/spiced'
cmux send-key --workspace "$WS_REF" enter

# Wait and check output
sleep 3
cmux read-screen --workspace "$WS_REF" --lines 50
# Look for "Spice runtime is ready!"

# Later: stop process
cmux send-key --workspace "$WS_REF" ctrl+c

# Clean up
cmux close-workspace --workspace "$WS_REF"
```

### Pattern: Run a Command and Capture Output

```bash
# Send command
cmux send --workspace workspace:N 'cargo test --package mypackage 2>&1'
cmux send-key --workspace workspace:N enter

# Wait for completion
sleep 10

# Capture output
cmux read-screen --workspace workspace:N --scrollback --lines 200
```

### Pattern: Parallel Builds in Splits

```bash
# Create workspace
cmux new-workspace --cwd ~/code/project
# workspace:N created

# Split right for second build
cmux new-split right --workspace workspace:N
# surface:M created

# Run builds in parallel
cmux send --workspace workspace:N --surface surface:FIRST 'make build-frontend'
cmux send-key --workspace workspace:N --surface surface:FIRST enter

cmux send --workspace workspace:N --surface surface:M 'make build-backend'
cmux send-key --workspace workspace:N --surface surface:M enter
```

### Pattern: Launch pi in a Workspace

Replace `tmux new-session -d -s pi-task 'cd DIR && pi'`:

```bash
# Create workspace
cmux new-workspace --cwd ~/code/spiceai/fix-1234

# Get the ref from list
cmux list-workspaces
# workspace:N  ~/code/spiceai/fix-1234

# Rename it
cmux rename-workspace --workspace workspace:N "pi-fix-1234"

# Launch pi
cmux send --workspace workspace:N 'pi'
cmux send-key --workspace workspace:N enter

# Send initial prompt
sleep 2
cmux send --workspace workspace:N 'Fix issue #1234: <description>'
cmux send-key --workspace workspace:N enter
```

### Pattern: Open a Directory as a New Workspace (Shorthand)

```bash
# Simplest way — opens a directory as a new workspace
cmux ~/code/myproject
```

This launches cmux (if not running) and opens the directory in a new workspace.

---

## Tips

- **No detach/attach**: cmux doesn't have tmux's detach model. Workspaces persist as long as cmux is running. There's no `tmux attach`.
- **Refs are stable**: `workspace:1`, `surface:5` etc. remain stable during a session. Use `cmux tree --all` to discover current refs.
- **Default targeting**: When running inside a cmux terminal, omit `--workspace` and `--surface` to target the current one (uses env vars).
- **`send` doesn't press enter**: Always follow `cmux send` with `cmux send-key ... enter` unless you intentionally don't want to execute.
- **Read-screen returns plain text**: No escape codes — ideal for parsing output programmatically.
- **Use `tree`**: `cmux tree --all` is the best way to understand the current layout.
- **Browser surfaces**: cmux can embed browser panes (`cmux new-pane --type browser --url URL`). Useful for viewing docs or dashboards alongside terminals.
- **Markdown viewer**: `cmux markdown open FILE.md` opens a formatted markdown viewer panel with live reload.
