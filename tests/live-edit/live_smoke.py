#!/usr/bin/env python3
"""Smoke-test the live-edit smSysex ops against DelugEmu.

Builds a throwaway SD card (the Sysex Live Edit toggle on, two repo fixtures as the synth and
kit, a stand-in WAV for each sample the kit names), launches DelugEmu with DIN and USB MIDI on
QEMU unix-socket chardevs, and drives every live-edit op (inst, param, save, load, select, sub)
over the smSysex JSON protocol from plain Python - no editor, no Web MIDI. Each op's reply and
every device->editor push are checked. Results print to stdout and to <out>/RESULTS.md.

Prerequisites: macOS with /Applications/DelugEmu.app, and a firmware .bin built from the
feature/live-edit-sysex branch (./dbt build release). See README.md in this directory.

    python3 live_smoke.py --fw /path/to/deluge.bin        # or set DELUGE_FW
"""
import argparse
import json
import os
import re
import shutil
import socket
import struct
import subprocess
import sys
import threading
import time
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))  # tests/live-edit -> repo root
APP = "/Applications/DelugEmu.app/Contents/MacOS/DelugEmu"
LOG = os.path.expanduser("~/Library/Application Support/DelugEmu/delugemu.log")
DEFAULT_FW = os.path.expanduser("~/WebstormProjects/DelugeFirmwareTW/build/Release/deluge.bin")
SYNTH_FIXTURE = os.path.join(REPO, "tests/fixtures/community-c1.3.0/Sine AnalogSaw Patch Cables.XML")
KIT_FIXTURE = os.path.join(REPO, "tests/fixtures/fork-c1.3.0-local-fixes-fbba6b4f/Kit Velocity Layers.XML")
QMP = "/tmp/dz_lv_qmp.sock"
DIN = "/tmp/dz_lv_din.sock"
USB = "/tmp/dz_lv_usb.sock"

# filled in by main() from the CLI
FW = DEFAULT_FW
OUT = os.path.join(HERE, "work")
SD = os.path.join(OUT, "sd_rw")
SHOTS = os.path.join(OUT, "shots")
TRANSPORT = "usb"
KEEP_RUNNING = False

results = []


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def record(name, ok, detail="", info=False):
    results.append((name, ok, detail, info))
    tag = "INFO" if info else ("PASS" if ok else "FAIL")
    log(tag, name, "-", detail)


# ---------------------------------------------------------------- card

def tiny_wav():
    """A valid 16-bit mono 44.1 kHz WAV of 8 silent frames. Enough for the firmware to read the header
    and load the row; the harness never plays audio."""
    frames = 8
    data = b"\x00\x00" * frames
    return (b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE"
            + b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, 44100, 44100 * 2, 2, 16)
            + b"data" + struct.pack("<I", len(data)) + data)


def sample_paths(xml_path):
    txt = open(xml_path, encoding="utf-8", errors="replace").read()
    return sorted({p for p in re.findall(r'fileName="([^"]+)"', txt) if p.strip()})


def build_sd():
    """A throwaway card: the live-edit toggle on, the two repo fixtures, and a stand-in WAV for every
    sample the kit references. Self-contained - nothing here depends on a real Deluge card."""
    if os.path.exists(SD):
        shutil.rmtree(SD)
    for d in ("SYNTHS", "KITS", "SONGS", "TEMP", "SETTINGS"):
        os.makedirs(os.path.join(SD, d))
    with open(os.path.join(SD, "SETTINGS", "CommunityFeatures.XML"), "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<runtimeFeatureSettings>\n'
                '\t<setting name="sysexLiveEdit" value="1"></setting>\n</runtimeFeatureSettings>\n')
    # The boot song loads the first synth in SYNTHS/; give it the name the tests expect.
    shutil.copy2(SYNTH_FIXTURE, os.path.join(SD, "SYNTHS", "Tim.XML"))
    shutil.copy2(KIT_FIXTURE, os.path.join(SD, "KITS", "VelKit.XML"))
    wav = tiny_wav()
    for rel in sample_paths(KIT_FIXTURE):
        dst = os.path.join(SD, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, "wb") as f:
            f.write(wav)
    for root, _, files in os.walk(SD):
        for fn in files:
            os.utime(os.path.join(root, fn), None)


# ---------------------------------------------------------------- QMP

class Qmp:
    def __init__(self, path):
        self.s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.s.connect(path)
        self.f = self.s.makefile("rw")
        self.f.readline()
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

    def events(self, evs):
        return self.cmd({"execute": "input-send-event", "arguments": {"events": evs}})

    def key(self, qcode, down):
        return self.events([{"type": "key", "data": {"down": down, "key": {"type": "qcode", "data": qcode}}}])

    def press(self, qcode, hold=0.08):
        self.key(qcode, True)
        time.sleep(hold)
        self.key(qcode, False)

    def move(self, x, y):
        # Skin is 2256x1584; abs axes are 0..32767.
        self.events([{"type": "abs", "data": {"axis": "x", "value": int(x * 32767 / 2255)}},
                     {"type": "abs", "data": {"axis": "y", "value": int(y * 32767 / 1583)}}])

    def wheel(self, up=True):
        b = "wheel-up" if up else "wheel-down"
        self.events([{"type": "btn", "data": {"down": True, "button": b}},
                     {"type": "btn", "data": {"down": False, "button": b}}])

    def shot(self, name):
        os.makedirs(SHOTS, exist_ok=True)
        name = re.sub(r"[^A-Za-z0-9._-]+", "_", name)
        ppm = os.path.join(SHOTS, name + ".ppm")
        png = os.path.join(SHOTS, name + ".png")
        self.cmd({"execute": "human-monitor-command", "arguments": {"command-line": f"screendump {ppm}"}})
        time.sleep(0.4)
        subprocess.run(["sips", "-s", "format", "png", ppm, "--out", png], capture_output=True)
        subprocess.run(["sips", "-c", "260", "1000", "--cropOffset", "150", "630", png,
                        "--out", os.path.join(SHOTS, name + "-oled.png")], capture_output=True)
        os.remove(ppm)
        return png

    def quit(self):
        try:
            self.cmd({"execute": "quit"})
        except Exception:
            pass


