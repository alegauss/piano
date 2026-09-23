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

### §PI110 Installers that survive the release workflow

The release workflow builds an installer on each system and runs the association check
against it, and the CI job that does the same has failed on all three systems for weeks,
so the first tag would have produced a draft that never published.

Linux never got as far as the check: electron-builder takes the executable name from the
workspace package, `@piano/desktop`, and refuses to build an AppImage from it. The Linux
section now names it `piano`.

Windows installed correctly and failed on the way out. electron-builder's unassociate
deletes the `Piano score` program id but leaves `.piano` naming it, so an uninstalled
piano still claims its extension. `customUnInstall` now removes `.piano` when it still
names that id, and leaves it alone when something else has taken it since.

macOS registered the app, but the check looked for a `bundle id:` line holding the
identifier, and a current `lsregister -dump` labels it `identifier:` and may follow it
with the record's number. Both spellings are read now, and a miss reports how the
identifier does appear in the dump, so a further change of format can be read from the
CI log without a Mac.

## Block H — Sheet music view

## Block I — Public site
