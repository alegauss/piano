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

### §PI93 Say when the expansion hit its ceiling

`playOrder` walks until it has 4,000 measures and then stops, which is right: a repeat
structure that never lands anywhere is a broken file and not a long piece. What it does
not do is say so. The walk ends, the order is whatever it had reached, and the import
returns a valid score that is simply missing its end.

`inferred['repeat']` makes it worse rather than better. It reports the count it arrived
at — "the 900 written bars were played out as 4000 bars" — in the same sentence it uses
when nothing was cut, so the one number that would give it away reads as a result. The
score validates, the library lists it, and the piece stops mid-phrase with nothing
anywhere saying why.

PI90 widened the door. A jump can send the walk back over measures a repeat already
expanded, so the two compound, and a file whose repeats alone stayed well inside the cap
can cross it once its da capo is followed.

What is missing is one flag off the walk — the loop ended on the cap rather than on
running out of measures — and a sentence for it. The sentence belongs in `dropped` and
not in `inferred`: `inferred` is what the import worked out, and this is music the file
held and the score does not. Something like "the piece was cut at 4,000 bars, where a
repeat or a jump sent the reading back further than a score can hold".

## Block C — Audio engine and transport

## Block E — Practice mode and difficulty levels

## Block F — Claude Code First: MCP and plugin

## Block G — Score library and distribution

## Block H — Sheet music view
