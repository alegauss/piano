// The copy lives here and nowhere else. Every section imports a value from this module and only
// renders it, so a claim is an array element a reviewer can check against the product rather
// than a string welded into the markup that displays it. The composition (which section, in
// which order, the figures) lives in the JSX; this file is the words.
//
// Every name and count about the product comes from ./product, which is generated from the
// repository on every build. The copy states the reason and the generator states the number:
// a tool renamed in apps/mcp-server, a fourth level or a first release reaches the page without
// anybody retyping it, and a tool the prose names that no longer exists fails the build.
import { Spelled, command, listed, product, releasesUrl, repoUrl, spelled, tool } from './product'
import { asset, href } from './paths'

export type Run =
  string | { code: string } | { b: string } | { i: string } | { a: string; href: string }

export type Rich = Run[]

export { releasesUrl, repoUrl }

const toolCount = product.tools.length
const released = product.release !== null

/* ------------------------------------------------------------------ meta + chrome */

export const meta = {
  title: 'Piano: a piano Claude Code writes for, plays and teaches',
  description: `A free desktop piano for Windows, macOS and Linux that plays scores as notes falling onto a keyboard and teaches them bar by bar, with a Claude Code plugin whose ${spelled(toolCount)} tools write a score, check it, keep it and play it in the open window.`,
  og: {
    title: 'Piano',
    description:
      'Notes falling onto a keyboard, a grade per bar rather than a percentage, and a Claude Code plugin that writes the score you want to learn.',
  },
} as const

export const parentUrl = 'https://alegauss.github.io/'

// Section anchors act on the landing page; href() makes them resolve the same from every route.
export const navLinks = [
  { href: href('/#claude'), label: 'Claude Code' },
  { href: href('/#roll'), label: 'Falling notes' },
  { href: href('/#practice'), label: 'Practice' },
  { href: href('/claude-code'), label: 'Tools' },
] as const

export const footer = {
  links: [
    { href: href('/claude-code'), label: 'Claude Code' },
    { href: repoUrl, label: 'GitHub' },
    { href: `${repoUrl}/releases`, label: 'Releases' },
    { href: `${repoUrl}/blob/main/docs/ROADMAP.md`, label: 'Roadmap' },
    { href: `${repoUrl}/blob/main/CONTRIBUTING.md`, label: 'Contributing' },
    { href: `${repoUrl}/blob/main/LICENSE`, label: 'Licence' },
  ],
  // The licence is a link to the file rather than a string to keep true, and the recorded piano
  // is credited because its licence asks for it wherever it is used.
  disclaimer: `An independent project, not affiliated with or endorsed by Anthropic. “Claude” and “Claude Code” are trademarks of Anthropic. The recorded piano is the Salamander Grand Piano V3 by Alexander Holm, under CC-BY-3.0. Piano itself is ${product.license}, in LICENSE. © 2026 Alexandre Oliveira.`,
} as const

/* --------------------------------------------------------------- sponsor */

// Mirrors alegauss.github.io/sponsor.json, the sponsor declaration for these projects.
// Transcribed rather than fetched at runtime: the site is prerendered, and the point of naming
// a sponsor is that crawlers and agents read it in the served HTML.
export const sponsor = {
  label: 'Sponsored by',
  name: 'Viglet',
  url: 'https://www.viglet.org',
  siteLabel: 'viglet.org',
  logo: asset('viglet/viglet-logo.png'),
  summary:
    'Open source search and content tools for organisations with a lot to publish. Run on your own servers, with no per-user licence.',
  products: [
    {
      name: 'Viglet Turing ES',
      url: 'https://turing.viglet.org',
      logo: asset('viglet/turing-logo.png'),
      inline:
        'so visitors find what they came for, with AI answers drawn only from your own content',
    },
    {
      name: 'Viglet Shio CMS',
      url: 'https://shio.viglet.org',
      logo: asset('viglet/shio-logo.png'),
      inline: 'so a new page goes live the same day, reviewed and approved by your own team',
    },
  ],
} as const

/* ------------------------------------------------------------------ hero */

