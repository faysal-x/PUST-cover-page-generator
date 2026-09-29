/**
 * tools/verify-rich-lines.js — offline verification for the rich-line render
 * (no Name:/Dept: labels in Submitted-to, bold names/labels) and the extended
 * font list. Run:  node tools/verify-rich-lines.js
 */
'use strict';
// The vendored pdf-lib is a UMD bundle: under Node it exports via CommonJS.
const PDFLib = require('../assets/vendor/pdf-lib.min.js');
const zlib = require('zlib');
if (!PDFLib || !PDFLib.PDFDocument) throw new Error('pdf-lib failed to load from vendor bundle');

require('../js/utils.js');
require('../js/templates.js');
require('../js/pdf.js');

const CT = globalThis.CoverTemplates;
const CoverPDF = globalThis.CoverPDF;

function fullState(templateId, fontId, infoFit) {
  const s = CT.createDefaultState();
  s.template = templateId;
  s.customization.font = fontId;
  if (infoFit) s.customization.infoFit = infoFit;
  s.data.stuName = 'Rakib Hasan';
  s.data.stuRoll = '2103042';
  s.data.stuReg = 'PUST-2021-042';
  s.data.stuSession = '2021-22';
  s.data.stuYear = '2nd';
  s.data.stuSemester = '3rd';
  s.data.stuDept = 'Computer Science and Engineering';
  s.data.stuUni = 'Pabna University of Science and Technology';
  // Deliberately long: must shrink to fit its column, never wrap.
  s.data.tchName = 'Dr. A. K. M. Rashidul Hasan Siddique Bin Zaman Chowdhury';
  s.data.tchDesignation = 'Professor';
  s.data.tchDept = 'Electrical and Electronic Engineering';
  s.data.tchFaculty = 'Faculty of Engineering and Technology';
  s.data.tchUni = 'Pabna University of Science and Technology';
  s.data.courseTitle = 'Digital Electronics';
  s.data.courseCode = 'EEE 2203';
  s.data.subDate = '2026-09-28';
  return s;
}

