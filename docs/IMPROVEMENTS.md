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

### §PI107 The two verbs chat cannot reach alone

delete_score and correct_score go through the one library module the window writes with,
so the rules about ids, moves and clashes are the same rules. Two things are not in that
module, and both are the window's. The system's bin is one: main hands its library a
discard that is shell.trashItem, and the server, being plain Node with no bin to reach,
unlinks. The practice history is the other: a correction gives a piece an id and may
move it, and the window follows its records to the new key, while the server cannot.

So a model deleting a score destroys it, where deleting the same score in the panel does
not, and a model retitling one loses the practice a person's retitle keeps. Neither is
said anywhere a person would see it; delete_score's description admits the first, which
is a warning and not an answer.

Both reach the same way. When a window is listening the link already carries commands to
it, and the window holds the bin and the history; a verb sent there is answered with one
set of rules and no second bin invented. When none is, the honest answer differs per
verb: a delete that cannot be undone should say so before it happens, and a correction
should leave a note main applies when the window next reads the history. Decide that
split here rather than per tool, or the two verbs drift apart the way the two libraries
just did.

### §PI108 The doors a correction does not reach

A correction now reaches the app's own recent list, and neither of the other two ways an
entry goes stale does. Deleting a piece leaves the entry naming it: the file is in the
bin, and picking the entry answers that it is not there any more, which is true and is
not what somebody asked for. The system keeps a list of its own too — Windows pins it to
the taskbar, macOS to the dock — written by addRecentDocument as a score opens and never
touched since, so a piece that moved is offered there at the path it used to have.

The first is a write beside the one a correction already makes: main holds the list and
the deletion goes through main, so the entry naming the file that went is dropped.
Whether a piece out of the bin wants its place back answers itself — it comes back
through an open, which writes an entry anyway.

The second has one lever and it is blunt: Electron can clear the system list and add to
it, and cannot amend it. So either the app rebuilds that list from its own after a
write, which means clearing somebody's list and putting back only what this app knows
about, or it leaves it alone and accepts one stale door until the piece is opened again.
Decide which, and say so where addRecentDocument is called, rather than leaving the next
reader to wonder whether it was missed.

## Block H — Sheet music view
