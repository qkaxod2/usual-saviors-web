// 진행 상황(세이브)과 성장 규칙
import { G, charById, T } from './data.js';
import { today, toast } from './util.js';

const KEY = 'usual-saviors-save-v1';
export let S = null;

export function newSave() {
  const p = G.prog || {};
  return {
    v: 1, name: '', created: Date.now(),
    gems: p.gems ?? 3600, gold: p.gold ?? 20000,
    mat: { exp: p.mat?.exp ?? 40, wmat: p.mat?.wmat ?? 20, core: p.mat?.core ?? 10 },
    owned: {}, squad: [], cleared: {}, pity: {}, pulls: 0, history: [],
    threads: {}, disp: {}, mail: (p.mail || []).map(m => ({ ...m, got: false, read: false, at: Date.now() })),
    daily: { date: '', cnt: {}, got: {} }, pass: { month: '', xp: 0, got: [] },
    farm: { date: '', n: {} }, shop: { date: '', buy: {} }, touch: { date: '', n: 0 },
    seenOpening: false, lobbyChar: '', firstTen: p.firstTen !== false,
    settings: { bgm: .5, sfx: .6, muted: false, auto: false, speed: 1, text: 28, fastDispatch: false },
  };
}
export function load() {
  try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && j.v === 1) { S = Object.assign(newSave(), j); } } catch (e) { }
  if (!S) S = newSave();
  daily();
  return S;
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('저장 공간이 부족해요'); } }
export function resetSave() { localStorage.removeItem(KEY); S = newSave(); save(); }
export function exportSave() { return JSON.stringify(S); }
export function importSave(txt) { const j = JSON.parse(txt); if (j.v !== 1) throw new Error('세이브 형식이 달라요'); S = Object.assign(newSave(), j); save(); }

// ---- 날짜 리셋 ----
export function daily() {
  const d = today();
  if (S.daily.date !== d) { S.daily = { date: d, cnt: { login: 1 }, got: {} }; }
  if (S.farm.date !== d) S.farm = { date: d, n: {} };
  if (S.shop.date !== d) S.shop = { date: d, buy: {} };
  if (S.touch.date !== d) S.touch = { date: d, n: 0 };
  const m = d.slice(0, 7); if (S.pass.month !== m) S.pass = { month: m, xp: 0, got: [] };
}
export function count(k, n = 1) { daily(); S.daily.cnt[k] = (S.daily.cnt[k] || 0) + n; }

// ---- 일일 임무 / 근태패스 ----
export const MISSIONS = [
  { k: 'login', t: '출근하기', n: 1, gems: 50 },
  { k: 'battle', t: '전투 3회 승리', n: 3, gems: 60 },
  { k: 'pull', t: '영입 1회', n: 1, gems: 40 },
  { k: 'dispatch', t: '현장파견 1회 보내기', n: 1, gems: 40 },
  { k: 'enhance', t: '사원 연수 1회', n: 1, gems: 40 },
  { k: 'touch', t: '로비에서 사원과 3번 대화', n: 3, gems: 30 },
  { k: 'talk', t: '사내메신저 비트 1개 읽기', n: 1, gems: 30 },
];
export const PASS_STEP = 100;
export const PASS = Array.from({ length: 15 }, (_, i) => {
  const lv = i + 1;
  const r = lv % 5 === 0 ? { gems: 300 } : lv % 3 === 0 ? { core: 2 } : lv % 2 === 0 ? { wmat: 4, gold: 3000 } : { exp: 5, gold: 2000 };
  return { lv, r };
});

// ---- 보상 ----
export function give(r, silent) {
  if (!r) return;
  if (r.gems) S.gems += r.gems;
  if (r.gold) S.gold += r.gold;
  for (const k of ['exp', 'wmat', 'core']) if (r[k]) S.mat[k] += r[k];
  if (r.passXp) S.pass.xp += r.passXp;
  save();
  if (!silent) toast('획득: ' + rewardText(r));
}
export function rewardText(r) {
  const out = [];
  if (r.gems) out.push(`${T('currency')} ${r.gems}`);
  if (r.gold) out.push(`${T('gold')} ${r.gold.toLocaleString()}`);
  if (r.exp) out.push(`${T('expMat')} ${r.exp}`);
  if (r.wmat) out.push(`${T('wMat')} ${r.wmat}`);
  if (r.core) out.push(`${T('core')} ${r.core}`);
  return out.join(' · ') || '없음';
}

