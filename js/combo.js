/**
 * combo.js
 * ---------------------------------------------------------------------------
 * A tiny, dependency-free autocomplete ("combobox") for the editor's text
 * inputs. It does NOT replace the inputs: the fields keep their data-bind
 * behavior, and combo.js only adds a filterable dropdown of PUST suggestions
 * (teachers, departments, faculties, designations, sessions, ...).
 *
 *   - Type a few letters ("rashid") → matching suggestions appear.
 *   - ↑/↓ + Enter, click, or Tab selects a suggestion.
 *   - Esc / clicking elsewhere closes the list; free typing still works.
 *
 * A11y: the input is exposed as a combobox with an aria-expanded listbox,
 * aria-activedescendant, and Home/End/PageUp/PageDown support.
 *
 * Matches are ranked: startsWith > word-start > substring, then alphabetically.
 */
(function (root) {
  'use strict';

  // ----------------------------------------------------------------------
  // Scoring
  // ----------------------------------------------------------------------
  function scoreMatch(query, value) {
    var q = query.toLowerCase(), v = value.toLowerCase();
    var idx = v.indexOf(q);
    if (idx === -1) return -1;
    if (idx === 0) return 1000 - v.length;
    if (/[\s\-&,()]/.test(v.charAt(idx - 1))) return 700 - idx - v.length * 0.1;
    return 300 - idx - v.length * 0.1;
  }

  function fuzzyScore(query, value) {
    var q = query.toLowerCase().replace(/\s+/g, '');
    var v = value.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!q || !v) return -1;
    var qi = 0, score = 0, lastHit = -2;
    for (var i = 0; i < v.length && qi < q.length; i++) {
      if (v.charAt(i) === q.charAt(qi)) {
        score += (i === lastHit + 1 ? 3 : 1);
        lastHit = i;
        qi++;
      }
    }
    return qi === q.length ? score : -1;
  }

  function rankSuggestions(query, items) {
    var exact = [], good = [], fuzzy = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var s = scoreMatch(query, item.label);
      if (s >= 0) { exact.push([s, i, item]); continue; }
      var f = fuzzyScore(query, item.label);
      if (f >= 0) fuzzy.push([f, i, item]);
    }
    function cmp(a, b) {
      if (b[0] !== a[0]) return b[0] - a[0];
      var an = a[2].label.toLowerCase(), bn = b[2].label.toLowerCase();
      return an < bn ? -1 : (an > bn ? 1 : a[1] - b[1]);
    }
    exact.sort(cmp);
    good.length = 0; // reserved for future match tiers
    fuzzy.sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; });
    return exact.concat(good, fuzzy);
  }

  // ----------------------------------------------------------------------
  // Combobox
  // ----------------------------------------------------------------------
  function create(input, config) {
    config = config || {};
    var getItemId = config.itemId || function (item) { return item.label; };
    var listId = 'combo-list-' + input.id;
    var listbox = null;
    var items = [];
    var rendered = []; // currently displayed (ranked, capped) items
    var caption = ''; // shown when the filtered item set is empty
    var filterFn = null; // optional (item) -> bool applied before ranking
    var active = -1;
    var suppressBlur = false;

    function visibleItems() {
      if (!filterFn) return items;
      return items.filter(filterFn);
    }

    function ensureList() {
      if (listbox) return listbox;
      listbox = document.createElement('ul');
      listbox.className = 'combo-list';
      listbox.id = listId;
      listbox.setAttribute('role', 'listbox');
      input.setAttribute('aria-controls', listId);
      input.parentNode.appendChild(listbox);
      return listbox;
    }

    function close() {
      if (!listbox) return;
      listbox.remove();
      listbox = null;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }

    function setActive(i) {
      if (!listbox || !rendered.length) return;
      // Navigate within the *rendered* list, not the full dataset.
      active = (i + rendered.length) % rendered.length;
      var nodes = listbox.children;
      for (var k = 0; k < nodes.length; k++) {
        nodes[k].classList.toggle('active', k === active);
        nodes[k].setAttribute('aria-selected', k === active ? 'true' : 'false');
      }
      var el = nodes[active];
      if (el) {
        input.setAttribute('aria-activedescendant', el.id);
        if (el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded(false);
        else el.scrollIntoView({ block: 'nearest' });
      }
    }

    function pick(item) {
      suppressBlur = true;
      close();
      if (item.value !== null) input.value = getItemId(item); // caption rows carry no value
      if (config.onSelect) config.onSelect(item);
      suppressBlur = false;
      input.focus();
    }

    function open(queryText) {
      // Nothing to search and nothing to say: keep closed.
      if (!items.length && !caption) { close(); return; }
      var ul = ensureList();
      ul.innerHTML = '';
      active = -1;
      input.setAttribute('aria-expanded', 'true');
      input.removeAttribute('aria-activedescendant');
      if (!items.length) {
        // Empty state: a single informational caption row.
        rendered = [];
        var note = document.createElement('li');
        note.className = 'combo-item combo-note';
        note.innerHTML = caption; // trusted: set by app.js, not user data
        ul.appendChild(note);
        return;
      }
      var ranked = rankSuggestions(queryText, visibleItems());
      if (!ranked.length) { close(); return; }
      rendered = ranked.slice(0, 12).map(function (entry) { return entry[2]; });
      var frag = document.createDocumentFragment();
      rendered.forEach(function (item, pos) {
        var li = document.createElement('li');
        li.className = 'combo-item';
        li.id = listId + '-' + pos;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.dataset.value = getItemId(item);
        li.innerHTML = item.html; // trusted: built by pust-data providers
        on(li, 'mousedown', function (e) { e.preventDefault(); pick(item); });
        on(li, 'click', function (e) { e.preventDefault(); pick(item); });
        frag.appendChild(li);
      });
      ul.appendChild(frag);
      active = -1;
      input.setAttribute('aria-expanded', 'true');
      input.removeAttribute('aria-activedescendant');
    }

    function on(el, evt, fn) { if (el) el.addEventListener(evt, fn); }

    // Open with the full list on focus/click (like a select, but searchable).
    on(input, 'focus', function () { if (!suppressBlur) open(input.value || ''); });
    on(input, 'click', function () { open(input.value || ''); });

    on(input, 'input', function () {
      var q = input.value.trim();
      if (!q) { open(''); return; }
      open(q);
    });

    on(input, 'keydown', function (e) {
      if (!listbox) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { open(input.value || ''); e.preventDefault(); }
        return;
      }
      if (e.key === 'ArrowDown') { setActive(active + 1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { setActive(active - 1); e.preventDefault(); }
      else if (e.key === 'Enter') {
        if (active >= 0 && rendered[active]) { pick(rendered[active]); e.preventDefault(); }
        else { close(); }
      } else if (e.key === 'Tab') {
        close();
      } else if (e.key === 'Escape') {
        close();
        e.stopPropagation();
      }      else if (e.key === 'Home' && listbox) { setActive(0); e.preventDefault(); }
      else if (e.key === 'End' && listbox) { setActive(rendered.length - 1); e.preventDefault(); }
      else if (e.key === 'PageDown') { setActive(active < 0 ? 0 : active + 10); e.preventDefault(); }
      else if (e.key === 'PageUp') { setActive(active < 0 ? 0 : active - 10); e.preventDefault(); }
    });

    on(input, 'blur', function () {
      if (suppressBlur) return;
      setTimeout(function () { close(); }, 120);
    });

    on(document, 'click', function (e) {
      if (listbox && e.target !== input && !listbox.contains(e.target)) close();
    });

    return {
      setItems: function (next) { items = next || []; },
      getItems: function () { return items; },
      setFilter: function (fn) { filterFn = fn || null; },
      setCaption: function (text) { caption = text || ''; },
      close: close,
      input: input
    };
  }

  root.CoverCombo = { create: create };
}(typeof window !== 'undefined' ? window : globalThis));
