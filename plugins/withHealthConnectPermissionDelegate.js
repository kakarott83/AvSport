/**
 * Config plugin: register react-native-health-connect's permission delegate in
 * `MainActivity.onCreate`.
 *
 * Why this is needed
 * ------------------
 * `android/` is gitignored (Continuous Native Generation) — `expo prebuild` /
 * EAS Build regenerates `MainActivity.kt` from the Expo template, so any manual
 * edit to it is lost on the next build.
 *
 * react-native-health-connect's own config plugin only patches the
 * AndroidManifest; it never registers the `ActivityResultLauncher`.
 * `Activity.registerForActivityResult()` **must** run before the Activity is
 * RESUMED. If it doesn't, the first `requestPermission()` call reads an
 * uninitialised `lateinit` inside a coroutine whose scope has no exception
 * handler → the app hard-crashes (the JS promise never rejects, so app-side
 * guards can't catch it).
 *
 * This plugin injects the required import + `setPermissionDelegate(this)` call
 * so the fix survives every prebuild.
 */
const { withMainActivity, createRunOncePlugin } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const IMPORT_LINE =
  'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const DELEGATE_CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';
const TAG = 'health-connect-permission-delegate';

function addImport(contents) {
  if (contents.includes(IMPORT_LINE)) return contents;
  return mergeContents({
    src: contents,
    anchor: /^package .+$/m,
    offset: 1,
    comment: '//',
    tag: `${TAG}-import`,
    newSrc: `\n${IMPORT_LINE}`,
  }).contents;
}

function addDelegateCall(contents) {
  if (contents.includes(DELEGATE_CALL)) return contents;
  return mergeContents({
    src: contents,
    // right after `super.onCreate(...)` inside MainActivity.onCreate — still
    // before onStart(), which is the Android constraint for registration.
    anchor: /super\.onCreate\([a-zA-Z0-9_]*\)/,
    offset: 1,
    comment: '//',
    tag: TAG,
    newSrc: `    ${DELEGATE_CALL}`,
  }).contents;
}

const withHealthConnectPermissionDelegate = (config) =>
  withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error(
        '[withHealthConnectPermissionDelegate] expected a Kotlin MainActivity — ' +
          `got "${cfg.modResults.language}".`,
      );
    }
    cfg.modResults.contents = addDelegateCall(addImport(cfg.modResults.contents));
    return cfg;
  });

module.exports = createRunOncePlugin(
  withHealthConnectPermissionDelegate,
  'withHealthConnectPermissionDelegate',
  '1.0.0',
);
