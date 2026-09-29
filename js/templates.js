/**
 * templates.js
 * ---------------------------------------------------------------------------
 * This is the heart of "one template system" (preview and PDF never diverge):
 * each design turns the user's data into a small, plain-data BLOCK LIST
 * (headings, rules, tables, ...). preview.js turns that list into DOM nodes;
 * pdf.js turns the *same* list into vector drawing calls. Neither renderer
 * knows anything about "Classic" vs "Technical" - they only know how to draw
 * the handful of block types defined below. Adding a 6th design later means
 * adding one more entry to TEMPLATES, nothing else.
 *
 * Block shapes (all fields optional unless noted; renderers fill in sensible
 * defaults for anything omitted):
 *   { t:'space',    mm }
 *   { t:'logo',     dataUrl, align:'left'|'center', size:'small'|'medium'|'large',
 *                   frame:'plain'|'seal' }         // 'seal' draws a heritage-crest ring
 *   { t:'heading' | 'text',
 *     text, lines,                          // `lines` wins if both given
 *     size, weight:'normal'|'bold', style:'normal'|'italic',
 *     font:'primary'|'secondary'|'mono', align:'left'|'center'|'right',
 *     color:'ink'|'accent'|'muted'|'white', tracking:bool }
 *   { t:'rule',     style:'simple'|'double', color:'ink'|'accent'|'muted',
 *                   width:'full'|'short', weight:'thin'|'bold' }
 *   { t:'table',    columns:[{header,lines:[...]}], borderWeight:'thin'|'bold'|'none',
 *                   font:'primary'|'secondary'|'mono', header:'shade'|'plain' }
 *   { t:'band',     text, size, weight, align }         // full-bleed accent bar
 *   { t:'cardsRow', cards:[{title, lines:[...]}] }       // tinted info cards
 *   { t:'metaStrip',items:[{label,value}] }              // datasheet-style strip
 *   { t:'pairBlock',left:{title,lines}, right:{title,lines} }
 *
 * Every block is REQUIRED (a template must not omit "logo" etc.) — the
 * template's getBlocks() function simply never pushes a block whose content
 * is empty (this is where "hide empty fields" and the show/hide toggles are
 * enforced). Renderers can therefore assume every block they receive has
 * something worth drawing.
 */
