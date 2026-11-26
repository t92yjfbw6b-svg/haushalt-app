# Haushalt-App – Anleitung zum Einrichten

Die App besteht aus zwei Teilen:

1. **Die Brücke** (`apps-script/Code.gs`): ein kleines Script direkt in eurer Google-Tabelle. Es trägt die Ausgaben ein und legt jeden Monat das neue Blatt an.
2. **Die App** (Ordner `web/`): wird kostenlos auf GitHub Pages veröffentlicht und auf dem iPhone auf den Home-Bildschirm gelegt.

---

## Teil 1: Script in die Tabelle einfügen (ca. 5 Minuten, am Laptop)

1. Öffne die Google-Tabelle.
2. Prüfe einmal **Datei > Einstellungen > Zeitzone**: Sie sollte „(GMT+01:00) Berlin“ sein.
3. Klicke oben auf **Erweiterungen > Apps Script**. Ein neuer Tab öffnet sich.
4. Lösche den Text, der dort steht (`function myFunction() …`), und füge den kompletten Inhalt von `Code.gs` ein. Klicke auf das **Speichern-Symbol** (Diskette).
5. Klicke oben rechts auf **Bereitstellen > Neue Bereitstellung**.
   - Beim Zahnrad neben „Typ auswählen“ **Web-App** wählen.
   - **Ausführen als:** Ich
   - **Zugriff:** Jeder
   - Auf **Bereitstellen** klicken.
6. Google fragt nach Berechtigungen. Klicke auf **Zugriff autorisieren** und wähle dein Konto.
   Es erscheint die Warnung „Google hat diese App nicht überprüft“. Das ist normal, weil es dein eigenes Script ist: **Erweitert > Zu … wechseln (unsicher)** und dann **Zulassen**.
7. Wähle oben in der Leiste neben „Ausführen“ die Funktion **einrichten** aus und klicke auf **Ausführen**.
   Unten im **Ausführungsprotokoll** stehen jetzt zwei Links: „Handy1“ und „Handy2“, für jedes iPhone einer. (Die Namen kannst du oben bei `PERSONEN` ändern.)
8. Fertig. In der Tabelle gibt es jetzt das Blatt „Dezember 2026“.

> „Zugriff: Jeder“ heißt nur, dass die Brücke erreichbar ist. Ohne den geheimen Schlüssel aus eurem Link antwortet sie mit „unauthorized“ und gibt nichts heraus.

## Teil 2: App veröffentlichen (einmalig, 1 Minute)

1. Öffne auf github.com dein Repository `haushalt-app` > **Settings** > links **Pages**.
2. Bei **Source** „Deploy from a branch“ wählen, darunter **Branch: main** und **/ (root)**, dann **Save**.
3. Nach 1 bis 2 Minuten ist die App erreichbar unter `https://t92yjfbw6b-svg.github.io/haushalt-app/`.

Die Adresse steht schon in `Code.gs` bei `APP_URL`. Hast du Teil 1 schon vorher gemacht, ist alles gut: Die Links im Protokoll stimmen bereits.

## Teil 3: App auf die iPhones holen

1. Schicke jeden Link nur an die richtige Person (z. B. per AirDrop). Nicht in Gruppenchats posten.
2. Link auf dem iPhone in **Safari** öffnen.
3. Unten auf **Teilen** (Viereck mit Pfeil) > **Zum Home-Bildschirm**.
4. Ab jetzt die App immer über das Symbol auf dem Home-Bildschirm öffnen.

Falls die App vom Home-Bildschirm nach dem Link fragt: den Link einfach in das Feld einfügen. Das ist nur einmal nötig.

---

## Im Alltag