export const hero = {
  badge: `Windows · macOS · Linux · ${product.license}`,
  titleLead: 'A piano Claude Code',
  titleAccent: 'writes for, plays and teaches.',
  sub: [
    'Piano plays a score as notes falling onto a keyboard, and then teaches it: it ',
    { b: 'waits for you' },
    ', tells you ',
    { b: 'which bars' },
    ' went wrong, and raises the tempo each time you get a passage right. Its plugin gives Claude Code ',
    { b: `${spelled(toolCount)} tools` },
    ' to write the piece you asked for, check it, keep it in your library and play it in the window in front of you.',
  ] as Rich,
  // No emoji on these: an emoji glued to a feature line is the most recognisable mannerism of a
  // generated landing page, and these strings are bullets in the twin an agent reads.
  meta: ['Free, no account', 'No telemetry', 'Your library stays on your disk'],
  pills: [
    [{ b: 'Electron' }, ' · React · Web Audio'] as Rich,
    ['Score format ', { b: `v${product.formatVersion}` }, ', JSON'] as Rich,
    [{ b: `${toolCount} MCP tools` }, ' · ', { b: `${product.commands.length} commands` }] as Rich,
    ['A ', { b: 'MIDI keyboard' }, ' or the computer keys'] as Rich,
  ],
}

/* ------------------------------------------------------------------ hero session */
// The tool names below go through tool() and command(), so each is one the server registers
// today; the replies are shortened and illustrative, and the note under the transcript says so.
// Rendered as an autoplaying transcript that scrolls its own list, never the page.

export const heroSession = {
  eyebrow: 'One sentence, and a piece is playing',
  question:
    'write me a short waltz in G for a beginner, right hand melody, and let me practise the first four bars',
  steps: [
    {
      cmd: `${command('/piano:compose')} a short waltz in G, beginner, right hand`,
      kind: 'writes',
      out: 'Loads the piano-score skill and writes the score: 16 bars in 3/4, one part, the melody in the right hand.',
    },
    {
      cmd: tool('validate_score').name,
      kind: 'checks',
      out: 'Valid, with nothing to fix. An invalid score comes back field by field, and is corrected and checked again.',
    },
    {
      cmd: tool('save_score').name,
      kind: 'keeps',
      out: 'Filed in the library as little-waltz-in-g, the id every other tool addresses it by.',
    },
    {
      cmd: tool('play').name,
      kind: 'plays',
      out: 'Opens the app if it is not open, brings it to the front if it is, and plays the waltz.',
    },
    {
      cmd: `${tool('practise').name}  bars 1–4, right hand, from half speed`,
      kind: 'teaches',
      out: 'Repeats the passage, graded: a clean pass steps the tempo up, a miss drops it back.',
    },
  ],
  foot: ['One sentence from you', 'No file you had to name', 'Nothing left the machine'],
  note: [
    'A scripted session with the replies shortened. The tool names are the server’s own, read out of its source when this page was built. The server takes no file path and runs no command: ',
    { code: tool('save_score').name },
    ' writes into ',
    { code: '~/.piano/library' },
    ' and nowhere else.',
  ] as Rich,
}

/* ------------------------------------------------------------------ who does what + the rules */

export const operator = {
  eyebrow: 'Who does what',
  heading: 'Claude writes the music. You play it.',
  intro: [
    'Most of what stands between a person and a piece they want to learn is the score: finding one at the right level, in a form the app can read. Here that is Claude Code’s job, and the app’s job is everything after it.',
  ] as Rich,
  actors: [
    {
      who: 'Claude',
      sub: 'Claude Code, with the plugin',
      iface: 'the piano MCP server, over stdio',
      job: 'Writes the score, checks it, files it, and starts and steers the window',
    },
    {
      who: 'You',
      sub: 'at the keyboard',
      iface: 'the window, a MIDI keyboard or the computer keys',
      job: 'Listen, play along, practise, and decide what to keep',
    },
  ],
  actorsNote: [
    'The app is a piano before it is a tool: everything the plugin can do, the window also does with its own controls, and it opens with scores to play before Claude has written one.',
  ] as Rich,
  lawsEyebrow: 'What it is built on',
  lawsHeading: 'Six rules, each against a mistake',
  lawsIntro: [
    'Binding in the sense that a feature breaking one is wrong even if it was asked for. Each names the mistake it prevents.',
  ] as Rich,
  laws: [
    {
      id: 'P1',
      title: 'A grade names bars, never a percentage',
      body: '“82%” tells nobody what to do next. “Bars 17 to 20, left hand, late” does, so the report is per bar and per section.',
    },
    {
      id: 'P2',
      title: 'The server names no file and runs no command',
      body: 'Its transport takes a closed set of requests, so a score Claude writes can only ever be a score filed in your library.',
    },
    {
      id: 'P3',
      title: 'One score format, with one owner',
      body: 'Every reader and writer goes through packages/score-format, and a check refuses a second copy, so the app never accepts a file the server rejects.',
    },
    {
      id: 'P4',
      title: 'An easier level only takes notes away',
      body: 'A beginner arrangement derived from the score removes notes and never invents one, so what you learn is still the piece.',
    },
    {
      id: 'P5',
      title: 'The sheet music never writes back',
      body: 'It is a view of the score, not an editor, so the file you practise is exactly the file that was written.',
    },
    {
      id: 'P6',
      title: 'Nothing leaves the machine',
      body: 'Library, practice history and settings are local files. The one outbound request is the recorded piano, and only when you ask for it.',
    },
  ],
}

