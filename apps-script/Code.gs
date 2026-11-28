/**
 * Haushalt-App – Brücke zwischen App und Google-Tabelle
 *
 * Dieses Script hängt direkt an der Google-Tabelle (Erweiterungen > Apps Script).
 * Es nimmt Ausgaben aus der App entgegen, trägt sie in die Ausgaben-Liste des
 * passenden Monatsblatts ein und schickt die Restbudgets zurück.
 * Am 1. jedes Monats legt es automatisch das neue Monatsblatt an.
 *
 * Einmalig ausführen: einrichten()   (siehe Anleitung)
 */

// ===== Einstellungen ========================================================

/** Adresse der App auf GitHub Pages (wird nach dem Veröffentlichen eingetragen). */
const APP_URL = 'https://t92yjfbw6b-svg.github.io/haushalt-app/';

/**
 * Web-App-Adresse des Scripts. Nach „Bereitstellen“ zeigt Google sie an
 * (beginnt mit https://script.google.com/macros/s/… und endet auf /exec).
 * Hier zwischen die Anführungszeichen kopieren.
 */
const WEB_APP_URL = '';

/** Wer bekommt einen eigenen Link? */
const PERSONEN = ['Handy1', 'Handy2'];

/** Erster Monat, den die App anlegt (Jahr-Monat). Davor wird nichts angelegt. */
const ERSTER_MONAT = '2026-12';

/** Name des Vorlage-Blatts. */
const VORLAGE = 'Blanko';

// ===== Aufbau der Tabelle (aus der Vorlage) ================================

const ZELLE_START = 'D9';
const ZELLE_ENDE = 'D10';
const ZELLE_WAEHRUNG = 'B11';
const ZELLE_ROLLOVER_BUDGET = 'E16';
const ZELLE_ROLLOVER_IST = 'G16';
const ZELLE_REST_IST = 'G22';
const BEREICH_KATEGORIEN = 'P16:T40'; // P = Name, R = Budget, T = Ausgegeben
const BEREICH_HAKEN = ['I16:I40', 'V16:V25']; // "bezahlt"-Häkchen
const ERSTE_ZEILE = 46;
const LETZTE_ZEILE = 999;
// Spalten der Ausgaben-Liste (1 = A)
const SP_DATUM = 2;     // B
const SP_BETRAG = 5;    // E
const SP_KATEGORIE = 8; // H
const SP_NOTIZ = 11;    // K
const SP_ID = 29;       // AC (unsichtbare Kennung für die App)

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
  'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONATSBLATT = new RegExp('^(' + MONATE.join('|') + ') (\\d{4})$');

// ===== Schnittstelle für die App ===========================================

function doGet() {
  return ContentService.createTextOutput('Haushalt-App: Brücke läuft.');
}

function doPost(e) {
  let antwort;
  try {
    const anfrage = JSON.parse(e.postData.contents);
    const person = pruefeSchluessel_(anfrage.key);
    if (!person) {
      antwort = { ok: false, error: 'unauthorized' };
    } else {
      antwort = verarbeite_(anfrage);
    }
  } catch (err) {
    antwort = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(antwort))
    .setMimeType(ContentService.MimeType.JSON);
}

function verarbeite_(anfrage) {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const ergebnis = { ok: true, added: [], removed: [] };

  const neu = Array.isArray(anfrage.add) ? anfrage.add : [];
  const weg = Array.isArray(anfrage.remove) ? anfrage.remove : [];

  if (neu.length || weg.length) {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      weg.forEach(function (id) {
        loescheEintrag_(ss, String(id));
        ergebnis.removed.push(String(id));
      });
      neu.forEach(function (eintrag) {
        fuegeEin_(ss, tz, eintrag);
        ergebnis.added.push(String(eintrag.id));
      });
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  }

  const heute = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const aktuell = blattFuerDatum_(ss, tz, heute);
  const monate = monatsblaetter_(ss).map(function (m) { return m.blatt.getName(); }).reverse();
  ergebnis.months = monate;
  ergebnis.current = aktuell.getName();
  // Auf Wunsch einen anderen (vergangenen) Monat lesen
  const gewuenscht = typeof anfrage.month === 'string' && monate.indexOf(anfrage.month) >= 0
    ? ss.getSheetByName(anfrage.month) : aktuell;
  ergebnis.state = leseStand_(gewuenscht, tz);
  return ergebnis;
}

