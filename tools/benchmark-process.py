#!/usr/bin/env python3
"""Measure a single child's wall time and OS peak RSS; preserve stdout/stderr.

Linux ru_maxrss is KiB, macOS ru_maxrss is bytes. The parent is not measured.
No shell or time(1) wrapper is part of the timed child command.
"""
import json
import os
import subprocess
import sys
import threading
import time


def measure(spec):
    if not hasattr(os, "wait4") or sys.platform not in ("darwin", "linux"):
        raise RuntimeError("This measurement requires macOS/Linux wait4 rusage")
    with open(spec["stdoutFile"], "wb") as out, open(spec["stderrFile"], "wb") as err:
        inp = open(spec["inputFile"], "rb") if spec.get("inputFile") else open(os.devnull, "rb")
        try:
            start = time.perf_counter_ns()
            process = subprocess.Popen(spec["command"], cwd=spec["cwd"], stdin=inp, stdout=out, stderr=err)
            timed_out = threading.Event()
            def terminate():
                timed_out.set()
                try:
                    process.kill()
                except ProcessLookupError:
                    pass
            timer = threading.Timer(spec.get("timeoutSeconds", 600), terminate)
            timer.start()
            try:
                _, status, usage = os.wait4(process.pid, 0)
                elapsed = time.perf_counter_ns() - start
                process.returncode = os.waitstatus_to_exitcode(status)
            finally:
                timer.cancel()
            result = {"wallNs": elapsed, "maxRSSBytes": int(usage.ru_maxrss) * (1024 if sys.platform == "linux" else 1),
                      "userSeconds": usage.ru_utime, "systemSeconds": usage.ru_stime,
                      "exitCode": process.returncode, "timedOut": timed_out.is_set()}
            if result["maxRSSBytes"] <= 0:
                raise RuntimeError("OS did not report a usable child peak RSS")
            return result
        finally:
            inp.close()


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as f:
        print(json.dumps(measure(json.load(f))))