/* ------------------------------------------------------------------ why */

export const why = {
  eyebrow: 'Why it is shaped like this',
  heading: 'Three things a practice app usually gets wrong',
  intro: [
    'Each is a reason somebody stops practising, and each is answered here by what the app does rather than by a setting.',
  ] as Rich,
  cards: [
    {
      icon: '🎹',
      title: 'It plays from the first second',
      body: [
        'A synthesised piano sounds the moment the app opens, matched in loudness and attack to the recorded one, so nothing waits on a download. The recorded piano is offered after, with its size stated first.',
      ] as Rich,
    },
    {
      icon: '🎯',
      title: 'It teaches rather than scores',
      body: [
        'Each note comes back in time, early, late, wrong or missed, gathered per bar. The drill repeats the passage that needs it and moves the tempo by what you just played.',
      ] as Rich,
    },
    {
      icon: '✍️',
      title: 'You can learn what you want to learn',
      body: [
        'Ask for a piece at your level and Claude writes it. For a piece still under copyright it offers an original in that style instead of a copy.',
      ] as Rich,
    },
  ],
}

/* ------------------------------------------------------------------ the roll */

export const roll = {
  eyebrow: 'Falling notes',
  heading: 'The notes fall onto the keys you press',
  intro: [
    'The piano roll is drawn from the audio clock rather than the screen’s, so a note lands on its key at the moment it sounds, whatever the frame rate is doing.',
  ] as Rich,
  caption: [
    'Illustrative. Each part has its own colour, a key lights as its note arrives, and the lane above the keys marks each note you played ',
    { b: 'early or late' },
    '.',
  ] as Rich,
  list: [
    [
      { b: 'See as far ahead as you like' },
      ': the look-ahead goes from half a second to twelve.',
    ] as Rich,
    [
      { b: 'Loop a passage' },
      ' by dragging across the roll, or ',
      { code: 'L' },
      ' from the keyboard.',
    ] as Rich,
    [
      { b: 'Or read it' },
      ': the same score as sheet music, one stave per hand, with a band that follows the playhead.',
    ] as Rich,
    [
      { b: 'Transpose' },
      ' everything by up to two octaves, and hear or watch each part and each hand on its own.',
    ] as Rich,
    [{ b: 'Full screen' }, ' shows nothing but the roll and the keyboard.'] as Rich,
  ],
}

/* ------------------------------------------------------------------ practice */

export const practice = {
  eyebrow: 'Practice',
  heading: `${Spelled(product.levels.length)} levels, and a drill that listens`,
  intro: [
    'A level is a way of playing the same piece, not a different piece. Where the score has its own arrangement for a level the app uses it; otherwise it derives one by taking notes away.',
  ] as Rich,
  // generated: the app's own sentence for each level
  levels: product.levels,
  listHeading: 'What happens while you play',
  list: [
    [
      { b: 'Wait for me' },
      ' stops the score at each note until you play it, so a beginner is never behind.',
    ] as Rich,
    [
      { b: 'Graded per note' },
      ': in time, early, late, wrong pitch or missed, plus anything extra, reported by bar and by section. With a MIDI keyboard, touch gets a line of its own.',
    ] as Rich,
    [
      { b: 'Gentle, steady or strict' },
      ': how wide the window is before a note counts as early or late.',
    ] as Rich,
    [
      { b: 'The drill' },
      ' repeats a passage at a tempo that climbs after a clean repetition and drops back after a failed one, with either hand or both, the other hand accompanying or silent.',
    ] as Rich,
    [
      { b: 'Latency calibration' },
      ': the app clicks, you strike along, and it takes the median, per device, so your timing is judged and not your audio driver’s.',
    ] as Rich,
    [
      { b: 'Your history' },
      ' is kept between sessions on your disk, and the footer saves it to a file or erases it.',
    ] as Rich,
  ],
}

