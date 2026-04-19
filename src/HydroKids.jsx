import { useState, useEffect, useCallback } from "react";

// ── Google Sheets sync ────────────────────────────────────────────────────────
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzbWFYyvwzujf_VVXPYJ8JEgx3FvPedMVGsGHY0nfH0tkF0zBKanrG1_NXJr6dqIsoQYw/exec";

async function syncLog(userId, date, totalMl) {
  if (!APPS_SCRIPT_URL) return;
  try {
    await fetch(APPS_SCRIPT_URL + "?action=log", {
      method:"POST", mode:"no-cors",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ userId, date, totalMl }),
    });
  } catch(e) { console.warn("syncLog:", e); }
}

async function syncAll(logs) {
  if (!APPS_SCRIPT_URL) return;
  try {
    await fetch(APPS_SCRIPT_URL + "?action=sync", {
      method:"POST", mode:"no-cors",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ logs }),
    });
  } catch(e) { console.warn("syncAll:", e); }
}

async function syncProfile(user) {
  if (!APPS_SCRIPT_URL) return;
  try {
    await fetch(APPS_SCRIPT_URL + "?action=profile", {
      method:"POST", mode:"no-cors",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ userId:user.id, name:user.name, goal:user.goal, animal:user.animal, themeId:user.themeId, animalColorId:user.animalColorId }),
    });
  } catch(e) { console.warn("syncProfile:", e); }
}

// Push a single badge (or badge count update) to Sheets
async function syncBadge(userId, badgeId, count, firstEarned, lastEarned) {
  if (!APPS_SCRIPT_URL) return;
  try {
    await fetch(APPS_SCRIPT_URL + "?action=badge", {
      method:"POST", mode:"no-cors",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ userId, badgeId, count, firstEarned, lastEarned }),
    });
  } catch(e) { console.warn("syncBadge:", e); }
}

// Push the full items array for a user/date to Sheets (replaces any existing row)
async function syncItems(userId, date, items) {
  if (!APPS_SCRIPT_URL) return;
  try {
    await fetch(APPS_SCRIPT_URL + "?action=items", {
      method:"POST", mode:"no-cors",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ userId, date, items }),
    });
  } catch(e) { console.warn("syncItems:", e); }
}

// Fetch today's items for a specific past date (used by DayHistoryPanel)
async function fetchAndReplaceItems(userId, date) {
  if (!APPS_SCRIPT_URL) return null;
  try {
    const res = await fetch(APPS_SCRIPT_URL + `?action=items&userId=${userId}&date=${date}`);
    const j   = await res.json();
    if (j.status !== "ok") return null;
    return j.data.items;
  } catch(e) { return null; }
}

// ── Single bulk fetch — replaces all individual load-time fetches ─────────────
// One request returns: logs, profiles, badges, and today's items for all users.
// Reduces cold-start penalty from 5-6 round trips (~10s) to 1 (~1-2s).
async function bulkFetch(localUsers, localLogs, todayStr) {
  if (!APPS_SCRIPT_URL) return null;
  try {
    const res = await fetch(APPS_SCRIPT_URL + `?action=bulk&today=${todayStr}`);
    const j   = await res.json();
    if (j.status !== "ok") return null;
    const { logs, profiles, badges, todayItems } = j.data;

    // Merge logs — remote wins
    const mergedLogs = { ...localLogs, ...logs };

    // Merge profiles — remote wins per field
    const mergedUsers = localUsers.map(u => {
      const r = profiles.find(p => p.userId === u.id);
      if (!r) return u;
      return { ...u,
        name:         r.name          || u.name,
        goal:         r.goal          || u.goal,
        animal:       r.animal        || u.animal,
        themeId:      r.themeId       || u.themeId,
        animalColorId:r.animalColorId || u.animalColorId,
      };
    });

    // Badges — remote is authoritative per user (after local push)
    const mergedBadges = badges; // { userId: { badgeId: { count, first, last } } }

    // Today's items — remote wins per user
    const mergedItems = todayItems; // { userId: [...] }

    return { mergedLogs, mergedUsers, mergedBadges, mergedItems };
  } catch(e) {
    console.warn("bulkFetch failed (offline?):", e);
    return null;
  }
}
}

// ── Drink item log (localStorage only, per user per day) ─────────────────────
// Each item: { ml, time: ISO string, emoji }
function itemKey(userId, date) { return `tdd_items_${userId}_${date}`; }

function loadItems(userId, date) {
  try { return JSON.parse(localStorage.getItem(itemKey(userId, date)) || "[]"); }
  catch { return []; }
}

function saveItems(userId, date, items) {
  try { localStorage.setItem(itemKey(userId, date), JSON.stringify(items)); }
  catch {}
}

function drinkEmoji(ml) {
  if (ml <= 100) return "💧";
  if (ml <= 300) return "🥛";
  return "🍶";
}

// ── Sound effects ─────────────────────────────────────────────────────────────
function playSound(type) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const note = (freq, start, dur, vol=0.3, wave="sine") => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = wave;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(vol, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.02);
    };
    if (type === "splash") {
      note(700, 0, 0.12, 0.35, "sine");
      note(500, 0, 0.15, 0.2,  "sine");
      note(950, 0.05, 0.1, 0.15, "sine");
    } else if (type === "fanfare") {
      [[523,0],[659,0.11],[784,0.22],[1047,0.33]].forEach(([f,t]) => note(f, t, 0.28, 0.28, "triangle"));
    } else if (type === "badge") {
      [[440,0],[554,0.08],[659,0.16],[880,0.24]].forEach(([f,t]) => note(f, t, 0.22, 0.2, "sine"));
    }
  } catch(e) {}
}

// ── Badges ────────────────────────────────────────────────────────────────────
// repeatable: true  → count increments each time condition is met again
// repeatable: false → one-time unlock, count stays at 1
const BADGES = [
  { id:"first_drink",    emoji:"💧", label:"First Sip",      desc:"Log your very first drink",                repeatable:false },
  { id:"first_goal",     emoji:"🎯", label:"Goal Getter",    desc:"Hit your daily goal for the first time",   repeatable:false },
  { id:"streak_3",       emoji:"🔥", label:"On Fire",        desc:"Reach a 3 day streak",                     repeatable:false },
  { id:"streak_7",       emoji:"⚡", label:"Week Warrior",   desc:"Reach a 7 day streak",                     repeatable:false },
  { id:"streak_30",      emoji:"🏆", label:"Monthly Master", desc:"Reach a 30 day streak",                    repeatable:false },
  { id:"century",        emoji:"💯", label:"Century Club",   desc:"Every 100 drinks logged",                  repeatable:true  },
  { id:"perfect_week",   emoji:"🌊", label:"Perfect Week",   desc:"Hit your goal 7 days in a row",            repeatable:true  },
  { id:"super_hydrated", emoji:"⭐", label:"Super Hydrated", desc:"Exceed your goal by 20% in a day",         repeatable:true  },
];

// Migrate old badge format { id: "timestamp" } to new { id: { count, first, last } }
function migrateBadges(raw) {
  const out = {};
  Object.entries(raw).forEach(([id, val]) => {
    out[id] = typeof val === "string"
      ? { count:1, first:val, last:val }
      : val;
  });
  return out;
}

function loadBadges(userId) {
  return migrateBadges(JSON.parse(localStorage.getItem(`tdd_badges_${userId}`) || "{}"));
}

function saveBadgesLocal(userId, badges) {
  localStorage.setItem(`tdd_badges_${userId}`, JSON.stringify(badges));
}

function computeStats(userId, goal, logs) {
  const todayStr = today();
  let streak = 0, goalsHit = 0;

  // Current streak
  for (let i = 0; i < 60; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = `${userId}-${d.toISOString().split("T")[0]}`;
    if ((logs[key] || 0) >= goal) streak++;
    else if (i > 0) break;
  }

  // All-time goals hit
  Object.entries(logs).forEach(([key, val]) => {
    if (key.startsWith(userId + "-") && val >= goal) goalsHit++;
  });

  // Perfect week count — every 7 consecutive goal days = 1 perfect week
  let perfectWeeks = 0, run = 0;
  for (let i = 364; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = `${userId}-${d.toISOString().split("T")[0]}`;
    if ((logs[key] || 0) >= goal) {
      run++;
      if (run % 7 === 0) perfectWeeks++;
    } else {
      run = 0;
    }
  }

  // Today exceeded goal
  const todayVal     = logs[`${userId}-${todayStr}`] || 0;
  const exceededGoal = todayVal >= goal * 1.2;

  // Total days ever exceeded goal by 20%+
  const superHydratedDays = Object.entries(logs)
    .filter(([key, val]) => key.startsWith(userId + "-") && val >= goal * 1.2)
    .length;

  return { streak, goalsHit, perfectWeeks, exceededGoal, superHydratedDays };
}

// Returns { saved: updatedBadgeMap, newOnes: [ { ...badge, isFirstUnlock, newCount } ] }
function checkBadges(userId, goal, logs) {
  const stats    = computeStats(userId, goal, logs);
  const dcount   = parseInt(localStorage.getItem(`tdd_dcount_${userId}`) || "0");
  stats.totalDrinks = dcount;

  const saved   = loadBadges(userId);
  const newOnes = [];
  const now     = new Date().toISOString();

  const getCount = id => saved[id]?.count || 0;

  // One-time badges — only ever fire once (count = 1)
  const oneTime = {
    first_drink: () => stats.totalDrinks >= 1,
    first_goal:  () => stats.goalsHit    >= 1,
    streak_3:    () => stats.streak      >= 3,
    streak_7:    () => stats.streak      >= 7,
    streak_30:   () => stats.streak      >= 30,
  };
  Object.entries(oneTime).forEach(([id, check]) => {
    if (check() && getCount(id) === 0) {
      saved[id] = { count:1, first:now, last:now };
      newOnes.push({ ...BADGES.find(b => b.id === id), isFirstUnlock:true, newCount:1 });
    }
  });

  // Repeatable badges — target count computed from logs/stats
  const repeatable = {
    century:        Math.floor(stats.totalDrinks / 100),
    perfect_week:   stats.perfectWeeks,
    super_hydrated: stats.superHydratedDays,
  };
  Object.entries(repeatable).forEach(([id, target]) => {
    if (target <= 0) return;
    const current = getCount(id);
    if (target > current) {
      const first = current === 0 ? now : (saved[id]?.first || now);
      saved[id] = { count:target, first, last:now };
      newOnes.push({ ...BADGES.find(b => b.id === id), isFirstUnlock:current === 0, newCount:target });
    }
  });

  if (newOnes.length) saveBadgesLocal(userId, saved);
  return { saved, newOnes: newOnes.filter(Boolean) };
}

