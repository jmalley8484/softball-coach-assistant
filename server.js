require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const { getCurrentPhase, getNextPhase } = require('./data/season-phases');

const app = express();
const PORT = process.env.PORT || 3000;

// Load system prompt once at startup — cached for 1 hour to reduce API costs
const systemPromptPath = path.join(__dirname, 'data', 'system-prompt.md');
const SYSTEM_PROMPT = [
  {
    type: 'text',
    text: fs.readFileSync(systemPromptPath, 'utf8'),
    cache_control: { type: 'ephemeral', ttl: '1h' },
  },
];

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Season Phase Endpoint ---
app.get('/api/season-phase', (req, res) => {
  const today = new Date();
  const phase = getCurrentPhase(today);
  const nextPhase = getNextPhase(phase.id);
  res.json({
    current: phase,
    next: nextPhase,
    date: today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  });
});

// --- Chat / Ask Endpoint (streaming SSE) ---
app.post('/api/chat', async (req, res) => {
  const { messages, mode } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const today = new Date();
  const phase = getCurrentPhase(today);
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const contextPrefix = `Current date: ${dateStr}
Current season phase: ${phase.name} — ${phase.description}
Practice types currently available: ${phase.practiceTypes.join(', ')}
Current focus areas: ${phase.focusAreas.join('; ')}

`;

  // Inject date/phase context into the first user message
  const enrichedMessages = messages.map((msg, i) => {
    if (i === 0 && msg.role === 'user') {
      return { ...msg, content: contextPrefix + msg.content };
    }
    return msg;
  });

  try {
    const stream = await client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: enrichedMessages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const data = JSON.stringify({ type: 'text', text: event.delta.text });
        res.write(`data: ${data}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Claude API error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

// --- Practice Plan Generator Endpoint (streaming SSE) ---
app.post('/api/practice-plan', async (req, res) => {
  const { location, duration, players, focus, notes } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const today = new Date();
  const phase = getCurrentPhase(today);
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const prompt = `Generate a complete, detailed practice plan for today.

Date: ${dateStr}
Season Phase: ${phase.name} — ${phase.description}
Practice Location: ${location}
Duration: ${duration} minutes
Number of Players: ${players || '10-12'}
Primary Focus: ${focus}
Additional Notes: ${notes || 'None'}

Please create a fully structured practice plan following the standard format:
- Use the team structure from our sample practice (bands, huddle, dynamic warmup, throwing progression, fielding EDDs, hitting, huddle)
- Include specific drill names, time allocations, group rotations, and coaching cues
- Include the daily throwing progression and fielding EDDs
- Adapt the plan for the current season phase and location (${location})
- End with Team Goals (Have fun! Be a great Teammate! Get better every day!)
- Add a "Megrem Softball Reference" section at the end with 2-3 relevant YouTube search suggestions

Format it cleanly so it can be printed and brought to practice.`;

  try {
    const stream = await client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const data = JSON.stringify({ type: 'text', text: event.delta.text });
        res.write(`data: ${data}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Claude API error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

// --- Megrem Research Endpoint (streaming SSE) ---
app.post('/api/research', async (req, res) => {
  const { topic } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const prompt = `The coach wants to research: "${topic}" for 10U travel softball.

Please provide:
1. **Overview** — Brief explanation of this skill/concept and why it matters at 10U
2. **Key Coaching Cues** — What to say and look for (3-5 bullet points)
3. **Common Errors** — What mistakes players typically make and how to correct them
4. **Drills to Try** — 2-3 specific drills from our library, with setup and execution
5. **Progression** — How to introduce this to beginners and advance over the season
6. **Megrem Softball YouTube Searches** — 3-4 specific search terms to find video instruction on this topic from the Megrem Softball channel

Keep it practical and immediately usable at practice.`;

  try {
    const stream = await client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const data = JSON.stringify({ type: 'text', text: event.delta.text });
        res.write(`data: ${data}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Claude API error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`\n🥎 Softball Coach Assistant running at http://localhost:${PORT}\n`);
  const phase = getCurrentPhase();
  console.log(`Current season phase: ${phase.emoji} ${phase.name}`);
  console.log(`Focus: ${phase.focusAreas[0]}\n`);
});
