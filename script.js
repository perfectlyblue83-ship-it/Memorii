'use strict';

// ========== CONSTANTS ==========
const SR_INTERVALS = [0, 1, 3, 7, 14, 28, 30, 60, 90];

// ========== STATE ==========
let state = {
  mode: 'sr',
  year: 2026,
  month: 3,
  selectedDate: null,
  topics: [],
  journalNotes: {},
  hoverDates: [],
  flash: { queue: [], index: 0, answerShown: false, done: false }
};

// ========== STORAGE ==========
function loadData() {
  try {
    const raw = localStorage.getItem('mnemo_v3');
    if (raw) {
      const d = JSON.parse(raw);
      state.topics = Array.isArray(d.topics) ? d.topics : [];
      state.journalNotes = d.journalNotes && typeof d.journalNotes === 'object' ? d.journalNotes : {};
    }
  } catch(e) { state.topics = []; state.journalNotes = {}; }
}

function saveData() {
  try {
    localStorage.setItem('mnemo_v3', JSON.stringify({
      topics: state.topics,
      journalNotes: state.journalNotes
    }));
  } catch(e) {}
}

// ========== DATE UTILS ==========
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseDate(s) {
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d);
}

function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

function displayDate(s) {
  if (!s) return 'Select a date';
  return parseDate(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function shortDate(s) {
  return parseDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysFromToday(s) {
  return Math.round((parseDate(s) - parseDate(todayStr())) / 86400000);
}

// ========== REVIEW CALCULATION ==========
function calcAutoReviews(startDate) {
  const dates = [startDate];
  for (let i = 1; i < SR_INTERVALS.length; i++) {
    dates.push(addDays(dates[dates.length-1], SR_INTERVALS[i]));
  }
  return dates;
}

// ========== RENDER CALENDAR ==========
function buildSRMap() {
  const map = {};
  state.topics.forEach(t => t.reviewDates?.forEach(d => { map[d] = (map[d] || 0) + 1; }));
  return map;
}

function buildJournalMap() {
  const map = {};
  Object.keys(state.journalNotes).forEach(d => { if (state.journalNotes[d]?.trim()) map[d] = true; });
  return map;
}

function renderCalendar() {
  const grid = document.getElementById('calGrid');
  const label = document.getElementById('monthLabel');
  const { year, month } = state;
  label.textContent = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  const srMap = buildSRMap();
  const journalMap = buildJournalMap();
  const today = todayStr();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  
  grid.innerHTML = '';
  
  for (let i = 0; i < 42; i++) {
    let dateStr, dayNum;
    if (i < firstDow) {
      dayNum = daysInPrev - firstDow + i + 1;
      const pm = month === 0 ? 11 : month - 1;
      const py = month === 0 ? year - 1 : year;
      dateStr = fmtDate(new Date(py, pm, dayNum));
    } else if (i >= firstDow + daysInMonth) {
      dayNum = i - firstDow - daysInMonth + 1;
      const nm = month === 11 ? 0 : month + 1;
      const ny = month === 11 ? year + 1 : year;
      dateStr = fmtDate(new Date(ny, nm, dayNum));
    } else {
      dayNum = i - firstDow + 1;
      dateStr = fmtDate(new Date(year, month, dayNum));
    }
    
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (i < firstDow || i >= firstDow + daysInMonth) cell.classList.add('other-month');
    if (dateStr === today) cell.classList.add('today');
    if (dateStr === state.selectedDate) cell.classList.add('selected');
    if (state.hoverDates.includes(dateStr)) cell.classList.add('hover-highlight');
    
    const num = document.createElement('div');
    num.className = 'day-number';
    num.textContent = dayNum;
    cell.appendChild(num);
    
    const indicators = document.createElement('div');
    indicators.className = 'cell-indicators';
    
    if (state.mode === 'sr' && srMap[dateStr]) {
      const dot = document.createElement('div');
      dot.className = 'dot-blue';
      indicators.appendChild(dot);
      if (srMap[dateStr] > 1) {
        const badge = document.createElement('span');
        badge.className = 'badge-number';
        badge.textContent = srMap[dateStr];
        indicators.appendChild(badge);
      }
    }
    if (state.mode === 'journal' && journalMap[dateStr]) {
      const dot = document.createElement('div');
      dot.className = 'dot-green';
      indicators.appendChild(dot);
    }
    if (state.mode === 'flashcard' && srMap[dateStr]) {
      const dot = document.createElement('div');
      dot.className = 'dot-blue';
      indicators.appendChild(dot);
      if (srMap[dateStr] > 1) {
        const badge = document.createElement('span');
        badge.className = 'badge-number';
        badge.textContent = srMap[dateStr];
        indicators.appendChild(badge);
      }
    }
    
    cell.appendChild(indicators);
    cell.addEventListener('click', () => onDateClick(dateStr));
    if (state.mode === 'sr') {
      cell.addEventListener('mouseenter', () => onCellHover(dateStr));
      cell.addEventListener('mouseleave', onCellLeave);
    }
    grid.appendChild(cell);
  }
}

function onDateClick(dateStr) {
  state.selectedDate = dateStr;
  state.hoverDates = [];
  renderCalendar();
  if (state.mode === 'sr') renderSRView();
  else if (state.mode === 'journal') renderJournalView();
  else if (state.mode === 'flashcard') initFlashQueue();
}

function onCellHover(dateStr) {
  const topicsHere = state.topics.filter(t => t.startDate === dateStr);
  if (!topicsHere.length) {
    if (state.hoverDates.length) { state.hoverDates = []; renderCalendar(); }
    return;
  }
  const dates = new Set();
  topicsHere.forEach(t => t.reviewDates?.forEach(d => dates.add(d)));
  state.hoverDates = [...dates];
  renderCalendar();
}

function onCellLeave() {
  if (!state.hoverDates.length) return;
  state.hoverDates = [];
  renderCalendar();
}

// ========== SR VIEW ==========
function renderSRView() {
  const head = document.getElementById('srHead');
  const list = document.getElementById('srTopicList');
  
  if (!state.selectedDate) {
    head.textContent = 'Select a date';
    list.innerHTML = '';
  } else {
    head.textContent = displayDate(state.selectedDate);
    const due = state.topics.filter(t => t.reviewDates?.includes(state.selectedDate));
    list.innerHTML = '';
    if (!due.length) {
      list.innerHTML = '<div class="no-topics">No topics on this date.</div>';
    } else {
      due.forEach(t => list.appendChild(buildTopicCard(t)));
    }
  }
  renderUpcoming();
}

function buildTopicCard(topic) {
  const isOriginal = topic.reviewDates?.[0] === state.selectedDate;
  const revIdx = topic.reviewDates?.indexOf(state.selectedDate) || 0;
  const card = document.createElement('div');
  card.className = 'topic-card';
  card.innerHTML = `
    <div class="topic-header">
      <div class="topic-title">${escapeHtml(topic.title)}</div>
      <div class="topic-actions">
        <button class="edit-btn" data-edit="${topic.id}">✏️ Edit</button>
        <button class="delete-btn" data-del="${topic.id}">🗑️ Delete</button>
      </div>
    </div>
    <div class="topic-meta">
      <span class="topic-badge">${isOriginal ? 'Original' : `Review #${revIdx}`}</span>
      <span class="topic-start">📅 ${shortDate(topic.startDate)}</span>
    </div>
    ${topic.content ? `<div class="topic-details">${escapeHtml(topic.content)}</div>` : ''}
  `;
  card.querySelector('[data-edit]')?.addEventListener('click', () => openEditModal(topic.id));
  card.querySelector('[data-del]')?.addEventListener('click', () => openDeleteModal(topic.id));
  return card;
}

function renderUpcoming() {
  const list = document.getElementById('upcomingList');
  const badge = document.getElementById('upcomingCount');
  const today = todayStr();
  const horizon = addDays(today, 30);
  const items = [];
  state.topics.forEach(t => {
    t.reviewDates?.forEach(d => {
      if (d >= today && d <= horizon) items.push({ date: d, title: t.title });
    });
  });
  items.sort((a,b) => a.date.localeCompare(b.date));
  badge.textContent = items.length;
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<div class="empty-state">No reviews in the next 30 days.</div>';
    return;
  }
  items.forEach(item => {
    const diff = daysFromToday(item.date);
    const dayLabel = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `In ${diff} days`;
    const dayClass = diff === 0 ? 'today' : '';
    const el = document.createElement('div');
    el.className = 'upcoming-item';
    el.innerHTML = `
      <div class="upcoming-date">${shortDate(item.date)}</div>
      <div class="upcoming-days ${dayClass}">${dayLabel}</div>
      <div class="upcoming-title">${escapeHtml(item.title)}</div>
    `;
    el.addEventListener('click', () => jumpToDate(item.date));
    list.appendChild(el);
  });
}

function jumpToDate(dateStr) {
  const d = parseDate(dateStr);
  state.year = d.getFullYear();
  state.month = d.getMonth();
  state.selectedDate = dateStr;
  state.hoverDates = [];
  renderCalendar();
  renderSRView();
}

// ========== JOURNAL VIEW ==========
let journalTimer = null;

function renderJournalView() {
  const head = document.getElementById('journalHead');
  const ta = document.getElementById('journalTA');
  
  if (!state.selectedDate) {
    head.textContent = 'Select a date';
    ta.value = '';
    ta.disabled = true;
    document.getElementById('charCount').textContent = '0';
    document.getElementById('wordCount').textContent = '0';
  } else {
    head.textContent = displayDate(state.selectedDate);
    ta.disabled = false;
    const text = state.journalNotes[state.selectedDate] || '';
    ta.value = text;
    updateJournalStats(text);
  }
}

function updateJournalStats(text) {
  document.getElementById('charCount').textContent = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('wordCount').textContent = words;
}

// ========== FLASHCARD VIEW ==========
function initFlashQueue() {
  if (!state.selectedDate) {
    state.flash = { queue: [], index: 0, answerShown: false, done: false };
  } else {
    const queue = state.topics.filter(t => t.reviewDates?.includes(state.selectedDate));
    state.flash = { queue, index: 0, answerShown: false, done: false };
  }
  renderFlashView();
}

function renderFlashView() {
  const flashDateLabel = document.getElementById('flashDateLabel');
  const flashProgress = document.getElementById('flashProgress');
  const flashEmpty = document.getElementById('flashEmpty');
  const flashNoDate = document.getElementById('flashNoDate');
  const flashCardArea = document.getElementById('flashCardArea');
  const flashComplete = document.getElementById('flashComplete');
  const flashControls = document.getElementById('flashControls');
  const flashQuestion = document.getElementById('flashQuestion');
  const flashAnswer = document.getElementById('flashAnswer');
  const flashAnswerText = document.getElementById('flashAnswerText');
  
  if (flashDateLabel) flashDateLabel.textContent = state.selectedDate ? displayDate(state.selectedDate) : '';
  if (flashProgress) flashProgress.textContent = '';
  
  const hideAll = () => {
    if (flashEmpty) flashEmpty.style.display = 'none';
    if (flashNoDate) flashNoDate.style.display = 'none';
    if (flashCardArea) flashCardArea.style.display = 'none';
    if (flashComplete) flashComplete.style.display = 'none';
    if (flashControls) flashControls.style.display = 'none';
  };
  hideAll();
  
  if (!state.selectedDate) {
    if (flashNoDate) flashNoDate.style.display = 'block';
    return;
  }
  
  const { queue, index, answerShown, done } = state.flash;
  
  if (!queue.length) {
    if (flashEmpty) flashEmpty.style.display = 'block';
    return;
  }
  
  if (done) {
    if (flashComplete) flashComplete.style.display = 'block';
    if (flashProgress) flashProgress.textContent = `${queue.length} / ${queue.length} reviewed`;
    return;
  }
  
  if (flashProgress) flashProgress.textContent = `Card ${index + 1} of ${queue.length}`;
  if (flashCardArea) flashCardArea.style.display = 'block';
  if (flashControls) flashControls.style.display = 'flex';
  
  const topic = queue[index];
  if (flashQuestion) flashQuestion.textContent = topic.title;
  
  if (answerShown) {
    if (flashAnswer) flashAnswer.classList.remove('hidden');
    const content = topic.content?.trim();
    if (flashAnswerText) flashAnswerText.textContent = content || '— No additional details —';
    const showBtn = document.getElementById('showAnswerBtn');
    if (showBtn) { showBtn.disabled = true; showBtn.style.opacity = '0.5'; }
  } else {
    if (flashAnswer) flashAnswer.classList.add('hidden');
    const showBtn = document.getElementById('showAnswerBtn');
    if (showBtn) { showBtn.disabled = false; showBtn.style.opacity = ''; }
  }
}

let nextDebounce = false;

function flashShowAnswer() {
  state.flash.answerShown = true;
  renderFlashView();
}

function flashNextCard() {
  if (nextDebounce) return;
  nextDebounce = true;
  setTimeout(() => { nextDebounce = false; }, 300);
  
  const { queue, index } = state.flash;
  if (index + 1 >= queue.length) {
    state.flash.done = true;
    state.flash.answerShown = false;
  } else {
    state.flash.index = index + 1;
    state.flash.answerShown = false;
  }
  renderFlashView();
}

function flashReviewAgain() {
  if (!state.selectedDate) return;
  const queue = state.topics.filter(t => t.reviewDates?.includes(state.selectedDate));
  state.flash = { queue, index: 0, answerShown: false, done: false };
  renderFlashView();
}

// ========== MODE SWITCHING ==========
function switchMode(mode) {
  state.mode = mode;
  state.hoverDates = [];
  
  document.querySelectorAll('.menu-item[data-mode]').forEach(el => {
    if (el.dataset.mode === mode) el.classList.add('active');
    else el.classList.remove('active');
  });
  
  document.getElementById('viewSR').classList.toggle('hidden', mode !== 'sr');
  document.getElementById('viewJournal').classList.toggle('hidden', mode !== 'journal');
  document.getElementById('viewFlash').classList.toggle('hidden', mode !== 'flashcard');
  
  const calSection = document.getElementById('calSection');
  if (mode === 'flashcard') {
    calSection.style.display = 'none';
  } else {
    calSection.style.display = 'block';
  }
  
  renderCalendar();
  
  if (mode === 'sr') renderSRView();
  else if (mode === 'journal') renderJournalView();
  else if (mode === 'flashcard') initFlashQueue();
}

// ========== TOPIC MODAL ==========
let manualDates = [];
let editingId = null;

function openAddModal() {
  editingId = null;
  manualDates = [];
  document.getElementById('topicModalTitle').textContent = 'Add Topic';
  document.getElementById('editId').value = '';
  document.getElementById('fTitle').value = '';
  document.getElementById('fContent').value = '';
  document.getElementById('fDate').value = state.selectedDate || todayStr();
  setModalMode('auto');
  updateSchedPreview();
  openModal('topicModalBack');
}

function openEditModal(id) {
  const topic = state.topics.find(t => t.id === id);
  if (!topic) return;
  editingId = id;
  manualDates = topic.mode === 'manual' && topic.reviewDates ? [...topic.reviewDates] : [];
  document.getElementById('topicModalTitle').textContent = 'Edit Topic';
  document.getElementById('editId').value = id;
  document.getElementById('fTitle').value = topic.title;
  document.getElementById('fContent').value = topic.content || '';
  document.getElementById('fDate').value = topic.startDate;
  setModalMode(topic.mode);
  updateSchedPreview();
  openModal('topicModalBack');
}

function getModalMode() {
  const autoBtn = document.getElementById('mAutoBtn');
  return autoBtn?.classList.contains('active') ? 'auto' : 'manual';
}

function setModalMode(mode) {
  const autoBtn = document.getElementById('mAutoBtn');
  const manualBtn = document.getElementById('mManualBtn');
  const manualSection = document.getElementById('manualSection');
  if (autoBtn) autoBtn.classList.toggle('active', mode === 'auto');
  if (manualBtn) manualBtn.classList.toggle('active', mode === 'manual');
  if (manualSection) manualSection.style.display = mode === 'manual' ? 'block' : 'none';
}

function updateSchedPreview() {
  const p = document.getElementById('schedPreview');
  if (!p) return;
  if (getModalMode() !== 'manual') { p.textContent = ''; return; }
  if (!manualDates.length) {
    const s = document.getElementById('fDate')?.value;
    p.textContent = s ? `Schedule: ${s}` : 'Set a start date first.';
    return;
  }
  p.textContent = 'Schedule: ' + manualDates.join(' → ');
}

function saveTopic() {
  const title = document.getElementById('fTitle')?.value.trim();
  const content = document.getElementById('fContent')?.value.trim();
  const startDate = document.getElementById('fDate')?.value;
  const mode = getModalMode();
  
  if (!title) { alert('Please enter a topic title.'); return; }
  if (!startDate) { alert('Please enter a start date.'); return; }
  
  let reviewDates;
  if (mode === 'auto') {
    reviewDates = calcAutoReviews(startDate);
  } else {
    if (!manualDates.length) manualDates = [startDate];
    reviewDates = manualDates[0] === startDate ? manualDates : [startDate, ...manualDates.slice(1)];
  }
  
  if (editingId !== null) {
    const i = state.topics.findIndex(t => t.id === editingId);
    if (i !== -1) state.topics[i] = { ...state.topics[i], title, content, startDate, mode, reviewDates };
  } else {
    state.topics.push({ id: Date.now(), title, content, startDate, mode, reviewDates });
  }
  
  saveData();
  closeModal('topicModalBack');
  renderCalendar();
  if (state.mode === 'sr') renderSRView();
  else if (state.mode === 'flashcard') initFlashQueue();
}

// ========== DELETE MODAL ==========
let pendingDeleteId = null;

function openDeleteModal(id) {
  pendingDeleteId = id;
  openModal('deleteModalBack');
}

function confirmDelete() {
  if (pendingDeleteId === null) return;
  state.topics = state.topics.filter(t => t.id !== pendingDeleteId);
  pendingDeleteId = null;
  saveData();
  closeModal('deleteModalBack');
  renderCalendar();
  if (state.mode === 'sr') renderSRView();
  else if (state.mode === 'flashcard') initFlashQueue();
}

// ========== MODAL HELPERS ==========
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

// ========== MENU ==========
function openMenu() {
  document.getElementById('sideMenu')?.classList.add('open');
  document.getElementById('menuOverlay')?.classList.add('active');
}

function closeMenu() {
  document.getElementById('sideMenu')?.classList.remove('open');
  document.getElementById('menuOverlay')?.classList.remove('active');
}

// ========== THEME MANAGEMENT (with custom modal - NO ALERTS) ==========
let pendingTheme = null;

function loadTheme() {
  const savedTheme = localStorage.getItem('mnemo_theme') || 'parchment';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateActiveThemeButton(savedTheme);
}

function openThemeConfirmModal(themeName) {
  pendingTheme = themeName;
  
  const themeNames = {
    'highcontrast': 'High Contrast / Minimal',
    'forest': 'Forest / Muted Green',
    'darkink': 'Dark Ink',
    'parchment': 'Parchment / Light',
    'magenta': 'Magenta Dark Pink'
  };
  
  const confirmText = document.getElementById('themeConfirmText');
  if (confirmText) {
    confirmText.textContent = `Switch to ${themeNames[themeName]} theme?`;
  }
  
  openModal('themeConfirmModal');
}

function applyTheme() {
  if (pendingTheme) {
    document.documentElement.setAttribute('data-theme', pendingTheme);
    localStorage.setItem('mnemo_theme', pendingTheme);
    updateActiveThemeButton(pendingTheme);
    pendingTheme = null;
    closeModal('themeConfirmModal');
  }
}

function cancelTheme() {
  pendingTheme = null;
  closeModal('themeConfirmModal');
}

function updateActiveThemeButton(activeTheme) {
  const themeButtons = document.querySelectorAll('.sidemenu-body .menu-item[data-theme]');
  themeButtons.forEach(btn => {
    if (btn.dataset.theme === activeTheme) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// ========== HELPERS ==========
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ========== INIT ==========
function init() {
  loadData();
  loadTheme();
  
  const now = new Date();
  state.year = now.getFullYear();
  state.month = now.getMonth();
  state.selectedDate = todayStr();
  
  // Setup event listeners
  document.getElementById('prevMonth')?.addEventListener('click', () => {
    if (state.month === 0) { state.month = 11; state.year--; }
    else state.month--;
    renderCalendar();
  });
  
  document.getElementById('nextMonth')?.addEventListener('click', () => {
    if (state.month === 11) { state.month = 0; state.year++; }
    else state.month++;
    renderCalendar();
  });
  
  document.getElementById('todayBtn')?.addEventListener('click', () => {
    const now = new Date();
    state.year = now.getFullYear();
    state.month = now.getMonth();
    state.selectedDate = todayStr();
    renderCalendar();
    if (state.mode === 'sr') renderSRView();
    else if (state.mode === 'journal') renderJournalView();
    else if (state.mode === 'flashcard') initFlashQueue();
  });
  
  document.getElementById('hamburgerBtn')?.addEventListener('click', openMenu);
  document.getElementById('menuClose')?.addEventListener('click', closeMenu);
  document.getElementById('menuOverlay')?.addEventListener('click', closeMenu);
  
  document.querySelectorAll('.menu-item[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => { switchMode(btn.dataset.mode); closeMenu(); });
  });
  
  // Theme button listeners - open custom modal (NO ALERT)
  const themeButtons = document.querySelectorAll('.sidemenu-body .menu-item[data-theme]');
  themeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'parchment';
      if (currentTheme !== btn.dataset.theme) {
        openThemeConfirmModal(btn.dataset.theme);
      }
      closeMenu();
    });
  });
  
  // Theme modal event listeners
  document.getElementById('themeModalClose')?.addEventListener('click', cancelTheme);
  document.getElementById('cancelThemeBtn')?.addEventListener('click', cancelTheme);
  document.getElementById('confirmThemeBtn')?.addEventListener('click', applyTheme);
  document.getElementById('themeConfirmModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) cancelTheme();
  });
  
  document.getElementById('addTopicBtn')?.addEventListener('click', openAddModal);
  document.getElementById('topicModalClose')?.addEventListener('click', () => closeModal('topicModalBack'));
  document.getElementById('cancelTopicBtn')?.addEventListener('click', () => closeModal('topicModalBack'));
  document.getElementById('saveTopicBtn')?.addEventListener('click', saveTopic);
  
  document.getElementById('mAutoBtn')?.addEventListener('click', () => { setModalMode('auto'); updateSchedPreview(); });
  document.getElementById('mManualBtn')?.addEventListener('click', () => {
    const s = document.getElementById('fDate')?.value;
    if (s && !manualDates.length) manualDates = [s];
    setModalMode('manual');
    updateSchedPreview();
  });
  
  document.getElementById('fDate')?.addEventListener('change', () => {
    if (getModalMode() === 'manual') {
      const s = document.getElementById('fDate')?.value;
      manualDates = s ? [s] : [];
      updateSchedPreview();
    }
  });
  
  document.getElementById('mSaveBtn')?.addEventListener('click', () => {
    const days = parseInt(document.getElementById('fDays')?.value, 10);
    if (isNaN(days) || days < 1) { alert('Enter a positive number of days.'); return; }
    const start = document.getElementById('fDate')?.value;
    if (!start) { alert('Please set a start date first.'); return; }
    if (!manualDates.length) manualDates = [start];
    manualDates = [manualDates[0], addDays(start, days)];
    document.getElementById('fDays').value = '';
    updateSchedPreview();
  });
  
  document.getElementById('mNextBtn')?.addEventListener('click', () => {
    const days = parseInt(document.getElementById('fDays')?.value, 10);
    if (isNaN(days) || days < 1) { alert('Enter a positive number of days.'); return; }
    const start = document.getElementById('fDate')?.value;
    if (!start) { alert('Please set a start date first.'); return; }
    if (!manualDates.length) manualDates = [start];
    manualDates.push(addDays(manualDates[manualDates.length-1], days));
    document.getElementById('fDays').value = '';
    updateSchedPreview();
  });
  
  document.getElementById('deleteModalClose')?.addEventListener('click', () => closeModal('deleteModalBack'));
  document.getElementById('cancelDeleteBtn')?.addEventListener('click', () => closeModal('deleteModalBack'));
  document.getElementById('confirmDeleteBtn')?.addEventListener('click', confirmDelete);
  
  document.getElementById('journalTA')?.addEventListener('input', () => {
    const text = document.getElementById('journalTA').value;
    updateJournalStats(text);
    clearTimeout(journalTimer);
    journalTimer = setTimeout(() => {
      if (state.selectedDate) {
        state.journalNotes[state.selectedDate] = text;
        saveData();
        renderCalendar();
      }
    }, 1000);
  });
  
  document.getElementById('showAnswerBtn')?.addEventListener('click', flashShowAnswer);
  document.getElementById('nextCardBtn')?.addEventListener('click', flashNextCard);
  document.getElementById('reviewAgainBtn')?.addEventListener('click', flashReviewAgain);
  
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal('topicModalBack');
      closeModal('deleteModalBack');
      closeModal('themeConfirmModal');
      closeMenu();
    }
  });
  
  renderCalendar();
  switchMode('sr');
}

document.addEventListener('DOMContentLoaded', init);
