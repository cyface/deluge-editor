# The card over SysEx

Part of the [decisions log](../decisions.md): things that look like bugs or
omissions but are deliberate, with the *why*.

## A save to the card is verified, not assumed

Card access speaks the community firmware's smSysex protocol
(`src/core/sysex/`, from `storage/smsysex.cpp`; community 1.3.0+, cited in
the `smSysex` feature entry). Three of its behaviours are easy to build a
data-loser on, so the client treats the card as hostile:

- A request can vanish with no reply — the firmware silently drops SysEx over
  its 1024-byte receive buffer and queues requests behind card access — so
  every command runs on a timeout ladder and a resend takes a fresh message
  id. Write chunks are 512 bytes (~645 packed), never near the buffer.
- A short write is **not an error**: the firmware commits what arrived and
  replies `err=0` with the real count in `size`. The count is checked and the
  chunk rewritten, or the file would be silently holed with zeros.
- After the last chunk, the file is read back and byte-compared. A file with
  the right name and size proves nothing; only the read-back does. The panel
  reports a plain "written" — but it never says it before the read-back
  matched.

The browser those saves happen in is a **modal**, not a panel hanging off its
button. It is a file browser — path bar, listing, save name — somewhere you
work for a moment rather than a menu you glance at, and as a popover it
floated over the very editor it was about while the page behind it stayed
live. Loading a file has always closed it; a verified save now closes it too,
and the confirmation moves to the page for a few seconds rather than dying
with the dialog that earned it. That line still carries the second-editor
qualifier below, because "this may not stay written" is the last thing a
dismissal should swallow. The button that opened the dialog no longer doubles
as its close, since it sits behind the veil: the × and Escape do that, as they
do for every other dialog here.

The client is framework-free and its tests run against a fake Deluge
(`src/core/sysex/fake-deluge.ts`) transcribed from `smsysex.cpp` — the fake
drops oversized frames, short-writes, and pages directories at 25 lines,
because those are the firmware behaviours worth testing against. Loading from
the card goes through the same `editor.load` as drag-drop, so the round-trip
guarantees are identical.

## A second editor is detected and named, not locked out

Web MIDI is not exclusive. CoreMIDI and the other OS stacks multiplex, so
every open tab, browser and app receives **every** reply the Deluge sends,
and any of them can send. Most of that is harmless by construction: sessions
are allocated fresh per `session` request (`assignSession`, smsysex.cpp), so
each client gets its own block of seven message ids, and replies are matched
against the ids we are actually waiting on.

Two things had to change (issue #8). The `^session` grant is the exception to
the id rule — it comes back on msgId 0 (`startDirect`), identical in shape
whoever asked — so with the old static tag two tabs negotiating at once could
each adopt the other's grant, land on one session, and read each other's
replies as their own. The tag is now drawn per client and the firmware's echo
of it is checked, so only the grant we asked for is adopted. And a reply on
another session's ids is now reported (`onOtherClient`) instead of quietly
dropped, which is a free and reliable tell that a second editor is live.

The response is a warning, not a lock. `open` with write:1 is
`FA_CREATE_ALWAYS` — a truncate — so two editors saving one path corrupt it,
and nothing on this side can prevent that: even a save whose read-back
verified can be overwritten a second later. So the card panel and the kit
builder carry an advisory while another editor is heard, a save that
completes says it may not stay written, and both keep working. The flag is
sticky for the connection because "it went quiet" is not reassurance.

## Bulk SysEx runs two requests deep, and only when the firmware says so

A card transfer is hundreds of small requests, each waiting a USB round trip.
Overlapping them is the obvious speed-up and it is *unsafe* on shipped
firmware: the Deluge's USB send ring (`ConnectedUSBMIDIDevice::bufferMessage`)
silently dropped single events on overflow, so an overlapped reply came back
complete, well-framed and wrong — measured on hardware, cyface/DelugeFirmware#43.
Fixed firmware reserves ring space for the whole reply and drops the whole
message instead, which the retry ladder sees as a timeout, and it advertises
its safe in-flight count as `pipe` in the `^session` grant.

So `src/core/sysex/client.ts` pipelines at `min(pipe, 2)` and a grant with no
`pipe` field — every unfixed firmware — stays strictly serial. `MAX_PIPELINE`
is 2, not the firmware's number, because two is where the measured gain
(30–36 %) flattens and the msgId space is only seven wide per session. It
looks like a bug — the client ignores most of what the firmware offers — and
is the opposite: the cap is the part that was verified.
