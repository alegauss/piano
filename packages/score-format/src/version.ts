/**
 * The format version, in its own module so nothing has to import the whole
 * score types to know it. The migration chain reads it, the writer stamps it,
 * and the loader compares against it.
 *
 * Bumped only by a breaking change. An additive optional field does not need
 * one: an older reader simply does not see it, which is the whole reason
 * optional fields are the default here.
 */
export const FORMAT_VERSION = 1
