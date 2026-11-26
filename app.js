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

  const EMOJI = [
    [/lebensmittel|einkauf|supermarkt/i, '🛒'], [/restaurant|caf|essen/i, '☕'],
    [/mobil|auto|tank|bahn/i, '🚗'], [/anschaffung.*baby/i, '🧸'], [/baby|kind/i, '🍼'],
    [/wohnung|möbel/i, '🛋️'], [/haushalt/i, '🧽'], [/gesund|apothe|arzt/i, '💊'],
    [/entertain|freizeit|kino/i, '🎬'], [/geschenk/i, '🎁'], [/drogerie/i, '🧴'],
    [/bargeld|fun/i, '💶'], [/hochzeit/i, '💍'], [/kleid|mode/i, '👕'], [/urlaub|reise/i, '🏖️']
  ];
  const emojiFor = (name) => (EMOJI.find((x) => x[0].test(name)) || [0, '🏷️'])[1];

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
  function colorFor(ratio) { return ratio >= 1 ? 'red' : ratio >= 0.8 ? 'yellow' : ''; }

  function render() {
    const v = view();
    if (!v) { $('month').textContent = 'Lädt…'; return; }
    currency = v.currency || '€';

    $('month').textContent = v.month;
    const start = new Date(v.start + 'T00:00:00'), end = new Date(v.end + 'T00:00:00');
    const totalDays = Math.round((end - start) / 864e5) + 1;
    const dayNo = Math.min(totalDays, Math.max(1, Math.round((new Date(today() + 'T00:00:00') - start) / 864e5) + 1));
    const timeRatio = dayNo / totalDays;
    $('day').textContent = 'Tag ' + dayNo + ' von ' + totalDays;

    // Gesamt über alle Kategorien
    let budget = 0, spent = 0;
    v.categories.forEach((c) => { budget += c.budget; spent += c.spent; });
    const free = round2(budget - spent);
    $('hero-value').textContent = money(free);
    $('hero-value').classList.toggle('neg', free < 0);
    const r = budget > 0 ? spent / budget : 0;
    $('hero-fill').style.width = Math.min(100, r * 100) + '%';
    $('hero-fill').className = 'hero-fill ' + colorFor(r);
    $('hero-marker').style.left = (timeRatio * 100) + '%';
    $('hero-sub').textContent = money(spent) + ' von ' + money(budget) + ' ausgegeben · Monat gesamt frei: ' + money(v.left);

    // Kategorien
    const cats = $('cats');
    cats.textContent = '';
    v.categories.forEach((c) => {
      const left = round2(c.budget - c.spent);
      const ratio = c.budget > 0 ? c.spent / c.budget : (c.spent > 0 ? 1 : 0);
      const b = el('button', 'cat' + (c.budget > 0 ? '' : ' nobudget'));
      const row = el('div', 'cat-row');
      row.append(el('span', 'cat-emoji', emojiFor(c.name)), el('span', 'cat-name', c.name.trim()));
      const l = el('span', 'cat-left' + (left < 0 ? ' neg' : ''), c.budget > 0 ? money(left) : (c.spent > 0 ? '−' + money(c.spent) : ''));
      row.append(l);
      b.append(row);
      const bar = el('div', 'bar');
      const fill = el('div', 'fill ' + colorFor(ratio));
      fill.style.width = Math.min(100, ratio * 100) + '%';
      const mk = el('div', 'marker');
      mk.style.left = (timeRatio * 100) + '%';
      bar.append(fill, mk);
      b.append(bar);
      b.append(el('div', 'cat-sub', c.budget > 0
        ? (left >= 0 ? 'noch ' + money(left) + ' von ' + money(c.budget) : money(-left) + ' über Budget von ' + money(c.budget))
        : (c.spent > 0 ? money(c.spent) + ' ausgegeben, kein Budget' : 'kein Budget')));
      b.addEventListener('click', () => openSheet(c.name));
      cats.append(b);
    });

    // Einträge
    const list = $('entries');
    list.textContent = '';
    if (!v.entries.length) list.append(el('div', 'empty', 'Noch keine Ausgaben in diesem Monat.'));
    v.entries.slice(0, 20).forEach((e) => {
      const row = el('div', 'entry');
      row.append(el('span', 'cat-emoji', emojiFor(e.category)));
      const main = el('div', 'entry-main');
      main.append(el('div', 'entry-cat', e.category.trim() || '–'));
      const sub = el('div', 'entry-note', shortDate(e.date) + (e.note ? ' · ' + e.note : ''));
      if (e.pending) { sub.append(' '); sub.append(el('span', 'pending-tag', '⏳ wird gesendet')); }
      main.append(sub);
      row.append(main, el('span', 'entry-amt', money(e.amount)));
      if (e.id) {
        const del = el('button', 'entry-del', '✕');
        del.setAttribute('aria-label', 'Eintrag löschen');
        del.addEventListener('click', () => {
          if (!del.classList.contains('armed')) {
            del.classList.add('armed'); del.textContent = 'Löschen?';
            setTimeout(() => { del.classList.remove('armed'); del.textContent = '✕'; }, 3000);
            return;
          }
          removeEntry(e);
        });
        row.append(del);
      }
      list.append(row);
    });
    setSync(syncStatus);
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
      b.append(el('span', 'e', emojiFor(c.name)), document.createTextNode(c.name.trim()));
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
  $('cancel').addEventListener('click', closeSheet);
  $('sheet-bg').addEventListener('click', closeSheet);
  $('fab').addEventListener('click', () => openSheet(null));
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
