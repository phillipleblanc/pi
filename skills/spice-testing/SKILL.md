---
name: spice-testing
description: Run and test Spice runtime with custom spicepods using tmux. Use when you need to start spiced, run SQL queries, or test Spice scenarios interactively.
---

# Spice Testing with tmux

This skill teaches how to set up test scenarios for Spice runtime and run queries against them.

## Directory Convention

Create test directories in `~/code/spicepod_test/` with the naming pattern:
```
YYMMDD-description
```

Examples:
- `260129-skill-test`
- `260121-distributed-query`
- `260128-udtf-list-udfs`

Each directory should contain:
- `spicepod.yaml` - The Spicepod configuration
- Any data files referenced by the spicepod (CSV, Parquet, etc.)

## Building Spice

Before running spiced, build the CLI and runtime from the current Spice repo:

```bash
make install-dev
```

This installs binaries to `~/.spice/bin/`.

Alternatively, use binaries directly from the build directory:
```bash
./target/debug/spiced
./target/debug/spice
```

## Starting spiced with tmux

Start spiced in a tmux session with the working directory set to your test directory:

```bash
# Kill any existing session
tmux kill-session -t spiced-test 2>/dev/null || true

# Start new session in the test directory
tmux new-session -d -s spiced-test -c /path/to/test/directory
tmux send-keys -t spiced-test "~/.spice/bin/spiced" Enter

# Wait for startup and check output
sleep 3
tmux capture-pane -t spiced-test -p
```

Look for "Spice runtime is ready!" to confirm successful startup.

## Running SQL Queries

Use `spice sql` with queries piped to stdin:

```bash
echo "SELECT * FROM my_table;" | ~/.spice/bin/spice sql
```

For multiple queries:
```bash
echo "SELECT COUNT(*) FROM my_table; SELECT * FROM my_table LIMIT 5;" | ~/.spice/bin/spice sql
```

## Checking spiced Output

View the tmux pane contents:
```bash
tmux capture-pane -t spiced-test -p
```

To capture more history:
```bash
tmux capture-pane -t spiced-test -p -S -100
```

## Stopping spiced

Kill the tmux session:
```bash
tmux kill-session -t spiced-test
```

Or send Ctrl+C:
```bash
tmux send-keys -t spiced-test C-c
```

## Example Workflow

1. Create test directory and spicepod:

```bash
mkdir -p ~/code/spicepod_test/260129-my-test
```

2. Create spicepod.yaml:

```yaml
version: v1
kind: Spicepod
name: my-test

datasets:
  - from: file:data.csv
    name: my_data
    params:
      file_format: csv
```

3. Create test data:

```csv
id,name,value
1,alice,100
2,bob,200
```

4. Build and start:

```bash
make install-dev
tmux kill-session -t spiced-test 2>/dev/null || true
tmux new-session -d -s spiced-test -c ~/code/spicepod_test/260129-my-test
tmux send-keys -t spiced-test "~/.spice/bin/spiced" Enter
sleep 3
tmux capture-pane -t spiced-test -p
```

5. Query:

```bash
echo "SELECT * FROM my_data;" | ~/.spice/bin/spice sql
```

6. Clean up:

```bash
tmux kill-session -t spiced-test
```

## Troubleshooting

### Check if spiced is running
```bash
pgrep -fl spiced
```

### View runtime logs
```bash
tmux capture-pane -t spiced-test -p -S -500
```

### Port already in use
Kill existing spiced processes:
```bash
pkill -f spiced
```

### Session doesn't exist
The session may have crashed. Check if spiced exited:
```bash
tmux list-sessions | grep spiced-test
```
