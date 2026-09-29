/**
 * utils.js
 * Small, dependency-free helper functions shared by every other module.
 *
 * Loaded as a plain <script> (no bundler), so it exposes a single global
 * namespace: `CoverUtils`. It also works when loaded with Node's `require()`
 * (used by the test scripts in /tools), because it attaches itself to
 * `globalThis` when `window` isn't available instead of relying on ESM/CJS.
 */
(function (root) {
  'use strict';

  var MM_TO_PT = 72 / 25.4; // 1 mm in PDF points
  var PT_TO_MM = 25.4 / 72;

  function mmToPt(mm) { return mm * MM_TO_PT; }
  function ptToMm(pt) { return pt * PT_TO_MM; }

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  /** Removes control characters, trims, and collapses runs of whitespace/newlines. */
  function cleanText(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Soft length cap so one pathological field can't break a whole layout. */
  function capLength(str, max) {
    str = cleanText(str);
    if (max && str.length > max) return str.slice(0, max - 1).trim() + '\u2026';
    return str;
  }

  /**
   * Given a list of strings, returns only the ones with real content, trimmed.
   * This is the single place "empty field hiding" logic lives.
   */
  function presentLines() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) {
      var raw = arguments[i];
      if (raw === false || raw === null || raw === undefined) continue;
      var v = cleanText(raw);
      if (v) out.push(v);
    }
    return out;
  }

  function isNonEmpty(v) { return cleanText(v).length > 0; }

  function debounce(fn, wait) {
    var t = null;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }

  function deepClone(obj) {
    if (typeof structuredClone === 'function') {
      try { return structuredClone(obj); } catch (e) { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(obj));
  }

  /** Merge `patch` into `base` recursively without mutating either input. */
  function deepMerge(base, patch) {
    var out = deepClone(base || {});
    if (!patch || typeof patch !== 'object') return out;
    Object.keys(patch).forEach(function (key) {
      var pv = patch[key];
      if (pv && typeof pv === 'object' && !Array.isArray(pv) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
        out[key] = deepMerge(out[key], pv);
      } else if (pv !== undefined) {
        out[key] = deepClone(pv);
      }
    });
    return out;
  }

  /** Formats an ISO "yyyy-mm-dd" date input value into "15 April 2026". Falls back gracefully. */
  function formatHumanDate(isoValue) {
    if (!isoValue) return '';
    var parts = String(isoValue).split('-');
    if (parts.length !== 3) return cleanText(isoValue);
    var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10), d = parseInt(parts[2], 10);
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (!y || !m || !d || m < 1 || m > 12) return cleanText(isoValue);
    return d + ' ' + months[m - 1] + ' ' + y;
  }

  // Characters the PDF's built-in vector fonts (WinAnsi-encoded standard 14
  // fonts) can render: printable ASCII, Latin-1 accents, and common "smart"
  // punctuation. Used both to sanitize text before drawing (pdf.js) and to
  // warn the user in the editor (app.js) - one definition, so they never
  // disagree about what counts as "safe".
  var PDF_SAFE_CHARS = /[^\x20-\x7E\xA0-\xFF\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u00B7]/g;

  function hasUnsupportedPdfChars(str) {
    PDF_SAFE_CHARS.lastIndex = 0;
    return PDF_SAFE_CHARS.test(String(str || ''));
  }

  function sanitizeForPdf(str) {
    PDF_SAFE_CHARS.lastIndex = 0;
    return String(str || '').replace(PDF_SAFE_CHARS, '?');
  }

  /** "#1a3c6e" -> {r,g,b} each in 0..1, for pdf-lib's rgb() color helper. */
  function hexToRgb01(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return { r: 0, g: 0, b: 0 };
    return {
      r: parseInt(m[1], 16) / 255,
      g: parseInt(m[2], 16) / 255,
      b: parseInt(m[3], 16) / 255
    };
  }

  function isProbablyUrl(str) {
    if (!str) return false;
    try {
      var u = new URL(str);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) { return false; }
  }

  function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error('Could not read file')); };
      reader.readAsDataURL(file);
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error('Could not read file')); };
      reader.readAsArrayBuffer(file);
    });
  }

  /** dataURL ("data:image/png;base64,....") -> Uint8Array, no network/DOM needed. */
  function dataUrlToBytes(dataUrl) {
    var comma = dataUrl.indexOf(',');
    var meta = dataUrl.slice(5, comma); // "image/png;base64"
    var isBase64 = /;base64$/.test(meta);
    var body = dataUrl.slice(comma + 1);
    if (!isBase64) body = decodeURIComponent(body);
    var binary = typeof atob === 'function' ? atob(body) : Buffer.from(body, 'base64').toString('binary');
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    var format = /image\/(png)/.test(meta) ? 'png' : (/image\/(jpe?g)/.test(meta) ? 'jpg' : null);
    return { bytes: bytes, format: format, mime: meta.split(';')[0] };
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Give mobile browsers a beat before the URL disappears.
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function safeFilenamePart(str) {
    return cleanText(str).replace(/[^a-z0-9\-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'Cover';
  }

  /**
   * Greedy word-wrap: splits `text` into lines that each fit within `maxWidth`
   * (any unit, as long as `measure(line)` returns a width in the same unit).
   */
  function wrapText(text, maxWidth, measure) {
    text = cleanText(text);
    if (!text) return [];
    var words = text.split(' ');
    var lines = [];
    var current = '';
    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      var candidate = current ? current + ' ' + word : word;
      if (measure(candidate) <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  /**
   * Finds the largest font size (stepping down from `startSize` to `minSize`)
   * at which `measure(size)` reports a width <= `maxWidth`. Used to keep long
   * titles/names from overflowing their box, identically in DOM and PDF.
   */
  function fitSizeToWidth(measure, maxWidth, startSize, minSize, step) {
    step = step || 0.5;
    var size = startSize;
    while (size > minSize && measure(size) > maxWidth) {
      size -= step;
    }
    return Math.max(size, minSize);
  }

  var CoverUtils = {
    MM_TO_PT: MM_TO_PT,
    PT_TO_MM: PT_TO_MM,
    mmToPt: mmToPt,
    ptToMm: ptToMm,
    clamp: clamp,
    cleanText: cleanText,
    capLength: capLength,
    presentLines: presentLines,
    isNonEmpty: isNonEmpty,
    debounce: debounce,
    uid: uid,
    deepClone: deepClone,
    deepMerge: deepMerge,
    formatHumanDate: formatHumanDate,
    hexToRgb01: hexToRgb01,
    hasUnsupportedPdfChars: hasUnsupportedPdfChars,
    sanitizeForPdf: sanitizeForPdf,
    isProbablyUrl: isProbablyUrl,
    readFileAsDataURL: readFileAsDataURL,
    readFileAsArrayBuffer: readFileAsArrayBuffer,
    dataUrlToBytes: dataUrlToBytes,
    downloadBlob: downloadBlob,
    safeFilenamePart: safeFilenamePart,
    wrapText: wrapText,
    fitSizeToWidth: fitSizeToWidth
  };

  root.CoverUtils = CoverUtils;
}(typeof window !== 'undefined' ? window : globalThis));
