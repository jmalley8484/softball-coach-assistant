require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { getCurrentPhase, getNextPhase } = require('./data/season-phases');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Load system prompt with prompt caching
const systemPromptPath = path.join(__dirname, 'data', 'system-prompt.md');
const SYSTEM_PROMPT = [
  {
    type: 'text',
    text: fs.readFileSync(systemPromptPath, 'utf8'),
    cache_control: { type: 'ephemeral', ttl: '1h' },
  },
];

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Helpers ----

async function buildHistoryContext(limit = 5) {
  const { data: logs } = await supabase
    .from('sc_practice_logs')
    .select(`
      date, location, duration, end_game, improvements,
      sc_log_drills ( minutes, category, custom_drill_name, sc_drills ( name ) )
    `)
    .order('date', { ascending: false })
    .limit(limit);

  if (!logs || !logs.length) return '';

  let ctx = `\n\nRECENT PRACTICE HISTORY (last ${logs.length} practices — use this to avoid repetition and address areas needing improvement):\n`;
  for (const p of logs) {
    const dateStr = new Date(p.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    ctx += `• ${dateStr} @ ${p.location} (${p.duration} min)`;
    if (p.sc_log_drills && p.sc_log_drills.length) {
      const drillList = p.sc_log_drills
        .filter(d => d.minutes > 0)
        .map(d => `${d.sc_drills ? d.sc_drills.name : d.custom_drill_name} (${d.minutes}min)`)
        .join(', ');
      if (drillList) ctx += ` — ${drillList}`;
    }
    if (p.end_game) ctx += ` | Game: ${p.end_game}`;
    if (p.improvements) ctx += ` | Needs work: ${p.improvements}`;
    ctx += '\n';
  }
  return ctx;
}

async function getDrillFrequency() {
  const { data } = await supabase
    .from('sc_log_drills')
    .select('drill_id, custom_drill_name, sc_drills(name), sc_practice_logs(date)')
    .not('drill_id', 'is', null);

  if (!data) return '';

  const freq = {};
  data.forEach(row => {
    const name = row.sc_drills?.name || row.custom_drill_name;
    if (!name) return;
    freq[name] = (freq[name] || 0) + 1;
  });

  const sorted = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => `${name} (${count}x)`)
    .join(', ');

  return sorted ? `\nMost-used drills this season: ${sorted}` : '';
}

// ---- Season Phase ----
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

// ---- Drills ----
app.get('/api/drills', async (req, res) => {
  const { data, error } = await supabase
    .from('sc_drills')
    .select('id, name, category, skill_level, variations')
    .eq('is_active', true)
    .order('category')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ---- Practice Plans ----
app.get('/api/practice-plans', async (req, res) => {
  const { data, error } = await supabase
    .from('sc_practice_plans')
    .select('id, date, location, duration, focus, is_template, template_name, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/practice-plans/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('sc_practice_plans')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: 'Plan not found' });
  res.json(data);
});

app.post('/api/practice-plans', async (req, res) => {
  const { date, location, duration, players, focus, plan_text, is_template, template_name, notes } = req.body;
  const { data, error } = await supabase
    .from('sc_practice_plans')
    .insert({ date, location, duration, players, focus, plan_text, is_template, template_name, notes })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, plan: data });
});

app.patch('/api/practice-plans/:id', async (req, res) => {
  const updates = { ...req.body, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from('sc_practice_plans')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, plan: data });
});

// ---- Practice Logs ----
app.get('/api/practice-log', async (req, res) => {
  const { data, error } = await supabase
    .from('sc_practice_logs')
    .select(`
      *,
      sc_log_drills (
        id, minutes, category, custom_drill_name, notes,
        sc_drills ( id, name, category )
      )
    `)
    .order('date', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ practices: data });
});

app.get('/api/practice-log/date/:date', async (req, res) => {
  const { data, error } = await supabase
    .from('sc_practice_logs')
    .select(`
      *,
      sc_log_drills (
        id, minutes, category, custom_drill_name, notes,
        sc_drills ( id, name, category )
      )
    `)
    .eq('date', req.params.date)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/practice-log', async (req, res) => {
  const { date, location, duration, players, end_game, wins, improvements, notes, drills } = req.body;

  // Check for existing log on this date
  const { data: existing } = await supabase
    .from('sc_practice_logs')
    .select('id')
    .eq('date', date)
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ error: 'duplicate', id: existing.id, message: `A practice log already exists for ${date}. Use PUT to update it.` });
  }

  // Insert log
  const { data: log, error: logError } = await supabase
    .from('sc_practice_logs')
    .insert({ date, location, duration: parseInt(duration), players, end_game, wins, improvements, notes })
    .select()
    .single();

  if (logError) return res.status(500).json({ error: logError.message });

  // Insert drills
  if (drills && drills.length) {
    const drillRows = drills.map(d => ({
      log_id: log.id,
      drill_id: d.drill_id || null,
      custom_drill_name: d.custom_drill_name || null,
      category: d.category,
      minutes: parseInt(d.minutes) || 0,
      notes: d.notes || null,
    }));
    await supabase.from('sc_log_drills').insert(drillRows);
  }

  res.json({ success: true, log });
});

