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

  // Update header badge
  const badge = document.getElementById('phase-badge');
  badge.textContent = `${current.emoji} ${current.name}`;
  badge.classList.remove('loading');

  // Show season section
  document.getElementById('season-loading').classList.add('hidden');
  const content = document.getElementById('season-content');
  content.classList.remove('hidden');

  // Phase card
  document.getElementById('phase-emoji').textContent = current.emoji;
  document.getElementById('phase-name').textContent = current.name;
  document.getElementById('phase-date').textContent = date;
  document.getElementById('phase-description').textContent = current.description;

  const typesEl = document.getElementById('phase-types');
  typesEl.innerHTML = current.practiceTypes
    .map(t => `<span class="type-badge">${t}</span>`)
    .join('');

  // Focus list
  const focusList = document.getElementById('phase-focus');
  focusList.innerHTML = current.focusAreas
    .map(f => `<li>${f}</li>`)
    .join('');

  // Avoid list
  const avoidList = document.getElementById('phase-avoid');
  const avoidEmpty = document.getElementById('phase-avoid-empty');
  if (current.avoid && current.avoid.length > 0) {
    avoidList.innerHTML = current.avoid.map(a => `<li>${a}</li>`).join('');
    avoidEmpty.classList.add('hidden');
  } else {
    avoidList.innerHTML = '';
    avoidEmpty.classList.remove('hidden');
  }

  // Tip
  document.getElementById('phase-tip').textContent = current.tip;

  // Next phase
  if (next) {
    const nextCard = document.getElementById('next-phase-card');
    nextCard.classList.remove('hidden');
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

// ---- Chat ----
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const chatSubmit = document.getElementById('chat-submit');
let chatHistory = [];

// Auto-resize textarea
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
});

// Enter to send (Shift+Enter for newline)
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

  // Add user message to UI
  appendChatMessage('user', text);
  chatHistory.push({ role: 'user', content: text });
  chatInput.value = '';
  chatInput.style.height = 'auto';

  // Create assistant bubble
  const assistantBubble = appendChatMessage('assistant', '', true);

  chatSubmit.disabled = true;

  try {
    // Build messages for API (keep last 20 for context)
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

    // Remove streaming cursor class from bubble
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

  if (role === 'assistant' && !streaming) {
    msgDiv.classList.remove('thinking');
  }

  return bubble;
}

// ---- Research ----
const researchForm = document.getElementById('research-form');
const researchInput = document.getElementById('research-input');
const researchOutput = document.getElementById('research-output');
const researchOutputText = document.getElementById('research-output-text');
const researchOutputTitle = document.getElementById('research-output-title');
const researchSubmit = document.getElementById('research-submit');

// Quick topic buttons
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
// Reads SSE stream from the server and updates element text
async function consumeStream(res, element, onChunk = null) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'text') {
          if (element) {
            element.textContent += data.text;
          }
          if (onChunk) onChunk(data.text);
        } else if (data.type === 'error') {
          const errMsg = `\n\n[Error: ${data.message}]`;
          if (element) element.textContent += errMsg;
          if (onChunk) onChunk(errMsg);
        }
      } catch {
        // Ignore malformed SSE lines
      }
    }
  }
}

// ---- Utility Functions ----
function copyOutput(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    showToast('Copied to clipboard!');
  }).catch(() => {
    // Fallback
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
