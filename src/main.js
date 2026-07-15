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
  imageBitmap: null,
  imageRotation: 0,
  exifRotation: 0,
  crop: null,
  cropDraft: null,
  draggingCrop: false,
  processedImageUrl: null,
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
    <p class="notice"><strong>Für beste Ergebnisse:</strong> Bild gerade ausrichten und nur die<br />Vokabel- und Übersetzungsspalten ausschneiden.</p>
    <p class="notice">Datenschutz: Der Screenshot wird mit Tesseract.js ${TESSERACT_VERSION} lokal in deinem Browser verarbeitet. Es findet kein Upload auf einen Server statt und es wird keine externe KI-API genutzt.</p>
    <label for="screenshot" class="upload-area"><span>PNG- oder JPG-Datei auswählen</span><input id="screenshot" type="file" accept="image/png,image/jpeg" /></label>
    <div id="preview">${state.uploadedImageFile ? renderImageWorkspace() : '<p class="empty">Noch kein Screenshot ausgewählt.</p>'}</div>
    ${state.uploadedImageFile ? `<div class="ocr-actions"><button id="recognize-vocabulary" class="button button--primary" ${state.ocrProcessing ? 'disabled' : ''}>${state.ocrProcessing ? 'Erkennung läuft …' : 'Vokabeln erkennen'}</button><div class="progress" aria-label="Fortschritt der Vokabelerkennung"><div style="width: ${state.ocrProgress}%"></div></div><span class="progress-label">${state.ocrProgress} %</span></div>` : ''}
    <p id="ocr-message" class="message" role="status">${escapeHtml(state.ocrMessage)}</p>
    ${state.ocrRows.length ? renderOcrReview() : ''}
  </section>`;
}

function renderImageWorkspace() {
  return `<div class="image-tools">
    <div class="button-row">
      <button type="button" class="button button--small" id="rotate-left">90° links drehen</button>
      <button type="button" class="button button--small" id="rotate-right">90° rechts drehen</button>
      <button type="button" class="button button--small" id="reset-image">Zurücksetzen</button>
    </div>
    <p class="muted">Ziehe mit der Maus oder dem Finger einen Rahmen um die relevanten Vokabel- und Übersetzungsspalten. Dieser Ausschnitt wird für OCR verwendet.</p>
    <div class="canvas-wrap"><canvas id="image-canvas" aria-label="Korrigiertes Bild mit auswählbarem Zuschnitt"></canvas></div>
    ${state.processedImageUrl ? `<details open><summary>Vorverarbeitetes OCR-Bild</summary><img src="${state.processedImageUrl}" alt="Vorverarbeitetes zugeschnittenes OCR-Bild" /></details>` : ''}
  </div>`;
}

function renderOcrReview() {
  const safeRows = state.ocrRows.filter((row) => row.confidence >= 70 && !row.hidden);
  const unsureRows = state.ocrRows.filter((row) => row.confidence < 70 && !row.hidden);
  const rowMarkup = (row) => `<tr class="${row.confidence < 70 ? 'is-unsure' : ''}">
      <td><input type="checkbox" class="ocr-accept" data-ocr-id="${row.id}" ${row.accept ? 'checked' : ''} /></td>
      <td><input class="ocr-foreign" data-ocr-id="${row.id}" value="${escapeHtml(row.foreignWord)}" /></td>
      <td><input class="ocr-german" data-ocr-id="${row.id}" value="${escapeHtml(row.germanTranslation)}" /></td>
      <td><input class="ocr-row-unit" data-ocr-id="${row.id}" value="${escapeHtml(row.unit)}" placeholder="${escapeHtml(state.ocrUnit || 'Unit')}" /></td>
      <td class="${row.confidence < 70 ? 'warning' : 'ok'}">${row.confidence} %</td>
      <td><button class="button button--small button--danger" data-delete-ocr="${row.id}">Löschen</button></td>
    </tr>`;
  return `<div class="ocr-review" aria-labelledby="ocr-review-title">
    <h3 id="ocr-review-title">Erkannte Vokabeln prüfen</h3>
    <p class="muted">OCR-Ergebnisse können fehlerhaft sein. Bitte prüfe und korrigiere die Tabelle, bevor du Einträge übernimmst.</p>
    <div class="review-layout">${state.processedImageUrl ? `<img class="review-image" src="${state.processedImageUrl}" alt="Zugeschnittenes und vorverarbeitetes OCR-Bild" />` : ''}<div>
    <label for="ocr-unit">Unit für erkannte Vokabeln</label>
    <input id="ocr-unit" value="${escapeHtml(state.ocrUnit)}" placeholder="z. B. Unit 3" />
    <div class="button-row review-actions"><button id="add-ocr-row" class="button" type="button">Zeile hinzufügen</button><button id="select-safe-ocr" class="button" type="button">Alle sicheren auswählen</button><button id="hide-unsure-ocr" class="button" type="button">Unsichere Ergebnisse ausblenden</button></div>
    <div class="table-wrap"><table class="review-table"><thead><tr><th>Übernehmen</th><th>Fremdsprachiges Wort</th><th>Deutsche Übersetzung</th><th>Unit</th><th>Konfidenz</th><th></th></tr></thead><tbody>${safeRows.map(rowMarkup).join('')}</tbody></table></div>
    ${unsureRows.length ? `<h4>Nicht sicher erkannt</h4><div class="table-wrap"><table class="review-table"><tbody>${unsureRows.map(rowMarkup).join('')}</tbody></table></div>` : ''}
    <button id="import-ocr" class="button button--primary">Ausgewählte Vokabeln übernehmen</button></div></div>
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
  document.querySelector('#rotate-left')?.addEventListener('click', () => rotateImage(-90));
  document.querySelector('#rotate-right')?.addEventListener('click', () => rotateImage(90));
  document.querySelector('#reset-image')?.addEventListener('click', resetImageEdits);
  bindCanvasCrop();
  document.querySelector('#ocr-unit')?.addEventListener('input', handleOcrUnitInput);
  document.querySelectorAll('.ocr-accept').forEach((input) => input.addEventListener('change', updateOcrRow));
  document.querySelectorAll('.ocr-foreign, .ocr-german, .ocr-row-unit').forEach((input) => input.addEventListener('input', updateOcrRow));
  document.querySelectorAll('[data-delete-ocr]').forEach((button) => button.addEventListener('click', () => { state.ocrRows = state.ocrRows.filter((row) => row.id !== button.dataset.deleteOcr); render(); }));
  document.querySelector('#add-ocr-row')?.addEventListener('click', addOcrRow);
  document.querySelector('#select-safe-ocr')?.addEventListener('click', selectSafeOcrRows);
  document.querySelector('#hide-unsure-ocr')?.addEventListener('click', hideUnsureOcrRows);
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
  loadImageForEditing(file);
}