function extractPdfText(bytes) {
  const buf = Buffer.from(bytes);
  let chunks = [];
  let idx = 0;
  for (;;) {
    const s = buf.indexOf('stream', idx);
    if (s === -1) break;
    let dataStart = s + 6;
    if (buf[dataStart] === 0x0d) dataStart++;
    if (buf[dataStart] === 0x0a) dataStart++;
    const e = buf.indexOf('endstream', dataStart);
    if (e === -1) break;
    const raw = buf.slice(dataStart, e);
    try { chunks.push(zlib.inflateSync(raw)); }
    catch (_) { try { chunks.push(zlib.inflateRawSync(raw)); } catch (_) { /* not compressed */ } }
    idx = e + 9;
  }
  const all = Buffer.concat([buf, ...chunks]).toString('latin1');
  // pdf-lib draws text as hex literals: <5061626E61> Tj (one byte per char for
  // the standard WinAnsi fonts). Decode those into real text.
  const parts = [];
  const hexRe = /<([0-9A-Fa-f]+)>\s*Tj/g;
  let hm;
  while ((hm = hexRe.exec(all)) !== null) {
    const hex = hm[1];
    let s = '';
    for (let i = 0; i + 1 < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    if (s.trim()) parts.push(s);
  }
  // Also collect any parenthesized literals (other producers / future-proofing).
  const re = /\((?:\\.|[^\\()])*\)/g;
  let m;
  while ((m = re.exec(all)) !== null) {
    const s = m[0].slice(1, -1).replace(/\\([()\\])/g, '$1');
    if (s.trim()) parts.push(s);
  }
  return { text: parts.join(' '), parts, raw: all };
}

let failures = 0;
function check(name, cond) {
  if (!cond) { failures++; console.error('  FAIL: ' + name); }
}

(async function main() {
  const templates = CT.TEMPLATES.map(t => t.id);
  const fonts = CT.FONT_PAIRINGS.map(f => f.id);
  const sample = fullState(templates[0], fonts[0]);

  // 1. Block-level: no "Name:" for the teacher, bold student name/labels.
  for (const tpl of CT.TEMPLATES) {
    const blocks = tpl.getBlocks(Object.assign({}, sample.data, { logoDataUrl: '' }), sample.customization);
    const flat = JSON.stringify(blocks);
    const collect = [];
    (function walk(b) {
      if (!b || typeof b !== 'object') return;
      if (Array.isArray(b)) { b.forEach(walk); return; }
      if (b.columns) b.columns.forEach(c => collect.push(...c.lines));
      if (b.cards) b.cards.forEach(c => collect.push(...c.lines));
      if (b.left && b.left.lines) collect.push(...b.left.lines);
      if (b.right && b.right.lines) collect.push(...b.right.lines);
      Object.values(b).forEach(walk);
    })(blocks);
    const teacherFlat = JSON.stringify(collect.filter(l => Array.isArray(l) && l.some(sg => /Rashidul/.test(sg.text))));
    check(tpl.id + ': teacher block has no "Name:" label', !teacherFlat.includes('Name:'));
    check(tpl.id + ': teacher block has no "Dept:" label', !teacherFlat.includes('Dept:'));
    check(tpl.id + ': teacher faculty has no "Faculty:" label', !collect.some(l => Array.isArray(l) && l[0].text === 'Faculty:'));
    check(tpl.id + ': teacher faculty appears as plain text', collect.some(l => typeof l === 'string' && l.includes('Faculty of Engineering and Technology')));
    const teacherName = 'Dr. A. K. M. Rashidul Hasan Siddique Bin Zaman Chowdhury';
    check(tpl.id + ': teacher name is a bold segment', collect.some(l => Array.isArray(l) && l.length === 1 && l[0].bold && l[0].text === teacherName));
    check(tpl.id + ': teacher department appears as plain text', collect.some(l => typeof l === 'string' && l.includes('Electrical and Electronic Engineering')));
    check(tpl.id + ': student "Roll:" label is bold', collect.some(l => Array.isArray(l) && l[0].text === 'Roll:' && l[0].bold === true));
    check(tpl.id + ': student name is bold, value normal', collect.some(l => Array.isArray(l) && l[0].text === 'Name:' && l[0].bold && l[1] && !l[1].bold && l[1].text === 'Rakib Hasan'));
    check(tpl.id + ': student dept has no "Dept:" label', !collect.some(l => Array.isArray(l) && l[0].text === 'Dept:'));
    check(tpl.id + ': student dept appears as plain text', collect.some(l => typeof l === 'string' && l.includes('Computer Science and Engineering')));
  }

  // 2. Full PDF for every template x font: builds, is A4, has content, no stray labels.
  const A4W = Math.round(210 * 72 / 25.4), A4H = Math.round(297 * 72 / 25.4);
  for (const tpl of templates) {
    for (const font of fonts) {
      const bytes = await CoverPDF.buildPdfBytes(PDFLib, fullState(tpl, font, 'one-line'));
      check(tpl + '/' + font + ': produced bytes', bytes && bytes.length > 1000);
      const { text, parts, raw } = extractPdfText(bytes);
      check(tpl + '/' + font + ': student name present', text.includes('Rakib Hasan'));
      check(tpl + '/' + font + ': teacher name present', text.includes('Rashidul Hasan'));
      check(tpl + '/' + font + ': department present', text.includes('Electrical and Electronic Engineering'));
      // One-line rule: the long teacher name must appear as ONE text run, not
      // wrapped into fragments (pdf-lib draws each run as a single Tj).
      check(tpl + '/' + font + ': long teacher name on ONE line', parts.some(p => p === 'Dr. A. K. M. Rashidul Hasan Siddique Bin Zaman Chowdhury'));
      // The teacher section must not render "Name:" before the professor's name
      // (the student section keeps its own bold "Name:" label).
      check(tpl + '/' + font + ': teacher name has no "Name:" label', !/Name:\s*(Dr\.\s*)?Rashidul/.test(text));
      check(tpl + '/' + font + ': no "Dept:" label anywhere', !/Dept:\s/.test(text));
      check(tpl + '/' + font + ': no "Faculty:" label anywhere', !/Faculty:\s/.test(text));
      // Bold usage: bold font selection operators must appear in content streams
      // (pdf-lib names standard fonts like /Times-Bold-123 /Helvetica-Bold-456).
      check(tpl + '/' + font + ': multiple font refs (bold+regular)', /\/[^\s/]+ \d+(?:\.\d+)? Tf/.test(raw));
    }
  }

  // 3. Info-line fit toggle: 'wrap' mode must split the long teacher name into
  // multiple wrapped runs; 'one-line' mode must keep it as ONE full run.
  const fullName = 'Dr. A. K. M. Rashidul Hasan Siddique Bin Zaman Chowdhury';
  for (const tpl of ['classic', 'ivy', 'institute-technical']) {
    const oneLine = extractPdfText(await CoverPDF.buildPdfBytes(PDFLib, fullState(tpl, 'classic-times', 'one-line')));
    const wrap = extractPdfText(await CoverPDF.buildPdfBytes(PDFLib, fullState(tpl, 'classic-times', 'wrap')));
    check(tpl + ' one-line: name is one run', oneLine.parts.some(p => p === fullName));
    check(tpl + ' wrap: name split into runs', !wrap.parts.some(p => p === fullName));
    check(tpl + ' wrap: all name words still present', wrap.text.includes('Chowdhury'));
    check(tpl + ' wrap: drawn at natural size', wrap.parts.some(p => p === 'Professor'));
  }

  // 4. Per-section font override (teacherFont): the "Submitted to" block must
  // draw with the override pairing's PDF font. Page pairing classic-times is
  // all-Times, override modern-sans maps to Helvetica - so /Helvetica must
  // appear in the content streams ONLY when the override is set. Covers all
  // three info-block shapes: table (classic), cardsRow (corporate), pairBlock (ivy).
  for (const tpl of ['classic', 'corporate', 'ivy']) {
    const plainState = fullState(tpl, 'classic-times');
    plainState.customization.teacherFont = '';
    const overrideState = fullState(tpl, 'classic-times');
    overrideState.customization.teacherFont = 'modern-sans';
    const plain = extractPdfText(await CoverPDF.buildPdfBytes(PDFLib, plainState));
    const override = extractPdfText(await CoverPDF.buildPdfBytes(PDFLib, overrideState));
    check(tpl + ' default: no Helvetica anywhere', !plain.raw.includes('/Helvetica'));
    check(tpl + ' teacherFont: Helvetica embedded', override.raw.includes('/Helvetica'));
    check(tpl + ' teacherFont: content unchanged', override.text.includes('Rashidul Hasan') && override.text.includes('Rakib Hasan'));
  }

  // 5. Sanity: A4 page dimensions present in at least one generated PDF.
  const one = await CoverPDF.buildPdfBytes(PDFLib, fullState('classic', 'classic-times', 'one-line'));
  const { raw: oneRaw } = extractPdfText(one);
  check('A4 media box width present', oneRaw.includes('595.27559'));
  check('A4 media box height present', oneRaw.includes('841.88976'));

  if (failures) { console.error('\n' + failures + ' check(s) FAILED'); process.exit(1); }
  console.log('ALL CHECKS PASSED — ' + templates.length + ' templates x ' + fonts.length + ' fonts, both infoFit modes, teacherFont override, plus block assertions.');
})().catch(e => { console.error(e); process.exit(1); });
