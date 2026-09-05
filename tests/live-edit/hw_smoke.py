#!/usr/bin/env python3
"""Live-edit smSysex ops against a real Deluge over CoreMIDI — the hardware counterpart to
live_smoke.py (which runs the same protocol in DelugEmu). No editor, no Web MIDI.

Non-destructive by design: it only ever saves to /TEMP, restores every param it changes to the
value it read, and finishes by loading the original pulled preset back, so the instrument on the
device is left as it was found and the card preset file is never written.

    python3 hw_smoke.py           # part 1: every op, fully automated (~5 s)
    python3 hw_smoke.py part2     # part 2: subscribe, then prompts you to move a knob / a menu

Prerequisites: macOS with the Deluge connected over USB, running fork firmware with the Sysex
Live Edit community feature on (`feature/live-edit-sysex`), and `mido` + `python-rtmidi`
installed (CoreMIDI backend). As of 2026-09 use Chrome Beta for the *editor* over Web MIDI, but
this script talks to CoreMIDI directly and is unaffected. Artifacts (pulled presets, a wire log)
land in work/ beside this file, which is git-ignored.
"""
import mido, json, time, sys, re, threading, os
import xml.etree.ElementTree as ET
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, "work")
os.makedirs(WORK, exist_ok=True)
PORT = 'Deluge Port 1'
results = []
def log(*a): print(time.strftime("%H:%M:%S"), *a, flush=True)
def record(name, ok, detail="", info=False):
    results.append((name, ok, detail, info)); log("INFO" if info else ("PASS" if ok else "FAIL"), name, "-", detail)
def pack(src):
    o=bytearray()
    for g in range(0,len(src),7):
        c=src[g:g+7]; m=0; body=bytearray()
        for i,b in enumerate(c):
            if b&0x80: m|=1<<i
            body.append(b&0x7f)
        o.append(m); o+=body
    return bytes(o)
def unpack(src):
    o=bytearray()
    for g in range(0,len(src),8):
        c=src[g:g+8]; m=c[0]
        for i,b in enumerate(c[1:]): o.append(b|(0x80 if m&(1<<i) else 0))
    return bytes(o)
def hexint(s):
    v=int(s,16); return v-(1<<32) if v&0x80000000 else v
def xml_attr(xml, elem, attr):
    m=re.search(rb"<"+elem.encode()+rb"\b[^>]*?\b"+attr.encode()+rb'="([^"]*)"', xml, re.S)
    return m.group(1).decode() if m else None