async function loadImageForEditing(file) {
  state.exifRotation = await readExifRotation(file);
  state.imageRotation = state.exifRotation;
  state.imageBitmap = await createImageBitmap(file, { imageOrientation: 'none' });
  state.crop = null;
  state.cropDraft = null;
  state.processedImageUrl = null;
  render();
}

function readExifRotation(file) {
  return new Promise((resolve) => {
    if (file.type !== 'image/jpeg') return resolve(0);
    const reader = new FileReader();
    reader.onload = () => resolve(getExifRotation(new DataView(reader.result)));
    reader.onerror = () => resolve(0);
    reader.readAsArrayBuffer(file.slice(0, 65536));
  });
}

function getExifRotation(view) {
  if (view.getUint16(0) !== 0xffd8) return 0;
  let offset = 2;
  while (offset < view.byteLength) {
    const marker = view.getUint16(offset); offset += 2;
    const length = view.getUint16(offset); offset += 2;
    if (marker === 0xffe1 && view.getUint32(offset) === 0x45786966) {
      const tiff = offset + 6;
      const little = view.getUint16(tiff) === 0x4949;
      const first = tiff + view.getUint32(tiff + 4, little);
      const count = view.getUint16(first, little);
      for (let i = 0; i < count; i += 1) {
        const entry = first + 2 + i * 12;
        if (view.getUint16(entry, little) === 0x0112) {
          return ({ 3: 180, 6: 90, 8: -90 })[view.getUint16(entry + 8, little)] || 0;
        }
      }
    }
    offset += length - 2;
  }
  return 0;
}

