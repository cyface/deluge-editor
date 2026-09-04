// An in-page fake of the FIRMWARE side of smSysex, installed as a Playwright
// init script so the card flow can run end-to-end without hardware. Behaviour
// is transcribed from src/deluge/storage/smsysex.cpp and io/midi/midi_engine.cpp
// (upstream/main 3f898e95): requests over 1024 bytes are dropped silently,
// dir pages cap at 25 lines, read blocks cap at 1024 bytes, the ^session
// reply arrives as command Json with msgId 0, and the identity inquiry is
// answered with firmware version bytes (1.3.0 here).
//
// Card contents are seeded from window.__cardSeed (set by the spec, with
// Deluge-authored fixture text — never hand-written XML) and exposed on
// window.__fakeCard for assertions.
(() => {
  const files = new Map()
  const dirs = new Set(['/', '/SYNTHS', '/KITS'])
  const put = (path, data) => {
    files.set(path, typeof data === 'string' ? new TextEncoder().encode(data) : data)
    let d = path
    while (d.lastIndexOf('/') > 0) {
      d = d.slice(0, d.lastIndexOf('/'))
      dirs.add(d)
    }
  }

  const pack = (src) => {
    const out = []
    for (let n = 0; n < src.length; n += 7) {
      const count = Math.min(7, src.length - n)
      let msbs = 0
      const group = []
      for (let i = 0; i < count; i++) {
        if (src[n + i] & 0x80) msbs |= 1 << i
        group.push(src[n + i] & 0x7f)
      }
      out.push(msbs, ...group)
    }
    return out
  }
  const unpack = (src) => {
    const out = []
    for (let n = 0; n < src.length; n += 8) {
      const msbs = src[n]
      for (let i = 0; i < 7 && n + 1 + i < src.length; i++) out.push(src[n + 1 + i] | (msbs & (1 << i) ? 0x80 : 0))
    }
    return new Uint8Array(out)
  }

  let input = null
  const reply = (bytes) => {
    if (input && input.onmidimessage) setTimeout(() => input.onmidimessage({ data: bytes }), 0)
  }
  const answer = (msgId, json, binary, cmd = 0x05) => {
    const text = Array.from(`\n${json}`, (c) => c.charCodeAt(0))
    const tail = binary ? [0, ...pack(binary)] : []
    reply(Uint8Array.from([0xf0, 0x00, 0x21, 0x7b, 0x01, cmd, msgId, ...text, ...tail, 0xf7]))
  }

  let fidCounter = 1
  const open = new Map()
  const handle = (frame) => {
    if (frame.length > 1024) return // incomingSysexBuffer[1024]: dropped, no reply
    if (frame[0] !== 0xf0) return
    if (frame[1] === 0x7e && frame[3] === 0x06 && frame[4] === 0x01) {
      reply(Uint8Array.from([0xf0, 0x7e, 0x7f, 0x06, 0x02, 0x00, 0x21, 0x7b, 0x01, 0, 0, 0, 1, 3, 0, 0, 0xf7]))
      return
    }
    if (frame[1] !== 0 || frame[2] !== 0x21 || frame[3] !== 0x7b || frame[4] !== 1 || frame[5] !== 4) return
    const msgId = frame[6]
    const end = frame.lastIndexOf(0xf7)
    let sep = -1
    for (let i = 7; i < end; i++)
      if (frame[i] === 0) {
        sep = i
        break
      }
    let cmd
    try {
      cmd = JSON.parse(String.fromCharCode(...frame.subarray(7, sep === -1 ? end : sep)))
    } catch {
      return
    }
    const bin = sep === -1 ? new Uint8Array(0) : unpack(frame.subarray(sep + 1, end))

    if (cmd.session) {
      // assignSession echoes the tag it was given — the only thing that says
      // which client a grant belongs to, since every grant lands on msgId 0.
      answer(0, `{"^session": {"sid": 1,\n"tag": "${cmd.session.tag}",\n"midBase": 8,\n"midMin": 9,\n"midMax": 15}}`, null, 0x04)
    } else if (cmd.ping) {
      answer(msgId, '{"^ping": {}}')
    } else if (cmd.open) {
      const path = cmd.open.path
      if (cmd.open.write) put(path, new Uint8Array(0))
      else if (!files.has(path)) return answer(msgId, '{"^open": {"fid": 0,\n"size": 0,\n"err": 4}}')
      const fid = fidCounter++
      open.set(fid, path)
      answer(msgId, `{"^open": {"fid": ${fid},\n"size": ${files.get(path).length},\n"err": 0}}`)
    } else if (cmd.close) {
      open.delete(cmd.close.fid)
      answer(msgId, `{"^close": {"fid": ${cmd.close.fid},\n"err": 0}}`)
    } else if (cmd.read) {
      const path = open.get(cmd.read.fid)
      if (!path) return answer(msgId, '{"^read": {"size": 0,\n"err": 12}}')
      const data = files.get(path).subarray(cmd.read.addr, cmd.read.addr + Math.min(cmd.read.size, 1024))
      answer(msgId, `{"^read": {"fid": ${cmd.read.fid},\n"addr": ${cmd.read.addr},\n"size": ${data.length},\n"err": 0}}`, data)
    } else if (cmd.write) {
      const path = open.get(cmd.write.fid)
      if (!path) return answer(msgId, '{"^write": {"size": 0,\n"err": 12}}')
      const old = files.get(path)
      const grown = new Uint8Array(Math.max(old.length, cmd.write.addr + bin.length))
      grown.set(old)
      grown.set(bin, cmd.write.addr)
      files.set(path, grown)
      answer(msgId, `{"^write": {"fid": ${cmd.write.fid},\n"addr": ${cmd.write.addr},\n"size": ${bin.length},\n"err": 0}}`)
    } else if (cmd.dir) {
      const path = cmd.dir.path.replace(/\/$/, '') || '/'
      if (!dirs.has(path)) return answer(msgId, '{"^dir": {"list": [],\n"err": 5}}')
      const prefix = path === '/' ? '/' : `${path}/`
      const names = []
      for (const d of dirs)
        if (d !== '/' && d.startsWith(prefix) && !d.slice(prefix.length).includes('/'))
          names.push({ name: d.slice(prefix.length), size: 0, attr: 0x10 })
      for (const [p, v] of files)
        if (p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
          names.push({ name: p.slice(prefix.length), size: v.length, attr: 0x20 })
      names.sort((a, b) => a.name.localeCompare(b.name))
      const page = names.slice(cmd.dir.offset || 0, (cmd.dir.offset || 0) + Math.min(cmd.dir.lines || 20, 25))
      const list = page.map((e) => `{"name": "${e.name}",\n"size": ${e.size},\n"date": 0,\n"time": 0,\n"attr": ${e.attr}}`).join(', ')
      answer(msgId, `{"^dir": {"list": [${list}],\n"err": 0}}`)
    } else if (cmd.delete) {
      // f_unlink: a file, or an empty folder (FR_DENIED otherwise); FR_NO_FILE when nothing is there.
      const p = cmd.delete.path
      let err = 0
      if (files.has(p)) files.delete(p)
      else if (!dirs.has(p)) err = 4
      else if ([...files.keys(), ...dirs].some((q) => q !== p && q.startsWith(`${p}/`))) err = 7
      else dirs.delete(p)
      answer(msgId, `{"^delete": {"err": ${err}}}`)
    } else if (cmd.mkdir) {
      // f_mkdir: FR_EXIST on a name in use, FR_NO_PATH when the parent is missing.
      const p = cmd.mkdir.path
      const parent = p.lastIndexOf('/') <= 0 ? '/' : p.slice(0, p.lastIndexOf('/'))
      const err = dirs.has(p) || files.has(p) ? 8 : !dirs.has(parent) ? 5 : 0
      if (!err) dirs.add(p)
      answer(msgId, `{"^mkdir": {"path": "${p}",\n"err": ${err}}}`)
    } else if (cmd.rename) {
      // f_rename (ff.c:5193-5213): FR_NO_FILE without a source, FR_NO_PATH without the
      // destination folder, FR_EXIST when the new name is in use by another entry.
      const { from, to } = cmd.rename
      const parent = to.lastIndexOf('/') <= 0 ? '/' : to.slice(0, to.lastIndexOf('/'))
      const isFile = files.has(from)
      let err = 0
      if (!isFile && !dirs.has(from)) err = 4
      else if (!dirs.has(parent)) err = 5
      else if ([...files.keys(), ...dirs].some((q) => q.toLowerCase() === to.toLowerCase() && q !== from)) err = 8
      else if (isFile) {
        files.set(to, files.get(from))
        files.delete(from)
      } else {
        for (const [q, v] of [...files]) if (q.startsWith(`${from}/`)) { files.delete(q); files.set(`${to}${q.slice(from.length)}`, v) }
        for (const d of [...dirs]) if (d === from || d.startsWith(`${from}/`)) { dirs.delete(d); dirs.add(`${to}${d.slice(from.length)}`) }
      }
      answer(msgId, `{"^rename": {"from": "${from}",\n"to": "${to}",\n"err": ${err}}}`)
    }
  }

  navigator.requestMIDIAccess = async () => {
    const output = { name: 'Deluge Port 3', send: (b) => handle(Uint8Array.from(b)) }
    input = { name: 'Deluge Port 3', onmidimessage: null }
    return { outputs: new Map([['out', output]]), inputs: new Map([['in', input]]) }
  }

  for (const [p, t] of Object.entries(window.__cardSeed || {})) put(p, t)
  window.__fakeCard = {
    files,
    dirs,
    text: (p) => (files.has(p) ? new TextDecoder().decode(files.get(p)) : null),
    paths: () => [...files.keys()].sort(),
    // Play a second editor on the same Deluge: a reply answered to another
    // session's msgId block (sid 2 → 17…23). The OS MIDI stacks multiplex, so
    // every open tab hears it — that is the whole detection (issue #8).
    otherEditor: () => answer(17, '{"^read": {"fid": 99,\n"addr": 0,\n"size": 0,\n"err": 0}}'),
  }
})()
