#!/usr/bin/env python3
"""Capture Deluge-authored preset XML by making DelugEmu load a preset and save it back.

One job = one emulator run on a tiny SD card holding exactly one preset (plus the
samples it references). The Deluge's boot song loads the first synth in SYNTHS/,
so the preset is already loaded when the firmware is up. Then:

  hold SAVE + press SYNTH (or KIT)  -> save-preset UI, name pre-filled
  SELECT                            -> save
  SELECT                            -> confirm the one-option "overwrite" menu

The emulator writes the card back to the `_rw` folder on a clean (QMP `quit`)
exit, so the preset file is now the firmware's own serialisation of what it
loaded. Files the firmware writes carry a 1969-12-31 timestamp (no RTC).

Jobs:
  init                  empty SYNTHS/: the firmware builds its built-in default
                        synth (Song::setupDefault -> setupAsDefaultSynth, named
                        "0") and we save it as SYNTHS/0.XML
  synth:<path-on-card>  load that synth preset and save over it
  kit:<path-on-card>    load that kit (KIT button loads the first kit) and save

Usage:
  emu_fixtures.py --fw <deluge.bin> [--src-sd DIR] [--out DIR] [--work DIR]
                  [--boot-wait SECONDS] JOB...

Requires /Applications/DelugEmu.app. Refuses to start if a qemu-system-arm is
already running (a running emulator would clobber the card on its exit).
"""
import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time

APP = "/Applications/DelugEmu.app/Contents/MacOS/DelugEmu"
LOG = os.path.expanduser("~/Library/Application Support/DelugEmu/delugemu.log")
DEFAULT_SRC_SD = os.path.expanduser("~/Library/Application Support/DelugEmu/sdcard_rw")
QMP = "/tmp/dz_fx_qmp.sock"  # unix socket paths must stay short


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def sample_paths(xml_path):
    txt = open(xml_path, encoding="utf-8", errors="replace").read()
    paths = set(re.findall(r'fileName="([^"]+)"', txt))
    paths |= set(re.findall(r"<fileName>([^<]+)</fileName>", txt))
    return sorted(p for p in paths if p.strip())


def build_sd(sd, src_sd, job):
    """Fresh card folder with SETTINGS/, the one preset, and its samples."""
    if os.path.exists(sd):
        shutil.rmtree(sd)
    for d in ("SYNTHS", "KITS", "SONGS"):
        os.makedirs(os.path.join(sd, d))
    if os.path.isdir(os.path.join(src_sd, "SETTINGS")):
        shutil.copytree(os.path.join(src_sd, "SETTINGS"), os.path.join(sd, "SETTINGS"))
    if job["kind"] == "init":
        return None
    src = os.path.join(src_sd, job["file"])
    folder = "SYNTHS" if job["kind"] == "synth" else "KITS"
    dst = os.path.join(sd, folder, os.path.basename(job["file"]))
    shutil.copy2(src, dst)
    # Give the input a fresh mtime. The launcher's write-back is `rsync -a`, whose quick check
    # skips files whose size and mtime are unchanged: an input that already carried the
    # firmware's 1969 stamp and came back the same size would silently keep its OLD bytes.
    # A current mtime also makes the 1969 check below prove the firmware really wrote it.
    os.utime(dst, None)
    missing = []
    for p in sample_paths(src):
        s = os.path.join(src_sd, p)
        if not os.path.exists(s):
            missing.append(p)
            continue
        d = os.path.join(sd, p)
        os.makedirs(os.path.dirname(d), exist_ok=True)
        shutil.copy2(s, d)
    if missing:
        log("WARNING samples missing from the source card:", missing)
    return dst


class Qmp:
    def __init__(self, path):
        self.s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.s.connect(path)
        self.f = self.s.makefile("rw")
        self.f.readline()  # greeting
        self.cmd({"execute": "qmp_capabilities"})

    def cmd(self, obj):
        self.f.write(json.dumps(obj) + "\n")
        self.f.flush()
        while True:
            line = self.f.readline()
            if not line:
                return None
            r = json.loads(line)
            if "event" in r:
                continue
            return r

    def key(self, qcode, down):
        return self.cmd({"execute": "input-send-event", "arguments": {"events": [
            {"type": "key", "data": {"down": down, "key": {"type": "qcode", "data": qcode}}}]}})

    def press(self, qcode, hold=0.08):
        self.key(qcode, True)
        time.sleep(hold)
        self.key(qcode, False)

    def shot(self, shots_dir, name):
        """Screendump the panel; also crop the OLED so it can be read at a glance."""
        os.makedirs(shots_dir, exist_ok=True)
        name = re.sub(r"[^A-Za-z0-9._-]+", "_", name)  # screendump splits its argument on spaces
        ppm = os.path.join(shots_dir, name + ".ppm")
        png = os.path.join(shots_dir, name + ".png")
        self.cmd({"execute": "human-monitor-command",
                  "arguments": {"command-line": f"screendump {ppm}"}})
        time.sleep(0.5)
        subprocess.run(["sips", "-s", "format", "png", ppm, "--out", png], capture_output=True)
        subprocess.run(["sips", "-c", "260", "1000", "--cropOffset", "150", "630", png,
                        "--out", os.path.join(shots_dir, name + "-oled.png")], capture_output=True)
        os.remove(ppm)
        return png

    def quit(self):
        try:
            self.cmd({"execute": "quit"})
        except Exception:
            pass


