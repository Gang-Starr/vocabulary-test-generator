const STORAGE_KEY = 'vtg-vocabulary-v1';
const MAX_TEST_WORDS = 20;
const TESSERACT_VERSION = '5.1.1';
const TESSERACT_SCRIPT_URL = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.min.js`;
const OCR_LANGUAGES = 'eng+deu';

const state = {
  vocabulary: loadVocabulary(),
  editingId: null,
  testItems: [],
  selectedTestIds: new Set(),
  uploadedImageUrl: null,
  uploadedImageFile: null,
  ocrRows: [],
  ocrProgress: 0,
  ocrProcessing: false,
  ocrMessage: '',
  ocrUnit: '',
};

const app = document.querySelector('#app');

function loadVocabulary() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveVocabulary() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.vocabulary));
}

function getUnits() {
  return [...new Set(state.vocabulary.map((item) => item.unit).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function makeSentence(word) {
  const templates = [
    `Im Beispielsatz fehlt das passende Wort: Ich verwende ____ in einem sinnvollen Zusammenhang.`,
    `Ergänze den Satz mit dem passenden Fremdwort: Die Klasse übt heute ____.`,
    `Setze das gesuchte Wort ein: In dieser Aufgabe passt ____ am besten in die Lücke.`,
    `Vervollständige die Aussage: Beim Lesen begegnet uns das Wort ____ häufig.`,
  ];
  const index = Math.abs([...word].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % templates.length;
  return templates[index];
}

function render() {
  app.innerHTML = `
    <header class="hero">
      <nav class="topbar" aria-label="Hauptnavigation">
        <a href="#vokabeln">Vokabeln</a>
        <a href="#testgenerator">Testgenerator</a>
        <a href="#testansicht">Testansicht</a>
        <a href="#druckansicht">Drucken</a>
        <a href="#upload">Screenshot</a>
      </nav>
      <div class="hero__content">
        <p class="eyebrow">Schulfreundlich · Lokal · Ohne Login</p>
        <h1>Vocabulary Test Generator</h1>
        <p>Erstelle aus eigenen Vokabellisten kontextbezogene Tests mit Lückensätzen, Auswertung und druckbarer Lösungsseite.</p>
      </div>
    </header>
    <main>
      ${renderVocabularySection()}
      ${renderGeneratorSection()}
      ${renderTestSection()}
      ${renderPrintSection()}
      ${renderUploadSection()}
    </main>
  `;
  bindEvents();
}

function renderVocabularySection() {
  const units = getUnits();
  const editing = state.vocabulary.find((item) => item.id === state.editingId);
  return `
    <section id="vokabeln" class="card section-grid" aria-labelledby="vocabulary-title">
      <div>
        <p class="section-kicker">1 · Verwaltung</p>
        <h2 id="vocabulary-title">Vokabeln verwalten</h2>
        <p class="muted">Alle Einträge werden nur im Browser per localStorage gespeichert.</p>
        <form id="vocabulary-form" class="form" novalidate>
          <input type="hidden" id="vocab-id" value="${editing?.id ?? ''}" />
          <label for="foreign-word">Fremdsprachiges Wort</label>
          <input id="foreign-word" name="foreignWord" value="${escapeHtml(editing?.foreignWord ?? '')}" required placeholder="z. B. environment" />
          <label for="german-translation">Deutsche Übersetzung</label>
          <input id="german-translation" name="germanTranslation" value="${escapeHtml(editing?.germanTranslation ?? '')}" required placeholder="z. B. Umwelt" />
          <label for="unit-input">Unit auswählen oder eingeben</label>
          <input id="unit-input" name="unit" list="unit-options" value="${escapeHtml(editing?.unit ?? '')}" required placeholder="z. B. Unit 3" />
          <datalist id="unit-options">${units.map((unit) => `<option value="${escapeHtml(unit)}"></option>`).join('')}</datalist>
          <p id="vocabulary-message" class="message" role="status"></p>
          <div class="button-row">
            <button type="submit" class="button button--primary">${editing ? 'Änderungen speichern' : 'Vokabel hinzufügen'}</button>
            ${editing ? '<button type="button" class="button" id="cancel-edit">Bearbeitung abbrechen</button>' : ''}
          </div>
        </form>
      </div>
      <div class="list-panel">
        <h3>Gespeicherte Vokabeln</h3>
        ${state.vocabulary.length ? renderVocabularyList() : '<p class="empty">Noch keine Vokabeln vorhanden. Füge links deine erste Vokabel hinzu.</p>'}
      </div>
    </section>`;
}

function renderVocabularyList() {
  return `<div class="vocab-list">${state.vocabulary.map((item) => `
    <article class="vocab-item">
      <div><strong>${escapeHtml(item.foreignWord)}</strong><span>${escapeHtml(item.germanTranslation)} · ${escapeHtml(item.unit)}</span></div>
      <div class="item-actions">
        <button class="button button--small" data-edit="${item.id}" aria-label="${escapeHtml(item.foreignWord)} bearbeiten">Bearbeiten</button>
        <button class="button button--small button--danger" data-delete="${item.id}" aria-label="${escapeHtml(item.foreignWord)} löschen">Löschen</button>
      </div>
    </article>`).join('')}</div>`;
}

function renderGeneratorSection() {
  const units = getUnits();
  const selectedUnit = document.querySelector('#test-unit')?.value || units[0] || '';
  const candidates = state.vocabulary.filter((item) => !selectedUnit || item.unit === selectedUnit);
  return `
    <section id="testgenerator" class="card" aria-labelledby="generator-title">
      <p class="section-kicker">2 · Generator</p><h2 id="generator-title">Test generieren</h2>
      ${state.vocabulary.length ? `
        <label for="test-unit">Unit auswählen</label>
        <select id="test-unit">${units.map((unit) => `<option value="${escapeHtml(unit)}" ${unit === selectedUnit ? 'selected' : ''}>${escapeHtml(unit)}</option>`).join('')}</select>
        <p class="muted">Wähle bis zu ${MAX_TEST_WORDS} Vokabeln. Es werden Lückensätze statt direkter 1:1-Übersetzungen erstellt.</p>
        <div class="checkbox-grid">${candidates.map((item) => `<label class="check-card"><input type="checkbox" class="test-word" value="${item.id}" ${state.selectedTestIds.has(item.id) ? 'checked' : ''}/> <span><strong>${escapeHtml(item.foreignWord)}</strong><small>Hinweis: ${escapeHtml(item.germanTranslation)}</small></span></label>`).join('')}</div>
        <p id="generator-message" class="message" role="status"></p>
        <button id="create-test" class="button button--primary">Test erstellen</button>` : '<p class="empty">Lege zuerst Vokabeln an, damit ein Test erstellt werden kann.</p>'}
    </section>`;
}

function renderTestSection() {
  return `<section id="testansicht" class="card" aria-labelledby="test-title"><p class="section-kicker">3 · Bearbeiten</p><h2 id="test-title">Testansicht</h2>${state.testItems.length ? `<form id="test-form" class="test-list">${state.testItems.map((item, i) => `<div class="question"><label for="answer-${item.id}">${i + 1}. ${escapeHtml(item.sentence)}</label><p class="hint">Optionaler deutscher Hinweis: ${escapeHtml(item.germanTranslation)}</p><input id="answer-${item.id}" data-answer="${escapeHtml(item.foreignWord)}" autocomplete="off" /></div>`).join('')}<button class="button button--primary" type="submit">Test auswerten</button><div id="result" class="result" role="status"></div></form>` : '<p class="empty">Noch kein Test erstellt. Wähle im Generator eine Unit und Vokabeln aus.</p>'}</section>`;
}

function renderPrintSection() {
  return `<section id="druckansicht" class="card print-card" aria-labelledby="print-title"><div class="print-actions"><div><p class="section-kicker">4 · Druck</p><h2 id="print-title">Druckansicht</h2></div><button class="button" onclick="window.print()">Drucken</button></div>${state.testItems.length ? `<div class="print-sheets"><article class="sheet"><h3>Testblatt</h3>${state.testItems.map((item, i) => `<p>${i + 1}. ${escapeHtml(item.sentence)} <span class="line"></span></p>`).join('')}</article><article class="sheet solution"><h3>Lösungsblatt</h3>${state.testItems.map((item, i) => `<p>${i + 1}. ${escapeHtml(item.foreignWord)} <span class="muted">(${escapeHtml(item.germanTranslation)})</span></p>`).join('')}</article></div>` : '<p class="empty">Erstelle einen Test, um Test- und Lösungsblatt zu drucken.</p>'}</section>`;
}

function renderUploadSection() {
  return `<section id="upload" class="card" aria-labelledby="upload-title">
    <p class="section-kicker">5 · Vorbereitung</p><h2 id="upload-title">Screenshot hochladen</h2>
    <p class="notice">Datenschutz: Der Screenshot wird mit Tesseract.js ${TESSERACT_VERSION} lokal in deinem Browser verarbeitet. Es findet kein Upload auf einen Server statt und es wird keine externe KI-API genutzt.</p>
    <label for="screenshot" class="upload-area"><span>PNG- oder JPG-Datei auswählen</span><input id="screenshot" type="file" accept="image/png,image/jpeg" /></label>
    <div id="preview">${state.uploadedImageUrl ? `<img src="${state.uploadedImageUrl}" alt="Vorschau des hochgeladenen Screenshots" />` : '<p class="empty">Noch kein Screenshot ausgewählt.</p>'}</div>
    ${state.uploadedImageFile ? `<div class="ocr-actions"><button id="recognize-vocabulary" class="button button--primary" ${state.ocrProcessing ? 'disabled' : ''}>${state.ocrProcessing ? 'Erkennung läuft …' : 'Vokabeln erkennen'}</button><div class="progress" aria-label="Fortschritt der Vokabelerkennung"><div style="width: ${state.ocrProgress}%"></div></div><span class="progress-label">${state.ocrProgress} %</span></div>` : ''}
    <p id="ocr-message" class="message" role="status">${escapeHtml(state.ocrMessage)}</p>
    ${state.ocrRows.length ? renderOcrReview() : ''}
  </section>`;
}

function renderOcrReview() {
  return `<div class="ocr-review" aria-labelledby="ocr-review-title">
    <h3 id="ocr-review-title">Erkannte Vokabeln prüfen</h3>
    <p class="muted">OCR-Ergebnisse können fehlerhaft sein. Bitte prüfe und korrigiere die Tabelle, bevor du Einträge übernimmst.</p>
    <label for="ocr-unit">Unit für erkannte Vokabeln</label>
    <input id="ocr-unit" value="${escapeHtml(state.ocrUnit)}" placeholder="z. B. Unit 3" />
    <div class="table-wrap"><table class="review-table"><thead><tr><th>Übernehmen</th><th>Fremdsprachiges Wort</th><th>Deutsche Übersetzung</th><th>Unit</th><th>Hinweis</th><th></th></tr></thead><tbody>${state.ocrRows.map((row) => `<tr>
      <td><input type="checkbox" class="ocr-accept" data-ocr-id="${row.id}" ${row.accept ? 'checked' : ''} /></td>
      <td><input class="ocr-foreign" data-ocr-id="${row.id}" value="${escapeHtml(row.foreignWord)}" /></td>
      <td><input class="ocr-german" data-ocr-id="${row.id}" value="${escapeHtml(row.germanTranslation)}" /></td>
      <td><input class="ocr-row-unit" data-ocr-id="${row.id}" value="${escapeHtml(row.unit)}" placeholder="${escapeHtml(state.ocrUnit || 'Unit')}" /></td>
      <td class="${row.confidence < 70 ? 'warning' : 'ok'}">${row.confidence >= 70 ? `${row.confidence} %` : `Unsicher (${row.confidence} %)`}</td>
      <td><button class="button button--small button--danger" data-delete-ocr="${row.id}">Löschen</button></td>
    </tr>`).join('')}</tbody></table></div>
    <button id="import-ocr" class="button button--primary">Ausgewählte Vokabeln übernehmen</button>
  </div>`;
}

function bindEvents() {
  document.querySelector('#vocabulary-form')?.addEventListener('submit', handleVocabularySubmit);
  document.querySelector('#cancel-edit')?.addEventListener('click', () => { state.editingId = null; render(); });
  document.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => { state.editingId = button.dataset.edit; render(); }));
  document.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => { state.vocabulary = state.vocabulary.filter((item) => item.id !== button.dataset.delete); state.selectedTestIds.delete(button.dataset.delete); saveVocabulary(); render(); }));
  document.querySelector('#test-unit')?.addEventListener('change', () => { state.selectedTestIds.clear(); render(); });
  document.querySelectorAll('.test-word').forEach((input) => input.addEventListener('change', handleWordSelection));
  document.querySelector('#create-test')?.addEventListener('click', createTest);
  document.querySelector('#test-form')?.addEventListener('submit', evaluateTest);
  document.querySelector('#screenshot')?.addEventListener('change', handleScreenshot);
  document.querySelector('#recognize-vocabulary')?.addEventListener('click', recognizeVocabulary);
  document.querySelector('#ocr-unit')?.addEventListener('input', handleOcrUnitInput);
  document.querySelectorAll('.ocr-accept').forEach((input) => input.addEventListener('change', updateOcrRow));
  document.querySelectorAll('.ocr-foreign, .ocr-german, .ocr-row-unit').forEach((input) => input.addEventListener('input', updateOcrRow));
  document.querySelectorAll('[data-delete-ocr]').forEach((button) => button.addEventListener('click', () => { state.ocrRows = state.ocrRows.filter((row) => row.id !== button.dataset.deleteOcr); render(); }));
  document.querySelector('#import-ocr')?.addEventListener('click', importSelectedOcrRows);
}

function handleVocabularySubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const message = document.querySelector('#vocabulary-message');
  if (!data.foreignWord.trim() || !data.germanTranslation.trim() || !data.unit.trim()) {
    message.textContent = 'Bitte fülle alle Felder aus.';
    return;
  }
  const item = { id: state.editingId || crypto.randomUUID(), foreignWord: data.foreignWord.trim(), germanTranslation: data.germanTranslation.trim(), unit: data.unit.trim() };
  state.vocabulary = state.editingId ? state.vocabulary.map((entry) => entry.id === state.editingId ? item : entry) : [...state.vocabulary, item];
  state.editingId = null;
  saveVocabulary();
  render();
}

function handleWordSelection(event) {
  const message = document.querySelector('#generator-message');
  if (event.target.checked && state.selectedTestIds.size >= MAX_TEST_WORDS) {
    event.target.checked = false;
    message.textContent = `Du kannst maximal ${MAX_TEST_WORDS} Vokabeln auswählen.`;
    return;
  }
  event.target.checked ? state.selectedTestIds.add(event.target.value) : state.selectedTestIds.delete(event.target.value);
  message.textContent = `${state.selectedTestIds.size} Vokabel(n) ausgewählt.`;
}

function createTest() {
  const message = document.querySelector('#generator-message');
  if (!state.selectedTestIds.size) {
    message.textContent = 'Bitte wähle mindestens eine Vokabel aus.';
    return;
  }
  state.testItems = state.vocabulary.filter((item) => state.selectedTestIds.has(item.id)).map((item) => ({ ...item, sentence: makeSentence(item.foreignWord) }));
  render();
  document.querySelector('#testansicht')?.scrollIntoView({ behavior: 'smooth' });
}

function evaluateTest(event) {
  event.preventDefault();
  let points = 0;
  const details = state.testItems.map((item) => {
    const input = document.querySelector(`#answer-${CSS.escape(item.id)}`);
    const isCorrect = input.value.trim().toLocaleLowerCase('de') === item.foreignWord.toLocaleLowerCase('de');
    input.classList.toggle('correct', isCorrect);
    input.classList.toggle('incorrect', !isCorrect);
    if (isCorrect) points += 1;
    return `<li class="${isCorrect ? 'ok' : 'bad'}">${escapeHtml(item.foreignWord)}: ${isCorrect ? 'richtig' : `falsch (deine Antwort: ${escapeHtml(input.value || '—')})`}</li>`;
  });
  const percent = Math.round((points / state.testItems.length) * 100);
  document.querySelector('#result').innerHTML = `<h3>Ergebnis: ${points}/${state.testItems.length} Punkte (${percent} %)</h3><ul>${details.join('')}</ul>`;
}

