#!/usr/bin/env bash
# Poll every live lyra2-palm-house container for GPU / CPU / RAM usage and append to resources.csv.
# Usage: bash watch_resources.sh [interval_seconds]   (stops by itself when no containers are left)
# Notes: `free` is not in the image and /proc/loadavg reads 0 inside Modal's sandbox, so CPU and RAM
# come from psutil (installed with Lyra's requirements); GPU numbers come from nvidia-smi.
cd "$(dirname "$0")"
INTERVAL=${1:-30}
OUT=resources.csv
[ -f "$OUT" ] || echo "time,container,gpu_util_pct,gpu_mem_used_mib,gpu_mem_total_mib,gpu_power_w,cpu_pct,ram_used_mib,ram_total_mib" > "$OUT"
PROBE='import subprocess as s, psutil as p
g = s.run(["nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total,power.draw", "--format=csv,noheader,nounits"], capture_output=True, text=True).stdout.splitlines()[0].replace(" ", "")
m = p.virtual_memory()
print(f"{g},{p.cpu_percent(interval=1)},{(m.total - m.available) >> 20},{m.total >> 20}")'
while true; do
  ids=$(uvx --quiet modal container list --json 2>/dev/null | python3 -c "
import sys, json
for c in json.load(sys.stdin):
    if c.get('app_name') == 'lyra2-palm-house': print(c['container_id'])")
  [ -z "$ids" ] && { echo "no containers left, stopping"; exit 0; }
  for id in $ids; do
    line=$(timeout 30 uvx --quiet modal container exec "$id" -- python -c "$PROBE" </dev/null 2>/dev/null | tail -1)
    [ -n "$line" ] && echo "$(date +%H:%M:%S),${id: -6},$line" | tee -a "$OUT"
  done
  sleep "$INTERVAL"
done
