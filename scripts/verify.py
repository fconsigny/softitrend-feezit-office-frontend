"""Verification locale reproductible ; aucune API réelle mutée."""
import datetime
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BUN = shutil.which("bun") or str(Path.home() / ".local/bin/bun")
env = os.environ.copy()
env["PATH"] = str(Path(BUN).parent) + os.pathsep + env.get("PATH", "")
commands = [
    [BUN, "install", "--frozen-lockfile"],
    [BUN, "--bun", "run", "test"],
    [BUN, "--bun", "run", "test:browser"],
    [BUN, "--bun", "run", "lint"],
    [BUN, "--bun", "run", "build"],
    [BUN, "audit"],
]
log = ROOT / "docs/evidence/verification.txt"
log.parent.mkdir(parents=True, exist_ok=True)
with log.open("w", encoding="utf-8") as output:
    output.write("Verification locale UTC : " + datetime.datetime.now(datetime.UTC).isoformat() + "\n")
    output.write("Fixtures HTTP uniquement dans les tests ; pas une integration backend reel.\n")
    for command in commands:
        heading = "\n$ " + " ".join(command) + "\n"
        print(heading, end="", flush=True)
        output.write(heading)
        result = subprocess.run(command, cwd=ROOT, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        print(result.stdout, end="", flush=True)
        output.write(result.stdout)
        output.write(f"\nexit_code={result.returncode}\n")
        output.flush()
        if result.returncode:
            sys.exit(result.returncode)
print("Verification reussie : " + str(log))
