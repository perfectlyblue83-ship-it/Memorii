'use strict';

// ===================================================
// DATA & STATE
// ===================================================

const SR_INTERVALS = [0, 1, 3, 7, 14, 28, 30, 60, 90];

let state = {
  mode: 'sr',
  currentYear: 0,
  currentMonth: 0,
  selectedDate: null,
  topics: [],
  journalNotes: {},
  hoverReviewDates: [],
};

// ===================================================
// LOCAL STORAGE
// ===================================================

function loadData() {
  try {
    const raw = localStorage.getItem('mnemo_data');
    if (raw) {
      const parsed = JSON.parse(raw);
      state.topics = parsed.topics || [];
      state.journalNotes = parsed.journalNotes || {};
    }
  } catch (e) {
    console.error('Failed to load data', e);
    state.topics = [];
    state.journalNotes = {};
  }
}

function saveData() {
  try {
    const payload = { topics: state.topics, journalNotes: state.journalNotes };
    localStorage.setItem('mnemo_data', JSON.stringify(payload));
  } catch (e) {
    console.error('Failed to save data', e);
  }
}

// ===================================================
// DATE UTILITIES
// ===================================================

function todayStr() {
  return formatDate(new Date());
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

function displayDate(str) {
  const d = parseDate(str);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function shortDate(str) {
  const d = parseDate(str);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysFromToday(str) {
  const today = parseDate(todayStr());
  const target = parseDate(str);
  return Math.round((target - today) / 86400000);
}

// ===================================================
// REVIEW DATE CALCULATION
// ===================================================

function calcAutoReviewDates(startDate) {
  const dates = [startDate];
  for (let i = 1; i < SR_INTERVALS.length; i++) {
    dates.push(addDays(dates[dates.length - 1], SR_INTERVALS[i]));
  }
  return dates;
}

// ===================================================
// CALENDAR RENDERING
// ===================================================

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const title = document.getElementById('monthTitle');

  const year = state.currentYear;
  const month = state.currentMonth;

  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  title.textContent = monthName;

  const srMap = buildSRIndicatorMap();
  const journalMap = buildJournalIndicatorMap();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const today = todayStr();
  grid.innerHTML = '';

  for (let i = 0; i < 42; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell';

    let dateStr, dayNum, isCurrentMonth;

    if (i < firstDay) {
      dayNum = daysInPrev - firstDay + i + 1;
      const pm = month === 0 ? 11 : month - 1;
      const py = month === 0 ? year - 1 : year;
      dateStr = formatDate(new Date(py, pm, dayNum));
      isCurrentMonth = false;
      cell.classList.add('other-month');
    } else if (i >= firstDay + daysInMonth) {
      dayNum = i - firstDay - daysInMonth + 1;
      const nm = month === 11 ? 0 : month + 1;
      const ny = month === 11 ? year + 1 : year;
      dateStr = formatDate(new Date(ny, nm, dayNum));
      isCurrentMonth = false;
      cell.classList.add('other-month');
    } else {
      dayNum = i - firstDay + 1;
      dateStr = formatDate(new Date(year, month, dayNum));
      isCurrentMonth = true;
    }

    cell.dataset.date = dateStr;

    const dayEl = document.createElement('div');
    dayEl.className = 'cell-day';
    dayEl.textContent = dayNum;
    cell.appendChild(dayEl);

    if (dateStr === today) cell.classList.add('today');
    if (dateStr === state.selectedDate) cell.classList.add('selected');

    if (state.hoverReviewDates.includes(dateStr)) {
      cell.classList.add('review-highlight');
      const tooltip = document.createElement('div');
      tooltip.className = 'cell-tooltip visible';
      const idx = state.hoverReviewDates.indexOf(dateStr);
      tooltip.textContent = idx === 0 ? 'Start' : `Review ${idx}`;
      cell.appendChild(tooltip);
    }

    const dots = document.createElement('div');
    dots.className = 'cell-dots';

    if (state.mode === 'sr' && srMap[dateStr] !== undefined) {
      const badge = document.createElement('span');
      badge.className = 'cell-badge blue';
      badge.textContent = srMap[dateStr];
      dots.appendChild(badge);
    }
    if (state.mode === 'journal' && journalMap[dateStr]) {
      const dot = document.createElement('div');
      dot.className = 'cell-dot green';
      dots.appendChild(dot);
    }
    cell.appendChild(dots);

    cell.addEventListener('click', () => onDateClick(dateStr));
    if (state.mode === 'sr') {
      cell.addEventListener('mouseenter', () => onDateHover(dateStr));
      cell.addEventListener('mouseleave', onDateLeave);
    }

    grid.appendChild(cell);
  }
}

function buildSRIndicatorMap() {
  const map = {};
  state.topics.forEach(topic => {
    topic.reviewDates.forEach(d => {
      map[d] = (map[d] || 0) + 1;
    });
  });
  return map;
}

function buildJournalIndicatorMap() {
  const map = {};
  Object.keys(state.journalNotes).forEach(d => {
    if (state.journalNotes[d] && state.journalNotes[d].trim()) map[d] = true;
  });
  return map;
}

// ===================================================
// DATE CLICK / HOVER
// ===================================================

function onDateClick(dateStr) {
  state.selectedDate = dateStr;
  state.hoverReviewDates = [];
  renderCalendar();
  renderPanel();
}

function onDateHover(dateStr) {
  const topicsStartingHere = state.topics.filter(t => t.startDate === dateStr);
  if (topicsStartingHere.length === 0) {
    if (state.hoverReviewDates.length > 0) {
      state.hoverReviewDates = [];
      renderCalendar();
    }
    return;
  }
  const dates = new Set();
  topicsStartingHere.forEach(t => t.reviewDates.forEach(d => dates.add(d)));
  state.hoverReviewDates = [...dates];
  renderCalendar();
}

function onDateLeave() {
  state.hoverReviewDates = [];
  renderCalendar();
}

// ===================================================
// PANEL RENDERING
// ===================================================

function renderPanel() {
  if (state.mode === 'sr') renderSRPanel();
  else renderJournalPanel();
}

// --- SR Panel ---

function renderSRPanel() {
  const header = document.getElementById('srDateHeader');
  const list = document.getElementById('topicsList');
  const addBtn = document.getElementById('addTopicBtn');

  if (!state.selectedDate) {
    header.textContent = 'Select a date';
    list.innerHTML = '';
    addBtn.style.display = 'none';
  } else {
    header.textContent = displayDate(state.selectedDate);
    addBtn.style.display = 'block';

    const dueTopics = state.topics.filter(t => t.reviewDates.includes(state.selectedDate));

    list.innerHTML = '';
    if (dueTopics.length === 0) {
      list.innerHTML = '<p class="no-topics">No topics on this date.</p>';
    } else {
      dueTopics.forEach(topic => {
        list.appendChild(buildTopicCard(topic));
      });
    }
  }

  renderUpcoming();
}

function buildTopicCard(topic) {
  const card = document.createElement('div');
  card.className = 'topic-card';

  const isOriginal = topic.reviewDates[0] === state.selectedDate;
  const reviewIdx = topic.reviewDates.indexOf(state.selectedDate);

  card.innerHTML = `
    <div class="topic-card-header">
      <div class="topic-title">${escHtml(topic.title)}</div>
      <div class="topic-actions">
        <button class="btn-icon-sm" title="Edit" data-edit="${topic.id}">✏️</button>
        <button class="btn-icon-sm danger" title="Delete" data-delete="${topic.id}">🗑️</button>
      </div>
    </div>
    <div class="topic-meta">
      <span class="topic-badge ${isOriginal ? 'original' : 'review'}">${isOriginal ? 'Original' : `Review ${reviewIdx}`}</span>
      <span class="topic-badge ${topic.mode}">${topic.mode === 'auto' ? '⚡ Auto' : '✍️ Manual'}</span>
      <span class="topic-start">Started ${shortDate(topic.startDate)}</span>
    </div>
    ${topic.content ? `<div class="topic-content">${escHtml(topic.content)}</div>` : ''}
  `;

  card.querySelector('[data-edit]').addEventListener('click', () => openEditModal(topic.id));
  card.querySelector('[data-delete]').addEventListener('click', () => openDeleteModal(topic.id));

  return card;
}

function renderUpcoming() {
  const list = document.getElementById('upcomingList');
  const count = document.getElementById('upcomingCount');
  const today = todayStr();
  const horizon = addDays(today, 30);

  const upcoming = [];
  state.topics.forEach(topic => {
    topic.reviewDates.forEach(d => {
      if (d >= today && d <= horizon) {
        upcoming.push({ date: d, title: topic.title, topicId: topic.id });
      }
    });
  });
  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  count.textContent = upcoming.length;
  list.innerHTML = '';

  if (upcoming.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">🗓️</span>
        <p class="empty-state-text">No reviews in the next 30 days.<br/>Add a topic to get started.</p>
      </div>`;
    return;
  }

  upcoming.forEach(item => {
    const diff = daysFromToday(item.date);
    let dayLabel, dayClass;
    if (diff === 0) { dayLabel = 'Today'; dayClass = 'today'; }
    else if (diff === 1) { dayLabel = 'Tomorrow'; dayClass = 'soon'; }
    else { dayLabel = `In ${diff} days`; dayClass = ''; }

    const el = document.createElement('div');
    el.className = 'upcoming-item';
    el.innerHTML = `
      <div class="upcoming-date-col">
        <div class="upcoming-date">${shortDate(item.date)}</div>
        <div class="upcoming-days ${dayClass}">${dayLabel}</div>
      </div>
      <div class="upcoming-divider"></div>
      <div class="upcoming-title">${escHtml(item.title)}</div>
    `;
    el.addEventListener('click', () => jumpToDate(item.date));
    list.appendChild(el);
  });
}

function jumpToDate(dateStr) {
  const d = parseDate(dateStr);
  state.currentYear = d.getFullYear();
  state.currentMonth = d.getMonth();
  state.selectedDate = dateStr;
  state.hoverReviewDates = [];
  renderCalendar();
  renderPanel();
}

// --- Journal Panel ---

let journalSaveTimer = null;

function renderJournalPanel() {
  const header = document.getElementById('journalDateHeader');
  const editor = document.getElementById('journalEditor');
  const emptyState = document.getElementById('journalEmptyState');

  if (!state.selectedDate) {
    header.textContent = 'Select a date';
    editor.style.display = 'none';
    emptyState.style.display = 'flex';
  } else {
    header.textContent = displayDate(state.selectedDate);
    emptyState.style.display = 'none';
    editor.style.display = 'block';

    const text = state.journalNotes[state.selectedDate] || '';
    const textarea = document.getElementById('journalTextarea');
    textarea.value = text;
    updateJournalStats(text);

    // Reset autosave indicator
    const autosave = document.getElementById('journalAutosave');
    autosave.textContent = '✓ Saved';
    autosave.className = 'journal-autosave';
  }
}

function updateJournalStats(text) {
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('charCount').textContent = chars;
  document.getElementById('wordCount').textContent = words;
}

// ===================================================
// MODAL: ADD / EDIT TOPIC
// ===================================================

let modalManualDates = [];
let modalEditId = null;

function openAddModal() {
  modalEditId = null;
  modalManualDates = [];
  document.getElementById('modalTitle').textContent = 'Add Topic';
  document.getElementById('editTopicId').value = '';
  document.getElementById('topicTitle').value = '';
  document.getElementById('topicContent').value = '';
  document.getElementById('topicStartDate').value = state.selectedDate || todayStr();
  setModalMode('auto');
  updateSchedulePreview();
  openModal('topicModalBackdrop');
}

function openEditModal(id) {
  const topic = state.topics.find(t => t.id === id);
  if (!topic) return;
  modalEditId = id;
  modalManualDates = topic.mode === 'manual' ? [...topic.reviewDates] : [];
  document.getElementById('modalTitle').textContent = 'Edit Topic';
  document.getElementById('editTopicId').value = id;
  document.getElementById('topicTitle').value = topic.title;
  document.getElementById('topicContent').value = topic.content || '';
  document.getElementById('topicStartDate').value = topic.startDate;
  setModalMode(topic.mode);
  updateSchedulePreview();
  openModal('topicModalBackdrop');
}

function setModalMode(mode) {
  document.getElementById('modeAutoBtn').classList.toggle('active', mode === 'auto');
  document.getElementById('modeManualBtn').classList.toggle('active', mode === 'manual');
  document.getElementById('manualSection').classList.toggle('hidden', mode !== 'manual');
  document.getElementById('manualDays').value = '';
}

function getModalMode() {
  return document.getElementById('modeAutoBtn').classList.contains('active') ? 'auto' : 'manual';
}

function updateSchedulePreview() {
  const preview = document.getElementById('schedulePreview');
  if (getModalMode() !== 'manual') { preview.textContent = ''; return; }
  if (modalManualDates.length === 0) {
    const start = document.getElementById('topicStartDate').value;
    if (start) preview.textContent = `Schedule: ${start}`;
    else preview.textContent = 'Set a start date first.';
    return;
  }
  preview.textContent = 'Schedule: ' + modalManualDates.join(' → ');
}

function saveTopic() {
  const title = document.getElementById('topicTitle').value.trim();
  const content = document.getElementById('topicContent').value.trim();
  const startDate = document.getElementById('topicStartDate').value;
  const mode = getModalMode();

  if (!title) { alert('Please enter a topic title.'); return; }
  if (!startDate) { alert('Please enter a start date.'); return; }

  let reviewDates;
  if (mode === 'auto') {
    reviewDates = calcAutoReviewDates(startDate);
  } else {
    if (modalManualDates.length === 0) {
      reviewDates = [startDate];
    } else {
      reviewDates = modalManualDates[0] === startDate ? modalManualDates : [startDate, ...modalManualDates.slice(1)];
    }
  }

  if (modalEditId !== null) {
    const idx = state.topics.findIndex(t => t.id === modalEditId);
    if (idx !== -1) {
      state.topics[idx] = { ...state.topics[idx], title, content, startDate, mode, reviewDates };
    }
  } else {
    state.topics.push({ id: Date.now(), title, content, startDate, mode, reviewDates });
  }

  saveData();
  closeModal('topicModalBackdrop');
  renderCalendar();
  renderSRPanel();
}

// ===================================================
// MODAL: DELETE
// ===================================================

let pendingDeleteId = null;

function openDeleteModal(id) {
  pendingDeleteId = id;
  openModal('deleteModalBackdrop');
}

function confirmDelete() {
  if (pendingDeleteId === null) return;
  state.topics = state.topics.filter(t => t.id !== pendingDeleteId);
  pendingDeleteId = null;
  saveData();
  closeModal('deleteModalBackdrop');
  renderCalendar();
  renderSRPanel();
}

// ===================================================
// MODAL HELPERS
// ===================================================

function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

// ===================================================
// EXPORT / IMPORT
// ===================================================

function exportData() {
  const payload = { topics: state.topics, journalNotes: state.journalNotes };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mnemo-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      state.topics = parsed.topics || [];
      state.journalNotes = parsed.journalNotes || {};
      saveData();
      renderCalendar();
      renderPanel();
      alert('Data imported successfully!');
    } catch {
      alert('Invalid JSON file. Please select a valid backup.');
    }
  };
  reader.readAsText(file);
}

// ===================================================
// ESCAPE HTML
// ===================================================

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===================================================
// MODE SWITCHING — complete separation
// ===================================================

function switchMode(mode) {
  state.mode = mode;

  // Update menu items
  document.querySelectorAll('.menu-item').forEach(el => {
    el.classList.toggle('active', el.dataset.mode === mode);
  });

  // Show/hide panels — complete separation, no tabs
  document.getElementById('panelSR').classList.toggle('hidden', mode !== 'sr');
  document.getElementById('panelJournal').classList.toggle('hidden', mode !== 'journal');

  // Update mode label in topbar
  const label = document.getElementById('modeLabel');
  label.textContent = mode === 'sr' ? '🔄 Spaced Repetition' : '📔 Journal';

  renderCalendar();
  renderPanel();
}

// ===================================================
// INIT & EVENT LISTENERS
// ===================================================

function init() {
  loadData();

  const now = new Date();
  state.currentYear = now.getFullYear();
  state.currentMonth = now.getMonth();
  state.selectedDate = todayStr();

  setupEventListeners();
  renderCalendar();
  renderPanel();
}

function setupEventListeners() {

  // --- Nav ---
  document.getElementById('prevMonth').addEventListener('click', () => {
    if (state.currentMonth === 0) { state.currentMonth = 11; state.currentYear--; }
    else state.currentMonth--;
    state.hoverReviewDates = [];
    renderCalendar();
  });

  document.getElementById('nextMonth').addEventListener('click', () => {
    if (state.currentMonth === 11) { state.currentMonth = 0; state.currentYear++; }
    else state.currentMonth++;
    state.hoverReviewDates = [];
    renderCalendar();
  });

  document.getElementById('todayBtn').addEventListener('click', () => {
    const now = new Date();
    state.currentYear = now.getFullYear();
    state.currentMonth = now.getMonth();
    state.selectedDate = todayStr();
    state.hoverReviewDates = [];
    renderCalendar();
    renderPanel();
  });

  // --- Hamburger / Side menu ---
  document.getElementById('hamburgerBtn').addEventListener('click', () => {
    document.getElementById('sideMenu').classList.add('open');
    document.getElementById('menuOverlay').classList.add('active');
  });

  function closeMenu() {
    document.getElementById('sideMenu').classList.remove('open');
    document.getElementById('menuOverlay').classList.remove('active');
  }

  document.getElementById('menuClose').addEventListener('click', closeMenu);
  document.getElementById('menuOverlay').addEventListener('click', closeMenu);

  document.querySelectorAll('.menu-item').forEach(btn => {
    btn.addEventListener('click', () => {
      switchMode(btn.dataset.mode);
      closeMenu();
    });
  });

  // --- Add Topic ---
  document.getElementById('addTopicBtn').addEventListener('click', openAddModal);

  // --- Modal controls ---
  document.getElementById('modalClose').addEventListener('click', () => closeModal('topicModalBackdrop'));
  document.getElementById('cancelTopicBtn').addEventListener('click', () => closeModal('topicModalBackdrop'));
  document.getElementById('topicModalBackdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('topicModalBackdrop');
  });

  document.getElementById('saveTopicBtn').addEventListener('click', saveTopic);

  document.getElementById('modeAutoBtn').addEventListener('click', () => {
    setModalMode('auto');
    updateSchedulePreview();
  });
  document.getElementById('modeManualBtn').addEventListener('click', () => {
    const start = document.getElementById('topicStartDate').value;
    if (start && modalManualDates.length === 0) modalManualDates = [start];
    setModalMode('manual');
    updateSchedulePreview();
  });

  document.getElementById('topicStartDate').addEventListener('change', () => {
    if (getModalMode() === 'manual') {
      const start = document.getElementById('topicStartDate').value;
      modalManualDates = start ? [start] : [];
    }
    updateSchedulePreview();
  });

  document.getElementById('manualSaveBtn').addEventListener('click', () => {
    const days = parseInt(document.getElementById('manualDays').value, 10);
    if (isNaN(days) || days < 1) { alert('Enter a positive number of days.'); return; }
    const startDate = document.getElementById('topicStartDate').value;
    if (!startDate) { alert('Please set a start date first.'); return; }
    const newDate = addDays(startDate, days);
    if (modalManualDates.length === 0) modalManualDates = [startDate];
    if (modalManualDates.length > 1) {
      modalManualDates = [modalManualDates[0], newDate];
    } else {
      modalManualDates = [modalManualDates[0], newDate];
    }
    document.getElementById('manualDays').value = '';
    updateSchedulePreview();
  });

  document.getElementById('manualNextBtn').addEventListener('click', () => {
    const days = parseInt(document.getElementById('manualDays').value, 10);
    if (isNaN(days) || days < 1) { alert('Enter a positive number of days.'); return; }
    const startDate = document.getElementById('topicStartDate').value;
    if (!startDate) { alert('Please set a start date first.'); return; }
    if (modalManualDates.length === 0) modalManualDates = [startDate];
    const last = modalManualDates[modalManualDates.length - 1];
    modalManualDates.push(addDays(last, days));
    document.getElementById('manualDays').value = '';
    updateSchedulePreview();
  });

  // --- Delete modal ---
  document.getElementById('deleteModalClose').addEventListener('click', () => closeModal('deleteModalBackdrop'));
  document.getElementById('cancelDeleteBtn').addEventListener('click', () => closeModal('deleteModalBackdrop'));
  document.getElementById('deleteModalBackdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('deleteModalBackdrop');
  });
  document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);

  // --- Export / Import ---
  document.getElementById('exportBtn').addEventListener('click', exportData);

  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').value = '';
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) importData(file);
  });

  // --- Journal textarea autosave ---
  document.getElementById('journalTextarea').addEventListener('input', () => {
    const text = document.getElementById('journalTextarea').value;
    updateJournalStats(text);

    const autosave = document.getElementById('journalAutosave');
    autosave.textContent = '…saving';
    autosave.className = 'journal-autosave saving';

    clearTimeout(journalSaveTimer);
    journalSaveTimer = setTimeout(() => {
      if (state.selectedDate) {
        state.journalNotes[state.selectedDate] = text;
        saveData();
        renderCalendar();
      }
      autosave.textContent = '✓ Saved';
      autosave.className = 'journal-autosave';
    }, 1000);
  });

  // --- Keyboard Esc closes modals ---
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal('topicModalBackdrop');
      closeModal('deleteModalBackdrop');
      closeMenu();
    }
  });
}

// ===================================================
// START
// ===================================================
document.addEventListener('DOMContentLoaded', init);