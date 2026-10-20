#!/usr/bin/env python3
import sys, os, time, json, uuid

QUEUE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tracking", "queue"))
os.makedirs(QUEUE_DIR, exist_ok=True)

if len(sys.argv) < 3:
    print("Usage: dispatch.py <haiku|luna> <prompt>")
    sys.exit(1)

agent_type = sys.argv[1].lower()
prompt = sys.argv[2]
req_id = str(uuid.uuid4())[:8]

req_file = os.path.join(QUEUE_DIR, f"req_{req_id}.json")
resp_file = os.path.join(QUEUE_DIR, f"resp_{req_id}.json")

payload = {
    "id": req_id,
    "agent": agent_type,
    "prompt": prompt,
    "created_at": time.time()
}

with open(req_file + ".tmp", "w") as f:
    json.dump(payload, f)
os.rename(req_file + ".tmp", req_file)

# Wait for response (up to 180s)
start = time.time()
while time.time() - start < 180:
    if os.path.exists(resp_file):
        with open(resp_file, "r") as f:
            resp = json.load(f)
        try:
            os.remove(req_file)
            os.remove(resp_file)
        except OSError:
            pass
        if "error" in resp and resp["error"]:
            sys.stderr.write(f"Agent Error: {resp['error']}\n")
            sys.exit(1)
        print(resp.get("output", ""))
        sys.exit(0)
    time.sleep(0.5)

sys.stderr.write("Timed out waiting for agent response\n")
sys.exit(1)
