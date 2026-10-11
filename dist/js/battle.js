// 턴제 전투
import { $, esc, sfx, bgm, sleep, rand, pick, confirmBox } from './util.js';
import { G, libImg, upper, standing, elemMult, bgCss, roleName } from './data.js';
import { S, stats, save } from './state.js';

const FOE_ICON = ['👾', '🕷️', '⚙️', '🦇', '👁️', '🌀', '🐺', '💀'];
const foeIcon = n => { let h = 0; for (const ch of n) h = (h * 7 + ch.charCodeAt(0)) % 997; return FOE_ICON[h % FOE_ICON.length]; };
const n0 = v => Math.max(0, Math.round(v)).toLocaleString();
const SK_KIND = { dmg: '단일 공격', aoe: '적 전체 공격', heal: '아군 전체 회복', shield: '아군 전체 보호막', buff: '아군 전체 공격력 증가', debuff: '적 전체 매료' };
const BOSS_AOE = 3; // 보스는 3번째 행동마다 광역 공격

function makeAlly(c) {
  const s = stats(c);
  return { side: 'a', c, name: c.name, elem: c.elem, role: c.role, ...s, mhp: s.hp, sk: c.skill || { kind: 'dmg', power: 1.5, cd: 3, name: '스킬' }, cd: Math.ceil((c.skill?.cd || 3) / 2), shield: 0, buf: 0, bufT: 0, shT: 0 };
}
function makeFoe(e, scale) {
  const k = scale || 1;
  return { side: 'e', name: e.name, elem: e.elem, boss: !!e.boss, hp: Math.round(e.hp * k), mhp: Math.round(e.hp * k), atk: Math.round(e.atk * Math.sqrt(k)), def: Math.round(e.def * Math.sqrt(k)), spd: e.spd || 100, turn: 0, buf: 0, bufT: 0, shield: 0 };
}

