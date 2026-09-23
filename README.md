# Piano

**A piano Claude Code writes for, plays and teaches.** A free desktop app for Windows, macOS
and Linux that plays a score as notes falling onto a keyboard, and then teaches it: it waits
for you, tells you which bars went wrong, and raises the tempo each time you get a passage
right. Its Claude Code plugin writes the piece you asked for, checks it, keeps it in your
library and plays it in the window in front of you.

The site is at <https://alegauss.github.io/piano/>.

## What it is

- **Falling notes, or sheet music.** The roll is drawn from the audio clock, so a note lands
  on its key at the moment it sounds. One button swaps it for the score engraved as sheet
  music, one stave per hand, with a band that follows the playhead. Loop a passage by
  dragging across the roll; transpose; hear or watch each part and each hand on its own.
- **Practice that names bars.** Every note comes back in time, early, late, wrong or missed,
  and the report is per bar and per section, never a percentage. _Wait for me_ stops the
  score until you play the note. The drill repeats a passage at a tempo that climbs after a
  clean repetition and drops back after a failed one.
- **Three levels of the same piece.** Beginner, intermediate and advanced use the score's own
  arrangement where it has one, and otherwise derive one by rules that only remove notes.
- **A library on your disk.** Scores live in `~/.piano/library`. A fresh install opens with
  public-domain pieces arranged for every level; `.mid`, `.musicxml` and `.mxl` files dropped
  into the folder are imported.
- **A piano from the first second.** A synthesised piano plays at once; the recorded one (the
  Salamander Grand Piano) is offered in the footer with its size stated first, and downloads
  only when you ask.
- **Input from a MIDI keyboard or the computer's keys**, with latency calibrated per device so
  your audio driver's delay is not graded as yours.

## What it is not

The non-goals in [docs/ROADMAP.md](docs/ROADMAP.md) are binding: no notation editor, no audio
recording or export (export MIDI and use a DAW), no accounts or cloud sync, no other
instruments, no listening through a microphone, no transcription of recordings or PDFs, no
copyrighted scores, and no web or mobile version.

## Claude Code

In Claude Code:

```
/plugin marketplace add alegauss/piano
/plugin install piano@piano
```

The plugin brings the MCP server and four commands: `/piano:compose`, `/piano:play`,
`/piano:practise` and `/piano:level`. [plugin/README.md](plugin/README.md) has the details, and
the site's [Claude Code page](https://alegauss.github.io/piano/claude-code/) lists every tool
the server registers, read out of its source.

## Installing the app

Installers for Windows, macOS and Linux are published on the
[releases page](https://github.com/alegauss/piano/releases) with each tagged version. Until
the first tag there is nothing to download, and the app runs from a clone:

```
git clone https://github.com/alegauss/piano.git
cd piano
npm ci
npm run dev
```

Node 20.11 or later. [CONTRIBUTING.md](CONTRIBUTING.md) has the rest: the layout, the checks
and the tests.

## Nothing leaves the machine

No account and no telemetry. The library, your practice history and your settings are local
files. The one outbound request is the recorded piano, from this project's own GitHub Pages,
and only when you ask for it.

## Licence

[MIT](LICENSE). The recorded piano is the Salamander Grand Piano V3 by Alexander Holm, under
CC-BY-3.0. Piano is an independent project, not affiliated with or endorsed by Anthropic.
