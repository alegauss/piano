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

### §PI104 The same two verbs from chat

The project's first premise is that Claude Code is a first-class way to use the app:
save_score writes a piece, list_scores and search_scores find one, play and practise
drive the window. The library's other two verbs are missing. A model cannot remove a
piece it has just written badly, and it cannot correct what one says without re-saving
the whole score — read it, edit the JSON, write it back: three calls that can half-fail,
in place of one that cannot, and every one of them a chance to lose a bar while fixing a
level.

delete_score takes an id and nothing else, which is the rule this package already
enforces everywhere: no tool call names a path, and an id is reduced to a name under one
root before it is a file name at all. The update takes an id and the fields to change,
validates the result against the same schema the app opens by, and leaves the notes
alone.

Both belong after the window's own edit and delete rather than before. What to do about
a taken id, about a piece being renamed, and about practice history is decided there,
and a tool that answered any of it differently would be a second set of rules to keep in
step. The MCP server and the app read and write through one library module, but not one
filesystem: the window's library was handed a discard that is the system's bin, and the
server's was not.

### §PI105 Tidying more than one piece

Everything the panel does is one row at a time, which is right for opening a piece and
wrong for tidying. A library grows by the batch — a folder of downloads copied in, the
shipped scores seeded on first launch, an afternoon of asking for studies — and it is
tidied by the batch too: eleven MIDI files that all arrived as Untitled, a dozen pieces
that want the same tag, a set somebody has outgrown. Deleting those one at a time is
eleven confirmations, and nobody gets to the eleventh.

So rows can be picked: a box on each, a count of what is picked, and two things to do
with a selection. Delete it, asking once and naming how many pieces rather than asking
eleven times. And tag it, because tags are what make a large library searchable and
adding one to eleven pieces is otherwise eleven trips through the edit form. Level can
follow the same path if it turns out people want it.

The panel re-asks for its list whenever anything changes, including a file arriving in
the folder while it is open, so a selection has to survive a refresh that leaves the
rows alone and be dropped by one that does not. What this is not is a file manager: no
folders, no moving, no renaming in bulk — a rename asks a clash question that only makes
sense about one piece.

### §PI106 Open recent, after a piece is put right

The recent list is a cache of titles nothing refreshes. An open writes one entry — the
path, the file name and the title the score had at that moment — and from then on the
menu and the Open recent list read the entry and never the file. That was harmless while
a title could only be set as a piece was filed. Correcting one is a second writer, so a
piece put right from the library panel is offered under the name somebody has just taken
back, until they open it again and the entry is rewritten by accident.

The entry is keyed by path and a correction never moves the file, so the fix is a write
and not a migration: after a correction main rewrites the entry naming that file, where
there is one. Main is the side that can do it — it holds the list, and the correction
already goes through it, so nothing new crosses the bridge. A correction landing on a
piece no entry names changes nothing, which is the ordinary case.

Both halves are wrong now. PI102 made a retitle move the file, so an entry can name a
path that is not there and an open from the menu fails outright; the title was already
stale without any renaming. Main is told where a moved file went, through the port that
follows the open score, and this list wants the same write from the same place.

## Block H — Sheet music view
