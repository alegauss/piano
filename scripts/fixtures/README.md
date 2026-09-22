# Association fixtures

One file per type the installer claims, for `check-associations.mjs` to hand to an
installed app. They are committed rather than built, because the check runs on a release
runner with only the packaged app and this repository, and because a fixture that is
generated is a fixture nobody has looked at.

They are data and not a second copy of any format. Each was written once, by
`packages/score-format`'s own writer, and read back through its own reader:

- `association-check.mid` — `exportMidi` over `apps/desktop/src/main/bundled/ode-to-joy.score.json`.
- `association-check.musicxml` — four quarter notes and the attributes an importer needs.
- `association-check.mxl` — the same document, in the container `musicXmlText` reads:
  a deflated zip holding `META-INF/container.xml` and the `.musicxml` it names.

Nothing depends on the music in them. What is being checked is that a path handed over by
the shell survives being installed and comes back as `piano: opened <name>`, and a `.mxl`
is the longest way round to that: a zip to open, a container to read, an import to run.

Replacing one is a matter of writing the new file and running the check. Keep them small
and keep them public domain, which is what the bundled score already is.
