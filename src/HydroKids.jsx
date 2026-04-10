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
  } catch(e) { console.warn("syncLog failed:", e); }
}

async function syncAll(logs) {
  if (!APPS_SCRIPT_URL) return;
  try {
    await fetch(APPS_SCRIPT_URL + "?action=sync", {
      method:"POST", mode:"no-cors",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ logs }),
    });
  } catch(e) { console.warn("syncAll failed:", e); }
}

async function syncProfile(user) {
  if (!APPS_SCRIPT_URL) return;
  try {
    await fetch(APPS_SCRIPT_URL + "?action=profile", {
      method:"POST", mode:"no-cors",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        userId:       user.id,
        name:         user.name,
        goal:         user.goal,
        animal:       user.animal,
        themeId:      user.themeId,
        animalColorId:user.animalColorId,
      }),
    });
  } catch(e) { console.warn("syncProfile failed:", e); }
}

async function fetchAndMergeLogs(localLogs) {
  if (!APPS_SCRIPT_URL) return localLogs;
  try {
    const res  = await fetch(APPS_SCRIPT_URL + "?action=fetch");
    const json = await res.json();
    if (json.status !== "ok") return localLogs;
    return { ...localLogs, ...json.data.logs };
  } catch(e) { return localLogs; }
}

// Fetch profiles from Sheets and merge into local users array.
// Remote wins on every field — it's the source of truth for settings.
async function fetchAndMergeProfiles(localUsers) {
  if (!APPS_SCRIPT_URL) return localUsers;
  try {
    const res  = await fetch(APPS_SCRIPT_URL + "?action=profiles");
    const json = await res.json();
    if (json.status !== "ok") return localUsers;
    const remoteProfiles = json.data.profiles; // array of profile objects
    return localUsers.map(u => {
      const remote = remoteProfiles.find(p => p.userId === u.id);
      if (!remote) return u;
      return {
        ...u,
        name:         remote.name         || u.name,
        goal:         remote.goal         || u.goal,
        animal:       remote.animal       || u.animal,
        themeId:      remote.themeId      || u.themeId,
        animalColorId:remote.animalColorId|| u.animalColorId,
      };
    });
  } catch(e) { return localUsers; }
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
      {sad?<path d={`M${cx-s*.1} ${cy+s*.22} Q${cx} ${cy+s*.17} ${cx+s*.1} ${cy+s*.22}`} stroke="#555" strokeWidth="2" fill="none" strokeLinecap="round"/>
      :happy?<path d={`M${cx-s*.1} ${cy+s*.16} Q${cx} ${cy+s*.25} ${cx+s*.1} ${cy+s*.16}`} stroke="#555" strokeWidth="2" fill="none" strokeLinecap="round"/>
      :<path d={`M${cx-s*.07} ${cy+s*.18} Q${cx} ${cy+s*.21} ${cx+s*.07} ${cy+s*.18}`} stroke="#555" strokeWidth="1.8" fill="none" strokeLinecap="round"/>}
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
      {sad?<path d={`M${cx-s*.1} ${cy+s*.24} Q${cx} ${cy+s*.2} ${cx+s*.1} ${cy+s*.24}`} stroke="#888" strokeWidth="2" fill="none" strokeLinecap="round"/>
      :happy?<><path d={`M${cx-s*.1} ${cy+s*.18} Q${cx} ${cy+s*.27} ${cx+s*.1} ${cy+s*.18}`} stroke="#E07070" strokeWidth="2.5" fill="none" strokeLinecap="round"/><ellipse cx={cx} cy={cy+s*.22} rx={s*.07} ry={s*.04} fill="#FF9090" opacity=".5"/></>
      :<path d={`M${cx-s*.08} ${cy+s*.2} Q${cx} ${cy+s*.24} ${cx+s*.08} ${cy+s*.2}`} stroke="#888" strokeWidth="1.8" fill="none" strokeLinecap="round"/>}
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
      {sad?<><line x1={cx-s*.28} y1={cy-s*.1} x2={cx-s*.16} y2={cy-s*.02} stroke="#444" strokeWidth="2" strokeLinecap="round"/><line x1={cx-s*.16} y1={cy-s*.1} x2={cx-s*.28} y2={cy-s*.02} stroke="#444" strokeWidth="2" strokeLinecap="round"/></>
      :happy?<path d={`M${cx-s*.3} ${cy-s*.06} Q${cx-s*.22} ${cy-s*.16} ${cx-s*.14} ${cy-s*.06}`} stroke="#333" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      :<><ellipse cx={cx-s*.22} cy={cy-s*.06} rx={s*.055} ry={s*.065} fill="#222"/><circle cx={cx-s*.2} cy={cy-s*.09} r={s*.02} fill="white"/></>}
      {sad?<path d={`M${cx-s*.38} ${cy+s*.1} Q${cx-s*.34} ${cy+s*.06} ${cx-s*.3} ${cy+s*.1}`} stroke="#888" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      :happy?<path d={`M${cx-s*.38} ${cy+s*.06} Q${cx-s*.34} ${cy+s*.13} ${cx-s*.3} ${cy+s*.06}`} stroke="#555" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      :<circle cx={cx-s*.34} cy={cy+s*.08} r={s*.025} fill="#888"/>}
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
      {/* Mane — behind head */}
      <ellipse cx={cx+s*.34} cy={cy-s*.18} rx={s*.1} ry={s*.2} fill="#C084FC" transform={`rotate(20,${cx+s*.34},${cy-s*.18})`}/>
      <ellipse cx={cx+s*.28} cy={cy-s*.24} rx={s*.09} ry={s*.18} fill="#F472B6" transform={`rotate(10,${cx+s*.28},${cy-s*.24})`}/>
      <ellipse cx={cx+s*.22} cy={cy-s*.27} rx={s*.08} ry={s*.16} fill="#818CF8" transform={`rotate(0,${cx+s*.22},${cy-s*.27})`}/>
      {happy&&<ellipse cx={cx+s*.15} cy={cy-s*.29} rx={s*.07} ry={s*.14} fill="#34D399" transform={`rotate(-8,${cx+s*.15},${cy-s*.29})`}/>}
      {/* Horn */}
      <polygon points={`${cx},${cy-s*.52} ${cx-s*.06},${cy-s*.28} ${cx+s*.06},${cy-s*.28}`} fill="#FCD34D"/>
      <line x1={cx} y1={cy-s*.5} x2={cx-s*.02} y2={cy-s*.3} stroke="#F59E0B" strokeWidth="1.2" opacity=".55"/>
      {/* Ear */}
      <polygon points={`${cx-s*.3},${cy-s*.22} ${cx-s*.38},${cy-s*.46} ${cx-s*.16},${cy-s*.3}`} fill={color}/>
      <polygon points={`${cx-s*.29},${cy-s*.24} ${cx-s*.35},${cy-s*.42} ${cx-s*.19},${cy-s*.31}`} fill="white" opacity=".45"/>
      {/* Head */}
      <ellipse cx={cx} cy={cy+s*.04} rx={s*.35} ry={s*.32} fill={color}/>
      {/* Snout */}
      <ellipse cx={cx} cy={cy+s*.18} rx={s*.19} ry={s*.13} fill="white" opacity=".5"/>
      {/* Nose dots */}
      <circle cx={cx-s*.07} cy={cy+s*.19} r={s*.03} fill="#FDA4AF" opacity=".8"/>
      <circle cx={cx+s*.07} cy={cy+s*.19} r={s*.03} fill="#FDA4AF" opacity=".8"/>
      {/* Eyes */}
      {sad?[cx-s*.14,cx+s*.14].map((ex,i)=>(<g key={i}><line x1={ex-s*.06} y1={cy-s*.04} x2={ex+s*.06} y2={cy+s*.03} stroke="#444" strokeWidth="2.4" strokeLinecap="round"/><line x1={ex+s*.06} y1={cy-s*.04} x2={ex-s*.06} y2={cy+s*.03} stroke="#444" strokeWidth="2.4" strokeLinecap="round"/></g>))
      :happy?<><path d={`M${cx-s*.22} ${cy} Q${cx-s*.14} ${cy-s*.1} ${cx-s*.06} ${cy}`} stroke="#333" strokeWidth="2.4" fill="none" strokeLinecap="round"/><path d={`M${cx+s*.06} ${cy} Q${cx+s*.14} ${cy-s*.1} ${cx+s*.22} ${cy}`} stroke="#333" strokeWidth="2.4" fill="none" strokeLinecap="round"/></>
      :<><ellipse cx={cx-s*.14} cy={cy-s*.01} rx={s*.07} ry={s*.075} fill="#333"/><ellipse cx={cx+s*.14} cy={cy-s*.01} rx={s*.07} ry={s*.075} fill="#333"/><circle cx={cx-s*.11} cy={cy-s*.04} r={s*.025} fill="white"/><circle cx={cx+s*.17} cy={cy-s*.04} r={s*.025} fill="white"/></>}
      {/* Mouth */}
      {sad?<path d={`M${cx-s*.1} ${cy+s*.27} Q${cx} ${cy+s*.22} ${cx+s*.1} ${cy+s*.27}`} stroke="#888" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      :<path d={`M${cx-s*.1} ${cy+s*.22} Q${cx} ${cy+s*.3} ${cx+s*.1} ${cy+s*.22}`} stroke="#888" strokeWidth={happy?"2.2":"1.8"} fill="none" strokeLinecap="round"/>}
      {/* Cheeks */}
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
      {sad?<path d={`M${cx-s*.1} ${cy+s*.22} Q${cx} ${cy+s*.17} ${cx+s*.1} ${cy+s*.22}`} stroke="#888" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      :<path d={`M${cx-s*.1} ${cy+s*.18} Q${cx} ${cy+s*.26} ${cx+s*.1} ${cy+s*.18}`} stroke="#888" strokeWidth={happy?"2.2":"1.8"} fill="none" strokeLinecap="round"/>}
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

// ── UI helpers ────────────────────────────────────────────────────────────────

function SwatchGrid({ items, selected, onSelect, renderSwatch, cols=5 }) {
  return (
    <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:8}}>
      {items.map(item=>{
        const sel=item.id===selected;
        return (
          <button key={item.id} onClick={()=>onSelect(item.id)}
            style={{border:`3px solid ${sel?"#333":"transparent"}`,borderRadius:14,padding:"8px 4px 6px",cursor:"pointer",background:"white",display:"flex",flexDirection:"column",alignItems:"center",gap:4,boxShadow:sel?"0 2px 10px rgba(0,0,0,0.18)":"0 1px 4px rgba(0,0,0,0.06)",transform:sel?"scale(1.06)":"scale(1)",transition:"transform 0.12s"}}>
            {renderSwatch(item)}
            <div style={{fontSize:9,fontWeight:800,color:sel?"#333":"#bbb"}}>{item.label}</div>
          </button>
        );
      })}
    </div>
  );
}

