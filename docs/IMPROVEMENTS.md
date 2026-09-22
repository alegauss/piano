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

### §PI99 What the folder would not take

The inbox takes in what it can and writes a line to the log about the rest. A `.mid`
that is not a MIDI file, a `.musicxml` that is some other XML, one too large to read,
and one whose id the library already holds are each left where they are, recorded so the
reading is not repeated, and mentioned nowhere a person will look. Nobody reads a
desktop app's stderr.

From the outside this is the old complaint again: a file copied into the folder and
nothing happens. The difference is that the app now knows exactly why, in a sentence the
reader already wrote — `openScoreFile` refuses by name — and throws it away.

So the panel says it. The sweep's answer already carries what it left and why; what is
missing is a way to reach the window, which today hears only that the folder changed. A
push carrying the last sweep's refusals, or a read the panel asks for when it opens, and
a line under the list: two files here were not taken in, each name and reason on demand.

The one taken id is the interesting case, because the answer is a door rather than a
sentence: the piece can be opened from the folder and filed through the form, where the
clash is a question somebody answers. So its line is worth making openable, which the
panel can already do for a score but not for a file it does not list.

## Block H — Sheet music view
