/* Haushalt-App: Ausgaben schnell eintragen, Restbudget pro Kategorie sehen. */
(function () {
  'use strict';

  // ---------- Speicher ----------
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('hh.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { localStorage.setItem('hh.' + k, JSON.stringify(v)); },
    del(k) { localStorage.removeItem('hh.' + k); }
  };

  const $ = (id) => document.getElementById(id);
  const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

  // ---------- Zugang aus dem Link lesen ----------
  function parseLink(text) {
    const i = text.indexOf('#');
    const p = new URLSearchParams(i >= 0 ? text.slice(i + 1) : text);
    if (p.has('demo')) return { demo: true };
    const s = p.get('s'), k = p.get('k');
    if (s && k && /^[\w-]{10,}$/.test(s) && /^[\w-]{16,}$/.test(k)) return { s: s, k: k };
    return null;
  }

  let cfg = LS.get('cfg', null);
  const fromHash = location.hash.length > 1 ? parseLink(location.hash) : null;
  if (fromHash) {
    cfg = fromHash;
    LS.set('cfg', cfg);
    // In der installierten App den Schlüssel aus der Adresszeile entfernen.
    // In Safari bleibt er stehen, damit „Zum Home-Bildschirm“ ihn mitnimmt.
    if (standalone) history.replaceState(null, '', location.pathname);
  }

  // ---------- Hilfen ----------
  const fmt = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let currency = '€';
  const money = (n) => fmt.format(n) + ' ' + currency;
  const round2 = (n) => Math.round(n * 100) / 100;

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function shortDate(ymd) {
    const [, m, d] = ymd.split('-');
    return Number(d) + '.' + Number(m) + '.';
  }
  function uid() {
    const a = new Uint8Array(9);
    crypto.getRandomValues(a);
    return Date.now().toString(36) + '-' + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Symbole (Linien-Icons) und Farben im iOS-Stil
  const P = {
    cart: '<circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2 3h3l2.4 11.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L21.5 7H6"/>',
    cup: '<path d="M17 8h1.5a3.5 3.5 0 0 1 0 7H17"/><path d="M3 8h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M7 2.5v2.5M11 2.5v2.5"/>',
    car: '<path d="M3 16v-4l2.2-5.2A2 2 0 0 1 7 5.5h10a2 2 0 0 1 1.8 1.3L21 12v4"/><path d="M3 12h18M3 16h18"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
    pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    play: '<circle cx="12" cy="12" r="9.5"/><path d="M10 8.5v7l6-3.5z"/>',
    gift: '<path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7"/><path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z"/>',
    star: '<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"/>',
    smile: '<circle cx="12" cy="12" r="9.5"/><path d="M8.5 14.5s1.3 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01"/>',
    drop: '<path d="M12 2.7 17.7 8.3a8 8 0 1 1-11.4 0z"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v2M12 20.5v2M4.6 4.6 6 6M18 18l1.4 1.4M1.5 12h2M20.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><path d="M7 7h.01"/>'
  };
  const ICONS = [
    [/lebensmittel|einkauf|supermarkt/i, 'cart', '#34c759'], [/restaurant|caf|essen/i, 'cup', '#ff9500'],
    [/mobil|auto|tank|bahn/i, 'car', '#007aff'], [/anschaffung.*baby/i, 'star', '#ffcc00'], [/baby|kind/i, 'smile', '#00c7be'],
    [/wohnung|möbel|anschaffung/i, 'box', '#a2845e'], [/haushalt/i, 'home', '#30b0c7'], [/gesund|apothe|arzt/i, 'pulse', '#ff3b30'],
    [/entertain|freizeit|kino/i, 'play', '#af52de'], [/geschenk/i, 'gift', '#ff2d55'], [/drogerie/i, 'drop', '#32ade6'],
    [/bargeld|fun/i, 'cash', '#5856d6'], [/hochzeit/i, 'heart', '#ff375f'], [/kleid|mode/i, 'bag', '#bf5af2'], [/urlaub|reise/i, 'sun', '#ff9f0a']
  ];
  function iconFor(name) {
    const m = ICONS.find((x) => x[0].test(name)) || [0, 'tag', '#8e8e93'];
    const box = el('span', 'icon');
    box.style.setProperty('--tint', m[2]);
    box.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + P[m[1]] + '</svg>';
    return box;
  }

  // ---------- Daten ----------
  let state = LS.get('state', null);      // letzter Stand vom Server
  let queue = LS.get('queue', []);        // noch nicht gesendete Ausgaben
  let removals = LS.get('removals', []);  // noch nicht gesendete Löschungen
  let syncStatus = 'ok';
  let syncing = false;

  /** Server-Stand plus eigene, noch nicht gesendete Änderungen. */
  function view() {
    if (!state) return null;
    const v = JSON.parse(JSON.stringify(state));
    const byName = {};
    v.categories.forEach((c) => { byName[c.name] = c; });
    const inMonth = (d) => d >= v.start && d <= v.end;

    v.entries = v.entries.filter((e) => {
      if (e.id && removals.indexOf(e.id) >= 0) {
        if (byName[e.category]) byName[e.category].spent = round2(byName[e.category].spent - e.amount);
        v.left = round2(v.left + e.amount);
        return false;
      }
      return true;
    });
    const knownIds = new Set(v.entries.map((e) => e.id));
    const pending = queue.filter((q) => !knownIds.has(q.id) && inMonth(q.date));
    pending.forEach((q) => {
      if (byName[q.category]) byName[q.category].spent = round2(byName[q.category].spent + q.amount);
      v.left = round2(v.left - q.amount);
    });
    v.entries = pending.map((q) => Object.assign({ pending: true }, q)).reverse().concat(v.entries);
    return v;
  }

  // ---------- Verbindung ----------
  async function callServer(body) {
    if (cfg.demo) return Demo.call(body);
    const url = 'https://script.google.com/macros/s/' + encodeURIComponent(cfg.s) + '/exec';
    // text/plain => keine CORS-Vorabfrage; Apps Script antwortet mit JSON
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(body), redirect: 'follow', cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function sync() {
    if (!cfg || syncing) return;
    syncing = true;
    setSync('busy');
    const add = queue.slice(0, 25);
    const remove = removals.slice();
    try {
      const r = await callServer({ key: cfg.k, add: add, remove: remove });
      if (!r.ok) {
        if (r.error === 'unauthorized') { setSync('error', 'Link ungültig'); toast('Dieser Link ist gesperrt oder ungültig.'); }
        else { setSync('error', 'Fehler'); toast('Fehler: ' + r.error); }
        return;
      }
      const done = new Set(r.added || []);
      queue = queue.filter((q) => !done.has(q.id));
      const gone = new Set(r.removed || []);
      removals = removals.filter((id) => !gone.has(id));
      state = r.state;
      LS.set('queue', queue); LS.set('removals', removals); LS.set('state', state);
      setSync(queue.length ? 'pending' : 'ok');
      render();
      if (queue.length) setTimeout(sync, 300); // Rest nachschicken
    } catch (e) {
      setSync(navigator.onLine === false ? 'offline' : (queue.length || removals.length ? 'pending' : 'offline'));
    } finally {
      syncing = false;
      if (syncStatus === 'busy') setSync('ok');
    }
  }

  function setSync(s, text) {
    syncStatus = s;
    const dot = $('sync-dot');
    dot.className = 'sync-dot' + (s === 'busy' ? ' busy' : '') + (s === 'pending' ? ' pending' : '') + (s === 'offline' ? ' offline' : '') + (s === 'error' ? ' error' : '');
    const n = queue.length + removals.length;
    $('sync-text').textContent = text || (s === 'busy' ? 'Lädt…' : n ? n + ' offen' : s === 'offline' ? 'Offline' : 'Aktuell');
  }

  // ---------- Anzeige ----------
  function level(ratio) { return ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : ''; }
  const RING = 2 * Math.PI * 50;

  function render() {
    const v = view();
    if (!v) { $('month').textContent = 'Lädt…'; return; }
    currency = v.currency || '€';

    $('month').textContent = v.month;
    $('navbar-title').textContent = v.month;
    const start = new Date(v.start + 'T00:00:00'), end = new Date(v.end + 'T00:00:00');
    const totalDays = Math.round((end - start) / 864e5) + 1;
    const dayNo = Math.min(totalDays, Math.max(1, Math.round((new Date(today() + 'T00:00:00') - start) / 864e5) + 1));
    const timeRatio = dayNo / totalDays;
    const daysLeft = totalDays - dayNo + 1;
    $('day').textContent = 'Tag ' + dayNo + ' von ' + totalDays + ' · noch ' + daysLeft + (daysLeft === 1 ? ' Tag' : ' Tage');

    // Übersicht
    let budget = 0, spent = 0;
    v.categories.forEach((c) => { if (c.budget > 0) budget += c.budget; spent += c.spent; });
    const free = round2(budget - spent);
    const r = budget > 0 ? spent / budget : 0;
    $('hero-value').textContent = money(free);
    $('hero-value').classList.toggle('neg', free < 0);
    $('hero-sub').textContent = free >= 0 && daysLeft > 0 ? 'etwa ' + money(Math.max(0, free) / daysLeft) + ' pro Tag' : 'Budget überschritten';
    const ring = $('ring-fill');
    ring.style.strokeDasharray = RING;
    ring.style.strokeDashoffset = RING * (1 - Math.min(1, r));
    ring.setAttribute('class', 'ring-fill ' + level(r));
    $('ring-tick').style.transform = 'rotate(' + (timeRatio * 360) + 'deg)';
    const pill = $('hero-pill');
    const ahead = r - timeRatio;
    pill.className = 'pill ' + (r >= 1 ? 'over' : ahead > 0.05 ? 'warn' : '');
    pill.textContent = r >= 1 ? 'Budget aufgebraucht' : ahead > 0.05 ? 'Etwas schneller als geplant' : 'Im Plan';
    $('stat-spent').textContent = money(spent);
    $('stat-budget').textContent = money(budget);
    $('stat-left').textContent = money(v.left);
    $('stat-left').style.color = v.left < 0 ? 'var(--red)' : '';

    // Kategorien
    const cats = $('cats'), zero = $('cats-zero');
    cats.textContent = ''; zero.textContent = '';
    v.categories.forEach((c) => {
      const row = el('button', 'row');
      row.append(iconFor(c.name));
      const main = el('div', 'row-main');
      const head = el('div', 'row-head');
      head.append(el('span', 'row-title', c.name.trim()));
      main.append(head);
      if (c.budget > 0) {
        const left = round2(c.budget - c.spent);
        const ratio = c.spent / c.budget;
        head.append(el('span', 'row-value' + (left < 0 ? ' neg' : ''), money(left)));
        main.append(el('div', 'row-sub', left >= 0 ? 'noch frei von ' + money(c.budget) : money(-left) + ' über dem Budget von ' + money(c.budget)));
        const bar = el('div', 'bar');
        const fill = el('i', level(ratio)); fill.style.width = Math.min(100, ratio * 100) + '%';
        const tick = el('b'); tick.style.left = (timeRatio * 100) + '%';
        bar.append(fill, tick);
        main.append(bar);
        row.append(main);
        cats.append(row);
      } else {
        head.append(el('span', 'row-value', c.spent > 0 ? money(c.spent) : ''));
        main.append(el('div', 'row-sub', c.spent > 0 ? 'ausgegeben diesen Monat' : 'noch nichts ausgegeben'));
        row.append(main);
        zero.append(row);
      }
      row.append(el('span', 'chev', '›'));
      row.addEventListener('click', () => openSheet(c.name));
    });
    $('cats-zero-title').hidden = zero.children.length === 0;
    zero.hidden = zero.children.length === 0;

    // Einträge (schmal: unten, breit: links)
    renderEntries($('entries'), v.entries, 15);
    renderEntries($('entries-wide'), v.entries, 8);
    setSync(syncStatus);
  }

  function renderEntries(list, entries, max) {
    list.textContent = '';
    if (!entries.length) { list.append(el('div', 'empty', 'Noch keine Ausgaben in diesem Monat.')); return; }
    entries.slice(0, max).forEach((e) => {
      const row = el('div', 'row');
      row.append(iconFor(e.category));
      const main = el('div', 'row-main');
      main.append(el('div', 'row-title', e.note || e.category.trim() || '–'));
      const sub = el('div', 'row-sub', shortDate(e.date) + (e.note ? ' · ' + e.category.trim() : ''));
      if (e.pending) sub.append(el('span', 'pending-tag', ' · wird gesendet'));
      main.append(sub);
      row.append(main, el('span', 'row-value', money(e.amount)));
      if (e.id) {
        const del = el('button', 'del', '✕');
        del.setAttribute('aria-label', 'Eintrag löschen');
        del.addEventListener('click', () => {
          if (!del.classList.contains('armed')) {
            del.classList.add('armed'); del.textContent = 'Löschen';
            setTimeout(() => { del.classList.remove('armed'); del.textContent = '✕'; }, 3000);
            return;
          }
          removeEntry(e);
        });
        row.append(del);
      }
      list.append(row);
    });
  }

  function removeEntry(e) {
    if (e.pending) {
      queue = queue.filter((q) => q.id !== e.id);
      LS.set('queue', queue);
    } else {
      removals.push(e.id);
      LS.set('removals', removals);
      sync();
    }
    render();
    toast('Eintrag gelöscht');
  }

  // ---------- Eingabe ----------
  let amountStr = '';
  let chosen = null;

  function openSheet(category) {
    const v = view();
    if (!v) return;
    amountStr = '';
    chosen = category || null;
    $('note').value = '';
    $('date').value = today();
    $('date').min = v.start; $('date').max = '';
    $('amount-cur').textContent = currency;
    const pick = $('pick');
    pick.textContent = '';
    v.categories.forEach((c) => {
      const b = el('button');
      const ic = iconFor(c.name);
      b.style.setProperty('--tint', ic.style.getPropertyValue('--tint'));
      b.append(ic, el('span', '', c.name.trim()));
      b.dataset.name = c.name;
      if (c.name === chosen) b.classList.add('on');
      b.addEventListener('click', () => {
        chosen = c.name;
        pick.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        updateSheet();
      });
      pick.append(b);
    });
    updateSheet();
    $('sheet-bg').hidden = false;
    $('sheet').hidden = false;
    $('sheet').scrollTop = 0;
  }
  function closeSheet() { $('sheet').hidden = true; $('sheet-bg').hidden = true; }

  function amountValue() { return amountStr ? Number(amountStr.replace(',', '.')) : 0; }
  function updateSheet() {
    $('amount-text').textContent = amountStr || '0';
    $('amount-text').parentNode.classList.toggle('empty-amt', !amountStr);
    $('save').disabled = !(amountValue() > 0 && chosen);
  }

  $('keypad').addEventListener('click', (ev) => {
    const k = ev.target.closest('button') && ev.target.closest('button').dataset.k;
    if (!k) return;
    if (k === 'back') amountStr = amountStr.slice(0, -1);
    else if (k === ',') { if (amountStr.indexOf(',') < 0) amountStr = (amountStr || '0') + ','; }
    else {
      const dec = amountStr.split(',')[1];
      if (dec !== undefined && dec.length >= 2) return;
      if (amountStr === '0') amountStr = '';
      if (amountStr.replace(',', '').length >= 7) return;
      amountStr += k;
    }
    updateSheet();
  });

  $('save').addEventListener('click', () => {
    const amount = round2(amountValue());
    if (!(amount > 0) || !chosen) return;
    const entry = { id: uid(), date: $('date').value || today(), amount: amount, category: chosen, note: $('note').value.trim() };
    queue.push(entry);
    LS.set('queue', queue);
    closeSheet();
    render();
    if (navigator.vibrate) navigator.vibrate(15);
    toast(navigator.onLine === false ? 'Gespeichert ✓ wird gesendet, sobald Netz da ist' : 'Gespeichert ✓');
    sync();
  });
  // Tastatur am Laptop: Ziffern, Komma, Rücktaste, Enter, Esc
  document.addEventListener('keydown', (ev) => {
    if ($('sheet').hidden) return;
    if (ev.key === 'Escape') { closeSheet(); return; }
    if (ev.target.tagName === 'INPUT') { if (ev.key === 'Enter') $('save').click(); return; }
    const map = { Backspace: 'back', ',': ',', '.': ',' };
    const k = /^[0-9]$/.test(ev.key) ? ev.key : map[ev.key];
    if (k) { ev.preventDefault(); const b = $('keypad').querySelector('[data-k="' + k + '"]'); if (b) b.click(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); $('save').click(); }
  });
  $('cancel').addEventListener('click', closeSheet);
  $('sheet-bg').addEventListener('click', closeSheet);
  $('fab').addEventListener('click', () => openSheet(null));
  $('add-top').addEventListener('click', () => openSheet(null));
  window.addEventListener('scroll', () => { $('navbar').classList.toggle('scrolled', window.scrollY > 40); }, { passive: true });
  $('refresh').addEventListener('click', () => sync());

  let toastTimer;
  function toast(text) {
    const t = $('toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ---------- Einrichtung ----------
  $('setup-save').addEventListener('click', () => {
    const c = parseLink($('setup-input').value.trim());
    if (!c) { $('setup-error').hidden = false; return; }
    cfg = c; LS.set('cfg', cfg);
    start();
  });

  // ---------- Demo (zum Ausprobieren ohne Tabelle: Link mit #demo) ----------
  const Demo = {
    call(body) {
      let s = LS.get('demo', null);
      if (!s) s = Demo.initial();
      (body.remove || []).forEach((id) => { s.rows = s.rows.filter((r) => r.id !== id); });
      (body.add || []).forEach((e) => { if (!s.rows.some((r) => r.id === e.id)) s.rows.push(e); });
      LS.set('demo', s);
      const cats = s.cats.map((c) => ({ name: c[0], budget: c[1], spent: round2(s.rows.filter((r) => r.category === c[0]).reduce((a, r) => a + r.amount, 0)) }));
      const spent = s.rows.reduce((a, r) => a + r.amount, 0);
      return new Promise((ok) => setTimeout(() => ok({
        ok: true, added: (body.add || []).map((e) => e.id), removed: body.remove || [],
        state: { month: s.month, start: s.start, end: s.end, currency: '€', left: round2(s.leftBase - spent), categories: cats,
          entries: s.rows.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 30), updated: new Date().toISOString() }
      }), 250));
    },
    initial() {
      const d = new Date(), y = d.getFullYear(), m = d.getMonth();
      const pad = (n) => String(n).padStart(2, '0');
      const names = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
      const day = (n) => y + '-' + pad(m + 1) + '-' + pad(Math.min(n, d.getDate()));
      return {
        month: names[m] + ' ' + y, start: y + '-' + pad(m + 1) + '-01', end: y + '-' + pad(m + 1) + '-' + pad(new Date(y, m + 1, 0).getDate()),
        leftBase: 900,
        cats: [['Lebensmittel', 400], ['Restaurants & Cafés', 150], ['Mobilität', 80], ['Haushalt', 60], ['Gesundheit', 0],
          ['Freizeit', 50], ['Geschenke', 30], ['Drogerie', 60], ['Bargeld', 0]],
        rows: [
          { id: 'd1', date: day(2), amount: 84.37, category: 'Lebensmittel', note: 'Wocheneinkauf' },
          { id: 'd2', date: day(4), amount: 23.5, category: 'Restaurants & Cafés', note: 'Pizza' },
          { id: 'd3', date: day(6), amount: 61.2, category: 'Lebensmittel', note: '' },
          { id: 'd4', date: day(7), amount: 18.95, category: 'Drogerie', note: 'dm' },
          { id: 'd5', date: day(9), amount: 45, category: 'Mobilität', note: 'Tanken' },
          { id: 'd6', date: day(10), amount: 27.9, category: 'Geschenke', note: '' }
        ]
      };
    }
  };

  // ---------- Start ----------
  function start() {
    if (!cfg) { $('setup').hidden = false; $('main').hidden = true; return; }
    $('setup').hidden = true; $('main').hidden = false;
    render();
    sync();
  }

  window.addEventListener('online', sync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  setInterval(() => { if (queue.length || removals.length) sync(); }, 30000);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  start();
})();