/* ------------------------------------------------------------------ library + sound */

export const library = {
  eyebrow: 'The library',
  heading: 'Something to play within minutes of installing',
  intro: [
    `A fresh install opens with ${listed(product.bundled.map((b) => b.title))}: public domain, each with its own beginner, intermediate and advanced arrangement.`,
  ] as Rich,
  list: [
    [
      'Every score Claude saves lands in ',
      { code: '~/.piano/library' },
      ', searchable by title, composer, level and tag.',
    ] as Rich,
    [
      'Drop a ',
      { code: '.mid' },
      ', ',
      { code: '.musicxml' },
      ' or ',
      { code: '.mxl' },
      ' into that folder and it is imported; drop one on the window and it opens.',
    ] as Rich,
    [
      'Correct a title, a composer or a level without touching the notes; a deleted piece goes to the system bin.',
    ] as Rich,
    ['Save as MIDI exports the arrangement that is playing, for a DAW or another app.'] as Rich,
  ],
  soundHeading: 'The recorded piano, when you want it',
  sound: [
    'The footer offers the Salamander Grand Piano, a Yamaha C5 recorded by Alexander Holm, and says how big it is before anything is fetched. The download can be stopped and picks up where it left off, every file is checked against its hash, and the synthesised piano plays until the last one is in.',
  ] as Rich,
}

/* ------------------------------------------------------------------ non-goals */

export const nonGoals = {
  eyebrow: 'Scope',
  heading: 'What it will not become',
  intro: [
    'Written down so they can be pointed at. Each one is somebody else’s product done well, and doing it here would make this one worse.',
  ] as Rich,
  items: [
    {
      title: 'A notation editor',
      body: 'The sheet view is for reading. Writing the score is Claude Code’s job, in the score format.',
    },
    {
      title: 'Audio recording or export',
      body: 'Export MIDI and use a DAW, which will always do it better.',
    },
    {
      title: 'Accounts, cloud storage or sync',
      body: 'The library, your progress and your settings stay on your own disk.',
    },
    { title: 'Other instruments', body: 'It is a piano, and every screen assumes one.' },
    {
      title: 'Listening through a microphone',
      body: 'Input is a MIDI keyboard or the computer keys, which say exactly what was played.',
    },
    {
      title: 'Transcribing recordings or PDFs',
      body: 'MP3, YouTube and scanned sheet music are not scores, and guessing at them teaches the wrong notes.',
    },
    {
      title: 'Copyrighted scores',
      body: 'What ships is public domain, with its source and licence recorded in the file.',
    },
    {
      title: 'A web or mobile version',
      body: 'It is a desktop app, where MIDI and low latency are.',
    },
  ],
}

/* ------------------------------------------------------------------ install */

export const install = {
  eyebrow: 'Install',
  heading: 'Two lines in Claude Code, and the app',
  intro: [
    'The plugin brings the MCP server and the commands. It needs only Node ',
    { code: `${product.node}` },
    ' or later, and the tools that write, check and keep scores work before the app is installed.',
  ] as Rich,
  pluginLines: [
    `/plugin marketplace add ${product.repo}`,
    `/plugin install ${product.plugin}@${product.marketplace}`,
  ],
  appHeading: released ? 'The app, for your computer' : 'The app, from source for now',
  // The release is read from the repository's tags at build time, so this section changes its
  // own wording the day one is tagged rather than waiting for somebody to notice.
  app: released
    ? ([
        'The release page has an installer for Windows, a disk image for each kind of Mac, and an AppImage for Linux. They are not signed yet, so your system warns the first time; the release notes show what it says and how to get past it.',
      ] as Rich)
    : ([
        { b: 'No release has been tagged yet' },
        ', so there is nothing to download today. The app runs from a clone with Node ',
        { code: `${product.node}` },
        ' or later; installers for Windows, macOS and Linux come with the first release.',
      ] as Rich),
  sourceLines: [`git clone ${repoUrl}.git`, 'cd piano', 'npm ci', 'npm run dev'],
  cta: '⬇ Download Piano',
  ctaShort: released ? '⬇ Download' : 'Install',
  secondary: 'Release notes',
  released,
  facts: released
    ? [
        'Windows 10 or 11, installed for your account only',
        'macOS on Apple silicon or Intel',
        'Linux, as an AppImage',
      ]
    : [
        `Version ${product.version} on main`,
        `Node ${product.node} or later`,
        'Windows, macOS or Linux',
      ],
}

