import { start } from './server'

/**
 * The entry point Claude Code runs.
 *
 * Nothing is printed to stdout: that is the protocol's channel, and a friendly
 * banner there is a parse error at the other end. Anything a person needs to
 * see goes to stderr.
 */
start()
  .then(() => {
    process.stderr.write('piano mcp server: listening on stdio\n')
  })
  .catch((cause: unknown) => {
    process.stderr.write(`piano mcp server: ${cause instanceof Error ? cause.message : 'failed'}\n`)
    process.exitCode = 1
  })
