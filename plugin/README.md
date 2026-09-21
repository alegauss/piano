# Piano for Claude Code

A piano Claude Code can write scores for, play and teach from. The plugin brings
the MCP server that validates and keeps scores and drives the Piano app, and four
commands named after what people ask for.

## Install

In Claude Code:

```
/plugin marketplace add alegauss/piano
/plugin install piano@piano
```

Nothing else to configure: the server ships inside the plugin and needs only
Node 20 or later. The tools that write, check and keep scores work straight
away. The ones that play need the Piano app open; without it they say where to
get it.

## Commands

| Command                  | What it does                                        |
| ------------------------ | --------------------------------------------------- |
| `/piano:compose <piece>` | Writes a score, checks it, keeps it and plays it    |
| `/piano:play [how]`      | Plays what is open, optionally slower or from a bar |
| `/piano:practise <what>` | Repeats a passage, graded, at a tempo that climbs   |
| `/piano:level <level>`   | Sets beginner, intermediate or advanced             |

## Where things are kept

Scores go in `~/.piano/library`, or wherever `PIANO_LIBRARY` points. A running
app leaves a small file in `~/.piano/windows` saying where it listens; the server
reads it to find the window in front of you and removes nothing there.

## Versions

The plugin and the app are updated separately. They check each other's link
version on every request, and a mismatch says which of the two to update.
