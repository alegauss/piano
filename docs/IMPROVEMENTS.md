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

### §PI68 Associations checked on the system that registers them

Building a package proves the configuration parses, not that a system acts on it.
electron-builder's NSIS template calls `customInstall` by name: a macro spelled
differently is never called and the build still succeeds, so the piano would quietly
fail to appear under Open With for a MIDI file. macOS reads the document types and the
exported type declaration only once the app is registered with Launch Services. Linux
reads the desktop entry's MimeType only where the AppImage has been integrated. None of
that is touched by packaging.

A runner can touch it, each on the system it is for, straight after the installer is
built. On Windows: a silent install into a temporary directory, then read the registry —
the class for `.piano`, and the OpenWithProgids value under `.mid` which must name the
piano without becoming the default — then run the uninstaller and check the same keys
are gone. On macOS: copy the app out of the DMG and ask `lsregister` what it now knows
about the bundle id, the extension and its rank. On Linux: `desktop-file-validate` the
entry the AppImage carries and read its MimeType line. The natural home is the release
workflow beside packaging, so an installer that does not register what it claims stops
the release instead of reaching somebody's machine. The same step can start the
installed app with a score's path and watch the window open it.

### §PI69 The copy button and the piece it is looking at

The footer now carries the doors on the whole history: save it as a file, delete it
after asking. The report panel kept an older pair from before those existed. "Copy it
out" puts every record on the clipboard, and it sits beside "Forget this piece", which
is about the piece on screen. The two disagree about scope, and the one that disagrees
is the one whose name promises less: somebody reading how the piece they just played
went, pressing the button under it, gets every piece they have ever practised, in a
place they cannot see before they paste it.

Make the panel's button say what its neighbour says. Copy the records for this score, in
the shape the file already uses — a version and a list — so what is pasted can be read
back and is not a second format to explain. `exported()` on the progress store is the
whole history today; what this needs is the score to narrow it by, and the footer's save
keeps the whole-history door it already opened.

Neither door writes. The file main owns stays the one place records live, so nothing
here can leave the clipboard and the file disagreeing about what was practised.

Done when the report panel's copy hands over the piece on screen and nothing else, the
footer's save still hands over everything, and a test says which is which.