# ---------------------------------------------------------------- sysex

def pack8to7(src):
    out = bytearray()
    for g in range(0, len(src), 7):
        chunk = src[g:g + 7]
        msbs = 0
        body = bytearray()
        for i, b in enumerate(chunk):
            if b & 0x80:
                msbs |= 1 << i
            body.append(b & 0x7F)
        out.append(msbs)
        out += body
    return bytes(out)


def unpack7to8(src):
    out = bytearray()
    for g in range(0, len(src), 8):
        chunk = src[g:g + 8]
        msbs = chunk[0]
        for i, b in enumerate(chunk[1:]):
            out.append(b | (0x80 if msbs & (1 << i) else 0))
    return bytes(out)


class Sms:
    """Raw-byte smSysex client over a QEMU unix-socket chardev."""

    # DelugEmu's hosted-USB emulation hands the guest's OUT data to the socket only when an inbound
    # packet arrives, so a reply or push shorter than one 64-byte USB packet (~48 SysEx bytes) sits
    # in the emulated controller until the next request. On hardware the audio routine's MIDI timer
    # flushes the USB output every few ms (AudioEngine::routine -> MidiEngine::flushMIDI), so this
    # is emulator-only. A universal identity request every 100 ms keeps the emulated pipe moving;
    # the firmware's identity reply is ignored. Active Sensing (0xFE) does not do it.
    NUDGE = b"\xF0\x7E\x7F\x06\x01\xF7"

    def __init__(self, path, name, nudge=False):
        self.name = name
        self.s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.s.connect(path)
        self.s.settimeout(0.1)
        self.lock = threading.Lock()
        self.send_lock = threading.Lock()
        self.replies = {}      # msgId -> list of (json, binary, raw_len)
        self.pushes = []       # (t, json, raw_len)  msgId 0 / command Json
        self.other = 0
        self.session = None
        self.counter = 0
        self.raw_log = open(os.path.join(OUT, f"wire-{name}.log"), "w")
        self.alive = True
        self.t = threading.Thread(target=self._reader, daemon=True)
        self.t.start()
        if nudge:
            threading.Thread(target=self._nudger, daemon=True).start()

    def _nudger(self):
        while self.alive:
            time.sleep(0.1)
            try:
                with self.send_lock:
                    self.s.sendall(self.NUDGE)
            except OSError:
                return

    def _reader(self):
        buf = bytearray()
        in_sysex = False
        while self.alive:
            try:
                data = self.s.recv(4096)
            except socket.timeout:
                continue
            except OSError:
                return
            if not data:
                return
            for b in data:
                if b == 0xF0:
                    buf = bytearray([b])
                    in_sysex = True
                elif in_sysex:
                    if b >= 0xF8:
                        continue  # realtime
                    buf.append(b)
                    if b == 0xF7:
                        in_sysex = False
                        self._frame(bytes(buf))
                        buf = bytearray()
                # non-sysex bytes ignored

    def _frame(self, fr):
        if len(fr) < 9 or fr[1:5] != b"\x00\x21\x7B\x01":
            self.other += 1  # identity replies to the nudge, mostly
            return
        cmd, mid = fr[5], fr[6]
        body = fr[7:-1]
        sep = body.find(b"\x00")
        text = body if sep < 0 else body[:sep]
        binary = None if sep < 0 else unpack7to8(body[sep + 1:])
        try:
            js = json.loads(text.decode("ascii"))
        except Exception as e:
            self.raw_log.write(f"{time.time():.3f} BADJSON cmd={cmd} mid={mid} {text[:200]!r}\n")
            return
        self.raw_log.write(f"{time.time():.3f} <- cmd={cmd} mid={mid} len={len(fr)} {json.dumps(js)}"
                           f"{' +bin%d' % len(binary) if binary is not None else ''}\n")
        self.raw_log.flush()
        with self.lock:
            if cmd == 0x04 and mid == 0:
                self.pushes.append((time.time(), js, len(fr)))
            elif cmd == 0x05:
                self.replies.setdefault(mid, []).append((js, binary, len(fr)))
            else:
                self.other += 1

    def send_raw(self, fr):
        self.raw_log.write(f"{time.time():.3f} -> len={len(fr)} {fr[7:min(len(fr)-1, 300)].decode('ascii', 'replace') if len(fr) > 8 else fr.hex()}\n")
        self.raw_log.flush()
        with self.send_lock:
            self.s.sendall(fr)

    def frame(self, mid, obj, binary=None):
        text = json.dumps(obj, separators=(",", ":")).encode("ascii")
        fr = b"\xF0\x00\x21\x7B\x01\x04" + bytes([mid]) + text
        if binary is not None:
            fr += b"\x00" + pack8to7(binary)
        return fr + b"\xF7"

    def take_pushes(self):
        with self.lock:
            p = self.pushes
            self.pushes = []
        return p

    def wait_push(self, key, timeout=3.0):
        t0 = time.time()
        while time.time() - t0 < timeout:
            with self.lock:
                for i, (t, js, n) in enumerate(self.pushes):
                    if key in js:
                        return self.pushes.pop(i)
            time.sleep(0.02)
        return None

    def start_session(self, timeout=3.0):
        with self.lock:
            self.pushes = []
        self.send_raw(self.frame(0, {"session": {"tag": "livetest"}}))
        p = self.wait_push("^session", timeout)
        if p is None:
            return None
        self.session = p[1]["^session"]
        return self.session

    def request(self, obj, binary=None, timeout=4.0):
        s = self.session
        rng = s["midMax"] - s["midMin"] + 1
        mid = s["midMin"] + (self.counter % rng)
        self.counter += 1
        with self.lock:
            self.replies.pop(mid, None)
        t0 = time.time()
        self.send_raw(self.frame(mid, obj, binary))
        while time.time() - t0 < timeout:
            with self.lock:
                lst = self.replies.get(mid)
                if lst:
                    js, binary, n = lst.pop(0)
                    return js, binary, n, time.time() - t0
            time.sleep(0.005)
        raise TimeoutError(f"no reply to {json.dumps(obj)[:80]}")

    def op(self, obj, **kw):
        js, binary, n, dt = self.request(obj, **kw)
        key = next(iter(js))
        return js[key], binary, n, dt

    # -- file protocol
    def read_file(self, path):
        r, _, _, _ = self.op({"open": {"path": path, "write": 0}})
        if r.get("err"):
            return None, r
        fid, size = r["fid"], r["size"]
        data = bytearray()
        while len(data) < size:
            want = min(512, size - len(data))
            rr, b, _, _ = self.op({"read": {"fid": fid, "addr": len(data), "size": want}})
            if rr.get("err") or not b:
                self.op({"close": {"fid": fid}})
                return None, rr
            data += b
        self.op({"close": {"fid": fid}})
        return bytes(data), r

    def write_file(self, path, data):
        r, _, _, _ = self.op({"open": {"path": path, "write": 1}})
        if r.get("err"):
            return r
        fid = r["fid"]
        off = 0
        while off < len(data):
            chunk = data[off:off + 512]
            rr, _, _, _ = self.op({"write": {"fid": fid, "addr": off, "size": len(chunk)}}, binary=chunk)
            if rr.get("err"):
                self.op({"close": {"fid": fid}})
                return rr
            off += rr.get("size", len(chunk))
        return self.op({"close": {"fid": fid}})[0]

    def close(self):
        self.alive = False
        try:
            self.s.close()
        except OSError:
            pass