(function (root) {
  'use strict';

  var U = root.CoverUtils;

  // ---------------------------------------------------------------------
  // Shared vocab: block constructors
  // ---------------------------------------------------------------------
  function heading(text, opts) {
    return Object.assign({ t: 'heading', text: text, lines: null, size: 20, weight: 'bold', style: 'normal', font: 'primary', align: 'center', color: 'ink', tracking: false }, opts || {});
  }
  function text(str, opts) {
    return Object.assign({ t: 'text', text: str, lines: null, size: 11, weight: 'normal', style: 'normal', font: 'secondary', align: 'center', color: 'ink', tracking: false }, opts || {});
  }
  function rule(opts) {
    return Object.assign({ t: 'rule', style: 'simple', color: 'ink', width: 'full', weight: 'thin' }, opts || {});
  }
  function space(mm) { return { t: 'space', mm: mm }; }
  function logoBlock(dataUrl, initial, opts) {
    return Object.assign({ t: 'logo', dataUrl: dataUrl || null, initial: initial || 'U', align: 'center', size: 'medium', frame: 'plain' }, opts || {});
  }
  function table(columns, opts) {
    return Object.assign({ t: 'table', columns: columns, borderWeight: 'thin', font: 'secondary', align: 'left', header: 'shade' }, opts || {});
  }
  function band(str, opts) {
    return Object.assign({ t: 'band', text: str, size: 13, weight: 'bold', align: 'center' }, opts || {});
  }
  function cardsRow(cards, opts) {
    return Object.assign({ t: 'cardsRow', cards: cards, font: 'secondary' }, opts || {});
  }
  function metaStrip(items, opts) {
    return Object.assign({ t: 'metaStrip', items: items }, opts || {});
  }
  function pairBlock(left, right, opts) {
    return Object.assign({ t: 'pairBlock', left: left, right: right, font: 'secondary' }, opts || {});
  }

  // ---------------------------------------------------------------------
  // Shared content helpers (empty-field hiding lives here, once)
  // ---------------------------------------------------------------------
  function initialOf(name) {
    var c = U.cleanText(name);
    return c ? c.charAt(0).toUpperCase() : 'U';
  }

  function kv(label, value) {
    value = U.cleanText(value);
    return value ? (label + value) : '';
  }

  // -------------------------------------------------------------------
  // Rich lines: mixed bold/normal text inside one info line. A line is a
  // plain string (all-normal, the classic shape) or an array of segments
  // like { text: 'Roll: ', bold: true }, { text: '2103042' }.
  // preview.js turns bold segments into real <strong> nodes and pdf.js draws
  // them with the bold font, so screen and PDF never diverge.
  // -------------------------------------------------------------------
  function seg(text, bold) {
    return { text: U.cleanText(text), bold: !!bold };
  }

  /** "Roll: " + value as one line with a bold label, or null when empty. */
  function boldLabelLine(label, value) {
    var v = U.cleanText(value);
    return v ? [seg(label, true), seg(v, false)] : null;
  }

  /** presentLines() for the rich shapes: keeps non-empty strings (cleaned)
   *  and non-empty segment arrays, drops everything else. */
  function richPresentLines() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) {
      var raw = arguments[i];
      if (raw === null || raw === undefined || raw === '') continue;
      if (typeof raw === 'string') {
        var c = U.cleanText(raw);
        if (c) out.push(c);
      } else if (Array.isArray(raw) && raw.length) {
        out.push(raw);
      }
    }
    return out;
  }

  function docTypeLabel(data) {
    if (data.docType === 'Custom') return U.cleanText(data.docTypeCustom) || 'Custom Document';
    return U.cleanText(data.docType) || 'Assignment';
  }

  function courseInfoLines(data) {
    return U.presentLines(kv('Course Title: ', data.courseTitle), kv('Course Code: ', data.courseCode));
  }

  function studentLines(data) {
    var yearSem = U.presentLines(normalizeYear(data.stuYear), normalizeSemester(data.stuSemester)).join(', ');
    // Labels (Name/Roll/Reg/Session) render bold, values normal. The department
    // shows as plain text with no "Dept:" prefix, matching the teacher block.
    return richPresentLines(
      boldLabelLine('Name: ', data.stuName),
      boldLabelLine('Roll: ', data.stuRoll),
      boldLabelLine('Reg. No: ', data.stuReg),
      boldLabelLine('Session: ', data.stuSession),
      yearSem,
      data.stuDept,
      data.stuUni
    );
  }

  function teacherLines(data) {
    // No "Name:" / "Dept:" / "Faculty:" labels in the Submitted-to block: the
    // professor's name is its own bold line; department and faculty appear as
    // plain text.
    return richPresentLines(
      U.cleanText(data.tchName) ? [seg(data.tchName, true)] : null,
      data.tchDesignation,
      data.tchDept,
      data.tchFaculty,
      data.tchUni
    );
  }

  function dateLine(data, withLabel) {
    var custom = U.cleanText(data.subDateCustom);
    if (custom) return custom;
    var d = U.formatHumanDate(data.subDate);
    if (!d) return '';
    return withLabel === false ? d : ('Date of Submission: ' + d);
  }

  // "2" / "2nd" -> "2nd Year" / "2nd Semester", so a bare ordinal never
  // renders as a dangling "2nd, 2nd" line. Values that already name the unit
  // ("2nd Year", "Spring Semester", ...) are kept exactly as typed.
  function ordinalOf(n) {
    switch (n % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  function withOrdinalSuffix(value, suffix) {
    var v = U.cleanText(value);
    if (!v) return '';
    if (new RegExp('\\b' + suffix + '\\b', 'i').test(v)) return v;
    var m = /^(\d+)(?:st|nd|rd|th)?$/i.exec(v);
    if (!m) return v;
    var n = parseInt(m[1], 10);
    var teen = n % 100 >= 11 && n % 100 <= 13;
    return (teen ? n + 'th' : n + ordinalOf(n)) + ' ' + suffix;
  }

  function normalizeYear(value) { return withOrdinalSuffix(value, 'Year'); }
  function normalizeSemester(value) { return withOrdinalSuffix(value, 'Semester'); }

  function infoColumns(data, custom, leftHeader, rightHeader) {
    var cols = [];
    if (custom.show.studentInfo) {
      var sl = studentLines(data);
      if (sl.length) cols.push({ header: leftHeader, lines: sl });
    }
    if (custom.show.teacherInfo) {
      var tl = teacherLines(data);
      // fontKey marks this item as the "Submitted to" section, letting the
      // renderers apply the optional teacher-font override (see createDefaultState).
      if (tl.length) cols.push({ header: rightHeader, lines: tl, fontKey: 'teacher' });
    }
    return cols;
  }

  function deptFacultyText(data, custom) {
    return U.presentLines(data.uniDept, custom.show.faculty ? data.uniFaculty : '');
  }

  // ---------------------------------------------------------------------
  // Design 1 — Classic Academic
  // ---------------------------------------------------------------------
  function classicBlocks(data, custom) {
    var blocks = [];
    if (custom.show.logo) blocks.push(logoBlock(data.logoDataUrl, initialOf(data.uniName), { align: 'center', size: custom.logoSize }));
    if (data.uniName) blocks.push(heading(data.uniName, { size: 21, font: 'primary', align: 'center' }));
    if (data.uniDept) {
      blocks.push(text('Department of', { size: 12, style: 'italic', color: 'muted', align: 'center' }));
      blocks.push(heading(data.uniDept, { size: 14.5, font: 'primary', align: 'center' }));
    }
    if (custom.show.faculty && data.uniFaculty) blocks.push(text(data.uniFaculty, { size: 12.5, weight: 'bold', font: 'secondary', align: 'center' }));
    blocks.push(rule({ style: 'simple', width: 'full' }));
    if (custom.show.courseInfo) {
      var cl = courseInfoLines(data);
      if (cl.length) blocks.push(text(null, { lines: cl, size: 11.5, style: 'italic', font: 'secondary', align: 'center' }));
    }
    var dt = docTypeLabel(data);
    if (dt) blocks.push(heading(dt.toUpperCase(), { size: 24, font: 'primary', align: 'center', color: 'accent' }));
    blocks.push(rule({ style: 'simple', width: 'full' }));
    var cols = infoColumns(data, custom, 'Submitted by', 'Submitted to');
    if (cols.length) blocks.push(table(cols, { borderWeight: 'thin', font: 'secondary' }));
    if (custom.show.date) {
      var dl = dateLine(data);
      if (dl) blocks.push(text(dl, { size: 10.5, style: 'italic', font: 'secondary', align: 'center' }));
    }
    return blocks;
  }

  // ---------------------------------------------------------------------
  // Design 2 — Modern Minimal
  // ---------------------------------------------------------------------
  function minimalBlocks(data, custom) {
    var blocks = [];
    if (custom.show.logo) blocks.push(logoBlock(data.logoDataUrl, initialOf(data.uniName), { align: 'left', size: custom.logoSize }));
    var dt = docTypeLabel(data);
    if (dt) blocks.push(text(dt.toUpperCase(), { size: 10, weight: 'bold', color: 'accent', align: 'left', tracking: true, font: 'secondary' }));
    if (data.uniName) blocks.push(heading(data.uniName, { size: 23, weight: 'normal', font: 'primary', align: 'left' }));
    blocks.push(rule({ style: 'simple', width: 'short', color: 'accent' }));
    var df = deptFacultyText(data, custom);
    if (df.length) blocks.push(text(null, { lines: df, size: 12, color: 'muted', align: 'left', font: 'secondary' }));
    if (custom.show.courseInfo) {
      var cl = courseInfoLines(data);
      if (cl.length) blocks.push(text(null, { lines: cl, size: 11, align: 'left', font: 'secondary' }));
    }
    var cols = infoColumns(data, custom, 'From', 'To');
    if (cols.length) blocks.push(table(cols, { borderWeight: 'none', font: 'secondary', align: 'left' }));
    if (custom.show.date) {
      var dl = dateLine(data);
      if (dl) blocks.push(text(dl, { size: 10, color: 'muted', align: 'left', font: 'secondary' }));
    }
    return blocks;
  }

  // ---------------------------------------------------------------------
  // Design 3 — Professional Corporate
  // ---------------------------------------------------------------------
  function corporateBlocks(data, custom) {
    var blocks = [];
    var dt = docTypeLabel(data);
    if (dt) blocks.push(band(dt.toUpperCase(), { size: 14, weight: 'bold', align: 'center' }));
    blocks.push(space(6));
    if (custom.show.logo) blocks.push(logoBlock(data.logoDataUrl, initialOf(data.uniName), { align: 'center', size: custom.logoSize }));
    if (data.uniName) blocks.push(heading(data.uniName, { size: 18, font: 'primary', align: 'center' }));
    var df = deptFacultyText(data, custom);
    if (df.length) blocks.push(text(null, { lines: df, size: 11.5, align: 'center', font: 'secondary', color: 'muted' }));
    blocks.push(rule({ style: 'simple', width: 'full', color: 'muted' }));
    if (custom.show.courseInfo) {
      var cl = courseInfoLines(data);
      if (cl.length) blocks.push(text(null, { lines: cl, size: 11.5, align: 'center', font: 'secondary' }));
    }
    var cards = [];
    if (custom.show.studentInfo) {
      var sl = studentLines(data);
      if (sl.length) cards.push({ title: 'Prepared By', lines: sl });
    }
    if (custom.show.teacherInfo) {
      var tl = teacherLines(data);
      if (tl.length) cards.push({ title: 'Submitted To', lines: tl, fontKey: 'teacher' });
    }
    if (cards.length) blocks.push(cardsRow(cards, { font: 'secondary' }));
    if (custom.show.date) {
      var dl = dateLine(data);
      if (dl) blocks.push(band(dl, { size: 10.5, weight: 'normal', align: 'center' }));
    }
    return blocks;
  }

  // ---------------------------------------------------------------------
  // Design 4 — Ivy Heritage (inspired by traditional collegiate crests/seals)
  // ---------------------------------------------------------------------
  function ivyHeritageBlocks(data, custom) {
    var blocks = [];
    if (custom.show.logo) blocks.push(logoBlock(data.logoDataUrl, initialOf(data.uniName), { align: 'center', size: custom.logoSize }));
    if (data.uniName) blocks.push(heading(data.uniName.toUpperCase(), { size: 18, font: 'primary', align: 'center', tracking: true }));
    blocks.push(rule({ style: 'double', width: 'short', color: 'accent' }));
    var df = deptFacultyText(data, custom);
    if (df.length) blocks.push(text(null, { lines: df, size: 12, style: 'italic', align: 'center', font: 'secondary' }));
    if (custom.show.courseInfo) {
      var cl = courseInfoLines(data);
      if (cl.length) blocks.push(text(null, { lines: cl, size: 11, style: 'italic', align: 'center', font: 'secondary' }));
    }
    var dt = docTypeLabel(data);
    if (dt) blocks.push(heading(dt.toUpperCase(), { size: 16, font: 'primary', align: 'center', color: 'accent', tracking: true }));
    blocks.push(rule({ style: 'double', width: 'short', color: 'accent' }));
    var leftPB = null, rightPB = null;
    if (custom.show.studentInfo) {
      var sl = studentLines(data);
      if (sl.length) leftPB = { title: 'Submitted by', lines: sl };
    }
    if (custom.show.teacherInfo) {
      var tl = teacherLines(data);
      if (tl.length) rightPB = { title: 'Submitted to', lines: tl, fontKey: 'teacher' };
    }
    if (leftPB || rightPB) blocks.push(pairBlock(leftPB, rightPB, { font: 'secondary' }));
    if (custom.show.date) {
      var dl = dateLine(data);
      if (dl) blocks.push(text(dl, { size: 10.5, style: 'italic', align: 'center', font: 'secondary' }));
    }
    return blocks;
  }

  // ---------------------------------------------------------------------
  // Design 5 — Modern Collegiate (inspired by contemporary university
  // rebrands: a bold flat-color hero band carrying the wordmark, left-
  // aligned, clean-bordered info table with no header shading)
  // ---------------------------------------------------------------------
  function modernCollegiateBlocks(data, custom) {
    var blocks = [];
    if (data.uniName) blocks.push(band(data.uniName, { size: 19, weight: 'bold', align: 'left', font: 'primary' }));
    blocks.push(space(5));
    if (custom.show.logo) blocks.push(logoBlock(data.logoDataUrl, initialOf(data.uniName), { align: 'left', size: custom.logoSize }));
    var dt = docTypeLabel(data);
    if (dt) blocks.push(text(dt, { size: 14, weight: 'bold', color: 'accent', align: 'left', font: 'secondary' }));
    var df = deptFacultyText(data, custom);
    if (df.length) blocks.push(text(null, { lines: df, size: 11.5, align: 'left', font: 'secondary', color: 'muted' }));
    blocks.push(rule({ style: 'simple', width: 'full' }));
    if (custom.show.courseInfo) {
      var cl = courseInfoLines(data);
      if (cl.length) blocks.push(text(null, { lines: cl, size: 11.5, align: 'left', font: 'secondary' }));
    }
    var cols = infoColumns(data, custom, 'Prepared By', 'Submitted To');
    if (cols.length) blocks.push(table(cols, { borderWeight: 'bold', font: 'secondary', align: 'left', header: 'plain' }));
    if (custom.show.date) {
      var dl = dateLine(data);
      if (dl) blocks.push(text(dl, { size: 10.5, align: 'left', font: 'secondary', color: 'muted' }));
    }
    return blocks;
  }

  // ---------------------------------------------------------------------
  // Design 6 — Oxford Classic (formal Oxbridge sheet: small-caps university
  // name, double accent rules, plain-header bordered table)
  // ---------------------------------------------------------------------
  function oxfordBlocks(data, custom) {
    var blocks = [];
    if (custom.show.logo) blocks.push(logoBlock(data.logoDataUrl, initialOf(data.uniName), { align: 'center', size: custom.logoSize }));
    if (data.uniName) blocks.push(heading(data.uniName.toUpperCase(), { size: 18.5, font: 'primary', align: 'center', tracking: true }));
    if (custom.show.faculty && data.uniFaculty) blocks.push(text(data.uniFaculty, { size: 11.5, style: 'italic', color: 'muted', align: 'center', font: 'secondary' }));
    blocks.push(rule({ style: 'double', width: 'full', color: 'accent', weight: 'bold' }));
    if (data.uniDept) {
      blocks.push(text('Department of', { size: 11, style: 'italic', color: 'muted', align: 'center' }));
      blocks.push(heading(data.uniDept, { size: 15, font: 'primary', align: 'center' }));
    }
    if (custom.show.courseInfo) {
      var ocl = courseInfoLines(data);
      if (ocl.length) blocks.push(text(null, { lines: ocl, size: 11, align: 'center', font: 'secondary' }));
    }
    var odt = docTypeLabel(data);
    if (odt) blocks.push(heading(odt.toUpperCase(), { size: 22, font: 'primary', align: 'center', color: 'accent', tracking: true }));
    blocks.push(rule({ style: 'double', width: 'full', color: 'accent' }));
    var ocols = infoColumns(data, custom, 'Submitted by', 'Submitted to');
    if (ocols.length) blocks.push(table(ocols, { borderWeight: 'bold', font: 'secondary', align: 'left', header: 'plain' }));
    if (custom.show.date) {
      var odl = dateLine(data);
      if (odl) blocks.push(text(odl, { size: 10.5, style: 'italic', align: 'center', font: 'secondary' }));
    }
    return blocks;
  }

  // ---------------------------------------------------------------------
  // Design 7 — Institute Technical (MIT-style: strong left-aligned serif
  // name, kicker, datasheet meta strip in mono, borderless accent columns)
  // ---------------------------------------------------------------------
  function instituteBlocks(data, custom) {
    var blocks = [];
    if (data.uniName) blocks.push(heading(data.uniName, { size: 20, weight: 'normal', font: 'primary', align: 'left' }));
    var idf = deptFacultyText(data, custom);
    if (idf.length) blocks.push(text(null, { lines: idf, size: 11, color: 'muted', align: 'left', font: 'secondary' }));
    blocks.push(rule({ style: 'simple', width: 'full', weight: 'bold', color: 'accent' }));
    var idt = docTypeLabel(data);
    if (idt) blocks.push(text(idt.toUpperCase(), { size: 10.5, weight: 'bold', color: 'accent', align: 'left', tracking: true, font: 'secondary' }));
    if (custom.show.logo) blocks.push(logoBlock(data.logoDataUrl, initialOf(data.uniName), { align: 'left', size: custom.logoSize }));
    var items = [];
    if (custom.show.courseInfo && U.cleanText(data.courseCode)) items.push({ label: 'Course Code', value: U.cleanText(data.courseCode) });
    if (U.cleanText(data.stuSession)) items.push({ label: 'Session', value: U.cleanText(data.stuSession) });
    if (custom.show.date) {
      var idl = dateLine(data, false);
      if (idl) items.push({ label: 'Date', value: idl });
    }
    if (items.length) blocks.push(metaStrip(items));
    if (custom.show.courseInfo) {
      var icl = courseInfoLines(data);
      if (icl.length) blocks.push(text(null, { lines: icl, size: 11.5, align: 'left', font: 'secondary' }));
    }
    var icols = infoColumns(data, custom, 'Prepared By', 'Submitted To');
    if (icols.length) blocks.push(table(icols, { borderWeight: 'none', font: 'secondary', align: 'left', header: 'shade' }));
    return blocks;
  }

  // ---------------------------------------------------------------------
  // Registry
  // ---------------------------------------------------------------------
  var TEMPLATES = [
    {
      id: 'classic',
      name: 'Classic Academic',
      description: 'Centered, traditional university front page with rule lines and a bordered submission table.',
      defaultCustomization: { accent: '#1a3c6e', font: 'classic-times', border: 'none', background: 'plain', logoSize: 'medium' },
      getBlocks: classicBlocks
    },
    {
      id: 'minimal',
      name: 'Modern Minimal',
      description: 'Left-aligned, generous whitespace, a single accent rule and quiet typographic hierarchy.',
      defaultCustomization: { accent: '#3457a6', font: 'modern-sans', border: 'none', background: 'plain', logoSize: 'small' },
      getBlocks: minimalBlocks
    },
    {
      id: 'corporate',
      name: 'Professional Corporate',
      description: 'A full-width accent header band and tinted info cards for a strong report-style hierarchy.',
      defaultCustomization: { accent: '#1f5c4a', font: 'modern-sans', border: 'none', background: 'plain', logoSize: 'medium' },
      getBlocks: corporateBlocks
    },
    {
      id: 'ivy',
      name: 'Ivy Heritage',
      description: 'A crest-style seal, tracked small-caps titles and double rules inspired by traditional collegiate seals.',
      defaultCustomization: { accent: '#7a1f2b', font: 'classic-times', border: 'corner', background: 'plain', logoSize: 'medium' },
      getBlocks: ivyHeritageBlocks
    },
    {
      id: 'modern-collegiate',
      name: 'Modern Collegiate',
      description: 'A bold flat-color hero band carrying the university name, in the style of contemporary university rebrands.',
      defaultCustomization: { accent: '#c2410c', font: 'modern-sans', border: 'none', background: 'plain', logoSize: 'small' },
      getBlocks: modernCollegiateBlocks
    },
    {
      id: 'oxford-classic',
      name: 'Oxford Classic',
      description: 'Formal Oxbridge sheet: small-caps titles, double accent rules and a bold-bordered submission table.',
      defaultCustomization: { accent: '#002147', font: 'classic-times', border: 'frame-thin', background: 'plain', logoSize: 'medium' },
      getBlocks: oxfordBlocks
    },
    {
      id: 'institute-technical',
      name: 'Institute Technical',
      description: 'Institute-style datasheet: strong left-aligned name, mono meta strip and borderless accent columns.',
      defaultCustomization: { accent: '#a31f34', font: 'elegant-serif', border: 'none', background: 'plain', logoSize: 'small' },
      getBlocks: instituteBlocks
    }
  ];

  function getTemplate(id) {
    for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i];
    return TEMPLATES[0];
  }

  // ---------------------------------------------------------------------
  // Font pairings — "primary"/"secondary" resolve to real fonts per renderer.
  // "mono" is always available as a third role regardless of pairing, for
  // any template that wants a monospace accent, so switching font pairing
  // never breaks a template that uses it.
  // ---------------------------------------------------------------------
  // PDF note: pdf-lib's built-in fonts are limited to Times / Helvetica /
  // Courier, so serif pairings map to Times and sans pairings to Helvetica in
  // the exported file (the same trade-off every pairing here already made).
  var FONT_PAIRINGS = [
    { id: 'classic-times', label: 'Times New Roman', dom: { primary: "'Times New Roman', Times, serif", secondary: "'Times New Roman', Times, serif" }, pdf: { primary: 'Times', secondary: 'Times' } },
    { id: 'times-arial', label: 'Times + Arial', dom: { primary: "'Times New Roman', Times, serif", secondary: "Arial, Helvetica, sans-serif" }, pdf: { primary: 'Times', secondary: 'Helvetica' } },
    { id: 'georgia', label: 'Georgia', dom: { primary: "Georgia, 'Times New Roman', serif", secondary: "Georgia, 'Times New Roman', serif" }, pdf: { primary: 'Times', secondary: 'Times' } },
    { id: 'palatino', label: 'Palatino', dom: { primary: "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif", secondary: "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif" }, pdf: { primary: 'Times', secondary: 'Times' } },
    { id: 'elegant-serif', label: 'Elegant Serif', dom: { primary: "'DM Serif Display', Georgia, serif", secondary: "'DM Sans', Helvetica, Arial, sans-serif" }, pdf: { primary: 'Times', secondary: 'Helvetica' } },
    { id: 'modern-sans', label: 'Modern Sans', dom: { primary: "'DM Sans', Helvetica, Arial, sans-serif", secondary: "'DM Sans', Helvetica, Arial, sans-serif" }, pdf: { primary: 'Helvetica', secondary: 'Helvetica' } },
    { id: 'inter', label: 'Inter', dom: { primary: "'Inter', 'DM Sans', 'Segoe UI', Helvetica, Arial, sans-serif", secondary: "'Inter', 'DM Sans', 'Segoe UI', Helvetica, Arial, sans-serif" }, pdf: { primary: 'Helvetica', secondary: 'Helvetica' } },
    { id: 'source-serif', label: 'Source Serif', dom: { primary: "'Source Serif 4', Georgia, 'Times New Roman', serif", secondary: "'Source Serif 4', Georgia, 'Times New Roman', serif" }, pdf: { primary: 'Times', secondary: 'Times' } },
    { id: 'arial-helvetica', label: 'Arial / Helvetica', dom: { primary: "Arial, Helvetica, sans-serif", secondary: "Arial, Helvetica, sans-serif" }, pdf: { primary: 'Helvetica', secondary: 'Helvetica' } },
    { id: 'technical-mono', label: 'Technical Mono', dom: { primary: "'Courier New', Courier, monospace", secondary: "'DM Sans', Helvetica, Arial, sans-serif" }, pdf: { primary: 'Courier', secondary: 'Helvetica' } }
  ];
  var MONO_FONT = { dom: "'Courier New', Courier, monospace", pdf: 'Courier' };

  function getFontPairing(id) {
    for (var i = 0; i < FONT_PAIRINGS.length; i++) if (FONT_PAIRINGS[i].id === id) return FONT_PAIRINGS[i];
    return FONT_PAIRINGS[0];
  }

  // ---------------------------------------------------------------------
  // Customization option metadata (single source of truth for the UI)
  // ---------------------------------------------------------------------
  var ACCENT_PRESETS = [
    { hex: '#1a3c6e', label: 'Deep Navy' },
    { hex: '#7a1f2b', label: 'Maroon' },
    { hex: '#1f5c4a', label: 'Forest Green' },
    { hex: '#2b2b2b', label: 'Charcoal' },
    { hex: '#4b2e83', label: 'Royal Purple' },
    { hex: '#3457a6', label: 'Slate Blue' },
    { hex: '#c2410c', label: 'Burnt Orange' }
  ];

  var BORDER_STYLES = [
    { id: 'none', label: 'No border' },
    { id: 'frame-thin', label: 'Thin frame' },
    { id: 'frame-double', label: 'Double frame' },
    { id: 'corner', label: 'Corner accents' }
  ];

  var BACKGROUND_STYLES = [
    { id: 'plain', label: 'Plain white' },
    { id: 'tint', label: 'Subtle accent tint' }
  ];

  // How over-long info lines (name, roll, departments, ...) behave inside the
  // info columns: shrink the font just enough to keep ONE line, or wrap onto
  // the next line at normal size (the classic behavior).
  var INFO_FIT_MODES = [
    { id: 'one-line', label: 'Shrink to one line' },
    { id: 'wrap', label: 'Wrap to next line' }
  ];

  var LOGO_SIZES = [
    { id: 'small', label: 'Small', mm: 18 },
    { id: 'medium', label: 'Medium', mm: 26 },
    { id: 'large', label: 'Large', mm: 34 }
  ];

  var DOCUMENT_TYPES = ['Assignment', 'Lab Report', 'Project Report', 'Thesis', 'Presentation', 'Class Test', 'Tutorial', 'Report', 'Custom'];

  function logoSizeMm(id) {
    for (var i = 0; i < LOGO_SIZES.length; i++) if (LOGO_SIZES[i].id === id) return LOGO_SIZES[i].mm;
    return 26;
  }

  function createDefaultData() {
    return {
      uniName: 'Pabna University of Science and Technology',
      uniDept: 'Electrical and Electronic Engineering',
      uniFaculty: 'Faculty of Engineering and Technology',
      courseTitle: '', courseCode: '',
      docType: 'Assignment', docTypeCustom: '',
      stuName: '', stuRoll: '', stuReg: '', stuSession: '', stuYear: '', stuSemester: '', stuDept: '', stuUni: '',
      tchName: '', tchDesignation: '', tchDept: '', tchFaculty: '', tchUni: '',
      subDate: '', subDateCustom: ''
    };
  }

  /** Combines form data + the resolved logo into the single object getBlocks() expects. */
  function mergedData(state) {
    return Object.assign({}, state.data, { logoDataUrl: (state.logo && state.logo.dataUrl) || '' });
  }

  function createDefaultState() {
    var tpl = TEMPLATES[0];
    return {
      version: 2,
      template: tpl.id,
      // teacherFont: optional per-section font override. '' (default) means the
      // "Submitted to" block keeps the template's font pairing; a pairing id
      // makes that one block render in the override pairing's body font, in
      // both preview (--cp-font-teacher) and PDF. selectTemplate() preserves it.
      customization: U.deepClone(Object.assign({ show: { logo: true, faculty: true, courseInfo: true, date: true, studentInfo: true, teacherInfo: true }, infoFit: 'one-line', teacherFont: '' }, tpl.defaultCustomization)),
      logo: { source: 'none', dataUrl: '', fileName: '', urlValue: '' },
      data: createDefaultData()
    };
  }

  root.CoverTemplates = {
    TEMPLATES: TEMPLATES,
    getTemplate: getTemplate,
    FONT_PAIRINGS: FONT_PAIRINGS,
    getFontPairing: getFontPairing,
    MONO_FONT: MONO_FONT,
    ACCENT_PRESETS: ACCENT_PRESETS,
    BORDER_STYLES: BORDER_STYLES,
    BACKGROUND_STYLES: BACKGROUND_STYLES,
    INFO_FIT_MODES: INFO_FIT_MODES,
    LOGO_SIZES: LOGO_SIZES,
    DOCUMENT_TYPES: DOCUMENT_TYPES,
    logoSizeMm: logoSizeMm,
    createDefaultData: createDefaultData,
    createDefaultState: createDefaultState,
    mergedData: mergedData,
    // exported for the offline test harness / advanced customization:
    helpers: { docTypeLabel: docTypeLabel, courseInfoLines: courseInfoLines, studentLines: studentLines, teacherLines: teacherLines, dateLine: dateLine, normalizeYear: normalizeYear, normalizeSemester: normalizeSemester, richPresentLines: richPresentLines, boldLabelLine: boldLabelLine, seg: seg }
  };
}(typeof window !== 'undefined' ? window : globalThis));