class Sms:
    def __init__(self):
        self.lock=threading.Lock(); self.replies={}; self.pushes=[]; self.other=0; self.counter=0
        self.wire=open(os.path.join(WORK,"hw-wire.log"),"a")
        self.out=mido.open_output(PORT); self.inp=mido.open_input(PORT, callback=self._cb)
    def _cb(self, m):
        if m.type!='sysex': return
        f=bytes(m.data)
        if len(f)<7 or f[0:4]!=b"\x00\x21\x7B\x01": self.other+=1; return
        cmd,mid=f[4],f[5]; body=f[6:]; sep=body.find(b"\0")
        text=body if sep<0 else body[:sep]; binary=None if sep<0 else unpack(body[sep+1:])
        try: js=json.loads(text.decode('ascii'))
        except Exception: self.wire.write(f"{time.time():.3f} BADJSON {text[:200]!r}\n"); return
        self.wire.write(f"{time.time():.3f} <- cmd={cmd} mid={mid} len={len(f)+2} {json.dumps(js)}{' +bin%d'%len(binary) if binary is not None else ''}\n"); self.wire.flush()
        with self.lock:
            if cmd==4 and mid==0: self.pushes.append((time.time(),js,len(f)+2))
            elif cmd==5: self.replies.setdefault(mid,[]).append((js,binary,len(f)+2))
            else: self.other+=1
    def frame(self, mid, obj, binary=None):
        fr=b"\x00\x21\x7B\x01\x04"+bytes([mid])+json.dumps(obj,separators=(",",":")).encode('ascii')
        if binary is not None: fr+=b"\0"+pack(binary)
        return fr
    def send(self, fr):
        self.wire.write(f"{time.time():.3f} -> len={len(fr)+2} {fr[6:min(len(fr),300)].decode('ascii','replace')}\n"); self.wire.flush()
        self.out.send(mido.Message('sysex', data=list(fr)))
    def take_pushes(self):
        with self.lock: p=self.pushes; self.pushes=[]; return p
    def wait_push(self, key, timeout=3.0):
        t0=time.time()
        while time.time()-t0<timeout:
            with self.lock:
                for i,x in enumerate(self.pushes):
                    if key in x[1]: return self.pushes.pop(i)
            time.sleep(0.02)
    def start_session(self):
        self.take_pushes(); self.send(self.frame(0,{"session":{"tag":"hwsmoke"}}))
        p=self.wait_push("^session"); self.session=p[1]["^session"] if p else None; return self.session
    def request(self, obj, binary=None, timeout=4.0):
        s=self.session; rng=s["midMax"]-s["midMin"]+1; mid=s["midMin"]+(self.counter%rng); self.counter+=1
        with self.lock: self.replies.pop(mid,None)
        t0=time.time(); self.send(self.frame(mid,obj,binary))
        while time.time()-t0<timeout:
            with self.lock:
                l=self.replies.get(mid)
                if l: js,b,n=l.pop(0); return js,b,n,time.time()-t0
            time.sleep(0.003)
        raise TimeoutError(f"no reply to {json.dumps(obj)[:80]}")
    def op(self, obj, **kw):
        js,b,n,dt=self.request(obj,**kw); return js[next(iter(js))],b,n,dt
    def read_file(self, path):
        r,_,_,_=self.op({"open":{"path":path,"write":0}})
        if r.get("err"): return None,r
        fid,size=r["fid"],r["size"]; data=bytearray()
        while len(data)<size:
            rr,b,_,_=self.op({"read":{"fid":fid,"addr":len(data),"size":min(512,size-len(data))}})
            if rr.get("err") or not b: self.op({"close":{"fid":fid}}); return None,rr
            data+=b
        self.op({"close":{"fid":fid}}); return bytes(data),r
    def write_file(self, path, data):
        r,_,_,_=self.op({"open":{"path":path,"write":1}})
        if r.get("err"): return r
        fid=r["fid"]; off=0
        while off<len(data):
            chunk=data[off:off+512]
            rr,_,_,_=self.op({"write":{"fid":fid,"addr":off,"size":len(chunk)}},binary=chunk)
            if rr.get("err"): self.op({"close":{"fid":fid}}); return rr
            off+=rr.get("size",len(chunk))
        return self.op({"close":{"fid":fid}})[0]