function rotateImage(degrees) { state.imageRotation = (state.imageRotation + degrees + 360) % 360; state.crop = null; state.processedImageUrl = null; render(); }
function resetImageEdits() { state.imageRotation = state.exifRotation; state.crop = null; state.cropDraft = null; state.processedImageUrl = null; render(); }

function drawEditableImage() {
  const canvas = document.querySelector('#image-canvas');
  if (!canvas || !state.imageBitmap) return;
  const { width, height } = getRotatedSize();
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.save(); ctx.translate(width / 2, height / 2); ctx.rotate((state.imageRotation * Math.PI) / 180); ctx.drawImage(state.imageBitmap, -state.imageBitmap.width / 2, -state.imageBitmap.height / 2); ctx.restore();
  const crop = state.cropDraft || state.crop;
  if (crop) { ctx.fillStyle = 'rgba(15,23,42,.35)'; ctx.fillRect(0,0,width,height); ctx.clearRect(crop.x,crop.y,crop.w,crop.h); ctx.strokeStyle = '#2563eb'; ctx.lineWidth = Math.max(4, width / 250); ctx.strokeRect(crop.x,crop.y,crop.w,crop.h); }
}
function getRotatedSize() { const r = Math.abs(state.imageRotation) % 180; return r === 90 ? { width: state.imageBitmap.height, height: state.imageBitmap.width } : { width: state.imageBitmap.width, height: state.imageBitmap.height }; }
function canvasPoint(event, canvas) { const rect = canvas.getBoundingClientRect(); const p = event.touches?.[0] || event; return { x: (p.clientX - rect.left) * canvas.width / rect.width, y: (p.clientY - rect.top) * canvas.height / rect.height }; }
function bindCanvasCrop() { drawEditableImage(); const c=document.querySelector('#image-canvas'); if(!c) return; let start=null; const move=e=>{ if(!start) return; e.preventDefault(); const p=canvasPoint(e,c); state.cropDraft={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(p.x-start.x),h:Math.abs(p.y-start.y)}; drawEditableImage();}; const up=()=>{ if(state.cropDraft?.w>20&&state.cropDraft?.h>20) state.crop=state.cropDraft; state.cropDraft=null; start=null; drawEditableImage();}; c.onmousedown=e=>{start=canvasPoint(e,c);}; c.onmousemove=move; window.onmouseup=up; c.ontouchstart=e=>{start=canvasPoint(e,c);}; c.ontouchmove=move; c.ontouchend=up; }

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
  state.ocrMessage = 'Bild wird zugeschnitten und für OCR vorbereitet …';
  render();
  try {
    const prepared = await prepareImageForOcr();
    state.processedImageUrl = prepared;
    state.ocrMessage = 'OCR wird lokal im Browser gestartet …';
    render();
    const Tesseract = await loadTesseract();
    const result = await Tesseract.recognize(prepared, OCR_LANGUAGES, {
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1',
      logger: ({ status, progress }) => {
        if (typeof progress === 'number') {
          state.ocrProgress = Math.min(100, Math.max(0, Math.round(progress * 100)));
          state.ocrMessage = status ? `OCR: ${status}` : state.ocrMessage;
          render();
        }
      },
    });
    state.ocrRows = parseVocabularyLayout(result.data);
    state.ocrProgress = 100;
    state.ocrMessage = state.ocrRows.length ? `${state.ocrRows.length} mögliche Vokabel(n) erkannt. Sichere Ergebnisse sind vorausgewählt.` : 'Keine eindeutigen Vokabelpaare erkannt. Bitte enger zuschneiden oder Vokabeln manuell eingeben.';
  } catch (error) {
    state.ocrMessage = `Erkennung fehlgeschlagen: ${error.message || 'Unbekannter Fehler'}`;
  } finally {
    state.ocrProcessing = false;
    render();
  }
}

