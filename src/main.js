import './styles.css';

const STORAGE_KEY = 'vtg-vocabulary-v1';
const MAX_TEST_WORDS = 20;

const state = {
  vocabulary: loadVocabulary(),
  editingId: null,
  testItems: [],
  selectedTestIds: new Set(),
  uploadedImageUrl: null,
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
  return `<section id="upload" class="card" aria-labelledby="upload-title"><p class="section-kicker">5 · Vorbereitung</p><h2 id="upload-title">Screenshot hochladen</h2><p class="notice">Automatische Vokabelerkennung aus Screenshots wird in einem späteren Schritt implementiert. Es wird noch keine externe KI-API verwendet.</p><label for="screenshot" class="upload-area"><span>PNG- oder JPG-Datei auswählen</span><input id="screenshot" type="file" accept="image/png,image/jpeg" /></label><div id="preview">${state.uploadedImageUrl ? `<img src="${state.uploadedImageUrl}" alt="Vorschau des hochgeladenen Screenshots" />` : '<p class="empty">Noch kein Screenshot ausgewählt.</p>'}</div></section>`;
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
  preview.innerHTML = `<img src="${state.uploadedImageUrl}" alt="Vorschau des hochgeladenen Screenshots" />`;
}

render();