function handleScreenshot(event) {
  const file = event.target.files?.[0];
  const preview = document.querySelector('#preview');
  if (!file) return;
  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    preview.innerHTML = '<p class="message">Bitte nur PNG- oder JPG-Dateien hochladen.</p>';
    return;
  }
  if (state.uploadedImageUrl) URL.revokeObjectURL(state.uploadedImageUrl);
  state.uploadedImageUrl = URL.createObjectURL(file);
  state.uploadedImageFile = file;
  state.ocrRows = [];
  state.ocrProgress = 0;
  state.ocrMessage = '';
  preview.innerHTML = `<img src="${state.uploadedImageUrl}" alt="Vorschau des hochgeladenen Screenshots" />`;
  render();
}

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TESSERACT_SCRIPT_URL;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Tesseract.js konnte nicht geladen werden.'));
    document.head.append(script);
  });
  return window.Tesseract;
}

async function recognizeVocabulary() {
  if (!state.uploadedImageFile || state.ocrProcessing) return;
  state.ocrProcessing = true;
  state.ocrProgress = 0;
  state.ocrMessage = 'OCR wird lokal im Browser gestartet …';
  render();
  try {
    const Tesseract = await loadTesseract();
    const result = await Tesseract.recognize(state.uploadedImageFile, OCR_LANGUAGES, {
      logger: ({ status, progress }) => {
        if (typeof progress === 'number') {
          state.ocrProgress = Math.min(100, Math.max(0, Math.round(progress * 100)));
          state.ocrMessage = status ? `OCR: ${status}` : state.ocrMessage;
          render();
        }
      },
    });
    state.ocrRows = parseVocabularyText(result.data.text, result.data.confidence);
    state.ocrProgress = 100;
    state.ocrMessage = state.ocrRows.length ? `${state.ocrRows.length} mögliche Vokabel(n) erkannt. Bitte vor dem Speichern prüfen.` : 'Keine eindeutigen Vokabelpaare erkannt. Bitte Screenshot prüfen oder Vokabeln manuell eingeben.';
  } catch (error) {
    state.ocrMessage = `Erkennung fehlgeschlagen: ${error.message || 'Unbekannter Fehler'}`;
  } finally {
    state.ocrProcessing = false;
    render();
  }
}