// ---- 사원 성장 ----
export const MAX_LIMIT = 4, MAX_WLV = 10, MAX_AFF = 10, MAX_DUP = 5;
export const capLv = o => 20 + o.limit * 10;
export function addChar(id) {
  const o = S.owned[id];
  if (!o) { S.owned[id] = { lv: 1, dup: 0, limit: 0, wlv: 0, aff: 0, affExp: 0, at: Date.now() }; return 'new'; }
  if (o.dup < MAX_DUP) { o.dup++; return 'dup'; }
  S.mat.core += 2; return 'max';
}
export function stats(c, o = S.owned[c.id]) {
  const lv = o?.lv || 1, lim = o?.limit || 0, w = o?.wlv || 0, aff = o?.aff || 0;
  const g = (1 + 0.06 * (lv - 1)) * (1 + 0.08 * lim) * (1 + 0.01 * aff);
  return {
    hp: Math.round(c.hp * g), atk: Math.round(c.atk * g * (1 + 0.04 * w)), def: Math.round(c.def * g),
    spd: Math.round(c.spd + lim * 2 + w * 0.5),
  };
}
export const power = (c, o) => { const s = stats(c, o); return Math.round(s.hp * 0.25 + s.atk * 2.2 + s.def * 1.6 + s.spd * 2); };
export const lvCost = o => ({ exp: 1 + Math.floor(o.lv / 10), gold: 150 * o.lv });
export const limitCost = o => ({ core: 2 * (o.limit + 1), gold: 4000 * (o.limit + 1) });
export const wCost = o => ({ wmat: o.wlv + 1, gold: 1000 * (o.wlv + 1) });
export function canPay(c) { return (!c.gold || S.gold >= c.gold) && (!c.gems || S.gems >= c.gems) && ['exp', 'wmat', 'core'].every(k => !c[k] || S.mat[k] >= c[k]); }
export function pay(c) { if (!canPay(c)) return false; if (c.gold) S.gold -= c.gold; if (c.gems) S.gems -= c.gems; for (const k of ['exp', 'wmat', 'core']) if (c[k]) S.mat[k] -= c[k]; return true; }
// 호감 경험치 → 오른 레벨 목록 반환
export function addAff(id, n) {
  const o = S.owned[id]; if (!o || o.aff >= MAX_AFF) return [];
  o.affExp += n; const ups = [];
  while (o.affExp >= 100 && o.aff < MAX_AFF) { o.affExp -= 100; o.aff++; ups.push(o.aff); }
  if (o.aff >= MAX_AFF) o.affExp = 0;
  return ups;
}
export const filesOpen = (c, f) => { const o = S.owned[c.id]; return !!o && (o.dup + 1) >= (f.dup || 1); };
export const owned = () => G.chars.filter(c => S.owned[c.id]);
export function squadChars() { return S.squad.map(charById).filter(c => c && S.owned[c.id]); }
export function teamPower() { return squadChars().reduce((a, c) => a + power(c), 0); }

// ---- 진행 판정 ----
export function allStages() { const out = []; for (const ch of G.chapters || []) for (const s of ch.stages || []) out.push({ ch, s }); return out; }
export function stageOpen(id) { const all = allStages(); const i = all.findIndex(x => x.s.id === id); return i <= 0 || !!S.cleared[all[i - 1].s.id]; }
export function threadOpen(t) {
  const tr = t.trigger || {};
  if (t.needOwn && !S.owned[t.charId]) return false;
  if (tr.type === 'clear') return !!S.cleared[tr.value];
  if (tr.type === 'own') return !!S.owned[tr.value || t.charId];
  if (tr.type === 'aff') { const o = S.owned[t.charId]; return !!o && o.aff >= (+tr.value || 0); }
  return true;
}
export function badges() {
  const b = {};
  b.mail = S.mail.some(m => !m.got);
  b.talk = (G.threads || []).some(t => threadOpen(t) && !S.threads[t.id]?.done);
  b.disp = Object.values(S.disp).some(d => Date.now() >= d.end);
  b.mission = MISSIONS.some(m => (S.daily.cnt[m.k] || 0) >= m.n && !S.daily.got[m.k]) || PASS.some(p => S.pass.xp >= p.lv * PASS_STEP && !S.pass.got.includes(p.lv));
  return b;
}
