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

### §PI82 An icon that is not the monitor's

MidiMonitor.tsx imports Music4 and so does the bar's roll-or-stave button, which sits
two places along. On the stave the button shows Music4 to mean "back to the falling
notes", beside a Music4 that means "what the controller is sending": two identical
glyphs, neither saying which is which.

The pair the button swaps between has to read as the two things it swaps between.
ClefTreble for the stave is right and unambiguous; the other half is what needs
replacing, with something that says roll rather than music in general. KeyboardMusic is
the closest — the roll falls onto the keyboard and that is what the view is — and it is
far enough from Keyboard, which KeysPanel already uses for the typing keyboard, to be
told apart beside it.

Whatever it becomes, check it against the icons it actually sits next to rather than on
its own: the bar holds the keys panel, the MIDI monitor, effects, theme and full screen,
and two of those are already music-shaped.

A jsdom test on TransportBar can only assert the accessible names, which are right
already, so this is a browser test or nothing: render the bar in both views and assert
the button's glyph is not the monitor's.

### §PI83 A zoom for the page, and following it across

The roll has a zoom — the slider under the magnifier, MIN_LEAD_SECONDS to
MAX_LEAD_SECONDS, "Seconds of music on screen" — and the stave has one size. On a dense
score the glyphs are too small to read, and no amount of relayout fixes that: PI81 stops
notes colliding, and they are still small.

Scale rather than relayout. The plan stays in its own units and the drawing is scaled,
so zoom is `context.scale(z, z)` with the SVG sized `plan.width * z` by `plan.height *
z`, and nothing about the layout is recomputed. Doubling makes glyphs and spacing both
twice the size, which is what "bigger notes" means and what relayout alone cannot give.

The page then grows past the panel, so the panel scrolls both ways. It already has
overflow-auto; what is missing is following in x. PI75 turns the page by system and
reads `system.y` — it needs the sounding bar's x too, kept in view the way the system
is, and both multiplied by the zoom, since the plan is in unscaled units.

Its own control beside the roll's rather than the same one: they mean different things,
one being seconds of music and the other a magnification, and one slider doing both
would be a lie about either. Keep it in the settings, as the view itself is.

A browser test zooms and asserts the SVG's width grows and the band tracks it; another
asserts the panel scrolls in x to a bar off to the right.
