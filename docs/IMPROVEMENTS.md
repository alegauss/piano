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

### §PI86 Say what a button does, on hover

Every control in the transport bar is an icon with an accessible name and nothing a
sighted reader sees. The names are already written and already good — "Show the sheet
music", "Wait for me", "Back to the start (Home)" — so the answer exists and has no way
out.

A tooltip on hover and on keyboard focus, showing the same string the button already
carries as its accessible name. Same string, read from the same place: a tooltip that
repeats a name in its own words is a second thing to keep in step, and they drift.

Radix already supplies the popovers, dialogs and sliders here and its tooltip composes
the same way. A title attribute is the other option and is worse: it cannot be styled,
cannot be triggered by focus, and waits a second before appearing.

The bar is the place to start and probably the place to stop: the parts panel's rows
carry visible names already, and a tooltip on something that is labelled is noise.

Two things to get right. It must not swallow the click, which is what a badly placed
trigger does to the button under it. And the delay wants to be short but not absent: a
bar of icons all speaking as the pointer crosses them is worse than silence.

The test asserts a tooltip appears on focus with the button's own name, since focus is
the half a keyboard reader needs and is what a jsdom test can drive.
