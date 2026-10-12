// 전투: 타임라인 턴제
// - 속도가 빠를수록 타임라인에서 차례가 자주 와요 (라운드 없음)
// - 내 차례: 공격(업무 포인트 +1) 또는 역할 스킬(포인트 소모)
// - 필살기: 캐릭터마다 게이지가 따로 차요. 다 차면 카드를 눌러 적 차례 중간에도 끼어들고, 컷인이 나와요
// - 흐트러짐: 게이지를 다 깎으면 타임라인에서 뒤로 밀리고, 모으던 힘이 흩어지고, 받는 피해가 늘어요
import { $, esc, sfx, bgm, sleep, rand, pick, confirmBox } from './util.js';
import { G, img, libImg, upper, standing, elemMult, bgCss, roleName } from './data.js';
import { S, stats, save } from './state.js';

const n0 = n => Math.round(n).toLocaleString('ko-KR');
const FOE_ICON = ['👾', '🕷️', '⚙️', '🦇', '👁️', '🌀', '🐺', '💀'];
const foeIcon = n => { let h = 0; for (const ch of n) h = (h * 7 + ch.charCodeAt(0)) % 997; return FOE_ICON[h % FOE_ICON.length]; };

const SK_KIND = { dmg: '단일 공격', aoe: '적 전체 공격', heal: '아군 전체 회복', shield: '아군 전체 보호막', buff: '아군 전체 공격력 증가 · 행동 당기기', debuff: '적 전체 매료 · 행동 밀기', mark: '대상 조준 · 약점 노출 · 행동 밀기', scale: '아군 전체 보호막 · 공격력 증가' };
// 역할 스킬: 차례에 업무 포인트를 써서 쓰는 기술. 캐릭터 고유 스킬은 필살기가 돼요
const ROLE_SK = {
  atk: { name: '집중 타격', cost: 2, kind: 'strike', desc: '단일 대상 강한 피해 · 흐트러짐 -2' },
  def: { name: '막아서기', cost: 2, kind: 'cover', desc: '2턴 도발 · 자신에게 보호막' },
  sup: { name: '업무 지원', cost: 1, kind: 'assist', desc: '가장 다친 아군 회복 · 행동 30% 당기기' },
};
const SP_MAX = 5, SP_START = 3;
const ULT_MAX = 100, ULT_START = 35;
const GAIN = { atk: 25, sk: 30, hit: 10, kill: 10 }; // 필살기 게이지가 차는 양
const BREAK_TAKEN = 1.5;    // 흐트러진 적이 받는 피해
const BREAK_DELAY = 0.5;    // 흐트러지면 타임라인에서 밀리는 정도(한 차례 간격 대비)
const LOW_HP = 0.5;         // 청소부가 노리는 '끝나 가는' 체력
const SPEED = { 1: 2, 2: 4, 3: 5 };
const TL_SHOW = 8;          // 타임라인에 보여 줄 차례 수
const gap = u => 10000 / Math.max(30, u.spd); // 한 차례 간격 (속도 100 → 100)

// 적 행동 패턴. 이름표(ai)가 없으면 보스는 boss, 나머지는 basic이에요.
// seq를 차례대로 돌고, charge(힘 모으기) 다음 차례는 반드시 smash(강타)예요.
const AI = {
  basic: { tough: 3, seq: ['atk', 'atk', 'charge'] },
  boss: { tough: 5, seq: ['atk', 'charge', 'aoe'] },
  // 청소부: 끝나 가는 냄새(체력이 낮은 아군)만 쫓고(도발 무시), 보호막째 갉아먹어요
  swarm: { tough: 3, seq: ['atk', 'atk', 'gnaw'], hunt: true },
  // 청소부 킹: 베어도 재처럼 다시 모여요. 흐트러지면 머리 뒤 '빈자리'가 드러나요
  king: { tough: 6, seq: ['atk', 'charge', 'aoe', 'call'], regen: 0.02, breakTaken: 2, call: '청소부' },
};
const INTENT = {
  atk: { mult: 1, name: '공격', icon: '⚔' },
  gnaw: { mult: 1.2, name: '갉아먹기', icon: '🦷', pierce: true, note: '보호막 무시' },
  smash: { mult: 2.1, name: '강타', icon: '💢' },
  aoe: { mult: 0.7, name: '광역 공격', icon: '💥', all: true },
  charge: { name: '힘 모으기', icon: '⚡', note: '다음 차례 강타 · 흐트러뜨리면 취소' },
  call: { name: '무리 부르기', icon: '📣' },
};

function makeAlly(c) {
  const s = stats(c);
  const ult = c.skill || { kind: 'dmg', power: 1.5, name: '필살기' };
  const rsk = ROLE_SK[c.role] || ROLE_SK.atk;
  return { side: 'a', c, name: c.name, elem: c.elem, role: c.role, ...s, mhp: s.hp, ult, rsk, cost: rsk.cost, en: ULT_START, shield: 0, buf: 0, bufT: 0, shT: 0, tauntT: 0, av: 0 };
}
// 데이터에 ai가 없어도 이야기 에너미는 제 패턴을 쓰게 해요
const NAME_AI = { '청소부': 'swarm', '청소부 킹': 'king' };
function makeFoe(e, scale) {
  const k = scale || 1;
  const ai = AI[e.ai] ? e.ai : NAME_AI[e.name] || (e.boss ? 'boss' : 'basic');
  const tough = e.tough || AI[ai].tough;
  return { side: 'e', src: e, name: e.name, elem: e.elem, boss: !!e.boss, ai, hp: Math.round(e.hp * k), mhp: Math.round(e.hp * k), atk: Math.round(e.atk * Math.sqrt(k)), def: Math.round(e.def * Math.sqrt(k)), spd: e.spd || 100, turn: 0, buf: 0, bufT: 0, mark: 0, markT: 0, shield: 0, tough, mtough: tough, broken: false, intent: null, av: 0 };
}
const cutArt = c => img(c.pose?.id) || upper(c) || standing(c);

