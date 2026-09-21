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

### §PI87 The same hint, on the parts rows

Each row of the parts panel carries the part's name in words and then three icon
buttons: a speaker, an S and an eye. PI86 put hints on the transport bar and left this
alone, on the grounds that the rows are labelled — but the label names the part, not
what the buttons do to it.

Which matters here more than most places, because the two eyes of the thing are
deliberately different: parts.ts keeps muting and hiding apart on purpose, since
following one hand on the roll while hearing both is a real way to practise. A speaker
and an eye side by side are exactly the pair somebody has to guess between, and the
names that would settle it — "Silence Melody", "Hide Bass", "Solo Melody" — are already
written as accessible names and already say which part they are about.

So the same Hint, around the same buttons. It reads the name off the child, so there is
nothing to write twice and nothing to keep in step.

Check the row does not become noisy: three hints in a row, each following the pointer
along, is the case the delay exists for, and this panel is where a reader's pointer
travels furthest. If it reads badly, the honest answer is hints on the speaker and the
eye and none on the S, whose letter is at least a word.

The test is the bar's: focus a button, assert a tooltip with that button's own name.