// ── Seasonal theme ────────────────────────────────────────────────────────────
function getSeasonalTheme() {
  const m = new Date().getMonth() + 1, d = new Date().getDate();
  if ((m === 12 && d >= 1) || (m === 1 && d <= 6))
    return { label:"🎄 Christmas!", emojis:["🎄","⛄","❄️","🎅","🌟"], bg:["#0d1f0d","#0d1a0d","#1a2e1a"] };
  if (m === 10 && d >= 25)
    return { label:"🎃 Halloween!", emojis:["🎃","👻","🕷️","🦇","🌙"], bg:["#1a0d00","#2d1b00","#1a0020"] };
  if (m >= 3 && m <= 5)
    return { label:"🌸 Spring!",    emojis:["🌸","🌺","🦋","🌼","🌱"], bg:["#0d1e2e","#1a1032","#0d2211"] };
  if (m >= 6 && m <= 8)
    return { label:"☀️ Summer!",    emojis:["☀️","🌊","🏖️","🌺","🍉"], bg:["#001a2e","#0d1e2e","#001a10"] };
  if (m >= 9 && m <= 11)
    return { label:"🍂 Autumn!",    emojis:["🍂","🍁","🌰","🍄","🦔"], bg:["#2e1a0d","#1a0d00","#2a1800"] };
  return   { label:"❄️ Winter!",    emojis:["❄️","⛄","🌨️","✨","💙"], bg:["#0d1a2e","#0d0d1a","#001a2e"] };
}

// ── Constants ─────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split("T")[0];

const THEME_COLOURS = [
  { id:"teal",    label:"Teal",    accent:"#2AA89A", light:"#E6F8F6", dark:"#1A7A6E" },
  { id:"coral",   label:"Coral",   accent:"#E07050", light:"#FFF0EA", dark:"#A84C30" },
  { id:"indigo",  label:"Indigo",  accent:"#5C6BC0", light:"#EDEFFE", dark:"#3949AB" },
  { id:"rose",    label:"Rose",    accent:"#E05C8A", light:"#FFEEF5", dark:"#B03468" },
  { id:"amber",   label:"Amber",   accent:"#D97706", light:"#FFF8E7", dark:"#92540A" },
  { id:"emerald", label:"Emerald", accent:"#059669", light:"#ECFDF5", dark:"#065F46" },
  { id:"purple",  label:"Purple",  accent:"#7C3AED", light:"#F3EEFF", dark:"#5B21B6" },
  { id:"sky",     label:"Sky",     accent:"#0284C7", light:"#E0F4FF", dark:"#075985" },
  { id:"pink",    label:"Pink",    accent:"#DB2777", light:"#FDF0F7", dark:"#9D174D" },
  { id:"lime",    label:"Lime",    accent:"#65A30D", light:"#F2FBEA", dark:"#3F6212" },
];

const ANIMAL_COLOURS = [
  { id:"mint",      label:"Mint",      color:"#52C4B5" },
  { id:"peach",     label:"Peach",     color:"#F4916A" },
  { id:"lavender",  label:"Lavender",  color:"#9B7FD4" },
  { id:"sky",       label:"Sky",       color:"#56ADEF" },
  { id:"rose",      label:"Rose",      color:"#F06EA0" },
  { id:"gold",      label:"Gold",      color:"#F5C842" },
  { id:"sage",      label:"Sage",      color:"#7DBD8A" },
  { id:"tangerine", label:"Tangerine", color:"#F4A23A" },
  { id:"lilac",     label:"Lilac",     color:"#C3A0E0" },
  { id:"crimson",   label:"Crimson",   color:"#E05555" },
];

const DEFAULT_USERS = [
  { id:"skylar", name:"Skylar", goal:1800, themeId:"teal",  animalColorId:"mint",  animal:"cat" },
  { id:"caia",   name:"Caia",   goal:1600, themeId:"coral", animalColorId:"peach", animal:"cat" },
];

const DRINKS = [
  { label:"Sip",    ml:100, emoji:"💧" },
  { label:"Glass",  ml:250, emoji:"🥛" },
  { label:"Bottle", ml:500, emoji:"🍶" },
];

const ANIMALS = [
  { id:"cat",     label:"Cat",     emoji:"🐱" },
  { id:"dog",     label:"Dog",     emoji:"🐶" },
  { id:"fish",    label:"Fish",    emoji:"🐟" },
  { id:"unicorn", label:"Unicorn", emoji:"🦄" },
  { id:"rabbit",  label:"Rabbit",  emoji:"🐰" },
];

const resolveTheme  = id => THEME_COLOURS.find(t=>t.id===id)  || THEME_COLOURS[0];
const resolveAnimal = id => ANIMAL_COLOURS.find(c=>c.id===id) || ANIMAL_COLOURS[0];
const userTheme     = u  => resolveTheme(u.themeId);
const userAColor    = u  => resolveAnimal(u.animalColorId).color;

// ── Animal faces ──────────────────────────────────────────────────────────────

function CatFace({ pct, color, size=118 }) {
  const happy=pct>=0.8, okay=pct>=0.4, sad=pct<0.25;
  const s=size, cx=s/2, cy=s/2;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{overflow:"visible"}}>
      {happy&&<circle cx={cx} cy={cy+5} r={s*.38} fill={color} opacity=".18"/>}
      <ellipse cx={cx} cy={cy+14} rx={s*.32} ry={s*.26} fill={color} opacity=".25"/>
      <ellipse cx={cx} cy={cy} rx={s*.36} ry={s*.33} fill={color}/>
      <polygon points={`${cx-s*.3},${cy-s*.25} ${cx-s*.38},${cy-s*.46} ${cx-s*.14},${cy-s*.32}`} fill={color}/>
      <polygon points={`${cx+s*.3},${cy-s*.25} ${cx+s*.38},${cy-s*.46} ${cx+s*.14},${cy-s*.32}`} fill={color}/>
      <polygon points={`${cx-s*.28},${cy-s*.27} ${cx-s*.35},${cy-s*.42} ${cx-s*.17},${cy-s*.31}`} fill="white" opacity=".45"/>
      <polygon points={`${cx+s*.28},${cy-s*.27} ${cx+s*.35},${cy-s*.42} ${cx+s*.17},${cy-s*.31}`} fill="white" opacity=".45"/>
      {sad?[cx-s*.14,cx+s*.14].map((ex,i)=>(<g key={i}><line x1={ex-s*.06} y1={cy-s*.06} x2={ex+s*.06} y2={cy+s*.06} stroke="#444" strokeWidth="2.5" strokeLinecap="round"/><line x1={ex+s*.06} y1={cy-s*.06} x2={ex-s*.06} y2={cy+s*.06} stroke="#444" strokeWidth="2.5" strokeLinecap="round"/></g>))
      :happy?<><path d={`M${cx-s*.22} ${cy} Q${cx-s*.14} ${cy-s*.1} ${cx-s*.06} ${cy}`} stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round"/><path d={`M${cx+s*.06} ${cy} Q${cx+s*.14} ${cy-s*.1} ${cx+s*.22} ${cy}`} stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round"/></>
      :<><ellipse cx={cx-s*.14} cy={cy-s*.01} rx={s*.07} ry={s*.075} fill="#333"/><ellipse cx={cx+s*.14} cy={cy-s*.01} rx={s*.07} ry={s*.075} fill="#333"/><circle cx={cx-s*.11} cy={cy-s*.04} r={s*.025} fill="white"/><circle cx={cx+s*.17} cy={cy-s*.04} r={s*.025} fill="white"/></>}
      <ellipse cx={cx} cy={cy+s*.1} rx={s*.04} ry={s*.03} fill="#FFAAB5"/>
      <line x1={cx} y1={cy+s*.13} x2={cx} y2={cy+s*.16} stroke="#FFAAB5" strokeWidth="1.5"/>
      {sad?<path d={`M${cx-s*.1} ${cy+s*.22} Q${cx} ${cy+s*.17} ${cx+s*.1} ${cy+s*.22}`} stroke="#555" strokeWidth="2" fill="none" strokeLinecap="round"/>:happy?<path d={`M${cx-s*.1} ${cy+s*.16} Q${cx} ${cy+s*.25} ${cx+s*.1} ${cy+s*.16}`} stroke="#555" strokeWidth="2" fill="none" strokeLinecap="round"/>:<path d={`M${cx-s*.07} ${cy+s*.18} Q${cx} ${cy+s*.21} ${cx+s*.07} ${cy+s*.18}`} stroke="#555" strokeWidth="1.8" fill="none" strokeLinecap="round"/>}
      {[[-1,-.06],[-1,.03],[1,-.06],[1,.03]].map(([dir,dy],i)=>(<line key={i} x1={cx+dir*(s*.06)} y1={cy+s*dy+s*.11} x2={cx+dir*(s*.38)} y2={cy+s*dy+s*.09+(dir===-1?-s*.015:s*.015)} stroke="#aaa" strokeWidth="1.2" strokeLinecap="round" opacity=".6"/>))}
      {(happy||okay)&&<><ellipse cx={cx-s*.27} cy={cy+s*.06} rx={s*.07} ry={s*.04} fill="#FFB3C1" opacity={happy?.5:.25}/><ellipse cx={cx+s*.27} cy={cy+s*.06} rx={s*.07} ry={s*.04} fill="#FFB3C1" opacity={happy?.5:.25}/></>}
      {happy&&<><text x={cx-s*.48} y={cy-s*.3} fontSize={s*.18}>✨</text><text x={cx+s*.32} y={cy-s*.32} fontSize={s*.16}>💧</text></>}
      {sad&&<text x={cx-s*.05} y={cy+s*.52} fontSize={s*.16}>😰</text>}
    </svg>
  );
}