async function prepareImageForOcr() {
  if (!state.imageBitmap) state.imageBitmap = await createImageBitmap(state.uploadedImageFile, { imageOrientation: 'none' });
  const { width, height } = getRotatedSize();
  const source = document.createElement('canvas');
  source.width = width; source.height = height;
  const ctx = source.getContext('2d');
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, width, height);
  ctx.save(); ctx.translate(width / 2, height / 2); ctx.rotate((state.imageRotation * Math.PI) / 180); ctx.drawImage(state.imageBitmap, -state.imageBitmap.width / 2, -state.imageBitmap.height / 2); ctx.restore();
  const crop = state.crop || { x: 0, y: 0, w: width, h: height };
  const scale = Math.max(1.5, Math.min(3, 2200 / Math.max(crop.w, crop.h)));
  const out = document.createElement('canvas'); out.width = Math.round(crop.w * scale); out.height = Math.round(crop.h * scale);
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
  octx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
  correctSmallSkew(out);
  const img = octx.getImageData(0, 0, out.width, out.height);
  const data = img.data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) { const g = 0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]; data[i]=data[i+1]=data[i+2]=g; sum += g; }
  const avg = sum / (data.length / 4);
  for (let i = 0; i < data.length; i += 4) {
    let g = data[i];
    g = (g - avg) * 1.55 + 188; // shadow reduction plus contrast
    g = g > 170 ? 255 : (g < 125 ? 0 : g); // gentle threshold keeps antialiasing
    data[i]=data[i+1]=data[i+2]=Math.max(0, Math.min(255, g));
  }
  octx.putImageData(img, 0, 0);
  octx.filter = 'contrast(115%) brightness(105%)';
  octx.drawImage(out, 0, 0); // light sharpening by contrast after thresholding
  return out.toDataURL('image/png');
}

function correctSmallSkew(canvas) {
  const sample = document.createElement('canvas');
  const maxSide = 700;
  const factor = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  sample.width = Math.max(1, Math.round(canvas.width * factor));
  sample.height = Math.max(1, Math.round(canvas.height * factor));
  const sctx = sample.getContext('2d');
  sctx.drawImage(canvas, 0, 0, sample.width, sample.height);
  const source = sctx.getImageData(0, 0, sample.width, sample.height);
  let best = { angle: 0, score: -Infinity };
  for (let angle = -2; angle <= 2; angle += 0.5) {
    const score = horizontalInkVariance(source, sample.width, sample.height, angle);
    if (score > best.score) best = { angle, score };
  }
  if (Math.abs(best.angle) < 0.5) return;
  const ctx = canvas.getContext('2d');
  const copy = document.createElement('canvas');
  copy.width = canvas.width; copy.height = canvas.height;
  copy.getContext('2d').drawImage(canvas, 0, 0);
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate((-best.angle * Math.PI) / 180); ctx.drawImage(copy, -canvas.width / 2, -canvas.height / 2); ctx.restore();
}

function horizontalInkVariance(image, width, height, angle) {
  const rows = new Float32Array(height);
  const data = image.data;
  const sin = Math.sin((angle * Math.PI) / 180);
  const cos = Math.cos((angle * Math.PI) / 180);
  const cx = width / 2;
  const cy = height / 2;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const ink = 255 - (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      if (ink < 45) continue;
      const yr = Math.round((x - cx) * sin + (y - cy) * cos + cy);
      if (yr >= 0 && yr < height) rows[yr] += ink;
    }
  }
  const mean = rows.reduce((sum, value) => sum + value, 0) / rows.length;
  return rows.reduce((sum, value) => sum + (value - mean) ** 2, 0) / rows.length;
}