function parseVocabularyText(text, confidence = 0) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    .filter((line) => !/^(unit|lektion|vocabulary|vokabeln|page|seite)\b/i.test(line) && !/^\d{1,3}$/.test(line))
    .map((line) => {
      const cleaned = line.replace(/^\d+[.)]\s*/, '').trim();
      const parts = cleaned.split(/\s(?:[-–—:]|={1,2})\s|\t+|\s{2,}/).map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
      if (parts.length < 2) return null;
      const rowConfidence = Math.round(Math.min(100, Math.max(0, confidence || 0)));
      return { id: crypto.randomUUID(), accept: rowConfidence >= 55, foreignWord: parts[0], germanTranslation: parts.slice(1).join(' '), unit: state.ocrUnit, confidence: rowConfidence };
    }).filter(Boolean);
}

function handleOcrUnitInput(event) {
  state.ocrUnit = event.target.value;
  state.ocrRows = state.ocrRows.map((row) => row.unit ? row : { ...row, unit: state.ocrUnit });
}

function updateOcrRow(event) {
  const id = event.target.dataset.ocrId;
  state.ocrRows = state.ocrRows.map((row) => row.id === id ? {
    ...row,
    accept: event.target.classList.contains('ocr-accept') ? event.target.checked : row.accept,
    foreignWord: event.target.classList.contains('ocr-foreign') ? event.target.value : row.foreignWord,
    germanTranslation: event.target.classList.contains('ocr-german') ? event.target.value : row.germanTranslation,
    unit: event.target.classList.contains('ocr-row-unit') ? event.target.value : row.unit,
  } : row);
}

