/**
 * Registers the jest-dom matchers with Vitest's `expect` for this project.
 *
 * The import is the whole file: it is a module augmentation, so without it
 * `toBeVisible` and its neighbours exist at runtime, having been registered in
 * the setup file, and do not exist to the typechecker.
 */
import '@testing-library/jest-dom/vitest'
