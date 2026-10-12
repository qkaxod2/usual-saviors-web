// 공용 도구
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmt = n => Math.floor(n).toLocaleString('ko-KR');

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function weekKey() {
  const d = new Date(); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t - y) / 864e5 + 1) / 7)}`;
}
export function dur(ms) {
  if (ms <= 0) return '완료';
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  return h ? `${h}시간 ${m}분` : m ? `${m}분 ${ss}초` : `${ss}초`;
}

export function toast(msg, ms = 1800) {
  const t = document.createElement('div'); t.className = 't'; t.textContent = msg;
  $('#toast').append(t); setTimeout(() => t.remove(), ms);
}

// 간단한 모달. buttons: [{label, cls, value}]
export function modal(html, buttons = [{ label: '확인', value: true }]) {
  return new Promise(res => {
    const m = $('#modal');
    m.innerHTML = `<div class="mbox">${html}<div class="acts">${buttons.map((b, i) => `<button class="btn ${b.cls || ''} sm" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    m.hidden = false;
    m.onclick = e => {
      const b = e.target.closest('[data-i]');
      if (b) { m.hidden = true; m.innerHTML = ''; m.onclick = null; sfx('btn'); res(buttons[+b.dataset.i].value); }
      else if (e.target === m && buttons.length === 1) { m.hidden = true; m.onclick = null; res(buttons[0].value); }
    };
  });
}
export const confirmBox = (html, ok = '확인', no = '취소') => modal(html, [{ label: no, cls: 'sub', value: false }, { label: ok, value: true }]);

// ---- 소리: 데이터에 오디오가 있으면 그걸 쓰고, 없으면 짧은 합성음 ----
let AC = null, master = null;
export const audio = { files: {}, bgmEl: null, bgmName: '', vol: { bgm: .5, sfx: .6 }, muted: false };
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.connect(AC.destination); } catch (e) { } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
const SYN = {
  btn: [[660, .05, 'triangle']], ok: [[520, .06], [780, .08]], noti: [[880, .07], [1320, .1]],
  hit: [[140, .08, 'sawtooth']], skill: [[400, .06, 'square'], [700, .06, 'square'], [1000, .12, 'square']],
  win: [[523, .12], [659, .12], [784, .12], [1046, .3]], lose: [[392, .2], [311, .2], [233, .4]],
  up: [[600, .06], [900, .06], [1200, .12]], card: [[300, .05, 'triangle']], ssr: [[784, .1], [988, .1], [1318, .1], [1568, .4]],
  seal: [[220, .4, 'sine']], flash: [[1800, .15, 'sine']], fall: [[600, .25, 'sine']],
};
const SFXNAME = { 버튼: 'btn', 확인: 'ok', 알림: 'noti', 타격: 'hit', 스킬: 'skill', 승리: 'win', 패배: 'lose', 강화: 'up', 카드: 'card', SSR: 'ssr', 계약진: 'seal', 섬광: 'flash', 낙하: 'fall' };
export function sfx(name) {
  if (audio.muted || !audio.vol.sfx) return;
  const kor = Object.keys(SFXNAME).find(k => SFXNAME[k] === name) || name;
  const f = audio.files[kor];
  if (f) { const a = new Audio(f); a.volume = audio.vol.sfx; a.play().catch(() => { }); return; }
  const key = SFXNAME[name] || name, seq = SYN[key]; if (!seq) return;
  const c = ac(); if (!c) return;
  let t = c.currentTime;
  for (const [fr, d, type] of seq) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = fr;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.12 * audio.vol.sfx, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + d + .02); t += d * .8;
  }
}
export function bgm(name) {
  if (name === audio.bgmName) return;
  audio.bgmName = name;
  if (audio.bgmEl) { audio.bgmEl.pause(); audio.bgmEl = null; }
  const f = name && audio.files[name];
  if (!f || audio.muted) return;
  const a = new Audio(f); a.loop = true; a.volume = audio.vol.bgm; a.play().catch(() => { }); audio.bgmEl = a;
}
export function setMuted(m) { audio.muted = m; if (m && audio.bgmEl) { audio.bgmEl.pause(); } else if (!m) { const n = audio.bgmName; audio.bgmName = ''; bgm(n); } }
