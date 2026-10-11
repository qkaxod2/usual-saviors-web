// 턴제 전투
// 팀 업무 포인트(SP)를 모아 스킬을 쓰고, 적이 예고한 행동에 방어로 대응하고,
// 흐트러짐 게이지를 깎아 적의 차례를 빼앗는 구조예요.
import { $, esc, sfx, bgm, sleep, rand, pick, confirmBox } from './util.js';
import { G, libImg, upper, standing, elemMult, bgCss, roleName } from './data.js';
import { S, stats, save } from './state.js';

const FOE_ICON = ['👾', '🕷️', '⚙️', '🦇', '👁️', '🌀', '🐺', '💀'];
const foeIcon = n => { let h = 0; for (const ch of n) h = (h * 7 + ch.charCodeAt(0)) % 997; return FOE_ICON[h % FOE_ICON.length]; };
const n0 = v => Math.max(0, Math.round(v)).toLocaleString();
const SK_KIND = { dmg: '단일 공격', aoe: '적 전체 공격', heal: '아군 전체 회복', shield: '아군 전체 보호막', buff: '아군 전체 공격력 증가', debuff: '적 전체 매료', mark: '대상 조준 · 약점 노출', scale: '아군 전체 보호막 · 공격력 증가' };
const SP_MAX = 5, SP_START = 3;
const GUARD_CUT = 0.5;      // 방어 중 받는 피해
const BREAK_TAKEN = 1.5;    // 흐트러진 적이 받는 피해
const LOW_HP = 0.5;         // 청소부가 노리는 '끝나 가는' 체력
const skCost = sk => sk.cost ?? (sk.power >= 3 ? 3 : 2);
// 배속 단계 → 실제 속도. 3단계는 연출(돌진·배너·흔들림)을 대부분 건너뛰어요
const SPEED = { 1: 2, 2: 4, 3: 5 };

// 적 행동 패턴. 이름표(ai)가 없으면 보스는 boss, 나머지는 basic이에요.
// seq를 차례대로 돌고, charge(힘 모으기) 다음 차례는 반드시 smash(강타)예요.
const AI = {
  basic: { tough: 3, seq: ['atk', 'atk', 'charge'] },
  boss: { tough: 5, seq: ['atk', 'charge', 'aoe'] },
  // 청소부: 끝나 가는 냄새(체력이 낮은 아군)만 쫓고(도발 무시), 보호막째 갉아먹어요
  swarm: { tough: 3, seq: ['atk', 'atk', 'gnaw'], hunt: true },
  // 청소부 킹: 베어도 재처럼 다시 모여요. 흐트러지면 머리 뒤 '빈자리'가 드러나요
  king: { tough: 6, seq: ['atk', 'charge', 'aoe', 'call'], regen: 0.03, breakTaken: 2, call: '청소부' },
};
const INTENT = {
  atk: { mult: 1, name: '공격', icon: '⚔' },
  gnaw: { mult: 1.25, name: '갉아먹기', icon: '🦷', pierce: true, note: '보호막 무시' },
  smash: { mult: 2.3, name: '강타', icon: '💢' },
  aoe: { mult: 0.8, name: '광역 공격', icon: '💥', all: true },
  charge: { name: '힘 모으기', icon: '⚡', note: '다음 차례 강타' },
  call: { name: '무리 부르기', icon: '📣' },
  stun: { name: '흐트러짐', icon: '💫', note: '이번 차례 쉼' },
};

function makeAlly(c) {
  const s = stats(c);
  const sk = c.skill || { kind: 'dmg', power: 1.5, name: '스킬' };
  return { side: 'a', c, name: c.name, elem: c.elem, role: c.role, ...s, mhp: s.hp, sk, cost: skCost(sk), shield: 0, buf: 0, bufT: 0, shT: 0, guard: false };
}
// 툴에서 다시 변환해 ai가 빠져도 이야기 에너미는 제 패턴을 쓰게 해요
const NAME_AI = { '청소부': 'swarm', '청소부 킹': 'king' };
function makeFoe(e, scale) {
  const k = scale || 1;
  const ai = AI[e.ai] ? e.ai : NAME_AI[e.name] || (e.boss ? 'boss' : 'basic');
  const tough = e.tough || AI[ai].tough;
  return { side: 'e', src: e, name: e.name, elem: e.elem, boss: !!e.boss, ai, hp: Math.round(e.hp * k), mhp: Math.round(e.hp * k), atk: Math.round(e.atk * Math.sqrt(k)), def: Math.round(e.def * Math.sqrt(k)), spd: e.spd || 100, turn: 0, buf: 0, bufT: 0, mark: 0, markT: 0, shield: 0, tough, mtough: tough, broken: false, intent: null };
}