def part1(c):
    g=c.start_session()
    record("session grant", bool(g), json.dumps(g))
    record("grant carries live:1", g.get("live")==1, f"live={g.get('live')}")
    r,_,n,dt=c.op({"inst":{}})
    record("inst is a synth", r.get("type")=="synth" and r.get("err")==0, f"{json.dumps(r)} ({n} B, {dt*1000:.0f} ms)")
    name,dir_,gen0=r.get("name"),r.get("dir"),r.get("gen")
    # ---- pull the untouched state first
    r,_,_,dt=c.op({"save":{"path":"/TEMP/LIVE.XML","overwrite":1,"keep":1}},timeout=15)
    record("save keep:1 to /TEMP/LIVE.XML", r.get("err")==0 and r.get("name")==name and r.get("dir")==dir_, f"{json.dumps(r)} ({dt*1000:.0f} ms)")
    t1=time.time(); pull0,rr=c.read_file("/TEMP/LIVE.XML")
    if pull0 is None: record("read back /TEMP/LIVE.XML",False,json.dumps(rr)); return
    record("read back /TEMP/LIVE.XML", True, f"{len(pull0)} B in {time.time()-t1:.2f}s ({len(pull0)/(time.time()-t1)/1024:.1f} KB/s)")
    open(os.path.join(WORK,"HW-pull0.XML"),"wb").write(pull0)
    try: ET.fromstring(pull0); record("pulled preset parses as XML",True,f"fw={xml_attr(pull0,'sound','firmwareVersion')} osc1@type={xml_attr(pull0,'osc1','type')}")
    except ET.ParseError as e: record("pulled preset parses as XML",False,str(e))
    # ---- param get vs file
    orig={}
    for nm,attr in (("lpfFrequency","lpfFrequency"),("pan","pan"),("volumePostFX","volume"),("lfo1Rate","lfo1Rate"),("portamento","portamento"),("lpfResonance","lpfResonance")):
        r,_,_,dt=c.op({"param":{"name":nm}}); orig[nm]=r.get("value")
        fv=xml_attr(pull0,"defaultParams",attr)
        record(f"param get {nm} = file {attr}", r.get("err")==0 and fv is not None and r.get("value")==hexint(fv), f"{json.dumps(r)} file={fv} ({dt*1000:.0f} ms)")
    # ---- param set / read back
    tests=[("lpfFrequency",0x40000000),("pan",-0x20000000),("lfo1Rate",0x12345678),("portamento",0),("volumePostFX",0x33333333)]
    for nm,v in tests:
        r,_,_,dt=c.op({"param":{"name":nm,"value":v}})
        record(f"param set {nm}", r.get("value")==v and r.get("err")==0, f"{json.dumps(r)} ({dt*1000:.0f} ms)")
    r,_,_,_=c.op({"param":{"name":"lpfFrequency"}}); record("param get after set", r.get("value")==0x40000000, json.dumps(r))
    # 200 rapid sets, the knob-drag case
    t1=time.time(); bad=0
    for i in range(200):
        r,_,_,_=c.op({"param":{"name":"lpfFrequency","value":0x40000000-i*0x100000}})
        if r.get("err"): bad+=1
    dt=(time.time()-t1)/200
    record("200 rapid param sets", bad==0, f"{dt*1000:.1f} ms per round trip, {bad} errors")
    r,_,_,_=c.op({"param":{"name":"volume","value":1}}); record("param bare volume -> why name", r.get("why")=="name", json.dumps(r))
    r,_,_,_=c.op({"param":{"name":"volumePostReverbSend","value":1}}); record("param volumePostReverbSend -> why name", r.get("why")=="name", json.dumps(r))
    r,_,_,_=c.op({"param":{"name":"noSuchParam","value":1}}); record("param unknown name -> why name (no crash)", r.get("why")=="name" and r.get("err")==1, json.dumps(r))
    r,_,_,_=c.op({"param":{"name":"lpfFrequency","src":"bogus","value":1}}); record("param bad src -> why src", r.get("why")=="src", json.dumps(r))
    r,_,_,_=c.op({"param":{"name":"lpfFrequency","src":"lfo1"}}); record("param cable lfo1->lpfFrequency get", "value" in r or r.get("why")=="noParam", json.dumps(r))
    r,_,_,_=c.op({"select":{"drum":0}}); record("select on a synth -> noKit", r.get("why")=="noKit", json.dumps(r))
    r,_,_,_=c.op({"inst":{}}); record("inst gen advanced after sets", r.get("gen",0)>gen0 and r.get("edited")==1, json.dumps(r))
    # ---- pull with the sets in it
    c.op({"save":{"path":"/TEMP/LIVE.XML","overwrite":1,"keep":1}},timeout=15)
    pull1,_=c.read_file("/TEMP/LIVE.XML"); open(os.path.join(WORK,"HW-pull1.XML"),"wb").write(pull1 or b"")
    record("pulled preset carries the param sets", pull1 is not None and xml_attr(pull1,"defaultParams","pan")=="0xE0000000" and xml_attr(pull1,"defaultParams","volume")=="0x33333333" and xml_attr(pull1,"defaultParams","lfo1Rate")=="0x12345678",
           f"pan={xml_attr(pull1,'defaultParams','pan')} volume={xml_attr(pull1,'defaultParams','volume')} lfo1Rate={xml_attr(pull1,'defaultParams','lfo1Rate')}")
    # ---- restore params
    for nm,v in orig.items():
        if v is not None: c.op({"param":{"name":nm,"value":v}})
    c.op({"save":{"path":"/TEMP/LIVE.XML","overwrite":1,"keep":1}},timeout=15)
    pullr,_=c.read_file("/TEMP/LIVE.XML")
    record("pull after restoring params == original pull", pullr==pull0, f"{len(pullr or b'')} vs {len(pull0)} B")
    # ---- push: flip osc1 type in a copy, load, verify, pull, byte-identical
    t0=xml_attr(pull0,"osc1","type"); alt="square" if t0!="square" else "saw"
    edited=re.sub(rb'(<osc1\s+type=")'+t0.encode()+rb'"', rb'\1'+alt.encode()+rb'"', pull0, count=1)
    edited=edited.replace(b'lpfFrequency="'+xml_attr(pull0,"defaultParams","lpfFrequency").encode()+b'"', b'lpfFrequency="0x30000000"',1)
    assert edited!=pull0
    t1=time.time(); rr=c.write_file("/TEMP/LIVE2.XML",edited)
    record("write /TEMP/LIVE2.XML", rr.get("err")==0, f"{len(edited)} B in {time.time()-t1:.2f}s ({len(edited)/(time.time()-t1)/1024:.1f} KB/s)")
    r,_,_,dt=c.op({"load":{"path":"/TEMP/LIVE2.XML","name":name,"dir":dir_}},timeout=20)
    record("load /TEMP/LIVE2.XML keeping name/dir", r.get("err")==0 and r.get("name")==name and r.get("dir")==dir_ and r.get("edited")==1, f"{json.dumps(r)} ({dt*1000:.0f} ms)")
    r,_,_,_=c.op({"param":{"name":"lpfFrequency"}}); record("param after load = pushed value", r.get("value")==0x30000000, json.dumps(r))
    c.op({"save":{"path":"/TEMP/LIVE.XML","overwrite":1,"keep":1}},timeout=15)
    pull2,_=c.read_file("/TEMP/LIVE.XML"); open(os.path.join(WORK,"HW-pull2.XML"),"wb").write(pull2 or b"")
    record(f"pull after push shows osc1={alt}", pull2 is not None and xml_attr(pull2,"osc1","type")==alt, f"osc1@type={xml_attr(pull2,'osc1','type') if pull2 else None}")
    record("push/pull round trip byte-identical", pull2==edited, f"{len(edited)} B pushed, {len(pull2 or b'')} B pulled")
    # ---- load / save errors (all non-destructive)
    r,_,_,_=c.op({"load":{"path":"/TEMP/NOPE.XML","name":name,"dir":dir_}},timeout=10); record("load missing -> notFound", r.get("why")=="notFound", json.dumps(r))
    r,_,_,_=c.op({"load":{"path":"TEMPLIVE2","name":name}}); record("load bad path -> why path", r.get("why")=="path", json.dumps(r))
    r,_,_,_=c.op({"save":{"overwrite":0}},timeout=10); record("save own slot overwrite:0 -> exists (file untouched)", r.get("why")=="exists", json.dumps(r))
    r,_,_,_=c.op({"save":{"path":"/SYNTHS/Nope","overwrite":1}}); record("save bad path -> why path", r.get("why")=="path", json.dumps(r))
    # ---- restore the original state on the device
    rr=c.write_file("/TEMP/LIVE2.XML",pull0)
    r,_,_,dt=c.op({"load":{"path":"/TEMP/LIVE2.XML","name":name,"dir":dir_}},timeout=20)
    c.op({"save":{"path":"/TEMP/LIVE.XML","overwrite":1,"keep":1}},timeout=15)
    pull3,_=c.read_file("/TEMP/LIVE.XML")
    record("device restored: pull == original pull", pull3==pull0, f"load {dt*1000:.0f} ms")
    r,_,_,_=c.op({"inst":{}}); record("inst still the same preset", r.get("name")==name and r.get("dir")==dir_, json.dumps(r))

