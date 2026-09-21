/**
 * The plugin's version, which is this server's, and the release's.
 *
 * The app and the plugin are released together from one tag, so they carry
 * one version, decided in the root package.json; `npm run check:versions`
 * holds this, the plugin manifest and the app to it. It is what a person can
 * find on either side, which is why the link names it when the two disagree.
 * The link protocol is a number of its own: it changes only when the two
 * sides stop understanding each other, and an update elsewhere is not that.
 */
export const PLUGIN_VERSION = '0.1.0'
