// 게임 데이터 로딩: data/game.json(변환본) 또는 브라우저에 가져온 백업(IndexedDB)
import { audio } from './util.js';

export let G = null;             // game 데이터 (meta, world, chars, chapters, lib, threads, opening, banners, dispatches, prog)
const IMG = {};                  // 이미지 id → url
const DB = 'usual-saviors', STORE = 'kv';

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function kvGet(k) { const d = await idb(); return new Promise(r => { const q = d.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(null); }); }
async function kvSet(k, v) { const d = await idb(); return new Promise((r, j) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = () => r(); t.onerror = () => j(t.error); }); }
export async function clearImported() { const d = await idb(); return new Promise(r => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).clear(); t.oncomplete = () => r(); }); }

function setup(game, imgUrls, audioUrls) {
  G = game;
  Object.assign(IMG, imgUrls);
  // 라이브러리 오디오(id)를 이름으로 매핑
  for (const l of G.lib || []) if (audioUrls[l.id]) audio.files[l.name] = audioUrls[l.id];
  G.meta = G.meta || {}; G.meta.terms = G.meta.terms || {};
  G.chars.sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0));
}

// 1) 배포용 data/game.json  2) 브라우저에 저장한 백업  둘 다 없으면 false
export async function loadGame() {
  try {
    const r = await fetch('data/game.json', { cache: 'no-cache' });
    if (r.ok) {
      const j = await r.json();
      const pre = p => 'data/' + p;
      const im = {}, au = {};
      for (const [k, v] of Object.entries(j.assets?.img || {})) im[k] = pre(v);
      for (const [k, v] of Object.entries(j.assets?.audio || {})) au[k] = pre(v);
      setup(j.game, im, au);
      return 'file';
    }
  } catch (e) { /* 파일 없음 */ }
  try {
    const game = await kvGet('game');
    if (game) {
      const blobs = (await kvGet('imgs')) || {}, auds = (await kvGet('auds')) || {};
      const im = {}, au = {};
      for (const [k, b] of Object.entries(blobs)) im[k] = URL.createObjectURL(b);
      for (const [k, b] of Object.entries(auds)) au[k] = URL.createObjectURL(b);
      setup(game, im, au);
      return 'imported';
    }
  } catch (e) { console.warn(e); }
  return false;
}

// 툴 백업 JSON 파일을 브라우저에 가져오기
export async function importBackup(file, onProgress = () => { }) {
  onProgress('파일 읽는 중…');
  const text = await file.text();
  onProgress('데이터 해석 중…');
  const d = JSON.parse(text);
  let game, images = {}, audios = {};
  if (d.format === 'usual-saviors-web/1') { game = d.game; }
  else if (d.game) { game = d.game; images = d.images || {}; audios = d.audios || {}; }
  else throw new Error('백업 파일이 아니에요');
  const imgs = {}, auds = {}; let i = 0; const n = Object.keys(images).length;
  for (const [k, v] of Object.entries(images)) { imgs[k] = await (await fetch(v)).blob(); if (++i % 5 === 0) onProgress(`그림 정리 중 ${i}/${n}`); }
  for (const [k, v] of Object.entries(audios)) auds[k] = await (await fetch(v)).blob();
  onProgress('저장 중…');
  await kvSet('game', game); await kvSet('imgs', imgs); await kvSet('auds', auds);
}

// ---- 조회 도우미 ----
export const T = k => (G.meta.terms && G.meta.terms[k]) || ({ player: '관리관', currency: '보석', gold: '골드', expMat: '경험치 재료', wMat: '무기 재료', core: '돌파 재료', gacha: '영입', ops: '출격', crew: '사원', talk: '메신저', dispatch: '파견', farm: '상시정리', pass: '패스', weapon: '무기', files: '비망록', enhance: '강화', limit: '돌파' }[k] || k);
export const img = id => (id && IMG[id]) || null;
export const charById = id => G.chars.find(c => c.id === id);
export const charByName = n => G.chars.find(c => c.name === n || c.name.split(' ')[0] === n);
export const libByName = (kind, name) => (G.lib || []).find(l => (!kind || l.kind === kind) && l.name === name);
export const libImg = (kind, name) => { const l = libByName(kind, name); return l ? img(l.id) : null; };
export const standing = c => img(c.id);
export const upper = c => img(c.upper?.id) || img(c.id);
// 속성 세 갈래: 신앙 → 망각 → 해석 → 신앙 (앞이 뒤에 강해요)
export const elems = () => (G.meta.elems && G.meta.elems.length ? G.meta.elems : [{ n: '신앙' }, { n: '망각' }, { n: '해석' }]).map(e => e.n);
export const roleName = r => (G.meta.roles && G.meta.roles[r]) || r;
export const rarName = r => ['', 'R', 'SR', 'SSR'][r] || 'R';
export function elemMult(a, d) {
  const E = elems(), i = E.indexOf(a), j = E.indexOf(d);
  if (i < 0 || j < 0) return 1;
  return (i + 1) % E.length === j ? 1.3 : 1; // 불리해도 손해는 없어요
}
// 배경: 라이브러리 배경 그림이 있으면 그것, 없으면 이름으로 만든 그라디언트
export function bgCss(name) {
  const u = libImg('bg', name);
  if (u) return `background-image:url("${u}")`;
  let h = 0; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `background:radial-gradient(ellipse at 30% 20%,hsl(${h} 45% 22%),transparent 60%),radial-gradient(ellipse at 80% 90%,hsl(${(h + 60) % 360} 50% 16%),transparent 60%),linear-gradient(160deg,hsl(${h} 30% 10%),#06080d)`;
}
export function playerName(S) { return (S && S.name) || T('player'); }
export function fill(text, S) { return String(text || '').replace(/\{관리관\}|\{player\}/g, playerName(S)).replace(/\{([^}]+)\}/g, (m, k) => k === T('player') ? playerName(S) : m); }
