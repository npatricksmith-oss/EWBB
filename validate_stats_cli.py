#!/usr/bin/env python3
"""
CLI Statistical Engine Benchmark & Validation Runner for Earl Weaver Baseball (1987).
Executes `src/engine/statsValidator.js` across a 162-game season (directly in Node.js when
available, otherwise in headless Chrome) and prints a formatted comparison table of Simulated vs. Historical game data.
"""
import http.server
import threading
import json
import os
import shutil
import subprocess
import sys

def run_in_node(num_games):
    # The engine is pure JS with no DOM dependencies, so Node can import it directly (no server/browser,
    # which also lets it run inside agent sandboxes that block sockets)
    js = f'const m = await import("./src/engine/statsValidator.js"); console.log(JSON.stringify(m.runStatisticalValidation({num_games})));'
    proc = subprocess.run(["node", "--input-type=module", "-e", js], capture_output=True, text=True)
    if proc.returncode != 0:
        return {"error": proc.stderr.strip()}
    return json.loads(proc.stdout)

def run_in_chrome(num_games):
    result_data = None
    done_event = threading.Event()

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

        def do_GET(self):
            if self.path == "/__bench__":
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                html = f"""<!DOCTYPE html><script>
                (async () => {{
                  try {{
                    const mod = await import("./src/engine/statsValidator.js");
                    const report = mod.runStatisticalValidation({num_games});
                    await fetch("/__report__", {{ method: "POST", body: JSON.stringify(report) }});
                  }} catch (e) {{
                    await fetch("/__report__", {{ method: "POST", body: JSON.stringify({{ error: String(e && e.stack || e) }}) }});
                  }}
                }})();
                </script>"""
                self.wfile.write(html.encode())
                return
            return super().do_GET()

        def do_POST(self):
            nonlocal result_data
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode()
            result_data = json.loads(body)
            self.send_response(200)
            self.end_headers()
            done_event.set()

    server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_port
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    # Inside a toolbox/distrobox, Flatpak Chrome lives on the host; containers share the host network
    host_prefix = ["flatpak-spawn", "--host"] if os.path.exists("/run/.containerenv") else []
    proc = subprocess.Popen(
        host_prefix + ["flatpak", "run", "com.google.Chrome", "--headless", "--no-sandbox", "--disable-gpu", f"http://127.0.0.1:{port}/__bench__"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    done_event.wait(timeout=30)
    proc.terminate()
    return result_data

def main():
    num_games = int(sys.argv[1]) if len(sys.argv) > 1 else 162
    result_data = run_in_node(num_games) if shutil.which("node") else run_in_chrome(num_games)

    if not result_data or "error" in result_data:
        print("ERROR:", result_data)
        sys.exit(1)

    print(f"=== EARL WEAVER BASEBALL (1987) — {result_data['numGames']}-GAME STATISTICAL VALIDATION ({result_data['elapsedMs']} ms) ===")
    for tkey, t in result_data["teams"].items():
        s = t["sim"]
        a = t["actual"]
        print(f"\nTEAM: {tkey.upper()} ({t['W']}-{t['L']}, {t['runsPerGame']} R/G)")
        print(f"  SIMULATED : BA {s['BA']:.3f} | OBA {s['OBA']:.3f} | SA {s['SA']:.3f} | BB% {s['BBPct']:4.1f}% | SO% {s['SOPct']:4.1f}% | HR/162: {s['HRPer162']:3d} | 2B: {t['d2B']:3d} | 3B: {t['d3B']:2d}")
        print(f"  HISTORICAL: BA {a['BA']:.3f} | OBA {a['OBA']:.3f} | SA {a['SA']:.3f} | BB% {a['BBPct']:4.1f}% | SO% {a['SOPct']:4.1f}% | HR/162: {a['HRPer162']:3d}")

    print("\nPLAYER-BY-PLAYER COMPARISON (Per 600 AB Rates for 2B/HR):")
    print(f"{'Player':18s} | {'Tm':3s} | {'SIM BA/OBA/SA':19s} | {'ACT BA/OBA/SA':19s} | {'Diff BA / OBA / SA':21s} | {'SIM 2B/3B/HR':12s} | {'ACT 2B/HR':9s}")
    print("-" * 112)
    for p in result_data["players"]:
        s = p["sim"]
        a = p["actual"]
        d = p["diff"]
        tm = p["teamId"][:3].upper()
        print(
            f"{p['name']:18s} | {tm:3s} | "
            f"{s['BA']:.3f}/{s['OBA']:.3f}/{s['SA']:.3f} | "
            f"{a['BA']:.3f}/{a['OBA']:.3f}/{a['SA']:.3f} | "
            f"{d['BA']:+.3f}/{d['OBA']:+.3f}/{d['SA']:+.3f} | "
            f"{s['d2B600']:2d} / {p['d3B']:2d} / {s['HR600']:2d} | "
            f"{a['d2B600']:2d} / {a['HR600']:2d}"
        )

if __name__ == "__main__":
    main()
