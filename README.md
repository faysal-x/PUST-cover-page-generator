# PUST Cover Page Generator

Create a polished, print-ready A4 university cover page and export it as a
genuine vector PDF — sharp on a laptop screen or a phone, correctly
proportioned, and small enough to email.

Made by **Vengeance**.

## Running it locally

The app is fully static (no build step, no server-side code). Two ways to run it:

**Simplest — just open the file:**
Double-click `index.html`, or open it in a browser via `File > Open`.
Everything works except pasting a *remote* logo **URL** (browsers block
`file://` pages from fetching cross-origin images). Uploading a logo file
works fine either way.

**Recommended — a tiny local server** (adds nothing except making the URL-logo
feature work, and matches how you'd actually deploy it):
```bash
cd PUST-cover-generator
python3 -m http.server 8080
# then open http://localhost:8080
```
Any static file server works (`npx serve`, VS Code's "Live Server", etc.).

**Deploying to GitHub Pages:** push this folder to a GitHub repository, then
open the repo's **Settings → Pages** and publish your branch (from the root,
`/` folder) — the site goes live at
`https://<your-username>.github.io/<repo-name>/` within a minute or two. No
environment variables, no backend, no build command. Netlify, Vercel, S3 or
any other static host works the same way: upload the folder, done.

### Dependencies
None to install. **pdf-lib** (the PDF engine) is vendored directly in
`assets/vendor/pdf-lib.min.js` — there's no `npm install`, no CDN dependency,
and no internet connection required for PDF generation to work.

---

## Architecture

```
index.html            structure only
css/
  style.css           editor chrome (sidebar, form, buttons, toasts, modal)
  themes.css           the generated COVER PAGE itself (A4 box + every block type)
  print.css            Ctrl/Cmd+P support
js/
  utils.js             unit conversion, text helpers, file/blob helpers, no DOM deps
  pust-data.js         official PUST reference data (name, logo, faculties,
                       departments, 200+ teachers, designations) + embedded logo
  templates.js         the 7 designs + the shared "block model" (see below)
  storage.js           localStorage autosave + Save/Load-project JSON
  combo.js             searchable combobox (autocomplete dropdown) widget
  preview.js           renders a state -> live DOM preview (safe, no innerHTML+data)
  pdf.js               renders a state -> real vector PDF bytes via pdf-lib
  app.js               the only file that touches index.html's element IDs
  ui.js                presentation only: stage zoom + quick print for the
                       preview dock. Safe to delete; owns no data
assets/vendor/
  pdf-lib.min.js        vendored PDF engine (MIT licensed, copied from npm)
assets/pust-logo.png   source copy of the official logo (also embedded in pust-data.js)
```

`ui.js` is deliberately the only module that is *not* part of the pipeline:
it reads the fit-to-viewport transform `preview.js` writes on
`.a4-scale-wrapper`, multiplies it by the user's zoom factor, and gives the
sheet a layout box that matches its visual size (see `setupStageZoom`). It
never touches `state`, the PUST data, or the PDF. Delete it and everything
else keeps working the same.

**The key architectural idea:** `preview.js` and `pdf.js` never talk to each
other, but they render from *exactly the same data*. Each of the 5 templates
in `templates.js` is just a function `getBlocks(data, customization)` that
returns a plain array of blocks — `{t:'heading', text:'...'}`,
`{t:'table', columns:[...]}`, and so on. `preview.js` turns that array into
DOM nodes; `pdf.js` turns the *same* array into `page.drawText()` /
`drawLine()` / `drawRectangle()` calls. Neither renderer contains any
template-specific logic — they only know how to draw the ~10 block types.
That's what makes "add a 6th design" a small, isolated change (write one more
`getBlocks` function and register it) instead of a rewrite, and it's what
guarantees the preview and the exported PDF can't drift apart.

---

## Editor theme & responsive behaviour

The editor chrome follows the "My design system" token sheet
(`my_design_system/DESIGN.md`): the dark surface ladder
(`#10131a` → `#31353c`), the electric-blue primary (`#1275e2`, with
`#4090fe` for fills and `#aac7ff` for accent text), Inter for UI type
(JetBrains Mono for spec labels, Source Serif 4 for the one display
heading) and the rounded shape language (0.5 / 0.75 / 1 / 1.5rem). Every
token lives in `:root` at the top of `css/style.css`; the *cover page* keeps
its own fonts and colors in `themes.css`, so re-theming the editor chrome can
never change the exported document.