/* ------------------------------------------------------------------ /claude-code */

// Every tool in exactly one group, and the page test fails if one is left out: a tool added to
// the server shows up as a build failure until somebody says where it belongs.
export const toolGroups = [
  {
    heading: 'Write and keep',
    tools: [
      'validate_score',
      'save_score',
      'read_score',
      'correct_score',
      'delete_score',
      'list_scores',
      'search_scores',
    ].map(tool),
  },
  {
    heading: 'Play',
    tools: ['play', 'stop', 'seek', 'set_tempo', 'set_transpose', 'set_level', 'piano_state'].map(
      tool,
    ),
  },
  { heading: 'Teach', tools: ['practise'].map(tool) },
]

export const claudeCode = {
  meta: {
    title: `Piano for Claude Code: ${spelled(product.commands.length)} commands and ${spelled(toolCount)} tools`,
    description: `The Piano plugin for Claude Code: an MCP server with ${spelled(toolCount)} tools that write, check, keep and play scores in the open Piano window, and ${spelled(product.commands.length)} commands named after what people ask for.`,
    ogTitle: 'Piano for Claude Code',
    ogDescription: `${Spelled(toolCount)} tools and ${spelled(product.commands.length)} commands: write a score, check it, keep it, play it, practise it.`,
  },
  eyebrow: 'Claude Code',
  heading: 'What the plugin gives Claude',
  intro: [
    'An MCP server that validates and keeps scores and drives the Piano app, a skill that teaches the score format by example, and commands named after what people ask for. Every name on this page is read out of the plugin’s source when the page is built.',
  ] as Rich,
  installHeading: 'Install it',
  installNote: [
    'Nothing else to configure: the server ships inside the plugin. The tools that play start the app if it is installed and not open, bring its window to the front if it is, and say where to get it if it is not installed.',
  ] as Rich,
  commandsHeading: 'The commands',
  commandsLead:
    'Each is a sentence you would have typed anyway, with the tool calls worked out for you.',
  toolsHeading: 'The tools',
  toolsLead: [
    'In three groups, each with the first sentence of its own description. Only these reach the app, over a loopback connection that needs the token the running app wrote.',
  ] as Rich,
  skillHeading: 'The loop it follows',
  skill: [
    [
      'The ',
      { code: 'piano-score' },
      ' skill shows the format by example and lists the numbers that are easy to get wrong: ticks per quarter, pitches, the length of a bar.',
    ] as Rich,
    [
      { code: tool('validate_score').name },
      ' answers field by field, and its warnings (the hands crossing, a chord one hand cannot span) are read and fixed where they are mistakes.',
    ] as Rich,
    [
      'Only a valid score is saved; ',
      { code: tool('save_score').name },
      ' refuses one that is half right rather than keeping it.',
    ] as Rich,
    [
      'Then ',
      { code: tool('play').name },
      ', and on request ',
      { code: tool('practise').name },
      ' for the passage you name.',
    ] as Rich,
  ],
  refusesHeading: 'What it refuses',
  refusesLead: [
    'The server is small on purpose. These are the things an agent with a piano might be expected to do, and does not.',
  ] as Rich,
  refuses: [
    {
      t: 'Copying a copyrighted piece',
      b: 'The compose command offers an original in that style instead.',
    },
    { t: 'Writing a file you name', b: 'Scores go into the library, by id, and nowhere else.' },
    { t: 'Running a command', b: 'The transport takes a closed set of requests and no code.' },
    {
      t: 'Deleting without a way back',
      b: 'A deleted score goes to the system bin; with the app closed, a second call must say so.',
    },
  ],
}
