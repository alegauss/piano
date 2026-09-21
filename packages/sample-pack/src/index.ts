export {
  creditSchema,
  HIGHEST_KEY,
  LOWEST_KEY,
  MANIFEST_FORMAT,
  manifestProblems,
  manifestSchema,
  packSampleSchema,
  parseManifest,
  type Credit,
  type ManifestResult,
  type PackManifest,
  type PackSample,
} from './manifest'

export {
  parseDefines,
  parseRegions,
  parseVelocityLayers,
  type SfzRegion,
  type VelocityLayer,
} from './sfz'

export { planSamples, SALAMANDER, velocityRanges, type PlannedSample } from './plan'

export {
  DEFAULT_TRIM,
  gainToPeak,
  peakOf,
  secondsOf,
  trim,
  withGain,
  type Pcm,
  type TrimOptions,
} from './audio'