Layout is mobile-first and keyed on **width *and* height**:

| Condition | Shell |
| --- | --- |
| any | phone-friendly single column, editor as a full-screen drawer |
| ≥ 560px | app bar regains its spec pill and brand subtitle |
| ≥ 768px **and ≥ 560px tall** | persistent sidebar beside the stage, `--sidebar-w: clamp(352px, 28vw, 452px)` (two-column toggle grid from ~1360px) |
| ≤ 359px | paired form fields stack |
| ≤ 700px tall | description and autosave note drop out |
| ≤ 560px tall | stage bar hides, paddings tighten — the sheet is sized from the stage's height, so every reclaimable pixel goes to it |

The height clause is what keeps landscape phones (e.g. 844×390) usable: with
only ~330px of vertical room a persistent sidebar would leave the form
unusable, so those devices keep the drawer. Screenshots were checked at
2560×1440, 1920×1080, 1440×900, 1366×768, 1280×600, 1024×768, 834×1112,
768×1024, 844×390, 390×844 and 320×568.

---

## The PDF solution (this was the main ask)

**The old approach** (`html2pdf.js`, i.e. html2canvas + jsPDF) screenshots the
web page and drops the screenshot into a PDF. That's why the old app had
blurry/pixelated text, a large file, and — the specific bug that caused
"tiny text on phones" — the mobile CSS applied `transform: scale(0.4)` to the
cover page for the on-screen preview, and html2canvas captured *that already
shrunk* element, so the PDF got built from a low-resolution image and then
stretched back up to A4 size.

**What this app does instead:** `pdf.js` builds the PDF with
[pdf-lib](https://pdf-lib.js.org/), drawing real text with
`page.drawText()` using the PDF's built-in vector fonts (Times / Helvetica /
Courier, in the 4 weight/style combinations each). There is no screenshot
step anywhere in the PDF path — the DOM is never consulted, so no CSS
transform, zoom level, or mobile layout can ever affect the exported file.
That's the whole fix for the "PDF ≠ preview" class of bugs, not a patch on
top of the old pipeline.

Concretely, this gets you:
- **True vector text** — sharp at any zoom, and selectable/searchable in the PDF (verified — see Testing below).
- **Exact A4 size** every time (`210mm × 297mm`, computed the same way for the on-screen preview and the PDF).
- **A tiny file** (typically 15–40 KB, vs. several MB for a screenshot-based PDF).
- **Automatic one-page fit**: the layout is measured first; if it would overflow the page (extremely long university/course names, etc.) fonts and spacing shrink together (down to 72% before anything would be allowed to clip) rather than spilling onto a second page or getting cut off.
- **A graceful character-set fallback**: the PDF's built-in fonts only cover Latin + common punctuation (this is a property of the 14 "standard" PDF fonts, not this app). If a field contains a script the PDF font can't render (Bengali, Arabic, CJK, etc.), the app shows a plain-language warning in the sidebar *and* generation still succeeds — unsupported characters become `?` instead of crashing the whole export. The live preview always shows the real text correctly since it's just HTML.

Why pdf-lib instead of jsPDF: pdf-lib is available offline (it's also an npm
package, `pdf-lib`, isomorphic between Node and the browser), which meant I
could write **automated tests that build real PDFs and then re-open and
verify them** (page count, exact page size, and — critically — that the
extracted text matches what was typed, proving the text layer is real and
not a picture) instead of just eyeballing the output. See Testing below.

---

## The template system

Five genuinely different layouts (not five palettes on one layout):

| Template | Look |
|---|---|
| **Classic Academic** | Centered, traditional — rule lines, a bordered "Submitted by / Submitted to" table. The familiar university-assignment look. |
| **Modern Minimal** | Left-aligned, generous whitespace, one accent rule, borderless info columns. |
| **Professional Corporate** | A full-width accent header band + tinted "card" panels for student/teacher info. Report-style hierarchy. |
| **Ivy Heritage** | *(new)* Tracked small-caps titles, double rules, corner accents — inspired by traditional collegiate seals. |
| **Modern Collegiate** | *(new)* A bold flat-color hero band carrying the university name, left-aligned, clean bold-bordered table with flat (unshaded) headers — inspired by contemporary university rebrands. |
| **Oxford Classic** | *(new)* Formal Oxbridge sheet: tracked small-caps university name, double accent rules, thin page frame, bold-bordered submission table. |
| **Institute Technical** | *(new)* Institute-style datasheet: strong left-aligned serif name, mono meta strip (course code / session / date), borderless accent columns — an MIT-report look. |

