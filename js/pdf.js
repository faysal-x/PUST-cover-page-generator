/**
 * pdf.js
 * ---------------------------------------------------------------------------
 * Builds the cover page as a REAL vector PDF using pdf-lib: every word is
 * drawn with page.drawText() using an embedded standard PDF font, not a
 * screenshot of the page. That is what keeps the text crisp at any zoom
 * level and keeps the file small, and it is why nothing the preview does
 * with CSS transforms (mobile scaling, zoom, etc.) can ever leak into the
 * exported file - this module never looks at the DOM at all.
 *
 * `buildPdfBytes(PDFLib, state)` is a pure function: given the pdf-lib
 * library object and the app's plain-data `state`, it returns a Promise of
 * Uint8Array PDF bytes. It touches no `window`/`document` globals, which is
 * what makes it possible to unit-test from plain Node (see /tools).
 * `generateAndDownload(state)` is the thin DOM-facing wrapper used by the app.
 */
(function (root) {
  'use strict';

  var U = root.CoverUtils;
  var CT = root.CoverTemplates;

  var PAGE_W_MM = 210, PAGE_H_MM = 297;
  var MARGIN_MM = 20, MARGIN_BOTTOM_MM = 18;
  var LINE_HEIGHT = 1.32;
  var BASELINE_RATIO = 0.80;
  var MIN_FIT_SCALE = 0.72;
  // Info lines (Name/Roll/departments, ...) always render on ONE line: the text
  // shrinks to fit its column instead of wrapping. Below this floor we give up
  // and wrap, so pathologically long input still stays readable.
  var MIN_ONE_LINE_SCALE = 0.62;

  // ------------------------------------------------------------------
  // Font family resolution (StandardFonts only -> always-vector, always-embeds,
  // never needs a network fetch or a bundled font file).
  // ------------------------------------------------------------------
  function stdFontKey(family, bold, italic) {
    if (family === 'Times') {
      if (bold && italic) return 'TimesRomanBoldItalic';
      if (bold) return 'TimesRomanBold';
      if (italic) return 'TimesRomanItalic';
      return 'TimesRoman';
    }
    if (family === 'Courier') {
      if (bold && italic) return 'CourierBoldOblique';
      if (bold) return 'CourierBold';
      if (italic) return 'CourierOblique';
      return 'Courier';
    }
    if (bold && italic) return 'HelveticaBoldOblique';
    if (bold) return 'HelveticaBold';
    if (italic) return 'HelveticaOblique';
    return 'Helvetica';
  }

  function makeFontCache(PDFLib, doc) {
    var cache = {};
    return async function getFont(family, bold, italic) {
      var key = family + '|' + (bold ? 1 : 0) + '|' + (italic ? 1 : 0);
      if (!cache[key]) cache[key] = await doc.embedFont(PDFLib.StandardFonts[stdFontKey(family, bold, italic)]);
      return cache[key];
    };
  }

  function familyFor(role, pairing) {
    if (role === 'mono') return CT.MONO_FONT.pdf;
    return pairing.pdf[role] || pairing.pdf.secondary;
  }

  // ------------------------------------------------------------------
  // Drawing context helpers
  // ------------------------------------------------------------------
  function makeCtx(PDFLib, doc, page, custom) {
    var pairing = CT.getFontPairing(custom.font);
    var marginPt = U.mmToPt(MARGIN_MM);
    return {
      PDFLib: PDFLib,
      doc: doc,
      page: page,
      pageWpt: U.mmToPt(PAGE_W_MM),
      pageHpt: U.mmToPt(PAGE_H_MM),
      marginPt: marginPt,
      marginBottomPt: U.mmToPt(MARGIN_BOTTOM_MM),
      contentWpt: U.mmToPt(PAGE_W_MM) - 2 * marginPt,
      cursorY: 0,
      scale: 1,
      draw: false,
      pairing: pairing,
      // Per-section override: info items tagged fontKey:'teacher' (the
      // "Submitted to" block, see templates.js infoColumns/cards/pairBlock)
      // resolve against this pairing instead of the template's. An empty
      // customization.teacherFont means "no override" (same pairing).
      teacherPairing: custom.teacherFont ? CT.getFontPairing(custom.teacherFont) : pairing,
      infoFit: custom.infoFit === 'wrap' ? 'wrap' : 'one-line',
      accentRgb: U.hexToRgb01(custom.accent),
      inkRgb: { r: 0.06, g: 0.06, b: 0.08 },
      mutedRgb: { r: 0.40, g: 0.40, b: 0.42 },
      whiteRgb: { r: 1, g: 1, b: 1 },
      getFont: makeFontCache(PDFLib, doc)
    };
  }

  function colorFor(ctx, role) {
    var c = role === 'accent' ? ctx.accentRgb : role === 'muted' ? ctx.mutedRgb : role === 'white' ? ctx.whiteRgb : ctx.inkRgb;
    return ctx.PDFLib.rgb(c.r, c.g, c.b);
  }

  function mixWithWhite(rgb, amount) {
    return { r: rgb.r * amount + 1 * (1 - amount), g: rgb.g * amount + 1 * (1 - amount), b: rgb.b * amount + 1 * (1 - amount) };
  }

  function yFromTop(ctx, topPt) { return ctx.pageHpt - topPt; }

  /** Draws (or, in measure mode, just measures) one line of text; returns its width in pt.
   *  Note: `tracking` (letter-spacing) is intentionally a preview-only cosmetic effect (see
   *  preview.js). Earlier we drew tracked PDF text character-by-character, which looked fine
   *  visually but made pdf.js/most PDF viewers insert spurious spaces when text was selected
   *  or copied. Real, cleanly-selectable vector text wins over a decorative flourish. */
  async function drawLine(ctx, str, opts) {
    str = U.sanitizeForPdf(str);
    var size = opts.size * ctx.scale;
    var font = await ctx.getFont(opts.family, opts.bold, opts.italic);
    var width = font.widthOfTextAtSize(str, size);
    if (!ctx.draw) return width;

    var x = opts.x;
    if (opts.align === 'center') x = opts.boxX + (opts.boxW - width) / 2;
    else if (opts.align === 'right') x = opts.boxX + opts.boxW - width;
    else x = opts.boxX;

    var y = yFromTop(ctx, opts.topPt + size * BASELINE_RATIO);
    var color = colorFor(ctx, opts.color);
    ctx.page.drawText(str, { x: x, y: y, size: size, font: font, color: color });
    return width;
  }

  async function measureWidth(ctx, str, size, family, bold, italic) {
    str = U.sanitizeForPdf(str);
    var font = await ctx.getFont(family, bold, italic);
    return font.widthOfTextAtSize(str, size * ctx.scale);
  }

  async function wrapLine(ctx, str, maxWidth, size, family, bold, italic) {
    return U.wrapText(str, maxWidth, function (candidate) {
      // sync measure needed by wrapText; widthOfTextAtSize is sync once font is cached
      var font = ctx._fontSyncCache[family + '|' + (bold ? 1 : 0) + '|' + (italic ? 1 : 0)];
      return font.widthOfTextAtSize(U.sanitizeForPdf(candidate), size * ctx.scale);
    });
  }

  // ------------------------------------------------------------------
  // Rich lines: a line is a string (all-normal) or an array of segments
  // like { text, bold }. Wrapping happens per segment (a segment never
  // splits mid-segment, so labels like "Reg. No:" stay intact) and bold
  // segments draw with the bold font, matching preview.js's <strong>.
  // ------------------------------------------------------------------
  function isRichLine(line) { return Array.isArray(line); }

  function richSegsOf(line) { return isRichLine(line) ? line : [{ text: U.cleanText(line), bold: false }]; }

  /** Resolves a group of info lines to { lines, scale } according to the
   *  customization's infoFit mode:
   *  - 'one-line' (default): shrink-to-fit, wrap only past the scale floor.
   *  - 'wrap': the classic behavior — natural size, wraps onto the next line.
   *  The identical rule is applied by preview.js in the DOM. */
  async function resolveLineGroup(ctx, lines, maxWidth, size, family, italic) {
    if (ctx.infoFit === 'wrap') {
      var wrapped = [];
      for (var i = 0; i < lines.length; i++) {
        wrapped.push.apply(wrapped, await wrapRichLine(ctx, richSegsOf(lines[i]), maxWidth, size, family, italic));
      }
      return { lines: wrapped, scale: 1 };
    }
    var groupScale = await tryOneLineScale(ctx, lines, maxWidth, size, family, italic);
    if (groupScale !== null) {
      return { lines: lines.map(richSegsOf), scale: groupScale };
    }
    return { lines: await wrapGroupScaled(ctx, lines, maxWidth, size, family, italic, 1), scale: 1 };
  }

  /** Returns the uniform scale (<=1) at which EVERY line fits maxWidth on one
   *  line, or null when some line would have to shrink past the floor — the
   *  caller then falls back to wrapping for that group of lines. */
  async function tryOneLineScale(ctx, lines, maxWidth, size, family, italic) {
    var minScale = 1;
    for (var i = 0; i < lines.length; i++) {
      var w = await measureRichWidth(ctx, richSegsOf(lines[i]), size, family, italic);
      if (w > maxWidth) minScale = Math.min(minScale, maxWidth / w);
    }
    return minScale < MIN_ONE_LINE_SCALE ? null : minScale;
  }

  async function wrapRichLine(ctx, line, maxWidth, size, family, italic) {
    var out = [];
    var current = null;
    for (var i = 0; i < line.length; i++) {
      var segObj = line[i];
      var bold = !!segObj.bold;
      var pieces = await wrapLine(ctx, segObj.text, maxWidth, size, family, bold, italic);
      if (!pieces.length) continue;
      if (!current) current = { segs: [] };
      for (var p = 0; p < pieces.length; p++) {
        if (p > 0 || current.segs.length) {
          out.push(current.segs);
          current = { segs: [] };
        }
        current.segs.push({ text: pieces[p], bold: bold });
      }
    }
    if (current && current.segs.length) out.push(current.segs);
    return out;
  }

  /** Wraps a group of lines, each shrunk by `oneLineScale` first. Used only
   *  when a group contains a line that cannot fit on one line even at the
   *  shrink floor — the wrapped result then still matches the DOM preview,
   *  which applies the same scale before its own wrap fallback. */
  async function wrapGroupScaled(ctx, lines, maxWidth, size, family, italic, oneLineScale) {
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      out.push.apply(out, await wrapRichLine(ctx, richSegsOf(lines[i]), maxWidth, size * oneLineScale, family, italic));
    }
    return out;
  }

  /** Width of one joining space between segments (bold flag of the next segment). */
  async function joinSpaceWidth(ctx, size, family, nextBold, italic) {
    return measureWidth(ctx, ' ', size, family, nextBold, italic);
  }

  async function measureRichWidth(ctx, line, size, family, italic) {
    var w = 0;
    for (var i = 0; i < line.length; i++) {
      if (i > 0) w += await joinSpaceWidth(ctx, size, family, !!line[i].bold, italic);
      w += await measureWidth(ctx, line[i].text, size, family, !!line[i].bold, italic);
    }
    return w;
  }

  /** Draws a possibly-rich line left-aligned from x; returns its total width in pt. */
  async function drawRichLineLeft(ctx, line, x, topPt, size, family, italic, color) {
    var cx = x;
    for (var i = 0; i < line.length; i++) {
      var s = line[i];
      if (i > 0) cx += await joinSpaceWidth(ctx, size, family, !!s.bold, italic);
      var w = await drawLine(ctx, s.text, { size: size, family: family, bold: !!s.bold, italic: italic, align: 'left', boxX: cx, boxW: ctx.contentWpt, topPt: topPt, color: color });
      cx += w;
    }
    return cx - x;
  }

  /** Draws a possibly-rich line centered inside [boxX, boxX+boxW]. */
  async function drawRichLineCenter(ctx, line, boxX, boxW, topPt, size, family, italic, color) {
    var w = await measureRichWidth(ctx, line, size, family, italic);
    return drawRichLineLeft(ctx, line, boxX + Math.max(0, (boxW - w) / 2), topPt, size, family, italic, color);
  }

  /** Pre-embeds every font variant a set of blocks could need, and exposes a sync lookup used by wrapping. */
  async function preloadFonts(ctx, blocks) {
    ctx._fontSyncCache = {};
    var families = [ctx.pairing.pdf.primary, ctx.pairing.pdf.secondary, CT.MONO_FONT.pdf];
    // The per-section override pairing (teacherFont) needs its variants too.
    if (ctx.teacherPairing !== ctx.pairing) {
      families.push(ctx.teacherPairing.pdf.primary, ctx.teacherPairing.pdf.secondary);
    }
    for (var f = 0; f < families.length; f++) {
      for (var b = 0; b <= 1; b++) {
        for (var it = 0; it <= 1; it++) {
          var font = await ctx.getFont(families[f], !!b, !!it);
          ctx._fontSyncCache[families[f] + '|' + b + '|' + it] = font;
        }
      }
    }
  }

  function roleFamily(ctx, fontRole) { return familyFor(fontRole || 'secondary', ctx.pairing); }

  /** Family for one info item (table column / card / pair-block side).
   *  fontKey:'teacher' opts the whole "Submitted to" section into the
   *  per-section override pairing; everything else uses the template's. */
  function itemFamily(ctx, fontRole, fontKey) {
    if (fontKey === 'teacher') return familyFor(fontRole || 'secondary', ctx.teacherPairing);
    return roleFamily(ctx, fontRole);
  }

  // ------------------------------------------------------------------
  // Per-block-type layout + draw (each both measures AND draws, gated by ctx.draw)
  // ------------------------------------------------------------------
  async function layoutSpace(ctx, b) {
    var h = U.mmToPt(b.mm) * ctx.scale;
    ctx.cursorY += h;
  }

  async function layoutLogo(ctx, b) {
    var boxPt = U.mmToPt(CT.logoSizeMm(b.size)) * ctx.scale;
    var top = ctx.cursorY;
    if (ctx.draw) {
      var boxX = b.align === 'left' ? ctx.marginPt : ctx.marginPt + (ctx.contentWpt - boxPt) / 2;
      var cx = boxX + boxPt / 2;
      var cy = yFromTop(ctx, top + boxPt / 2);
      if (b.frame === 'seal') {
        // Heraldic double ring around the crest, echoing .cp-logo-seal in themes.css.
        ctx.page.drawCircle({ x: cx, y: cy, size: boxPt / 2 + U.mmToPt(1.3) * ctx.scale, borderColor: colorFor(ctx, 'accent'), borderWidth: 0.9 });
        ctx.page.drawCircle({ x: cx, y: cy, size: boxPt / 2 + U.mmToPt(0.4) * ctx.scale, borderColor: colorFor(ctx, 'accent'), borderWidth: 0.9 });
      }
      // A seal ring is a halo drawn just outside the box (matching the CSS
      // box-shadow approach in .cp-logo-seal) - the image itself is not resized.
      var img = null;
      if (b.dataUrl) {
        try {
          var decoded = U.dataUrlToBytes(b.dataUrl);
          if (decoded.format === 'png') img = await ctx.doc.embedPng(decoded.bytes);
          else if (decoded.format === 'jpg') img = await ctx.doc.embedJpg(decoded.bytes);
        } catch (e) { img = null; }
      }
      if (img) {
        var ratio = Math.min(boxPt / img.width, boxPt / img.height);
        var w = img.width * ratio, h = img.height * ratio;
        var ix = cx - w / 2;
        var iy = cy - h / 2;
        ctx.page.drawImage(img, { x: ix, y: iy, width: w, height: h });
      } else {
        // Fallback placeholder: a thin circle with the university's initial.
        if (b.frame !== 'seal') ctx.page.drawCircle({ x: cx, y: cy, size: boxPt / 2, borderColor: colorFor(ctx, 'muted'), borderWidth: 1 });
        var font = await ctx.getFont(roleFamily(ctx, 'primary'), true, false);
        var size = boxPt * 0.4;
        var tw = font.widthOfTextAtSize(b.initial, size);
        ctx.page.drawText(b.initial, { x: cx - tw / 2, y: cy - size * 0.36, size: size, font: font, color: colorFor(ctx, b.frame === 'seal' ? 'accent' : 'muted') });
      }
    }
    ctx.cursorY += boxPt + U.mmToPt(3) * ctx.scale;
  }

  async function layoutTextBlock(ctx, b) {
    var lines = (b.lines && b.lines.length) ? b.lines : (b.text ? [b.text] : []);
    if (!lines.length) return;
    var family = roleFamily(ctx, b.font);
    var bold = b.weight === 'bold', italic = b.style === 'italic';
    var size = b.size;
    var maxWidth = ctx.contentWpt;
    for (var i = 0; i < lines.length; i++) {
      var wrapped = await wrapLine(ctx, lines[i], maxWidth, size, family, bold, italic);
      for (var j = 0; j < wrapped.length; j++) {
        await drawLine(ctx, wrapped[j], {
          size: size, family: family, bold: bold, italic: italic, align: b.align,
          boxX: ctx.marginPt, boxW: ctx.contentWpt, topPt: ctx.cursorY, color: b.color, tracking: b.tracking
        });
        ctx.cursorY += size * ctx.scale * LINE_HEIGHT;
      }
    }
    ctx.cursorY += U.mmToPt(1.2) * ctx.scale;
  }

  async function layoutRule(ctx, b) {
    var thickness = (b.weight === 'bold' ? 1.4 : 0.75);
    var gap = U.mmToPt(3) * ctx.scale;
    var width = b.width === 'short' ? ctx.contentWpt * 0.42 : ctx.contentWpt;
    var x = ctx.marginPt + (ctx.contentWpt - width) / 2;
    var color = colorFor(ctx, b.color || 'ink');
    if (ctx.draw) {
      var y1 = yFromTop(ctx, ctx.cursorY + gap);
      ctx.page.drawLine({ start: { x: x, y: y1 }, end: { x: x + width, y: y1 }, thickness: thickness, color: color });
      if (b.style === 'double') {
        var y2 = yFromTop(ctx, ctx.cursorY + gap + 2.6);
        ctx.page.drawLine({ start: { x: x, y: y2 }, end: { x: x + width, y: y2 }, thickness: thickness, color: color });
      }
    }
    ctx.cursorY += gap * 2 + (b.style === 'double' ? U.mmToPt(1.6) * ctx.scale : 0);
  }

  async function layoutTable(ctx, b) {
    var n = b.columns.length;
    var gap = U.mmToPt(6) * ctx.scale;
    var colW = (ctx.contentWpt - gap * (n - 1)) / n;
    var headSize = 12 * ctx.scale, lineSize = 11 * ctx.scale;
    var padTop = U.mmToPt(2.2) * ctx.scale, padSide = U.mmToPt(3) * ctx.scale, padBottom = U.mmToPt(2.5) * ctx.scale;

    // Every info line renders on ONE line: shrink-to-fit, wrap only as a last
    // resort (scale floor), identical to preview.js's rule.
    var wrappedCols = [];
    var maxLines = 0;
    for (var c = 0; c < n; c++) {
      var innerW = colW - padSide * 2;
      // A column tagged fontKey:'teacher' (the "Submitted to" section) may
      // carry its own font pairing - see itemFamily / createDefaultState.
      var colFamily = itemFamily(ctx, b.font, b.columns[c].fontKey);
      var head = await wrapLine(ctx, b.columns[c].header, innerW, headSize / ctx.scale, colFamily, true, false);
      var group = await resolveLineGroup(ctx, b.columns[c].lines, innerW, lineSize / ctx.scale, colFamily, false);
      wrappedCols.push({ header: head, lines: group.lines, scale: group.scale, family: colFamily });
      maxLines = Math.max(maxLines, group.lines.length);
    }
    var headH = headSize * LINE_HEIGHT * ctx.scale + padTop;
    var bodyH = maxLines * lineSize * LINE_HEIGHT * ctx.scale + padBottom + U.mmToPt(1) * ctx.scale;
    var totalH = headH + bodyH;
    var top = ctx.cursorY;

    if (ctx.draw) {
      var isPlainHeader = b.header === 'plain';
      for (var ci = 0; ci < n; ci++) {
        var colX = ctx.marginPt + ci * (colW + gap);
        if (b.borderWeight !== 'none') {
          var headTopY = yFromTop(ctx, top);
          var headBotY = yFromTop(ctx, top + headH);
          if (!isPlainHeader) {
            ctx.page.drawRectangle({ x: colX, y: headBotY, width: colW, height: headTopY - headBotY, color: ctx.PDFLib.rgb(0.80, 0.80, 0.80) });
          }
          var borderColor = colorFor(ctx, 'muted');
          var borderW = b.borderWeight === 'bold' ? 1.3 : 0.6;
          var boxTopY = yFromTop(ctx, top);
          var boxBotY = yFromTop(ctx, top + totalH);
          ctx.page.drawRectangle({ x: colX, y: boxBotY, width: colW, height: boxTopY - boxBotY, borderColor: borderColor, borderWidth: borderW });
          if (!isPlainHeader) ctx.page.drawLine({ start: { x: colX, y: headBotY }, end: { x: colX + colW, y: headBotY }, thickness: borderW, color: borderColor });
        }
        var hy = top + padTop * 0.55;
        var drawFamily = wrappedCols[ci].family;
        for (var hj = 0; hj < wrappedCols[ci].header.length; hj++) {
          await drawLine(ctx, wrappedCols[ci].header[hj], { size: headSize / ctx.scale, family: drawFamily, bold: true, italic: false, align: b.align === 'center' ? 'center' : 'left', boxX: colX + padSide, boxW: colW - padSide * 2, topPt: hy, color: isPlainHeader ? 'accent' : 'ink' });
          hy += headSize * LINE_HEIGHT;
        }
        var ly = top + headH + padTop * 0.5;
        for (var lj = 0; lj < wrappedCols[ci].lines.length; lj++) {
          var line = wrappedCols[ci].lines[lj];
          var drawSize = (lineSize / ctx.scale) * (wrappedCols[ci].scale || 1);
          if (b.align === 'center') {
            await drawRichLineCenter(ctx, line, colX + padSide, colW - padSide * 2, ly, drawSize, drawFamily, false, 'ink');
          } else {
            await drawRichLineLeft(ctx, line, colX + padSide, ly, drawSize, drawFamily, false, 'ink');
          }
          ly += lineSize * LINE_HEIGHT;
        }
      }
    }
    ctx.cursorY = top + totalH + U.mmToPt(3) * ctx.scale;
  }

  async function layoutBand(ctx, b) {
    var size = b.size * ctx.scale;
    var padV = U.mmToPt(3) * ctx.scale;
    var h = size * LINE_HEIGHT + padV * 2;
    var top = ctx.cursorY;
    if (ctx.draw) {
      var topY = yFromTop(ctx, top), botY = yFromTop(ctx, top + h);
      ctx.page.drawRectangle({ x: 0, y: botY, width: ctx.pageWpt, height: topY - botY, color: colorFor(ctx, 'accent') });
      var family = roleFamily(ctx, b.font || 'secondary');
      // The fill always bleeds edge-to-edge, but left-aligned text still respects
      // the normal content margin so it lines up with everything below it.
      var textBoxX = b.align === 'left' ? ctx.marginPt : 0;
      var textBoxW = b.align === 'left' ? ctx.contentWpt : ctx.pageWpt;
      await drawLine(ctx, b.text, { size: b.size, family: family, bold: b.weight === 'bold', italic: false, align: b.align || 'center', boxX: textBoxX, boxW: textBoxW, topPt: top + padV, color: 'white' });
    }
    ctx.cursorY = top + h + U.mmToPt(2) * ctx.scale;
  }

  async function layoutCardsRow(ctx, b) {
    var n = b.cards.length;
    var gap = U.mmToPt(6) * ctx.scale;
    var cardW = (ctx.contentWpt - gap * (n - 1)) / n;
    var titleSize = 12.5 * ctx.scale, lineSize = 11.2 * ctx.scale;
    var pad = U.mmToPt(4) * ctx.scale;
    var stripH = U.mmToPt(1.1) * ctx.scale;

    var wrappedCards = [];
    var cardScales = [];
    var cardFamilies = [];
    var maxLines = 0;
    for (var c = 0; c < n; c++) {
      var innerW = cardW - pad * 2;
      // A card tagged fontKey:'teacher' (the "Submitted to" section) may
      // carry its own font pairing - see itemFamily / createDefaultState.
      var cardFamily = itemFamily(ctx, b.font, b.cards[c].fontKey);
      var group = await resolveLineGroup(ctx, b.cards[c].lines, innerW, lineSize / ctx.scale, cardFamily, false);
      wrappedCards.push(group.lines);
      cardScales.push(group.scale);
      cardFamilies.push(cardFamily);
      maxLines = Math.max(maxLines, group.lines.length);
    }
    var h = stripH + pad * 1.6 + titleSize * LINE_HEIGHT + maxLines * lineSize * LINE_HEIGHT + pad * 0.6;
    var top = ctx.cursorY;

    if (ctx.draw) {
      var fill = mixWithWhite(ctx.accentRgb, 0.07);
      for (var ci = 0; ci < n; ci++) {
        var x = ctx.marginPt + ci * (cardW + gap);
        var topY = yFromTop(ctx, top), botY = yFromTop(ctx, top + h);
        ctx.page.drawRectangle({ x: x, y: botY, width: cardW, height: topY - botY, color: ctx.PDFLib.rgb(fill.r, fill.g, fill.b) });
        ctx.page.drawRectangle({ x: x, y: topY - stripH, width: cardW, height: stripH, color: colorFor(ctx, 'accent') });
        await drawLine(ctx, b.cards[ci].title, { size: titleSize / ctx.scale, family: itemFamily(ctx, 'primary', b.cards[ci].fontKey), bold: true, italic: false, align: 'left', boxX: x + pad, boxW: cardW - pad * 2, topPt: top + stripH + pad, color: 'ink' });
        var ly = top + stripH + pad + titleSize * LINE_HEIGHT;
        for (var lj = 0; lj < wrappedCards[ci].length; lj++) {
          await drawRichLineLeft(ctx, wrappedCards[ci][lj], x + pad, ly, (lineSize / ctx.scale) * (cardScales[ci] || 1), cardFamilies[ci], false, 'ink');
          ly += lineSize * LINE_HEIGHT;
        }
      }
    }
    ctx.cursorY = top + h + U.mmToPt(3) * ctx.scale;
  }

  async function layoutMetaStrip(ctx, b) {
    var n = b.items.length;
    var colW = ctx.contentWpt / n;
    var labelSize = 8 * ctx.scale, valueSize = 11.5 * ctx.scale;
    var padV = U.mmToPt(2.4) * ctx.scale;
    var h = padV * 2 + labelSize * LINE_HEIGHT + valueSize * LINE_HEIGHT;
    var top = ctx.cursorY;
    if (ctx.draw) {
      var lineColor = colorFor(ctx, 'muted');
      ctx.page.drawLine({ start: { x: ctx.marginPt, y: yFromTop(ctx, top) }, end: { x: ctx.pageWpt - ctx.marginPt, y: yFromTop(ctx, top) }, thickness: 1, color: lineColor });
      ctx.page.drawLine({ start: { x: ctx.marginPt, y: yFromTop(ctx, top + h) }, end: { x: ctx.pageWpt - ctx.marginPt, y: yFromTop(ctx, top + h) }, thickness: 1, color: lineColor });
      for (var i = 0; i < n; i++) {
        var x = ctx.marginPt + i * colW;
        await drawLine(ctx, b.items[i].label, { size: 8, family: CT.MONO_FONT.pdf, bold: false, italic: false, align: 'left', boxX: x, boxW: colW, topPt: top + padV, color: 'muted' });
        await drawLine(ctx, b.items[i].value, { size: 11.5, family: CT.MONO_FONT.pdf, bold: true, italic: false, align: 'left', boxX: x, boxW: colW, topPt: top + padV + labelSize * LINE_HEIGHT, color: 'ink' });
      }
    }
    ctx.cursorY = top + h + U.mmToPt(4) * ctx.scale;
  }

  async function layoutPairBlock(ctx, b) {
    var solo = !(b.left && b.right);
    var gap = U.mmToPt(8) * ctx.scale;
    var colW = solo ? ctx.contentWpt * 0.7 : (ctx.contentWpt - gap) / 2;
    var titleSize = 12 * ctx.scale, lineSize = 11.2 * ctx.scale;

    async function measureSide(side) {
      if (!side) return 0;
      // A side tagged fontKey:'teacher' (the "Submitted to" section) may
      // carry its own font pairing - see itemFamily / createDefaultState.
      var sideFamily = itemFamily(ctx, b.font, side.fontKey);
      var group = await resolveLineGroup(ctx, side.lines, colW, lineSize / ctx.scale, sideFamily, false);
      return { lines: group.lines, scale: group.scale, family: sideFamily, h: titleSize * LINE_HEIGHT + group.lines.length * lineSize * LINE_HEIGHT };
    }
    var L = await measureSide(b.left);
    var R = await measureSide(b.right);
    var h = Math.max(L ? L.h : 0, R ? R.h : 0);
    var top = ctx.cursorY;

    if (ctx.draw) {
      var leftX = solo ? ctx.marginPt + (ctx.contentWpt - colW) / 2 : ctx.marginPt;
      var rightX = ctx.marginPt + colW + gap;
      if (b.left) {
        await drawLine(ctx, b.left.title, { size: titleSize / ctx.scale, family: L.family, bold: true, italic: false, align: 'center', boxX: leftX, boxW: colW, topPt: top, color: 'accent' });
        var ly = top + titleSize * LINE_HEIGHT;
        for (var i = 0; i < L.lines.length; i++) { await drawRichLineCenter(ctx, L.lines[i], leftX, colW, ly, (lineSize / ctx.scale) * (L.scale || 1), L.family, false, 'ink'); ly += lineSize * LINE_HEIGHT; }
      }
      if (b.right) {
        var rx = solo ? leftX : rightX;
        await drawLine(ctx, b.right.title, { size: titleSize / ctx.scale, family: R.family, bold: true, italic: false, align: 'center', boxX: rx, boxW: colW, topPt: top, color: 'accent' });
        var ry = top + titleSize * LINE_HEIGHT;
        for (var j = 0; j < R.lines.length; j++) { await drawRichLineCenter(ctx, R.lines[j], rx, colW, ry, (lineSize / ctx.scale) * (R.scale || 1), R.family, false, 'ink'); ry += lineSize * LINE_HEIGHT; }
      }
      if (b.left && b.right) {
        var dx = ctx.marginPt + colW + gap / 2;
        ctx.page.drawLine({ start: { x: dx, y: yFromTop(ctx, top) }, end: { x: dx, y: yFromTop(ctx, top + h) }, thickness: 0.6, color: colorFor(ctx, 'muted') });
      }
    }
    ctx.cursorY = top + h + U.mmToPt(3) * ctx.scale;
  }

  var LAYOUT = {
    space: layoutSpace, logo: layoutLogo, heading: layoutTextBlock, text: layoutTextBlock,
    rule: layoutRule, table: layoutTable, band: layoutBand, cardsRow: layoutCardsRow,
    metaStrip: layoutMetaStrip, pairBlock: layoutPairBlock
  };

  /** Walks every block, measuring and/or drawing depending on ctx.draw. Returns the
   *  final cursorY (i.e. total height consumed) so callers can fit/center the page.
   *  `ctx.extraGap` (if set) is inserted between every pair of consecutive blocks -
   *  this is what lets short content spread across the page the way a real cover
   *  page does, instead of collapsing into a compact island in the middle. */
  async function walkBlocks(ctx, blocks, startY) {
    ctx.cursorY = startY || 0;
    for (var i = 0; i < blocks.length; i++) {
      var fn = LAYOUT[blocks[i].t];
      if (fn) await fn(ctx, blocks[i]);
      if (i < blocks.length - 1) ctx.cursorY += (ctx.extraGap || 0);
    }
    return ctx.cursorY;
  }

  // ------------------------------------------------------------------
  // Page-level frame / background (customization, applied uniformly - not
  // part of any template's block list, see templates.js header comment)
  // ------------------------------------------------------------------
  function drawPageDecoration(ctx, custom) {
    var accent = colorFor(ctx, 'accent');
    if (custom.background === 'tint') {
      var t = mixWithWhite(ctx.accentRgb, 0.045);
      ctx.page.drawRectangle({ x: 0, y: 0, width: ctx.pageWpt, height: ctx.pageHpt, color: ctx.PDFLib.rgb(t.r, t.g, t.b) });
    }
    var inset = U.mmToPt(9);
    if (custom.border === 'frame-thin' || custom.border === 'frame-double') {
      ctx.page.drawRectangle({ x: inset, y: inset, width: ctx.pageWpt - inset * 2, height: ctx.pageHpt - inset * 2, borderColor: accent, borderWidth: 1 });
      if (custom.border === 'frame-double') {
        var inset2 = inset + U.mmToPt(1.6);
        ctx.page.drawRectangle({ x: inset2, y: inset2, width: ctx.pageWpt - inset2 * 2, height: ctx.pageHpt - inset2 * 2, borderColor: accent, borderWidth: 0.6 });
      }
    } else if (custom.border === 'corner') {
      var len = U.mmToPt(14), o = U.mmToPt(9);
      var corners = [[o, ctx.pageHpt - o, 1, -1], [ctx.pageWpt - o, ctx.pageHpt - o, -1, -1], [o, o, 1, 1], [ctx.pageWpt - o, o, -1, 1]];
      corners.forEach(function (c) {
        var x = c[0], y = c[1], dx = c[2], dy = c[3];
        ctx.page.drawLine({ start: { x: x, y: y }, end: { x: x + dx * len, y: y }, thickness: 1.4, color: accent });
        ctx.page.drawLine({ start: { x: x, y: y }, end: { x: x, y: y + dy * len }, thickness: 1.4, color: accent });
      });
    }
  }

  // ------------------------------------------------------------------
  // Public: pure builder
  // ------------------------------------------------------------------
  async function buildPdfBytes(PDFLib, state) {
    var tpl = CT.getTemplate(state.template);
    var custom = state.customization;
    var data = CT.mergedData(state);
    var blocks = tpl.getBlocks(data, custom);

    var doc = await PDFLib.PDFDocument.create();
    doc.setTitle(U.sanitizeForPdf(data.uniName || 'Cover Page'));
    doc.setProducer('PUST Cover Page Generator');
    doc.setCreator('PUST Cover Page Generator');
    var page = doc.addPage([U.mmToPt(PAGE_W_MM), U.mmToPt(PAGE_H_MM)]);

    var ctx = makeCtx(PDFLib, doc, page, custom);
    await preloadFonts(ctx, blocks);
    var availableH = ctx.pageHpt - ctx.marginPt - ctx.marginBottomPt;
    var gaps = Math.max(blocks.length - 1, 1);

    // Pass 1: measure at natural (scale=1, no extra gap) size.
    ctx.draw = false; ctx.scale = 1; ctx.extraGap = 0;
    var naturalH = await walkBlocks(ctx, blocks, 0);

    var scale = 1, extraGap = 0, topOffset = ctx.marginPt;
    if (naturalH > availableH) {
      // Too tall even at nominal size: shrink fonts/spacing uniformly to fit one page.
      scale = U.clamp(availableH / naturalH, MIN_FIT_SCALE, 1);
      ctx.scale = scale; ctx.extraGap = 0;
      var measuredH = await walkBlocks(ctx, blocks, 0);
      topOffset = ctx.marginPt + Math.max(0, (availableH - measuredH) / 2);
    } else {
      // Fits comfortably: spread it across the page like a real cover page
      // (matching the classic `justify-content: space-between` look) instead
      // of leaving one big, oddly-centered gap.
      var leftover = availableH - naturalH;
      extraGap = U.clamp(leftover / gaps, 0, U.mmToPt(9));
      var used = extraGap * gaps;
      topOffset = ctx.marginPt + Math.max(0, (leftover - used) / 2);
      ctx.scale = 1; ctx.extraGap = extraGap;
    }

    // Page-level border/background goes down first so content draws on top.
    drawPageDecoration(ctx, custom);

    // Final pass: draw for real.
    ctx.draw = true;
    await walkBlocks(ctx, blocks, topOffset);

    return doc.save();
  }

  function suggestedFilename(state) {
    var data = state.data;
    var namePart = U.safeFilenamePart(data.stuName || data.uniName || 'Cover');
    var typePart = U.safeFilenamePart(CT.helpers.docTypeLabel(data));
    return namePart + '_' + typePart + '_CoverPage.pdf';
  }

  async function generateAndDownload(state) {
    if (typeof window === 'undefined' || !window.PDFLib) throw new Error('PDF library not loaded');
    var bytes = await buildPdfBytes(window.PDFLib, state);
    var blob = new Blob([bytes], { type: 'application/pdf' });
    U.downloadBlob(blob, suggestedFilename(state));
    return bytes;
  }

  root.CoverPDF = {
    buildPdfBytes: buildPdfBytes,
    generateAndDownload: generateAndDownload,
    suggestedFilename: suggestedFilename
  };
}(typeof window !== 'undefined' ? window : globalThis));
