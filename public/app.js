/* ================================================
   10U Softball Coach Assistant — Frontend Logic
   ================================================ */

const CATEGORY_META = {
  hitting:     { label: 'Hitting',         emoji: '🏏', color: '#c0392b', bg: '#fdf0ef' },
  throwing:    { label: 'Throwing',        emoji: '💪', color: '#d35400', bg: '#fef3e2' },
  fielding:    { label: 'Fielding',        emoji: '🧤', color: '#c8861e', bg: '#fdf3e3' },
  baserunning: { label: 'Baserunning',     emoji: '🏃', color: '#27ae60', bg: '#e8f5e9' },
  pitching:    { label: 'Pitching',        emoji: '⚾', color: '#2980b9', bg: '#e3f2fd' },
  catching:    { label: 'Catching',        emoji: '🎯', color: '#8e44ad', bg: '#f3e5f5' },
  situations:  { label: 'Team Situations', emoji: '🤝', color: '#546e7a', bg: '#f1f4f5' },
  games:       { label: 'Games & Compete', emoji: '🎮', color: '#ad1457', bg: '#fce4ec' },
};

// ---- Tab Switching ----
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => { c.classList.remove('active'); c.classList.add('hidden'); });
    btn.classList.add('active');
    const section = document.getElementById(`tab-${tab}`);
    section.classList.add('active');
    section.classList.remove('hidden');
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'log') initLogTab();
  });
});

// ---- Season Phase ----
async function loadSeasonPhase() {
  try {
    const res = await fetch('/api/season-phase');
    const data = await res.json();
    renderSeasonPhase(data);
  } catch (e) {
    document.getElementById('season-loading').textContent = 'Could not load season data.';
  }
}

function renderSeasonPhase(data) {
  const { current, next, date } = data;
  const badge = document.getElementById('phase-badge');
  badge.textContent = `${current.emoji} ${current.name}`;
  badge.classList.remove('loading');
  document.getElementById('season-loading').classList.add('hidden');
  document.getElementById('season-content').classList.remove('hidden');
  document.getElementById('phase-emoji').textContent = current.emoji;
  document.getElementById('phase-name').textContent = current.name;
  document.getElementById('phase-date').textContent = date;
  document.getElementById('phase-description').textContent = current.description;
  document.getElementById('phase-types').innerHTML = current.practiceTypes.map(t => `<span class="type-badge">${t}</span>`).join('');
  document.getElementById('phase-focus').innerHTML = current.focusAreas.map(f => `<li>${f}</li>`).join('');
  const avoidList = document.getElementById('phase-avoid');
  const avoidEmpty = document.getElementById('phase-avoid-empty');
  if (current.avoid && current.avoid.length > 0) {
    avoidList.innerHTML = current.avoid.map(a => `<li>${a}</li>`).join('');
    avoidEmpty.classList.add('hidden');
  } else {
    avoidList.innerHTML = '';
    avoidEmpty.classList.remove('hidden');
  }
  document.getElementById('phase-tip').textContent = current.tip;
  if (next) {
    document.getElementById('next-phase-card').classList.remove('hidden');
    document.getElementById('next-phase-emoji').textContent = next.emoji;
    document.getElementById('next-phase-name').textContent = next.name;
    document.getElementById('next-phase-desc').textContent = next.description;
  }
}
loadSeasonPhase();

// ---- Practice Plan Generator ----
let currentPlanId = null;

const planForm = document.getElementById('plan-form');
const planOutput = document.getElementById('plan-output');
const planOutputText = document.getElementById('plan-output-text');
const planSubmit = document.getElementById('plan-submit');

planForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const location = document.getElementById('location').value;
  const duration = document.getElementById('duration').value;
  const players = document.getElementById('players').value;
  const focus = document.getElementById('focus').value;
  const notes = document.getElementById('notes').value;

  currentPlanId = null;
  planSubmit.disabled = true;
  planSubmit.textContent = '⏳ Generating...';
  planOutput.classList.remove('hidden');
  planOutputText.textContent = '';
  planOutputText.classList.add('streaming-cursor');
  document.getElementById('plan-edit-area').classList.add('hidden');
  document.getElementById('plan-save-btn').classList.add('hidden');

  try {
    const res = await fetch('/api/practice-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location, duration, players, focus, notes }),
    });
    await consumeStream(res, planOutputText, null, (meta) => {
      if (meta.plan_id) {
        currentPlanId = meta.plan_id;
        document.getElementById('plan-save-btn').classList.remove('hidden');
      }
    });
  } catch (err) {
    planOutputText.textContent = `Error: ${err.message}`;
  } finally {
    planSubmit.disabled = false;
    planSubmit.innerHTML = '<span class="btn-icon">📋</span> Generate Practice Plan';
    planOutputText.classList.remove('streaming-cursor');
    planOutput.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

// Edit plan inline
document.getElementById('plan-edit-btn')?.addEventListener('click', () => {
  const editArea = document.getElementById('plan-edit-area');
  editArea.value = planOutputText.textContent;
  editArea.classList.remove('hidden');
  planOutputText.classList.add('hidden');
});

document.getElementById('plan-edit-save')?.addEventListener('click', async () => {
  const editArea = document.getElementById('plan-edit-area');
  const newText = editArea.value;
  planOutputText.textContent = newText;
  editArea.classList.add('hidden');
  planOutputText.classList.remove('hidden');
  if (currentPlanId) {
    await fetch(`/api/practice-plans/${currentPlanId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_text: newText }),
    });
    showToast('✅ Plan saved');
  }
});

document.getElementById('plan-edit-cancel')?.addEventListener('click', () => {
  document.getElementById('plan-edit-area').classList.add('hidden');
  planOutputText.classList.remove('hidden');
});

// ---- Log Practice ----
let allDrills = [];
let logEditId = null; // null = new, number = editing existing

const CATEGORY_ORDER = ['hitting','throwing','fielding','baserunning','pitching','catching','situations','games'];

async function initLogTab() {
  const logDateInput = document.getElementById('log-date');
  if (!logDateInput.value) logDateInput.value = new Date().toISOString().split('T')[0];
  if (!allDrills.length) await loadDrills();
  renderDrillPicker();
  loadLogHistory();
}

async function loadDrills() {
  try {
    const res = await fetch('/api/drills');
    allDrills = await res.json();
  } catch (e) {
    console.error('Failed to load drills:', e);
  }
}

function renderDrillPicker(selectedDrills = []) {
  const container = document.getElementById('drill-picker');
  if (!container) return;

  const byCategory = {};
  CATEGORY_ORDER.forEach(c => { byCategory[c] = []; });
  allDrills.forEach(d => { if (byCategory[d.category]) byCategory[d.category].push(d); });

  container.innerHTML = CATEGORY_ORDER.map(cat => {
    const meta = CATEGORY_META[cat];
    const drills = byCategory[cat];
    if (!drills.length) return '';

    const drillItems = drills.map(d => {
      const sel = selectedDrills.find(s => s.drill_id === d.id);
      const checked = sel ? 'checked' : '';
      const mins = sel ? sel.minutes : 10;
      return `
        <div class="drill-item">
          <label class="drill-label">
            <input type="checkbox" class="drill-check" data-drill-id="${d.id}" data-category="${cat}" data-name="${d.name}" ${checked} onchange="toggleDrillMinutes(this)">
            <span class="drill-name">${d.name}</span>
            ${d.skill_level ? `<span class="skill-badge skill-${d.skill_level}">${d.skill_level}</span>` : ''}
          </label>
          <div class="drill-minutes ${checked ? '' : 'hidden'}" id="drillmin-${d.id}">
            <input type="number" class="cat-min-input" id="mins-${d.id}" min="0" max="60" step="5" value="${mins}">
            <span class="cat-min-label">min</span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="drill-category-section" style="--cat-color:${meta.color};--cat-bg:${meta.bg}">
        <div class="drill-cat-header">${meta.emoji} ${meta.label}</div>
        <div class="drill-list">${drillItems}</div>
        <div class="custom-drill-row">
          <input type="text" class="custom-drill-input" id="custom-${cat}" placeholder="+ Add custom drill (not in list)">
          <input type="number" class="cat-min-input" id="custom-mins-${cat}" min="0" max="60" step="5" value="10" style="width:58px">
          <span class="cat-min-label">min</span>
        </div>
      </div>
    `;
  }).join('');
}

function toggleDrillMinutes(checkbox) {
  const wrap = document.getElementById(`drillmin-${checkbox.dataset.drillId}`);
  if (wrap) wrap.classList.toggle('hidden', !checkbox.checked);
}

function collectDrills() {
  const drills = [];

  // Checked drills from catalog
  document.querySelectorAll('.drill-check:checked').forEach(cb => {
    const minsEl = document.getElementById(`mins-${cb.dataset.drillId}`);
    drills.push({
      drill_id: parseInt(cb.dataset.drillId),
      category: cb.dataset.category,
      minutes: parseInt(minsEl?.value) || 10,
    });
  });

  // Custom drills
  CATEGORY_ORDER.forEach(cat => {
    const customInput = document.getElementById(`custom-${cat}`);
    const customMins = document.getElementById(`custom-mins-${cat}`);
    if (customInput && customInput.value.trim()) {
      drills.push({
        drill_id: null,
        custom_drill_name: customInput.value.trim(),
        category: cat,
        minutes: parseInt(customMins?.value) || 10,
      });
    }
  });

  return drills;
}

const logForm = document.getElementById('log-form');
const logSubmit = document.getElementById('log-submit');
const logFormTitle = document.getElementById('log-form-title');
const logCancelEdit = document.getElementById('log-cancel-edit');

logForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const drills = collectDrills();
  const body = {
    date: document.getElementById('log-date').value,
    location: document.getElementById('log-location').value,
    duration: document.getElementById('log-duration').value,
    players: document.getElementById('log-players').value,
    end_game: document.getElementById('log-end-game').value,
    wins: document.getElementById('log-wins').value,
    improvements: document.getElementById('log-improvements').value,
    notes: document.getElementById('log-notes').value,
    drills,
  };

  logSubmit.disabled = true;
  logSubmit.textContent = logEditId ? '💾 Updating...' : '💾 Saving...';

  try {
    let res;
    if (logEditId) {
      res = await fetch(`/api/practice-log/${logEditId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } else {
      res = await fetch('/api/practice-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    if (res.status === 409) {
      const data = await res.json();
      if (confirm(`A practice log already exists for ${body.date}. Edit the existing one?`)) {
        await editLog(data.id);
      }
      return;
    }

    if (res.ok) {
      showToast(logEditId ? '✅ Practice updated!' : '✅ Practice logged!');
      resetLogForm();
      loadLogHistory();
    }
  } catch (err) {
    showToast('Error saving log');
  } finally {
    logSubmit.disabled = false;
    logSubmit.textContent = logEditId ? '💾 Update Practice Log' : '💾 Save Practice Log';
  }
});

function resetLogForm() {
  logEditId = null;
  logForm?.reset();
  document.getElementById('log-date').value = new Date().toISOString().split('T')[0];
  if (logFormTitle) logFormTitle.textContent = 'Log Today\'s Practice';
  if (logCancelEdit) logCancelEdit.classList.add('hidden');
  logSubmit.textContent = '💾 Save Practice Log';
  renderDrillPicker();
}

logCancelEdit?.addEventListener('click', resetLogForm);

async function editLog(id) {
  const res = await fetch('/api/practice-log');
  const { practices } = await res.json();
  const log = practices.find(p => p.id === id);
  if (!log) return;

  logEditId = id;
  if (logFormTitle) logFormTitle.textContent = `Editing: ${new Date(log.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
  if (logCancelEdit) logCancelEdit.classList.remove('hidden');
  logSubmit.textContent = '💾 Update Practice Log';

  document.getElementById('log-date').value = log.date;
  document.getElementById('log-location').value = log.location || '';
  document.getElementById('log-duration').value = log.duration || 90;
  document.getElementById('log-players').value = log.players || '9-11';
  document.getElementById('log-end-game').value = log.end_game || '';
  document.getElementById('log-wins').value = log.wins || '';
  document.getElementById('log-improvements').value = log.improvements || '';
  document.getElementById('log-notes').value = log.notes || '';

  const selectedDrills = (log.sc_log_drills || []).map(d => ({
    drill_id: d.drill_id || d.sc_drills?.id,
    minutes: d.minutes,
    category: d.category,
  }));
  renderDrillPicker(selectedDrills);

  document.getElementById('tab-log').scrollIntoView({ behavior: 'smooth' });
}

async function loadLogHistory() {
  try {
    const res = await fetch('/api/practice-log');
    const { practices } = await res.json();
    renderLogHistory(practices);
  } catch (e) { console.error(e); }
}

function renderLogHistory(practices) {
  const container = document.getElementById('log-history');
  if (!practices || !practices.length) {
    container.innerHTML = '<p class="empty-note">No practices logged yet.</p>';
    return;
  }
  container.innerHTML = practices.map(p => {
    const dateStr = new Date(p.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const drillTags = (p.sc_log_drills || [])
      .filter(d => d.minutes > 0)
      .map(d => {
        const name = d.sc_drills?.name || d.custom_drill_name || '?';
        const meta = CATEGORY_META[d.category] || {};
        return `<span class="cat-tag" style="background:${meta.bg};color:${meta.color};border-color:${meta.color}">${name} ${d.minutes}min</span>`;
      }).join('');

    return `
      <div class="log-entry">
        <div class="log-entry-header">
          <div class="log-entry-meta">
            <strong>${dateStr}</strong>
            <span class="log-badge">${p.location}</span>
            <span class="log-badge">${p.duration} min</span>
            <span class="log-badge">${p.players} players</span>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn-secondary" style="padding:4px 10px;font-size:0.78rem" onclick="editLog(${p.id})">✏️ Edit</button>
            <button class="btn-ghost" onclick="deleteLog(${p.id})">✕</button>
          </div>
        </div>
        ${drillTags ? `<div class="cat-tags">${drillTags}</div>` : ''}
        ${p.end_game ? `<div class="log-field"><span class="log-field-label">🎮 Game:</span> ${p.end_game}</div>` : ''}
        ${p.wins ? `<div class="log-field"><span class="log-field-label">✅ Wins:</span> ${p.wins}</div>` : ''}
        ${p.improvements ? `<div class="log-field"><span class="log-field-label">🔧 Needs work:</span> ${p.improvements}</div>` : ''}
      </div>
    `;
  }).join('');
}

async function deleteLog(id) {
  if (!confirm('Delete this practice log entry?')) return;
  await fetch(`/api/practice-log/${id}`, { method: 'DELETE' });
  showToast('Deleted');
  loadLogHistory();
}

// ---- Dashboard ----
async function loadDashboard() {
  try {
    const res = await fetch('/api/practice-stats');
    const stats = await res.json();
    renderDashboard(stats);
  } catch (e) { console.error('Dashboard failed:', e); }
}

function renderDashboard(stats) {
  document.getElementById('dashboard-loading').classList.add('hidden');
  document.getElementById('dashboard-content').classList.remove('hidden');

  document.getElementById('stat-practices').textContent = stats.totalPractices;
  document.getElementById('stat-minutes').textContent = stats.totalMinutes;
  if (stats.lastPractice) {
    const d = new Date(stats.lastPractice.date + 'T12:00:00');
    document.getElementById('stat-last').textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Category bars
  const barsEl = document.getElementById('category-bars');
  const noDataNote = document.getElementById('no-data-note');
  const totalMin = Object.values(stats.categoryTotals).reduce((s, v) => s + v, 0);

  if (totalMin === 0) {
    barsEl.innerHTML = '';
    noDataNote.classList.remove('hidden');
  } else {
    noDataNote.classList.add('hidden');
    const maxVal = Math.max(...Object.values(stats.categoryTotals), 1);
    barsEl.innerHTML = CATEGORY_ORDER.map(cat => {
      const meta = CATEGORY_META[cat];
      const mins = stats.categoryTotals[cat] || 0;
      const pct = Math.round((mins / maxVal) * 100);
      return `
        <div class="cat-bar-row">
          <div class="cat-bar-label">${meta.emoji} ${meta.label}</div>
          <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${meta.color}"></div></div>
          <div class="cat-bar-val">${mins} min</div>
        </div>
      `;
    }).join('');
  }

  // Drill frequency table
  const freqEl = document.getElementById('drill-frequency');
  if (freqEl && stats.drillFrequency) {
    const sorted = Object.entries(stats.drillFrequency).sort((a, b) => b[1] - a[1]).slice(0, 15);
    if (sorted.length) {
      freqEl.innerHTML = sorted.map(([name, count]) => `
        <div class="freq-row">
          <span class="freq-name">${name}</span>
          <span class="freq-bar-wrap"><span class="freq-bar" style="width:${Math.round((count/sorted[0][1])*100)}%"></span></span>
          <span class="freq-count">${count}x</span>
        </div>
      `).join('');
    } else {
      freqEl.innerHTML = '<p class="empty-note">No drills logged yet.</p>';
    }
  }

  // Needs attention
  if (stats.needsAttention && stats.needsAttention.length > 0 && stats.totalPractices >= 2) {
    const card = document.getElementById('attention-card');
    card.classList.remove('hidden');
    document.getElementById('attention-list').innerHTML = stats.needsAttention.map(id => {
      const meta = CATEGORY_META[id];
      return meta ? `<span class="cat-tag" style="background:${meta.bg};color:${meta.color};border-color:${meta.color}">${meta.emoji} ${meta.label}</span>` : '';
    }).join('');
  }

  // Recent practices
  const recentEl = document.getElementById('dashboard-recent');
  if (!stats.practices || !stats.practices.length) {
    recentEl.innerHTML = '<p class="empty-note">No practices logged yet. Use the 📝 Log Practice tab after each practice.</p>';
    return;
  }
  recentEl.innerHTML = stats.practices.slice(0, 8).map(p => {
    const dateStr = new Date(p.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const cats = [...new Set((p.sc_log_drills || []).filter(d => d.minutes > 0).map(d => CATEGORY_META[d.category]?.emoji))].join(' ');
    return `
      <div class="recent-practice-row">
        <div class="recent-date">${dateStr}</div>
        <div class="recent-details">
          <span class="log-badge">${p.location}</span>
          <span class="log-badge">${p.duration} min</span>
          ${cats ? `<span class="recent-cats">${cats}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ---- Chat ----
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const chatSubmit = document.getElementById('chat-submit');
let chatHistory = [];

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
});
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatForm.dispatchEvent(new Event('submit')); }
});
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  appendChatMessage('user', text);
  chatHistory.push({ role: 'user', content: text });
  chatInput.value = '';
  chatInput.style.height = 'auto';
  const bubble = appendChatMessage('assistant', '', true);
  chatSubmit.disabled = true;
  try {
    let fullText = '';
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: chatHistory.slice(-20) }) });
    await consumeStream(res, null, (chunk) => { fullText += chunk; bubble.textContent = fullText; chatMessages.scrollTop = chatMessages.scrollHeight; });
    bubble.classList.remove('streaming-cursor');
    chatHistory.push({ role: 'assistant', content: fullText });
  } catch (err) { bubble.textContent = `Error: ${err.message}`; }
  finally { chatSubmit.disabled = false; }
});
function appendChatMessage(role, text, streaming = false) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message ${role}${streaming ? ' thinking' : ''}`;
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  if (streaming) bubble.classList.add('streaming-cursor');
  bubble.textContent = text || '...';
  msgDiv.appendChild(bubble);
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble;
}

// ---- Research ----
const researchForm = document.getElementById('research-form');
const researchInput = document.getElementById('research-input');
const researchOutput = document.getElementById('research-output');
const researchOutputText = document.getElementById('research-output-text');
const researchOutputTitle = document.getElementById('research-output-title');
const researchSubmit = document.getElementById('research-submit');

document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => { researchInput.value = btn.dataset.topic; researchForm.dispatchEvent(new Event('submit')); });
});
researchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const topic = researchInput.value.trim();
  if (!topic) return;
  researchSubmit.disabled = true;
  researchSubmit.textContent = '⏳ Researching...';
  researchOutput.classList.remove('hidden');
  researchOutputTitle.textContent = `Research: "${topic}"`;
  researchOutputText.textContent = '';
  researchOutputText.classList.add('streaming-cursor');
  try {
    const res = await fetch('/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic }) });
    await consumeStream(res, researchOutputText);
  } catch (err) { researchOutputText.textContent = `Error: ${err.message}`; }
  finally {
    researchSubmit.disabled = false;
    researchSubmit.textContent = '🔍 Research';
    researchOutputText.classList.remove('streaming-cursor');
    researchOutput.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

// ---- Stream Consumer ----
async function consumeStream(res, element, onChunk = null, onMeta = null) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'text') { if (element) element.textContent += data.text; if (onChunk) onChunk(data.text); }
        else if (data.type === 'done') { if (onMeta) onMeta(data); }
        else if (data.type === 'error') { const msg = `\n\n[Error: ${data.message}]`; if (element) element.textContent += msg; if (onChunk) onChunk(msg); }
      } catch { /* ignore */ }
    }
  }
}

// ---- Utility ----
function copyOutput(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => showToast('Copied!')).catch(() => {
    const range = document.createRange(); range.selectNode(el);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
    document.execCommand('copy'); window.getSelection().removeAllRanges(); showToast('Copied!');
  });
}
function printOutput(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Practice Plan</title><style>body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;padding:20px}pre{white-space:pre-wrap;margin:0}</style></head><body><pre>${el.textContent}</pre></body></html>`);
  win.document.close(); win.focus(); win.print();
}
function clearOutput(id) { const el = document.getElementById(id); if (el) el.classList.add('hidden'); }
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden'); t.classList.add('show');
  setTimeout(() => { t.classList.remove('show'); t.classList.add('hidden'); }, 2500);
}