function importSelectedOcrRows() {
  const selected = state.ocrRows.filter((row) => row.accept && row.foreignWord.trim() && row.germanTranslation.trim() && (row.unit || state.ocrUnit).trim());
  const existing = new Set(state.vocabulary.map((item) => `${item.foreignWord.trim().toLocaleLowerCase('de')}|${item.germanTranslation.trim().toLocaleLowerCase('de')}|${item.unit.trim().toLocaleLowerCase('de')}`));
  let added = 0;
  let skipped = 0;
  selected.forEach((row) => {
    const unit = (row.unit || state.ocrUnit).trim();
    const key = `${row.foreignWord.trim().toLocaleLowerCase('de')}|${row.germanTranslation.trim().toLocaleLowerCase('de')}|${unit.toLocaleLowerCase('de')}`;
    if (existing.has(key)) { skipped += 1; return; }
    existing.add(key);
    state.vocabulary.push({ id: crypto.randomUUID(), foreignWord: row.foreignWord.trim(), germanTranslation: row.germanTranslation.trim(), unit });
    added += 1;
  });
  saveVocabulary();
  state.ocrMessage = `${added} Vokabel(n) hinzugefügt, ${skipped} Duplikat(e) übersprungen.`;
  render();
  document.querySelector('#vokabeln')?.scrollIntoView({ behavior: 'smooth' });
}

render();