# ---------------------------------------------------------------- helpers

def _oled_changed(png_a, png_b):
    try:
        a = open(png_a[:-4] + "-oled.png", "rb").read()
        b = open(png_b[:-4] + "-oled.png", "rb").read()
        return a != b
    except OSError:
        return False


def wait_for(pred, timeout, what):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if pred():
            return True
        time.sleep(0.5)
    raise RuntimeError(what)


def launched():
    try:
        return "Launching deluge machine" in open(LOG, errors="replace").read()
    except FileNotFoundError:
        return False


def sock_up(p):
    return os.path.exists(p)


def hexint(s):
    v = int(s, 16)
    return v - (1 << 32) if v & 0x80000000 else v


def xml_attr(xml_bytes, elem, attr):
    """attr of the first <elem …> in a Deluge attribute-format file (regex; the file is ours to inspect)."""
    m = re.search(rb"<" + elem.encode() + rb"\b[^>]*?\b" + attr.encode() + rb'="([^"]*)"', xml_bytes, re.S)
    return m.group(1).decode() if m else None


# ---------------------------------------------------------------- main

def parse_args():
    global FW, OUT, SD, SHOTS, TRANSPORT, KEEP_RUNNING
    ap = argparse.ArgumentParser(description="Drive the live-edit smSysex ops against DelugEmu.")
    ap.add_argument("--fw", default=os.environ.get("DELUGE_FW", DEFAULT_FW),
                    help="firmware .bin built with the Sysex Live Edit feature (default: $DELUGE_FW or the "
                         "standard DelugeFirmwareTW release build)")
    ap.add_argument("--out", default=OUT, help="directory for the throwaway card, screenshots and wire logs")
    ap.add_argument("--transport", choices=("usb", "din"), default="usb",
                    help="which cable to drive the ops over (default: usb, the editor's transport)")
    ap.add_argument("--keep", action="store_true", help="leave the emulator running at the end")
    a = ap.parse_args()
    FW = os.path.expanduser(a.fw)
    OUT = os.path.abspath(a.out)
    SD = os.path.join(OUT, "sd_rw")
    SHOTS = os.path.join(OUT, "shots")
    TRANSPORT = a.transport
    KEEP_RUNNING = a.keep