function DogFace({ pct, color, size=118 }) {
  const happy=pct>=0.8, okay=pct>=0.4, sad=pct<0.25;
  const s=size, cx=s/2, cy=s/2;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{overflow:"visible"}}>
      {happy&&<circle cx={cx} cy={cy} r={s*.42} fill={color} opacity=".15"/>}
      <ellipse cx={cx-s*.34} cy={cy+s*.08} rx={s*.14} ry={s*.28} fill={color} opacity=".85" transform={`rotate(-12,${cx-s*.34},${cy+s*.08})`}/>
      <ellipse cx={cx+s*.34} cy={cy+s*.08} rx={s*.14} ry={s*.28} fill={color} opacity=".85" transform={`rotate(12,${cx+s*.34},${cy+s*.08})`}/>
      <ellipse cx={cx} cy={cy-s*.02} rx={s*.34} ry={s*.31} fill={color}/>
      <ellipse cx={cx} cy={cy+s*.14} rx={s*.18} ry={s*.13} fill="white" opacity=".6"/>
      <ellipse cx={cx} cy={cy+s*.08} rx={s*.07} ry={s*.05} fill="#333"/>
      <circle cx={cx-s*.025} cy={cy+s*.065} r={s*.018} fill="white" opacity=".7"/>
      {sad?[cx-s*.15,cx+s*.15].map((ex,i)=>(<g key={i}><line x1={ex-s*.06} y1={cy-s*.08} x2={ex+s*.06} y2={cy-s*.01} stroke="#444" strokeWidth="2.5" strokeLinecap="round"/><line x1={ex+s*.06} y1={cy-s*.08} x2={ex-s*.06} y2={cy-s*.01} stroke="#444" strokeWidth="2.5" strokeLinecap="round"/></g>))
      :happy?<><path d={`M${cx-s*.2} ${cy-s*.06} Q${cx-s*.13} ${cy-s*.14} ${cx-s*.06} ${cy-s*.06}`} stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round"/><path d={`M${cx+s*.06} ${cy-s*.06} Q${cx+s*.13} ${cy-s*.14} ${cx+s*.2} ${cy-s*.06}`} stroke="#333" strokeWidth="2.5" fill="none" strokeLinecap="round"/></>
      :<><ellipse cx={cx-s*.15} cy={cy-s*.07} rx={s*.065} ry={s*.07} fill="#333"/><ellipse cx={cx+s*.15} cy={cy-s*.07} rx={s*.065} ry={s*.07} fill="#333"/><circle cx={cx-s*.12} cy={cy-s*.1} r={s*.022} fill="white"/><circle cx={cx+s*.18} cy={cy-s*.1} r={s*.022} fill="white"/></>}
      {sad?<path d={`M${cx-s*.1} ${cy+s*.24} Q${cx} ${cy+s*.2} ${cx+s*.1} ${cy+s*.24}`} stroke="#888" strokeWidth="2" fill="none" strokeLinecap="round"/>:happy?<><path d={`M${cx-s*.1} ${cy+s*.18} Q${cx} ${cy+s*.27} ${cx+s*.1} ${cy+s*.18}`} stroke="#E07070" strokeWidth="2.5" fill="none" strokeLinecap="round"/><ellipse cx={cx} cy={cy+s*.22} rx={s*.07} ry={s*.04} fill="#FF9090" opacity=".5"/></>:<path d={`M${cx-s*.08} ${cy+s*.2} Q${cx} ${cy+s*.24} ${cx+s*.08} ${cy+s*.2}`} stroke="#888" strokeWidth="1.8" fill="none" strokeLinecap="round"/>}
      {(happy||okay)&&<><ellipse cx={cx-s*.3} cy={cy+s*.04} rx={s*.07} ry={s*.04} fill="#FFB3C1" opacity={happy?.5:.2}/><ellipse cx={cx+s*.3} cy={cy+s*.04} rx={s*.07} ry={s*.04} fill="#FFB3C1" opacity={happy?.5:.2}/></>}
      {happy&&<text x={cx-s*.08} y={cy-s*.42} fontSize={s*.22}>😛</text>}
      {sad&&<text x={cx-s*.05} y={cy+s*.54} fontSize={s*.16}>😢</text>}
    </svg>
  );
}

function FishFace({ pct, color, size=118 }) {
  const happy=pct>=0.8, sad=pct<0.25;
  const s=size, cx=s/2, cy=s/2;
  const bubbles=happy?[{x:cx+s*.38,y:cy-s*.28,r:s*.04},{x:cx+s*.48,y:cy-s*.42,r:s*.028},{x:cx+s*.42,y:cy-s*.54,r:s*.02}]:[];
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{overflow:"visible"}}>
      {happy&&<ellipse cx={cx} cy={cy} rx={s*.48} ry={s*.38} fill={color} opacity=".12"/>}
      <polygon points={`${cx+s*.3},${cy} ${cx+s*.54},${cy-s*.28} ${cx+s*.54},${cy+s*.28}`} fill={color} opacity=".7"/>
      <ellipse cx={cx-s*.04} cy={cy} rx={s*.38} ry={s*.28} fill={color}/>
      <ellipse cx={cx-s*.06} cy={cy+s*.06} rx={s*.26} ry={s*.16} fill="white" opacity=".35"/>
      <path d={`M${cx-s*.1} ${cy-s*.28} Q${cx+s*.06} ${cy-s*.44} ${cx+s*.14} ${cy-s*.18}`} fill={color} opacity=".8"/>
      <circle cx={cx-s*.22} cy={cy-s*.06} r={s*.1} fill="white"/>
      {sad?<><line x1={cx-s*.28} y1={cy-s*.1} x2={cx-s*.16} y2={cy-s*.02} stroke="#444" strokeWidth="2" strokeLinecap="round"/><line x1={cx-s*.16} y1={cy-s*.1} x2={cx-s*.28} y2={cy-s*.02} stroke="#444" strokeWidth="2" strokeLinecap="round"/></>:happy?<path d={`M${cx-s*.3} ${cy-s*.06} Q${cx-s*.22} ${cy-s*.16} ${cx-s*.14} ${cy-s*.06}`} stroke="#333" strokeWidth="2.2" fill="none" strokeLinecap="round"/>:<><ellipse cx={cx-s*.22} cy={cy-s*.06} rx={s*.055} ry={s*.065} fill="#222"/><circle cx={cx-s*.2} cy={cy-s*.09} r={s*.02} fill="white"/></>}
      {sad?<path d={`M${cx-s*.38} ${cy+s*.1} Q${cx-s*.34} ${cy+s*.06} ${cx-s*.3} ${cy+s*.1}`} stroke="#888" strokeWidth="1.8" fill="none" strokeLinecap="round"/>:happy?<path d={`M${cx-s*.38} ${cy+s*.06} Q${cx-s*.34} ${cy+s*.13} ${cx-s*.3} ${cy+s*.06}`} stroke="#555" strokeWidth="1.8" fill="none" strokeLinecap="round"/>:<circle cx={cx-s*.34} cy={cy+s*.08} r={s*.025} fill="#888"/>}
      {[[0,.08],[-.1,.02],[.1,.02],[-.05,-.08],[.05,-.08]].map(([dx,dy],i)=>(<ellipse key={i} cx={cx+dx*s} cy={cy+dy*s} rx={s*.06} ry={s*.04} fill="none" stroke="white" strokeWidth="1" opacity=".3"/>))}
      {bubbles.map((b,i)=><circle key={i} cx={b.x} cy={b.y} r={b.r} fill="none" stroke={color} strokeWidth="1.5" opacity=".7"/>)}
      {sad&&<text x={cx-s*.5} y={cy+s*.52} fontSize={s*.16}>💦</text>}
    </svg>
  );
}

function UnicornFace({ pct, color, size=118 }) {
  const happy=pct>=0.8, okay=pct>=0.4, sad=pct<0.25;
  const s=size, cx=s/2, cy=s/2;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{overflow:"visible"}}>
      {happy&&<circle cx={cx} cy={cy+s*.05} r={s*.42} fill={color} opacity=".15"/>}
      <ellipse cx={cx+s*.34} cy={cy-s*.18} rx={s*.1} ry={s*.2} fill="#C084FC" transform={`rotate(20,${cx+s*.34},${cy-s*.18})`}/>
      <ellipse cx={cx+s*.28} cy={cy-s*.24} rx={s*.09} ry={s*.18} fill="#F472B6" transform={`rotate(10,${cx+s*.28},${cy-s*.24})`}/>
      <ellipse cx={cx+s*.22} cy={cy-s*.27} rx={s*.08} ry={s*.16} fill="#818CF8"/>
      {happy&&<ellipse cx={cx+s*.15} cy={cy-s*.29} rx={s*.07} ry={s*.14} fill="#34D399" transform={`rotate(-8,${cx+s*.15},${cy-s*.29})`}/>}
      <polygon points={`${cx},${cy-s*.52} ${cx-s*.06},${cy-s*.28} ${cx+s*.06},${cy-s*.28}`} fill="#FCD34D"/>
      <line x1={cx} y1={cy-s*.5} x2={cx-s*.02} y2={cy-s*.3} stroke="#F59E0B" strokeWidth="1.2" opacity=".55"/>
      <polygon points={`${cx-s*.3},${cy-s*.22} ${cx-s*.38},${cy-s*.46} ${cx-s*.16},${cy-s*.3}`} fill={color}/>
      <polygon points={`${cx-s*.29},${cy-s*.24} ${cx-s*.35},${cy-s*.42} ${cx-s*.19},${cy-s*.31}`} fill="white" opacity=".45"/>
      <ellipse cx={cx} cy={cy+s*.04} rx={s*.35} ry={s*.32} fill={color}/>
      <ellipse cx={cx} cy={cy+s*.18} rx={s*.19} ry={s*.13} fill="white" opacity=".5"/>
      <circle cx={cx-s*.07} cy={cy+s*.19} r={s*.03} fill="#FDA4AF" opacity=".8"/>
      <circle cx={cx+s*.07} cy={cy+s*.19} r={s*.03} fill="#FDA4AF" opacity=".8"/>
      {sad?[cx-s*.14,cx+s*.14].map((ex,i)=>(<g key={i}><line x1={ex-s*.06} y1={cy-s*.04} x2={ex+s*.06} y2={cy+s*.03} stroke="#444" strokeWidth="2.4" strokeLinecap="round"/><line x1={ex+s*.06} y1={cy-s*.04} x2={ex-s*.06} y2={cy+s*.03} stroke="#444" strokeWidth="2.4" strokeLinecap="round"/></g>))
      :happy?<><path d={`M${cx-s*.22} ${cy} Q${cx-s*.14} ${cy-s*.1} ${cx-s*.06} ${cy}`} stroke="#333" strokeWidth="2.4" fill="none" strokeLinecap="round"/><path d={`M${cx+s*.06} ${cy} Q${cx+s*.14} ${cy-s*.1} ${cx+s*.22} ${cy}`} stroke="#333" strokeWidth="2.4" fill="none" strokeLinecap="round"/></>
      :<><ellipse cx={cx-s*.14} cy={cy-s*.01} rx={s*.07} ry={s*.075} fill="#333"/><ellipse cx={cx+s*.14} cy={cy-s*.01} rx={s*.07} ry={s*.075} fill="#333"/><circle cx={cx-s*.11} cy={cy-s*.04} r={s*.025} fill="white"/><circle cx={cx+s*.17} cy={cy-s*.04} r={s*.025} fill="white"/></>}
      {sad?<path d={`M${cx-s*.1} ${cy+s*.27} Q${cx} ${cy+s*.22} ${cx+s*.1} ${cy+s*.27}`} stroke="#888" strokeWidth="1.8" fill="none" strokeLinecap="round"/>:<path d={`M${cx-s*.1} ${cy+s*.22} Q${cx} ${cy+s*.3} ${cx+s*.1} ${cy+s*.22}`} stroke="#888" strokeWidth={happy?"2.2":"1.8"} fill="none" strokeLinecap="round"/>}
      {(happy||okay)&&<><ellipse cx={cx-s*.28} cy={cy+s*.1} rx={s*.07} ry={s*.04} fill="#FFB3C1" opacity={happy?.55:.25}/><ellipse cx={cx+s*.28} cy={cy+s*.1} rx={s*.07} ry={s*.04} fill="#FFB3C1" opacity={happy?.55:.25}/></>}
      {happy&&<><text x={cx-s*.52} y={cy-s*.28} fontSize={s*.18}>✨</text><text x={cx+s*.34} y={cy-s*.3} fontSize={s*.15}>🌈</text></>}
      {sad&&<text x={cx-s*.05} y={cy+s*.56} fontSize={s*.16}>😢</text>}
    </svg>
  );
}