// opt: {title, bg, enemies, squad(chars), scale, music}
export function runBattle(opt) {
  return new Promise(resolve => {
    const A = opt.squad.map(makeAlly), E = opt.enemies.map(e => makeFoe(e, opt.scale));
    // 같은 이름의 적이 여럿이면 A, B, C를 붙여 로그에서 구분해요
    const cnt = {}; E.forEach(e => { cnt[e.name] = (cnt[e.name] || 0) + 1; });
    const seen = {}; E.forEach(e => { if (cnt[e.name] > 1) { seen[e.name] = (seen[e.name] || 0) + 1; e.label = e.name + ' ' + 'ABCDEF'[seen[e.name] - 1]; } else e.label = e.name; });
    A.forEach(a => { a.label = a.name; });
    const ov = $('#ov'); ov.hidden = false;
    let auto = !!S.settings.auto, speed = S.settings.speed || 1, over = false, waiting = null, target = null, round = 0, order = [], cur = null, acting = null;
    const logs = [];
    bgm(opt.music || (E.some(e => e.boss) ? (G.prog?.scene?.boss || '보스전') : (G.prog?.scene?.battle || '전투')));
    ov.innerHTML = `<div class="battle" style='${bgCss(opt.bg)}'>
      <div class="bt-top"><button class="back" id="btRun">후퇴</button><span class="ttl">${esc(opt.title || '')}</span><span class="bt-round" id="btRound"></span>
        <button class="btn sub sm" id="btSpd">x${speed}</button><button class="btn sub sm ${auto ? 'on' : ''}" id="btAuto">${auto ? '자동 ON' : '자동 OFF'}</button></div>
      <div class="bt-order" id="btOrder"></div>
      <div class="foes" id="foes"></div>
      <div class="bt-banner" id="btBanner"></div>
      <div class="allies" id="allies"></div>
      <div class="bt-side"><div class="blog" id="blog"></div><div class="cmd" id="cmd"></div></div></div>`;
    const W = ms => sleep(ms / speed);
    const alive = arr => arr.filter(u => u.hp > 0);
    const nm = (u, cls) => `<b class="${u.side === 'a' ? 'na' : 'ne'} ${cls || ''}">${esc(u.label)}</b>`;
    function log(html) {
      logs.push(html); if (logs.length > 3) logs.shift();
      $('#blog', ov).innerHTML = logs.map((l, i) => `<p class="${i === logs.length - 1 ? 'new' : ''}">${l}</p>`).join('');
    }
    function banner(html, big) {
      const b = $('#btBanner', ov); b.className = 'bt-banner' + (big ? ' big' : ''); b.innerHTML = html;
      void b.offsetWidth; b.classList.add('on');
    }
    const hideBanner = () => $('#btBanner', ov).classList.remove('on');

    // 행동 순서: 이번 라운드에 남은 차례를 왼쪽부터 보여 줘요
    function drawOrder() {
      $('#btRound', ov).textContent = round ? `라운드 ${round}` : '';
      const left = order.filter(u => u.hp > 0 && !u.done);
      $('#btOrder', ov).innerHTML = left.length ? `<span class="lb">행동 순서</span>` + left.map(u => {
        const face = u.side === 'a' ? (upper(u.c) || standing(u.c)) : libImg('enemy', u.name);
        return `<span class="oc ${u.side} ${u === acting ? 'now' : ''}">${face ? `<img src="${face}" alt="">` : `<i>${u.side === 'a' ? esc(u.name[0]) : foeIcon(u.name)}</i>`}<em>${esc(u.label)}</em></span>`;
      }).join('<span class="ar">›</span>') : '';
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
        const aoeIn = e.boss ? BOSS_AOE - (e.turn % BOSS_AOE) : 0;
        if (e.boss && e.hp > 0) tags.push(chip(aoeIn === 1 ? '다음 행동: 광역 공격!' : `광역 공격까지 ${aoeIn}회`, aoeIn === 1 ? 'warn' : ''));
        return `<div class="foe ${e.boss ? 'boss' : ''} ${e.hp <= 0 ? 'dead' : ''} ${target === e ? 'tgt' : ''} ${acting === e ? 'acting' : ''}" data-f="${i}">
          ${target === e && e.hp > 0 ? '<span class="tmark">대상</span>' : ''}
          <div class="fi">${u ? `<img src="${u}" alt="">` : foeIcon(e.name)}</div>
          <div class="fn"><span class="el el-${esc(e.elem)}">${esc(e.elem)}</span> ${esc(e.label)}${e.boss ? ' 👑' : ''}</div>
          <div class="bar"><i style="width:${Math.max(0, e.hp / e.mhp * 100)}%"></i></div>
          <div class="hpn">${e.hp > 0 ? `${n0(e.hp)} / ${n0(e.mhp)}` : '쓰러짐'}</div>
          <div class="sts">${tags.join('')}</div></div>`;
      }).join('');
    }
    function drawAllies() {
      $('#allies', ov).innerHTML = A.map((a, i) => {
        const tags = [];
        if (a.shield) tags.push(chip(`🛡 ${n0(a.shield)}`, 'good'));
        if (a.buf > 0 && a.bufT) tags.push(chip(`공격↑ ${a.bufT}`, 'good'));
        const img = upper(a.c) || standing(a.c);
        return `<button class="ally ${a === acting ? 'act' : ''} ${a.hp <= 0 ? 'dead' : ''}" data-a="${i}">
        ${img ? `<img src="${img}" alt="">` : `<div class="ph" style="height:100%">${esc(a.name)}</div>`}
        <span class="an"><span class="el el-${esc(a.elem)}">${esc(a.elem)}</span> ${esc(a.name)}</span><span class="sts">${tags.join('')}</span>
        <div class="hpw"><div class="hpn">${a.hp > 0 ? `${n0(a.hp)}<small> / ${n0(a.mhp)}</small>` : '전투 불능'}</div><div class="bar"><i style="width:${Math.max(0, a.hp / a.mhp * 100)}%"></i></div>
        ${a.shield ? `<div class="bar sh" style="margin-top:2px"><i style="width:${Math.min(100, a.shield / a.mhp * 100)}%"></i></div>` : ''}
        <div class="skb ${a.cd <= 0 ? 'ready' : ''}">${a.cd <= 0 ? '스킬 준비됨' : `스킬 ${a.cd}턴 뒤`}</div></div></button>`;
      }).join('');
    }
    const drawAll = () => { drawOrder(); drawFoes(); drawAllies(); };
    function popup(el, text, cls) { if (!el) return; const d = document.createElement('div'); d.className = 'dmg ' + (cls || ''); d.innerHTML = text; el.append(d); setTimeout(() => d.remove(), 1300); }
    const foeEl = e => $(`[data-f="${E.indexOf(e)}"]`, ov), allyEl = a => $(`[data-a="${A.indexOf(a)}"]`, ov);
    const unitEl = u => u.side === 'e' ? foeEl(u) : allyEl(u);
    const flash = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

    function dealDmg(src, dst, mult) {
      const em = elemMult(src.elem, dst.elem);
      const crit = Math.random() < 0.1;
      let d = src.atk * (1 + (src.buf || 0)) * mult * em * (120 / (120 + dst.def)) * rand(.92, 1.08) * (crit ? 1.5 : 1);
      if (dst.side === 'a' && dst.role === 'def') d *= 0.85;
      if (dst.side === 'e' && dst.buf < 0) d *= 1 - dst.buf * 0.75; // 매료·약화: 받는 피해 증가
      d = Math.max(1, Math.round(d));
      let left = d, blocked = 0;
      if (dst.shield) { blocked = Math.min(dst.shield, left); dst.shield -= blocked; left -= blocked; }
      dst.hp = Math.max(0, dst.hp - left);
      return { d, hp: left, blocked, em, crit, ko: dst.hp <= 0 };
    }
    // 피해 한 번을 화면에 보여 주고 로그 한 줄 문구를 돌려줘요
    function showHit(dst, r) {
      drawFoes(); drawAllies();
      const el = unitEl(dst); flash(el, 'hit-anim');
      const tag = (r.crit ? '<small>치명!</small>' : '') + (r.em > 1 ? '<small>약점!</small>' : r.em < 1 ? '<small>저항</small>' : '');
      popup(el, `${tag}${r.hp ? '-' + n0(r.hp) : ''}${r.blocked ? `<small class="blk">🛡 ${n0(r.blocked)} 막음</small>` : ''}`, (dst.side === 'a' ? 'toa ' : '') + (r.em > 1 || r.crit ? 'adv' : ''));
      const extra = [r.crit && '치명타', r.em > 1 && '약점', r.em < 1 && '저항', r.blocked && `보호막이 ${n0(r.blocked)} 막음`].filter(Boolean).join(', ');
      return `<span class="dn">${n0(r.hp)} 피해</span>${extra ? ` <span class="ex">(${extra})</span>` : ''}${r.ko ? ` <span class="ko">${esc(dst.label)} 쓰러짐</span>` : ''}`;
    }
    function pickFoe() {
      const al = alive(E); if (target && target.hp > 0) return target;
      return al.sort((x, y) => (elemMult(cur?.elem, y.elem) - elemMult(cur?.elem, x.elem)) || x.hp - y.hp)[0];
    }
    async function startAct(u) {
      acting = u; drawAll();
      flash(unitEl(u), u.side === 'a' ? 'lunge-up' : 'lunge-down');
      await W(260);
    }
    async function allyAct(a, useSkill) {
      const sk = a.sk;
      await startAct(a);
      if (useSkill) {
        sfx('skill'); a.cd = sk.cd || 3;
        banner(`${nm(a)}<span class="sk">「${esc(sk.name)}」</span><span class="kd">${esc(SK_KIND[sk.kind] || '스킬')}</span>`, true);
        const k = sk.kind;
        await W(500);
        if (k === 'aoe') {
          const parts = [];
          for (const e of alive(E)) { const r = dealDmg(a, e, sk.power); parts.push(`${esc(e.label)} ${showHit(e, r)}`); }
          log(`${nm(a)}의 「${esc(sk.name)}」 → 적 전체<br>${parts.join(' · ')}`);
        } else if (k === 'heal') {
          const h = Math.round(a.atk * sk.power * 0.85);
          for (const x of alive(A)) { const got = Math.min(x.mhp - x.hp, h); x.hp += got; drawAllies(); popup(allyEl(x), '+' + n0(got), 'heal'); }
          log(`${nm(a)}의 「${esc(sk.name)}」 → 아군 전체 <span class="hl">체력 ${n0(h)} 회복</span>`);
        } else if (k === 'shield') {
          for (const x of alive(A)) { x.shield = Math.round(a.def * sk.power * 1.3); x.shT = 2; }
          drawAllies(); for (const x of alive(A)) popup(allyEl(x), '🛡 ' + n0(x.shield), 'heal');
          log(`${nm(a)}의 「${esc(sk.name)}」 → 아군 전체 <span class="hl">보호막 ${n0(alive(A)[0]?.shield || 0)}</span> (2턴)`);
        } else if (k === 'buff') {
          for (const x of alive(A)) { x.buf = 0.17 * sk.power; x.bufT = 2; }
          drawAllies(); for (const x of alive(A)) popup(allyEl(x), '공격↑', 'heal');
          log(`${nm(a)}의 「${esc(sk.name)}」 → 아군 전체 <span class="hl">공격력 ${Math.round(17 * sk.power)}% 증가</span> (2턴)`);
        } else if (k === 'debuff') {
          for (const e of alive(E)) { e.buf = -0.2 * sk.power; e.bufT = 2; popup(foeEl(e), '매료', 'adv'); }
          drawFoes();
          log(`${nm(a)}의 「${esc(sk.name)}」 → 적 전체 <span class="hl">매료</span> (2턴: 주는 피해↓ 받는 피해↑)`);
        } else {
          const e = pickFoe(); const r = dealDmg(a, e, sk.power);
          log(`${nm(a)}의 「${esc(sk.name)}」 → ${nm(e)} ${showHit(e, r)}`);
        }
      } else {
        const e = pickFoe();
        banner(`${nm(a)}<span class="vs">▶</span>${nm(e)}<span class="kd">기본 공격</span>`);
        await W(380);
        sfx('hit'); const r = dealDmg(a, e, 1);
        log(`${nm(a)}의 공격 → ${nm(e)} ${showHit(e, r)}`);
        a.cd = Math.max(0, a.cd - 1);
      }
      drawAllies();
      await W(900); hideBanner();
    }
    async function foeAct(e) {
      e.turn++;
      const al = alive(A); if (!al.length) return;
      await startAct(e);
      if (e.boss && e.turn % BOSS_AOE === 0) {
        sfx('skill'); banner(`${nm(e)}<span class="sk">광역 공격!</span><span class="kd">아군 전체</span>`, true);
        await W(500);
        const parts = al.map(x => `${esc(x.label)} ${showHit(x, dealDmg(e, x, 0.75))}`);
        log(`${nm(e)}의 광역 공격 → 아군 전체<br>${parts.join(' · ')}`);
      } else {
        const tanks = al.filter(x => x.role === 'def');
        const t = tanks.length && Math.random() < 0.55 ? pick(tanks) : pick(al);
        banner(`${nm(e)}<span class="vs">▶</span>${nm(t)}<span class="kd">공격</span>`);
        await W(380);
        sfx('hit'); const r = dealDmg(e, t, e.boss ? 1.15 : 1);
        log(`${nm(e)}의 공격 → ${nm(t)} ${showHit(t, r)}`);
      }
      await W(900); hideBanner();
    }
    function aiSkill(a) {
      if (a.cd > 0) return false;
      if (a.sk.kind === 'heal') return alive(A).some(x => x.hp / x.mhp < 0.75);
      if (a.sk.kind === 'shield') return alive(A).some(x => !x.shield);
      return true;
    }
    function waitCmd(a) {
      return new Promise(res => {
        const c = $('#cmd', ov);
        const draw = () => {
          const t = pickFoe();
          c.innerHTML = `<div class="who">${nm(a)}의 차례 <span class="muted">· 대상: ${t ? esc(t.label) : '-'} (적을 눌러 바꿔요)</span></div>
          <button class="btn sub" data-c="atk">공격<small>${t ? esc(t.label) + '에게 기본 피해' : '기본 공격'}</small></button>
          <button class="btn" data-c="sk" ${a.cd > 0 ? 'disabled' : ''}>${esc(a.sk.name)}<small>${a.cd > 0 ? `${a.cd}턴 뒤에 쓸 수 있어요` : esc(SK_KIND[a.sk.kind] || roleName(a.role) + ' 스킬')}</small></button>`;
        };
        draw(); c.redraw = draw;
        waiting = v => { c.innerHTML = ''; c.redraw = null; waiting = null; drawFoes(); res(v); };
        c.onclick = e => { const b = e.target.closest('[data-c]'); if (b && !b.disabled) waiting(b.dataset.c === 'sk'); };
        drawFoes();
      });
    }
    function endTurnTick(u) {
      if (u.bufT) { u.bufT--; if (!u.bufT) u.buf = 0; }
      if (u.shT) { u.shT--; if (!u.shT) u.shield = 0; }
    }
    async function loop() {
      drawAll();
      banner(E.some(e => e.boss) ? '<span class="sk">강적이 나타났어요!</span>' : '<span class="sk">전투 시작</span>', true);
      log(`적 ${E.length}체: ${E.map(e => esc(e.label)).join(', ')}`);
      await W(1100); hideBanner();
      while (!over) {
        round++;
        order = [...alive(A), ...alive(E)].sort((x, y) => y.spd - x.spd + rand(-3, 3));
        order.forEach(u => { u.done = false; });
        drawOrder();
        for (const u of order) {
          if (over) return;
          if (u.hp <= 0) continue;
          if (!alive(E).length || !alive(A).length) break;
          if (u.side === 'a') {
            cur = u; acting = u; drawAll();
            let skill;
            if (auto) skill = aiSkill(u);
            else skill = await waitCmd(u);
            if (over) return;
            await allyAct(u, skill);
          } else await foeAct(u);
          u.done = true; acting = null;
          endTurnTick(u); drawAll();
          if (!alive(E).length || !alive(A).length) break;
        }
        if (!alive(E).length) return end(true);
        if (!alive(A).length) return end(false);
      }
    }
    async function end(win) {
      if (over) return; over = true;
      sfx(win ? 'win' : 'lose'); acting = null; drawAll();
      banner(`<span class="sk">${win ? '승리!' : '패배…'}</span>`, true);
      log(win ? '<span class="hl">승리!</span>' : '패배…');
      await sleep(1300);
      ov.hidden = true; ov.innerHTML = '';
      resolve({ win, rounds: round, alive: alive(A).map(a => a.c.id) });
    }
    $('#foes', ov).onclick = e => { const f = e.target.closest('[data-f]'); if (!f) return; const t = E[+f.dataset.f]; if (t.hp > 0) { target = t; drawFoes(); $('#cmd', ov).redraw?.(); sfx('btn'); } };
    $('#btAuto', ov).onclick = e => { auto = !auto; S.settings.auto = auto; save(); e.target.textContent = auto ? '자동 ON' : '자동 OFF'; e.target.classList.toggle('on', auto); if (auto && waiting) waiting(aiSkill(cur)); };
    $('#btSpd', ov).onclick = e => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; S.settings.speed = speed; save(); e.target.textContent = 'x' + speed; };
    $('#btRun', ov).onclick = async () => { if (await confirmBox('<h3>후퇴할까요?</h3><p class="muted">이번 전투는 패배로 처리돼요.</p>', '후퇴')) { if (waiting) waiting(false); end(false); } };
    loop();
  });
}