def main():
    parse_args()
    if not os.path.exists(APP):
        sys.exit(f"DelugEmu not found at {APP}")
    if not os.path.exists(FW):
        sys.exit(f"firmware not found at {FW}\nBuild it in DelugeFirmwareTW (./dbt build release) or pass --fw.")
    if subprocess.run(["pgrep", "-f", "qemu-system-arm"], capture_output=True).stdout.strip():
        sys.exit("a qemu-system-arm is already running; refusing to start (it would clobber the card on exit)")
    os.makedirs(OUT, exist_ok=True)
    build_sd()
    for p in (QMP, DIN, USB):
        if os.path.exists(p):
            os.remove(p)
    if os.path.exists(LOG):
        os.remove(LOG)
    log("launching DelugEmu with", FW)
    proc = subprocess.Popen(
        [APP, FW, "--sd", SD, "--display", "none",
         "--midi", f"unix:{DIN},server=on,wait=off",
         "--usb-midi", f"unix:{USB},server=on,wait=off",
         "--", "-qmp", f"unix:{QMP},server,nowait"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # QEMU services one client per socket chardev (QMP included): a second connection blocks until the
    # first closes, so every socket is opened exactly once and reused, including for the final quit.
    qmp = None
    try:
        wait_for(launched, 120, "emulator never launched")
        wait_for(lambda: sock_up(QMP) and sock_up(USB) and sock_up(DIN), 30, "sockets never appeared")
        time.sleep(2)
        qmp = Qmp(QMP)
        din = Sms(DIN, "din")
        usb = Sms(USB, "usb", nudge=True)
        try:
            run_tests(qmp, din, usb)
        except Exception as e:
            record("harness aborted", False, f"{type(e).__name__}: {e}")
            try:
                qmp.shot("99-abort")
                r = qmp.cmd({"execute": "human-monitor-command", "arguments": {"command-line": "info registers"}})
                regs = (r or {}).get("return", "")
                m = re.search(r"PSR=\S+ (\S+ \S+ \S+ \S+)", regs)
                record("CPU mode at abort", False if "abt32" in regs or "und32" in regs else True,
                       f"{m.group(1) if m else regs[:120]!r}")
            except Exception as e2:
                log("post-mortem failed:", e2)
    finally:
        if KEEP_RUNNING:
            log("KEEP=1: leaving the emulator running")
        else:
            if qmp is not None:
                qmp.quit()
            else:
                proc.kill()
            try:
                proc.wait(timeout=90)
            except subprocess.TimeoutExpired:
                log("emulator did not exit; killing")
                proc.kill()
        write_report()


def run_tests(qmp, din, usb):
    # ---- boot: poll for a session grant on the chosen transport
    primary = usb if TRANSPORT == "usb" else din
    log("waiting for the firmware to answer a session request on", primary.name)
    t0 = time.time()
    grant = None
    while time.time() - t0 < 150:
        grant = primary.start_session(timeout=3.0)
        if grant:
            break
    if not grant:
        # try the other transport before giving up
        other = din if primary is usb else usb
        log("no grant on", primary.name, "- trying", other.name)
        grant = other.start_session(timeout=5.0)
        if grant:
            primary = other
    qmp.shot("00-boot")
    if not grant:
        record("session grant", False, "no ^session on either transport within 150 s of launch")
        return
    c = primary
    record("session grant", True, f"on {c.name} after {time.time()-t0:.0f}s: {json.dumps(grant)}")
    record("grant carries live:1", grant.get("live") == 1, f"live={grant.get('live')}")

    # ---- inst
    r, _, n, dt = c.op({"inst": {}})
    record("inst on boot synth", r.get("type") == "synth" and r.get("name") == "Tim" and r.get("dir") == "SYNTHS"
           and r.get("err") == 0, f"{json.dumps(r)} ({n} B, {dt*1000:.0f} ms)")
    gen0 = r.get("gen")

    # ---- param read
    r, _, n, dt = c.op({"param": {"name": "lpfFrequency"}})
    record("param get lpfFrequency = file value", r.get("value") == hexint("FC000000") and r.get("err") == 0,
           f"{json.dumps(r)} ({dt*1000:.0f} ms)")
    r, _, _, _ = c.op({"param": {"name": "oscAVolume"}})
    record("param get oscAVolume = file value", r.get("value") == hexint("570A3D4A"), json.dumps(r))

    # ---- param write, read back, edited flag
    r, _, n, dt = c.op({"param": {"name": "lpfFrequency", "value": 0x40000000}})
    record("param set lpfFrequency", r.get("value") == 0x40000000 and r.get("err") == 0,
           f"{json.dumps(r)} ({dt*1000:.0f} ms)")
    r, _, _, _ = c.op({"param": {"name": "lpfFrequency"}})
    record("param get after set", r.get("value") == 0x40000000, json.dumps(r))
    r, _, _, _ = c.op({"param": {"name": "pan", "value": -0x20000000}})
    record("param set negative value (pan)", r.get("value") == -0x20000000, json.dumps(r))
    r, _, _, _ = c.op({"param": {"name": "lfo1Rate", "value": 0x12345678}})
    record("param set unpatched-kind name (lfo1Rate)", r.get("value") == 0x12345678, json.dumps(r))
    r, _, _, _ = c.op({"param": {"name": "portamento", "value": 0x00000000}})
    record("param set unpatched sound (portamento)", r.get("value") == 0 and r.get("err") == 0, json.dumps(r))
    # <defaultParams volume> is GLOBAL_VOLUME_POST_FX, "volumePostFX" on the wire (docs/decisions/live.md).
    r, _, _, _ = c.op({"param": {"name": "volumePostFX", "value": 0x33333333}})
    record("param set volumePostFX (the defaultParams volume attribute)", r.get("value") == 0x33333333, json.dumps(r))
    r, _, _, _ = c.op({"param": {"name": "volume", "value": 1}})
    record("param bare volume on a sound -> why name (LOCAL_VOLUME is a cable destination only)",
           r.get("why") == "name", json.dumps(r))
    r, _, _, _ = c.op({"param": {"name": "volumePostReverbSend", "value": 1}})
    record("param volumePostReverbSend -> why name (cable destination only)", r.get("why") == "name", json.dumps(r))
    r, _, _, _ = c.op({"inst": {}})
    record("inst edited=1 after param set", r.get("edited") == 1 and r.get("gen", 0) > gen0, json.dumps(r))
    qmp.shot("01-after-param")

    # ---- param errors
    r, _, _, _ = c.op({"param": {"name": "noSuchParam", "value": 1}})
    record("param unknown name -> why name", r.get("why") == "name" and r.get("err") == 1, json.dumps(r))
    r, _, _, _ = c.op({"param": {"name": "lpfFrequency", "src": "bogus", "value": 1}})
    record("param bad src -> why src", r.get("why") == "src", json.dumps(r))
    r, _, _, _ = c.op({"param": {"name": "lpfFrequency", "src": "lfo1"}})
    record("param cable lfo1->lpfFrequency (get)", "value" in r or r.get("why") in ("noParam",), json.dumps(r))
    cable_reply = r
    r, _, _, _ = c.op({"param": {"name": "lpfFrequency", "src": "lfo1", "value": 0x20000000}})
    record("param cable lfo1->lpfFrequency (set)", r.get("value") == 0x20000000 or r.get("why") == "noParam",
           json.dumps(r))
    r, _, _, _ = c.op({"select": {"drum": 0}})
    record("select on a synth -> why noKit", r.get("why") == "noKit", json.dumps(r))

    # ---- pull: save keep:1 to TEMP, read back
    r, _, n, dt = c.op({"save": {"path": "/TEMP/LIVE.XML", "overwrite": 1, "keep": 1}}, timeout=10)
    record("save keep:1 to /TEMP/LIVE.XML", r.get("err") == 0 and r.get("edited") == 1 and r.get("name") == "Tim",
           f"{json.dumps(r)} ({dt*1000:.0f} ms)")
    t1 = time.time()
    live_xml, rr = c.read_file("/TEMP/LIVE.XML")
    if live_xml is None:
        record("read back /TEMP/LIVE.XML", False, json.dumps(rr))
        return
    record("read back /TEMP/LIVE.XML", True, f"{len(live_xml)} B in {time.time()-t1:.2f}s")
    open(os.path.join(OUT, "LIVE-pull1.XML"), "wb").write(live_xml)
    try:
        ET.fromstring(live_xml)
        record("pulled preset parses as XML", True, "")
    except ET.ParseError as e:
        record("pulled preset parses as XML", False, str(e))
    record("pulled preset carries the param set", xml_attr(live_xml, "defaultParams", "lpfFrequency") == "0x40000000"
           and xml_attr(live_xml, "defaultParams", "pan") == "0xE0000000"
           and xml_attr(live_xml, "defaultParams", "volume") == "0x33333333",
           f"lpfFrequency={xml_attr(live_xml, 'defaultParams', 'lpfFrequency')} pan={xml_attr(live_xml, 'defaultParams', 'pan')}"
           f" volume={xml_attr(live_xml, 'defaultParams', 'volume')}")
    record("pulled preset is Tim.XML shape", xml_attr(live_xml, "osc1", "type") == "sine"
           and xml_attr(live_xml, "sound", "firmwareVersion") is not None,
           f"osc1@type={xml_attr(live_xml, 'osc1', 'type')} fw={xml_attr(live_xml, 'sound', 'firmwareVersion')}")
    # a cable's amount, if the file has one for lfo1->lpfFrequency
    m = re.search(rb'<patchCable\s+source="lfo1"\s+destination="lpfFrequency"\s+amount="([^"]+)"', live_xml)
    if m:
        record("pulled cable amount matches param cable set", m.group(1) == b"0x20000000",
               f"amount={m.group(1).decode()} (param reply was {json.dumps(cable_reply)})")

    # ---- push: edit the XML (osc1 sine -> square, lpf back to a new value), write TEMP/LIVE2, load as Tim
    edited = re.sub(rb'(<osc1\s+type=")sine"', rb'\1square"', live_xml, count=1)
    edited = edited.replace(b'lpfFrequency="0x40000000"', b'lpfFrequency="0x30000000"', 1)
    assert edited != live_xml
    t1 = time.time()
    rr = c.write_file("/TEMP/LIVE2.XML", edited)
    record("write /TEMP/LIVE2.XML", rr.get("err") == 0, f"{json.dumps(rr)} {len(edited)} B in {time.time()-t1:.2f}s")
    r, _, n, dt = c.op({"load": {"path": "/TEMP/LIVE2.XML", "name": "Tim", "dir": "SYNTHS"}}, timeout=15)
    record("load /TEMP/LIVE2.XML as SYNTHS/Tim", r.get("err") == 0 and r.get("name") == "Tim" and r.get("dir") == "SYNTHS"
           and r.get("edited") == 1, f"{json.dumps(r)} ({dt*1000:.0f} ms)")
    qmp.shot("02-after-load")
    r, _, _, _ = c.op({"param": {"name": "lpfFrequency"}})
    record("param after load = pushed file value", r.get("value") == 0x30000000, json.dumps(r))
    r, _, _, _ = c.op({"save": {"path": "/TEMP/LIVE.XML", "overwrite": 1, "keep": 1}}, timeout=10)
    pull2, _ = c.read_file("/TEMP/LIVE.XML")
    open(os.path.join(OUT, "LIVE-pull2.XML"), "wb").write(pull2 or b"")
    record("pull after push shows osc1=square", pull2 is not None and xml_attr(pull2, "osc1", "type") == "square",
           f"osc1@type={xml_attr(pull2, 'osc1', 'type') if pull2 else None}")
    record("push/pull round trip byte-identical", pull2 == edited,
           f"{len(edited)} B pushed, {len(pull2) if pull2 else 0} B pulled" +
           ("" if pull2 == edited else " - DIFFER (see work/LIVE-pull2.XML)"))

    # ---- load errors
    r, _, _, _ = c.op({"load": {"path": "/TEMP/NOPE.XML", "name": "Tim", "dir": "SYNTHS"}}, timeout=10)
    record("load missing file -> notFound", r.get("why") == "notFound", json.dumps(r))
    record("  FILE_NOT_FOUND numeric", True, f"firmware Error = {r.get('err')}", info=True)
    r, _, _, _ = c.op({"load": {"path": "TEMPLIVE2", "name": "Tim"}})
    record("load bad path -> why path", r.get("why") == "path", json.dumps(r))
    qmp.press("l")  # LOAD: opens the preset browser over the clip view
    time.sleep(0.8)
    qmp.shot("03-load-browser")
    r, _, _, _ = c.op({"load": {"path": "/TEMP/LIVE2.XML", "name": "Tim", "dir": "SYNTHS"}}, timeout=10)
    record("load while a browser is open -> busy", r.get("why") == "busy", json.dumps(r))
    qmp.press("backspace")
    time.sleep(0.5)
    r, _, _, _ = c.op({"inst": {}})
    record("inst still Tim after browser back", r.get("name") == "Tim" and r.get("type") == "synth", json.dumps(r))

    # ---- save to own slot: exists, then overwrite
    r, _, _, _ = c.op({"save": {"overwrite": 0}}, timeout=10)
    record("save own slot overwrite:0 -> exists", r.get("why") == "exists", json.dumps(r))
    record("  FILE_ALREADY_EXISTS numeric", True, f"firmware Error = {r.get('err')}", info=True)
    r, _, n, dt = c.op({"save": {"overwrite": 1}}, timeout=10)
    record("save own slot overwrite:1", r.get("err") == 0 and r.get("path") == "/SYNTHS/Tim.XML" and r.get("edited") == 0,
           f"{json.dumps(r)} ({dt*1000:.0f} ms)")
    saved, _ = c.read_file("/SYNTHS/Tim.XML")
    record("saved file == last pull", saved == pull2, f"{len(saved) if saved else 0} B")
    qmp.shot("04-after-save")
    r, _, _, _ = c.op({"save": {"path": "/SYNTHS/Tim2.XML", "overwrite": 0}}, timeout=10)
    record("save to a new slot (Tim2)", r.get("err") == 0 and r.get("name") == "Tim2", json.dumps(r))
    r, _, _, _ = c.op({"save": {"path": "/SYNTHS/Tim.XML", "overwrite": 1}}, timeout=10)
    record("save back to Tim slot", r.get("err") == 0 and r.get("name") == "Tim", json.dumps(r))
    r, _, _, _ = c.op({"save": {"path": "/SYNTHS/Tim", "overwrite": 1}})
    record("save bad path -> why path", r.get("why") == "path", json.dumps(r))

    # ---- subscribe and device-side changes
    c.take_pushes()
    r, _, _, _ = c.op({"sub": {"secs": 60}})
    record("sub 60 s", r.get("err") == 0 and r.get("secs") == 60 and r.get("name") == "Tim", json.dumps(r))
    time.sleep(0.5)
    stray = c.take_pushes()
    record("no push right after sub", len(stray) == 0, f"{len(stray)} pushes: {[json.dumps(p[1]) for p in stray][:3]}")
    # our own param set must not come back
    r, _, _, _ = c.op({"param": {"name": "lpfResonance", "value": 0x10000000}})
    time.sleep(0.6)
    p = c.take_pushes()
    inst_pushes = [x for x in p if "^inst" in x[1]]
    chg_pushes = [x for x in p if "^chg" in x[1]]
    record("own param set is not echoed as ^chg", len(chg_pushes) == 0, f"{[json.dumps(x[1]) for x in chg_pushes]}")
    record("own param set flips edited -> ^inst push", len(inst_pushes) == 1 and inst_pushes[0][1]["^inst"].get("edited") == 1,
           f"{[json.dumps(x[1]) for x in inst_pushes]}")
    # turn the lower gold knob on the device (MOD_ENCODER_0 at skin 549,469)
    qmp.move(549, 469)
    for _ in range(4):
        qmp.wheel(up=True)
        time.sleep(0.05)
    time.sleep(0.6)
    qmp.shot("05-after-knob")
    p = c.take_pushes()
    chg = [x for x in p if "^chg" in x[1]]
    record("gold knob turn -> ^chg push", len(chg) >= 1,
           f"{len(p)} pushes: {[json.dumps(x[1]) for x in p][:4]}")
    if chg:
        entries = [e for x in chg for e in x[1]["^chg"].get("p", [])]
        names = sorted({e.get("n") for e in entries})
        record("^chg entries carry n/v", all("n" in e and "v" in e for e in entries), f"names={names} entries={entries[:3]}")
        record("^chg frames under 740 B", all(x[2] <= 740 for x in chg), f"sizes={[x[2] for x in chg]}")
        if names:
            r, _, _, _ = c.op({"param": {"name": names[0]}})
            last = [e for e in entries if e.get("n") == names[0]][-1]
            record("param get agrees with last ^chg value", r.get("value") == last.get("v"),
                   f"get={r.get('value')} chg={last.get('v')}")
    # a menu edit on the device -> ^dirty (open sound menu, enter, turn select, back out)
    c.take_pushes()
    qmp.press("ret")
    time.sleep(0.5)
    before = qmp.shot("06-menu")
    qmp.move(1067, 331)  # SELECT_ENC
    qmp.wheel(up=True)
    time.sleep(0.3)
    after = qmp.shot("07-menu-turned")
    changed = _oled_changed(before, after)
    qmp.press("backspace")
    time.sleep(1.0)
    p = c.take_pushes()
    if changed:
        record("menu selection change on device -> a push", len(p) >= 1, f"{[json.dumps(x[1]) for x in p][:6]}")
    else:
        # The emulated menu did not move under the wheel (a known DelugEmu input quirk), so there was
        # nothing to report. ^dirty is exercised for real in the kit-knob test below.
        record("menu selection change on device -> a push", True,
               "skipped: the emulated menu did not respond to the encoder wheel (no edit to report)", info=True)

    # ---- kit: KIT button loads the first kit
    c.take_pushes()
    qmp.press("w")
    time.sleep(3.0)
    qmp.shot("09-kit")
    p = c.take_pushes()
    inst_p = [x for x in p if "^inst" in x[1]]
    record("KIT button -> ^inst push with type kit", any(x[1]["^inst"].get("type") == "kit" for x in inst_p),
           f"{[json.dumps(x[1]) for x in p][:4]}")
    r, _, _, _ = c.op({"inst": {}})
    record("inst on kit", r.get("type") == "kit" and r.get("name") == "VelKit" and "drum" in r and "entire" in r,
           json.dumps(r))
    r, _, _, _ = c.op({"select": {"drum": 1}})
    record("select drum 1", r.get("err") == 0 and r.get("drum") == 1 and r.get("drumKind") == "sound", json.dumps(r))
    time.sleep(0.4)
    p = c.take_pushes()
    record("select drum -> ^inst push", any("^inst" in x[1] and x[1]["^inst"].get("drum") == 1 for x in p),
           f"{[json.dumps(x[1]) for x in p][:3]}")
    r, _, _, _ = c.op({"select": {"drum": 99}})
    record("select drum 99 -> noDrum", r.get("why") == "noDrum", json.dumps(r))
    r, _, _, _ = c.op({"select": {"entire": 1}})
    record("select entire 1", r.get("err") == 0 and r.get("entire") == 1, json.dumps(r))
    # A kit row is a sound: its <defaultParams volume> is "volumePostFX" on the wire, as for a synth.
    r, _, _, _ = c.op({"param": {"name": "volumePostFX", "drum": 0}})
    record("param get drum 0 volumePostFX", r.get("err") == 0 and r.get("drum") == 0 and "value" in r, json.dumps(r))
    r, _, _, _ = c.op({"param": {"name": "volume", "drum": 0, "value": 1}})
    record("param bare volume on a kit row -> why name", r.get("why") == "name", json.dumps(r))
    # Drum 1 is selected; write drum 0 by index, the row the device is not looking at.
    r, _, _, _ = c.op({"param": {"name": "volumePostFX", "drum": 0, "value": 0x11111111}})
    record("param set drum 0 volumePostFX (read-back)", r.get("value") == 0x11111111, json.dumps(r))
    r, _, _, _ = c.op({"param": {"name": "volumePostFX", "drum": 1}})
    record("drum 1 volumePostFX unaffected", r.get("err") == 0 and r.get("value") != 0x11111111, json.dumps(r))
    c.op({"save": {"path": "/TEMP/KDIAG1.XML", "overwrite": 1, "keep": 1}}, timeout=15)
    kd1, _ = c.read_file("/TEMP/KDIAG1.XML")
    open(os.path.join(OUT, "KDIAG1.XML"), "wb").write(kd1 or b"")
    record("by-index (non-selected) drum-0 set reaches a preset save", kd1 is not None and b'volume="0x11111111"' in kd1,
           f"{len(kd1) if kd1 else 0} B")
    # A no-drum param targets the selected row (1), and the reply reports the resolved row, not the argument.
    sel_by_index, _, _, _ = c.op({"param": {"name": "volumePostFX", "drum": 1}})
    sel_no_drum, _, _, _ = c.op({"param": {"name": "volumePostFX"}})
    record("param with no drum targets the selected row", sel_no_drum.get("value") == sel_by_index.get("value")
           and sel_no_drum.get("err") == 0, f"no-drum={sel_no_drum.get('value')} drum1={sel_by_index.get('value')}")
    record("no-drum reply reports the resolved drum index", sel_no_drum.get("drum") == 1, json.dumps(sel_no_drum))
    r, _, _, _ = c.op({"param": {"name": "volume", "bus": 1}})
    record("param get kit bus volume", r.get("err") == 0 and r.get("bus") == 1 and "value" in r, json.dumps(r))
    r, _, _, _ = c.op({"param": {"name": "volume", "bus": 1, "value": 0x22222222}})
    record("param set kit bus volume", r.get("value") == 0x22222222, json.dumps(r))
    r, _, _, _ = c.op({"param": {"name": "lpfFrequency", "bus": 1, "value": 0x0}})
    record("param set kit bus lpfFrequency", r.get("err") == 0, json.dumps(r))
    r, _, _, _ = c.op({"param": {"name": "oscAVolume", "bus": 1, "value": 0x0}})
    record("param kit bus with a sound-only name -> why name", r.get("why") == "name", json.dumps(r))
    r, _, _, _ = c.op({"param": {"name": "volumePostFX", "drum": 50}})
    record("param drum 50 -> noDrum", r.get("why") == "noDrum", json.dumps(r))
    r, _, _, _ = c.op({"save": {"path": "/TEMP/KIT.XML", "overwrite": 1, "keep": 1}}, timeout=15)
    record("save kit keep:1", r.get("err") == 0 and r.get("type") == "kit", json.dumps(r))
    kit_xml, _ = c.read_file("/TEMP/KIT.XML")
    open(os.path.join(OUT, "KIT-pull.XML"), "wb").write(kit_xml or b"")
    if kit_xml:
        record("kit pull shows kit bus volume", b'volume="0x22222222"' in kit_xml, f"{len(kit_xml)} B")
        record("kit pull shows by-index drum 0 volume", b'volume="0x11111111"' in kit_xml, f"{len(kit_xml)} B")
    # kit whole-document push: load the pulled kit back as itself
    r, _, n, dt = c.op({"load": {"path": "/TEMP/KIT.XML", "name": "VelKit", "dir": "KITS"}}, timeout=20)
    record("load kit from TEMP as KITS/VelKit", r.get("err") == 0 and r.get("type") == "kit" and r.get("edited") == 1,
           f"{json.dumps(r)} ({dt*1000:.0f} ms)")
    r, _, _, _ = c.op({"param": {"name": "volumePostFX", "drum": 0}})
    record("drum 0 volumePostFX after kit reload", r.get("value") == 0x11111111, json.dumps(r))
    qmp.shot("10-kit-after-load")
    # gold knob on a kit row
    c.take_pushes()
    qmp.move(549, 469)
    qmp.wheel(up=True)
    qmp.wheel(up=True)
    time.sleep(0.6)
    p = c.take_pushes()
    chg = [e for x in p if "^chg" in x[1] for e in x[1]["^chg"].get("p", [])]
    record("kit knob turn -> ^chg with d or b", len(chg) >= 1 and all(("d" in e) or ("b" in e) for e in chg),
           f"{[json.dumps(x[1]) for x in p][:4]}")
    record("a device edit also produces ^dirty", any("^dirty" in x[1] for x in p),
           f"{[json.dumps(x[1]) for x in p if '^dirty' in x[1]]}")

    # ---- unsubscribe
    r, _, _, _ = c.op({"sub": {"secs": 0}})
    record("sub 0 releases", r.get("secs") == 0 and r.get("err") == 0, json.dumps(r))
    c.take_pushes()
    qmp.wheel(up=True)
    time.sleep(0.6)
    p = c.take_pushes()
    record("no pushes after release", len(p) == 0, f"{[json.dumps(x[1]) for x in p][:3]}")

    # ---- the other transport still answers plain ops
    other = din if c is usb else usb
    g2 = None
    for _ in range(3):
        g2 = other.start_session(timeout=4.0)
        if g2:
            break
    if g2:
        r, _, _, _ = other.op({"inst": {}})
        record(f"inst over {other.name} too", r.get("err") == 0, json.dumps(r))
    else:
        record(f"session over {other.name}", True,
               "no grant: DelugEmu does not feed guest sysex-in over the --midi serial chardev the way it "
               "does USB; the editor uses USB (Web MIDI). Verify DIN on hardware.", info=True)
    qmp.shot("11-end")


def write_report():
    lines = ["# Live-edit smoke test against DelugEmu", "",
             f"Firmware: `{FW}`", f"Transport: {TRANSPORT}", f"Run: {time.strftime('%Y-%m-%d %H:%M:%S')}", "",
             "| Result | Check | Detail |", "|---|---|---|"]
    npass = nfail = ninfo = 0
    for name, ok, detail, info in results:
        d = detail.replace("|", "\\|").replace("\n", " ")
        tag = "INFO" if info else ("PASS" if ok else "FAIL")
        lines.append(f"| {tag} | {name} | {d} |")
        if info:
            ninfo += 1
        elif ok:
            npass += 1
        else:
            nfail += 1
    lines += ["", f"{npass} passed, {nfail} failed, {ninfo} informational"]
    open(os.path.join(OUT, "RESULTS.md"), "w").write("\n".join(lines) + "\n")
    log(f"{npass} passed, {nfail} failed, {ninfo} informational")


if __name__ == "__main__":
    main()
    sys.exit(1 if any((not ok and not info) for _, ok, _, info in results) else 0)
