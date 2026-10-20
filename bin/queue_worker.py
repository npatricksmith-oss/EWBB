#!/usr/bin/env python3
import sys, os, time, json, subprocess, glob

PROJECT_DIR = "/var/home/natex/Projects/EWBB"
QUEUE_DIR = os.path.join(PROJECT_DIR, "tracking", "queue")
os.makedirs(QUEUE_DIR, exist_ok=True)

print("Starting Agent Queue Worker...", flush=True)

while True:
    req_files = sorted(glob.glob(os.path.join(QUEUE_DIR, "req_*.json")))
    for req_file in req_files:
        try:
            with open(req_file, "r") as f:
                req = json.load(f)
        except Exception:
            continue

        req_id = req["id"]
        agent = req["agent"]
        prompt = req["prompt"]
        resp_file = os.path.join(QUEUE_DIR, f"resp_{req_id}.json")

        print(f"Processing request {req_id} for agent {agent}...", flush=True)

        output = ""
        error = None

        try:
            if agent in ["haiku", "claude-haiku", "claude-haiku-5-5"]:
                cmd = [
                    "claude", "-p", prompt,
                    "--dangerously-skip-permissions",
                    "--model", "claude-haiku-5-5"
                ]
                proc = subprocess.run(
                    cmd, cwd=PROJECT_DIR, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=300
                )
                output = proc.stdout
                if proc.returncode != 0 and not output:
                    error = proc.stderr
            elif agent in ["luna", "codex-luna", "codex"]:
                cmd = [
                    "/var/home/natex/.local/bin/codex", "exec",
                    "-m", "gpt-6-luna",
                    prompt
                ]
                proc = subprocess.run(
                    cmd, cwd=PROJECT_DIR, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=300
                )
                output = proc.stdout
                if proc.returncode != 0 and not output:
                    error = proc.stderr
            else:
                error = f"Unknown agent: {agent}"
        except Exception as e:
            error = str(e)

        resp_payload = {
            "id": req_id,
            "agent": agent,
            "output": output,
            "error": error
        }

        with open(resp_file + ".tmp", "w") as f:
            json.dump(resp_payload, f)
        os.rename(resp_file + ".tmp", resp_file)
        print(f"Finished request {req_id}.", flush=True)

    time.sleep(0.5)