// opt: {title, bg, enemies, squad(chars), scale, music}
export function runBattle(opt) {
  return new Promise(resolve => {
    const A = opt.squad.map(makeAlly), E = opt.enemies.map(e => makeFoe(e, opt.scale));
    // 같은 이름의 적이 여럿이면 A, B, C를 붙여 로그에서 구분해요
    const seen = {};
    const labelFoe = e => { seen[e.name] = (seen[e.name] || 0) + 1; e.label = e.name + ' ' + 'ABCDEFGH'[seen[e.name] - 1]; };
    const cnt = {}; E.forEach(e => { cnt[e.name] = (cnt[e.name] || 0) + 1; });
    E.forEach(e => { if (cnt[e.name] > 1) labelFoe(e); else e.label = e.name; });
    A.forEach(a => { a.label = a.name; });
    const ov = $('#ov'); ov.hidden = false;
    let auto = !!S.settings.auto, speed = SPEED[S.settings.speed] ? S.settings.speed : 1, over = false, waiting = null, target = null, round = 0, order = [], cur = null, acting = null;
    let sp = SP_START, called = 0;
    const maxCall = Math.max(0, Math.min(2, A.length - 1)); // 편성이 적으면 무리도 덜 불러요
    const logs = [];
    bgm(opt.music || (E.some(e => e.boss) ? (G.prog?.scene?.boss || '보스전') : (G.prog?.scene?.battle || '전투')));
    ov.innerHTML = `<div class="battle ${speed === 3 ? 'fast' : ''}" style='${bgCss(opt.bg)}'>
      <div class="bt-top"><button class="back" id="btRun">후퇴</button><span class="ttl">${esc(opt.title || '')}</span><span class="bt-round" id="btRound"></span>
        <button class="btn sub sm" id="btSpd">x${SPEED[speed]}</button><button class="btn sub sm ${auto ? 'on' : ''}" id="btAuto">${auto ? '자동 ON' : '자동 OFF'}</button></div>
      <div class="bt-order" id="btOrder"></div>
      <div class="foes" id="foes"></div>
      <div class="bt-banner" id="btBanner"></div>
      <div class="allies" id="allies"></div>
      <div class="bt-side"><div class="blog" id="blog"></div><div class="bt-sp" id="btSp"></div><div class="cmd" id="cmd"></div></div></div>`;
    const fast = () => speed === 3;
    const W = ms => sleep(ms / SPEED[speed] / (fast() ? 1.6 : 1));
    const alive = arr => arr.filter(u => u.hp > 0);
    const nm = (u, cls) => `<b class="${u.side === 'a' ? 'na' : 'ne'} ${cls || ''}">${esc(u.label)}</b>`;
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

    // ---- 적의 다음 행동(예고) ----
    const taunter = () => alive(A).find(x => x.guard && x.role === 'def');
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
      if (e.skip) { e.intent = { kind: 'stun' }; return; }
      const ai = AI[e.ai];
      let kind = e.charged ? 'smash' : ai.seq[e.turn % ai.seq.length];
      if (kind === 'call' && (called >= maxCall || alive(E).filter(x => !x.boss).length >= 2)) kind = 'atk';
      const it = INTENT[kind];
      e.intent = { kind, target: it.mult && !it.all ? baseTarget(e) : null };
    }
    // 실제로 맞을 아군: 방어 중인 방어형이 있으면 그쪽이 대신 맞아요. 청소부는 대상이 쓰러지면 다음으로 약한 쪽을 찾아요
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
        if (dst.guard) d *= GUARD_CUT;
        if (AI[src.ai]?.hunt && dst.hp / dst.mhp < LOW_HP) d *= 1.3; // 끝나 가는 냄새
      } else {
        if (dst.broken) d *= AI[dst.ai].breakTaken || BREAK_TAKEN;
        if (dst.buf < 0) d *= 1 - dst.buf * 0.75; // 매료·약화: 받는 피해 증가
        if (dst.markT) d *= 1 + dst.mark; // 조준: 약점이 드러나 받는 피해 증가
      }
      return Math.max(1, d);
    }
    // 이번 라운드에 아군이 받을 것으로 보이는 피해 합
    function incoming(a) {
      let sum = 0;
      for (const e of alive(E)) {
        if (e.done || !e.intent) continue;
        const it = INTENT[e.intent.kind]; if (!it.mult) continue;
        if (it.all || intentTarget(e) === a) sum += estDmg(e, a, it.mult);
      }
      return sum;
    }
    function intentHtml(e) {
      const i = e.intent; if (!i || e.hp <= 0) return '';
      const it = INTENT[i.kind];
      let body = `${it.icon} ${it.name}`, cls = i.kind;
      if (it.mult && !it.all) { const t = intentTarget(e); if (t) body += ` → <b>${esc(t.label)}</b> <span class="ie">약 ${n0(estDmg(e, t, it.mult))}</span>`; }
      else if (it.all) body += ` → <b>아군 전체</b>`;
      if (it.note) body += ` <span class="in">${it.note}</span>`;
      if (e.broken && i.kind !== 'stun') body = `<span class="in">정신 차린 뒤</span> ${body}`;
      if (e.done) cls += ' done';
      return `<div class="intent i-${cls}">${e.done ? '<span class="in">이번 라운드 행동 끝</span>' : body}</div>`;
    }

    // 행동 순서: 이번 라운드에 남은 차례를 왼쪽부터 보여 줘요
    function drawOrder() {
      $('#btRound', ov).textContent = round ? `라운드 ${round}` : '';
      const left = order.filter(u => u.hp > 0 && !u.done);
      $('#btOrder', ov).innerHTML = left.length ? `<span class="lb">행동 순서</span>` + left.map(u => {
        const face = u.side === 'a' ? (upper(u.c) || standing(u.c)) : libImg('enemy', u.name);
        return `<span class="oc ${u.side} ${u === acting ? 'now' : ''} ${u.skip ? 'stun' : ''}">${face ? `<img src="${face}" alt="">` : `<i>${u.side === 'a' ? esc(u.name[0]) : foeIcon(u.name)}</i>`}<em>${esc(u.label)}</em></span>`;
      }).join('<span class="ar">›</span>') : '';
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
        const em = me ? elemMult(me.elem, e.elem) : 1;
        const tags = [];
        if (e.hp > 0 && em > 1) tags.push(chip('약점', 'good'));
        if (e.hp > 0 && em < 1) tags.push(chip('저항', 'bad'));
        if (e.buf < 0 && e.bufT) tags.push(chip(`매료 ${e.bufT}`, 'good'));
        if (e.hp > 0 && e.markT) tags.push(chip(`◎ 조준 ${e.markT} · 받는 피해 +${Math.round(e.mark * 100)}%`, 'good'));
        const ai = AI[e.ai];
        if (e.hp > 0 && e.broken) tags.push(chip(ai.breakTaken ? `빈자리 노출 · 받는 피해 ×${ai.breakTaken}` : `받는 피해 ×${BREAK_TAKEN}`, 'good'));
        else if (e.hp > 0 && ai.regen) tags.push(chip(`재생 · 라운드마다 ${Math.round(ai.regen * 100)}%`, 'bad'));
        const tg = e.hp > 0 ? `<div class="tgh ${e.broken ? 'brk' : ''}">${e.broken ? '흐트러짐!' : Array.from({ length: e.mtough }, (_, k) => `<i class="${k < e.tough ? 'on' : ''}"></i>`).join('')}</div>` : '';
        return `<div class="foe ${e.boss ? 'boss' : ''} ${e.hp <= 0 ? 'dead' : ''} ${e.broken ? 'broken' : ''} ${target === e ? 'tgt' : ''} ${acting === e ? 'acting' : ''}" data-f="${i}">
          ${intentHtml(e)}
          ${target === e && e.hp > 0 ? '<span class="tmark">대상</span>' : ''}
          <div class="fi">${u ? `<img src="${u}" alt="">` : foeIcon(e.name)}</div>
          <div class="fn"><span class="el el-${esc(e.elem)}">${esc(e.elem)}</span> ${esc(e.label)}${e.boss ? ' 👑' : ''}</div>
          <div class="bar"><i style="width:${Math.max(0, e.hp / e.mhp * 100)}%"></i></div>
          <div class="hpn">${e.hp > 0 ? `${n0(e.hp)} / ${n0(e.mhp)}` : '쓰러짐'}</div>
          ${tg}
          <div class="sts">${tags.join('')}</div></div>`;
      }).join('');
    }
    function drawAllies() {
      $('#allies', ov).innerHTML = A.map((a, i) => {
        const tags = [];
        if (a.guard) tags.push(chip(a.role === 'def' ? '방어 · 도발' : '방어', 'good'));
        if (a.shield) tags.push(chip(`🛡 ${n0(a.shield)}`, 'good'));
        if (a.buf > 0 && a.bufT) tags.push(chip(`공격↑ ${a.bufT}`, 'good'));
        const inc = a.hp > 0 ? incoming(a) : 0;
        const danger = inc >= a.hp + a.shield ? 'deadly' : inc >= (a.hp + a.shield) * 0.35 ? 'warn' : '';
        const img = upper(a.c) || standing(a.c);
        return `<button class="ally ${a === acting ? 'act' : ''} ${a.hp <= 0 ? 'dead' : ''} ${a.guard ? 'guard' : ''}" data-a="${i}">
        ${img ? `<img src="${img}" alt="">` : `<div class="ph" style="height:100%">${esc(a.name)}</div>`}
        ${inc ? `<span class="inc ${danger}">⚠ 약 ${n0(inc)}</span>` : ''}
        <span class="an"><span class="el el-${esc(a.elem)}">${esc(a.elem)}</span> ${esc(a.name)}</span><span class="sts">${tags.join('')}</span>
        <div class="hpw"><div class="hpn">${a.hp > 0 ? `${n0(a.hp)}<small> / ${n0(a.mhp)}</small>` : '전투 불능'}</div><div class="bar"><i style="width:${Math.max(0, a.hp / a.mhp * 100)}%"></i></div>
        ${a.shield ? `<div class="bar sh" style="margin-top:2px"><i style="width:${Math.min(100, a.shield / a.mhp * 100)}%"></i></div>` : ''}
        <div class="skb ${sp >= a.cost ? 'ready' : ''}">스킬 SP ${a.cost}</div></div></button>`;
      }).join('');
    }
    const drawAll = () => { drawOrder(); drawFoes(); drawAllies(); drawSp(); };
    function popup(el, text, cls) { if (!el) return; const d = document.createElement('div'); d.className = 'dmg ' + (cls || ''); d.innerHTML = text; el.append(d); setTimeout(() => d.remove(), 1300); }
    const foeEl = e => $(`[data-f="${E.indexOf(e)}"]`, ov), allyEl = a => $(`[data-a="${A.indexOf(a)}"]`, ov);
    const unitEl = u => u.side === 'e' ? foeEl(u) : allyEl(u);
    const flash = (el, cls) => { if (!el || fast()) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

    function dealDmg(src, dst, mult, pierce) {
      const crit = Math.random() < 0.1;
      let d = estDmg(src, dst, mult) * rand(.92, 1.08) * (crit ? 1.5 : 1);
      d = Math.max(1, Math.round(d));
      let left = d, blocked = 0;
      if (dst.shield && !pierce) { blocked = Math.min(dst.shield, left); dst.shield -= blocked; left -= blocked; }
      dst.hp = Math.max(0, dst.hp - left);
      return { d, hp: left, blocked, em: elemMult(src.elem, dst.elem), crit, ko: dst.hp <= 0, brk: dst.broken };
    }
    // 흐트러짐 게이지 깎기. 다 깎이면 다음 차례를 쉬고, 모으던 힘도 흩어져요
    function wear(e, n, quiet) {
      if (e.hp <= 0 || e.broken || n <= 0) return false;
      e.tough = Math.max(0, e.tough - n);
      if (e.tough > 0) return false;
      e.broken = true; e.skip = true; e.charged = false; e.intent = { kind: 'stun' };
      sfx('seal');
      const ai = AI[e.ai];
      popup(foeEl(e), `<small>${ai.breakTaken ? '빈자리 노출!' : '흐트러짐!'}</small>💫`, 'brk');
      if (!quiet) log(`${nm(e)} <span class="hl">흐트러짐!</span> 다음 차례를 쉬고 받는 피해 ×${ai.breakTaken || BREAK_TAKEN}`);
      return true;
    }
    const breakAmt = (a, e, base) => base + (elemMult(a.elem, e.elem) > 1 ? 1 : 0) + (e.markT ? 1 : 0); // 조준된 적은 게이지가 1 더 깎여요
    // 피해 한 번을 화면에 보여 주고 로그 한 줄 문구를 돌려줘요
    function showHit(dst, r) {
      drawFoes(); drawAllies();
      const el = unitEl(dst); flash(el, 'hit-anim');
      const tag = (r.crit ? '<small>치명!</small>' : '') + (r.brk ? '<small>흐트러짐 추가 피해</small>' : r.em > 1 ? '<small>약점!</small>' : r.em < 1 ? '<small>저항</small>' : '');
      popup(el, `${tag}${r.hp ? '-' + n0(r.hp) : ''}${r.blocked ? `<small class="blk">🛡 ${n0(r.blocked)} 막음</small>` : ''}`, (dst.side === 'a' ? 'toa ' : '') + (r.em > 1 || r.crit || r.brk ? 'adv' : ''));
      const extra = [r.crit && '치명타', r.brk && '흐트러짐', r.em > 1 && '약점', r.em < 1 && '저항', r.blocked && `보호막이 ${n0(r.blocked)} 막음`].filter(Boolean).join(', ');
      return `<span class="dn">${n0(r.hp)} 피해</span>${extra ? ` <span class="ex">(${extra})</span>` : ''}${r.ko ? ` <span class="ko">${esc(dst.label)} 쓰러짐</span>` : ''}`;
    }
    // 대상 자동 선택: 흐트러진 적 > 곧 흐트러질 적 > 힘 모으는 적 > 약점 > 체력 낮은 적
    function foeScore(a, e, base) {
      let s = 0;
      if (e.broken) s += 4;
      else if (e.tough <= breakAmt(a, e, base)) s += 3 + (e.intent && INTENT[e.intent.kind].mult > 1 || e.intent?.kind === 'charge' ? 2 : 0);
      if (e.intent?.kind === 'charge' || e.charged) s += 1.5;
      if (e.markT) s += 1.5; // 조준 표시가 뜬 적부터
      if (elemMult(a.elem, e.elem) > 1) s += 1;
      if (elemMult(a.elem, e.elem) < 1) s -= 1;
      if (e.hp <= estDmg(a, e, base === 1 ? 1 : a.sk.power)) s += 2.5;
      else if (!e.boss && e.hp <= 2.2 * estDmg(a, e, 1)) s += 2; // 곧 정리할 수 있는 졸개부터
      return s - e.hp / e.mhp;
    }
    function pickFoe(a = cur, base = 1) {
      if (target && target.hp > 0) return target;
      return alive(E).sort((x, y) => foeScore(a, y, base) - foeScore(a, x, base))[0];
    }
    async function startAct(u) {
      acting = u; drawAll();
      if (fast()) return;
      flash(unitEl(u), u.side === 'a' ? 'lunge-up' : 'lunge-down');
      await W(260);
    }
    const gainSp = n => { sp = Math.min(SP_MAX, sp + n); drawSp(); };
    async function allyAct(a, cmd) {
      const sk = a.sk;
      a.lastGrd = cmd === 'grd';
      await startAct(a);
      if (cmd === 'grd') {
        a.guard = true; gainSp(1); sfx('btn');
        banner(`${nm(a)}<span class="kd">${a.role === 'def' ? '방어 · 적의 단일 공격을 대신 맞아요' : '방어 · 받는 피해 절반'}</span>`);
        popup(allyEl(a), '방어', 'heal');
        log(`${nm(a)} 방어 태세 <span class="ex">(받는 피해 절반${a.role === 'def' ? ', 도발' : ''}, SP +1)</span>`);
        drawAll();
        await W(700); hideBanner(); return;
      }
      if (cmd === 'sk') {
        sfx('skill'); sp -= a.cost; drawSp();
        banner(`${nm(a)}<span class="sk">「${esc(sk.name)}」</span><span class="kd">${esc(SK_KIND[sk.kind] || '스킬')}</span>`, true);
        const k = sk.kind;
        await W(500);
        if (k === 'aoe') {
          const parts = [];
          for (const e of alive(E)) { const r = dealDmg(a, e, sk.power); parts.push(`${esc(e.label)} ${showHit(e, r)}`); wear(e, breakAmt(a, e, 1), true); }
          drawFoes();
          log(`${nm(a)}의 「${esc(sk.name)}」 → 적 전체<br>${parts.join(' · ')}`);
        } else if (k === 'heal') {
          const h = Math.round(a.atk * sk.power * 0.85);
          for (const x of alive(A)) { const got = Math.min(x.mhp - x.hp, h); x.hp += got; drawAllies(); popup(allyEl(x), '+' + n0(got), 'heal'); }
          log(`${nm(a)}의 「${esc(sk.name)}」 → 아군 전체 <span class="hl">체력 ${n0(h)} 회복</span>`);
        } else if (k === 'shield') {
          for (const x of alive(A)) { x.shield = Math.round(a.def * sk.power * 1.3); x.shT = 2; }
          drawAllies(); for (const x of alive(A)) popup(allyEl(x), '🛡 ' + n0(x.shield), 'heal');
          log(`${nm(a)}의 「${esc(sk.name)}」 → 아군 전체 <span class="hl">보호막 ${n0(alive(A)[0]?.shield || 0)}</span> (2턴)`);
        } else if (k === 'scale') {
          // 보호막과 함께 공격력도 올려 줘요. 막아 줄 테니 대담하게 치라는 뜻이에요
          const sh = Math.round(a.def * sk.power * 1.3), up = 0.12 * sk.power;
          for (const x of alive(A)) { x.shield = sh; x.shT = 2; x.buf = Math.max(x.buf || 0, up); x.bufT = 2; }
          drawAllies(); for (const x of alive(A)) popup(allyEl(x), `🛡 ${n0(sh)}<small>공격↑</small>`, 'heal');
          log(`${nm(a)}의 「${esc(sk.name)}」 → 아군 전체 <span class="hl">보호막 ${n0(sh)} · 공격력 ${Math.round(up * 100)}% 증가</span> (2턴)`);
        } else if (k === 'mark') {
          // 대상 하나에 조준 표시: 받는 피해가 늘고, 아군 공격이 흐트러짐 게이지를 1 더 깎아요
          // 고른 대상이 없으면 오래 버틸 적(보스, 체력 많은 적)을 조준해요
          const e = target && target.hp > 0 ? target : alive(E).sort((x, y) => (y.boss - x.boss) || (x.broken - y.broken) || (y.hp - x.hp))[0];
          e.mark = 0.2 * sk.power; e.markT = 2;
          popup(foeEl(e), '◎ 조준', 'adv'); sfx('seal');
          const b = breakAmt(a, e, 1);
          wear(e, b, true); drawFoes();
          log(`${nm(a)}의 「${esc(sk.name)}」 → ${nm(e)} <span class="hl">조준</span> (2턴: 받는 피해 +${Math.round(e.mark * 100)}%, 아군 공격마다 흐트러짐 게이지 -1 추가 · 지금 -${b})${e.broken ? ' <span class="hl">흐트러짐!</span>' : ''}`);
        } else if (k === 'buff') {
          for (const x of alive(A)) { x.buf = 0.17 * sk.power; x.bufT = 2; }
          drawAllies(); for (const x of alive(A)) popup(allyEl(x), '공격↑', 'heal');
          log(`${nm(a)}의 「${esc(sk.name)}」 → 아군 전체 <span class="hl">공격력 ${Math.round(17 * sk.power)}% 증가</span> (2턴)`);
        } else if (k === 'debuff') {
          for (const e of alive(E)) { e.buf = -0.2 * sk.power; e.bufT = 2; popup(foeEl(e), '매료', 'adv'); wear(e, 1, true); }
          drawFoes();
          log(`${nm(a)}의 「${esc(sk.name)}」 → 적 전체 <span class="hl">매료</span> (2턴: 주는 피해↓ 받는 피해↑, 흐트러짐 게이지 -1)`);
        } else {
          const e = pickFoe(a, 2); const r = dealDmg(a, e, sk.power);
          log(`${nm(a)}의 「${esc(sk.name)}」 → ${nm(e)} ${showHit(e, r)}`);
          wear(e, breakAmt(a, e, 2));
        }
      } else {
        const e = pickFoe(a, 1);
        banner(`${nm(a)}<span class="vs">▶</span>${nm(e)}<span class="kd">기본 공격 · SP +1</span>`);
        await W(380);
        sfx('hit'); const r = dealDmg(a, e, 1);
        log(`${nm(a)}의 공격 → ${nm(e)} ${showHit(e, r)}`);
        wear(e, breakAmt(a, e, 1));
        gainSp(1);
      }
      drawAll();
      await W(800); hideBanner();
    }
    function callAdd(boss) {
      const proto = opt.enemies.find(x => x.name === AI[boss.ai].call && !x.boss) || { name: AI[boss.ai].call, elem: boss.elem, hp: Math.round(boss.mhp * 0.15), atk: Math.round(boss.atk * 0.8), def: 20, spd: 95, ai: 'swarm' };
      const e = makeFoe(proto, opt.scale);
      labelFoe(e);
      e.done = true; // 이번 라운드에는 움직이지 않아요
      // 보스 옆자리를 채워요
      const dead = E.findIndex(x => x.hp <= 0 && !x.boss);
      if (dead >= 0) E[dead] = e; else E.push(e);
      planIntent(e);
      called++;
      return e;
    }
    async function foeAct(e) {
      const al = alive(A); if (!al.length) return;
      await startAct(e);
      const kind = e.intent?.kind || 'atk', it = INTENT[kind];
      // 흐트러지면 다음 차례 하나를 쉬고, 그다음 차례가 올 때까지 계속 약해진 채로 있어요
      if (kind === 'stun') {
        e.skip = false;
        banner(`${nm(e)}<span class="kd">흐트러져서 이번 차례를 쉬어요</span>`);
        log(`${nm(e)}은(는) 흐트러져서 차례를 놓쳤어요. 다음 차례까지 계속 약해진 채예요`);
        await W(800); hideBanner(); return;
      }
      if (e.broken) {
        e.broken = false; e.tough = e.mtough; drawFoes();
        log(`${nm(e)}이(가) 정신을 차렸어요. 흐트러짐 게이지가 다시 차올라요`);
      }
      if (kind !== 'smash') e.turn++;
      if (kind === 'charge') {
        e.charged = true; sfx('flash');
        banner(`${nm(e)}<span class="sk">힘을 모아요</span><span class="kd">다음 차례에 강타! 흐트러뜨리면 취소돼요</span>`, true);
        log(`${nm(e)}이(가) 힘을 모아요. <span class="ko">다음 차례 강타</span>`);
      } else if (kind === 'call') {
        sfx('skill');
        banner(`${nm(e)}<span class="sk">무리 부르기</span><span class="kd">끝나 가는 냄새에 청소부가 몰려와요</span>`, true);
        await W(400);
        const add = callAdd(e); drawFoes(); flash(foeEl(add), 'hit-anim');
        log(`${nm(e)}이(가) ${nm(add)}을(를) 불렀어요`);
      } else if (it.all) {
        sfx('skill'); banner(`${nm(e)}<span class="sk">${it.name}!</span><span class="kd">아군 전체</span>`, true);
        await W(500);
        const parts = al.map(x => `${esc(x.label)} ${showHit(x, dealDmg(e, x, it.mult, it.pierce))}`);
        log(`${nm(e)}의 ${it.name} → 아군 전체<br>${parts.join(' · ')}`);
      } else {
        if (kind === 'smash') e.charged = false;
        const t = intentTarget(e) || pick(al);
        const big = kind !== 'atk';
        banner(`${nm(e)}<span class="vs">▶</span>${nm(t)}<span class="${big ? 'sk' : 'kd'}">${it.name}</span>`, big);
        await W(380);
        sfx('hit'); const r = dealDmg(e, t, it.mult, it.pierce);
        log(`${nm(e)}의 ${it.name} → ${nm(t)} ${showHit(t, r)}${t.guard ? ' <span class="ex">(방어)</span>' : ''}`);
      }
      await W(800); hideBanner();
    }
    // 자동 전투: 큰 피해가 오면 방어, SP가 되면 쓸모 있을 때 스킬, 아니면 공격
    function aiCmd(a) {
      const inc = incoming(a), hp = a.hp + a.shield;
      const bigHit = alive(E).some(e => !e.done && e.intent && (e.intent.kind === 'smash' || INTENT[e.intent.kind].all));
      const full = sp >= SP_MAX, k = a.sk.kind;
      let useSk = sp >= a.cost;
      if (useSk && k === 'heal') useSk = alive(A).some(x => x.hp / x.mhp < (full ? 0.85 : 0.65));
      else if (useSk && k === 'shield') useSk = alive(A).some(x => !x.shield && incoming(x) > x.hp * 0.25);
      else if (useSk && k === 'buff') useSk = !alive(A).some(x => x.bufT);
      else if (useSk && k === 'scale') useSk = alive(A).some(x => !x.shield && incoming(x) > x.hp * 0.25) || !alive(A).some(x => x.bufT);
      else if (useSk && k === 'mark') useSk = !alive(E).some(e => e.markT) && alive(E).some(e => !e.broken && (e.boss || e.hp > estDmg(a, e, 1) * 2));
      if (full && useSk) return 'sk'; // 포인트가 넘쳐 버려지지 않게
      if (inc >= hp && inc * GUARD_CUT < hp) return 'grd'; // 방어하면 버틸 수 있을 때
      if (!a.lastGrd && a.role === 'def' && bigHit && !taunter()) return 'grd';
      if (!a.lastGrd && inc >= hp * 0.45) return 'grd';
      return useSk ? 'sk' : 'atk';
    }
    function waitCmd(a) {
      return new Promise(res => {
        const c = $('#cmd', ov);
        const draw = () => {
          const t = pickFoe(a, 1);
          const ok = sp >= a.cost;
          c.innerHTML = `<div class="who">${nm(a)}의 차례 <span class="muted">· 대상: ${t ? esc(t.label) : '-'} (적을 눌러 바꿔요)</span></div>
          <div class="cmd-row"><button class="btn sub" data-c="atk">공격<small>SP +1 · ◆-${t ? breakAmt(a, t, 1) : 1}</small></button>
          <button class="btn sub grd" data-c="grd">방어<small>SP +1 · 피해 ½${a.role === 'def' ? ' · 도발' : ''}</small></button></div>
          <button class="btn skill" data-c="sk" ${ok ? '' : 'disabled'}>${esc(a.sk.name)} <span class="cost">SP ${a.cost}</span><small>${ok ? esc(SK_KIND[a.sk.kind] || roleName(a.role) + ' 스킬') : `SP가 ${a.cost - sp} 모자라요`}</small></button>`;
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
    }
    async function roundEnd() {
      for (const e of alive(E)) {
        const r = AI[e.ai].regen;
        if (!r || e.broken || e.hp >= e.mhp) continue;
        const h = Math.min(e.mhp - e.hp, Math.round(e.mhp * r));
        e.hp += h; drawFoes(); popup(foeEl(e), `<small>재생</small>+${n0(h)}`, 'heal');
        log(`${nm(e)}의 몸이 재처럼 다시 모여요 <span class="hl">+${n0(h)}</span> <span class="ex">(흐트러뜨리면 멈춰요)</span>`);
        await W(700);
      }
    }
    async function loop() {
      E.forEach(planIntent);
      drawAll();
      banner(E.some(e => e.boss) ? '<span class="sk">강적이 나타났어요!</span>' : '<span class="sk">전투 시작</span>', true);
      log(`적 ${E.length}체: ${E.map(e => esc(e.label)).join(', ')} <span class="ex">· 적 머리 위 예고를 보고 대응해요</span>`);
      await W(1100); hideBanner();
      while (!over) {
        round++;
        order = [...alive(A), ...alive(E)].sort((x, y) => y.spd - x.spd + rand(-3, 3));
        [...A, ...E].forEach(u => { u.done = false; });
        if (round > 1) alive(E).forEach(planIntent);
        drawAll();
        for (const u of order) {
          if (over) return;
          if (u.hp <= 0) continue;
          if (!alive(E).length || !alive(A).length) break;
          if (u.side === 'a') {
            u.guard = false;
            cur = u; acting = u; drawAll();
            let cmd;
            if (auto) cmd = aiCmd(u);
            else cmd = await waitCmd(u);
            if (over) return;
            await allyAct(u, cmd);
          } else await foeAct(u);
          u.done = true; acting = null;
          endTurnTick(u); drawAll();
          if (!alive(E).length || !alive(A).length) break;
        }
        if (!alive(E).length) return end(true);
        if (!alive(A).length) return end(false);
        await roundEnd();
      }
    }
    async function end(win) {
      if (over) return; over = true;
      sfx(win ? 'win' : 'lose'); acting = null; drawAll();
      banner(`<span class="sk">${win ? '승리!' : '패배…'}</span>`, true);
      log(win ? '<span class="hl">승리!</span>' : '패배…');
      await sleep(fast() ? 700 : 1300);
      ov.hidden = true; ov.innerHTML = '';
      resolve({ win, rounds: round, alive: alive(A).map(a => a.c.id) });
    }
    $('#foes', ov).onclick = e => { const f = e.target.closest('[data-f]'); if (!f) return; const t = E[+f.dataset.f]; if (t.hp > 0) { target = t; drawFoes(); $('#cmd', ov).redraw?.(); sfx('btn'); } };
    $('#btAuto', ov).onclick = e => { auto = !auto; S.settings.auto = auto; save(); e.target.textContent = auto ? '자동 ON' : '자동 OFF'; e.target.classList.toggle('on', auto); if (auto && waiting) waiting(aiCmd(cur)); };
    $('#btSpd', ov).onclick = e => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; S.settings.speed = speed; save(); e.target.textContent = 'x' + SPEED[speed]; $('.battle', ov).classList.toggle('fast', fast()); if (fast()) hideBanner(); };
    $('#btRun', ov).onclick = async () => { if (await confirmBox('<h3>후퇴할까요?</h3><p class="muted">이번 전투는 패배로 처리돼요.</p>', '후퇴')) { if (waiting) waiting('atk'); end(false); } };
    loop();
  });
}