// opt: {title, bg, enemies, squad(chars), scale, music, limit(제한 차례 수, 넘기면 패배)}
export function runBattle(opt) {
  return new Promise(resolve => {
    const A = opt.squad.map(makeAlly), E = opt.enemies.map(e => makeFoe(e, opt.scale));
    // 같은 이름의 적이 여럿이면 A, B, C를 붙여 로그에서 구분해요
    const seen = {};
    const labelFoe = e => { seen[e.name] = (seen[e.name] || 0) + 1; e.label = e.name + ' ' + 'ABCDEFGH'[seen[e.name] - 1]; };
    const cnt = {}; E.forEach(e => { cnt[e.name] = (cnt[e.name] || 0) + 1; });
    E.forEach(e => { if (cnt[e.name] > 1) labelFoe(e); else e.label = e.name; });
    A.forEach(a => { a.label = a.name; });
    // 처음 자리: 속도대로, 약간씩 흔들어서
    [...A, ...E].forEach(u => { u.av = gap(u) * rand(0.35, 0.6); });
    const ov = $('#ov'); ov.hidden = false;
    let auto = !!S.settings.auto, speed = SPEED[S.settings.speed] ? S.settings.speed : 1, over = false, waiting = null, target = null, turns = 0, cur = null, acting = null;
    let sp = SP_START, called = 0, ulting = false;
    const ultQ = [];
    const maxCall = Math.max(0, Math.min(2, A.length - 1)); // 편성이 적으면 무리도 덜 불러요
    const logs = [];
    bgm(opt.music || (E.some(e => e.boss) ? (G.prog?.scene?.boss || '보스전') : (G.prog?.scene?.battle || '전투')));
    ov.innerHTML = `<div class="battle tlb ${speed === 3 ? 'fast' : ''}" style='${bgCss(opt.bg)}'>
      <div class="bt-top"><button class="back" id="btRun">후퇴</button><span class="ttl">${esc(opt.title || '')}</span><span class="bt-round" id="btRound"></span>
        <button class="btn sub sm" id="btSpd">x${SPEED[speed]}</button><button class="btn sub sm ${auto ? 'on' : ''}" id="btAuto">${auto ? '자동 ON' : '자동 OFF'}</button></div>
      <div class="bt-order" id="btOrder"></div>
      <div class="foes" id="foes"></div>
      <div class="bt-banner" id="btBanner"></div>
      <div class="allies" id="allies"></div>
      <div class="bt-side"><div class="blog" id="blog"></div><div class="bt-sp" id="btSp"></div><div class="cmd" id="cmd"></div></div>
      <div class="cutin" id="cutin"></div></div>`;
    const fast = () => speed === 3;
    const W = ms => sleep(ms / SPEED[speed] / (fast() ? 1.6 : 1));
    const alive = arr => arr.filter(u => u.hp > 0);
    const nm = (u, cls) => `<b class="${u.side === 'a' ? 'na' : 'ne'} ${cls || ''}">${esc(u.label)}</b>`;
    const adv = (a, e) => elemMult(a.elem, e.elem) > 1;
    function log(html) {
      logs.push(html); if (logs.length > 3) logs.shift();
      $('#blog', ov).innerHTML = logs.map((l, i) => `<p class="${i === logs.length - 1 ? 'new' : ''}">${l}</p>`).join('');
    }
    function banner(html, big) {
      if (fast() && !/승리|패배/.test(html)) return;
      const b = $('#btBanner', ov); b.className = 'bt-banner' + (big ? ' big' : ''); b.innerHTML = html;
      void b.offsetWidth; b.classList.add('on');
    }
    const hideBanner = () => $('#btBanner', ov).classList.remove('on');

    // ---- 타임라인 ----
    // 남은 거리(av)가 가장 짧은 쪽이 다음 차례. 차례가 끝나면 한 간격만큼 뒤로 가요
    function forecast(n = TL_SHOW) {
      const q = [...alive(A), ...alive(E)].map(u => ({ u, t: u.av + (u.side === 'a' ? 0 : 0.001) }));
      const out = [];
      if (!q.length) return out;
      while (out.length < n) {
        q.sort((x, y) => x.t - y.t);
        out.push(q[0]); q[0] = { u: q[0].u, t: q[0].t + gap(q[0].u) };
      }
      return out;
    }
    const nextUnit = () => [...alive(A), ...alive(E)].sort((x, y) => (x.av + (x.side === 'a' ? 0 : 0.001)) - (y.av + (y.side === 'a' ? 0 : 0.001)))[0];
    const push = (u, pct) => { u.av = Math.max(0, u.av + gap(u) * pct); }; // +: 밀기, -: 당기기

    // ---- 적의 다음 행동(예고) ----
    const taunter = () => alive(A).find(x => x.tauntT > 0);
    function huntTarget() { // 체력 비율이 가장 낮은 아군
      return alive(A).map(x => [x, x.hp / x.mhp + Math.random() * 0.01]).sort((x, y) => x[1] - y[1])[0][0];
    }
    function baseTarget(e) {
      const al = alive(A); if (!al.length) return null;
      if (AI[e.ai].hunt) return huntTarget();
      const tanks = al.filter(x => x.role === 'def');
      return tanks.length && Math.random() < 0.5 ? pick(tanks) : pick(al);
    }
    function planIntent(e) {
      if (e.hp <= 0) { e.intent = null; return; }
      const ai = AI[e.ai];
      let kind = e.charged ? 'smash' : ai.seq[e.turn % ai.seq.length];
      if (kind === 'call' && (called >= maxCall || alive(E).filter(x => !x.boss).length >= 2)) kind = 'atk';
      const it = INTENT[kind];
      e.intent = { kind, target: it.mult && !it.all ? baseTarget(e) : null };
    }
    // 실제로 맞을 아군: 도발 중인 아군이 있으면 그쪽이 대신 맞아요. 청소부는 대상이 쓰러지면 다음으로 약한 쪽을 찾아요
    function intentTarget(e) {
      const t = e.intent?.target; if (!t) return null;
      const tt = !AI[e.ai].hunt && taunter(); if (tt) return tt; // 청소부는 도발을 무시하고 냄새만 따라가요
      if (t.hp > 0) return t;
      return (e.intent.target = AI[e.ai].hunt ? huntTarget() : pick(alive(A)));
    }
    // 예상 피해(흔들림·치명 제외)
    function estDmg(src, dst, mult) {
      let d = src.atk * (1 + (src.buf || 0)) * mult * elemMult(src.elem, dst.elem) * (120 / (120 + dst.def));
      if (dst.side === 'a') {
        if (dst.role === 'def') d *= 0.85;
        if (AI[src.ai]?.hunt && dst.hp / dst.mhp < LOW_HP) d *= 1.3; // 끝나 가는 냄새
      } else {
        if (dst.broken) d *= AI[dst.ai].breakTaken || BREAK_TAKEN;
        if (dst.buf < 0) d *= 1 - dst.buf * 0.75; // 매료: 받는 피해 증가
        if (dst.markT) d *= 1 + dst.mark; // 조준: 약점이 드러나 받는 피해 증가
      }
      return Math.max(1, d);
    }
    // 각 적의 다음 행동으로 아군이 받을 것으로 보이는 피해 합
    function incoming(a) {
      let sum = 0;
      for (const e of alive(E)) {
        if (!e.intent) continue;
        const it = INTENT[e.intent.kind]; if (!it.mult) continue;
        if (it.all || intentTarget(e) === a) sum += estDmg(e, a, it.mult);
      }
      return sum;
    }
    function intentHtml(e) {
      const i = e.intent; if (!i || e.hp <= 0) return '';
      const it = INTENT[i.kind];
      let body = `${it.icon} ${it.name}`;
      if (it.mult && !it.all) { const t = intentTarget(e); if (t) body += ` → <b>${esc(t.label)}</b> <span class="ie">약 ${n0(estDmg(e, t, it.mult))}</span>`; }
      else if (it.all) body += ` → <b>아군 전체</b>`;
      if (it.note) body += ` <span class="in">${it.note}</span>`;
      if (e.broken) body = `<span class="in">정신 차린 뒤</span> ${body}`;
      return `<div class="intent i-${i.kind}">${body}</div>`;
    }

    function drawOrder() {
      const r = $('#btRound', ov);
      if (opt.limit) { const left = opt.limit - turns; r.textContent = `남은 차례 ${Math.max(0, left)}`; r.classList.toggle('low', left <= 8); }
      else r.textContent = turns ? `${turns}번째 차례` : '';
      const fc = forecast();
      const q = ultQ.filter(a => a.hp > 0);
      const face = u => u.side === 'a' ? (upper(u.c) || standing(u.c)) : libImg('enemy', u.name);
      const chipHtml = (u, cls, tag) => { const f = face(u); return `<span class="oc ${u.side} ${cls}">${f ? `<img src="${f}" alt="">` : `<i>${u.side === 'a' ? esc(u.name[0]) : foeIcon(u.name)}</i>`}<em>${esc(u.label)}</em>${tag || ''}</span>`; };
      $('#btOrder', ov).innerHTML = `<span class="lb">타임라인</span>` +
        q.map(a => chipHtml(a, 'ultq', '<b class="ut">필살</b>')).join('') +
        fc.map((f, i) => chipHtml(f.u, `${i === 0 && f.u === acting ? 'now' : ''} ${f.u.broken ? 'stun' : ''}`)).join('<span class="ar">›</span>');
    }
    function drawSp() {
      const need = cur && waiting ? cur.cost : 0;
      $('#btSp', ov).innerHTML = `<span class="lb">업무 포인트</span>${Array.from({ length: SP_MAX }, (_, i) => `<i class="${i < sp ? 'on' : ''} ${need && i < sp && i >= sp - need ? 'use' : ''}"></i>`).join('')}<span class="n">${sp}/${SP_MAX}</span>`;
    }
    const chip = (t, cls) => `<span class="st ${cls || ''}">${t}</span>`;
    function drawFoes() {
      const me = cur && cur.side === 'a' && waiting ? cur : null;
      $('#foes', ov).innerHTML = E.map((e, i) => {
        const u = libImg('enemy', e.name);
        const tags = [];
        if (e.hp > 0 && me && adv(me, e)) tags.push(chip('상성 우위', 'good'));
        if (e.buf < 0 && e.bufT) tags.push(chip(`매료 ${e.bufT}`, 'good'));
        if (e.hp > 0 && e.markT) tags.push(chip(`◎ 조준 ${e.markT} · 받는 피해 +${Math.round(e.mark * 100)}%`, 'good'));
        const ai = AI[e.ai];
        if (e.hp > 0 && e.broken) tags.push(chip(ai.breakTaken ? `빈자리 노출 · 받는 피해 ×${ai.breakTaken}` : `받는 피해 ×${BREAK_TAKEN}`, 'good'));
        else if (e.hp > 0 && ai.regen) tags.push(chip(`재생 · 차례마다 ${Math.round(ai.regen * 100)}%`, 'bad'));
        const tg = e.hp > 0 ? `<div class="tgh ${e.broken ? 'brk' : ''}">${e.broken ? '흐트러짐!' : Array.from({ length: e.mtough }, (_, k) => `<i class="${k < e.tough ? 'on' : ''}"></i>`).join('')}</div>` : '';
        return `<div class="foe ${e.boss ? 'boss' : ''} ${e.hp <= 0 ? 'dead' : ''} ${e.broken ? 'broken' : ''} ${target === e ? 'tgt' : ''} ${acting === e ? 'acting' : ''}" data-f="${i}">
          ${intentHtml(e)}
          ${target === e && e.hp > 0 ? '<span class="tmark">대상</span>' : ''}
          <div class="fi">${u ? `<img src="${u}" alt="">` : foeIcon(e.name)}</div>
          <div class="fn"><span class="el el-${esc(e.elem)}" title="${esc(e.elem)}">${esc(String(e.elem || '')[0] || '')}</span> ${esc(e.label)}${e.boss ? ' 👑' : ''}</div>
          <div class="bar"><i style="width:${Math.max(0, e.hp / e.mhp * 100)}%"></i></div>
          <div class="hpn">${e.hp > 0 ? `${n0(e.hp)} / ${n0(e.mhp)}` : '쓰러짐'}</div>
          ${tg}
          <div class="sts">${tags.join('')}</div></div>`;
      }).join('');
    }
    function drawAllies() {
      $('#allies', ov).innerHTML = A.map((a, i) => {
        const tags = [];
        if (a.tauntT) tags.push(chip(`도발 ${a.tauntT}`, 'good'));
        if (a.shield) tags.push(chip(`🛡 ${n0(a.shield)}`, 'good'));
        if (a.buf > 0 && a.bufT) tags.push(chip(`공격↑ ${a.bufT}`, 'good'));
        const inc = a.hp > 0 ? incoming(a) : 0;
        const danger = inc >= a.hp + a.shield ? 'deadly' : inc >= (a.hp + a.shield) * 0.35 ? 'warn' : '';
        const img = upper(a.c) || standing(a.c);
        const full = a.hp > 0 && a.en >= ULT_MAX, q = ultQ.includes(a);
        return `<button class="ally ${a === acting ? 'act' : ''} ${a.hp <= 0 ? 'dead' : ''} ${full ? 'ult' : ''} ${q ? 'ultq' : ''}" data-a="${i}">
        ${img ? `<img src="${img}" alt="">` : `<div class="ph" style="height:100%">${esc(a.name)}</div>`}
        ${inc ? `<span class="inc ${danger}">⚠ 약 ${n0(inc)}</span>` : ''}
        ${full ? `<span class="ultb">${q ? '대기 중' : '필살기!'}</span>` : ''}
        <span class="an"><span class="el el-${esc(a.elem)}" title="${esc(a.elem)}">${esc(String(a.elem || '')[0] || '')}</span> ${esc(a.name)}</span><span class="sts">${tags.join('')}</span>
        <div class="hpw"><div class="hpn">${a.hp > 0 ? `${n0(a.hp)}<small> / ${n0(a.mhp)}</small>` : '전투 불능'}</div><div class="bar"><i style="width:${Math.max(0, a.hp / a.mhp * 100)}%"></i></div>
        ${a.shield ? `<div class="bar sh" style="margin-top:2px"><i style="width:${Math.min(100, a.shield / a.mhp * 100)}%"></i></div>` : ''}
        <div class="bar en ${full ? 'full' : ''}"><i style="width:${Math.min(100, a.en / ULT_MAX * 100)}%"></i></div></div></button>`;
      }).join('');
    }
    const drawAll = () => { drawOrder(); drawFoes(); drawAllies(); drawSp(); };
    function popup(el, text, cls) { if (!el) return; const d = document.createElement('div'); d.className = 'dmg ' + (cls || ''); d.innerHTML = text; el.append(d); setTimeout(() => d.remove(), 1300); }
    const foeEl = e => $(`[data-f="${E.indexOf(e)}"]`, ov), allyEl = a => $(`[data-a="${A.indexOf(a)}"]`, ov);
    const unitEl = u => u.side === 'e' ? foeEl(u) : allyEl(u);
    const flash = (el, cls) => { if (!el || fast()) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
    const charge = (a, n) => { if (a.hp > 0) a.en = Math.min(ULT_MAX, a.en + n); };

    function dealDmg(src, dst, mult, pierce) {
      const crit = Math.random() < 0.1;
      let d = estDmg(src, dst, mult) * rand(.92, 1.08) * (crit ? 1.5 : 1);
      d = Math.max(1, Math.round(d));
      let left = d, blocked = 0;
      if (dst.shield && !pierce) { blocked = Math.min(dst.shield, left); dst.shield -= blocked; left -= blocked; }
      dst.hp = Math.max(0, dst.hp - left);
      if (dst.side === 'a') charge(dst, GAIN.hit);
      else if (dst.hp <= 0) charge(src, GAIN.kill);
      return { d, hp: left, blocked, em: elemMult(src.elem, dst.elem), crit, ko: dst.hp <= 0, brk: dst.broken };
    }
    // 흐트러짐 게이지 깎기. 다 깎이면 타임라인에서 밀리고, 모으던 힘도 흩어져요
    function wear(e, n, quiet) {
      if (e.hp <= 0 || e.broken || n <= 0) return false;
      e.tough = Math.max(0, e.tough - n);
      if (e.tough > 0) return false;
      e.broken = true; e.charged = false; push(e, BREAK_DELAY);
      if (e.intent?.kind === 'smash') planIntent(e);
      sfx('seal');
      const ai = AI[e.ai];
      popup(foeEl(e), `<small>${ai.breakTaken ? '빈자리 노출!' : '흐트러짐!'}</small>💫`, 'brk');
      if (!quiet) log(`${nm(e)} <span class="hl">흐트러짐!</span> 타임라인에서 밀리고 받는 피해 ×${ai.breakTaken || BREAK_TAKEN}`);
      return true;
    }
    const breakAmt = (a, e, base) => base + (adv(a, e) ? 1 : 0) + (e.markT ? 1 : 0); // 상성 우위, 조준된 적은 게이지가 1 더 깎여요
    // 피해 한 번을 화면에 보여 주고 로그 한 줄 문구를 돌려줘요
    function showHit(dst, r) {
      drawFoes(); drawAllies();
      const el = unitEl(dst); flash(el, 'hit-anim');
      const tag = (r.crit ? '<small>치명!</small>' : '') + (r.brk ? '<small>흐트러짐 추가 피해</small>' : r.em > 1 ? '<small>상성 우위!</small>' : '');
      popup(el, `${tag}${r.hp ? '-' + n0(r.hp) : ''}${r.blocked ? `<small class="blk">🛡 ${n0(r.blocked)} 막음</small>` : ''}`, (dst.side === 'a' ? 'toa ' : '') + (r.em > 1 || r.crit || r.brk ? 'adv' : ''));
      const extra = [r.crit && '치명타', r.brk && '흐트러짐', r.em > 1 && '상성 우위', r.blocked && `보호막이 ${n0(r.blocked)} 막음`].filter(Boolean).join(', ');
      return `<span class="dn">${n0(r.hp)} 피해</span>${extra ? ` <span class="ex">(${extra})</span>` : ''}${r.ko ? ` <span class="ko">${esc(dst.label)} 쓰러짐</span>` : ''}`;
    }
    // 대상 자동 선택: 흐트러진 적 > 곧 흐트러질 적 > 힘 모으는 적 > 상성 우위 > 체력 낮은 적
    function foeScore(a, e, base, mult) {
      let s = 0;
      if (e.broken) s += 4;
      else if (e.tough <= breakAmt(a, e, base)) s += 3 + (e.intent?.kind === 'charge' || e.charged ? 2 : 0);
      if (e.intent?.kind === 'charge' || e.charged) s += 1.5;
      if (e.markT) s += 1.5; // 조준 표시가 뜬 적부터
      if (adv(a, e)) s += 1;
      if (e.hp <= estDmg(a, e, mult || 1)) s += 2.5;
      else if (!e.boss && e.hp <= 2.2 * estDmg(a, e, 1)) s += 2; // 곧 정리할 수 있는 졸개부터
      return s - e.hp / e.mhp;
    }
    function pickFoe(a = cur, base = 1, mult = 1) {
      if (target && target.hp > 0) return target;
      return alive(E).sort((x, y) => foeScore(a, y, base, mult) - foeScore(a, x, base, mult))[0];
    }
    async function startAct(u) {
      acting = u; drawAll();
      if (fast()) return;
      flash(unitEl(u), u.side === 'a' ? 'lunge-up' : 'lunge-down');
      await W(200);
    }
    const gainSp = n => { sp = Math.min(SP_MAX, sp + n); drawSp(); };

    // ---- 아군 차례: 공격 / 역할 스킬 ----
    async function allyAct(a, cmd) {
      await startAct(a);
      if (cmd === 'sk') {
        const k = a.rsk.kind;
        sfx('skill'); sp -= a.cost; drawSp();
        banner(`${nm(a)}<span class="sk">「${esc(a.rsk.name)}」</span><span class="kd">${esc(a.rsk.desc)}</span>`, true);
        await W(380);
        if (k === 'strike') {
          const e = pickFoe(a, 2, 1.9); const r = dealDmg(a, e, 1.9);
          log(`${nm(a)}의 「${esc(a.rsk.name)}」 → ${nm(e)} ${showHit(e, r)}`);
          wear(e, breakAmt(a, e, 2));
        } else if (k === 'cover') {
          a.tauntT = 2; a.shield = Math.max(a.shield, Math.round(a.def * 2)); a.shT = 2;
          drawAllies(); popup(allyEl(a), `도발<small>🛡 ${n0(a.shield)}</small>`, 'heal');
          alive(E).forEach(e => { if (e.intent?.target) intentTarget(e); });
          log(`${nm(a)}이(가) 앞을 막아서요 <span class="ex">(2턴 도발, 보호막 ${n0(a.shield)})</span>`);
        } else {
          const others = alive(A).filter(x => x !== a);
          const x = (others.length ? others : [a]).sort((p, q) => p.hp / p.mhp - q.hp / q.mhp)[0];
          const h = Math.min(x.mhp - x.hp, Math.round(x.mhp * 0.12 + a.atk * 0.8));
          x.hp += h; if (x !== a) push(x, -0.3);
          drawAll(); popup(allyEl(x), `+${n0(h)}<small>행동 당김</small>`, 'heal');
          log(`${nm(a)}의 「${esc(a.rsk.name)}」 → ${nm(x)} <span class="hl">체력 ${n0(h)} 회복</span>${x !== a ? ' <span class="ex">(행동 30% 당김)</span>' : ''}`);
        }
        charge(a, GAIN.sk);
      } else {
        const e = pickFoe(a, 1);
        banner(`${nm(a)}<span class="vs">▶</span>${nm(e)}<span class="kd">공격 · 업무 포인트 +1</span>`);
        await W(260);
        sfx('hit'); const r = dealDmg(a, e, 1);
        log(`${nm(a)}의 공격 → ${nm(e)} ${showHit(e, r)}`);
        wear(e, breakAmt(a, e, 1));
        gainSp(1); charge(a, GAIN.atk);
      }
      drawAll();
      await W(520); hideBanner();
    }

    // ---- 필살기: 컷인과 함께 언제든 끼어들어요 ----
    function cutIn(a, chain) {
      const el = $('#cutin', ov), art = cutArt(a.c);
      el.className = `cutin c-${a.elem || ''}`;
      el.innerHTML = `<div class="ci-dim"></div><div class="ci-band"></div><div class="ci-lines"></div>
        ${art ? `<img class="ci-art" src="${art}" alt="">` : ''}
        <div class="ci-txt">${chain ? '<span class="ci-chain">연계!</span>' : ''}<span class="ci-who"><span class="el el-${esc(a.elem)}">${esc(String(a.elem || '')[0] || '')}</span> ${esc(a.name)}</span><b>${esc(a.ult.name)}</b><small>${esc(SK_KIND[a.ult.kind] || '필살기')}</small></div>`;
      void el.offsetWidth; el.classList.add('on');
      sfx('flash'); setTimeout(() => sfx('skill'), 120);
      const ms = fast() ? 650 : speed === 2 ? 1050 : 1400;
      return new Promise(res => {
        let done = false;
        const fin = () => { if (done) return; done = true; el.onclick = null; el.classList.add('off'); setTimeout(() => { el.className = 'cutin'; el.innerHTML = ''; }, 220); res(); };
        el.onclick = fin; // 눌러서 넘기기
        setTimeout(fin, ms);
      });
    }
    async function doUlt(a, chain) {
      const sk = a.ult, p = sk.power || 1.5, k = sk.kind;
      a.en = 0; drawAllies();
      await cutIn(a, chain);
      if (over) return;
      if (k === 'aoe') {
        const parts = [];
        for (const e of alive(E)) { const r = dealDmg(a, e, p * 1.15); parts.push(`${esc(e.label)} ${showHit(e, r)}`); wear(e, breakAmt(a, e, 2), true); }
        drawFoes();
        log(`${nm(a)}의 「${esc(sk.name)}」 → 적 전체<br>${parts.join(' · ')}`);
      } else if (k === 'heal') {
        const h = Math.round(a.atk * p * 1.1);
        for (const x of alive(A)) { const got = Math.min(x.mhp - x.hp, h); x.hp += got; drawAllies(); popup(allyEl(x), '+' + n0(got), 'heal'); }
        log(`${nm(a)}의 「${esc(sk.name)}」 → 아군 전체 <span class="hl">체력 ${n0(h)} 회복</span>`);
      } else if (k === 'shield') {
        const sh = Math.round(a.def * p * 1.6);
        for (const x of alive(A)) { x.shield = Math.max(x.shield, sh); x.shT = 2; }
        drawAllies(); for (const x of alive(A)) popup(allyEl(x), '🛡 ' + n0(x.shield), 'heal');
        log(`${nm(a)}의 「${esc(sk.name)}」 → 아군 전체 <span class="hl">보호막 ${n0(sh)}</span> (2턴)`);
      } else if (k === 'scale') {
        // 보호막과 함께 공격력도 올려 줘요. 막아 줄 테니 대담하게 치라는 뜻이에요
        const sh = Math.round(a.def * p * 1.5), up = 0.12 * p;
        for (const x of alive(A)) { x.shield = Math.max(x.shield, sh); x.shT = 2; x.buf = Math.max(x.buf || 0, up); x.bufT = 2; }
        drawAllies(); for (const x of alive(A)) popup(allyEl(x), `🛡 ${n0(sh)}<small>공격↑</small>`, 'heal');
        log(`${nm(a)}의 「${esc(sk.name)}」 → 아군 전체 <span class="hl">보호막 ${n0(sh)} · 공격력 ${Math.round(up * 100)}% 증가</span> (2턴)`);
      } else if (k === 'mark') {
        // 대상 하나에 조준 표시: 받는 피해가 늘고, 아군 공격이 흐트러짐 게이지를 1 더 깎고, 타임라인에서 밀려나요
        const e = target && target.hp > 0 ? target : alive(E).sort((x, y) => (y.boss - x.boss) || (x.broken - y.broken) || (y.hp - x.hp))[0];
        e.mark = 0.2 * p; e.markT = 2; push(e, 0.25);
        popup(foeEl(e), '◎ 조준', 'adv'); sfx('seal');
        const b = breakAmt(a, e, 1);
        wear(e, b, true); drawAll();
        log(`${nm(a)}의 「${esc(sk.name)}」 → ${nm(e)} <span class="hl">조준</span> (2턴: 받는 피해 +${Math.round(e.mark * 100)}%, 아군 공격마다 흐트러짐 게이지 -1 추가, 행동 밀림)${e.broken ? ' <span class="hl">흐트러짐!</span>' : ''}`);
      } else if (k === 'buff') {
        for (const x of alive(A)) { x.buf = Math.max(x.buf || 0, 0.17 * p); x.bufT = 2; if (x !== cur) push(x, -0.2); }
        drawAll(); for (const x of alive(A)) popup(allyEl(x), '공격↑', 'heal');
        log(`${nm(a)}의 「${esc(sk.name)}」 → 아군 전체 <span class="hl">공격력 ${Math.round(17 * p)}% 증가</span> (2턴) · 행동 20% 당김`);
      } else if (k === 'debuff') {
        for (const e of alive(E)) { e.buf = -0.2 * p; e.bufT = 2; push(e, 0.15); popup(foeEl(e), '매료', 'adv'); wear(e, 1, true); }
        drawAll();
        log(`${nm(a)}의 「${esc(sk.name)}」 → 적 전체 <span class="hl">매료</span> (2턴: 주는 피해↓ 받는 피해↑, 흐트러짐 게이지 -1, 행동 밀림)`);
      } else {
        const e = pickFoe(a, 3, p * 1.3); const r = dealDmg(a, e, p * 1.3);
        log(`${nm(a)}의 「${esc(sk.name)}」 → ${nm(e)} ${showHit(e, r)}`);
        wear(e, breakAmt(a, e, 3));
      }
      drawAll();
      await W(450);
    }
    // 쌓인 필살기를 차례로 터뜨려요. 자동이면 쓸모 있을 때 알아서 넣어요
    async function flushUlt() {
      if (ulting || over) return;
      if (auto) for (const a of alive(A)) if (a.en >= ULT_MAX && !ultQ.includes(a) && aiUlt(a)) ultQ.push(a);
      if (!ultQ.length) return;
      ulting = true;
      let n = 0;
      while (ultQ.length && !over) {
        const a = ultQ.shift();
        if (a.hp <= 0 || a.en < ULT_MAX || !alive(E).length) continue;
        await doUlt(a, n++ > 0);
        if (!alive(E).length) break;
      }
      ulting = false; drawAll();
    }

    function callAdd(boss) {
      const proto = opt.enemies.find(x => x.name === AI[boss.ai].call && !x.boss) || { name: AI[boss.ai].call, elem: boss.elem, hp: Math.round(boss.mhp * 0.12), atk: Math.round(boss.atk * 0.7), def: 20, spd: 95, ai: 'swarm' };
      const e = makeFoe(proto, opt.scale);
      labelFoe(e);
      e.av = gap(e); // 바로 움직이지는 않아요
      // 보스 옆자리를 채워요
      const dead = E.findIndex(x => x.hp <= 0 && !x.boss);
      if (dead >= 0) E[dead] = e; else E.push(e);
      planIntent(e);
      called++;
      return e;
    }
    async function foeAct(e) {
      if (!alive(A).length) return;
      await startAct(e);
      const ai = AI[e.ai];
      if (e.broken) {
        e.broken = false; e.tough = e.mtough; drawFoes();
        log(`${nm(e)}이(가) 정신을 차렸어요. 흐트러짐 게이지가 다시 차올라요`);
      } else if (ai.regen && e.hp < e.mhp) {
        const h = Math.min(e.mhp - e.hp, Math.round(e.mhp * ai.regen));
        e.hp += h; drawFoes(); popup(foeEl(e), `<small>재생</small>+${n0(h)}`, 'heal');
        log(`${nm(e)}의 몸이 재처럼 다시 모여요 <span class="hl">+${n0(h)}</span> <span class="ex">(흐트러뜨리면 멈춰요)</span>`);
      }
      const kind = e.intent?.kind || 'atk', it = INTENT[kind];
      if (kind !== 'smash') e.turn++;
      if (kind === 'charge') {
        e.charged = true; sfx('flash');
        banner(`${nm(e)}<span class="sk">힘을 모아요</span><span class="kd">다음 차례에 강타! 흐트러뜨리면 취소돼요</span>`, true);
        log(`${nm(e)}이(가) 힘을 모아요. <span class="ko">다음 차례 강타</span>`);
        await W(650);
      } else if (kind === 'call') {
        sfx('skill');
        banner(`${nm(e)}<span class="sk">무리 부르기</span><span class="kd">끝나 가는 냄새에 청소부가 몰려와요</span>`, true);
        await W(350);
        const add = callAdd(e); drawAll(); flash(foeEl(add), 'hit-anim');
        log(`${nm(e)}이(가) ${nm(add)}을(를) 불렀어요`);
        await W(500);
      } else {
        // 공격 직전: 필살기가 끼어들 수 있는 순간이에요
        const big = kind !== 'atk';
        const t0 = it.all ? null : intentTarget(e);
        banner(it.all ? `${nm(e)}<span class="sk">${it.name}!</span><span class="kd">아군 전체</span>` : `${nm(e)}<span class="vs">▶</span>${nm(t0 || alive(A)[0])}<span class="${big ? 'sk' : 'kd'}">${it.name}</span>`, big || it.all);
        await W(big || it.all ? 420 : 240);
        if (ultQ.length || auto) { hideBanner(); await flushUlt(); }
        if (over || e.hp <= 0 || !alive(A).length) { hideBanner(); planIntent(e); return; }
        if (e.broken) { // 끼어든 필살기에 흐트러져서 공격이 끊겼어요
          hideBanner(); e.charged = false;
          log(`${nm(e)}의 ${it.name}이(가) <span class="hl">끊겼어요!</span>`);
          planIntent(e); await W(400); return;
        }
        if (kind === 'smash') e.charged = false;
        if (it.all) {
          sfx('skill');
          const parts = alive(A).map(x => `${esc(x.label)} ${showHit(x, dealDmg(e, x, it.mult, it.pierce))}`);
          log(`${nm(e)}의 ${it.name} → 아군 전체<br>${parts.join(' · ')}`);
        } else {
          const t = intentTarget(e) || pick(alive(A));
          sfx('hit'); const r = dealDmg(e, t, it.mult, it.pierce);
          log(`${nm(e)}의 ${it.name} → ${nm(t)} ${showHit(t, r)}${t.tauntT ? ' <span class="ex">(도발)</span>' : ''}`);
        }
        await W(520);
      }
      hideBanner();
      planIntent(e);
    }
    // 자동 전투
    function aiCmd(a) {
      if (sp < a.cost) return 'atk';
      const k = a.rsk.kind, full = sp >= SP_MAX;
      if (k === 'strike') {
        const e = pickFoe(a, 2, 1.9);
        if (full || sp >= 4 || (e && (e.tough <= breakAmt(a, e, 2) || e.charged || e.intent?.kind === 'charge'))) return 'sk';
      } else if (k === 'cover') {
        if (!taunter() && alive(E).some(e => e.intent && !AI[e.ai].hunt && (e.intent.kind === 'smash' || (INTENT[e.intent.kind].mult && full)))) return 'sk';
      } else {
        if (alive(A).some(x => x !== a && x.hp / x.mhp < (full ? 0.85 : 0.6))) return 'sk';
      }
      return 'atk';
    }
    function aiUlt(a) {
      const k = a.ult.kind;
      if (k === 'heal') return alive(A).some(x => x.hp / x.mhp < 0.6);
      if (k === 'shield' || k === 'scale') return alive(A).some(x => !x.shield && incoming(x) > x.hp * 0.2) || (k === 'scale' && !alive(A).some(x => x.bufT));
      if (k === 'buff') return !alive(A).some(x => x.bufT);
      if (k === 'mark') return !alive(E).some(e => e.markT);
      return true;
    }
    function waitCmd(a) {
      hideBanner();
      return new Promise(res => {
        const c = $('#cmd', ov);
        const draw = () => {
          const t = pickFoe(a, 1);
          const ok = sp >= a.cost;
          c.innerHTML = `<div class="who">${nm(a)}의 차례 <span class="muted">· 대상: ${t ? esc(t.label) : '-'} (적을 눌러 바꿔요)</span></div>
          <div class="cmd-row"><button class="btn sub" data-c="atk">공격<small>포인트 +1 · ◆-${t ? breakAmt(a, t, 1) : 1}</small></button>
          <button class="btn skill" data-c="sk" ${ok ? '' : 'disabled'}>${esc(a.rsk.name)} <span class="cost">${a.cost}</span><small>${ok ? esc(a.rsk.desc) : `포인트가 ${a.cost - sp} 모자라요`}</small></button></div>
          <div class="hint">필살기는 게이지가 찬 카드를 눌러 언제든 써요</div>`;
        };
        draw(); c.redraw = draw;
        waiting = v => { c.innerHTML = ''; c.redraw = null; waiting = null; drawFoes(); drawSp(); res(v); };
        c.onclick = e => { const b = e.target.closest('[data-c]'); if (b && !b.disabled) waiting(b.dataset.c); };
        drawFoes(); drawSp();
      });
    }
    function endTurnTick(u) {
      if (u.bufT) { u.bufT--; if (!u.bufT) u.buf = 0; }
      if (u.shT) { u.shT--; if (!u.shT) u.shield = 0; }
      if (u.markT) { u.markT--; if (!u.markT) u.mark = 0; }
      if (u.tauntT) u.tauntT--;
    }
    function settled() {
      if (!alive(E).length) { end(true); return true; }
      if (!alive(A).length) { end(false); return true; }
      if (opt.limit && turns >= opt.limit) { end(false, '시간 초과…'); return true; }
      return false;
    }
    async function loop() {
      E.forEach(planIntent);
      drawAll();
      banner(E.some(e => e.boss) ? '<span class="sk">강적이 나타났어요!</span>' : '<span class="sk">전투 시작</span>', true);
      log(`적 ${E.length}체: ${E.map(e => esc(e.label)).join(', ')} <span class="ex">· 위쪽 타임라인에서 다음 차례를 확인해요</span>`);
      await W(900); hideBanner();
      while (!over) {
        await flushUlt();
        if (over || settled()) return;
        const u = nextUnit();
        const dt = u.av; for (const x of [...alive(A), ...alive(E)]) x.av = Math.max(0, x.av - dt);
        turns++;
        cur = u; acting = u; drawAll();
        if (u.side === 'a') {
          let cmd;
          for (;;) {
            cmd = auto ? aiCmd(u) : await waitCmd(u);
            if (over) return;
            if (cmd !== 'ult') break;
            await flushUlt();
            if (over || settled()) return;
          }
          await allyAct(u, cmd);
        } else await foeAct(u);
        if (over) return;
        u.av = gap(u); acting = null;
        endTurnTick(u); drawAll();
        if (settled()) return;
      }
    }
    async function end(win, why) {
      if (over) return; over = true;
      sfx(win ? 'win' : 'lose'); acting = null; drawAll();
      banner(`<span class="sk">${win ? '승리!' : why || '패배…'}</span>`, true);
      log(win ? '<span class="hl">승리!</span>' : why || '패배…');
      await sleep(fast() ? 700 : 1300);
      ov.hidden = true; ov.innerHTML = '';
      resolve({ win, rounds: turns, why, alive: alive(A).map(a => a.c.id) });
    }
    $('#foes', ov).onclick = e => { const f = e.target.closest('[data-f]'); if (!f) return; const t = E[+f.dataset.f]; if (t.hp > 0) { target = t; drawFoes(); $('#cmd', ov).redraw?.(); sfx('btn'); } };
    $('#allies', ov).onclick = e => {
      const b = e.target.closest('[data-a]'); if (!b || over) return;
      const a = A[+b.dataset.a];
      if (a.hp <= 0 || a.en < ULT_MAX || ultQ.includes(a)) return;
      ultQ.push(a); sfx('btn'); drawAll();
      if (waiting) waiting('ult');
    };
    $('#btAuto', ov).onclick = e => { auto = !auto; S.settings.auto = auto; save(); e.target.textContent = auto ? '자동 ON' : '자동 OFF'; e.target.classList.toggle('on', auto); if (auto && waiting) waiting(aiCmd(cur)); };
    $('#btSpd', ov).onclick = e => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; S.settings.speed = speed; save(); e.target.textContent = 'x' + SPEED[speed]; $('.battle', ov).classList.toggle('fast', fast()); if (fast()) hideBanner(); };
    $('#btRun', ov).onclick = async () => { if (await confirmBox('<h3>후퇴할까요?</h3><p class="muted">이번 전투는 패배로 처리돼요.</p>', '후퇴')) { if (waiting) waiting('atk'); end(false); } };
    loop();
  });
}
