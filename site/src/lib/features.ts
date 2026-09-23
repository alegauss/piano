import type { Rich } from './site-content'
import { Spelled, listed, product, spelled, tool } from './product'

// The depth pages, one record each. The route, the title and the description are all read off
// the same record (in routes.tsx), so a page cannot ship half-declared: add a record here and
// its route, its <head> and its page appear together, or none of them do.

export interface FeatureSection {
  heading: string
  body?: Rich
  list?: Rich[]
}

export interface FeatureRecord {
  slug: string
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  eyebrow: string
  heading: string
  lead: Rich
  /** a figure key resolved to markup in the page component */
  figure?: 'roll' | 'excerpt'
  sections: FeatureSection[]
}

export const features: FeatureRecord[] = [
  {
    slug: 'falling-notes',
    title: 'Piano: the falling notes and the keyboard',
    description:
      'How Piano draws a score as notes falling onto an on-screen keyboard, in time with the audio rather than the screen, and what the roll lets you do with a passage.',
    ogTitle: 'Piano: falling notes',
    ogDescription: 'A piano roll drawn from the audio clock, a key that lights as its note lands.',
    eyebrow: 'Watch it',
    heading: 'Falling notes',
    lead: [
      'The roll is the app’s main screen: every note of the score falls toward the key that plays it, coloured by its part, and the key lights at the moment the note sounds.',
    ],
    figure: 'roll',
    sections: [
      {
        heading: 'In time with the sound, not the screen',
        body: [
          'The roll is drawn from the audio clock. A frame that arrives late draws the notes where they are, rather than where they would have been, so what you see and what you hear never drift apart over a long piece.',
        ],
      },
      {
        heading: 'What the roll does',
        list: [
          [
            'A look-ahead from half a second to twelve, for reading far ahead or only the next beat.',
          ],
          ['Drag across the roll to loop a passage, or press ', { code: 'L' }, '.'],
          [
            'A timing lane above the keys marks each note you played early or late, and a key shows whether it is expected, correct, wrong or late.',
          ],
          ['Strike effects on the keys, which can be turned off.'],
          ['Full screen, with nothing but the roll and the keyboard.'],
        ],
      },
      {
        heading: 'From the keyboard',
        list: [
          [{ code: 'Space' }, ' plays and pauses, ', { code: 'Home' }, ' goes back to the start.'],
          [{ code: '[' }, ' and ', { code: ']' }, ' take the tempo down and up.'],
          [
            'With the computer keys turned on, the Z row is an octave from C3 and the Q row the one above.',
          ],
        ],
      },
    ],
  },
  {
    slug: 'sheet-music',
    title: 'Piano: the sheet music view',
    description:
      'The same score as engraved sheet music, one stave per hand, with a band that follows the playhead. A view for reading, never an editor.',
    ogTitle: 'Piano: sheet music',
    ogDescription:
      'One stave per hand, a band that follows the playhead, and it never writes back.',
    eyebrow: 'Read it',
    heading: 'Sheet music',
    lead: [
      'One button swaps the roll for the score engraved as sheet music. It is the same score, playing at the same place, for anybody learning to read rather than to follow.',
    ],
    sections: [
      {
        heading: 'What it shows',
        list: [
          ['One stave per hand, engraved with VexFlow.'],
          ['A band that follows the playhead through the bars.'],
          ['Zoom from half size to three times.'],
        ],
      },
      {
        heading: 'Why it cannot edit',
        body: [
          'The sheet is a view of the score and never writes one back. An editor here would be a second author of the file, and the file you practise is meant to be exactly the one that was written. Changing a score is Claude Code’s job, through ',
          { code: tool('save_score').name },
          ', where it is validated before it is kept.',
        ],
      },
    ],
  },
  {
    slug: 'practice',
    title: `Piano: practice, ${spelled(product.levels.length)} levels and a graded drill`,
    description:
      'Wait mode, grading per note gathered by bar, three strictness settings, a drill whose tempo climbs, latency calibration and a history kept on your disk.',
    ogTitle: 'Piano: practice',
    ogDescription: 'A grade per bar, and a drill that raises the tempo when you get it right.',
    eyebrow: 'Learn it',
    heading: 'Practice',
    lead: [
      'Practice here is a loop the app runs with you: play a passage, be told which bars went wrong, and play it again at a tempo that follows how you did.',
    ],
    sections: [
      {
        heading: `${Spelled(product.levels.length)} levels`,
        list: product.levels.map((l) => [{ b: l.label }, `: ${l.means}`] as Rich),
      },
      {
        heading: 'How a level is made',
        body: [
          'A score can carry its own arrangement for each level, and the app plays it when it does. When it does not, the app derives one by rules that only ever remove notes, and a derived arrangement can be kept in the score file so it is not derived again.',
        ],
      },
      {
        heading: 'The grade',
        list: [
          [
            'Each note is in time, early, late, the wrong pitch or missed, and extra notes are counted too.',
          ],
          ['The report is by bar and by section, never a percentage.'],
          ['Gentle, steady or strict sets how wide the window is.'],
          ['With a MIDI keyboard, touch is reported on its own line.'],
        ],
      },
      {
        heading: 'The drill',
        body: [
          'A clean repetition steps the tempo up and a failed one drops it back. Choose the hands, whether the other hand accompanies or stays silent, and whether each repetition is counted in. Claude starts the same drill with ',
          { code: tool('practise').name },
          '.',
        ],
      },
      {
        heading: 'Fair timing',
        body: [
          'Latency calibration clicks about a dozen times while you strike along, and takes the median for that device, so an audio driver’s delay is not graded as yours.',
        ],
      },
    ],
  },
  {
    slug: 'library',
    title: 'Piano: the library and the recorded piano',
    description: `A local library that opens with ${spelled(product.bundled.length)} public-domain scores, imports MIDI and MusicXML, and a recorded grand piano downloaded only when you ask.`,
    ogTitle: 'Piano: the library',
    ogDescription: 'Scores on your disk, MIDI and MusicXML in, and a recorded piano on request.',
    eyebrow: 'Keep it',
    heading: 'The library',
    lead: [
      'Every score lives in one folder on your disk, where the app and the plugin both find it. There are no folders inside it to organise and no account behind it.',
    ],
    sections: [
      {
        heading: 'What a fresh install has',
        body: [
          `${listed(product.bundled.map((b) => b.title))}, each public domain with a hand-written arrangement for every level, copied into the library the first time the app opens.`,
        ],
      },
      {
        heading: 'Getting scores in',
        list: [
          ['Ask Claude Code, which saves into the library.'],
          [
            'Drop a ',
            { code: '.mid' },
            ', ',
            { code: '.musicxml' },
            ' or ',
            { code: '.mxl' },
            ' into ',
            { code: '~/.piano/library' },
            ' and it is imported.',
          ],
          ['Open one from the File menu or by dropping it on the window.'],
        ],
      },
      {
        heading: 'Keeping it tidy',
        list: [
          ['Search by title or composer, and filter by level and tag.'],
          [
            'Correct a title, composer or level; the notes are not touched and the practice history follows.',
          ],
          ['Delete sends a piece to the system bin, one at a time or several together.'],
          ['Save as MIDI exports the arrangement that is playing.'],
        ],
      },
      {
        heading: 'The recorded piano',
        body: [
          'The Salamander Grand Piano V3, a Yamaha C5 recorded by Alexander Holm under CC-BY-3.0, cut to four velocity layers and the release samples. The app says how big it is before downloading, the download resumes, every file is checked, and on a machine that cannot download, a copied pack or ',
          { code: 'PIANO_SAMPLE_PACK' },
          ' does the same.',
        ],
      },
    ],
  },
  {
    slug: 'score-format',
    title: `Piano: the score format, version ${product.formatVersion}`,
    description:
      'A score is one JSON object: notes in ticks with a hand, a part and a finger, a tempo map, sections, and an arrangement per level. Validated by one package that owns it.',
    ogTitle: 'Piano: the score format',
    ogDescription: 'One JSON object per piece, with one owner, and a schema to write against.',
    eyebrow: 'Write it',
    heading: 'The score format',
    lead: [
      'What Claude writes is a score in this format, and what the app plays is the same file. It is JSON so an agent can write it, and precise enough that a bar that does not add up is caught before it is kept.',
    ],
    figure: 'excerpt',
    sections: [
      {
        heading: 'What a score holds',
        list: [
          [
            'Metadata: a title, the composer, a level and a difficulty from 1 to 10, tags, and where it came from under which licence.',
          ],
          ['Timing: ticks per quarter, a tempo map and the time signatures.'],
          [
            'Notes: pitch, start and duration in ticks, velocity, and the part, hand, voice and finger.',
          ],
          ['Parts, sections by name, pedals and dynamics.'],
          ['An arrangement per level, as a change to one set of notes rather than a copy of it.'],
        ],
      },
      {
        heading: 'One owner',
        body: [
          'The format is defined once, in ',
          { code: 'packages/score-format' },
          ', and a repository check refuses a second copy anywhere else. The JSON Schema is generated from that definition, and MIDI and MusicXML are read by the same package.',
        ],
      },
    ],
  },
]