def wait_for(pred, timeout, what):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if pred():
            return True
        time.sleep(1)
    raise TimeoutError(what)


def launched():
    try:
        return "Launching deluge machine" in open(LOG, errors="replace").read()
    except FileNotFoundError:
        return False


def qmp_up():
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.connect(QMP)
        s.close()
        return True
    except OSError:
        return False


def parse_job(spec):
    if spec == "init":
        return {"name": "init", "kind": "init"}
    kind, _, path = spec.partition(":")
    if kind not in ("synth", "kit") or not path:
        sys.exit(f"bad job spec {spec!r}: expected init, synth:<path> or kit:<path>")
    return {"name": os.path.splitext(os.path.basename(path))[0], "kind": kind, "file": path}


def run_job(job, fw, src_sd, work, out, boot_wait):
    if subprocess.run(["pgrep", "-f", "qemu-system-arm"], capture_output=True).returncode == 0:
        sys.exit("an emulator is already running; refusing to start another")
    sd = os.path.join(work, "sd_rw")  # the _rw suffix is what enables write-back
    shots = os.path.join(work, "shots")
    name = job["name"]
    dst = build_sd(sd, src_sd, job)
    before = open(dst, "rb").read() if dst else None
    for p in (LOG, QMP):
        if os.path.exists(p):
            os.remove(p)
    log(f"[{name}] launching {os.path.basename(fw)}")
    proc = subprocess.Popen(
        [APP, fw, "--sd", sd, "--display", "none", "--", "-qmp", f"unix:{QMP},server,nowait"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    q = None
    try:
        wait_for(launched, 300, "emulator never launched the machine")
        log(f"[{name}] machine launched; waiting {boot_wait}s for the firmware to boot")
        wait_for(qmp_up, 60, "QMP socket never appeared")
        time.sleep(boot_wait)
        q = Qmp(QMP)
        q.shot(shots, f"{name}-1-boot")
        kind = job["kind"]
        if kind == "kit":
            q.press("w")  # KIT: turns the clip into a kit, loading the first kit
            time.sleep(8)
            q.shot(shots, f"{name}-2-kit-loaded")
        inst_btn = "w" if kind == "kit" else "q"
        q.key("s", True)  # hold SAVE ...
        time.sleep(0.4)
        q.press(inst_btn)  # ... press SYNTH/KIT -> save-preset UI
        time.sleep(0.4)
        q.key("s", False)
        time.sleep(2)
        q.shot(shots, f"{name}-3-save-ui")
        q.press("ret")  # save
        time.sleep(2)
        q.shot(shots, f"{name}-4-after-select")
        q.press("ret")  # confirm overwrite (harmless if no menu is open)
        time.sleep(3)
        q.shot(shots, f"{name}-5-after-confirm")
    finally:
        # Always quit over QMP so the launcher writes the card back and nothing is left running.
        log(f"[{name}] quitting")
        if q is not None:
            q.quit()
        try:
            proc.wait(timeout=180)
        except subprocess.TimeoutExpired:
            proc.terminate()
            proc.wait(timeout=60)
        subprocess.run(["pkill", "-f", "qemu-system-arm"], capture_output=True)
    log(f"[{name}] emulator exited rc={proc.returncode}")
    results = []
    for folder in ("SYNTHS", "KITS"):
        d = os.path.join(sd, folder)
        for f in sorted(os.listdir(d)):
            if not f.upper().endswith(".XML") or f.startswith("._"):
                continue
            p = os.path.join(d, f)
            data = open(p, "rb").read()
            written = time.localtime(os.stat(p).st_mtime).tm_year < 1980  # FAT epoch: firmware wrote it
            changed = before is None or data != before
            if not (written and changed):
                log(f"[{name}] WARNING {folder}/{f} does not look firmware-written "
                    f"(1969 stamp={written}, changed={changed}); check {shots}")
            os.makedirs(out, exist_ok=True)
            shutil.copy2(p, os.path.join(out, f))
            results.append((folder, f, len(data), written, changed))
    for r in results:
        log(f"[{name}] wrote {out}/{r[1]} ({r[2]} bytes, firmware-stamped={r[3]}, changed={r[4]})")
    return results


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fw", required=True, help="firmware .bin/.elf to boot")
    ap.add_argument("--src-sd", default=DEFAULT_SRC_SD, help="card folder to take presets and samples from")
    ap.add_argument("--out", default="out", help="folder to copy the firmware-written files into")
    ap.add_argument("--work", default=os.path.join(os.environ.get("TMPDIR", "/tmp"), "deluge-fixtures"))
    ap.add_argument("--boot-wait", type=int, default=60, help="seconds to wait after launch (60 is safe)")
    ap.add_argument("jobs", nargs="+")
    a = ap.parse_args()
    if not os.path.exists(APP):
        sys.exit(f"DelugEmu not found at {APP}")
    os.makedirs(a.work, exist_ok=True)
    for spec in a.jobs:
        run_job(parse_job(spec), os.path.abspath(a.fw), a.src_sd, a.work, os.path.abspath(a.out), a.boot_wait)


if __name__ == "__main__":
    main()
