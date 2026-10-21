#!/usr/bin/env python3
"""Runs key sequences through a real, interactive Vim (in a pty) and reports the final state.

Development tool only: it is used to (re)generate the committed oracle fixtures that the
Vim engine is tested against. CI never needs Vim.

stdin : {"cases": [{"id": str, "lines": [str], "line": int, "col": int, "chunks": [str]}]}
        `line`/`col` are 0-based; `chunks` are raw byte strings, written one at a time
        (Escape is always its own chunk so Vim never mistakes it for an escape sequence).
stdout: {"version": str, "results": {id: {"lines", "line", "col", "register", "registerType"} | {"error"}}}
"""
import fcntl
import json
import os
import pty
import select
import signal
import struct
import subprocess
import sys
import tempfile
import termios
import threading
import time
from concurrent.futures import ThreadPoolExecutor

CHUNK_DELAY = 0.012
STATE_EXPR = (
    "json_encode({'lines': getline(1, '$'), 'line': line('.') - 1, 'col': col('.') - 1,"
    " 'register': getreg('\"'), 'registerType': getregtype('\"')})"
)


def run_case(case):
    workdir = tempfile.mkdtemp(prefix="vim-oracle-")
    text_path = os.path.join(workdir, "buffer.txt")
    out_path = os.path.join(workdir, "out.json")
    ready_path = os.path.join(workdir, "ready")
    with open(text_path, "w") as handle:
        handle.write("\n".join(case["lines"]) + "\n")

    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
    env = dict(os.environ, TERM="xterm", LINES="40", COLUMNS="120", VIMINIT="", HOME=workdir)
    proc = subprocess.Popen(
        [
            "vim", "-u", "NONE", "-i", "NONE", "-N", "-n",
            "-c", "set ttimeout ttimeoutlen=5 nowrap noshowcmd",
            "-c", "call cursor(%d, %d)" % (case["line"] + 1, case["col"] + 1),
            "-c", "call writefile(['ready'], '%s')" % ready_path,
            text_path,
        ],
        stdin=slave, stdout=slave, stderr=slave, env=env, start_new_session=True, close_fds=True,
    )
    os.close(slave)

    stop = threading.Event()

    def drain():
        while not stop.is_set():
            ready, _, _ = select.select([master], [], [], 0.05)
            if ready:
                try:
                    if not os.read(master, 65536):
                        return
                except OSError:
                    return

    reader = threading.Thread(target=drain, daemon=True)
    reader.start()

    def send(data):
        os.write(master, data.encode("latin-1"))
        time.sleep(CHUNK_DELAY)

    try:
        for _ in range(200):  # wait until Vim is up and has placed the cursor
            if os.path.exists(ready_path):
                break
            time.sleep(0.025)
        else:
            return {"error": "Vim did not start"}
        time.sleep(0.05)
        for chunk in case["chunks"]:
            send(chunk)
        send("\x1b")  # cancel any pending command; cases end in NORMAL mode
        send(":call writefile([%s], '%s')\r" % (STATE_EXPR, out_path))
        for _ in range(120):  # Vim may still be writing: only accept complete JSON
            try:
                with open(out_path) as handle:
                    return json.loads(handle.read())
            except (OSError, ValueError):
                time.sleep(0.05)
        return {"error": "timeout waiting for Vim"}
    finally:
        stop.set()
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        proc.wait()
        os.close(master)


def run_agreed(case):
    """Runs a case until two runs agree, so a dropped or reordered key can never become a fixture."""
    seen = []
    for _ in range(5):
        try:
            result = run_case(case)
        except Exception as error:  # one bad case must not abort the whole batch
            result = {"error": repr(error)}
        if "error" not in result:
            if result in seen:
                return result
            seen.append(result)
    return {"error": "no two runs agreed: %s" % json.dumps(seen)}


def main():
    payload = json.load(sys.stdin)
    version = subprocess.run(["vim", "--version"], capture_output=True, text=True).stdout.splitlines()[0]
    with ThreadPoolExecutor(max_workers=8) as pool:
        outputs = list(pool.map(run_agreed, payload["cases"]))
    json.dump(
        {"version": version, "results": {c["id"]: r for c, r in zip(payload["cases"], outputs)}},
        sys.stdout,
    )


if __name__ == "__main__":
    main()