// ===== Ausgaben eintragen / löschen ========================================

function fuegeEin_(ss, tz, eintrag) {
  const id = String(eintrag.id || '');
  const datum = String(eintrag.date || '');
  const betrag = Math.round(Number(eintrag.amount) * 100) / 100;
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) throw new Error('Ungültiger Eintrag');
  // Positiv = Ausgabe, negativ = Gutschrift (z. B. Geld von Freunden zurück)
  if (!betrag || Math.abs(betrag) > 100000) throw new Error('Ungültiger Betrag');

  const blatt = blattFuerDatum_(ss, tz, datum);
  const anzahl = LETZTE_ZEILE - ERSTE_ZEILE + 1;
  const ids = blatt.getRange(ERSTE_ZEILE, SP_ID, anzahl, 1).getValues();
  for (let i = 0; i < anzahl; i++) {
    if (String(ids[i][0]) === id) return; // schon eingetragen (doppelt gesendet)
  }

  const daten = blatt.getRange(ERSTE_ZEILE, SP_DATUM, anzahl, SP_BETRAG - SP_DATUM + 1).getValues();
  let zeile = -1;
  for (let i = 0; i < anzahl; i++) {
    const leer = daten[i][0] === '' && daten[i][SP_BETRAG - SP_DATUM] === '' && ids[i][0] === '';
    if (leer) { zeile = ERSTE_ZEILE + i; break; }
  }
  if (zeile < 0) throw new Error('Ausgaben-Liste von ' + blatt.getName() + ' ist voll');

  blatt.getRange(zeile, SP_DATUM).setValue(Utilities.parseDate(datum, tz, 'yyyy-MM-dd'));
  blatt.getRange(zeile, SP_BETRAG).setValue(betrag);
  blatt.getRange(zeile, SP_KATEGORIE).setValue(String(eintrag.category || '').slice(0, 100));
  blatt.getRange(zeile, SP_NOTIZ).setValue(String(eintrag.note || '').slice(0, 200));
  blatt.getRange(zeile, SP_ID).setValue(id);
}

function loescheEintrag_(ss, id) {
  if (!id) return;
  const anzahl = LETZTE_ZEILE - ERSTE_ZEILE + 1;
  monatsblaetter_(ss).forEach(function (m) {
    const ids = m.blatt.getRange(ERSTE_ZEILE, SP_ID, anzahl, 1).getValues();
    for (let i = 0; i < anzahl; i++) {
      if (String(ids[i][0]) === id) {
        const z = ERSTE_ZEILE + i;
        [SP_DATUM, SP_BETRAG, SP_KATEGORIE, SP_NOTIZ, SP_ID].forEach(function (sp) {
          m.blatt.getRange(z, sp).clearContent();
        });
      }
    }
  });
}

// ===== Stand lesen =========================================================

function leseStand_(blatt, tz) {
  const kat = blatt.getRange(BEREICH_KATEGORIEN).getValues();
  const kategorien = [];
  kat.forEach(function (z) {
    const name = String(z[0]);
    if (name.trim() === '') return;
    kategorien.push({ name: name, budget: zahl_(z[2]), spent: zahl_(z[4]) });
  });

  const anzahl = LETZTE_ZEILE - ERSTE_ZEILE + 1;
  const liste = blatt.getRange(ERSTE_ZEILE, SP_DATUM, anzahl, SP_ID - SP_DATUM + 1).getValues();
  const eintraege = [];
  liste.forEach(function (z) {
    const betrag = z[SP_BETRAG - SP_DATUM];
    if (betrag === '' || betrag === null) return;
    const d = z[0];
    eintraege.push({
      id: String(z[SP_ID - SP_DATUM] || '') || null,
      date: d instanceof Date ? Utilities.formatDate(d, tz, 'yyyy-MM-dd') : String(d),
      amount: zahl_(betrag),
      category: String(z[SP_KATEGORIE - SP_DATUM]),
      note: String(z[SP_NOTIZ - SP_DATUM])
    });
  });
  eintraege.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });

  return {
    month: blatt.getName(),
    start: Utilities.formatDate(blatt.getRange(ZELLE_START).getValue(), tz, 'yyyy-MM-dd'),
    end: Utilities.formatDate(blatt.getRange(ZELLE_ENDE).getValue(), tz, 'yyyy-MM-dd'),
    currency: String(blatt.getRange(ZELLE_WAEHRUNG).getValue() || '€'),
    left: zahl_(blatt.getRange(ZELLE_REST_IST).getValue()),
    categories: kategorien,
    entries: eintraege.slice(0, 30),
    updated: new Date().toISOString()
  };
}