function Ring({ value, max, color, size=210 }) {
  const pct=Math.min(value/max,1), r=(size-22)/2, circ=2*Math.PI*r;
  return (
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e8e8e8" strokeWidth="13"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="13"
        strokeDasharray={circ} strokeDashoffset={circ*(1-pct)} strokeLinecap="round"
        style={{transition:"stroke-dashoffset 0.55s cubic-bezier(.4,0,.2,1)"}}/>
    </svg>
  );
}

function WeekChart({ userId, goal, color, logs }) {
  const days=[...Array(7)].map((_,i)=>{
    const d=new Date(); d.setDate(d.getDate()-(6-i));
    const key=`${userId}-${d.toISOString().split("T")[0]}`;
    return {label:d.toLocaleDateString("en-GB",{weekday:"short"}),val:logs[key]||0,isToday:i===6};
  });
  return (
    <div style={{display:"flex",alignItems:"flex-end",gap:6,height:64,padding:"0 4px"}}>
      {days.map((d,i)=>{
        const pct=Math.min(d.val/goal,1);
        return (
          <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <div style={{width:"100%",height:44,borderRadius:8,background:"#f0f0f0",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",bottom:0,width:"100%",height:`${pct*100}%`,background:pct>=1?"#4CAF85":color,borderRadius:"6px 6px 0 0",transition:"height 0.4s ease"}}/>
            </div>
            <div style={{fontSize:10,fontWeight:d.isToday?800:600,color:d.isToday?color:"#bbb"}}>{d.label}</div>
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
    <div style={{marginTop:10}}>
      {!open
        ?<button onClick={()=>setOpen(true)} style={{width:"100%",border:`2px dashed ${color}55`,background:"transparent",borderRadius:18,padding:"12px",color,fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>+ Custom amount</button>
        :<div style={{display:"flex",gap:8,alignItems:"center",background:light,borderRadius:18,padding:"8px 12px",border:`2px solid ${color}33`}}>
          <input autoFocus type="number" placeholder="ml" value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} style={{flex:1,border:"none",background:"transparent",fontSize:18,fontWeight:800,color:"#333",fontFamily:"'Nunito',sans-serif",outline:"none"}}/>
          <button onClick={submit} style={{background:color,border:"none",borderRadius:12,padding:"8px 18px",color:"white",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>Add</button>
          <button onClick={()=>setOpen(false)} style={{background:"none",border:"none",color:"#bbb",fontWeight:800,fontSize:18,cursor:"pointer"}}>✕</button>
        </div>}
    </div>
  );
}

function SectionCard({ title, hint, children }) {
  return (
    <div style={{background:"white",borderRadius:24,padding:"20px",marginBottom:16,boxShadow:"0 4px 20px rgba(0,0,0,0.05)"}}>
      <div style={{fontSize:11,fontWeight:800,letterSpacing:1.5,color:"#bbb",marginBottom:hint?4:12}}>{title}</div>
      {hint&&<div style={{fontSize:11,color:"#ccc",fontWeight:600,marginBottom:12}}>{hint}</div>}
      {children}
    </div>
  );
}

// ── Settings screen ───────────────────────────────────────────────────────────

function SettingsScreen({ user, onSave, onBack }) {
  const [goal,setGoal]       = useState(user.goal);
  const [animal,setAnimal]   = useState(user.animal||"cat");
  const [name,setName]       = useState(user.name);
  const [themeId,setThemeId] = useState(user.themeId||"teal");
  const [colorId,setColorId] = useState(user.animalColorId||"mint");

  const presets=[800,1000,1200,1400,1600,1800,2000,2500];
  const pt=resolveTheme(themeId);
  const pac=resolveAnimal(colorId).color;

  const handleSave=()=>{
    const g=parseInt(goal);
    if(g>=200&&g<=5000) onSave({...user,goal:g,animal,name:name.trim()||user.name,themeId,animalColorId:colorId});
  };

  return (
    <div style={{minHeight:"100vh",background:pt.light,fontFamily:"'Nunito',sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:56}}>
      <div style={{background:pt.accent,borderRadius:"0 0 36px 36px",padding:"20px 20px 30px",color:"white",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:`0 8px 30px ${pt.accent}55`}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,0.18)",border:"none",borderRadius:14,padding:"8px 16px",color:"white",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>← Back</button>
        <div style={{fontWeight:900,fontSize:22}}>⚙️ Settings</div>
        <button onClick={handleSave} style={{background:"rgba(255,255,255,0.25)",border:"none",borderRadius:14,padding:"8px 16px",color:"white",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>Save ✓</button>
      </div>
      <div style={{padding:"24px 20px 0"}}>
        <SectionCard title="NAME">
          <input value={name} onChange={e=>setName(e.target.value)} style={{width:"100%",border:`2px solid ${pt.accent}44`,borderRadius:14,padding:"12px 16px",fontSize:18,fontWeight:800,color:"#333",fontFamily:"'Nunito',sans-serif",outline:"none",boxSizing:"border-box",background:pt.light}}/>
        </SectionCard>
        <SectionCard title="THEME COLOUR" hint="Changes your header, ring and background">
          <SwatchGrid items={THEME_COLOURS} selected={themeId} onSelect={setThemeId} cols={5}
            renderSwatch={item=><div style={{width:32,height:32,borderRadius:10,background:item.accent,boxShadow:`0 3px 8px ${item.accent}55`}}/>}/>
        </SectionCard>
        <SectionCard title="PET ANIMAL">
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:16}}>
            {ANIMALS.map(a=>{
              const sel=a.id===animal;
              return (
                <button key={a.id} onClick={()=>setAnimal(a.id)}
                  style={{border:`2.5px solid ${sel?pt.accent:"#eee"}`,background:sel?pt.light:"white",borderRadius:18,padding:"10px 4px 8px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,boxShadow:sel?"0 2px 10px rgba(0,0,0,0.1)":"none"}}>
                  <div style={{fontSize:24}}>{a.emoji}</div>
                  <div style={{fontSize:9,fontWeight:800,color:sel?pt.accent:"#bbb"}}>{a.label}</div>
                </button>
              );
            })}
          </div>
          <div style={{fontSize:11,fontWeight:800,letterSpacing:1.5,color:"#bbb",marginBottom:10}}>ANIMAL COLOUR</div>
          <SwatchGrid items={ANIMAL_COLOURS} selected={colorId} onSelect={setColorId} cols={5}
            renderSwatch={item=><div style={{width:32,height:32,borderRadius:"50%",background:item.color,boxShadow:`0 3px 8px ${item.color}55`}}/>}/>
          <div style={{display:"flex",justifyContent:"center",marginTop:18,padding:"14px",background:pt.light,borderRadius:18,border:`2px solid ${pt.accent}22`}}>
            <div style={{animation:"float 3s ease-in-out infinite"}}>
              <AnimalFace animal={animal} pct={0.65} color={pac} size={90}/>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="DAILY WATER GOAL" hint="Recommended: 9–11 yr ≈ 1400–1800ml/day">
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
            {presets.map(p=>(
              <button key={p} onClick={()=>setGoal(p)}
                style={{border:`2px solid ${parseInt(goal)===p?pt.accent:"#eee"}`,background:parseInt(goal)===p?pt.light:"white",borderRadius:12,padding:"7px 14px",fontWeight:800,fontSize:13,color:parseInt(goal)===p?pt.accent:"#999",cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>
                {p}ml
              </button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <input type="number" value={goal} onChange={e=>setGoal(e.target.value)} min="200" max="5000"
              style={{flex:1,border:`2px solid ${pt.accent}44`,borderRadius:14,padding:"12px 16px",fontSize:20,fontWeight:800,color:"#333",fontFamily:"'Nunito',sans-serif",outline:"none",background:pt.light}}/>
            <span style={{fontWeight:800,color:"#bbb",fontSize:16}}>ml</span>
          </div>
        </SectionCard>
        <button onClick={handleSave}
          style={{width:"100%",background:pt.accent,border:"none",borderRadius:22,padding:"18px",color:"white",fontSize:18,fontWeight:900,cursor:"pointer",fontFamily:"'Nunito',sans-serif",boxShadow:`0 6px 24px ${pt.accent}55`}}>
          Save Changes ✓
        </button>
      </div>
    </div>
  );
}

// ── Select screen ─────────────────────────────────────────────────────────────

function SelectScreen({ users, logs, onSelect, onSettings }) {
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#1a1a2e 0%,#16213e 55%,#0f3460 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px 24px",fontFamily:"'Nunito',sans-serif"}}>
      <div style={{textAlign:"center",marginBottom:40}}>
        <div style={{fontSize:52,animation:"float 3s ease-in-out infinite"}}>💧</div>
        <h1 style={{fontFamily:"'Nunito',sans-serif",fontSize:36,fontWeight:900,color:"white",margin:"10px 0 6px",letterSpacing:-1}}>HydroKids</h1>
        <p style={{color:"rgba(255,255,255,0.5)",fontSize:15,fontWeight:600}}>Keep your pet happy — stay hydrated!</p>
      </div>
      <div style={{width:"100%",maxWidth:360}}>
        {users.map((u,idx)=>{
          const theme=userTheme(u), aColor=userAColor(u);
          const intake=logs[`${u.id}-${today()}`]||0;
          const pct=Math.round(Math.min(intake/u.goal,1)*100);
          const animalInfo=ANIMALS.find(a=>a.id===(u.animal||"cat"));
          return (
            <div key={u.id} style={{position:"relative",marginBottom:16,animation:`pop 0.4s ease ${idx*0.1}s both`}}>
              <div onClick={()=>onSelect(u)}
                style={{background:"rgba(255,255,255,0.07)",border:"1.5px solid rgba(255,255,255,0.1)",backdropFilter:"blur(12px)",borderRadius:28,padding:"20px 22px",cursor:"pointer",display:"flex",alignItems:"center",gap:16}}
                onMouseDown={e=>e.currentTarget.style.transform="scale(0.96)"} onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}>
                <div style={{width:62,height:62,borderRadius:"50%",background:theme.light,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,border:`2px solid ${theme.accent}33`}}>
                  <AnimalFace animal={u.animal||"cat"} pct={intake/u.goal} color={aColor} size={52}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{fontWeight:900,fontSize:20,color:"white"}}>{u.name}</div>
                    <div style={{fontSize:14}}>{animalInfo?.emoji}</div>
                  </div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginTop:2,fontWeight:600}}>{intake}ml of {u.goal}ml</div>
                  <div style={{height:6,background:"rgba(255,255,255,0.1)",borderRadius:3,marginTop:8}}>
                    <div style={{height:6,borderRadius:3,background:theme.accent,width:`${pct}%`,transition:"width 0.4s ease"}}/>
                  </div>
                </div>
                <div style={{background:pct>=100?"#4CAF85":theme.accent,borderRadius:14,padding:"6px 12px",fontWeight:800,fontSize:14,color:"white",flexShrink:0}}>{pct}%</div>
              </div>
              <button onClick={()=>onSettings(u)}
                style={{position:"absolute",top:-8,right:-8,width:34,height:34,borderRadius:"50%",background:"rgba(255,255,255,0.15)",border:"1.5px solid rgba(255,255,255,0.2)",color:"white",fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)"}}>
                ⚙️
              </button>
            </div>
          );
        })}
      </div>
      <p style={{color:"rgba(255,255,255,0.2)",fontSize:12,marginTop:28,fontWeight:600}}>☁️ Cloud sync enabled · tap ⚙️ for settings</p>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function HydroKids() {
  const [screen,setScreen]           = useState("select");
  const [users,setUsers]             = useState(DEFAULT_USERS);
  const [user,setUser]               = useState(null);
  const [logs,setLogs]               = useState({});
  const [celebrating,setCelebrating] = useState(false);
  const [justAdded,setJustAdded]     = useState(null);
  const [syncing,setSyncing]         = useState(false);

  const persistLogs  = useCallback(nl=>{setLogs(nl); try{localStorage.setItem("hydrokids_logs",JSON.stringify(nl));}catch{}},[]);
  const persistUsers = useCallback(nu=>{setUsers(nu);try{localStorage.setItem("hydrokids_users",JSON.stringify(nu));}catch{}},[]);

  useEffect(()=>{
    const init=async()=>{
      try {
        const sl=localStorage.getItem("hydrokids_logs");
        const su=localStorage.getItem("hydrokids_users");
        let localLogs=sl?JSON.parse(sl):{};
        let localUsers=su?JSON.parse(su):DEFAULT_USERS;
        setLogs(localLogs);
        setUsers(localUsers);
        setSyncing(true);
        // Merge both logs and profiles from Sheets in parallel
        const [mergedLogs, mergedUsers] = await Promise.all([
          fetchAndMergeLogs(localLogs),
          fetchAndMergeProfiles(localUsers),
        ]);
        persistLogs(mergedLogs);
        persistUsers(mergedUsers);
        syncAll(mergedLogs);
      } catch(e) {
        console.warn("Init error:", e);
      } finally {
        setSyncing(false);
      }
    };
    init();
  },[]);

  const addDrink=ml=>{
    const key=`${user.id}-${today()}`;
    const prev=logs[key]||0, next=prev+ml;
    persistLogs({...logs,[key]:next});
    syncLog(user.id,today(),next);
    setJustAdded(`+${ml}ml`);
    setTimeout(()=>setJustAdded(null),1400);
    if(next>=user.goal&&prev<user.goal){setCelebrating(true);setTimeout(()=>setCelebrating(false),3200);}
  };

  const undoLast=()=>{
    const key=`${user.id}-${today()}`;
    const prev=logs[key]||0;
    if(prev===0) return;
    const next=Math.max(0,prev-100);
    persistLogs({...logs,[key]:next});
    syncLog(user.id,today(),next);
  };

  const getStreak=(userId,goalAmt)=>{
    let s=0;
    for(let i=0;i<60;i++){
      const d=new Date();d.setDate(d.getDate()-i);
      const key=`${userId}-${d.toISOString().split("T")[0]}`;
      if((logs[key]||0)>=goalAmt) s++; else if(i>0) break;
    }
    return s;
  };

  const saveSettings=updated=>{
    persistUsers(users.map(u=>u.id===updated.id?updated:u));
    setUser(updated);
    syncProfile(updated);   // push profile to Sheets immediately
    setScreen("main");
  };

  const CSS=`
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
    @keyframes pop{0%{transform:scale(0.7) translateY(10px);opacity:0}100%{transform:scale(1) translateY(0);opacity:1}}
    @keyframes toastUp{0%{opacity:0;transform:translateY(0)}20%{opacity:1;transform:translateY(-14px)}80%{opacity:1;transform:translateY(-14px)}100%{opacity:0;transform:translateY(-28px)}}
    @keyframes celebrate{0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  `;

  if(screen==="select") return (
    <>
      <style>{CSS}</style>
      {syncing&&<div style={{position:"fixed",top:12,right:12,zIndex:200,background:"rgba(0,0,0,0.5)",borderRadius:20,padding:"6px 12px",color:"white",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:6}}><span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>⟳</span> Syncing…</div>}
      <SelectScreen users={users} logs={logs} onSelect={u=>{setUser(u);setScreen("main");}} onSettings={u=>{setUser(u);setScreen("settings");}}/>
    </>
  );

  if(screen==="settings") return (
    <><style>{CSS}</style><SettingsScreen user={user} onSave={saveSettings} onBack={()=>setScreen("main")}/></>
  );

  const cu=users.find(u=>u.id===user.id)||user;
  const theme=userTheme(cu), aColor=userAColor(cu);
  const intake=logs[`${cu.id}-${today()}`]||0;
  const hydPct=intake/cu.goal, streak=getStreak(cu.id,cu.goal), remaining=Math.max(0,cu.goal-intake);
  const mood=hydPct>=1?{text:"Goal smashed! 🎉",sub:"Your pet is glowing!"}
            :hydPct>=.75?{text:"Almost there! 💪",sub:`Just ${remaining}ml to go`}
            :hydPct>=.4?{text:"Good progress 👍",sub:`${remaining}ml remaining`}
            :{text:"Thirsty! Please drink 😰",sub:`${remaining}ml to go`};
  const animalLabel=ANIMALS.find(a=>a.id===(cu.animal||"cat"));

  return (
    <div style={{minHeight:"100vh",background:theme.light,fontFamily:"'Nunito',sans-serif",maxWidth:430,margin:"0 auto",paddingBottom:40,position:"relative",overflow:"hidden"}}>
      <style>{CSS}</style>
      <div style={{background:theme.accent,borderRadius:"0 0 36px 36px",padding:"20px 20px 30px",color:"white",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:`0 8px 30px ${theme.accent}55`}}>
        <button onClick={()=>setScreen("select")} style={{background:"rgba(255,255,255,0.18)",border:"none",borderRadius:14,padding:"8px 16px",color:"white",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>← Back</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontWeight:900,fontSize:22,letterSpacing:-0.5}}>{cu.name} {animalLabel?.emoji}</div>
          <div style={{fontSize:12,opacity:0.8,fontWeight:700,marginTop:1}}>{streak>0?`🔥 ${streak} day streak`:"Start your streak today!"}</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={undoLast} style={{background:"rgba(255,255,255,0.18)",border:"none",borderRadius:14,padding:"8px 12px",color:"white",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>↩</button>
          <button onClick={()=>setScreen("settings")} style={{background:"rgba(255,255,255,0.18)",border:"none",borderRadius:14,padding:"8px 12px",color:"white",fontSize:15,cursor:"pointer"}}>⚙️</button>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"28px 24px 8px"}}>
        <div style={{position:"relative",width:210,height:210}}>
          <Ring value={intake} max={cu.goal} color={theme.accent} size={210}/>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{animation:"float 3.5s ease-in-out infinite"}}>
              <AnimalFace animal={cu.animal||"cat"} pct={hydPct} color={aColor} size={118}/>
            </div>
          </div>
        </div>
        <div style={{textAlign:"center",marginTop:6}}>
          <div style={{fontSize:40,fontWeight:900,color:theme.dark,lineHeight:1,letterSpacing:-1}}>{intake}<span style={{fontSize:18,fontWeight:700,color:"#bbb",marginLeft:4}}>ml</span></div>
          <div style={{fontWeight:700,color:"#bbb",fontSize:13,marginTop:2}}>of {cu.goal}ml daily goal</div>
          <div style={{marginTop:10,background:theme.accent+"18",borderRadius:16,padding:"8px 20px",display:"inline-block"}}>
            <div style={{fontWeight:800,color:theme.accent,fontSize:15}}>{mood.text}</div>
            <div style={{fontWeight:600,color:theme.accent+"aa",fontSize:12,marginTop:1}}>{mood.sub}</div>
          </div>
        </div>
      </div>
      <div style={{padding:"20px 20px 0"}}>
        <div style={{fontSize:11,fontWeight:800,letterSpacing:1.5,color:"#bbb",marginBottom:10}}>ADD A DRINK</div>
        <div style={{display:"flex",gap:10}}>
          {DRINKS.map(d=>(
            <button key={d.label} onClick={()=>addDrink(d.ml)}
              style={{flex:1,border:"none",background:"white",borderRadius:22,padding:"16px 8px",cursor:"pointer",fontFamily:"'Nunito',sans-serif",boxShadow:"0 4px 16px rgba(0,0,0,0.07)",outline:`2.5px solid ${aColor}30`,transition:"transform 0.1s"}}
              onMouseDown={e=>e.currentTarget.style.transform="scale(0.93)"} onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}>
              <div style={{fontSize:28}}>{d.emoji}</div>
              <div style={{fontWeight:900,fontSize:13,color:theme.dark,marginTop:4}}>{d.label}</div>
              <div style={{fontWeight:700,fontSize:11,color:"#bbb"}}>{d.ml}ml</div>
            </button>
          ))}
        </div>
        <CustomDrink color={theme.accent} light={theme.light} onAdd={addDrink}/>
      </div>
      <div style={{padding:"20px 20px 0"}}>
        <div style={{background:"white",borderRadius:24,padding:"18px 18px 14px",boxShadow:"0 4px 20px rgba(0,0,0,0.05)"}}>
          <div style={{fontSize:11,fontWeight:800,letterSpacing:1.5,color:"#bbb",marginBottom:14}}>THIS WEEK</div>
          <WeekChart userId={cu.id} goal={cu.goal} color={theme.accent} logs={logs}/>
        </div>
      </div>
      {justAdded&&<div style={{position:"fixed",bottom:100,left:"50%",transform:"translateX(-50%)",background:theme.accent,color:"white",fontWeight:900,fontSize:18,borderRadius:20,padding:"10px 28px",animation:"toastUp 1.4s ease forwards",pointerEvents:"none",zIndex:50}}>{justAdded} 💧</div>}
      {celebrating&&<div onClick={()=>setCelebrating(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:100,cursor:"pointer",animation:"fadeUp 0.3s ease"}}>
        <div style={{animation:"celebrate 0.5s ease",textAlign:"center"}}>
          <div style={{fontSize:90}}>🎉</div>
          <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:32,color:"white",lineHeight:1.2,marginTop:12}}>Goal reached,<br/>{cu.name}!</div>
          <div style={{color:"rgba(255,255,255,0.7)",fontSize:16,fontWeight:700,marginTop:10}}>Your {animalLabel?.label} is SO happy! {animalLabel?.emoji}✨</div>
          <div style={{color:"rgba(255,255,255,0.4)",fontSize:13,marginTop:24}}>Tap to continue</div>
        </div>
      </div>}
    </div>
  );
}
