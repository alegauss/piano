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

### §PI101 Taking a piece out of the library

A library that only grows is a library that fills with mistakes: the import that came in
twice, the download that turned out to be a drum track, the piece filed as Untitled
before anyone knew what it was. Today the only way out is the file manager — find the
library folder under the home directory, work out which .piano file is which from names
safeName() has already reduced to lower case and hyphens, and delete it there. The
listing does notice, because every listing compares the index with the directory, but
somebody who never opens a terminal has to be told where the folder is before any of
that helps.

Delete belongs on the row, beside opening it. What it must not be is a button that
quietly destroys the only copy of a piece somebody asked for last week: ask once, and
name the piece by title, composer and length, the way the filing clash already names
what is in the way. Electron's shell.trashItem puts the file in the system's bin rather
than unlinking it, which makes a wrong click recoverable without this app growing a bin
of its own.

Two records outlive the file. The seeded list already remembers which shipped scores
were given, so a deleted sample does not come back next launch; that is deliberate and
stays. Practice history does not, and what becomes of it is PI103's question.

### §PI102 One name everywhere

A score is addressed by an id, and libraryId() takes it from metadata.id where there is
one and from the title where there is not; safeName() then reduces it to a file name. So
a piece filed as Untitled lives in untitled.piano, and correcting its title to something
a person would recognise writes the new title into that same file. Nothing lies, but
nothing agrees either: the panel shows the new title, the folder shows the old name, and
a model opens it by the id it had.

Renaming should move the file. keep() already writes one name and removes the others, so
the write itself is small; the edges are why this is a task rather than a line inside
the edit. The new id may be taken, and then it is exactly the clash the filing form
knows how to ask about — file it beside, or replace what is there. The old id may be
what a chat, a recent-files entry or a shortcut still names, so a rename has to say
plainly what the piece is called now rather than leaving somebody to find out when
opening it fails. And a piece whose metadata.id was set deliberately keeps it: the id is
the stable handle records are kept against, and a title is not, which is the distinction
the format already draws and this must not blur.

### §PI103 History that survives a correction

Every practice record is keyed on the score's own id, or on what it is called where it
has none. The format says why in the metadata comment: a piece re-saved, retitled or
corrected is the same piece, and weeks of records should not turn on somebody spelling
the composer properly. The catch is that most pieces in a real library have no id. An
import takes one from a track name only if it carries one, a score written for the app
has whatever it was given, and the library never sets one itself — libraryId() falls
back to the title. So the protection the format describes is not there for the files
people actually have, and retitling is about to become one click.

Two things follow. An edit is the moment to give a piece a stable id, taken from what it
is filed under now, so its record goes on matching whatever the title becomes. Where
records already exist under the old key, they move with it rather than starting over;
the history file is main's and written whole, so this is a rewrite of a key and not a
migration.

Deleting is the other half. Records for a piece that has gone are dead weight, but they
are also the only thing that says somebody practised it. Ask, or keep them, and say
which when the piece is deleted.

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
step. The MCP server and the app already read and write through one library module;
these two go through it too.

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

Worth doing after the file can move rather than before. A rename makes the path stale
too, and the answer is the same write from the same place: whatever PI102 decides about
what a piece is called now has to reach this list, and deciding it twice is how the two
answers end up different. So this is the title half, already wrong without any renaming
at all.

## Block H — Sheet music view
