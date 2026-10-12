// 진행 상황(세이브)과 성장 규칙
import { G, charById, T } from './data.js';
import { today, toast } from './util.js';

const KEY = 'usual-saviors-save-v1', BAK = KEY + ':bak', BROKEN = KEY + ':broken';
export let S = null;
// 세이브마다 번호(rev)를 붙여요. 이 창이 마지막으로 읽거나 쓴 번호보다 저장소 번호가 크면
// 다른 창(탭)이 더 새로 저장한 거라, 덮어쓰지 않고 그쪽을 불러와요.
let rev = 0, lastJson = '', onSync = () => { };
export const setOnSync = f => { onSync = f; };

// ---- 중복 접속 막기 ----
// 게임은 한 번에 한 창에서만 진행해요. 새 창이 열리면 그 창이 주인이 되고, 이전 창은 멈춰서 저장하지 않아요.
const ACTIVE = 'usual-saviors-active';
const TAB = Math.random().toString(36).slice(2) + Date.now().toString(36);
let active = true, onKicked = () => { };
export const setOnKicked = f => { onKicked = f; };
export const isActive = () => active;
const ownerNow = () => { try { return localStorage.getItem(ACTIVE)?.split('|')[0]; } catch (e) { return TAB; } };
// 이 창을 주인으로 정해요 (시작할 때. '여기서 계속하기'는 새로고침해서 다시 시작해요)
export function claim() { try { localStorage.setItem(ACTIVE, TAB + '|' + Date.now()); } catch (e) { } }
// 다른 창이 주인이 됐는지 확인하고, 그렇다면 이 창을 멈춰요. 멈췄으면 true
export function checkOwner() {
  if (!active) return true;
  const o = ownerNow();
  if (o && o !== TAB) { active = false; onKicked(); return true; }
  return false;
}

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
function fromJson(j) {
  const d = newSave();
  return Object.assign(d, j, { mat: { ...d.mat, ...j.mat }, settings: { ...d.settings, ...j.settings } });
}
// 저장소에서 읽기: 없으면 null, 깨졌으면 false
function readSlot(k) {
  let t = null;
  try { t = localStorage.getItem(k); } catch (e) { return null; }
  if (!t) return null;
  try { const j = JSON.parse(t); return j && j.v === 1 ? { j, t } : false; } catch (e) { return false; }
}
function adopt(slot) { S = fromJson(slot.j); rev = S.rev || 0; lastJson = slot.t; daily(); }

export function load() {
  const main = readSlot(KEY);
  if (main) adopt(main);
  else {
    // 본 세이브가 깨졌으면 지우지 않고 따로 남겨 두고, 직전 저장본으로 시작해요
    if (main === false) try { localStorage.setItem(BROKEN, localStorage.getItem(KEY)); } catch (e) { }
    const bak = readSlot(BAK);
    if (bak) { adopt(bak); save(true); if (main === false) setTimeout(() => toast('세이브가 손상돼서 직전 저장본을 불러왔어요'), 800); }
  }
  if (!S) { S = newSave(); rev = 0; }
  daily();
  try { navigator.storage?.persist?.(); } catch (e) { }
  return S;
}
// 다른 창이 더 새로 저장했으면 그걸 불러와요. 불러왔으면 true
export function sync() {
  const cur = readSlot(KEY);
  if (cur && (cur.j.rev || 0) > rev) { adopt(cur); onSync(); return true; }
  return false;
}
export function save(force) {
  if (!S || checkOwner()) return;
  if (!force && sync()) { toast('다른 창에서 진행한 내용을 불러왔어요'); return; }
  const cur = readSlot(KEY) || null;  // 깨진 세이브는 없는 것처럼 덮어써요 (load에서 따로 남겨 둠)
  const json = JSON.stringify(S);
  if (!force && cur && json === lastJson && cur.t === lastJson) return;  // 바뀐 게 없어요
  S.rev = Math.max(rev, cur?.j.rev || 0) + 1; S.savedAt = Date.now();
  const out = JSON.stringify(S);
  const write = () => { if (cur) localStorage.setItem(BAK, cur.t); localStorage.setItem(KEY, out); };
  try { write(); }
  catch (e) {
    // 공간이 모자라면 직전 저장본을 비우고 한 번 더 시도해요
    try { localStorage.removeItem(BAK); localStorage.setItem(KEY, out); }
    catch (e2) { S.rev = rev; toast('저장 공간이 부족해서 저장하지 못했어요'); return; }
  }
  rev = S.rev; lastJson = out;
}
// 다른 창에서 저장하면 바로 따라가요. 예전 코드로 열린 창이 번호 없이 옛 진행 상황을 덮어쓰면 되돌려 놓아요.
if (typeof addEventListener === 'function') addEventListener('storage', e => {
  if (e.key === ACTIVE) { checkOwner(); return; }
  if (e.key !== KEY || !S || !active) return;
  if (e.newValue == null) return;
  let j = null; try { j = JSON.parse(e.newValue); } catch (err) { }
  const r = j?.rev || 0;
  if (j && j.v === 1 && r > rev) { adopt({ j, t: e.newValue }); onSync(); }
  else if (r < rev) save(true);
});
export function resetSave() { S = newSave(); save(true); }
export function exportSave() { return JSON.stringify(S); }
export function importSave(txt) { const j = JSON.parse(txt); if (j.v !== 1) throw new Error('세이브 형식이 달라요'); S = fromJson(j); daily(); save(true); }

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
export const lvCost = o => ({ exp: 1 + Math.floor(o.lv / 10), gold: 100 * o.lv });
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
