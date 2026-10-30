# Improvements

## Block A — Foundation: Electron, TypeScript, React and shadcn

### §PI57 Distributing the Windows build through the Microsoft Store

Rewritten after the portfolio review of 30/10/2026 (visibility,
`estrategia/portfolio.md`). The consequence of shipping unsigned stays as written: on
Windows a first-time user sees a blue panel naming an unknown publisher, and somebody
who wanted to try a piano does not click past it. The answer changed. The decision for
all of the author's Windows apps is the Microsoft Store, which signs the MSIX package
itself, in place of buying a certificate. claude-tray tests the path first (visibility
VS58); this line follows what that test learns. The macOS half (Apple's developer
account and notarisation) is a separate line, PI114, since the Store answers only
Windows.

electron-builder supports an `appx` target, so the package is mostly configuration plus
the Store's identity. Piano's own points to check: Web MIDI access to a connected
keyboard inside the packaged app; the library in `~/.piano/library` and the scores
dropped into it, which an MSIX app must still read and write where the user sees them;
the optional download of the recorded piano; and the MCP server the Claude Code plugin
starts, which has to find the Store-installed app.

Done when Piano is listed in the Store and a MIDI keyboard plays in the Store build, or
the reason it cannot be is recorded here.

### §PI114 PI114 — Notarising the macOS build

Split from PI57 after the portfolio review of 30/10/2026 (visibility,
`estrategia/portfolio.md`), when Windows moved to the Microsoft Store. macOS still needs
what PI57 described: an Apple Developer account, an application-specific password and a
notarisation step that uploads each build to Apple and waits for an answer. Until then
the app refuses to open until the user right-clicks and confirms, and the release notes
explain the steps. electron-builder's mac block names where the identity would go and is
left empty on purpose, so a half-configured step never fails at the end of a long build.

This is a purchase (Apple's yearly fee) and an account to hold, so it waits for the
decision to spend it, which the Store test on Windows may inform. It does not cross
"User accounts, cloud storage or sync across machines": it is the publisher's account,
and nobody who plays the piano ever has one.

Done when a downloaded macOS build opens without the Gatekeeper prompt.

## Block B — Score JSON format

## Block C — Audio engine and transport

## Block E — Practice mode and difficulty levels

## Block F — Claude Code First: MCP and plugin

## Block G — Score library and distribution

## Block H — Sheet music view

## Block I — Public site

### §PI112 PI112 — Opening on the piano learner

From the portfolio review of 30/10/2026 (visibility, `produtos/piano.md` and
`estrategia/portfolio.md`), where the author confirmed that the main audience is people
learning the piano, and Claude Code is an extra. The README and the site both open on "A
piano Claude Code writes for, plays and teaches", so a learner who arrives from r/piano
or a search for a free Synthesia alternative reads first about a tool they do not use,
and leaves. The two audiences barely overlap, and the first line has to choose.

The README's title line and first paragraph, and the site's hero and meta description,
open on the learner: free falling-notes practice with a MIDI keyboard or the computer
keyboard, a report per bar "never a percentage", a tempo that rises with each clean
repetition, three levels of the same piece, no account and no subscription. The
comparison everyone will make (Synthesia, Simply Piano, Neothesia) is answered on the
page. The Claude Code plugin keeps its own section further down, presented as what it
is: an extra for people who already use Claude Code, which can write and arrange pieces
for the library.

Done when the first screen of the README and of the site speaks to someone learning the
piano and mentions Claude Code only after that.

### §PI113 PI113 — A LICENSE file GitHub recognises as MIT

From the portfolio review of 30/10/2026 (visibility, `produtos/piano.md`). The project
is MIT and `package.json` says so, but GitHub's licence detection reports `NOASSERTION`
and shows "Other" on the repository page. The cause is in `LICENSE` itself: after the
MIT text, a separator and a paragraph about the Salamander Grand Piano (CC-BY-3.0) and
the scores' own licences make the file no longer match the MIT template, so the detector
gives up. Directories such as AlternativeTo and Flathub, and any reader scanning the
sidebar, then see an unknown licence on a project whose selling point is being free.

`LICENSE` keeps only the MIT text, and the note about the sample pack and the scores
moves to a `NOTICE` file (or a "Third-party content" section of the README), linked from
the README and from wherever the app shows the sample pack's licence. Nothing about the
terms changes; only where they are written.

Done when GitHub's API reports `MIT` for the repository and the third-party note is
still one click away from the README.
