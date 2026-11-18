/**
 * Client-side AI usage constants (audit #8).
 *
 * A magic `25` used to sit inline in `use-sync.ts`; both the settings copy and
 * any future UI read it from here.
 *
 * ⚠️ HONEST LIMIT NOTE: the UI-facing constant is advisory only. The real
 * enforcement lives in the Cloud Function (`functions/index.js`), which reads
 * the quota before calling a model and only spends it once a model answered.
 * That file declares the same number; change both together (there is no shared
 * module between the browser bundle and Node 20 functions).
 */
export const AI_DAILY_LIMIT = 25;
