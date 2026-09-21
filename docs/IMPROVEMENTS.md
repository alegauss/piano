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

### §PI70 Starting the installed app with a score

PI68 reads back what an installer wrote: the registry says a score is claimed and starts
the piano, Launch Services says the bundle owns `.piano`, the desktop entry says which
types it opens. All of that is a promise about what happens next, and nothing tests that
part. The app could refuse the path, or open on the placeholder, and every reading would
still pass.

What is missing is observability rather than a shell. A smoke run loads the renderer and
quits before the window asks main what it was launched with, so a run started with a
score's path says nothing about the score. Give the headless run a word for it: main
knows the file it opened, so it can print that name once, the way it prints that the
renderer loaded. Then the association check ends by starting the installed binary with a
score it wrote to a temporary file, and looks for that name. The score is one the check
writes: the point is the installed app on a machine with nothing else of ours on it.

Keep it to the one claim. Whether the window shows the notes is the live suite's
question and it has a display for it; this is about whether a launch argument survives
installation, which is where a `%1` that was never written, or written unquoted, would
show.

Done when the check starts the installed app with a score and fails where the app opens
something else.