function parseVocabularyLayout(data) {
  const words = (data.words || []).map((word) => ({
    text: cleanOcrToken(word.text),
    confidence: Number.isFinite(word.confidence) ? word.confidence : data.confidence || 0,
    bbox: word.bbox || { x0: word.baseline?.x0 || 0, y0: word.baseline?.y0 || 0, x1: word.baseline?.x1 || 0, y1: word.baseline?.y1 || 0 },
  })).filter((word) => word.text && isUsefulToken(word.text));
  const lines = groupWordsIntoLines(words).filter((line) => !isIgnoredLine(line.text));
  if (!lines.length) return [];
  const pageWidth = Math.max(...words.map((w) => w.bbox.x1), 1);
  return lines.map((line) => pairLineColumns(line, pageWidth)).filter(Boolean);
}

function cleanOcrToken(text) { return String(text || '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim(); }
function isUsefulToken(text) { return /[\p{L}]/u.test(text) && !/^\[[^\]]*\]$/.test(text); }
function isIgnoredLine(text) { return /^(unit|check-in|check in|lektion|vocabulary|vokabeln|page|seite|\d+\b)/i.test(text) || /^\W+$/.test(text); }
function stripNoise(text) { return text.replace(/\[[^\]]*\]/g, ' ').replace(/^[\d\W_]+|[\W_]+$/g, '').replace(/\s+/g, ' ').trim(); }
function isValidEntry(text) { const t = stripNoise(text); const letters = (t.match(/[\p{L}]/gu) || []).length; const bad = (t.match(/[^\p{L}\s;,.\-']/gu) || []).length; return letters >= 2 && letters >= bad * 2 && !isIgnoredLine(t); }

function groupWordsIntoLines(words) {
  const sorted = [...words].sort((a, b) => ((a.bbox.y0 + a.bbox.y1) / 2) - ((b.bbox.y0 + b.bbox.y1) / 2));
  const lines = [];
  sorted.forEach((word) => {
    const cy = (word.bbox.y0 + word.bbox.y1) / 2;
    const h = Math.max(8, word.bbox.y1 - word.bbox.y0);
    let line = lines.find((candidate) => Math.abs(candidate.cy - cy) < Math.max(12, h * 0.65));
    if (!line) { line = { words: [], cy }; lines.push(line); }
    line.words.push(word); line.cy = (line.cy * (line.words.length - 1) + cy) / line.words.length;
  });
  return lines.map((line) => { line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0); line.text = line.words.map((w) => w.text).join(' '); return line; });
}

function pairLineColumns(line, pageWidth) {
  const usable = line.words.filter((w) => !/^\[/.test(w.text));
  const gaps = [];
  for (let i = 0; i < usable.length - 1; i += 1) gaps.push({ i, gap: usable[i + 1].bbox.x0 - usable[i].bbox.x1 });
  const big = gaps.filter((g) => g.gap > pageWidth * 0.035).sort((a, b) => b.gap - a.gap);
  const split1 = big[0]?.i ?? Math.max(0, Math.floor(usable.length / 3) - 1);
  const split2 = big.find((g) => g.i > split1 + 0)?.i ?? usable.length - 1; // third/example column ignored
  const foreign = stripNoise(usable.slice(0, split1 + 1).map((w) => w.text).join(' '));
  const german = stripNoise(usable.slice(split1 + 1, split2 + 1).map((w) => w.text).join(' '));
  const confidence = Math.round(Math.min(100, usable.reduce((sum, w) => sum + w.confidence, 0) / Math.max(1, usable.length)));
  if (!isValidEntry(foreign) || !isValidEntry(german) || confidence < 45) return null;
  return { id: crypto.randomUUID(), accept: confidence >= 70, foreignWord: foreign, germanTranslation: german, unit: state.ocrUnit, confidence };
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

function addOcrRow() {
  state.ocrRows = [...state.ocrRows, { id: crypto.randomUUID(), accept: false, foreignWord: '', germanTranslation: '', unit: state.ocrUnit, confidence: 100 }];
  render();
}

function selectSafeOcrRows() {
  state.ocrRows = state.ocrRows.map((row) => ({ ...row, accept: row.confidence >= 70 ? true : row.accept }));
  render();
}

function hideUnsureOcrRows() {
  state.ocrRows = state.ocrRows.map((row) => ({ ...row, hidden: row.confidence < 70 ? true : row.hidden }));
  render();
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
