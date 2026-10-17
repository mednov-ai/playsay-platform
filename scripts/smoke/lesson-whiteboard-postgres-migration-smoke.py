#!/usr/bin/env python3
"""Check the real PostgreSQL 17 migration in a new local cluster; never connects to a contour."""
import os
import shutil
import socket
import subprocess
import tempfile
from pathlib import Path

repo = Path(__file__).resolve().parents[2]
configured = os.environ.get("WHITEBOARD_POSTGRES_BIN")
pg_bin = None
candidates = [Path(configured)] if configured else [
    Path("/opt/homebrew/opt/postgresql@17/bin"),
    Path(shutil.which("pg_ctl")).parent if shutil.which("pg_ctl") else None,
]
for candidate in candidates:
    if candidate and (candidate / "postgres").is_file():
        version = subprocess.check_output([candidate / "postgres", "--version"], text=True)
        if " 17." in version:
            pg_bin = candidate
            break
if pg_bin is None:
    raise SystemExit("This fixture requires local PostgreSQL 17; set WHITEBOARD_POSTGRES_BIN to its bin directory.")
root = Path(tempfile.mkdtemp(prefix="honey-whiteboard-pg-"))
with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    port = listener.getsockname()[1]
started = False
try:
    with (root / "init.log").open("w") as log:
        subprocess.run([pg_bin / "initdb", "-D", root / "data", "-A", "trust", "-U", "whiteboard_fixture", "--no-locale", "--encoding=UTF8"], stdout=log, stderr=subprocess.STDOUT, check=True)
        subprocess.run([pg_bin / "pg_ctl", "-D", root / "data", "-l", root / "postgres.log", "-o", f"-h 127.0.0.1 -p {port} -F -c max_connections=8 -c shared_buffers=16MB", "-w", "start"], stdout=log, stderr=subprocess.STDOUT, check=True)
    started = True
    environment = {**os.environ, "WHITEBOARD_TEST_POSTGRES_URL": f"jdbc:postgresql://127.0.0.1:{port}/postgres?user=whiteboard_fixture"}
    subprocess.run(["gradle", "-p", "backend", ":api-gateway:cleanTest", ":api-gateway:test", "--tests", "com.playsay.gateway.LessonWhiteboardPostgresMigrationTest", "--offline", "--no-daemon", "--console=plain"], cwd=repo, env=environment, check=True)
    print("PostgreSQL 17: native migration, malformed provenance, repeat/backfill and manual choice checks passed.")
finally:
    if started:
        subprocess.run([pg_bin / "pg_ctl", "-D", root / "data", "-m", "fast", "-w", "stop"], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, check=True)
    shutil.rmtree(root)