function zahl_(w) {
  const n = Number(w);
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

// ===== Monatsblätter =======================================================

/** Alle Monatsblätter, nach Startdatum sortiert. */
function monatsblaetter_(ss) {
  const tz = ss.getSpreadsheetTimeZone();
  const liste = [];
  ss.getSheets().forEach(function (blatt) {
    if (!MONATSBLATT.test(blatt.getName())) return;
    const s = blatt.getRange(ZELLE_START).getValue();
    const e = blatt.getRange(ZELLE_ENDE).getValue();
    if (!(s instanceof Date) || !(e instanceof Date)) return;
    liste.push({
      blatt: blatt,
      start: Utilities.formatDate(s, tz, 'yyyy-MM-dd'),
      ende: Utilities.formatDate(e, tz, 'yyyy-MM-dd')
    });
  });
  liste.sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  return liste;
}

/** Liefert das Blatt für ein Datum (yyyy-MM-dd) und legt fehlende Monate an. */
function blattFuerDatum_(ss, tz, datum) {
  if (datum < ERSTER_MONAT + '-01') datum = ERSTER_MONAT + '-01';
  let liste = monatsblaetter_(ss);
  for (let i = 0; i < liste.length; i++) {
    if (liste[i].start <= datum && datum <= liste[i].ende) return liste[i].blatt;
  }
  if (liste.length === 0) {
    return neuesMonatsblatt_(ss, tz, null, Number(datum.slice(0, 4)), Number(datum.slice(5, 7)) - 1);
  }
  const letztes = liste[liste.length - 1];
  if (datum < liste[0].start) return liste[0].blatt; // sehr alte Ausgabe: ins erste Blatt
  // Monate bis zum gesuchten Datum nacheinander anlegen (Rollover läuft mit)
  let vorher = letztes;
  let blatt = letztes.blatt;
  let sicherung = 0;
  while (vorher.ende < datum && sicherung++ < 24) {
    const naechster = Utilities.parseDate(vorher.ende, tz, 'yyyy-MM-dd');
    naechster.setTime(naechster.getTime() + 36 * 3600 * 1000); // sicher in den nächsten Tag
    const j = Number(Utilities.formatDate(naechster, tz, 'yyyy'));
    const m = Number(Utilities.formatDate(naechster, tz, 'M')) - 1;
    blatt = neuesMonatsblatt_(ss, tz, vorher.blatt, j, m);
    vorher = {
      blatt: blatt,
      start: Utilities.formatDate(blatt.getRange(ZELLE_START).getValue(), tz, 'yyyy-MM-dd'),
      ende: Utilities.formatDate(blatt.getRange(ZELLE_ENDE).getValue(), tz, 'yyyy-MM-dd')
    };
  }
  return blatt;
}

/**
 * Legt das Blatt für Monat m (0–11) im Jahr j an.
 * Mit Vormonat: Kopie davon (Budgets bleiben), Ausgaben geleert, Rest des Vormonats als Rollover.
 * Ohne Vormonat: Kopie von „Blanko“.
 */
function neuesMonatsblatt_(ss, tz, vormonat, j, m) {
  const name = MONATE[m] + ' ' + j;
  const vorhanden = ss.getSheetByName(name);
  if (vorhanden) return vorhanden;

  const quelle = vormonat || ss.getSheetByName(VORLAGE);
  if (!quelle) throw new Error('Vorlage „' + VORLAGE + '“ fehlt');

  const blatt = quelle.copyTo(ss);
  blatt.setName(name);
  ss.setActiveSheet(blatt);
  ss.moveActiveSheet(quelle.getIndex() + 1);

  const tage = new Date(j, m + 1, 0).getDate();
  const mm = ('0' + (m + 1)).slice(-2);
  blatt.getRange(ZELLE_START).setValue(Utilities.parseDate(j + '-' + mm + '-01', tz, 'yyyy-MM-dd'));
  blatt.getRange(ZELLE_ENDE).setValue(Utilities.parseDate(j + '-' + mm + '-' + tage, tz, 'yyyy-MM-dd'));

  // Ausgaben-Liste leeren (nur Eingabe-Spalten, Formeln bleiben)
  const n = LETZTE_ZEILE - ERSTE_ZEILE + 1;
  [SP_DATUM, SP_BETRAG, SP_KATEGORIE, SP_NOTIZ, SP_ID].forEach(function (sp) {
    blatt.getRange(ERSTE_ZEILE, sp, n, 1).clearContent();
  });

  if (vormonat) {
    BEREICH_HAKEN.forEach(function (a1) { blatt.getRange(a1).uncheck(); });
    // Rollover als Formel: bleibt richtig, auch wenn im Vormonat noch etwas geändert wird
    const rest = "='" + vormonat.getName().replace(/'/g, "''") + "'!" + ZELLE_REST_IST;
    blatt.getRange(ZELLE_ROLLOVER_BUDGET).setFormula(rest);
    blatt.getRange(ZELLE_ROLLOVER_IST).setFormula(rest);
  }

  // Auswahlliste der Kategorien auf das eigene Blatt zeigen lassen
  const regel = SpreadsheetApp.newDataValidation()
    .requireValueInRange(blatt.getRange('P16:P40'), true)
    .setAllowInvalid(true)
    .build();
  blatt.getRange(ERSTE_ZEILE, SP_KATEGORIE, n, 1).setDataValidation(regel);

  SpreadsheetApp.flush();
  return blatt;
}

/** Läuft automatisch am 1. jedes Monats (und darf jederzeit von Hand laufen). */
function monatswechsel() {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  blattFuerDatum_(ss, tz, Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'));
}

// ===== Zugang (geheime Links) ==============================================

function pruefeSchluessel_(key) {
  if (!key || typeof key !== 'string') return null;
  const schluessel = leseSchluessel_();
  for (const person in schluessel) {
    if (gleich_(schluessel[person], key)) return person;
  }
  return null;
}

function gleich_(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function leseSchluessel_() {
  const roh = PropertiesService.getScriptProperties().getProperty('SCHLUESSEL');
  return roh ? JSON.parse(roh) : {};
}

function neuerSchluessel_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

// ===== Funktionen zum Ausführen im Script-Editor ===========================

/** Einmalig nach dem Bereitstellen ausführen: Schlüssel, Monatswechsel, Links. */
function einrichten() {
  const props = PropertiesService.getScriptProperties();
  const schluessel = leseSchluessel_();
  PERSONEN.forEach(function (p) { if (!schluessel[p]) schluessel[p] = neuerSchluessel_(); });
  props.setProperty('SCHLUESSEL', JSON.stringify(schluessel));

  const vorhanden = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'monatswechsel';
  });
  if (!vorhanden) {
    ScriptApp.newTrigger('monatswechsel').timeBased().onMonthDay(1).atHour(1).create();
  }
  monatswechsel();
  linksAnzeigen();
}

/** Zeigt die persönlichen Links im Protokoll an. */
function linksAnzeigen() {
  // Im Editor liefert Google oft nur die Test-Adresse (/dev), die von außen nicht
  // erreichbar ist. Deshalb zählt die oben eingetragene Web-App-Adresse.
  const url = (WEB_APP_URL || '').trim();
  const treffer = url.match(/\/macros\/s\/([\w-]+)\/exec/);
  if (!treffer) {
    throw new Error('Bitte oben bei WEB_APP_URL die Web-App-Adresse eintragen. Du findest sie unter ' +
      'Bereitstellen > Bereitstellungen verwalten (sie endet auf /exec).');
  }
  const id = treffer[1];
  const schluessel = leseSchluessel_();
  Object.keys(schluessel).forEach(function (p) {
    Logger.log(p + ':  ' + APP_URL + '#s=' + id + '&k=' + schluessel[p]);
  });
}

/** Sperrt den Link einer Person und erstellt einen neuen. Name unten anpassen. */
function linkErneuern() {
  const person = 'Handy1'; // <- hier Handy1 oder Handy2 eintragen
  const schluessel = leseSchluessel_();
  schluessel[person] = neuerSchluessel_();
  PropertiesService.getScriptProperties().setProperty('SCHLUESSEL', JSON.stringify(schluessel));
  linksAnzeigen();
}
