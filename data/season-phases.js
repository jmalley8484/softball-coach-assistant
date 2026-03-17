// Season phase definitions for 10U Travel Softball
// Prior Lake Fastpitch program

const SEASON_PHASES = [
  {
    id: "dome",
    name: "Indoor Dome",
    emoji: "🏟️",
    dateRange: { startMonth: 3, startDay: 1, endMonth: 4, endDay: 14 },
    description: "Indoor dome practices — tight spaces, focus on fundamentals",
    practiceTypes: ["Dome", "Cage"],
    focusAreas: [
      "Daily throwing progression",
      "Swing mechanics & tee work",
      "Fielding EDDs (Secure, Forehand, Backhand)",
      "Catching mechanics",
      "Bands & dynamic warmup routine"
    ],
    avoid: ["Full baserunning", "Live pitching game situations", "Outfield work"],
    tip: "Repetition is key in the dome. Run your throwing progression EVERY practice. Players who own the fundamentals now will shine in May."
  },
  {
    id: "cages",
    name: "Cage & Dome",
    emoji: "⚾",
    dateRange: { startMonth: 4, startDay: 1, endMonth: 4, endDay: 25 },
    description: "Batting cage access opens up — add toss work and timing",
    practiceTypes: ["Cage", "Dome"],
    focusAreas: [
      "Tee progression (warm-up → top hand → bottom hand → extension → full swings)",
      "Front toss & soft toss",
      "Pitch recognition (colored ball toss drill)",
      "Contact points — inside vs. outside",
      "Continued throwing & fielding progressions"
    ],
    avoid: ["Full baserunning", "Live game situations"],
    tip: "Start building your hitting station rotation system now. 3 groups rotating keeps everyone busy and maximizes reps."
  },
  {
    id: "preseason",
    name: "Pre-Season Fields",
    emoji: "🌱",
    dateRange: { startMonth: 4, startDay: 26, endMonth: 5, endDay: 10 },
    description: "Outdoor fields open — integrate full team defense and baserunning",
    practiceTypes: ["Field", "Cage"],
    focusAreas: [
      "Baserunning fundamentals (run through first, rounding bases)",
      "Defensive positioning by situation",
      "Bunt defense",
      "Cutoffs and relays",
      "Outfield drop step and fly ball communication",
      "Live front toss / batting practice"
    ],
    avoid: [],
    tip: "League games start the second week of May. Use these practices to build game-ready habits. Run controlled scrimmages with specific focus situations."
  },
  {
    id: "season",
    name: "In-Season",
    emoji: "🏆",
    dateRange: { startMonth: 5, startDay: 11, endMonth: 6, endDay: 28 },
    description: "League games underway — balance development with game prep",
    practiceTypes: ["Field", "Cage"],
    focusAreas: [
      "Situational softball (first & third, bunt defense)",
      "Pitcher-specific preparation",
      "Game film / opponent tendencies",
      "Maintenance hitting work",
      "Keeping players fresh and confident"
    ],
    avoid: ["Introducing too many new concepts at once"],
    tip: "Keep practices crisp and energetic. Two nights per week on the field for 10U. Focus on 1-2 things per practice, not everything."
  },
  {
    id: "postseason",
    name: "Tournament Season",
    emoji: "🥇",
    dateRange: { startMonth: 6, startDay: 29, endMonth: 7, endDay: 31 },
    description: "State qualifiers and tournaments — peak performance focus",
    practiceTypes: ["Field"],
    focusAreas: [
      "Mental preparation and confidence building",
      "Short, sharp practices",
      "Game situations and execution",
      "Player roles and matchup awareness"
    ],
    avoid: ["Heavy physical load", "Overhauling mechanics mid-tournament"],
    tip: "State qualifiers are typically late June/early July. Trust the work done all season. Keep players confident and having fun."
  }
];

function getCurrentPhase(date = new Date()) {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  for (const phase of SEASON_PHASES) {
    const { startMonth, startDay, endMonth, endDay } = phase.dateRange;
    const current = month * 100 + day;
    const start = startMonth * 100 + startDay;
    const end = endMonth * 100 + endDay;
    if (current >= start && current <= end) {
      return phase;
    }
  }

  // Default to dome if before season, or postseason if after
  const dayOfYear = month * 100 + day;
  if (dayOfYear < 301) return SEASON_PHASES[0]; // Before March = dome prep
  return SEASON_PHASES[4]; // After July = fall planning
}

function getNextPhase(currentPhaseId) {
  const idx = SEASON_PHASES.findIndex(p => p.id === currentPhaseId);
  if (idx >= 0 && idx < SEASON_PHASES.length - 1) {
    return SEASON_PHASES[idx + 1];
  }
  return null;
}

module.exports = { SEASON_PHASES, getCurrentPhase, getNextPhase };
