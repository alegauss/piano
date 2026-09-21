export {
  describeScore,
  FORMAT_VERSION,
  isSupportedVersion,
  notesOf,
  scoreArrangements,
  scoreParts,
  timingOf,
  validateScoreNotes,
  type Score,
} from './score'

export {
  findOverlaps,
  MAX_PITCH,
  MIN_PITCH,
  noteEnd,
  noteProblems,
  noteRef,
  PIANO_HIGHEST_PITCH,
  PIANO_LOWEST_PITCH,
  pitchToSpelling,
  spellingToPitch,
  validateNotes,
  voiceOf,
  type Finger,
  type Hand,
  type Note,
  type NoteProblem,
  type Overlap,
} from './note'

export {
  audibleNotes,
  IMPLICIT_PART_ID,
  notesByPart,
  partOf,
  partsOf,
  validateParts,
  type Part,
  type PartRole,
  type PlaybackFilter,
} from './part'

export {
  DYNAMIC_LEVELS,
  dynamicScaleAt,
  pedalValueAt,
  PEDAL_CONTROLLERS,
  soundingNote,
  validateExpression,
  type Articulation,
  type DynamicLevel,
  type DynamicMark,
  type Expression,
  type PedalEvent,
  type PedalKind,
  type SoundingNote,
} from './expression'

export {
  flattenSections,
  rangeContains,
  resolveRange,
  sectionAtTick,
  sectionRange,
  validateSections,
  type RangeRequest,
  type Section,
  type TickRange,
} from './section'

export {
  arrangementForLevel,
  arrangementsOf,
  AS_WRITTEN,
  LEVELS,
  resolveArrangement,
  validateArrangements,
  type Arrangement,
  type Level,
  type NoteOverride,
  type ResolvedArrangement,
} from './arrangement'

export {
  bundlingProblems,
  compareForLibrary,
  isPublicDomainLicence,
  matchesFilter,
  PUBLIC_DOMAIN_LICENCES,
  validateMetadata,
  type Licence,
  type LibraryFilter,
  type Provenance,
  type ScoreMetadata,
} from './metadata'

export {
  KNOWN_SCORE_KEYS,
  migrate,
  MIGRATIONS,
  unknownKeyProblems,
  unknownKeys,
  type Extensions,
  type Migration,
  type MigrationResult,
} from './migrate'

export {
  barAtTick,
  barRangeToTicks,
  DEFAULT_MICROSECONDS_PER_QUARTER,
  DEFAULT_TICKS_PER_QUARTER,
  resolveTiming,
  secondsToTicks,
  tickAtBar,
  ticksPerBar,
  ticksToSeconds,
  type BarPosition,
  type ResolvedTiming,
  type TempoEvent,
  type TimeSignatureEvent,
  type Timing,
} from './time'
