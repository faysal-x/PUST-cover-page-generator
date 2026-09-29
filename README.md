# PUST Cover Page Generator

A free, static web app that builds print-ready A4 assignment and lab-report
cover pages for Pabna University of Science and Technology (PUST) and exports
them as genuine vector PDFs.

Made by **Vengeance**.

## What it does

- **7 design templates** — Classic Academic, Modern Minimal, Professional
  Corporate, Ivy Heritage, Modern Collegiate, Oxford Classic, Institute Technical
- **Live A4 preview that exactly matches the exported PDF** — both render from
  one shared template system; the PDF is real selectable vector text (pdf-lib),
  not a screenshot
- **Searchable PUST data** — all faculty members, departments, designations,
  sessions and universities; selecting a teacher auto-fills their details
- **10 font pairings**, plus an optional font override for just the
  "Submitted to" block
- **Smart info lines** — bold labels, empty fields vanish, long lines shrink
  to fit one line (or wrap onto the next, your choice)
- **Customization** — accent color, page border, background tint, logo upload,
  show/hide sections
- **Autosave** in the browser; projects export/import as a JSON file

Plain HTML/CSS/JavaScript — no frameworks, no build step, no backend. The only
dependency is a vendored copy of [pdf-lib](https://pdf-lib.js.org).

## License

MIT — see [LICENSE](LICENSE).