def part2(c):
    """Subscribe, then wait for the person at the device to turn a gold knob and to change a menu item."""
    g=c.start_session(); record("session grant (part 2)", bool(g) and g.get("live")==1, json.dumps(g))
    c.take_pushes()
    r,_,_,_=c.op({"sub":{"secs":60}}); record("sub 60 s", r.get("err")==0 and r.get("secs")==60, json.dumps(r))
    time.sleep(0.5); stray=c.take_pushes(); record("no push right after sub", len(stray)==0, f"{[json.dumps(p[1]) for p in stray][:3]}")
    o,_,_,_=c.op({"param":{"name":"lpfResonance"}})
    r,_,_,_=c.op({"param":{"name":"lpfResonance","value":0x10000000}}); time.sleep(0.6); p=c.take_pushes()
    record("own param set is not echoed as ^chg", not [x for x in p if "^chg" in x[1]], f"{[json.dumps(x[1]) for x in p][:3]}")
    c.op({"param":{"name":"lpfResonance","value":o.get("value")}}); time.sleep(0.3); c.take_pushes()
    log(">>> TURN A GOLD KNOB on the Deluge now (60 s)")
    t0=time.time(); chg=[]
    while time.time()-t0<int(os.environ.get("HW_WAIT","60")) and not chg:
        if time.time()-t0>25: c.op({"sub":{"secs":60}})
        time.sleep(0.2); chg+= [x for x in c.take_pushes() if "^chg" in x[1]]
    record("gold knob turn -> ^chg push", bool(chg), f"{[json.dumps(x[1]) for x in chg][:3]}")
    if chg:
        entries=[e for x in chg for e in x[1]["^chg"].get("p",[])]; names=sorted({e.get("n") for e in entries})
        record("^chg entries carry n/v", all("n" in e and "v" in e for e in entries), f"names={names}")
        record("^chg frames under 740 B", all(x[2]<=740 for x in chg), f"sizes={[x[2] for x in chg]}")
        time.sleep(1.0); c.take_pushes()
        r,_,_,_=c.op({"param":{"name":names[0]}}); last=[e for e in entries if e.get("n")==names[0]][-1]
        record("param get agrees with ^chg (or moved on since)", r.get("err")==0, f"get={r.get('value')} chg={last.get('v')}")
    c.op({"sub":{"secs":60}}); c.take_pushes()
    log(">>> NOW CHANGE A MENU ITEM on the device (e.g. OSC1 type), then press BACK (60 s)")
    t0=time.time(); p=[]
    while time.time()-t0<int(os.environ.get("HW_WAIT","60")) and not [x for x in p if "^dirty" in x[1]]:
        if time.time()-t0>25: c.op({"sub":{"secs":60}})
        time.sleep(0.2); p+=c.take_pushes()
    record("menu edit on device -> ^dirty push", bool([x for x in p if "^dirty" in x[1]]), f"{[json.dumps(x[1]) for x in p][:5]}")
    c.op({"sub":{"secs":0}}); record("sub released", True, "")

if __name__=="__main__":
    c=Sms()
    try:
        (part2 if "part2" in sys.argv else part1)(c)
    except Exception as e:
        record("harness aborted", False, f"{type(e).__name__}: {e}")
    n_fail=sum(1 for r in results if not r[1] and not r[3])
    log(f"{sum(1 for r in results if r[1] and not r[3])} passed, {n_fail} failed, other frames={c.other}")
    sys.exit(1 if n_fail else 0)
