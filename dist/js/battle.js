// 턴제 전투
import { $, $$, esc, sfx, bgm, sleep, rand, pick, confirmBox } from './util.js';
import { G, libImg, upper, standing, elemMult, bgCss, roleName } from './data.js';
import { S, stats, save } from './state.js';

const FOE_ICON = ['👾', '🕷️', '⚙️', '🦇', '👁️', '🌀', '🐺', '💀'];
const foeIcon = n => { let h = 0; for (const ch of n) h = (h * 7 + ch.charCodeAt(0)) % 997; return FOE_ICON[h % FOE_ICON.length]; };

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
    const ov = $('#ov'); ov.hidden = false;
    let auto = !!S.settings.auto, speed = S.settings.speed || 1, over = false, waiting = null, target = null, round = 0;
    bgm(opt.music || (E.some(e => e.boss) ? (G.prog?.scene?.boss || '보스전') : (G.prog?.scene?.battle || '전투')));
    ov.innerHTML = `<div class="battle" style='${bgCss(opt.bg)}'>
      <div class="bt-top"><button class="back" id="btRun">후퇴</button><span class="ttl">${esc(opt.title || '')}</span>
        <button class="btn sub sm" id="btSpd">x${speed}</button><button class="btn sub sm ${auto ? 'on' : ''}" id="btAuto">${auto ? '자동 ON' : '자동 OFF'}</button></div>
      <div class="foes" id="foes"></div>
      <div class="blog" id="blog"></div>
      <div class="allies" id="allies"></div>
      <div class="cmd" id="cmd"></div></div>`;
    const W = ms => sleep(ms / speed);
    const log = t => { const l = $('#blog', ov); l.innerHTML = esc(t); };
    const alive = arr => arr.filter(u => u.hp > 0);

    function drawFoes() {
      $('#foes', ov).innerHTML = E.map((e, i) => {
        const u = libImg('enemy', e.name);
        return `<div class="foe ${e.boss ? 'boss' : ''} ${e.hp <= 0 ? 'dead' : ''} ${target === e ? 'tgt' : ''}" data-f="${i}">
          <div class="fi">${u ? `<img src="${u}" style="max-height:100%;max-width:100%">` : foeIcon(e.name)}</div>
          <div class="fn"><span class="el el-${esc(e.elem)}">${esc(e.elem)}</span> ${esc(e.name)}${e.boss ? ' 👑' : ''}</div>
          <div class="bar"><i style="width:${Math.max(0, e.hp / e.mhp * 100)}%;background:var(--warn)"></i></div></div>`;
      }).join('');
    }
    function drawAllies(act) {
      $('#allies', ov).innerHTML = A.map((a, i) => `<button class="ally ${a === act ? 'act' : ''} ${a.hp <= 0 ? 'dead' : ''}" data-a="${i}">
        ${upper(a.c) || standing(a.c) ? `<img src="${upper(a.c) || standing(a.c)}" alt="">` : `<div class="ph" style="height:100%">${esc(a.name)}</div>`}
        <span class="an">${esc(a.name)}</span><span class="buf">${a.buf ? '⚔️' : ''}${a.shield ? '🛡️' : ''}</span>
        <div class="hpw"><div class="bar"><i style="width:${Math.max(0, a.hp / a.mhp * 100)}%"></i></div>
        ${a.shield ? `<div class="bar sh" style="margin-top:2px"><i style="width:${Math.min(100, a.shield / a.mhp * 100)}%"></i></div>` : ''}
        <div class="bar" style="margin-top:2px;height:3px"><i style="width:${a.cd <= 0 ? 100 : (1 - a.cd / (a.sk.cd || 3)) * 100}%;background:var(--ac2)"></i></div></div></button>`).join('');
    }
    function popup(el, text, cls) { if (!el) return; const d = document.createElement('div'); d.className = 'dmg ' + (cls || ''); d.textContent = text; el.append(d); setTimeout(() => d.remove(), 900); }
    const foeEl = e => $(`[data-f="${E.indexOf(e)}"]`, ov), allyEl = a => $(`[data-a="${A.indexOf(a)}"]`, ov);

    function dealDmg(src, dst, mult) {
      const em = elemMult(src.elem, dst.elem);
      const crit = Math.random() < 0.1;
      let d = src.atk * (1 + (src.buf || 0)) * mult * em * (120 / (120 + dst.def)) * rand(.92, 1.08) * (crit ? 1.5 : 1);
      if (dst.side === 'a' && dst.role === 'def') d *= 0.85;
      if (dst.side === 'e' && dst.buf < 0) d *= 1 - dst.buf * 0.75; // 매료·약화: 받는 피해 증가
      d = Math.max(1, Math.round(d));
      let left = d;
      if (dst.shield) { const s = Math.min(dst.shield, left); dst.shield -= s; left -= s; }
      dst.hp = Math.max(0, dst.hp - left);
      const el = dst.side === 'e' ? foeEl(dst) : allyEl(dst);
      if (el) { el.classList.remove('hit-anim'); void el.offsetWidth; el.classList.add('hit-anim'); }
      return { d, el, cls: em > 1 ? 'adv' : '', crit };
    }
    function pickFoe() {
      const al = alive(E); if (target && target.hp > 0) return target;
      return al.sort((x, y) => (elemMult(cur?.elem, y.elem) - elemMult(cur?.elem, x.elem)) || x.hp - y.hp)[0];
    }
    let cur = null;
    async function allyAct(a, useSkill) {
      const sk = a.sk;
      if (useSkill) {
        sfx('skill'); log(`${a.name} · ${sk.name}`); a.cd = sk.cd || 3;
        const k = sk.kind;
        if (k === 'aoe') {
          for (const e of alive(E)) { const r = dealDmg(a, e, sk.power); drawFoes(); popup(foeEl(e), r.d, r.cls); }
        } else if (k === 'heal') {
          for (const x of alive(A)) { const h = Math.round(a.atk * sk.power * 0.85); x.hp = Math.min(x.mhp, x.hp + h); popup(allyEl(x), '+' + h, 'heal'); }
        } else if (k === 'shield') {
          for (const x of alive(A)) { x.shield = Math.round(a.def * sk.power * 1.3); x.shT = 2; }
          drawAllies(a); for (const x of alive(A)) popup(allyEl(x), '🛡️' + x.shield, 'heal');
        } else if (k === 'buff') {
          for (const x of alive(A)) { x.buf = 0.17 * sk.power; x.bufT = 2; }
          drawAllies(a); for (const x of alive(A)) popup(allyEl(x), '공격↑', 'heal');
        } else if (k === 'debuff') {
          for (const e of alive(E)) { e.buf = -0.2 * sk.power; e.bufT = 2; popup(foeEl(e), '매료', 'adv'); }
        } else {
          const e = pickFoe(); const r = dealDmg(a, e, sk.power); drawFoes(); popup(foeEl(e), (r.crit ? '치명 ' : '') + r.d, r.cls);
        }
      } else {
        sfx('hit'); const e = pickFoe(); log(`${a.name}의 공격`);
        const r = dealDmg(a, e, 1); drawFoes(); popup(foeEl(e), (r.crit ? '치명 ' : '') + r.d, r.cls);
        a.cd = Math.max(0, a.cd - 1);
      }
      if (useSkill) { /* 스킬을 쓴 턴은 쿨이 새로 시작 */ }
      drawAllies(a);
      await W(650);
    }
    async function foeAct(e) {
      e.turn++;
      const al = alive(A); if (!al.length) return;
      if (e.boss && e.turn % 3 === 0) {
        sfx('skill'); log(`${e.name}의 광역 공격!`);
        for (const x of al) { const r = dealDmg(e, x, 0.75); drawAllies(); popup(allyEl(x), r.d); }
      } else {
        const tanks = al.filter(x => x.role === 'def');
        const t = tanks.length && Math.random() < 0.55 ? pick(tanks) : pick(al);
        sfx('hit'); log(`${e.name}의 공격 → ${t.name}`);
        const r = dealDmg(e, t, e.boss ? 1.15 : 1); drawAllies(); popup(allyEl(t), r.d);
      }
      await W(650);
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
        c.innerHTML = `<button class="btn sub" data-c="atk">공격<small>기본 공격</small></button>
          <button class="btn" data-c="sk" ${a.cd > 0 ? 'disabled' : ''}>${esc(a.sk.name)}<small>${a.cd > 0 ? `${a.cd}턴 후` : esc(roleName(a.role)) + ' 스킬'}</small></button>`;
        waiting = v => { c.innerHTML = ''; waiting = null; res(v); };
        c.onclick = e => { const b = e.target.closest('[data-c]'); if (b && !b.disabled) waiting(b.dataset.c === 'sk'); };
      });
    }
    function endTurnTick(u) {
      if (u.bufT) { u.bufT--; if (!u.bufT) u.buf = 0; }
      if (u.shT) { u.shT--; if (!u.shT) u.shield = 0; }
    }
    async function loop() {
      drawFoes(); drawAllies(); log(E.some(e => e.boss) ? '강적이 나타났어요!' : '전투 시작');
      await W(700);
      while (!over) {
        round++;
        const order = [...alive(A), ...alive(E)].sort((x, y) => y.spd - x.spd + rand(-3, 3));
        for (const u of order) {
          if (over) return;
          if (u.hp <= 0) continue;
          if (!alive(E).length || !alive(A).length) break;
          if (u.side === 'a') {
            cur = u; drawAllies(u);
            let skill;
            if (auto) skill = aiSkill(u);
            else skill = await waitCmd(u);
            if (over) return;
            await allyAct(u, skill);
          } else await foeAct(u);
          endTurnTick(u);
          if (!alive(E).length || !alive(A).length) break;
        }
        if (!alive(E).length) return end(true);
        if (!alive(A).length) return end(false);
      }
    }
    async function end(win) {
      if (over) return; over = true;
      sfx(win ? 'win' : 'lose'); log(win ? '승리!' : '패배…');
      await sleep(900);
      ov.hidden = true; ov.innerHTML = '';
      resolve({ win, rounds: round, alive: alive(A).map(a => a.c.id) });
    }
    $('#foes', ov).onclick = e => { const f = e.target.closest('[data-f]'); if (!f) return; const t = E[+f.dataset.f]; if (t.hp > 0) { target = t; drawFoes(); sfx('btn'); } };
    $('#btAuto', ov).onclick = e => { auto = !auto; S.settings.auto = auto; save(); e.target.textContent = auto ? '자동 ON' : '자동 OFF'; if (auto && waiting) waiting(aiSkill(cur)); };
    $('#btSpd', ov).onclick = e => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; S.settings.speed = speed; save(); e.target.textContent = 'x' + speed; };
    $('#btRun', ov).onclick = async () => { if (await confirmBox('<h3>후퇴할까요?</h3><p class="muted">이번 전투는 패배로 처리돼요.</p>', '후퇴')) { if (waiting) waiting(false); end(false); } };
    loop();
  });
}
