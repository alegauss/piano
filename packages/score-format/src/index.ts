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
  noteAudible,
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
  accompanies,
  arrangementOf,
  CHORD_TICKS,
  chordsOf,
  dropOrnaments,
  foldWideChords,
  KEEP_EVERYTHING,
  keepTopVoices,
  reduceNotes,
  reduceScore,
  REACH_SEMITONES,
  rolesOf,
  thinChords,
  thinFigures,
  type Cut,
  type Reduced,
  type Reduction,
  type Roles,
  type Rule,
} from './reduce'

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
  formatProblems,
  MAX_REPORTED_PROBLEMS,
  parseScore,
  type ParseResult,
  type ScoreProblem,
} from './parse'

export {
  arrangementSchema,
  CURRENT_FORMAT_VERSION,
  expressionSchema,
  metadataSchema,
  noteSchema,
  partSchema,
  scoreSchema,
  sectionSchema,
  timingSchema,
  type ScoreInput,
} from './schema'

export { buildSchemaDocument, renderSchemaDocument } from './schema-document'

export {
  exportMidi,
  importMidi,
  MIDI_IMPORT_EXTENSION,
  type MidiExport,
  type MidiImport,
  type MidiImportOptions,
} from './midi'

export {
  barAtTick,
  barRangeToTicks,
  beatTicks,
  DEFAULT_MICROSECONDS_PER_QUARTER,
  DEFAULT_TICKS_PER_QUARTER,
  meterAt,
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

export {
  checksum,
  FROZEN_FIXTURES,
  MALFORMED_FIXTURES,
  stableStringify,
  VALID_FIXTURES,
} from './fixtures/index'
