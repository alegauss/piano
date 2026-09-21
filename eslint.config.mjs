import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * What only the audio layer may name. A component that builds its own node
 * is a second sound path, and it is the one that stops working the day the
 * engine swaps underneath it.
 */
const WEB_AUDIO = [
  'AudioContext',
  'OfflineAudioContext',
  'BaseAudioContext',
  'AudioNode',
  'AudioParam',
  'AudioBuffer',
  'AudioBufferSourceNode',
  'AudioScheduledSourceNode',
  'OscillatorNode',
  'GainNode',
  'BiquadFilterNode',
  'ConvolverNode',
  'DynamicsCompressorNode',
  'webkitAudioContext',
]
const WEB_AUDIO_MESSAGE =
  'Only src/renderer/audio touches Web Audio. Drive the PianoEngine it exports instead.'

/**
 * The rules that catch what a typechecker does not.
 *
 * Most of this is the standard type-aware set. The part specific to this app
 * is the renderer boundary: the renderer runs sandboxed with no Node, so an
 * import of `node:fs` there is not a type error — it compiles, it bundles, and
 * it fails at runtime in front of a user. The rule below refuses it at the
 * source, which is the only place the mistake is cheap.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.tsbuild/**',
      '**/.dev-profile/**',
      '**/.smoke-profile/**',
      '**/.selfcheck-profile/**',
      '**/.test-profile/**',
      '.roadkeep/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // A floating promise in an audio scheduler is a note that never sounds.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      /**
       * The renderer is sandboxed: no Node, no require, no fs. An import of a
       * node builtin here typechecks and bundles and then fails in front of a
       * user, so it is refused at the source. Anything the renderer genuinely
       * needs from the system goes through a named channel in @piano/ipc.
       */
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'child_process', 'os', 'electron'],
              message:
                'The renderer holds no privilege. Add a channel to @piano/ipc and a validated handler in main instead.',
            },
            {
              group: ['**/main/**', '**/preload/**'],
              message:
                'The renderer must not reach across the trust boundary, even for a type. Share it through @piano/ipc.',
            },
          ],
        },
      ],
    },
  },

  {
    /**
     * The audio seam. Above it, code deals in notes and times; only the audio
     * folder may build, hold or even name a Web Audio node, so the engine
     * behind the seam can change without anything above it noticing.
     */
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    ignores: ['apps/desktop/src/renderer/audio/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...WEB_AUDIO.map((name) => ({ name, message: WEB_AUDIO_MESSAGE })),
      ],
      '@typescript-eslint/no-restricted-types': [
        'error',
        { types: Object.fromEntries(WEB_AUDIO.map((name) => [name, WEB_AUDIO_MESSAGE])) },
      ],
    },
  },

  {
    // Tests say deliberately wrong things to prove they are refused.
    files: ['**/*.test.{ts,tsx}', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },

  {
    /**
     * Build tooling and configuration. These run in Node and are already
     * typechecked by tsc where it makes sense, so the type-aware rules are off
     * — and so is the project service, because a config file belongs to no
     * TypeScript project and asking one to place it is an error, not a finding.
     */
    files: [
      'scripts/**/*.{mjs,mts}',
      'apps/*/scripts/**/*.{mjs,mts}',
      'packages/*/scripts/**/*.{mjs,mts}',
      'build/**/*.mjs',
      '**/*.config.{js,mjs,ts,mts}',
      'eslint.config.mjs',
    ],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: false, project: false },
    },
  },

  {
    // Main and preload do run in Node, unlike the renderer.
    files: ['apps/desktop/src/{main,preload}/**/*.ts', 'apps/mcp-server/src/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
)
