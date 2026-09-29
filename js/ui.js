/**
 * ui.js
 * ---------------------------------------------------------------------------
 * Presentation-only helpers for the editor chrome. Nothing here reads or
 * writes `state`, the PUST data, or the PDF pipeline - the app works exactly
 * the same if this file is removed.
 *
 * Two jobs:
 *   1. Stage zoom. preview.js owns the fit-to-viewport transform on
 *      `.a4-scale-wrapper` (it is recalculated on resize and on every
 *      render). Rather than fight it, we watch that inline transform and
 *      multiply it by the user's zoom factor, so zoom composes with the
 *      fit scale instead of replacing it.
 *   2. Quick print (the dock button) via the browser's own print dialog.
 */
(function (root) {
  'use strict';

  var MIN_ZOOM = 0.5;
  var MAX_ZOOM = 2;
  var STEP = 1.15;

  function clampZoom(value) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  }

  function byId(id) { return document.getElementById(id); }

  function on(el, evt, fn) { if (el) el.addEventListener(evt, fn); }

  // ---------------------------------------------------------------------
  // Stage zoom
  // ---------------------------------------------------------------------
  function setupStageZoom() {
    var area = byId('preview-area');
    var wrap = area && area.querySelector('.a4-scale-wrapper');
    var page = area && area.querySelector('.a4-page');
    var label = byId('zoom-label');
    if (!wrap || !page) return false;

    // preview.js leaves the wrapper 210mm x 297mm in layout terms and only
    // shrinks it with a transform, so the flex centering in #preview-area
    // would offset the sheet by half of that overflow and clip it. Park the
    // wrapper inside a box we size to the *visual* footprint: centering then
    // does the right thing, and there is no phantom scroll space.
    var fitBox = document.createElement('div');
    fitBox.className = 'a4-stage-fit';
    wrap.parentNode.insertBefore(fitBox, wrap);
    fitBox.appendChild(wrap);

    var zoom = 1;        // user zoom factor (1 = whatever preview.js fitted)
    var fitScale = 1;    // last scale preview.js asked for
    var lastWritten = ''; // exact transform string we wrote, to ignore it back

    function readScale() {
      var m = /scale\(\s*([\d.eE+-]+)\s*\)/.exec(wrap.style.transform || '');
      var value = m ? parseFloat(m[1]) : 0;
      return isFinite(value) ? value : 0;
    }

    function paint() {
      var scale = fitScale * zoom;
      lastWritten = 'scale(' + scale.toFixed(4) + ')';
      wrap.style.transform = lastWritten;
      fitBox.style.width = (page.offsetWidth * scale).toFixed(2) + 'px';
      fitBox.style.height = (page.offsetHeight * scale).toFixed(2) + 'px';
    }

    function updateLabel() {
      if (!label) return;
      label.textContent = Math.abs(zoom - 1) < 0.001 ? 'Fit' : Math.round(zoom * 100) + '%';
    }

    function setZoom(next) {
      var current = readScale();
      // The style currently holds fit * zoom, so recover the fit scale first.
      if (current > 0 && zoom > 0) fitScale = current / zoom;
      zoom = clampZoom(next);
      paint();
      updateLabel();
    }

    // preview.js rewrites the transform whenever it fits the page (resize,
    // render); keep our factor on top of the fresh value. Comparing against
    // the string we wrote is what tells our own writes apart from preview.js
    // - a boolean flag breaks when both land in the same mutation batch.
    var mo = new MutationObserver(function () {
      if ((wrap.style.transform || '') === lastWritten) return;
      var value = readScale();
      if (!value) return;
      fitScale = value;
      paint();
    });
    mo.observe(wrap, { attributes: true, attributeFilter: ['style'] });

    on(byId('zoom-in'), 'click', function () { setZoom(zoom * STEP); });
    on(byId('zoom-out'), 'click', function () { setZoom(zoom / STEP); });
    on(byId('zoom-reset'), 'click', function () { setZoom(1); });

    // Adopt whatever preview.js already fitted when the page mounted.
    fitScale = readScale() || 1;
    paint();
    updateLabel();
    return true;
  }

  // ---------------------------------------------------------------------
  // Quick print
  // ---------------------------------------------------------------------
  function setupQuickPrint() {
    on(byId('quick-print'), 'click', function () { root.print(); });
  }

  function init() {
    setupQuickPrint();
    if (setupStageZoom()) return;
    // The preview mounts on DOMContentLoaded; try once more after load in
    // case script order ever changes.
    on(root, 'load', setupStageZoom);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}(typeof window !== 'undefined' ? window : globalThis));
