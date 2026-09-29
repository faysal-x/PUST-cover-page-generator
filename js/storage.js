/**
 * storage.js
 * Two independent persistence mechanisms:
 *   1. Autosave to localStorage - silent, debounced, restores on next visit.
 *   2. Save/Load Project - an explicit JSON file the user can download and
 *      re-import later (or share with someone else / another machine).
 * Both just serialize the same `state` object app.js already keeps.
 */
(function (root) {
  'use strict';

  var U = root.CoverUtils;
  var LS_KEY = 'pust-cover-generator/state/v2';
  var PROJECT_FILE_VERSION = 2;

  function saveLocal(state) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      // Quota exceeded (e.g. a very large embedded logo) or storage disabled
      // (private browsing in some browsers). Not fatal - just no autosave.
      console.warn('Autosave failed:', e.message);
      return false;
    }
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return isPlausibleState(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function clearLocal() {
    try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ }
  }

  function isPlausibleState(obj) {
    return !!(obj && typeof obj === 'object' && obj.data && obj.customization && obj.customization.show && typeof obj.template === 'string');
  }

  /** Fills in any fields missing from an older/partial saved state with current defaults. */
  function normalizeState(saved, CT) {
    var fresh = CT.createDefaultState();
    if (!isPlausibleState(saved)) return fresh;
    var merged = U.deepMerge(fresh, saved);
    if (!CT.getTemplate(merged.template)) merged.template = fresh.template;
    // Older saved states predate the info-line fit toggle.
    if (merged.customization.infoFit !== 'wrap') merged.customization.infoFit = 'one-line';
    // ...and the per-section font override: '' = follow the page pairing.
    var tf = merged.customization.teacherFont;
    if (typeof tf !== 'string' || (tf !== '' && !CT.FONT_PAIRINGS.some(function (p) { return p.id === tf; }))) {
      merged.customization.teacherFont = '';
    }
    return merged;
  }

  function exportProjectFile(state) {
    var payload = { fileType: 'pust-cover-project', fileVersion: PROJECT_FILE_VERSION, savedAt: new Date().toISOString(), state: state };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    U.downloadBlob(blob, 'pust-cover-project.json');
  }

  function parseProjectFile(text) {
    var payload = JSON.parse(text); // may throw - caller catches
    if (payload && payload.state && isPlausibleState(payload.state)) return payload.state;
    if (isPlausibleState(payload)) return payload; // tolerate a bare state object too
    throw new Error('That file does not look like a cover-page project.');
  }

  root.CoverStorage = {
    saveLocal: saveLocal,
    loadLocal: loadLocal,
    clearLocal: clearLocal,
    normalizeState: normalizeState,
    exportProjectFile: exportProjectFile,
    parseProjectFile: parseProjectFile
  };
}(typeof window !== 'undefined' ? window : globalThis));
