# Piano VERSION

Download the file for your computer from **Assets** below.

| Your computer                         | The file that ends in |
| ------------------------------------- | --------------------- |
| Windows 10 or 11                      | `-win-x64.exe`        |
| Mac with Apple silicon (M1 and later) | `-mac-arm64.dmg`      |
| Mac with an Intel processor           | `-mac-x64.dmg`        |
| Linux                                 | `.AppImage`           |

Not sure which Mac you have? Apple menu → **About This Mac**: "Chip: Apple M…"
is Apple silicon, "Processor: … Intel" is Intel.

## The first time you open it

These builds are not signed yet. Signing is bought, and it is its own step; until
it is done your system warns you the first time you open Piano. This is what you
will see, and how to get past it.

**Windows.** A blue window says "Windows protected your PC". Click **More info**,
then **Run anyway**. The installer then asks where to put Piano; it installs for
your account only and adds a Start menu entry.

**Mac.** Open the disk image and drag Piano into Applications. The first time you
open it, macOS says Apple could not check it for malicious software. Click
**Done**, not Move to Bin. Then open **System Settings → Privacy & Security**,
scroll down to the line saying Piano was blocked, click **Open Anyway**, and
confirm. You are asked once.

If macOS says instead that Piano "is damaged and can't be opened", that is the
same missing signature on a downloaded app, not a broken file. Open Terminal and
run:

```
xattr -dr com.apple.quarantine /Applications/Piano.app
```

then open Piano again.

**Linux.** Make the file executable and run it:

```
chmod +x Piano-*.AppImage
./Piano-*.AppImage
```

Some distributions need FUSE to run an AppImage (the `libfuse2` package).

## The recorded piano

Piano plays a synthesised piano from the first moment. Its footer offers to
download the recorded one, and says how big it is before it starts. The download
can be stopped, carries on where it left off, and checks every file before Piano
uses it.

## With Claude Code

In Claude Code:

```
/plugin marketplace add alegauss/piano
/plugin install piano@piano
```

The plugin and this app share the version number VERSION, which Piano shows in
its footer. If one of them is older than the other can talk to, Claude Code says
which one to update.
