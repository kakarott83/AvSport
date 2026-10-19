# Admin-Panel – Änderungsprotokoll

Versionsschema `MAJOR.MINOR.PATCH`: neue Funktion → MINOR, Fehlerbehebung →
PATCH, grundlegender Umbau → MAJOR. Die aktuelle Version steht in `VERSION`.
Ausgeliefert wird mit `scripts/deploy-admin.sh` (setzt den Git-Tag
`admin-v<Version>` und blendet Version + Commit im Panel ein).

## 1.5.2 – 2026-10-19
- `style.css` wird nicht mehr im Browser zwischengespeichert (Design-Änderungen
  kamen sonst erst verspätet an).

## 1.5.1 – 2026-10-19
- Versionsanzeige als farbiges Abzeichen (Cyan; lokale dev-Fassung orange).

## 1.5.0 – 2026-10-19
- Versionierung: Version, Commit und Auslieferungsdatum im Kopf des Panels und
  auf der Login-Seite; Deploy-Skript mit Live-Prüfung und Git-Tag; Rückrollen
  auf jede frühere Version per `--ref admin-vX.Y.Z`.

## 1.4.0 – 2026-10-19 (`be7e75b`)
- Dashboard: KPI-Übersicht in vier Bereichen – Wachstum & Bindung, Nutzung der
  Funktionen, Monetarisierung & Kosten (inkl. MRR aus `config.js`-Preisen),
  Qualität & Betrieb.

## 1.3.0 – 2026-10-19 (`3583c05`)
- Dashboard ist Startseite und erster Reiter; KPI-Kacheln (Nutzer, Aktive,
  Premium, Kosten, KI-Anfragen/-Fehler, Aktivität, Piktogramme, Feedback);
  Aktualisieren-Button.

## 1.2.0 – 2026-10-18 (`921dfa1`)
- Hosting bei Strato unter `milan-muc.de/avadmin`; HSTS ohne
  `includeSubDomains`.

## 1.1.0 – 2026-10-17 (`6114703`)
- Nutzer & Limits (KI-Verbrauch, eigene Limits, Sperren, Premium),
  Standard-Limits, Protokoll, Zwei-Faktor-Login.

## 1.0.0
- Erstes Admin-Panel: Dashboard-Tabellen und Feedback.