app.put('/api/practice-log/:id', async (req, res) => {
  const { date, location, duration, players, end_game, wins, improvements, notes, drills } = req.body;

  // Update log
  const { data: log, error: logError } = await supabase
    .from('sc_practice_logs')
    .update({ date, location, duration: parseInt(duration), players, end_game, wins, improvements, notes, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (logError) return res.status(500).json({ error: logError.message });

  // Replace drills — delete old, insert new
  await supabase.from('sc_log_drills').delete().eq('log_id', req.params.id);
  if (drills && drills.length) {
    const drillRows = drills.map(d => ({
      log_id: log.id,
      drill_id: d.drill_id || null,
      custom_drill_name: d.custom_drill_name || null,
      category: d.category,
      minutes: parseInt(d.minutes) || 0,
      notes: d.notes || null,
    }));
    await supabase.from('sc_log_drills').insert(drillRows);
  }

  res.json({ success: true, log });
});

app.delete('/api/practice-log/:id', async (req, res) => {
  const { error } = await supabase
    .from('sc_practice_logs')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ---- Practice Stats (for dashboard) ----
app.get('/api/practice-stats', async (req, res) => {
  const [logsRes, drillsRes] = await Promise.all([
    supabase.from('sc_practice_logs').select('id, date, location, duration, end_game, sc_log_drills(category, minutes)').order('date', { ascending: false }),
    supabase.from('sc_log_drills').select('category, minutes, drill_id, custom_drill_name, sc_drills(name), sc_practice_logs(date)').order('sc_practice_logs(date)', { ascending: false })
  ]);

  const logs = logsRes.data || [];
  const allLogDrills = drillsRes.data || [];

  // Category totals
  const categoryTotals = {};
  const CATEGORIES = ['hitting','throwing','fielding','baserunning','pitching','catching','situations','games'];
  CATEGORIES.forEach(c => { categoryTotals[c] = 0; });
  logs.forEach(p => {
    (p.sc_log_drills || []).forEach(d => {
      if (categoryTotals[d.category] !== undefined) categoryTotals[d.category] += (d.minutes || 0);
    });
  });

  // Drill frequency
  const drillFreq = {};
  allLogDrills.forEach(d => {
    const name = d.sc_drills?.name || d.custom_drill_name;
    if (name) drillFreq[name] = (drillFreq[name] || 0) + 1;
  });

  // Needs attention — categories not worked in last 2 practices
  const recentCats = new Set();
  logs.slice(0, 2).forEach(p => {
    (p.sc_log_drills || []).forEach(d => { if (d.minutes > 0) recentCats.add(d.category); });
  });
  const needsAttention = CATEGORIES.filter(c => !recentCats.has(c) && categoryTotals[c] > 0);

  res.json({
    categoryTotals,
    drillFrequency: drillFreq,
    totalPractices: logs.length,
    totalMinutes: logs.reduce((s, p) => s + (p.duration || 0), 0),
    lastPractice: logs[0] || null,
    needsAttention,
    practices: logs,
  });
});

// ---- Chat (streaming SSE) ----
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const today = new Date();
  const phase = getCurrentPhase(today);
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const [historyCtx, freqCtx] = await Promise.all([buildHistoryContext(3), getDrillFrequency()]);

  const contextPrefix = `Current date: ${dateStr}
Current season phase: ${phase.name} — ${phase.description}
Practice types: ${phase.practiceTypes.join(', ')}
Focus areas: ${phase.focusAreas.join('; ')}
${historyCtx}${freqCtx}\n\n`;

  const enrichedMessages = messages.map((msg, i) =>
    i === 0 && msg.role === 'user' ? { ...msg, content: contextPrefix + msg.content } : msg
  );

  try {
    const stream = await client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: enrichedMessages,
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`);
      }
    }
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

// ---- Practice Plan Generator (streaming SSE) ----

function buildPlanPrompt(detailLevel, { dateStr, phase, location, duration, players, focus, notes, historyCtx, freqCtx }) {
  const context = `Date: ${dateStr}
Season Phase: ${phase.name} -- ${phase.description}
Practice Location: ${location}
Duration: ${duration} minutes
Number of Players: ${players || '10-12'}
Primary Focus: ${focus}
Additional Notes: ${notes || 'None'}
${historyCtx}${freqCtx}`;

  if (detailLevel === 'quick') {
    return `Generate a concise, 1-page practice plan for today. Keep it brief -- this will be sent to the team.

${context}

Format as a simple outline:
- List each segment with its time allocation (e.g., "Bands & Huddle -- 5 min")
- Include drill names and group rotation counts, but NO detailed descriptions or coaching cues
- Include the daily throwing progression steps by name only (no explanations)
- Include fielding EDDs by name only
- ALWAYS end with a fun game or competition drill -- this is required
- End with Team Goals (Have fun! Be a great Teammate! Get better every day!)
- Do NOT include Megrem Softball references
- Keep the entire plan under 400 words`;
  }

  if (detailLevel === 'standard') {
    return `Generate a practice plan for today with moderate detail.

${context}

Create a structured practice plan:
- Follow our standard structure (bands, huddle, dynamic warmup, throwing progression, fielding EDDs, hitting stations, game, huddle)
- Include specific drill names, time allocations, and group rotations
- Include 1-2 key coaching cues per drill (brief, actionable)
- Include the daily throwing progression and fielding EDDs
- Adapt for the current season phase and location (${location})
- ALWAYS end with a fun game or competition drill -- this is required
- End with Team Goals (Have fun! Be a great Teammate! Get better every day!)
- Do NOT include Megrem Softball references
- Keep the plan concise but informative`;
  }

  // detailed -- current full behavior
  return `Generate a complete, detailed practice plan for today.

${context}

Create a fully structured practice plan:
- Follow our standard structure (bands, huddle, dynamic warmup, throwing progression, fielding EDDs, hitting stations, game, huddle)
- Include specific drill names, time allocations, group rotations, and coaching cues
- Include the daily throwing progression and fielding EDDs
- Adapt for the current season phase and location (${location})
- ALWAYS end with a fun game or competition drill (Home Run Derby, Fielding Olympics, Around the World, 21 Outs, etc.) -- this is required
- End with Team Goals (Have fun! Be a great Teammate! Get better every day!)
- Add a "Megrem Softball Reference" section with 2-3 YouTube search suggestions

Format it cleanly for printing.`;
}

const MAX_TOKENS_BY_LEVEL = { quick: 1200, standard: 2500, detailed: 4096 };

app.post('/api/practice-plan', async (req, res) => {
  const { location, duration, players, focus, notes, detailLevel = 'quick' } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const today = new Date();
  const phase = getCurrentPhase(today);
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const [historyCtx, freqCtx] = await Promise.all([buildHistoryContext(5), getDrillFrequency()]);

  const prompt = buildPlanPrompt(detailLevel, { dateStr, phase, location, duration, players, focus, notes, historyCtx, freqCtx });

  let fullPlanText = '';

  try {
    const stream = await client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: MAX_TOKENS_BY_LEVEL[detailLevel] || 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullPlanText += event.delta.text;
        res.write(`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`);
      }
    }

    // Auto-save plan to Supabase
    const today_str = today.toISOString().split('T')[0];
    const { data: saved } = await supabase
      .from('sc_practice_plans')
      .insert({ date: today_str, location, duration: parseInt(duration), players, focus, plan_text: fullPlanText, notes })
      .select('id')
      .single();

    res.write(`data: ${JSON.stringify({ type: 'done', plan_id: saved?.id })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

// ---- Research (streaming SSE) ----
app.post('/api/research', async (req, res) => {
  const { topic } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const prompt = `The coach wants to research: "${topic}" for 10U travel softball.

Please provide:
1. **Overview** — Brief explanation and why it matters at 10U
2. **Key Coaching Cues** — What to say and look for (3-5 bullet points)
3. **Common Errors** — Mistakes and corrections
4. **Drills to Try** — 2-3 specific drills with setup and execution
5. **Progression** — Beginner to advanced over the season
6. **Megrem Softball YouTube Searches** — 3-4 specific search terms

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
        res.write(`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`);
      }
    }
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`\n🥎 Softball Coach Assistant running at http://localhost:${PORT}\n`);
  const phase = getCurrentPhase();
  console.log(`Current season phase: ${phase.emoji} ${phase.name}`);
  console.log(`Supabase: ${process.env.SUPABASE_URL ? '✅ Connected' : '❌ Missing SUPABASE_URL'}\n`);
});
