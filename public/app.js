/* ================================================
   10U Softball Coach Assistant — Frontend Logic
   ================================================ */

// ---- Tab Switching ----
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => {
      c.classList.remove('active');
      c.classList.add('hidden');
    });
    btn.classList.add('active');
    const section = document.getElementById(`tab-${tab}`);
    section.classList.add('active');
    section.classList.remove('hidden');

    if (tab === 'dashboard') loadDashboard();
    if (tab === 'log') loadLogHistory();
  });
});

// ---- Load Season Phase ----
async function loadSeasonPhase() {
  try {
    const res = await fetch('/api/season-phase');
    const data = await res.json();
    renderSeasonPhase(data);
  } catch (e) {
    console.error('Failed to load season phase:', e);
    document.getElementById('season-loading').textContent = 'Could not load season data.';
  }
}

function renderSeasonPhase(data) {
  const { current, next, date } = data;
  const badge = document.getElementById('phase-badge');
  badge.textContent = `${current.emoji} ${current.name}`;
  badge.classList.remove('loading');

  document.getElementById('season-loading').classList.add('hidden');
  const content = document.getElementById('season-content');
  content.classList.remove('hidden');

  document.getElementById('phase-emoji').textContent = current.emoji;
  document.getElementById('phase-name').textContent = current.name;
  document.getElementById('phase-date').textContent = date;
  document.getElementById('phase-description').textContent = current.description;

  document.getElementById('phase-types').innerHTML = current.practiceTypes
    .map(t => `<span class="type-badge">${t}</span>`).join('');

  document.getElementById('phase-focus').innerHTML = current.focusAreas
    .map(f => `<li>${f}</li>`).join('');

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

  planSubmit.disabled = true;
  planSubmit.textContent = '⏳ Generating...';
  planOutput.classList.remove('hidden');
  planOutputText.textContent = '';
  planOutputText.classList.add('streaming-cursor');

  try {
    const res = await fetch('/api/practice-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location, duration, players, focus, notes }),
    });
    await consumeStream(res, planOutputText);
  } catch (err) {
    planOutputText.textContent = `Error: ${err.message}`;
  } finally {
    planSubmit.disabled = false;
    planSubmit.innerHTML = '<span class="btn-icon">📋</span> Generate Practice Plan';
    planOutputText.classList.remove('streaming-cursor');
    planOutput.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

// ---- Log Practice ----
let drillCategories = [];

// Set today's date on the log form
const logDateInput = document.getElementById('log-date');
logDateInput.value = new Date().toISOString().split('T')[0];

async function loadDrillCategories() {
  if (drillCategories.length) return;
  try {
    const res = await fetch('/api/drill-categories');
    drillCategories = await res.json();
    renderCategoryGrid();
  } catch (e) {
    console.error('Failed to load drill categories:', e);
  }
}

function renderCategoryGrid() {
  const grid = document.getElementById('category-grid');
  if (!grid) return;
  grid.innerHTML = drillCategories.map(cat => `
    <div class="category-item" style="--cat-color: ${cat.color}; --cat-bg: ${cat.bg}">
      <label class="cat-label">
        <input type="checkbox" class="cat-check" data-cat="${cat.id}" onchange="toggleCatMinutes(this)">
        <span class="cat-emoji">${cat.emoji}</span>
        <span class="cat-name">${cat.label}</span>
      </label>
      <div class="cat-minutes hidden" id="min-wrap-${cat.id}">
        <input type="number" class="cat-min-input" id="min-${cat.id}" min="0" max="120" step="5" value="15" placeholder="min">
        <span class="cat-min-label">min</span>
      </div>
    </div>
  `).join('');
}

function toggleCatMinutes(checkbox) {
  const wrap = document.getElementById(`min-wrap-${checkbox.dataset.cat}`);
  if (wrap) {
    if (checkbox.checked) {
      wrap.classList.remove('hidden');
    } else {
      wrap.classList.add('hidden');
    }
  }
}

loadDrillCategories();

const logForm = document.getElementById('log-form');
const logSubmit = document.getElementById('log-submit');

logForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Gather categories
  const categories = {};
  drillCategories.forEach(cat => {
    const check = document.querySelector(`.cat-check[data-cat="${cat.id}"]`);
    const minInput = document.getElementById(`min-${cat.id}`);
    if (check && check.checked) {
      categories[cat.id] = parseInt(minInput?.value) || 15;
    } else {
      categories[cat.id] = 0;
    }
  });

  const entry = {
    date: document.getElementById('log-date').value,
    location: document.getElementById('log-location').value,
    duration: document.getElementById('log-duration').value,
    players: document.getElementById('log-players').value,
    categories,
    endGame: document.getElementById('log-end-game').value,
    wins: document.getElementById('log-wins').value,
    improvements: document.getElementById('log-improvements').value,
    notes: document.getElementById('log-notes').value,
  };

  logSubmit.disabled = true;
  logSubmit.textContent = '💾 Saving...';

  try {
    const res = await fetch('/api/practice-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Practice logged!');
      logForm.reset();
      logDateInput.value = new Date().toISOString().split('T')[0];
      // Uncheck all categories
      document.querySelectorAll('.cat-check').forEach(cb => {
        cb.checked = false;
        toggleCatMinutes(cb);
      });
      loadLogHistory();
    }
  } catch (err) {
    showToast('Error saving log');
  } finally {
    logSubmit.disabled = false;
    logSubmit.textContent = '💾 Save Practice Log';
  }
});

