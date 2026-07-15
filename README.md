# Vocabulary Test Generator

Eine responsive, schulfreundliche Webanwendung zum Verwalten von Vokabeln und Erstellen kontextbezogener Vokabeltests. Die App läuft vollständig im Browser, nutzt `localStorage` und ist für GitHub Pages vorbereitet.

## Funktionen

- **Vokabelverwaltung**
  - Fremdsprachiges Wort, deutsche Übersetzung und Unit erfassen
  - Vokabeln hinzufügen, bearbeiten und löschen
  - Speicherung im lokalen Browser-Speicher (`localStorage`)
- **Testgenerator**
  - Unit auswählen
  - Bis zu 20 Vokabeln für einen Test auswählen
  - Lückensätze statt direkter 1:1-Übersetzungsabfragen
  - Optionaler deutscher Hinweis pro Aufgabe
- **Testansicht**
  - Eingabefeld für jede Antwort
  - Automatische Auswertung mit richtigen und falschen Antworten
  - Ergebnis als Punkte und Prozentwert
- **Druckansicht**
  - Testblatt ohne Lösungen
  - Separates Lösungsblatt
  - Druckfreundliches Layout über die Browser-Druckfunktion
- **Screenshot-Upload-Vorbereitung**
  - Uploadbereich für PNG- und JPG-Dateien
  - Vorschau des Screenshots
  - Hinweis, dass automatische Vokabelerkennung später ergänzt wird
  - Keine externe KI-API, keine API-Schlüssel

## Projektstruktur

```text
.
├── index.html
├── package.json
├── src
│   ├── main.js
│   └── styles.css
└── README.md
```

## Lokale Entwicklung

Voraussetzung: Node.js 18 oder neuer. Es sind keine externen npm-Abhängigkeiten erforderlich.

```bash
npm run dev
```

Danach die lokale URL aus der Terminalausgabe im Browser öffnen.

## Produktions-Build prüfen

```bash
npm run build
```

Der Build wird im Ordner `dist/` erstellt.

## Deployment mit GitHub Pages

1. Repository auf GitHub veröffentlichen.
2. In den Repository-Einstellungen **Settings → Pages** öffnen.
3. Als Quelle **GitHub Actions** wählen.
4. Der enthaltene Workflow `.github/workflows/pages.yml` baut die App und veröffentlicht den Ordner `dist/` als Pages-Artefakt.

Der Workflow enthält:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

## Hinweise

- Die App benötigt kein Login, keine Datenbank und keine API-Schlüssel.
- Daten bleiben im jeweiligen Browserprofil gespeichert.
- Für die spätere automatische Screenshot-Erkennung ist nur die Oberfläche vorbereitet; es wird noch keine externe Erkennung implementiert.
