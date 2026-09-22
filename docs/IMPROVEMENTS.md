# Improvements

## Block A — Foundation: Electron, TypeScript, React and shadcn

### §PI57 Signing, and what it costs

electron-builder is already configured around this: the win and mac blocks name where an
identity would go, and both are deliberately left empty rather than half-filled, because
a half-configured signing step fails at the end of a long build instead of at the start.
What is missing is not configuration. Windows wants a code signing certificate from a
recognised authority, which costs money every year and, in the EV form that clears
SmartScreen immediately, arrives on a hardware token no CI runner can hold without a
signing service in front of it. macOS wants an Apple Developer account, an
application-specific password and a notarisation step that uploads each build to Apple
and waits for an answer. Both are purchases and both need someone to hold an account, so
neither belongs inside a task that could otherwise be finished. The consequence of
leaving it is concrete and worth writing down: on Windows a first-time user sees a blue
panel naming an unknown publisher, and on macOS the app refuses to open until they
right-click and confirm. Somebody who wanted to try a piano does neither. Until this is
done the honest position is that the installers are for people who were told where they
came from, and the README should say so rather than implying a public release. It does
not cross "User accounts, cloud storage or sync across machines": these are the
publisher's signing accounts, and nobody who plays the piano ever has one.

## Block B — Score JSON format

## Block C — Audio engine and transport

## Block E — Practice mode and difficulty levels

## Block F — Claude Code First: MCP and plugin

## Block G — Score library and distribution

### §PI97 What the folder will hold

`libraryIdOfFile` accepts `.piano` and the older `.score.json` and answers null for
everything else, so `entries` skips it. A `.mid` copied into `~/.piano/library` is not
listed, not refused and not mentioned: the folder simply looks unchanged.

Copying a file in is a real route. PI52 recorded that a score added outside the app
appears in the library, the watcher exists to make that immediate, and it is what
anybody does with a folder of downloads. That it works for one extension out of six is
the part nobody can guess from the outside.

Two answers are possible and the cheaper one may be right. Either the listing names what
it is ignoring — a line under the list saying three files here are not scores — or the
folder becomes an inbox: a `.mid`, `.musicxml` or `.mxl` found there is imported through
the same `openScoreFile` path the dialog uses, written as a `.piano` beside it.

A `.piano` the format refuses is ignored the same way: `library.held` answers nothing
for one, so PI95's ask is skipped and filing overwrites it.

The second is what people expect and the one that has to be careful. An import that
fails must not be retried on every listing, and a file still being copied must not be
read half written. The index already keeps size and modification time per file, which is
where a failed import can be remembered until the file changes.

Needs PI94 and PI95.

### §PI98 Saying the second way in

The panel says two things about where scores come from. Its description: "Every score
saved from Claude Code, and any copied into the library folder." Its empty state: "The
library is empty. Ask Claude Code for a piece with /piano:compose."

Both were true while the library had one writer. Once PI94 lands they are not: the app
itself can file a piece, and the way somebody with a folder of MIDI files gets them in
is Open, then file. Nobody reads a header button they are not looking for, and the one
place they are certainly looking is the empty list.

So the empty state names both routes and hangs the second on the action rather than
describing it: ask Claude Code for a piece, or open a file you already have. The
description follows — the folder sentence stays, because copying a file in still works,
but it stops being the only alternative offered.

This is a paragraph of text, filed on its own because it is the half of the complaint
that is not code. Somebody who has opened a MIDI file, heard it play and then found no
way to keep it is not missing a feature at that moment; they are missing the sentence
saying where the feature is. A button added in PI94 and never mentioned here leaves them
where they started.

Needs PI94.

## Block H — Sheet music view