Switching templates applies that template's recommended accent color, font
pairing, border style and logo size (its "default look"), but never touches
your typed content or your show/hide choices — so you can pick a design,
then still tweak accent color, font pairing, page border, background tint,
logo size, and which sections show, from **Customize**. Empty fields (no
registration number, no teacher entered, etc.) are detected and their whole
line/row disappears — you never get an awkward blank "Roll: " line.
Inside the info blocks the labels ("Name:", "Roll:", "Reg. No:",
"Session:") render **bold** with the values in regular weight, and the
identifier lines are label-free: in both columns the department appears as
plain text (no "Dept:" prefix), the faculty as plain text (no "Faculty:"
prefix), and the professor's name stands alone as a bold line with no
"Name:" prefix. Ten font pairings are available, including
Times New Roman, Georgia, Palatino, Inter, Source Serif and Arial. The
"Long info lines" toggle in **Customize** controls how over-long lines fit:
"Shrink to one line" (default) scales each block of lines down until every
line fits on one row (wrapping only returns below a minimum readable size),
while "Wrap to next line" restores the classic natural-size behavior where
long lines break onto a continuation line. The "Submitted to" block can
also carry its own font: the "\"Submitted to\" font" select defaults to
"Same as page", but any pairing from the list can be applied to just that
block (all 7 designs support it), in both the preview and the exported PDF.

---

## Searchable PUST data (comboboxes)

Every identifier field is a **searchable box**: click it (or start typing) and a
filterable dropdown of official PUST data appears — no need to type long names.

- **Teacher name** — all 214 faculty members from pust.ac.bd (verified against
  the live site), searchable by
  name *or* department (typing "cse" lists CSE teachers; typing "rashid" lists
  everyone named Rashid). Each row shows the teacher's designation and
  department. **Selecting a teacher auto-fills their designation, department,
  faculty and the university name** in the "Submitted to" block.
- **Department** — all 21 departments (searchable by full name or short code:
  CSE, EEE, ICE, ARCH, URP, …). Selecting one fills the matching faculty.
- **University / Faculty / Designation / Session / Year / Semester** —
  searchable suggestion lists as well.

Free typing is never blocked: the boxes are still plain text inputs, so names
or titles not in the dataset work exactly as before. Every text field also has
a small × button to clear it instantly.

The **official PUST logo ships inside the app** (`pust-data.js`, base64) and is
applied by default, so exports carry the real crest with zero setup; the Design
tab has a "Use official PUST logo" button to restore it after uploading
something else.

## Bugs fixed from the original implementation

1. **Mobile PDF corruption** — the root cause described above (preview's CSS
   `scale(0.4)` leaking into the html2canvas screenshot). Fixed by removing
   screenshotting entirely.
2. **Blurry/rasterized text** at any zoom — fixed by drawing real vector text.
3. **Stored XSS via `innerHTML`** — the old code inserted the student/teacher
   name and other fields into the page with `innerHTML`, so a name like
   `<img src=x onerror=...>` would execute. Every user-entered value is now
   inserted with `textContent`, verified with an automated test.
4. **Fragile external logo URL** (hot-linked from Wikipedia) — logos are now
   converted to a local data URL immediately (upload or URL-fetch-once), so
   the exported PDF never depends on a remote server being reachable later.
5. **Empty fields rendered as dangling labels** ("Roll: ", "Session: " with
   nothing after them) — every field is now hidden entirely when empty.
6. **No feedback on failure** — silent failures are gone; a toast reports
   success or a specific, actionable error (e.g. a blocked cross-origin logo
   URL tells you to upload the file instead).
7. Single hard-coded template with the previous author's name baked into the
   title text.