- **Ausgabe eintragen:** Kategorie antippen, Betrag eintippen, oben rechts auf **Sichern**. Notiz und Datum findest du unter **Mehr**.
- **Gutschrift** (z. B. Freunde zahlen ihren Anteil vom Essen zurück): beim Eintragen oben auf **Gutschrift** umschalten. Der Betrag wird in der Tabelle als Minus eingetragen und füllt das Budget der Kategorie wieder auf.
- **Vormonat ansehen:** auf den Monatsnamen oben tippen und einen Monat wählen. Dort kannst du auch etwas nachtragen, das Datum steht dann auf dem letzten Tag dieses Monats.
- **Reihenfolge:** Die Kategorien, die ihr am häufigsten benutzt, rutschen nach oben (jedes Handy merkt sich das selbst).
- **Falsch eingetragen?** Unten bei „Letzte Einträge“ auf ✕ tippen, dann auf „Löschen?“.
- **Ohne Netz:** Die Ausgabe wird auf dem Handy gemerkt und automatisch nachgeschickt.
- **Punkt oben rechts:** grün = Tabelle ist aktuell, rot = noch nicht alles gesendet oder kein Netz. Antippen gleicht neu ab.
- **Balken:** grün = alles gut, gelb = über 80 % verbraucht, rot = Budget aufgebraucht. Der kleine Strich zeigt, wie weit der Monat schon ist. Liegt der Balken links vom Strich, seid ihr im Plan.

## Monatsabschluss

- Am 1. des Monats (gegen 1 Uhr nachts) legt das Script automatisch das neue Blatt an, z. B. „Februar 2027“.
- Es übernimmt die **Budgets vom Vormonat**, leert die Ausgaben-Liste, setzt die Häkchen zurück und trägt den **Rest des Vormonats als Rollover** ein (auch ein Minus).
- Der Rollover ist eine Formel auf das Vormonatsblatt. Korrigierst du am Laptop noch etwas im alten Monat, stimmt der Rollover im neuen Monat automatisch mit.
- Ausgaben, die offline noch mit Datum des alten Monats eingetragen wurden, landen im alten Blatt.
- Budgets im neuen Monat ändern: einfach im neuen Blatt in der Spalte „Budget“ anpassen. Die App zeigt die Änderung beim nächsten Öffnen.

## Testlauf ab Dezember 2026 und Start im Januar

- Das Script legt frühestens das Blatt **„Dezember 2026“** an (Einstellung `ERSTER_MONAT` ganz oben in `Code.gs`). Richtest du es schon im November ein, entsteht sofort das Dezember-Blatt, und die App zeigt Dezember an.
- Den Kontostand für Dezember trägst du im Dezember-Blatt in der Zeile **Rollover** ein (Budget und Ist).
- Am 1. Januar entsteht „Januar 2027“ automatisch aus dem Dezember-Blatt, mit dem Rest aus Dezember als Rollover. Willst du im Januar mit dem echten Kontostand neu starten, überschreibst du dort einfach die beiden Rollover-Zellen mit deiner Zahl.
- Soll der Testlauf gar nicht zählen: vor dem 1. Januar das Dezember-Blatt löschen. Dann entsteht Januar frisch aus „Blanko“.

## Wichtig zur Tabelle

- Das Blatt **„Blanko“** bitte nicht umbenennen. Es ist die Vorlage.
- Monatsblätter heißen immer „Monat Jahr“ (z. B. „März 2027“). Bitte so lassen.
- Kategorien umbenennen geht in der Tabelle (Spalte P). Alte Ausgaben behalten den alten Namen.
- In Spalte **AC** steht bei jeder Ausgabe aus der App eine Kennung. Die braucht die App zum Löschen, bitte stehen lassen.

## Sicherheit

- Wer einen Link hat, kommt in die App. Darum: Links nur privat weitergeben.
- **Handy verloren oder Link aus Versehen geteilt?** In Apps Script bei der Funktion `linkErneuern` „Handy1“ oder „Handy2“ eintragen, speichern und ausführen. Der alte Link geht sofort nicht mehr, der neue steht im Protokoll.
- Die App speichert keine Daten bei GitHub. Alles liegt nur in eurer Google-Tabelle. Der Code auf GitHub ist öffentlich, enthält aber keine Schlüssel.

## Script später aktualisieren

Wenn Claude dir eine neue Version von `Code.gs` gibt: Code ersetzen, speichern, dann **Bereitstellen > Bereitstellungen verwalten > Stift-Symbol > Version: Neue Version > Bereitstellen**. Die Links bleiben gleich.