async function loadLogHistory() {
  try {
    const res = await fetch('/api/practice-log');
    const { practices } = await res.json();
    renderLogHistory(practices);
  } catch (e) {
    console.error(e);
  }
}

function renderLogHistory(practices) {
  const container = document.getElementById('log-history');
  if (!practices || !practices.length) {
    container.innerHTML = '<p class="empty-note">No practices logged yet.</p>';
    return;
  }

  container.innerHTML = practices.map(p => {
    const dateStr = new Date(p.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const workedOn = drillCategories
      .filter(c => (p.categories?.[c.id] || 0) > 0)
      .map(c => `<span class="cat-tag" style="background:${c.bg};color:${c.color};border-color:${c.color}">${c.emoji} ${c.label} ${p.categories[c.id]}min</span>`)
      .join('');

    return `
      <div class="log-entry">
        <div class="log-entry-header">
          <div class="log-entry-meta">
            <strong>${dateStr}</strong>
            <span class="log-badge">${p.location}</span>
            <span class="log-badge">${p.duration} min</span>
            <span class="log-badge">${p.players} players</span>
          </div>
          <button class="btn-ghost delete-log" data-id="${p.id}" onclick="deleteLog('${p.id}')">✕</button>
        </div>
        ${workedOn ? `<div class="cat-tags">${workedOn}</div>` : ''}
        ${p.endGame ? `<div class="log-field"><span class="log-field-label">🎮 Game:</span> ${p.endGame}</div>` : ''}
        ${p.wins ? `<div class="log-field"><span class="log-field-label">✅ Wins:</span> ${p.wins}</div>` : ''}
        ${p.improvements ? `<div class="log-field"><span class="log-field-label">🔧 Needs work:</span> ${p.improvements}</div>` : ''}
      </div>
    `;
  }).join('');
}

async function deleteLog(id) {
  if (!confirm('Delete this practice log entry?')) return;
  try {
    await fetch(`/api/practice-log/${id}`, { method: 'DELETE' });
    loadLogHistory();
    showToast('Deleted');
  } catch (e) {
    showToast('Error deleting');
  }
}

// ---- Dashboard ----
async function loadDashboard() {
  try {
    const res = await fetch('/api/practice-stats');
    const stats = await res.json();
    renderDashboard(stats);
  } catch (e) {
    console.error('Dashboard load failed:', e);
  }
}

function renderDashboard(stats) {
  document.getElementById('dashboard-loading').classList.add('hidden');
  document.getElementById('dashboard-content').classList.remove('hidden');

  // Stat cards
  document.getElementById('stat-practices').textContent = stats.totalPractices;
  document.getElementById('stat-minutes').textContent = stats.totalMinutes;
  if (stats.lastPractice) {
    const d = new Date(stats.lastPractice.date + 'T12:00:00');
    document.getElementById('stat-last').textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Category bars
  const barsEl = document.getElementById('category-bars');
  const noDataNote = document.getElementById('no-data-note');
  const totalCatMin = Object.values(stats.categoryTotals).reduce((s, v) => s + v, 0);

  if (totalCatMin === 0) {
    barsEl.innerHTML = '';
    noDataNote.classList.remove('hidden');
  } else {
    noDataNote.classList.add('hidden');
    const maxVal = Math.max(...Object.values(stats.categoryTotals), 1);
    barsEl.innerHTML = drillCategories.map(cat => {
      const mins = stats.categoryTotals[cat.id] || 0;
      const pct = Math.round((mins / maxVal) * 100);
      return `
        <div class="cat-bar-row">
          <div class="cat-bar-label">${cat.emoji} ${cat.label}</div>
          <div class="cat-bar-track">
            <div class="cat-bar-fill" style="width:${pct}%;background:${cat.color}"></div>
          </div>
          <div class="cat-bar-val">${mins} min</div>
        </div>
      `;
    }).join('');
  }

  // Needs attention
  if (stats.needsAttention && stats.needsAttention.length > 0 && stats.totalPractices >= 2) {
    const attentionCard = document.getElementById('attention-card');
    attentionCard.classList.remove('hidden');
    const attentionList = document.getElementById('attention-list');
    attentionList.innerHTML = stats.needsAttention.map(id => {
      const cat = drillCategories.find(c => c.id === id);
      return cat ? `<span class="cat-tag" style="background:${cat.bg};color:${cat.color};border-color:${cat.color}">${cat.emoji} ${cat.label}</span>` : '';
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
    const cats = drillCategories
      .filter(c => (p.categories?.[c.id] || 0) > 0)
      .map(c => `${c.emoji} ${c.label}`)
      .join(' · ');
    return `
      <div class="recent-practice-row">
        <div class="recent-date">${dateStr}</div>
        <div class="recent-details">
          <span class="log-badge">${p.location}</span>
          <span class="log-badge">${p.duration} min</span>
          ${cats ? `<span class="recent-cats">${cats}</span>` : ''}
          ${p.endGame ? `<span class="recent-game">🎮 ${p.endGame}</span>` : ''}
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
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  appendChatMessage('user', text);
  chatHistory.push({ role: 'user', content: text });
  chatInput.value = '';
  chatInput.style.height = 'auto';

  const assistantBubble = appendChatMessage('assistant', '', true);
  chatSubmit.disabled = true;

  try {
    const recentHistory = chatHistory.slice(-20);
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: recentHistory }),
    });

    let fullText = '';
    await consumeStream(res, null, (chunk) => {
      fullText += chunk;
      assistantBubble.textContent = fullText;
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    assistantBubble.classList.remove('streaming-cursor');
    chatHistory.push({ role: 'assistant', content: fullText });
  } catch (err) {
    assistantBubble.textContent = `Sorry, something went wrong: ${err.message}`;
  } finally {
    chatSubmit.disabled = false;
  }
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
  if (role === 'assistant' && !streaming) msgDiv.classList.remove('thinking');
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
  btn.addEventListener('click', () => {
    researchInput.value = btn.dataset.topic;
    researchForm.dispatchEvent(new Event('submit'));
  });
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
    const res = await fetch('/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    });
    await consumeStream(res, researchOutputText);
  } catch (err) {
    researchOutputText.textContent = `Error: ${err.message}`;
  } finally {
    researchSubmit.disabled = false;
    researchSubmit.textContent = '🔍 Research';
    researchOutputText.classList.remove('streaming-cursor');
    researchOutput.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

// ---- Stream Consumer ----
async function consumeStream(res, element, onChunk = null) {
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
        if (data.type === 'text') {
          if (element) element.textContent += data.text;
          if (onChunk) onChunk(data.text);
        } else if (data.type === 'error') {
          const errMsg = `\n\n[Error: ${data.message}]`;
          if (element) element.textContent += errMsg;
          if (onChunk) onChunk(errMsg);
        }
      } catch { /* ignore malformed SSE */ }
    }
  }
}

// ---- Utility ----
function copyOutput(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    showToast('Copied to clipboard!');
  }).catch(() => {
    const range = document.createRange();
    range.selectNode(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.execCommand('copy');
    window.getSelection().removeAllRanges();
    showToast('Copied!');
  });
}

function printOutput(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const content = el.textContent;
  const printWin = window.open('', '_blank');
  printWin.document.write(`
    <html><head><title>Practice Plan</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; padding: 20px; }
      pre, p { white-space: pre-wrap; margin: 0; }
    </style></head>
    <body><pre>${content}</pre></body></html>
  `);
  printWin.document.close();
  printWin.focus();
  printWin.print();
}

function clearOutput(outputId) {
  const el = document.getElementById(outputId);
  if (el) el.classList.add('hidden');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hidden');
  }, 2500);
}
