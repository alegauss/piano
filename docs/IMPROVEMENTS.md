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

### §PI67 The practice history, kept like the settings

The practice history is written on every attempt and read at every launch, and it is the
one record in the app about a person rather than a piece. Today it sits in the
renderer's browser storage as JSON nobody validates: a record from a damaged store is
cast rather than checked, there is no version to migrate from, and nothing in the app
hands it over or deletes it. It wants the settings' treatment. Main keeps it in its own
file in the app's profile, written whole through a temporary file; each record is
validated on read, and one that fails is dropped and counted rather than taking the rest
down with it; the file carries a version, and the first launch moves what browser
storage held into it, as the settings did. Beside the reset in the footer go two plain
doors: save the history as a file somebody can keep, and delete it after asking. Neither
crosses a non-goal. "Audio recording or export to WAV or MP3" is about sound, and this
exports records of attempts as JSON. "User accounts, cloud storage or sync across
machines" is about leaving the machine, and this file stays in the local profile unless
its owner carries it somewhere. Done when the history survives a restart from the file,
a damaged record costs only itself, and both doors work.

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