function RabbitFace({ pct, color, size=118 }) {
  const happy=pct>=0.8, okay=pct>=0.4, sad=pct<0.25;
  const s=size, cx=s/2, cy=s/2;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{overflow:"visible"}}>
      {happy&&<circle cx={cx} cy={cy+s*.05} r={s*.42} fill={color} opacity=".15"/>}
      <ellipse cx={cx-s*.2} cy={cy-s*.42} rx={s*.1} ry={s*.26} fill={color}/>
      <ellipse cx={cx+s*.2} cy={cy-s*.42} rx={s*.1} ry={s*.26} fill={color}/>
      <ellipse cx={cx-s*.2} cy={cy-s*.42} rx={s*.055} ry={s*.2} fill="#FFCDD2" opacity=".7"/>
      <ellipse cx={cx+s*.2} cy={cy-s*.42} rx={s*.055} ry={s*.2} fill="#FFCDD2" opacity=".7"/>
      <ellipse cx={cx} cy={cy+s*.04} rx={s*.35} ry={s*.32} fill={color}/>
      <ellipse cx={cx-s*.28} cy={cy+s*.12} rx={s*.13} ry={s*.1} fill="white" opacity=".3"/>
      <ellipse cx={cx+s*.28} cy={cy+s*.12} rx={s*.13} ry={s*.1} fill="white" opacity=".3"/>
      <ellipse cx={cx} cy={cy+s*.1} rx={s*.04} ry={s*.03} fill="#FFAAB5"/>
      <line x1={cx} y1={cy+s*.13} x2={cx} y2={cy+s*.16} stroke="#FFAAB5" strokeWidth="1.4"/>
      {sad?[cx-s*.14,cx+s*.14].map((ex,i)=>(<g key={i}><line x1={ex-s*.06} y1={cy-s*.04} x2={ex+s*.06} y2={cy+s*.03} stroke="#444" strokeWidth="2.4" strokeLinecap="round"/><line x1={ex+s*.06} y1={cy-s*.04} x2={ex-s*.06} y2={cy+s*.03} stroke="#444" strokeWidth="2.4" strokeLinecap="round"/></g>))
      :happy?<><path d={`M${cx-s*.22} ${cy} Q${cx-s*.14} ${cy-s*.1} ${cx-s*.06} ${cy}`} stroke="#333" strokeWidth="2.4" fill="none" strokeLinecap="round"/><path d={`M${cx+s*.06} ${cy} Q${cx+s*.14} ${cy-s*.1} ${cx+s*.22} ${cy}`} stroke="#333" strokeWidth="2.4" fill="none" strokeLinecap="round"/></>
      :<><circle cx={cx-s*.14} cy={cy-s*.01} r={s*.07} fill="#555"/><circle cx={cx+s*.14} cy={cy-s*.01} r={s*.07} fill="#555"/><circle cx={cx-s*.11} cy={cy-s*.04} r={s*.024} fill="white"/><circle cx={cx+s*.17} cy={cy-s*.04} r={s*.024} fill="white"/></>}
      {sad?<path d={`M${cx-s*.1} ${cy+s*.22} Q${cx} ${cy+s*.17} ${cx+s*.1} ${cy+s*.22}`} stroke="#888" strokeWidth="1.8" fill="none" strokeLinecap="round"/>:<path d={`M${cx-s*.1} ${cy+s*.18} Q${cx} ${cy+s*.26} ${cx+s*.1} ${cy+s*.18}`} stroke="#888" strokeWidth={happy?"2.2":"1.8"} fill="none" strokeLinecap="round"/>}
      {(happy||okay)&&<><ellipse cx={cx-s*.28} cy={cy+s*.1} rx={s*.07} ry={s*.04} fill="#FFB3C1" opacity={happy?.5:.25}/><ellipse cx={cx+s*.28} cy={cy+s*.1} rx={s*.07} ry={s*.04} fill="#FFB3C1" opacity={happy?.5:.25}/></>}
      {happy&&<><text x={cx-s*.52} y={cy-s*.28} fontSize={s*.18}>✨</text><text x={cx+s*.34} y={cy-s*.3} fontSize={s*.15}>🥕</text></>}
      {sad&&<text x={cx-s*.05} y={cy+s*.56} fontSize={s*.16}>😢</text>}
    </svg>
  );
}

function AnimalFace({ animal, pct, color, size=118 }) {
  switch(animal) {
    case "dog":     return <DogFace     pct={pct} color={color} size={size}/>;
    case "fish":    return <FishFace    pct={pct} color={color} size={size}/>;
    case "unicorn": return <UnicornFace pct={pct} color={color} size={size}/>;
    case "rabbit":  return <RabbitFace  pct={pct} color={color} size={size}/>;
    default:        return <CatFace     pct={pct} color={color} size={size}/>;
  }
}

// ── Water Tank ────────────────────────────────────────────────────────────────
function WaterTank({ value, max, accentColor, animal, animalColor }) {
  const pct = Math.min(value / max, 1);
  const W=200, H=260, TX=12, TY=12, TW=176, TH=236, RX=28;
  const maxH   = TH - 4;
  const waterH = pct * maxH;
  const wTopY  = TY + TH - waterH;
  const botY   = TY + TH;
  const animalSz = 86;
  const animalTop = Math.max(TY + 2, wTopY - animalSz * 0.52);
  const wp = (flip) => {
    const amp = flip ? -10 : 10;
    let d = `M${TX},${wTopY}`;
    for (let i = 0; i <= 4; i++) {
      const x1=TX+i*TW, x2=TX+(i+0.5)*TW, x3=TX+(i+1)*TW;
      d += ` Q${(x1+x2)/2},${wTopY-amp} ${x2},${wTopY} Q${(x2+x3)/2},${wTopY+amp} ${x3},${wTopY}`;
    }
    d += ` L${TX+5*TW},${botY} L${TX},${botY} Z`;
    return d;
  };
  return (
    <div style={{ position:"relative", width:W, height:H, flexShrink:0 }}>
      <svg width={W} height={H} style={{ position:"absolute", inset:0 }}>
        <defs><clipPath id="tClip"><rect x={TX} y={TY} width={TW} height={TH} rx={RX}/></clipPath></defs>
        <rect x={TX} y={TY} width={TW} height={TH} rx={RX} fill={accentColor} opacity={0.07}/>
        {waterH>22&&<rect x={TX} y={wTopY+20} width={TW} height={Math.max(0,waterH-20)} fill={accentColor} opacity={0.28} clipPath="url(#tClip)"/>}
        {waterH>0&&<g clipPath="url(#tClip)"><path d={wp(false)} fill={accentColor} opacity={0.42} style={{animation:"tankWave1 3s linear infinite"}}/></g>}
        {waterH>0&&<g clipPath="url(#tClip)"><path d={wp(true)} fill={accentColor} opacity={0.2} style={{animation:"tankWave2 4.5s linear infinite"}}/></g>}
        {pct>0.08&&[{cx:TX+TW*.22,delay:"0s",dur:"2.8s"},{cx:TX+TW*.58,delay:"1.1s",dur:"3.4s"},{cx:TX+TW*.76,delay:"0.5s",dur:"2.4s"}].map((b,i)=>(
          <circle key={i} cx={b.cx} cy={wTopY+waterH*(0.3+i*0.15)} r={3+i*0.5} fill={accentColor} opacity={0.35} style={{animation:`bubbleRise ${b.dur} ${b.delay} ease-in infinite`}} clipPath="url(#tClip)"/>
        ))}
        {[0.25,0.5,0.75].map(lv=>{
          const my=TY+TH-lv*maxH, on=pct>=lv;
          return (<g key={lv}><line x1={TX+TW*.72} y1={my} x2={TX+TW-6} y2={my} stroke={accentColor} strokeWidth={1.5} opacity={on?0.55:0.18}/><text x={TX+TW*.70} y={my+4} fontSize={9} fill={accentColor} textAnchor="end" fontFamily="Nunito,sans-serif" fontWeight="700" opacity={on?0.65:0.2}>{Math.round(lv*100)}%</text></g>);
        })}
        <rect x={TX} y={TY} width={TW} height={TH} rx={RX} fill="none" stroke={accentColor} strokeWidth={2.5} opacity={0.28}/>
        {[[TX+13,TY+13],[TX+TW-13,TY+13],[TX+13,TY+TH-13],[TX+TW-13,TY+TH-13]].map(([bx,by],i)=>(
          <circle key={i} cx={bx} cy={by} r={4.5} fill="none" stroke={accentColor} strokeWidth={1.5} opacity={0.18}/>
        ))}
      </svg>
      <div style={{ position:"absolute", left:"50%", top:`${animalTop}px`, transform:"translateX(-50%)", transition:"top 0.9s cubic-bezier(0.4,0,0.2,1)", animation:"float 3.5s ease-in-out infinite", zIndex:2 }}>
        <AnimalFace animal={animal} pct={pct} color={animalColor} size={animalSz}/>
      </div>
    </div>
  );
}

// ── Supporting UI ─────────────────────────────────────────────────────────────

function SwatchGrid({ items, selected, onSelect, renderSwatch, cols=5 }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:`repeat(${cols},1fr)`, gap:8 }}>
      {items.map(item => {
        const sel = item.id === selected;
        return (
          <button key={item.id} onClick={()=>onSelect(item.id)}
            style={{ border:`3px solid ${sel?"#333":"transparent"}`, borderRadius:14, padding:"8px 4px 6px", cursor:"pointer", background:"white", display:"flex", flexDirection:"column", alignItems:"center", gap:4, boxShadow:sel?"0 2px 10px rgba(0,0,0,0.18)":"0 1px 4px rgba(0,0,0,0.06)", transform:sel?"scale(1.06)":"scale(1)", transition:"transform 0.12s" }}>
            {renderSwatch(item)}
            <div style={{ fontSize:9, fontWeight:800, color:sel?"#333":"#bbb" }}>{item.label}</div>
          </button>
        );
      })}
    </div>
  );
}

