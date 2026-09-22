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

### §PI90 Follow the jumps a MusicXML score writes

The MusicXML import expands barline repeats and first and second endings, which covers
most of what a score writes. It does not follow a da capo, a dal segno or a jump to a
coda: `readSound` counts them and `dropped` names each one, so nobody is misled, but a
piece with a D.C. al Fine imports at roughly half its length.

The reason they were left is that repeats are local and jumps are not. A backward
barline names its own destination; a dal segno means "go to wherever the segno is",
which is a position the walk has to have recorded from a `<direction>` several measures
earlier, and `fine` means "stop here, but only on the second time through". So
`playOrder` would grow a second phase reading marks before it can walk, where today one
pass over the barlines is enough.

Worth doing after PI88 has met real files rather than before: the jumps a score site's
library actually uses will say whether this is a handful of common shapes or the whole
D.S. al Coda vocabulary, and building for the second before seeing the first is how a
walker grows cases nobody has.

## Block C — Audio engine and transport

## Block E — Practice mode and difficulty levels

## Block F — Claude Code First: MCP and plugin

## Block G — Score library and distribution

### §PI89 Let the system hand MusicXML to the app

PI88 taught the app to read MusicXML through every route that goes via `openScoreFile`:
the open dialog, a drop, the recent list and a path on the command line. What it did not
do is claim the file type, so a double-click still goes wherever the system already
sends it.

The pattern to follow is the MIDI one in `electron-builder.yml`: `role: Viewer`, `rank:
Alternate`. MusicXML belongs to whichever notation editor the person installed, and
taking Owner from MuseScore would be rude and wrong. `.musicxml` and `.mxl` only — never
`.xml`, which the app opens by name but must not claim, half the files on a disk being
some other XML.

Three places move together, which is why this is a task and not a line: the builder
config, `scripts/associations.mjs`, which writes the registry keys on Windows, and
`scripts/check-associations.mjs`, which verifies them and today knows only `MIDI_EXTS`.
A fourth is the Linux desktop entry's MIME types, already checked for `audio/midi`.

Worth doing because the file manager is how somebody arrives at a downloaded score: they
fetch a .mxl from a score site and double-click it, which is the moment the app either
exists for them or does not.

## Block H — Sheet music view

### §PI91 The doubled hint on Back to the start

PI86 put a `Hint` around each icon on the transport bar, and the first one — "Back to
the start (Home)" — came out wrapped twice: a `Hint` holding a `Hint` holding the
button.

It is not merely redundant, it is inert. `Hint` takes `children` and nothing else, and
renders `TooltipTrigger asChild` around it. `asChild` works by cloning the child element
with the trigger's own props: the pointer and focus handlers, the ref, the
`aria-describedby` that ties the button to the bubble. The outer trigger's child is the
inner `Hint`, a function component whose signature accepts one prop and drops every
other on the floor. So the outer tooltip has a trigger nothing can ever open, and what
renders for it is a second provider and a second `Tooltip` that no reader will ever see.

Nothing looks wrong, which is why it survived a review: the inner hint works, the button
stays clickable, and the outer one is silent rather than noisy.

The fix is the outer wrapper's deletion and nothing else. `PartsPanel` and
`TransportBar` between them wrap fifteen buttons, and this is the only one doubled.

Leave `Hint` itself alone. Forwarding props to the child so a nested pair composes would
be building a meaning for nesting, and a hint inside a hint has none. The bar's existing
tooltip test covers the button underneath; whether a case that renders nothing is worth
a test of its own is the one open call here.
