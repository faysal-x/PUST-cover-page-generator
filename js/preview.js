/**
 * preview.js
 * ---------------------------------------------------------------------------
 * Renders the current state as real DOM inside a fixed 210mm x 297mm page.
 *
 * Two *independent* scale transforms are used, on two different elements,
 * and neither one is ever read by pdf.js:
 *   1. `.a4-scale-wrapper` - shrinks the whole page visually so it fits
 *      whatever viewport it's sitting in (desktop, tablet, phone). Purely
 *      cosmetic; the page's own mm dimensions never change.
 *   2. `.cp-content` - shrinks *content* (fonts/spacing) uniformly if it
 *      would otherwise overflow the fixed page height, so unusually long
 *      input never gets clipped or pushed onto a second page.
 * Because the PDF is generated straight from `state` via pdf-lib (no
 * html2canvas screenshot of this DOM), neither transform can ever leak into
 * the exported file - which is what caused the "tiny/blurry text on mobile"
 * bug in the previous implementation.
 */
(function (root) {
  'use strict';

  var U = root.CoverUtils;
  var CT = root.CoverTemplates;

  var PAGE_W_MM = 210, PAGE_H_MM = 297;
  var MARGIN_MM = 20, MARGIN_BOTTOM_MM = 18;
  var MIN_FIT_SCALE = 0.8;
  // Info lines (name, roll, departments, ...) stay on ONE line: shrink to fit
  // the column; past this floor, wrap instead (mirrors pdf.js).
  var MIN_ONE_LINE_SCALE = 0.62;

  var els = null; // cached DOM refs, set up in mount()

  function mount(viewportEl) {
    viewportEl.innerHTML = '';
    var scaleWrapper = document.createElement('div');
    scaleWrapper.className = 'a4-scale-wrapper';

    var page = document.createElement('div');
    page.className = 'a4-page';
    page.id = 'cover-page';

    var contentBox = document.createElement('div');
    contentBox.className = 'cp-content-box';

    var content = document.createElement('div');
    content.className = 'cp-content';

    var corners = document.createElement('div');
    corners.className = 'cp-corner-marks';
    ['tl', 'tr', 'bl', 'br'].forEach(function (pos) {
      var c = document.createElement('div');
      c.className = 'cp-corner cp-corner-' + pos;
      corners.appendChild(c);
    });

    contentBox.appendChild(content);
    page.appendChild(contentBox);
    page.appendChild(corners);
    scaleWrapper.appendChild(page);
    viewportEl.appendChild(scaleWrapper);

    els = { viewport: viewportEl, scaleWrapper: scaleWrapper, page: page, contentBox: contentBox, content: content };

    var ro = new ResizeObserver(U.debounce(applyViewportScale, 30));
    ro.observe(viewportEl);
    window.addEventListener('orientationchange', function () { setTimeout(applyViewportScale, 200); });
    applyViewportScale();
    return els;
  }

  function applyViewportScale() {
    if (!els) return;
    var pad = 24; // px breathing room
    var availW = els.viewport.clientWidth - pad * 2;
    var availH = els.viewport.clientHeight - pad * 2;
    var natW = els.page.offsetWidth;
    var natH = els.page.offsetHeight;
    if (!natW || !natH || availW <= 0 || availH <= 0) return;
    var scale = Math.min(availW / natW, availH / natH);
    scale = U.clamp(scale, 0.18, 1.4);
    els.scaleWrapper.style.transform = 'scale(' + scale.toFixed(4) + ')';
  }

  // -------------------------------------------------------------------
  // Colors / fonts resolution
  // -------------------------------------------------------------------
  function applyTheme(custom) {
    var pairing = CT.getFontPairing(custom.font);
    // Per-section override: the "Submitted to" block (items tagged
    // fontKey:'teacher' by templates.js) may render in its own pairing.
    // An empty teacherFont means "no override" - same pairing as the page.
    var teacherPairing = custom.teacherFont ? CT.getFontPairing(custom.teacherFont) : pairing;
    var page = els.page;
    page.style.setProperty('--cp-accent', custom.accent);
    page.style.setProperty('--cp-font-primary', pairing.dom.primary);
    page.style.setProperty('--cp-font-secondary', pairing.dom.secondary);
    page.style.setProperty('--cp-font-teacher', teacherPairing.dom.secondary);
    page.style.setProperty('--cp-font-teacher-title', teacherPairing.dom.primary);
    page.style.setProperty('--cp-font-mono', CT.MONO_FONT.dom);
    page.style.setProperty('--cp-margin', MARGIN_MM + 'mm');
    page.className = 'a4-page cp-bg-' + custom.background + ' cp-border-' + custom.border;
    els.contentBox.style.paddingBottom = (MARGIN_BOTTOM_MM - MARGIN_MM) + 'mm';
  }

  // -------------------------------------------------------------------
  // Small safe DOM helpers (never innerHTML with user data)
  // -------------------------------------------------------------------
  function el(tag, className) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    return e;
  }
  function styleTextEl(e, block) {
    e.style.fontSize = block.size + 'pt';
    e.style.fontFamily = 'var(--cp-font-' + (block.font || 'secondary') + ')';
    if (block.weight === 'bold') e.style.fontWeight = '700';
    if (block.style === 'italic') e.style.fontStyle = 'italic';
    if (block.tracking) e.style.letterSpacing = '0.08em';
    e.classList.add('cp-a-' + (block.align || 'center'));
    e.classList.add('cp-c-' + (block.color || 'ink'));
  }
  function linesOf(block) { return block.lines && block.lines.length ? block.lines : (block.text ? [block.text] : []); }

  // A "rich line" is a string or an array of { text, bold } segments (see
  // templates.js). Fills `parent` with text/strong nodes; safe against user data.
  function fillRichLine(parent, line, className) {
    if (Array.isArray(line)) {
      line.forEach(function (s, i) {
        if (i > 0) parent.appendChild(document.createTextNode(' '));
        var node = document.createElement(s.bold ? 'strong' : 'span');
        node.textContent = s.text;
        parent.appendChild(node);
        node.dataset.bold = s.bold ? '1' : '0';
      });
    } else {
      parent.textContent = line;
    }
    if (className) parent.className = className;
    return parent;
  }

  // -------------------------------------------------------------------
  // Block -> DOM
  // -------------------------------------------------------------------
  var BUILDERS = {
    space: function (b) {
      var e = el('div', 'cp-space');
      e.style.height = b.mm + 'mm';
      return e;
    },
    logo: function (b) {
      var wrap = el('div', 'cp-logo-wrap cp-a-' + b.align);
      var box = el('div', 'cp-logo-box' + (b.frame === 'seal' ? ' cp-logo-seal' : ''));
      var sizeMm = CT.logoSizeMm(b.size);
      box.style.width = sizeMm + 'mm';
      box.style.height = sizeMm + 'mm';
      if (b.dataUrl) {
        var img = el('img', 'cp-logo-img');
        img.src = b.dataUrl;
        img.alt = 'University logo';
        box.appendChild(img);
      } else {
        box.classList.add('cp-logo-placeholder');
        var span = el('span', 'cp-logo-initial');
        span.textContent = b.initial;
        box.appendChild(span);
      }
      wrap.appendChild(box);
      return wrap;
    },
    heading: buildTextBlock,
    text: buildTextBlock,
    rule: function (b) {
      var e = el('div', 'cp-rule cp-rule-' + b.style + ' cp-rule-w-' + b.width + ' cp-rule-' + b.weight + ' cp-rc-' + (b.color || 'ink'));
      return e;
    },
    table: function (b) {
      if (b.borderWeight === 'none') {
        var wrapNone = el('div', 'cp-cols cp-f-' + b.font);
        b.columns.forEach(function (col) {
          // fontKey:'teacher' columns ("Submitted to") may override the font
          // (see applyTheme's --cp-font-teacher and templates.js infoColumns).
          var c = el('div', 'cp-col' + (col.fontKey ? ' cp-f-' + col.fontKey : ''));
          var h = el('div', 'cp-col-head');
          h.textContent = col.header;
          c.appendChild(h);
          col.lines.forEach(function (line) {
            var d = el('div');
            fillRichLine(d, line, 'cp-col-line');
            c.appendChild(d);
          });
          wrapNone.appendChild(c);
        });
        return wrapNone;
      }
      var wrap = el('div', 'cp-table-wrap cp-border-' + b.borderWeight);
      var table = el('table', 'cp-table cp-head-' + (b.header || 'shade') + ' cp-f-' + b.font);
      var thead = el('tr');
      var tbody = el('tr');
      b.columns.forEach(function (col) {
        var th = el('th'); th.textContent = col.header; thead.appendChild(th);
        var td = el('td');
        // th and td are siblings (not ancestors), so both need the override class.
        if (col.fontKey) { th.classList.add('cp-f-' + col.fontKey); td.classList.add('cp-f-' + col.fontKey); }
        col.lines.forEach(function (line) {
          var d = el('div');
          fillRichLine(d, line, 'cp-cell-line');
          td.appendChild(d);
        });
        tbody.appendChild(td);
      });
      table.appendChild(thead);
      table.appendChild(tbody);
      wrap.appendChild(table);
      return wrap;
    },
    band: function (b) {
      var e = el('div', 'cp-band cp-a-' + b.align + ' cp-f-' + (b.font || 'secondary'));
      e.style.fontSize = b.size + 'pt';
      if (b.weight === 'bold') e.style.fontWeight = '700';
      e.textContent = b.text;
      return e;
    },
    cardsRow: function (b) {
      var wrap = el('div', 'cp-cards cp-cards-' + b.cards.length + ' cp-f-' + b.font);
      b.cards.forEach(function (card) {
        var c = el('div', 'cp-card' + (card.fontKey ? ' cp-f-' + card.fontKey : ''));
        var t = el('div', 'cp-card-title'); t.textContent = card.title; c.appendChild(t);
        card.lines.forEach(function (line) {
          var d = el('div');
          fillRichLine(d, line, 'cp-card-line');
          c.appendChild(d);
        });
        wrap.appendChild(c);
      });
      return wrap;
    },
    metaStrip: function (b) {
      var wrap = el('div', 'cp-metastrip cp-metastrip-' + b.items.length);
      b.items.forEach(function (item) {
        var c = el('div', 'cp-metaitem');
        var l = el('div', 'cp-metalabel'); l.textContent = item.label; c.appendChild(l);
        var v = el('div', 'cp-metavalue'); v.textContent = item.value; c.appendChild(v);
        wrap.appendChild(c);
      });
      return wrap;
    },
    pairBlock: function (b) {
      var wrap = el('div', 'cp-pair cp-f-' + b.font);
      function side(s) {
        var c = el('div', 'cp-pair-col' + (s.fontKey ? ' cp-f-' + s.fontKey : ''));
        var t = el('div', 'cp-pair-title'); t.textContent = s.title; c.appendChild(t);
        s.lines.forEach(function (line) {
          var d = el('div');
          fillRichLine(d, line, 'cp-pair-line');
          c.appendChild(d);
        });
        return c;
      }
      if (b.left) wrap.appendChild(side(b.left));
      if (b.left && b.right) wrap.appendChild(el('div', 'cp-pair-divider'));
      if (b.right) wrap.appendChild(side(b.right));
      if (!b.left || !b.right) wrap.classList.add('cp-pair-solo');
      return wrap;
    }
  };

  function buildTextBlock(b) {
    var lines = linesOf(b);
    if (!lines.length) return null;
    var wrap = el('div', 'cp-text-wrap');
    lines.forEach(function (line) {
      var e = el('div', 'cp-text-line');
      styleTextEl(e, b);
      e.textContent = line;
      wrap.appendChild(e);
    });
    return wrap;
  }

  // -------------------------------------------------------------------
  // Public render
  // -------------------------------------------------------------------
  function render(state) {
    if (!els) throw new Error('CoverPreview.mount() must be called first');
    applyTheme(state.customization);
    els.content.innerHTML = '';
    els.content.style.transform = 'none';
    els.content.dataset.infoFit = state.customization.infoFit === 'wrap' ? 'wrap' : 'one-line';

    var tpl = CT.getTemplate(state.template);
    var data = CT.mergedData(state);
    var blocks = tpl.getBlocks(data, state.customization);

    blocks.forEach(function (b) {
      var builder = BUILDERS[b.t];
      if (!builder) return;
      var node = builder(b);
      if (node) els.content.appendChild(node);
    });

    if (state.customization.infoFit !== 'wrap') applyOneLineFit();
    fitContentToPage();
    applyViewportScale();
  }

  /** Keeps every info line (table cells, borderless columns, cards, pair sides)
   *  on a single visual line: measures each group with nowrap, then shrinks the
   *  group's font until the longest line fits. Below MIN_ONE_LINE_SCALE the
   *  group falls back to wrapping - the same rule pdf.js applies. */
  function applyOneLineFit() {
    var groups = new Map();
    var lineEls = els.page.querySelectorAll('.cp-cell-line, .cp-col-line, .cp-card-line, .cp-pair-line');
    Array.prototype.forEach.call(lineEls, function (lineEl) {
      var group = lineEl.closest('td, .cp-col, .cp-card, .cp-pair-col');
      if (!group) return;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(lineEl);
    });
    groups.forEach(function (lines, group) {
      if (!lines.length) return;
      var basePx = parseFloat(getComputedStyle(lines[0]).fontSize) || 0;
      if (!basePx) return;
      lines.forEach(function (el) { el.classList.add('cp-nowrap'); });
      // Force layout, then find how much the widest line overflows its box.
      var ratio = 1;
      for (var i = 0; i < lines.length; i++) {
        var w = lines[i].scrollWidth, box = lines[i].clientWidth;
        if (box > 0 && w > box) ratio = Math.max(ratio, w / box);
      }
      if (ratio <= 1) return; // everything already fits
      var scale = U.clamp(1 / ratio, MIN_ONE_LINE_SCALE, 1);
      if (scale <= MIN_ONE_LINE_SCALE + 1e-6 && 1 / ratio < MIN_ONE_LINE_SCALE) {
        // Hopeless: let this group wrap like normal text instead.
        lines.forEach(function (el) { el.classList.remove('cp-nowrap'); el.classList.add('cp-nowrap-off'); });
        return;
      }
      lines.forEach(function (el) { el.style.fontSize = (basePx * scale).toFixed(2) + 'px'; });
    });
  }

  /** Uniformly shrinks .cp-content if it would overflow the fixed page height;
   *  otherwise spreads its children across the available height (mirrors the
   *  `extraGap` distribution pdf.js uses) so short content still fills the page
   *  the way a real cover page does, instead of collapsing to a centered island. */
  function fitContentToPage() {
    var box = els.contentBox;
    var content = els.content;
    content.style.transform = 'none';
    Array.prototype.forEach.call(content.children, function (child) { child.style.marginBottom = ''; });

    var natural = content.scrollHeight;
    var available = box.clientHeight;
    if (natural > available && natural > 0) {
      var scale = U.clamp(available / natural, MIN_FIT_SCALE, 1);
      content.style.transform = 'scale(' + scale.toFixed(3) + ')';
      content.style.transformOrigin = 'top center';
      content.dataset.fitScale = scale.toFixed(3);
      return;
    }
    delete content.dataset.fitScale;
    var children = content.children;
    var gaps = Math.max(children.length - 1, 1);
    var leftover = available - natural;
    if (leftover <= 0 || !children.length) return;
    var pxPerMm = els.page.offsetHeight / PAGE_H_MM;
    var capPx = 9 * pxPerMm;
    var extraGap = U.clamp(leftover / gaps, 0, capPx);
    for (var i = 0; i < children.length - 1; i++) children[i].style.marginBottom = extraGap + 'px';
  }

  function getPageElement() { return els ? els.page : null; }
  function refreshLayout() { applyViewportScale(); }

  root.CoverPreview = {
    PAGE_W_MM: PAGE_W_MM,
    PAGE_H_MM: PAGE_H_MM,
    MARGIN_MM: MARGIN_MM,
    mount: mount,
    render: render,
    getPageElement: getPageElement,
    refreshLayout: refreshLayout
  };
}(typeof window !== 'undefined' ? window : globalThis));
