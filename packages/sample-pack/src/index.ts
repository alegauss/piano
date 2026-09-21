export {
  creditSchema,
  HIGHEST_KEY,
  LOWEST_KEY,
  MANIFEST_FORMAT,
  manifestProblems,
  manifestSchema,
  packSampleSchema,
  parseManifest,
  releaseSampleSchema,
  releasesSchema,
  type Credit,
  type ManifestResult,
  type PackManifest,
  type PackSample,
  type ReleaseSample,
  type Releases,
} from './manifest'

export {
  groupOpcode,
  parseDefines,
  parseRegions,
  parseVelocityLayers,
  type SfzRegion,
  type VelocityLayer,
} from './sfz'

export {
  planReleases,
  planSamples,
  SALAMANDER,
  velocityRanges,
  type PlannedRelease,
  type PlannedSample,
} from './plan'

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
