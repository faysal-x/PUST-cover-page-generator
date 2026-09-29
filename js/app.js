/**
 * app.js
 * The only module that touches specific element IDs from index.html. Keeps
 * one `state` object (see templates.js createDefaultState for its shape) and
 * re-renders the preview + schedules an autosave whenever it changes.
 */
(function () {
  'use strict';

  var CT = window.CoverTemplates;
  var U = window.CoverUtils;
  var PD = window.CoverPustData;   // official PUST reference data (pust-data.js)
  var CB = window.CoverCombo;      // searchable combobox widget (combo.js)

  var state = CT.createDefaultState();

  // ===================================================================
  // Small DOM helpers
  // ===================================================================
  function $(id) { return document.getElementById(id); }
  function on(el, evt, fn) { if (el) el.addEventListener(evt, fn); }

  function populateSelect(selectEl, items, valueKey, labelKey) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    items.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = typeof item === 'string' ? item : item[valueKey];
      opt.textContent = typeof item === 'string' ? item : item[labelKey];
      selectEl.appendChild(opt);
    });
  }

  // ===================================================================
  // Toasts
  // ===================================================================
  function showToast(message, type) {
    var region = $('toast-region');
    if (!region) return;
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'info');
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.textContent = message;
    region.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('show'); });
    setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { toast.remove(); }, 300);
    }, 4200);
    while (region.children.length > 3) region.removeChild(region.firstChild);
  }

  // ===================================================================
  // Confirm modal (used by Reset)
  // ===================================================================
  function confirmModal(opts) {
    return new Promise(function (resolve) {
      var overlay = $('modal-overlay');
      $('modal-title').textContent = opts.title;
      $('modal-body').textContent = opts.body;
      var confirmBtn = $('modal-confirm'), cancelBtn = $('modal-cancel');
      confirmBtn.textContent = opts.confirmLabel || 'Confirm';
      cancelBtn.textContent = opts.cancelLabel || 'Cancel';
      overlay.hidden = false;
      var lastFocused = document.activeElement;
      confirmBtn.focus();
      function cleanup(result) {
        overlay.hidden = true;
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('keydown', onKey);
        if (lastFocused && lastFocused.focus) lastFocused.focus();
        resolve(result);
      }
      function onConfirm() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onKey(e) { if (e.key === 'Escape') cleanup(false); }
      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('keydown', onKey);
    });
  }

  // ===================================================================
  // Central update loop
  // ===================================================================
  var scheduleAutosave = U.debounce(function () { CoverStorage.saveLocal(state); }, 500);

  function update() {
    window.CoverPreview.render(state);
    updateDocTypeCustomVisibility();
    validateAndWarn();
    updateCharsetWarning();
    scheduleAutosave();
  }

  function updateDocTypeCustomVisibility() {
    var wrap = $('f-docTypeCustom-wrap');
    if (wrap) wrap.hidden = state.data.docType !== 'Custom';
  }

  function setHint(id, msg) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
  }

  function validateAndWarn() {
    setHint('hint-uniName', !U.isNonEmpty(state.data.uniName) ? 'Add a university name so the page has a title.' : '');
    setHint('hint-stuName', !U.isNonEmpty(state.data.stuName) ? 'Add your name so it appears on the page.' : '');
    setHint('hint-courseTitle', (!U.isNonEmpty(state.data.courseTitle) && !U.isNonEmpty(state.data.courseCode)) ? 'Add a course title or code.' : '');
  }

  var CHARSET_LABELS = {
    uniName: 'University Name', uniDept: 'Department', uniFaculty: 'Faculty',
    courseTitle: 'Course Title', courseCode: 'Course Code',
    stuName: 'Student Name', stuDept: 'Student Department', stuUni: 'Student University',
    tchName: 'Teacher Name', tchDesignation: 'Designation', tchDept: 'Teacher Department', tchFaculty: 'Teacher Faculty', tchUni: 'Teacher University',
    docTypeCustom: 'Custom Document Type', subDateCustom: 'Submission Note'
  };
  function updateCharsetWarning() {
    var el = $('pdf-charset-warning');
    if (!el) return;
    var affected = [];
    Object.keys(CHARSET_LABELS).forEach(function (key) {
      if (U.hasUnsupportedPdfChars(state.data[key])) affected.push(CHARSET_LABELS[key]);
    });
    if (affected.length) {
      el.hidden = false;
      el.textContent = 'Heads up: ' + affected.join(', ') + ' use characters the PDF\u2019s built-in fonts can\u2019t render. ' +
        'The preview above shows them correctly, but they\u2019ll appear as "?" in the downloaded PDF.';
    } else {
      el.hidden = true;
    }
  }

  // ===================================================================
  // Template grid
  // ===================================================================
  function buildTemplateGrid() {
    var grid = $('template-grid');
    if (!grid) return;
    grid.innerHTML = '';
    CT.TEMPLATES.forEach(function (tpl) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'template-card';
      card.dataset.template = tpl.id;
      var thumb = document.createElement('div');
      thumb.className = 'tpl-thumb tpl-thumb-' + tpl.id;
      thumb.innerHTML = '<span></span><span></span><span></span>'; // static decoration, not user data
      var name = document.createElement('div'); name.className = 'template-card-name'; name.textContent = tpl.name;
      var desc = document.createElement('div'); desc.className = 'template-card-desc'; desc.textContent = tpl.description;
      card.appendChild(thumb); card.appendChild(name); card.appendChild(desc);
      on(card, 'click', function () { selectTemplate(tpl.id); });
      grid.appendChild(card);
    });
    refreshTemplateGridSelection();
  }

  function refreshTemplateGridSelection() {
    document.querySelectorAll('.template-card').forEach(function (card) {
      var active = card.dataset.template === state.template;
      card.classList.toggle('active', active);
      card.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function selectTemplate(id) {
    var tpl = CT.getTemplate(id);
    state.template = id;
    var preservedShow = state.customization.show;
    var preservedInfoFit = state.customization.infoFit;
    var preservedTeacherFont = state.customization.teacherFont;
    state.customization = U.deepClone(Object.assign({}, tpl.defaultCustomization, { show: preservedShow, infoFit: preservedInfoFit || 'one-line', teacherFont: preservedTeacherFont || '' }));
    syncCustomizationControls();
    refreshTemplateGridSelection();
    update();
  }

  // ===================================================================
  // Customization controls
  // ===================================================================
  function buildAccentSwatches() {
    var row = $('accent-swatches');
    if (!row) return;
    row.innerHTML = '';
    CT.ACCENT_PRESETS.forEach(function (preset) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch';
      btn.style.background = preset.hex;
      btn.title = preset.label;
      btn.setAttribute('aria-label', preset.label);
      btn.dataset.hex = preset.hex;
      on(btn, 'click', function () {
        state.customization.accent = preset.hex;
        var custom = $('accent-custom');
        if (custom) custom.value = preset.hex;
        refreshActiveSwatch();
        update();
      });
      row.appendChild(btn);
    });
    refreshActiveSwatch();
  }

  function refreshActiveSwatch() {
    document.querySelectorAll('#accent-swatches .swatch').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.hex.toLowerCase() === state.customization.accent.toLowerCase());
    });
  }

  function bindCustomizationControls() {
    document.querySelectorAll('[data-cbind]').forEach(function (el) {
      var key = el.dataset.cbind;
      var evt = el.tagName === 'SELECT' ? 'change' : 'input';
      on(el, evt, function () {
        state.customization[key] = el.value;
        if (key === 'accent') refreshActiveSwatch();
        update();
      });
    });
    document.querySelectorAll('[data-show]').forEach(function (el) {
      on(el, 'change', function () {
        state.customization.show[el.dataset.show] = el.checked;
        update();
      });
    });
  }

  function syncCustomizationControls() {
    document.querySelectorAll('[data-cbind]').forEach(function (el) { el.value = state.customization[el.dataset.cbind]; });
    document.querySelectorAll('[data-show]').forEach(function (el) { el.checked = !!state.customization.show[el.dataset.show]; });
    refreshActiveSwatch();
  }

  // ===================================================================
  // PUST defaults: official name + built-in logo
  // ===================================================================
  function applyPustDefaults() {
    var d = state.data;
    // Upgrade the old default spelling to the official university name.
    if (d.uniName === 'Pabna University of Science & Technology') d.uniName = PD.UNIVERSITY_NAME;
    // Ship with the official logo; users can still replace or remove it.
    if (!state.logo || !state.logo.dataUrl) {
      state.logo = {
        source: 'builtin',
        dataUrl: PD.LOGO_DATA_URL,
        fileName: 'pust-logo.png',
        urlValue: (state.logo && state.logo.urlValue) || ''
      };
    }
  }

  // ===================================================================
  // Department-first flow: the teacher combo adapts to the chosen dept
  // ===================================================================
  var teacherCombo = null;
  var activeDepts = { tch: '', uni: '', stu: '' }; // per-scope department selections

  function teacherCaption(deptName) {
    var abbr = PD.ABBR[deptName];
    var short = abbr ? ' (' + abbr + ')' : '';
    return '<div class="combo-note-title">No ' + deptName + short + ' teachers in the built-in list yet.</div>' +
           '<div class="combo-note-sub">Type any name and it stays exactly as you write it.</div>';
  }

  function setActiveDept(scope, deptName, skipTeacherSync) {
    activeDepts[scope] = deptName || '';
    if (scope !== 'tch' || skipTeacherSync || !teacherCombo) return;
    // Adapt the teacher suggestions to the teacher-side department.
    if (deptName) {
      teacherCombo.setFilter(function (t) { return t.department === deptName; });
      teacherCombo.setCaption(teacherCaption(deptName));
    } else {
      teacherCombo.setFilter(null);
      teacherCombo.setCaption('');
    }
  }

  // Known department name (case-insensitive) -> canonical name, else ''.
  function matchDept(value) {
    var v = U.cleanText(value).toLowerCase();
    if (!v) return '';
    for (var i = 0; i < PD.DEPARTMENTS.length; i++) {
      if (PD.DEPARTMENTS[i].name.toLowerCase() === v) return PD.DEPARTMENTS[i].name;
    }
    return '';
  }

  // Manual edits (typed, pasted, loaded) still re-scope the teacher list.
  function watchDeptInput(inputId, scope) {
    var el = $(inputId);
    if (!el) return;
    on(el, 'change', function () {
      var known = matchDept(el.value);
      if ((activeDepts[scope] || '') !== known) setActiveDept(scope, known);
    });
  }

  function syncDeptFiltersFromState() {
    setActiveDept('uni', matchDept(state.data.uniDept), true);
    setActiveDept('stu', matchDept(state.data.stuDept), true);
    setActiveDept('tch', matchDept(state.data.tchDept));
  }

  // The department-first auto-fill: any department pick completes its faculty
  // and the university, in every scope, without touching name fields.
  function handleDeptPick(scope, deptName) {
    setField(scope === 'tch' ? 'tchDept' : (scope === 'stu' ? 'stuDept' : 'uniDept'), deptName);
    if (scope === 'uni') {
      // "Department of …" heading context: keep faculty in lockstep.
      var f = PD.facultyOf(deptName);
      if (f) setField('uniFaculty', f);
    } else {
      // Teacher/student section: fill section fields if empty, then sync all.
      var fac = PD.facultyOf(deptName);
      if (!U.cleanText(state.data.tchFaculty) && fac) setField('tchFaculty', fac);
      if (!U.cleanText(state.data.tchUni)) setField('tchUni', PD.UNIVERSITY_NAME);
      if (!U.cleanText(state.data.stuUni)) setField('stuUni', PD.UNIVERSITY_NAME);
    }
    // Reflect university + faculty everywhere they are still blank.
    if (!U.cleanText(state.data.uniName)) setField('uniName', PD.UNIVERSITY_NAME);
    var uniFac = PD.facultyOf(deptName);
    if (!U.cleanText(state.data.uniFaculty) && uniFac) setField('uniFaculty', uniFac);
    if (!U.cleanText(state.data.tchFaculty) && uniFac) setField('tchFaculty', uniFac);
    setActiveDept(scope, deptName);
    if (scope === 'tch') showToast('Teacher suggestions filtered to ' + deptName + '.', 'info');
  }

  // ===================================================================
  // Searchable suggestion boxes (teachers, departments, ...)
  // ===================================================================
  function setField(key, value) {
    state.data[key] = value;
    var el = document.querySelector('[data-bind="' + key + '"]');
    if (el) el.value = value;
    update();
  }

  function optionItems(labels) {
    return labels.map(function (label) {
      return { value: label, label: label, html: '<span class="combo-item-label">' + label + '</span>' };
    });
  }

  function deptOptionItems() {
    return PD.DEPARTMENTS.map(function (d) {
      return {
        value: d.name,
        label: d.name + ' ' + (PD.ABBR[d.name] || ''),
        html: '<span class="combo-item-label combo-item-title">' + d.name + '</span>' +
              '<span class="combo-item-meta">' + (PD.ABBR[d.name] || '') + '</span>'
      };
    });
  }

  function teacherOptionItems() {
    return PD.TEACHERS.map(function (t) {
      return {
        value: t.name,
        label: t.name + ' ' + t.department + ' ' + t.designation,
        designation: t.designation,
        department: t.department,
        faculty: t.faculty,
        html: '<span class="combo-item-label combo-item-title">' + t.name + '</span>' +
              '<span class="combo-item-sub">' + t.designation + ' \u00b7 ' + t.department + '</span>'
      };
    });
  }

  function attachCombo(input, kind, onSelect) {
    if (!input) return;
    var combo = CB.create(input, { onSelect: onSelect });
    if (kind === 'teacher') combo.setItems(teacherOptionItems());
    else if (kind === 'department') combo.setItems(deptOptionItems());
    else if (kind === 'faculty') combo.setItems(optionItems(PD.FACULTIES));
    else if (kind === 'designation') combo.setItems(optionItems(PD.DESIGNATIONS));
    else if (kind === 'session') combo.setItems(optionItems(PD.SESSIONS));
    else if (kind === 'year') combo.setItems(optionItems(PD.YEARS));
    else if (kind === 'semester') combo.setItems(optionItems(PD.SEMESTERS));
    else if (kind === 'university') combo.setItems(optionItems([PD.UNIVERSITY_NAME]));
  }

  function setupCombos() {
    // Picking a department filters teacher suggestions and completes faculty.
    attachCombo($('f-uniDept'), 'department', function (d) { handleDeptPick('uni', d.value); });
    attachCombo($('f-tchDept'), 'department', function (d) { handleDeptPick('tch', d.value); });
    attachCombo($('f-stuDept'), 'department', function (d) { handleDeptPick('stu', d.value); });

    attachCombo($('f-uniName'), 'university', function (i) { setField('uniName', i.value); });
    attachCombo($('f-stuUni'), 'university', function (i) { setField('stuUni', i.value); });
    attachCombo($('f-tchUni'), 'university', function (i) { setField('tchUni', i.value); });
    attachCombo($('f-uniFaculty'), 'faculty', function (i) { setField('uniFaculty', i.value); });
    attachCombo($('f-tchFaculty'), 'faculty', function (i) { setField('tchFaculty', i.value); });
    attachCombo($('f-tchDesignation'), 'designation', function (i) { setField('tchDesignation', i.value); });
    attachCombo($('f-stuSession'), 'session', function (i) { setField('stuSession', i.value); });
    attachCombo($('f-stuYear'), 'year', function (i) { setField('stuYear', i.value); });
    attachCombo($('f-stuSemester'), 'semester', function (i) { setField('stuSemester', i.value); });

    // The teacher combo is the one that adapts to department-first flow.
    teacherCombo = CB.create($('f-tchName'), { onSelect: function (t) {
      setField('tchName', t.value);
      setField('tchDesignation', t.designation);
      setField('tchDept', t.department);
      setField('tchFaculty', t.faculty);
      setField('tchUni', PD.UNIVERSITY_NAME);
      if (!U.cleanText(state.data.uniName)) setField('uniName', PD.UNIVERSITY_NAME);
      if (!U.cleanText(state.data.uniFaculty)) setField('uniFaculty', t.faculty);
      setActiveDept('tch', t.department, true);
    }});
    teacherCombo.setItems(teacherOptionItems());

    // Manual department edits re-scope the teacher list too.
    watchDeptInput('f-uniDept', 'uni');
    watchDeptInput('f-tchDept', 'tch');
    watchDeptInput('f-stuDept', 'stu');
  }

  // ===================================================================
  // Form fields (data-bind -> state.data.*)
  // ===================================================================
  function addClearButton(el) {
    var wrap = document.createElement('span');
    wrap.className = 'combo-wrap combo-input-clear-wrap';
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'combo-clear';
    btn.textContent = '\u00d7';
    btn.title = 'Clear this field';
    btn.setAttribute('aria-label', 'Clear field');
    wrap.appendChild(btn);
    function sync() { btn.classList.toggle('show', !!el.value); }
    on(btn, 'mousedown', function (e) { e.preventDefault(); }); // keep input focus
    on(btn, 'click', function (e) {
      e.preventDefault();
      el.value = '';
      state.data[el.dataset.bind] = '';
      sync();
      update();
      el.dispatchEvent(new Event('change', { bubbles: false })); // let dept watchers unscope filters
      el.focus();
    });
    on(el, 'input', sync);
    el._syncClear = sync;
    sync();
  }

  function bindDataInputs() {
    document.querySelectorAll('[data-bind]').forEach(function (el) {
      var key = el.dataset.bind;
      var evt = el.tagName === 'SELECT' ? 'change' : 'input';
      on(el, evt, function () {
        state.data[key] = el.value;
        update();
      });
      if (el.tagName === 'INPUT' && el.type === 'text') addClearButton(el);
    });
  }

  function refreshDataInputs() {
    document.querySelectorAll('[data-bind]').forEach(function (el) {
      el.value = state.data[el.dataset.bind] || '';
      if (el._syncClear) el._syncClear();
    });
  }

  // ===================================================================
  // Logo: upload, drag & drop, URL, remove
  // ===================================================================
  function setLogoFromDataUrl(dataUrl, source, fileName, urlValue) {
    state.logo = { source: source, dataUrl: dataUrl, fileName: fileName || '', urlValue: urlValue || '' };
    refreshLogoPreview();
    update();
  }

  function clearLogo() {
    state.logo = { source: 'none', dataUrl: '', fileName: '', urlValue: '' };
    var urlInput = $('logo-url');
    if (urlInput) urlInput.value = '';
    refreshLogoPreview();
    update();
  }

  function refreshLogoPreview() {
    var wrap = $('logo-preview-wrap'), empty = $('logo-dropzone-empty'), img = $('logo-preview-img');
    if (!wrap || !empty || !img) return;
    if (state.logo.dataUrl) {
      img.src = state.logo.dataUrl;
      wrap.hidden = false; empty.hidden = true;
    } else {
      wrap.hidden = true; empty.hidden = false;
    }
  }

  async function handleLogoFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      showToast('Please use a PNG or JPG image for the logo.', 'error');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      showToast('That image is quite large \u2014 a smaller file will keep things fast.', 'info');
    }
    try {
      var dataUrl = await U.readFileAsDataURL(file);
      setLogoFromDataUrl(dataUrl, 'upload', file.name, '');
    } catch (e) {
      showToast('Could not read that image file.', 'error');
    }
  }

  var logoUrlDebounced = U.debounce(function (rawUrl) {
    var url = U.cleanText(rawUrl);
    state.logo.urlValue = url;
    if (!url) { clearLogo(); return; }
    if (!U.isProbablyUrl(url)) { showToast('That does not look like a valid image URL.', 'error'); return; }
    fetch(url, { mode: 'cors' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.blob();
    }).then(function (blob) {
      if (!/^image\//.test(blob.type)) throw new Error('That URL is not an image.');
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(reader.error || new Error('Read failed')); };
        reader.readAsDataURL(blob);
      });
    }).then(function (dataUrl) {
      setLogoFromDataUrl(dataUrl, 'url', '', url);
    }).catch(function () {
      showToast('Could not load an image from that URL (it may block cross-origin access). Try downloading and uploading it instead.', 'error');
    });
  }, 700);

  function setupLogoHandlers() {
    var dropzone = $('logo-dropzone'), fileInput = $('logo-file-input');
    if (dropzone) {
      ['dragenter', 'dragover'].forEach(function (evt) { on(dropzone, evt, function (e) { e.preventDefault(); dropzone.classList.add('dragover'); }); });
      ['dragleave', 'drop'].forEach(function (evt) { on(dropzone, evt, function (e) { e.preventDefault(); dropzone.classList.remove('dragover'); }); });
      on(dropzone, 'drop', function (e) { handleLogoFile(e.dataTransfer.files && e.dataTransfer.files[0]); });
      on(dropzone, 'click', function () { fileInput.click(); });
      on(dropzone, 'keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    }
    on($('logo-browse-btn'), 'click', function (e) { e.stopPropagation(); fileInput.click(); });
    on(fileInput, 'change', function (e) { handleLogoFile(e.target.files[0]); });
    on($('logo-remove-btn'), 'click', function (e) { e.stopPropagation(); clearLogo(); });
    on($('logo-url'), 'input', function (e) { logoUrlDebounced(e.target.value); });
    on($('btn-pust-logo'), 'click', function () {
      setLogoFromDataUrl(PD.LOGO_DATA_URL, 'builtin', 'pust-logo.png', '');
      showToast('Official PUST logo applied.', 'success');
    });
  }

  // ===================================================================
  // Footer actions: reset / save project / load project / download PDF
  // ===================================================================
  function refreshAllControlsFromState() {
    applyPustDefaults();
    refreshDataInputs();
    syncCustomizationControls();
    refreshTemplateGridSelection();
    refreshLogoPreview();
    syncDeptFiltersFromState();
    var urlInput = $('logo-url');
    if (urlInput) urlInput.value = state.logo.urlValue || '';
  }

  function afterStateReplaced() {
    refreshAllControlsFromState();
    update();
  }

  function setupFooterActions() {
    on($('btn-reset'), 'click', async function () {
      var ok = await confirmModal({
        title: 'Reset all fields?',
        body: 'This clears everything you\u2019ve entered and returns to the defaults. This cannot be undone.',
        confirmLabel: 'Reset', cancelLabel: 'Cancel'
      });
      if (!ok) return;
      state = CT.createDefaultState();
      CoverStorage.clearLocal();
      afterStateReplaced();
      showToast('Form reset.', 'success');
    });

    on($('btn-save-project'), 'click', function () {
      CoverStorage.exportProjectFile(state);
    });

    on($('btn-load-project'), 'click', function () { $('load-project-input').click(); });
    on($('load-project-input'), 'change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var loaded = CoverStorage.parseProjectFile(reader.result);
          state = CoverStorage.normalizeState(loaded, CT);
          afterStateReplaced();
          showToast('Project loaded.', 'success');
        } catch (err) {
          showToast('Could not load that file: ' + err.message, 'error');
        }
      };
      reader.onerror = function () { showToast('Could not read that file.', 'error'); };
      reader.readAsText(file);
      e.target.value = '';
    });

    on($('btn-pdf'), 'click', async function () {
      var btn = this;
      var original = btn.innerHTML;
      btn.disabled = true;
      btn.classList.add('is-loading');
      btn.textContent = 'Generating\u2026';
      try {
        await window.CoverPDF.generateAndDownload(state);
        showToast('PDF downloaded.', 'success');
      } catch (e) {
        console.error(e);
        showToast('Could not generate the PDF (' + e.message + '). Please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.classList.remove('is-loading');
        btn.innerHTML = original;
      }
    });
  }

  // ===================================================================
  // Mobile drawer + tabs
  // ===================================================================
  function setSidebarOpen(open) {
    var sidebar = $('sidebar'), menuBtn = $('mobile-menu-btn');
    if (sidebar) sidebar.classList.toggle('open', open);
    if (menuBtn) { menuBtn.setAttribute('aria-expanded', String(open)); menuBtn.classList.toggle('is-hidden', open); }
    if (open) { var first = document.querySelector('#sidebar-tabs [role="tab"]'); if (first) first.focus(); }
    window.CoverPreview.refreshLayout();
  }

  function setupTabs() {
    var tabs = document.querySelectorAll('#sidebar-tabs [role="tab"]');
    tabs.forEach(function (tab) {
      on(tab, 'click', function () {
        tabs.forEach(function (t) { t.setAttribute('aria-selected', t === tab ? 'true' : 'false'); });
        document.querySelectorAll('.tab-panel').forEach(function (p) { p.hidden = p.dataset.tabPanel !== tab.dataset.tab; });
        var scroller = $('form-scroll');
        if (scroller) scroller.scrollTop = 0;
      });
    });
  }

  // ===================================================================
  // Init
  // ===================================================================
  function init() {
    var loaded = CoverStorage.loadLocal();
    state = CoverStorage.normalizeState(loaded, CT);
    applyPustDefaults();

    window.CoverPreview.mount($('preview-area'));

    buildTemplateGrid();
    buildAccentSwatches();
    populateSelect($('font-pairing'), CT.FONT_PAIRINGS, 'id', 'label');
    populateSelect($('border-style'), CT.BORDER_STYLES, 'id', 'label');
    populateSelect($('background-style'), CT.BACKGROUND_STYLES, 'id', 'label');
    populateSelect($('info-fit-mode'), CT.INFO_FIT_MODES, 'id', 'label');
    // Per-section override: '' = follow the page's font pairing.
    populateSelect($('teacher-font'), [{ id: '', label: 'Same as page' }].concat(CT.FONT_PAIRINGS), 'id', 'label');
    populateSelect($('logo-size'), CT.LOGO_SIZES, 'id', 'label');
    populateSelect($('f-docType'), CT.DOCUMENT_TYPES, null, null);

    bindDataInputs();
    setupCombos();
    bindCustomizationControls();
    setupLogoHandlers();
    setupFooterActions();
    setupTabs();

    on($('mobile-menu-btn'), 'click', function () { setSidebarOpen(true); });
    on($('close-sidebar-btn'), 'click', function () { setSidebarOpen(false); });

    refreshAllControlsFromState();
    update();

    if (!loaded) showToast('Welcome! Fill in your details on the left \u2014 the preview updates live.', 'info');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
