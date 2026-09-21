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

## Block H — Sheet music view

### §PI77 Saying which part of the page is a guess

Engraving reads as fact, which is the problem: a stave drawn from inference looks
exactly like a stave drawn from a manuscript.

What is actually inferred is worth listing. There are no clefs in the format, so the
view reads hand, which note.ts warns is not the same thing as part. There is no key
signature over time, only metadata.key as a free-form string; MIDI import keeps the
first one it finds and drops any change mid-piece. There are no ties, no beams and no
rests: a tied note is one long duration, and a gap is either a rest somebody wrote or a
beat somebody forgot. barFigures reads one line per hand, so a held inner voice loses
its figure, and a triplet's leftover is tied or rounded: name both.

MIDI export already answers this shape of problem honestly. The score:export response
carries a dropped list of what the file could not hold, and describeExport turns it into
a sentence. Do the same here, shown the way OpenReport shows what an import guessed.

Say it once for the piece rather than once per bar, and name the reading rather than the
field: which clef came from which hand, that accidentals came from spelling where it was
written and from the sharps-upward fallback where it was not, and that a bar which does
not add up was filled with rests.

A test asserts the sentence for a score with no key, mixed hands and a short bar.

### §PI78 Loading the engraver when somebody asks for it

Measured across PI73 and PI74: the renderer bundle was 595 kB before the sheet view and
is 1,728 kB after it. There are two causes and both are fixable.

The fonts are the first. The vexflow entry embeds six of them as base64, some 774 kB,
where the app uses Bravura and Academico: Gonville, Petaluma and Petaluma Script are 391
kB nothing asks for. Importing vexflow/core with vexflow/bravura takes only what is used
— and must not bring back Font.HOST_URL, since PI76 settled that the fonts come from the
bundle and this renderer is sandboxed.

The second is that all of it loads at startup. That is parse and compile on every
launch, paid by a player who only ever watches the roll, rather than a download: the app
installs from disk and ships a sample bank of several hundred megabytes.

The seam is already in the right place. SheetMusic.tsx is the only importer of
sheet-draw.ts, which is the only importer of vexflow, so React.lazy with a Suspense
fallback around App.tsx's branch between PianoRoll and SheetMusic moves the library out
of the first chunk. The fallback is a line of text, not a spinner.

Confirm rather than assume: the build prints the chunk sizes, and the claim is that the
entry chunk drops by about a megabyte. A byte count in a test would be a test about
esbuild, so do not write one. App.browser.test.tsx presses the button and expects the
panel at once, so it needs findByLabelText instead.
