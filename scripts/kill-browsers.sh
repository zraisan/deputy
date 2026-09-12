#!/usr/bin/env bash
# Kill ONLY chromium instances this project spawned, identified by their profile
# directory. Never touches the user's own browser.
set -u
MARKER="deputy-test-profile"
pids=$(ps -eo pid,args | grep "[c]hromium" | grep -F -- "$MARKER" | awk '{print $1}')
if [ -z "$pids" ]; then echo "no deputy test browsers running"; exit 0; fi
echo "killing: $(echo "$pids" | tr '\n' ' ')"
for p in $pids; do kill -TERM "$p" 2>/dev/null; done
sleep 1
for p in $pids; do kill -KILL "$p" 2>/dev/null; done
echo "done"