## New features (beyond the fixes)
Multiple designs with live switching · full customization panel (accent
color incl. custom picker, 10 font pairings, page border styles, background
tint, logo size) · drag-and-drop or browse-to-upload logo with a graceful
placeholder when none is set · autosave to `localStorage` (nothing is lost on
refresh) · Save Project / Load Project as a portable `.json` file ·
Reset-with-confirmation · a redesigned mobile flow (full-screen preview by
default, a bottom "Edit Details" button opens a drawer, `Design`/`Content`
tabs keep each screen short) · inline validation hints (non-blocking) · a
live warning if typed text uses characters the PDF font can't render ·
keyboard-accessible controls throughout (real `<button>`s, labelled inputs,
a focus-trapped confirm dialog, `Escape` to cancel) · a dedicated
`print.css` so browser Ctrl/Cmd+P prints only the page, correctly sized,
with no editor UI.

## SEO / sharing

The page ships with full metadata for search engines and social sharing:
description + keywords, canonical URL, Open Graph and Twitter card tags, and
JSON-LD structured data (`WebApplication`). Before deploying, replace the
placeholder domain `pustcover.example.com` in `index.html` (canonical + og:url
+ og:image) with the real deployed URL, and drop an `og-cover.png` (1200×630)
in the site root for social previews.

## Limitations
- **PDF fonts are Latin-only.** The exported PDF uses the PDF format's
  built-in fonts, which only cover Latin script + common punctuation. Non-Latin
  text (Bengali, Arabic, CJK, …) shows correctly in the on-screen preview but
  becomes `?` in the PDF — the app warns you inline when this applies to what
  you've typed. Supporting other scripts would mean embedding a full Unicode
  font file (several MB) and was judged not worth the trade-off for a
  cover-page generator; this is disclosed rather than silently broken.
- **Logo-by-URL needs a real server** (or internet access to the image host);
  it won't work when the app is opened directly as a `file://` page, because
  browsers block that kind of cross-origin fetch from local files. Uploading
  a file always works.
- No undo/redo (autosave + Reset-with-confirmation cover the main safety net
  instead).
- Tested in headless Chromium (this environment has no GUI browser
  available) plus Poppler/pdfjs-dist for independent PDF verification. I was
  not able to test in an actual Firefox build or on a physical phone —
  everything here uses standard, broadly-supported CSS/JS (`color-mix()`,
  used for tinted cards/backgrounds, is the newest feature and needs a
  2023+-era browser; without it those tints just don't show, nothing breaks).

---

## Testing performed

This was tested at three levels, all automated (scripts, not shipped with
the app — described here for transparency):

1. **Unit tests** for `utils.js` and every template's `getBlocks()` output,
   across empty / fully-filled / pathologically-long / non-Latin input, for
   all 5 templates.
2. **Real PDF verification**: every template's PDF was actually generated
   with pdf-lib and then independently re-opened with `pdfjs-dist` to assert:
   exactly 1 page, exact A4 point dimensions, and that the extracted text
   layer contains the expected strings (proving it's real vector text, not
   an image) — plus dedicated tests for empty-field hiding, one-sided
   tables, all 10 font pairings, all 8 border×background combinations, PNG
   logo embedding, and graceful fallback on an unsupported logo format.
   Output was also rasterized (Poppler) and visually reviewed for all 5
   templates plus stress-test cases.
3. **Full browser end-to-end tests** (headless Chromium via Playwright)
   against the real shipped app: typing into every field and confirming the
   live preview updates; template switching producing 5 visually distinct
   outputs; an HTML-injection attempt in a name field rendering as inert
   text; toggling each show/hide option; uploading a real PNG file through
   the actual file input and confirming it's embedded in the PDF; clicking
   the real Download PDF button and independently verifying the downloaded
   file; a full mobile-viewport pass (no horizontal overflow, drawer
   open/close, touch target sizes); localStorage persistence across a page
   reload; Reset's confirm/cancel behavior; a Save Project → wipe → Load
   Project round trip, including a corrupt-file case; and the print
   stylesheet hiding all editor chrome.

### Manual checklist for further spot-checking
- [ ] Open on an actual phone, tap through the whole flow, download and open the PDF
- [ ] Print via Ctrl/Cmd+P and confirm it comes out as one clean A4 page
- [ ] Try a very large (>4MB) logo upload
- [ ] Try switching templates after filling in the whole form
- [ ] Try with only a teacher filled in and no student (and vice versa)

## License

Released under the [MIT License](LICENSE) — free to use, modify and share.