function WeekChart({ userId, goal, color, logs, onSelectDay }) {
  const days = [...Array(7)].map((_,i)=>{
    const d=new Date(); d.setDate(d.getDate()-(6-i));
    const dateStr = d.toISOString().split("T")[0];
    const key=`${userId}-${dateStr}`;
    return { label:d.toLocaleDateString("en-GB",{weekday:"short"}), val:logs[key]||0, isToday:i===6, date:dateStr };
  });
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:90, padding:"0 4px" }}>
      {days.map((d,i)=>{
        const rawPct  = d.val / goal;
        const visPct  = Math.min(rawPct, 1);          // capped for bar height
        const dispPct = Math.round(rawPct * 100);     // uncapped for label
        const over    = rawPct >= 1;
        const hasDrinks = d.val > 0;
        return (
          <div key={i} onClick={()=>hasDrinks && onSelectDay(d.date)}
            style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3, cursor:hasDrinks?"pointer":"default" }}>
            {/* Percentage label — only shown when there's data */}
            <div style={{ fontSize:9, fontWeight:800, color: over?"#4CAF85": hasDrinks?color:"transparent", minHeight:12, lineHeight:"12px" }}>
              {hasDrinks ? `${dispPct}%` : ""}
            </div>
            <div style={{ width:"100%", height:44, borderRadius:8, background:"#f0f0f0", position:"relative", overflow:"hidden" }}
              onMouseDown={e=>{ if(hasDrinks) e.currentTarget.style.transform="scale(0.92)"; }}
              onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
              onTouchStart={e=>{ if(hasDrinks) e.currentTarget.style.transform="scale(0.92)"; }}
              onTouchEnd={e=>e.currentTarget.style.transform="scale(1)"}>
              <div style={{ position:"absolute", bottom:0, width:"100%", height:`${visPct*100}%`, background:over?"#4CAF85":color, borderRadius:"6px 6px 0 0", transition:"height 0.4s ease" }}/>
            </div>
            <div style={{ fontSize:10, fontWeight:d.isToday?800:600, color:d.isToday?color:"#bbb" }}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function CustomDrink({ color, light, onAdd }) {
  const [open,setOpen]=useState(false), [val,setVal]=useState("");
  const submit=()=>{const ml=parseInt(val);if(ml>0&&ml<=2000){onAdd(ml);setVal("");setOpen(false);}};
  return (
    <div style={{ marginTop:10 }}>
      {!open
        ?<button onClick={()=>setOpen(true)} style={{ width:"100%", border:`2px dashed ${color}55`, background:"transparent", borderRadius:18, padding:"12px", color, fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"'Nunito',sans-serif" }}>+ Custom amount</button>
        :<div style={{ display:"flex", gap:8, alignItems:"center", background:light, borderRadius:18, padding:"8px 12px", border:`2px solid ${color}33` }}>
          <input autoFocus type="number" placeholder="ml" value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} style={{ flex:1, border:"none", background:"transparent", fontSize:18, fontWeight:800, color:"#333", fontFamily:"'Nunito',sans-serif", outline:"none" }}/>
          <button onClick={submit} style={{ background:color, border:"none", borderRadius:12, padding:"8px 18px", color:"white", fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"'Nunito',sans-serif" }}>Add</button>
          <button onClick={()=>setOpen(false)} style={{ background:"none", border:"none", color:"#bbb", fontWeight:800, fontSize:18, cursor:"pointer" }}>✕</button>
        </div>}
    </div>
  );
}

function SectionCard({ title, hint, children }) {
  return (
    <div style={{ background:"white", borderRadius:24, padding:"20px", marginBottom:16, boxShadow:"0 4px 20px rgba(0,0,0,0.05)" }}>
      <div style={{ fontSize:11, fontWeight:800, letterSpacing:1.5, color:"#bbb", marginBottom:hint?4:12 }}>{title}</div>
      {hint&&<div style={{ fontSize:11, color:"#ccc", fontWeight:600, marginBottom:12 }}>{hint}</div>}
      {children}
    </div>
  );
}

// ── Drink log ─────────────────────────────────────────────────────────────────
function DrinkLog({ userId, date, color, dark, onDelete }) {
  const items = loadItems(userId, date);
  if (items.length === 0) return (
    <div style={{ background:"white", borderRadius:24, padding:"16px 18px", boxShadow:"0 4px 20px rgba(0,0,0,0.05)" }}>
      <div style={{ fontSize:11, fontWeight:800, letterSpacing:1.5, color:"#bbb", marginBottom:10 }}>TODAY'S DRINKS</div>
      <div style={{ fontSize:13, color:"#ccc", fontWeight:600, textAlign:"center", padding:"12px 0" }}>No drinks logged yet</div>
    </div>
  );

  const fmt = iso => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
  };

  return (
    <div style={{ background:"white", borderRadius:24, padding:"16px 18px", boxShadow:"0 4px 20px rgba(0,0,0,0.05)" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <div style={{ fontSize:11, fontWeight:800, letterSpacing:1.5, color:"#bbb" }}>TODAY'S DRINKS</div>
        <div style={{ fontSize:11, fontWeight:800, color:color }}>
          {items.reduce((s,i)=>s+i.ml,0)}ml total
        </div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {[...items].reverse().map((item, idx) => (
          <div key={idx} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", background:"#fafafa", borderRadius:14 }}>
            <div style={{ fontSize:20, width:28, textAlign:"center" }}>{item.emoji}</div>
            <div style={{ flex:1 }}>
              <span style={{ fontWeight:800, fontSize:14, color:dark }}>{item.ml}ml</span>
              {item.label && <span style={{ fontSize:12, color:"#bbb", fontWeight:600, marginLeft:6 }}>{item.label}</span>}
            </div>
            <div style={{ fontSize:12, fontWeight:700, color:"#bbb", minWidth:38, textAlign:"right" }}>{fmt(item.time)}</div>
            {/* Only allow deleting the most recent item (index 0 of reversed = last item) */}
            {idx === 0 && (
              <button onClick={()=>onDelete()} style={{ background:"none", border:"none", color:"#ddd", fontSize:16, cursor:"pointer", padding:"0 2px", lineHeight:1 }}>✕</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Day history panel ─────────────────────────────────────────────────────────
async function fetchItemsForDate(userId, date) {
  if (!APPS_SCRIPT_URL) return null;
  try {
    const res = await fetch(APPS_SCRIPT_URL + `?action=items&userId=${userId}&date=${date}`);
    const j   = await res.json();
    if (j.status !== "ok") return null;
    return j.data.items;
  } catch(e) { return null; }
}

function DayHistoryPanel({ userId, date, goal, logTotal, color, dark, accent, onClose }) {
  const [items, setItems] = useState(null); // null = loading

  useEffect(()=>{
    // Try local first for instant display
    const local = loadItems(userId, date);
    setItems(local);

    // Then fetch from Sheets and replace if different
    fetchItemsForDate(userId, date).then(remote => {
      if (remote !== null) {
        saveItems(userId, date, remote);
        setItems(remote);
      }
    });
  }, [userId, date]);

  const fmt = iso => new Date(iso).toLocaleTimeString("en-GB",{ hour:"2-digit", minute:"2-digit" });
  const friendlyDate = new Date(date + "T12:00:00").toLocaleDateString("en-GB",{ weekday:"long", day:"numeric", month:"long" });

  // Always use the authoritative log total for the percentage — not the items sum,
  // which can diverge if drinks were logged before item tracking was introduced.
  const pct = goal > 0 ? Math.round((logTotal / goal) * 100) : 0;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:80, animation:"fadeUp 0.2s ease" }}/>

      {/* Panel */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:"white", borderRadius:"28px 28px 0 0", zIndex:90, padding:"0 0 40px", boxShadow:"0 -8px 40px rgba(0,0,0,0.18)", animation:"slideUp 0.28s cubic-bezier(0.4,0,0.2,1)" }}>

        {/* Handle */}
        <div style={{ display:"flex", justifyContent:"center", padding:"12px 0 4px" }}>
          <div style={{ width:36, height:4, borderRadius:2, background:"#e0e0e0" }}/>
        </div>

        {/* Header */}
        <div style={{ padding:"8px 20px 16px", borderBottom:"1px solid #f0f0f0" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontWeight:900, fontSize:17, color:"#333" }}>{friendlyDate}</div>
              <div style={{ fontSize:13, color:"#bbb", fontWeight:600, marginTop:2 }}>
                {logTotal}ml · {pct}% of goal
              </div>
            </div>
            <button onClick={onClose} style={{ background:"#f5f5f5", border:"none", borderRadius:"50%", width:32, height:32, fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#999" }}>✕</button>
          </div>
          {/* Mini progress bar */}
          <div style={{ height:6, background:"#f0f0f0", borderRadius:3, marginTop:12, overflow:"hidden" }}>
            <div style={{ height:6, borderRadius:3, background:pct>=100?"#4CAF85":accent, width:`${Math.min(pct,100)}%`, transition:"width 0.4s ease" }}/>
          </div>
        </div>

        {/* Items list */}
        <div style={{ padding:"12px 20px 0", maxHeight:320, overflowY:"auto" }}>
          {items === null ? (
            <div style={{ textAlign:"center", padding:"32px 0", color:"#bbb", fontSize:13, fontWeight:600 }}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={{ textAlign:"center", padding:"32px 0", color:"#bbb", fontSize:13, fontWeight:600 }}>No drinks recorded for this day</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {[...items].reverse().map((item, idx) => (
                <div key={idx} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", background:"#fafafa", borderRadius:14 }}>
                  <div style={{ fontSize:22, width:30, textAlign:"center" }}>{item.emoji}</div>
                  <div style={{ flex:1 }}>
                    <span style={{ fontWeight:800, fontSize:15, color:"#333" }}>{item.ml}ml</span>
                    {item.label && <span style={{ fontSize:12, color:"#bbb", fontWeight:600, marginLeft:6 }}>{item.label}</span>}
                  </div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#bbb" }}>{fmt(item.time)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Badge screen ──────────────────────────────────────────────────────────────
function BadgeScreen({ user, logs, onBack }) {
  const theme    = userTheme(user);
  const badges   = loadBadges(user.id);
  const stats    = computeStats(user.id, user.goal, logs);
  const dcount   = parseInt(localStorage.getItem(`tdd_dcount_${user.id}`) || "0");

  const unlockedCount = Object.keys(badges).length;
  const totalTally    = Object.values(badges).reduce((s, b) => s + (b.count || 1), 0);

  return (
    <div style={{ minHeight:"100vh", background:theme.light, fontFamily:"'Nunito',sans-serif", maxWidth:430, margin:"0 auto", paddingBottom:48 }}>
      <div style={{ background:theme.accent, borderRadius:"0 0 36px 36px", padding:"20px 20px 30px", color:"white", display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:`0 8px 30px ${theme.accent}55` }}>
        <button onClick={onBack} style={{ background:"rgba(255,255,255,0.18)", border:"none", borderRadius:14, padding:"8px 16px", color:"white", fontSize:13, fontWeight:800, cursor:"pointer", fontFamily:"'Nunito',sans-serif" }}>← Back</button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontWeight:900, fontSize:22 }}>{user.name}'s Badges</div>
          <div style={{ fontSize:12, opacity:0.8, fontWeight:700, marginTop:1 }}>
            {unlockedCount} of {BADGES.length} types · {totalTally} total
          </div>
        </div>
        <div style={{ width:60 }}/>
      </div>

      {/* Stats strip */}
      <div style={{ display:"flex", gap:10, padding:"20px 20px 0" }}>
        {[
          { label:"Streak",        val:`${stats.streak}d`, emoji:"🔥" },
          { label:"Goals Hit",     val:stats.goalsHit,     emoji:"🎯" },
          { label:"Total Drinks",  val:dcount,             emoji:"💧" },
          { label:"Total Badges",  val:totalTally,         emoji:"🏅" },
        ].map((s,i)=>(
          <div key={i} style={{ flex:1, background:"white", borderRadius:18, padding:"10px 6px", textAlign:"center", boxShadow:"0 4px 16px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize:18 }}>{s.emoji}</div>
            <div style={{ fontWeight:900, fontSize:16, color:theme.dark, marginTop:2 }}>{s.val}</div>
            <div style={{ fontSize:9, fontWeight:700, color:"#bbb" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Badge grid */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, padding:"16px 20px 0" }}>
        {BADGES.map(badge => {
          const data = badges[badge.id];
          const on   = !!data;
          const count = data?.count || 0;
          const dt   = data?.last ? new Date(data.last).toLocaleDateString("en-GB",{day:"numeric",month:"short"}) : null;

          return (
            <div key={badge.id} style={{ background:on?"white":"rgba(0,0,0,0.04)", borderRadius:22, padding:"20px 16px", textAlign:"center", opacity:on?1:0.42, boxShadow:on?"0 4px 18px rgba(0,0,0,0.07)":"none", border:on?`2px solid ${theme.accent}28`:"2px solid transparent", transition:"all 0.2s", position:"relative" }}>

              {/* Count badge for repeatable badges earned more than once */}
              {on && badge.repeatable && count > 1 && (
                <div style={{ position:"absolute", top:10, right:12, background:theme.accent, color:"white", borderRadius:20, padding:"3px 9px", fontSize:12, fontWeight:900 }}>
                  ×{count}
                </div>
              )}

              <div style={{ fontSize:36, marginBottom:8, filter:on?"none":"grayscale(1)" }}>{badge.emoji}</div>
              <div style={{ fontWeight:900, fontSize:13, color:theme.dark, marginBottom:4 }}>{badge.label}</div>

              {on ? (
                <div style={{ fontSize:11, color:theme.accent, fontWeight:700 }}>
                  {badge.repeatable && count > 1
                    ? `${count}× · Last ${dt}`
                    : `✓ ${dt}`}
                </div>
              ) : (
                <div style={{ fontSize:11, color:"#bbb", fontWeight:600 }}>{badge.desc}</div>
              )}

              {/* For repeatable badges, show a small progress hint when unlocked */}
              {on && badge.repeatable && (
                <div style={{ fontSize:10, color:"#ccc", marginTop:3, fontWeight:600 }}>
                  {badge.id === "century"        && `${dcount} drinks total`}
                  {badge.id === "perfect_week"   && `${stats.perfectWeeks} perfect weeks`}
                  {badge.id === "super_hydrated" && `${stats.superHydratedDays} days`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Settings screen ───────────────────────────────────────────────────────────
function SettingsScreen({ user, onSave, onBack }) {
  const [goal,setGoal]     = useState(user.goal);
  const [animal,setAnimal] = useState(user.animal||"cat");
  const [name,setName]     = useState(user.name);
  const [themeId,setTheme] = useState(user.themeId||"teal");
  const [colorId,setColor] = useState(user.animalColorId||"mint");
  const presets = [800,1000,1200,1400,1600,1800,2000,2500];
  const pt = resolveTheme(themeId);
  const pac = resolveAnimal(colorId).color;
  const handleSave = () => {
    const g = parseInt(goal);
    if (g >= 200 && g <= 5000) onSave({ ...user, goal:g, animal, name:name.trim()||user.name, themeId, animalColorId:colorId });
  };
  return (
    <div style={{ minHeight:"100vh", background:pt.light, fontFamily:"'Nunito',sans-serif", maxWidth:430, margin:"0 auto", paddingBottom:56 }}>
      <div style={{ background:pt.accent, borderRadius:"0 0 36px 36px", padding:"20px 20px 30px", color:"white", display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:`0 8px 30px ${pt.accent}55` }}>
        <button onClick={onBack} style={{ background:"rgba(255,255,255,0.18)", border:"none", borderRadius:14, padding:"8px 16px", color:"white", fontSize:13, fontWeight:800, cursor:"pointer", fontFamily:"'Nunito',sans-serif" }}>← Back</button>
        <div style={{ fontWeight:900, fontSize:22 }}>⚙️ Settings</div>
        <button onClick={handleSave} style={{ background:"rgba(255,255,255,0.25)", border:"none", borderRadius:14, padding:"8px 16px", color:"white", fontSize:13, fontWeight:800, cursor:"pointer", fontFamily:"'Nunito',sans-serif" }}>Save ✓</button>
      </div>
      <div style={{ padding:"24px 20px 0" }}>
        <SectionCard title="NAME">
          <input value={name} onChange={e=>setName(e.target.value)} style={{ width:"100%", border:`2px solid ${pt.accent}44`, borderRadius:14, padding:"12px 16px", fontSize:18, fontWeight:800, color:"#333", fontFamily:"'Nunito',sans-serif", outline:"none", boxSizing:"border-box", background:pt.light }}/>
        </SectionCard>
        <SectionCard title="THEME COLOUR" hint="Header, ring and background colour">
          <SwatchGrid items={THEME_COLOURS} selected={themeId} onSelect={setTheme} cols={5}
            renderSwatch={item=><div style={{ width:32, height:32, borderRadius:10, background:item.accent, boxShadow:`0 3px 8px ${item.accent}55` }}/>}/>
        </SectionCard>
        <SectionCard title="PET ANIMAL">
          <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:16 }}>
            {ANIMALS.map(a=>{
              const sel=a.id===animal;
              return (
                <button key={a.id} onClick={()=>setAnimal(a.id)}
                  style={{ border:`2.5px solid ${sel?pt.accent:"#eee"}`, background:sel?pt.light:"white", borderRadius:18, padding:"10px 4px 8px", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:4, boxShadow:sel?"0 2px 10px rgba(0,0,0,0.1)":"none" }}>
                  <div style={{ fontSize:24 }}>{a.emoji}</div>
                  <div style={{ fontSize:9, fontWeight:800, color:sel?pt.accent:"#bbb" }}>{a.label}</div>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize:11, fontWeight:800, letterSpacing:1.5, color:"#bbb", marginBottom:10 }}>ANIMAL COLOUR</div>
          <SwatchGrid items={ANIMAL_COLOURS} selected={colorId} onSelect={setColor} cols={5}
            renderSwatch={item=><div style={{ width:32, height:32, borderRadius:"50%", background:item.color, boxShadow:`0 3px 8px ${item.color}55` }}/>}/>
          <div style={{ display:"flex", justifyContent:"center", marginTop:18, padding:"14px", background:pt.light, borderRadius:18, border:`2px solid ${pt.accent}22` }}>
            <div style={{ animation:"float 3s ease-in-out infinite" }}>
              <AnimalFace animal={animal} pct={0.65} color={pac} size={90}/>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="DAILY WATER GOAL" hint="Recommended: 9–11 yr ≈ 1400–1800ml/day">
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
            {presets.map(p=>(
              <button key={p} onClick={()=>setGoal(p)}
                style={{ border:`2px solid ${parseInt(goal)===p?pt.accent:"#eee"}`, background:parseInt(goal)===p?pt.light:"white", borderRadius:12, padding:"7px 14px", fontWeight:800, fontSize:13, color:parseInt(goal)===p?pt.accent:"#999", cursor:"pointer", fontFamily:"'Nunito',sans-serif" }}>
                {p}ml
              </button>
            ))}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <input type="number" value={goal} onChange={e=>setGoal(e.target.value)} min="200" max="5000"
              style={{ flex:1, border:`2px solid ${pt.accent}44`, borderRadius:14, padding:"12px 16px", fontSize:20, fontWeight:800, color:"#333", fontFamily:"'Nunito',sans-serif", outline:"none", background:pt.light }}/>
            <span style={{ fontWeight:800, color:"#bbb", fontSize:16 }}>ml</span>
          </div>
        </SectionCard>
        <button onClick={handleSave}
          style={{ width:"100%", background:pt.accent, border:"none", borderRadius:22, padding:"18px", color:"white", fontSize:18, fontWeight:900, cursor:"pointer", fontFamily:"'Nunito',sans-serif", boxShadow:`0 6px 24px ${pt.accent}55` }}>
          Save Changes ✓
        </button>
      </div>
    </div>
  );
}

// ── Select screen ─────────────────────────────────────────────────────────────
function SelectScreen({ users, logs, onSelect, onSettings }) {
  const season = getSeasonalTheme();
  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(160deg,${season.bg[0]} 0%,${season.bg[1]} 55%,${season.bg[2]} 100%)`, display:"flex", flexDirection:"column", fontFamily:"'Nunito',sans-serif", position:"relative", overflow:"hidden" }}>
      {season.emojis.map((e,i)=>(
        <div key={i} style={{ position:"absolute", fontSize:26, opacity:0.13, top:`${[12,22,68,78,42][i]}%`, left:`${[4,82,6,78,48][i]}%`, animation:`float ${2.5+i*0.4}s ease-in-out infinite`, animationDelay:`${i*0.5}s`, pointerEvents:"none" }}>{e}</div>
      ))}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"20px 22px 8px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          <span style={{ fontSize:18 }}>💧</span>
          <span style={{ fontSize:15, fontWeight:900, color:"rgba(255,255,255,0.6)", letterSpacing:-0.3, fontFamily:"'Nunito',sans-serif" }}>The Daily Drink</span>
        </div>
        <span style={{ fontSize:11, color:"rgba(255,255,255,0.3)", fontWeight:700 }}>{season.label}</span>
      </div>
      <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"12px 18px 28px" }}>
        <p style={{ color:"rgba(255,255,255,0.4)", fontSize:13, fontWeight:700, margin:"0 0 18px", textAlign:"center", letterSpacing:0.5 }}>Who's drinking today?</p>
        {users.map((u,idx)=>{
          const theme=userTheme(u), aColor=userAColor(u);
          const intake=logs[`${u.id}-${today()}`]||0;
          const rawPct = intake/u.goal;
          const visPct = Math.min(rawPct, 1);           // capped — for bar width only
          const pctDisplay = Math.round(rawPct * 100);  // uncapped — shown as number
          const animalInfo=ANIMALS.find(a=>a.id===(u.animal||"cat"));
          const badges=loadBadges(u.id);
          const badgeCount=Object.keys(badges).length;
          const badgeTally=Object.values(badges).reduce((s,b)=>s+(b.count||1),0);
          return (
            <div key={u.id} style={{ marginBottom:idx<users.length-1?16:0, animation:`pop 0.4s ease ${idx*0.12}s both`, position:"relative" }}>
              <div onClick={()=>onSelect(u)}
                style={{ background:"rgba(255,255,255,0.09)", border:"1.5px solid rgba(255,255,255,0.13)", backdropFilter:"blur(16px)", borderRadius:32, padding:"22px 20px", cursor:"pointer", display:"flex", alignItems:"center", gap:18 }}
                onMouseDown={e=>e.currentTarget.style.transform="scale(0.97)"} onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
                onTouchStart={e=>e.currentTarget.style.transform="scale(0.97)"} onTouchEnd={e=>e.currentTarget.style.transform="scale(1)"}>
                <div style={{ width:80, height:80, borderRadius:"50%", background:theme.light, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, border:`3px solid ${theme.accent}55`, boxShadow:`0 0 22px ${theme.accent}33` }}>
                  <AnimalFace animal={u.animal||"cat"} pct={intake/u.goal} color={aColor} size={66}/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <div style={{ fontWeight:900, fontSize:24, color:"white", letterSpacing:-0.5 }}>{u.name}</div>
                    <div style={{ fontSize:18 }}>{animalInfo?.emoji}</div>
                    {badgeTally > 0 && (
                      <div style={{ background:"rgba(255,215,0,0.22)", border:"1px solid rgba(255,215,0,0.38)", borderRadius:10, padding:"2px 8px", fontSize:11, fontWeight:800, color:"rgba(255,215,0,0.9)" }}>
                        🏅 {badgeTally}
                      </div>
                    )}
                  </div>
                  <div style={{ height:8, background:"rgba(255,255,255,0.12)", borderRadius:4, marginBottom:8, overflow:"hidden" }}>
                    <div style={{ height:8, borderRadius:4, background:visPct>=1?"#4CAF85":theme.accent, width:`${visPct*100}%`, transition:"width 0.5s ease", boxShadow:`0 0 8px ${visPct>=1?"#4CAF8588":theme.accent+"88"}` }}/>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ fontSize:13, color:"rgba(255,255,255,0.45)", fontWeight:700 }}>
                      {intake}ml <span style={{ opacity:0.5 }}>/ {u.goal}ml</span>
                    </div>
                    <div style={{ background:visPct>=1?"#4CAF85":theme.accent, borderRadius:12, padding:"4px 14px", fontWeight:900, fontSize:15, color:"white", boxShadow:`0 2px 8px ${visPct>=1?"#4CAF8566":theme.accent+"66"}` }}>
                      {pctDisplay}%
                    </div>
                  </div>
                </div>
              </div>
              <button onClick={e=>{e.stopPropagation();onSettings(u);}}
                style={{ position:"absolute", top:-6, right:-6, width:36, height:36, borderRadius:"50%", background:"rgba(255,255,255,0.14)", border:"1.5px solid rgba(255,255,255,0.25)", color:"white", fontSize:15, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(8px)" }}>
                ⚙️
              </button>
            </div>
          );
        })}
      </div>
      <p style={{ color:"rgba(255,255,255,0.14)", fontSize:11, textAlign:"center", margin:"0 0 16px", fontWeight:600 }}>☁️ Cloud sync enabled</p>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function TheDailyDrink() {
  const [screen,setScreen]           = useState("select");
  const [users,setUsers]             = useState(DEFAULT_USERS);
  const [user,setUser]               = useState(null);
  const [logs,setLogs]               = useState({});
  const [celebrating,setCelebrating] = useState(false);
  const [justAdded,setJustAdded]     = useState(null);
  const [syncing,setSyncing]         = useState(false);
  const [newBadge,setNewBadge]       = useState(null);
  const [itemTick,setItemTick]       = useState(0);
  const [selectedDay,setSelectedDay] = useState(null); // date string or null

  const persistLogs  = useCallback(nl=>{setLogs(nl);  try{localStorage.setItem("hydrokids_logs",JSON.stringify(nl));}catch{}}, []);
  const persistUsers = useCallback(nu=>{setUsers(nu); try{localStorage.setItem("hydrokids_users",JSON.stringify(nu));}catch{}}, []);

  useEffect(()=>{
    const init = async () => {
      try {
        const sl = localStorage.getItem("hydrokids_logs");
        const su = localStorage.getItem("hydrokids_users");
        let localLogs  = sl ? JSON.parse(sl) : {};
        let localUsers = su ? JSON.parse(su) : DEFAULT_USERS;

        // Show local data instantly — no waiting for network
        setLogs(localLogs);
        setUsers(localUsers);
        setSyncing(true);

        const todayStr = today();

        // ── Step 1: push local badges up first (offline-earned badges preserved) ──
        // Fire-and-forget in parallel — doesn't block the bulk fetch
        DEFAULT_USERS.forEach(u => {
          const local = loadBadges(u.id);
          Object.entries(local).forEach(([id, b]) =>
            syncBadge(u.id, id, b.count||1, b.first||b, b.last||b)
          );
        });

        // ── Step 2: single bulk fetch — 1 round trip instead of 5-6 ─────────────
        const bulk = await bulkFetch(localUsers, localLogs, todayStr);

        if (bulk) {
          const { mergedLogs, mergedUsers, mergedBadges, mergedItems } = bulk;

          persistLogs(mergedLogs);
          persistUsers(mergedUsers);

          // Apply badges per user — Sheets is authoritative
          DEFAULT_USERS.forEach(u => {
            if (mergedBadges[u.id]) saveBadgesLocal(u.id, mergedBadges[u.id]);
          });

          // Apply today's items per user — Sheets is authoritative
          DEFAULT_USERS.forEach(u => {
            if (mergedItems[u.id] !== undefined) {
              saveItems(u.id, todayStr, mergedItems[u.id]);
            } else {
              // Not on Sheets yet — push local up
              const local = loadItems(u.id, todayStr);
              if (local.length > 0) syncItems(u.id, todayStr, local);
            }
          });

          // Push full log state up to Sheets (catches any offline drinks)
          syncAll(mergedLogs);

          setItemTick(t => t + 1); // refresh DrinkLog display
        }

      } catch(e) { console.warn("init:", e); }
      finally { setSyncing(false); }
    };
    init();
  }, []);

  // ── Android back button handler ───────────────────────────────────────────
  // Push a history entry whenever we navigate away from "select" so the
  // browser's back gesture/button returns to select rather than exiting the app.
  useEffect(()=>{
    if (screen === "select") {
      // Replace so there's always a clean base entry
      history.replaceState({ screen:"select" }, "");
    } else {
      history.pushState({ screen }, "");
    }
  }, [screen]);

  useEffect(()=>{
    const onPop = (e) => {
      // Always go back to select, regardless of which screen we're on
      setScreen("select");
      setSelectedDay(null);
      // Re-push so the next back press is also caught
      history.pushState({ screen:"select" }, "");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const addDrink = (ml, label) => {
    const key  = `${user.id}-${today()}`;
    const prev = logs[key]||0, next = prev + ml;
    persistLogs({ ...logs, [key]:next });
    syncLog(user.id, today(), next);

    // Record individual drink item
    const items = loadItems(user.id, today());
    items.push({ ml, time: new Date().toISOString(), emoji: drinkEmoji(ml), label: label||null });
    saveItems(user.id, today(), items);
    syncItems(user.id, today(), items);
    setItemTick(t => t + 1);

    const dc = parseInt(localStorage.getItem(`tdd_dcount_${user.id}`) || "0") + 1;
    localStorage.setItem(`tdd_dcount_${user.id}`, String(dc));

    playSound("splash");
    setJustAdded(`+${ml}ml`);
    setTimeout(()=>setJustAdded(null), 1400);

    const { saved, newOnes } = checkBadges(user.id, user.goal, { ...logs, [key]:next });
    if (newOnes.length) {
      playSound("badge");
      setNewBadge(newOnes[0]);
      setTimeout(()=>setNewBadge(null), 3000);
      // Sync each updated badge to Sheets
      newOnes.forEach(b => {
        const bd = saved[b.id];
        if (bd) syncBadge(user.id, b.id, bd.count, bd.first, bd.last);
      });
    }

    if (next >= user.goal && prev < user.goal) {
      setTimeout(()=>{ playSound("fanfare"); setCelebrating(true); }, 200);
      setTimeout(()=>setCelebrating(false), 3500);
    }
  };

  const undoLast = () => {
    const key  = `${user.id}-${today()}`;
    const prev = logs[key]||0;
    if (prev === 0) return;
    const items = loadItems(user.id, today());
    const last  = items.pop();
    saveItems(user.id, today(), items);
    syncItems(user.id, today(), items);
    setItemTick(t => t + 1);
    const next = Math.max(0, prev - (last?.ml || 100));
    persistLogs({ ...logs, [key]:next });
    syncLog(user.id, today(), next);
  };

  const getStreak = (userId, goalAmt) => {
    let s=0;
    for(let i=0;i<60;i++){
      const d=new Date(); d.setDate(d.getDate()-i);
      const key=`${userId}-${d.toISOString().split("T")[0]}`;
      if((logs[key]||0)>=goalAmt) s++; else if(i>0) break;
    }
    return s;
  };

  const saveSettings = updated => {
    persistUsers(users.map(u=>u.id===updated.id?updated:u));
    setUser(updated);
    syncProfile(updated);
    setScreen("main");
  };

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
    @keyframes float      { 0%,100%{transform:translateY(0)}   50%{transform:translateY(-7px)} }
    @keyframes pop        { 0%{transform:scale(0.7) translateY(10px);opacity:0} 100%{transform:scale(1) translateY(0);opacity:1} }
    @keyframes toastUp    { 0%{opacity:0;transform:translateY(0)} 20%{opacity:1;transform:translateY(-14px)} 80%{opacity:1;transform:translateY(-14px)} 100%{opacity:0;transform:translateY(-28px)} }
    @keyframes celebrate  { 0%{transform:scale(0.5);opacity:0} 60%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
    @keyframes fadeUp     { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
    @keyframes spin       { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    @keyframes badgePop   { 0%{transform:scale(0.4) translateY(20px);opacity:0} 60%{transform:scale(1.1)} 100%{transform:scale(1);opacity:1} }
    @keyframes tankWave1  { from{transform:translateX(0)} to{transform:translateX(-176px)} }
    @keyframes tankWave2  { from{transform:translateX(0)} to{transform:translateX(176px)} }
    @keyframes bubbleRise { 0%{transform:translateY(0);opacity:0.35} 100%{transform:translateY(-55px);opacity:0} }
    @keyframes slideUp    { from{transform:translateX(-50%) translateY(100%)} to{transform:translateX(-50%) translateY(0)} }
  `;

  if (screen==="select") return (
    <>
      <style>{CSS}</style>
      {syncing&&<div style={{ position:"fixed", top:12, right:12, zIndex:200, background:"rgba(0,0,0,0.5)", borderRadius:20, padding:"6px 12px", color:"white", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", gap:6 }}><span style={{ display:"inline-block", animation:"spin 1s linear infinite" }}>⟳</span> Syncing…</div>}
      <SelectScreen users={users} logs={logs} onSelect={u=>{setUser(u);setScreen("main");}} onSettings={u=>{setUser(u);setScreen("settings");}}/>
    </>
  );

  if (screen==="settings") return (
    <><style>{CSS}</style><SettingsScreen user={user} onSave={saveSettings} onBack={()=>setScreen("main")}/></>
  );

  if (screen==="badges") return (
    <><style>{CSS}</style><BadgeScreen user={user} logs={logs} onBack={()=>setScreen("main")}/></>
  );

  const cu          = users.find(u=>u.id===user.id)||user;
  const theme       = userTheme(cu);
  const aColor      = userAColor(cu);
  const intake      = logs[`${cu.id}-${today()}`]||0;
  const hydPct      = intake/cu.goal;
  const streak      = getStreak(cu.id, cu.goal);
  const remaining   = Math.max(0, cu.goal-intake);
  const mood        = hydPct>=1   ? { text:"Goal smashed! 🎉",        sub:"Your pet is glowing!" }
                    : hydPct>=.75 ? { text:"Almost there! 💪",        sub:`Just ${remaining}ml to go` }
                    : hydPct>=.4  ? { text:"Good progress 👍",        sub:`${remaining}ml remaining` }
                                  : { text:"Thirsty! Please drink 😰", sub:`${remaining}ml to go` };
  const animalLabel = ANIMALS.find(a=>a.id===(cu.animal||"cat"));
  const curBadges   = loadBadges(cu.id);
  const badgeTally  = Object.values(curBadges).reduce((s,b)=>s+(b.count||1),0);

  return (
    <div style={{ minHeight:"100vh", background:theme.light, fontFamily:"'Nunito',sans-serif", maxWidth:430, margin:"0 auto", paddingBottom:40, position:"relative", overflow:"hidden" }}>
      <style>{CSS}</style>

      <div style={{ background:theme.accent, borderRadius:"0 0 36px 36px", padding:"20px 20px 28px", color:"white", display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:`0 8px 30px ${theme.accent}55` }}>
        <button onClick={()=>setScreen("select")} style={{ background:"rgba(255,255,255,0.18)", border:"none", borderRadius:14, padding:"8px 16px", color:"white", fontSize:13, fontWeight:800, cursor:"pointer", fontFamily:"'Nunito',sans-serif" }}>← Back</button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontWeight:900, fontSize:22, letterSpacing:-0.5 }}>{cu.name} {animalLabel?.emoji}</div>
          <div style={{ fontSize:12, opacity:0.8, fontWeight:700, marginTop:1 }}>{streak>0?`🔥 ${streak} day streak`:"Start your streak today!"}</div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={undoLast} style={{ background:"rgba(255,255,255,0.18)", border:"none", borderRadius:14, padding:"8px 12px", color:"white", fontSize:13, fontWeight:800, cursor:"pointer", fontFamily:"'Nunito',sans-serif" }}>↩</button>
          <button onClick={()=>setScreen("badges")} style={{ background:"rgba(255,255,255,0.18)", border:"none", borderRadius:14, padding:"8px 10px", color:"white", fontSize:14, cursor:"pointer", position:"relative" }}>
            🏅
            {badgeTally>0&&<div style={{ position:"absolute", top:-4, right:-4, background:"#FFD700", borderRadius:"50%", width:18, height:18, fontSize:9, fontWeight:900, color:"#333", display:"flex", alignItems:"center", justifyContent:"center" }}>{badgeTally}</div>}
          </button>
          <button onClick={()=>setScreen("settings")} style={{ background:"rgba(255,255,255,0.18)", border:"none", borderRadius:14, padding:"8px 10px", color:"white", fontSize:14, cursor:"pointer" }}>⚙️</button>
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"22px 24px 4px" }}>
        <WaterTank value={intake} max={cu.goal} accentColor={theme.accent} lightColor={theme.light} animal={cu.animal||"cat"} animalColor={aColor}/>
        <div style={{ textAlign:"center", marginTop:8 }}>
          <div style={{ fontSize:38, fontWeight:900, color:theme.dark, lineHeight:1, letterSpacing:-1 }}>
            {intake}<span style={{ fontSize:17, fontWeight:700, color:"#bbb", marginLeft:3 }}>ml</span>
          </div>
          <div style={{ fontWeight:700, color:"#bbb", fontSize:13, marginTop:2 }}>of {cu.goal}ml daily goal</div>
          <div style={{ marginTop:8, background:theme.accent+"18", borderRadius:16, padding:"7px 18px", display:"inline-block" }}>
            <div style={{ fontWeight:800, color:theme.accent, fontSize:14 }}>{mood.text}</div>
            <div style={{ fontWeight:600, color:theme.accent+"aa", fontSize:11, marginTop:1 }}>{mood.sub}</div>
          </div>
        </div>
      </div>

      <div style={{ padding:"16px 20px 0" }}>
        <div style={{ fontSize:11, fontWeight:800, letterSpacing:1.5, color:"#bbb", marginBottom:10 }}>ADD A DRINK</div>
        <div style={{ display:"flex", gap:10 }}>
          {DRINKS.map(d=>(
            <button key={d.label} onClick={()=>addDrink(d.ml)}
              style={{ flex:1, border:"none", background:"white", borderRadius:22, padding:"14px 8px", cursor:"pointer", fontFamily:"'Nunito',sans-serif", boxShadow:"0 4px 16px rgba(0,0,0,0.07)", outline:`2.5px solid ${aColor}30`, transition:"transform 0.1s" }}
              onMouseDown={e=>e.currentTarget.style.transform="scale(0.93)"} onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}>
              <div style={{ fontSize:26 }}>{d.emoji}</div>
              <div style={{ fontWeight:900, fontSize:13, color:theme.dark, marginTop:3 }}>{d.label}</div>
              <div style={{ fontWeight:700, fontSize:11, color:"#bbb" }}>{d.ml}ml</div>
            </button>
          ))}
        </div>
        <CustomDrink color={theme.accent} light={theme.light} onAdd={addDrink}/>
      </div>

      <div style={{ padding:"16px 20px 0" }} key={itemTick}>
        <DrinkLog
          userId={cu.id}
          date={today()}
          color={theme.accent}
          dark={theme.dark}
          onDelete={undoLast}
        />
      </div>

      <div style={{ padding:"16px 20px 0" }}>
        <div style={{ background:"white", borderRadius:24, padding:"16px 16px 12px", boxShadow:"0 4px 20px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize:11, fontWeight:800, letterSpacing:1.5, color:"#bbb", marginBottom:12 }}>THIS WEEK <span style={{ fontSize:10, fontWeight:600, color:"#ccc", letterSpacing:0 }}>· tap a bar to see details</span></div>
          <WeekChart userId={cu.id} goal={cu.goal} color={theme.accent} logs={logs} onSelectDay={setSelectedDay}/>
        </div>
      </div>

      {justAdded&&<div style={{ position:"fixed", bottom:100, left:"50%", transform:"translateX(-50%)", background:theme.accent, color:"white", fontWeight:900, fontSize:18, borderRadius:20, padding:"10px 28px", animation:"toastUp 1.4s ease forwards", pointerEvents:"none", zIndex:50 }}>{justAdded} 💧</div>}

      {newBadge&&(
        <div style={{ position:"fixed", bottom:140, left:"50%", transform:"translateX(-50%)", background:"#1a1a2e", color:"white", borderRadius:24, padding:"14px 22px", zIndex:60, animation:"badgePop 0.4s ease", display:"flex", alignItems:"center", gap:12, boxShadow:"0 8px 32px rgba(0,0,0,0.4)", pointerEvents:"none", whiteSpace:"nowrap" }}>
          <span style={{ fontSize:30 }}>{newBadge.emoji}</span>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"#FFD700", letterSpacing:1 }}>
              {newBadge.isFirstUnlock ? "BADGE UNLOCKED" : `BADGE ×${newBadge.newCount}`}
            </div>
            <div style={{ fontSize:15, fontWeight:900 }}>{newBadge.label}</div>
          </div>
        </div>
      )}

      {celebrating&&<div onClick={()=>setCelebrating(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", zIndex:100, cursor:"pointer", animation:"fadeUp 0.3s ease" }}>
        <div style={{ animation:"celebrate 0.5s ease", textAlign:"center" }}>
          <div style={{ fontSize:90 }}>🎉</div>
          <div style={{ fontFamily:"'Nunito',sans-serif", fontWeight:900, fontSize:32, color:"white", lineHeight:1.2, marginTop:12 }}>Goal reached,<br/>{cu.name}!</div>
          <div style={{ color:"rgba(255,255,255,0.7)", fontSize:16, fontWeight:700, marginTop:10 }}>Your {animalLabel?.label} is SO happy! {animalLabel?.emoji}✨</div>
          <div style={{ color:"rgba(255,255,255,0.4)", fontSize:13, marginTop:24 }}>Tap to continue</div>
        </div>
      </div>}

      {selectedDay && (
        <DayHistoryPanel
          userId={cu.id}
          date={selectedDay}
          goal={cu.goal}
          logTotal={logs[`${cu.id}-${selectedDay}`] || 0}
          color={userAColor(cu)}
          dark={theme.dark}
          accent={theme.accent}
          onClose={()=>setSelectedDay(null)}
        />
      )}
    </div>
  );
}
