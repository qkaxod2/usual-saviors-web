// 화면들
import { $, $$, esc, sfx, bgm, toast, modal, confirmBox, fmt, dur, sleep, setMuted, setVolume, audio, pick } from './util.js';
import { G, T, img, charById, charByName, standing, upper, small, libImg, bgCss, elems, roleName, rarName, fill, playerName, applyNameEgg } from './data.js';
import {
  S, save, give, rewardText, count, stats, power, capLv, lvCost, limitCost, wCost, canPay, pay, addAff, filesOpen,
  owned, squadChars, teamPower, allStages, stageOpen, threadOpen, deliverThreads, badges, MISSIONS, PASS, PASS_STEP,
  factions, factionMembers, factionOwned, codexSteps, codexClaimable,
  MAX_LIMIT, MAX_WLV, MAX_AFF, MAX_DUP, resetSave, exportSave, importSave, addChar,
} from './state.js';
import { playStory, playLines, parseScript } from './story.js';
import { runBattle } from './battle.js';
import { banners, pull, pullShow, COST1, COST10, rates, poolOf } from './gacha.js';

const scr = () => $('#screen');
let current = 'lobby', currentArg = null;
let lobbyCleanup = () => {};
function fitLobbyFigure(host, figure, image) {
  if (!image.naturalWidth || !host.clientHeight) return;
  const scale = Math.min(host.clientWidth / image.naturalWidth, host.clientHeight / image.naturalHeight);
  figure.style.width = image.naturalWidth * scale + 'px';
  figure.style.height = image.naturalHeight * scale + 'px';
}
function lobbyHits(c) {
  const defaults = { head: [25, 3, 50, 28], body: [24, 31, 52, 55], chest: [32, 31, 36, 20] };
  return ['body', 'head', ...(c.touch?.chest?.length ? ['chest'] : [])].map(part => {
    const [x,y,w,h] = c.touch?.hitboxes?.[part] || defaults[part];
    return `<div class="hit ${part}" data-act="touch" data-v="${part}" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%"></div>`;
  }).join('');
}
// keep: 같은 화면을 다시 그릴 때(refresh) 스크롤 위치를 그대로 둬요
export function go(name, arg, keep) {
  lobbyCleanup(); lobbyCleanup = () => {};
  const same = keep && name === current;
  const pos = same ? [...scr().querySelectorAll('.body, .grid, .chat')].map(el => el.scrollTop) : null;
  current = name; currentArg = arg;
  applyNameEgg(S);
  const f = SCREENS[name]; if (!f) return;
  scr().onclick = null; scr().innerHTML = ''; scr().dataset.s = name;
  f(arg);
  scr().scrollTop = 0;
  if (pos) scr().querySelectorAll('.body, .grid, .chat').forEach((el, i) => { if (pos[i]) el.scrollTop = pos[i]; });
}
const refresh = () => go(current, currentArg, true);
// 다른 창에서 저장한 진행 상황을 불러왔을 때 지금 화면을 다시 그려요
export function redraw() { if (current !== 'title') refresh(); }

const ICON_NAME = { gems: '신앙 토큰 아이콘', gold: '크레딧 아이콘', exp: '업무 일지 아이콘', wmat: '에테르 합금 아이콘', core: '존재 증명핵 아이콘' };
const ICON_EMO = { gems: '💎', gold: '🪙', exp: '📒', wmat: '⚙️', core: '💠' };
const ic = k => { const u = libImg('icon', ICON_NAME[k]); return u ? `<img class="ic" src="${u}" alt="">` : ICON_EMO[k]; };
const resBar = () => `<div class="res"><span>${ic('gems')} <b>${fmt(S.gems)}</b></span><span>${ic('gold')} <b>${fmt(S.gold)}</b></span></div>`;
const header = (title, back = 'lobby') => `<div class="top"><button class="back" data-go="${back}">‹</button><h1>${esc(title)}</h1>${resBar()}</div>`;
function bind(handlers) {
  scr().onclick = e => {
    const g = e.target.closest('[data-go]');
    if (g) { sfx('btn'); const [n, a] = g.dataset.go.split(':'); go(n, a); return; }
    const a = e.target.closest('[data-act]');
    if (a && handlers && handlers[a.dataset.act]) { if (a.dataset.act !== 'touch') sfx('btn'); handlers[a.dataset.act](a.dataset.v, a, e); }
  };
}
const ph = (c, cls = '') => `<div class="ph ${cls}" style="width:100%;height:100%">${esc(c?.name?.[0] || '?')}</div>`;
const thumb = c => small(c) ? `<img src="${small(c)}" alt="${esc(c.name)}" loading="lazy">` : ph(c);
const elTag = e => `<span class="el el-${esc(e)}" title="${esc(e)}">${esc(String(e || '')[0] || '')}</span>`;
const matLine = () => `<div class="res" style="flex-wrap:wrap;margin:4px 0"><span>${ic('exp')} ${T('expMat')} <b>${S.mat.exp}</b></span><span>${ic('wmat')} ${T('wMat')} <b>${S.mat.wmat}</b></span><span>${ic('core')} ${T('core')} <b>${S.mat.core}</b></span></div>`;

const SCREENS = {
  // ============ 타이틀 ============
  title() {
    bgm(G.prog?.scene?.title || '타이틀');
    const bgStyle = `background-image:url("${TITLE_KEYART}")`;
    scr().innerHTML = `<div class="tscreen">
      <div class="t-bg" style='${bgStyle}'></div>
      <div class="t-glitch" style='${bgStyle}'></div><div class="t-shade"></div>
      <div class="t-motes">${'<i></i>'.repeat(16)}</div>
      <div class="t-logo">
        <div class="t-mark"><img class="t-text" src="img/logo_text.webp" alt="${esc(G.meta.title || 'Usual Saviors')}"><img class="t-halo" src="img/logo_halo.webp" alt=""></div>
        <div class="t-ko"><span>${esc(G.meta.title || '')}</span></div>
      </div>
      <div class="t-tap"><span>TOUCH TO START</span>화면을 눌러 출근하기</div>
      <div class="t-ver">ver 0.1 · Web</div>
      <div class="t-copy">오늘도 세상이 무사하다면, 누군가 평소처럼 일했기 때문이다.</div>
    </div>`;
    scr().onclick = async () => {
      sfx('seal'); scr().onclick = null;
      $('.tscreen')?.classList.add('go'); await sleep(650);
      if (!S.seenOpening) await firstRun();
      go('lobby');
    };
  },

  // ============ 로비 ============
  lobby() {
    const own = owned();
    let c = charById(S.lobbyChar); if (!c || !S.owned[c.id]) c = own[0];
    const b = badges();
    const poseU = c && (img(c.pose?.id) || standing(c));
    bgm(G.prog?.scene?.lobby || '로비');
    scr().innerHTML = `<div class="lobby">
      <div class="lbg" style='background-image:url("${LOBBY_BG}")'></div>
      ${c && poseU ? `<div class="lch"><div class="lfigure"><img src="${poseU}" alt="${esc(c.name)}">${lobbyHits(c)}</div></div>` : ''}
      <div class="lsweep"></div><div class="ldust">${'<i></i>'.repeat(14)}</div>
      <div class="ltop">
        <div class="lid"><span class="lseal">印</span><div><small>B.E.A.S.T. 림브라운 · 합동접수처 제7분소</small><b>${esc(playerName(S))}${playerName(S) !== T('player') ? ` <em>${esc(T('player'))}</em>` : ''}</b></div></div>
        <div class="lclock" id="lclock"></div>
        ${resBar()}
      </div>
      <nav class="lside">
        ${[['mail', 'mail', '우편', b.mail], ['missions', 'task', '임무', b.mission], ['shop', 'shop', G.meta.shop?.name || '상점'], ['codex', 'flag', '도감', b.codex], ['records', 'book', '기록'], ['settings', 'gear', '설정']]
          .map(([g, i, n, d]) => `<button data-go="${g}" aria-label="${esc(n)}">${LICON[i]}<span>${esc(n)}</span>${d ? '<span class="dot"></span>' : ''}</button>`).join('')}
      </nav>
      <div id="bub"></div>
      <nav class="lmenu">
        <button class="lm-main" data-go="ops" style="--i:0"><small>OPERATION</small><b>${esc(T('ops'))}</b><span>${esc(nextOp())}</span><i class="lm-go">${LICON.arrow}</i></button>
        ${[['crew', 'crew', T('crew'), 'STAFF'], ['recruit', 'spark', T('gacha'), 'RECRUIT', '', 'hot'], ['talk', 'chat', '메신저', 'MESSENGER', b.talk], ['dispatch', 'compass', T('dispatch'), 'DISPATCH', b.disp]]
          .map(([g, i, n, en, d, cls], k) => `<button class="lm-row ${cls || ''}" data-go="${g}" style="--i:${k + 1}"><em>0${k + 2}</em>${LICON[i]}<b>${esc(n)}</b><small>${en}</small>${d ? '<span class="dot"></span>' : ''}${cls === 'hot' ? '<span class="lm-tag">모집 중</span>' : ''}</button>`).join('')}
      </nav></div>`;
    let bt = null;
    const clock = () => { const el = $('#lclock'); if (!el) return; const d = new Date(), W = '일월화수목금토';
      el.innerHTML = `<b>${String(d.getHours()).padStart(2, '0')}<i>:</i>${String(d.getMinutes()).padStart(2, '0')}</b><span>${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${W[d.getDay()]}) · 근무 중</span>`; };
    clock(); const ck = setInterval(clock, 10000); lobbyCleanup = () => clearInterval(ck);
    const host = $('.lobby .lch'), figure = $('.lobby .lfigure'), portrait = figure?.querySelector('img');
    let alpha = null;
    if (portrait) {
      const ready = () => {
        fitLobbyFigure(host, figure, portrait);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = portrait.naturalWidth; canvas.height = portrait.naturalHeight;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.drawImage(portrait, 0, 0);
          alpha = context.getImageData(0, 0, canvas.width, canvas.height);
        } catch {}
      };
      portrait.addEventListener('load', ready); if (portrait.complete) ready();
      const observer = new ResizeObserver(() => fitLobbyFigure(host, figure, portrait)); observer.observe(host);
      lobbyCleanup = () => { clearInterval(ck); observer.disconnect(); portrait.removeEventListener('load', ready); clearTimeout(bt); alpha = null; };
    }
    const say = (who, text) => {
      clearTimeout(bt);
      $('#bub').innerHTML = `<div class="bubble"><b>${esc(who)}</b>${esc(fill(text, S))}</div>`;
      bt = setTimeout(() => { const x = $('#bub'); if (x) x.innerHTML = ''; }, 5200);
    };
    bind({
      touch(part, target, event) {
        if (!c) return;
        if (alpha && portrait) {
          const r = portrait.getBoundingClientRect();
          const x = Math.floor((event.clientX-r.left)/r.width*alpha.width), y = Math.floor((event.clientY-r.top)/r.height*alpha.height);
          if (x < 0 || y < 0 || x >= alpha.width || y >= alpha.height || alpha.data[(y*alpha.width+x)*4+3] < 32) return;
        }
        sfx('touch');
        const o = S.owned[c.id];
        if (part === 'chest') {
          // 특수 터치: 누를 때마다 대사가 순서대로 나오고 1→2→3단계로 넘어가요 (30초 동안 안 누르면 처음부터). 연출은 놀라는 흔들림만.
          const now = Date.now(), st = (window.__chestT ||= {}), r = st[c.id] && now - st[c.id].t < 30000 ? st[c.id] : { n: 0, t: 0 };
          if (now - r.t < 1200) return;   // 연타 방지: 대사 읽을 틈을 줘요
          r.t = now; st[c.id] = r;
          // 단계마다 그 단계 대사를 전부 한 번씩 보여 준 뒤 다음 단계로 넘어가요
          const tiers = c.touch.chest; let k = r.n++, tier = 0;
          while (tier < tiers.length - 1 && k >= tiers[tier].length) { k -= tiers[tier].length; tier++; }
          const line = tier === tiers.length - 1 ? tiers[tier][k % tiers[tier].length] : tiers[tier][k];
          const im = $('.lobby .lfigure'); if (im) { im.classList.remove('flinch'); void im.offsetWidth; im.classList.add('flinch'); }
          say(c.name, line);
          if (S.touch.n < 10) { S.touch.n++; addAff(c.id, 5); count('touch'); }
          save(); return;
        }
        let pool = (part === 'head' ? c.touch?.head : c.touch?.body) || [];
        if (Math.random() < 0.45 || !pool.length) {
          pool = [...(c.lines || [])];
          for (const k of Object.keys(c.affLines || {})) if (o.aff >= +k) pool.push(...c.affLines[k]);
        }
        if (pool.length) say(c.name, pick(pool));
        if (S.touch.n < 10) { S.touch.n++; const ups = addAff(c.id, 5); count('touch'); save(); if (ups.length) toast(`${c.name} 호감도 ${ups.at(-1)}단계!`); }
      },
    });
    if (c && Math.random() < 0.6) setTimeout(() => { if (current === 'lobby' && $('#bub')) say(c.name, pick(c.lines || [c.intro || '…'])); }, 600);
    if (!own.length) setTimeout(() => $('#bub') && ($('#bub').innerHTML = `<div class="bubble"><b>안내</b>아직 함께하는 ${esc(T('crew'))}이 없어요. ${esc(T('gacha'))}에서 첫 계약을 맺어 보세요!</div>`), 300);
  },

  // ============ 영입 ============
  recruit(bid) {
    const bs = banners(); const b = bs.find(x => x.id === bid) || bs[0];
    if (!b) { scr().innerHTML = header(T('gacha')) + '<div class="body"><p class="muted">열려 있는 영입이 없어요.</p></div>'; bind(); return; }
    const R = rates(); const pity = S.pity[b.id] || 0;
    const pu = (b.pickup || []).map(charById).filter(Boolean);
    const face = pu[0] || poolOf(b).filter(c => c.rarity === 3)[0] || G.chars[0];
    bgm(G.prog?.scene?.gacha || '계약');
    scr().innerHTML = header(T('gacha')) + `<div class="body">
      <div class="bsel">${bs.map(x => `<button class="${x === b ? 'on' : ''}" data-go="recruit:${x.id}">${esc(x.name)}</button>`).join('')}</div>
      <div class="banner">${b.bg && img(b.bg) ? `<img class="wide" src="${img(b.bg)}" alt="">` : face && bannerArt(face) ? `<img src="${bannerArt(face)}" alt="">` : ''}
        <div class="bi"><span class="tag">${b.type === 'pickup' ? '픽업' : b.type === 'pool' ? '한정 풀' : '상시'}</span><h2>${esc(b.name)}</h2>
        <div class="muted">${esc(b.desc || '')}</div>${pu.length ? `<div style="margin-top:6px;font-size:13px">확률 상승: ${pu.map(c => `<b class="r${c.rarity}">${esc(c.name)}</b>`).join(', ')}</div>` : ''}</div></div>
      <div class="card"><div class="row"><span class="grow muted">SSR ${R.ssr}% · SR ${R.sr}% · ${R.pity}회 안에 SSR 확정</span><b>${pity}/${R.pity}</b></div>
        <div class="bar" style="margin-top:6px"><i style="width:${pity / R.pity * 100}%"></i></div>
        ${S.firstTen ? '<div class="muted" style="margin-top:6px;color:var(--gold)">첫 10회 계약은 SSR 1명 확정!</div>' : ''}</div>
      <div class="row" style="gap:10px"><button class="btn sub grow" data-act="p" data-v="1">1회 계약<br><small>${ic('gems')} ${COST1}</small></button>
        <button class="btn grow" data-act="p" data-v="10">10회 계약<br><small>${ic('gems')} ${COST10}</small></button></div>
      <div class="card"><b style="font-size:14px">등장 ${esc(T('crew'))}</b><div class="grid" style="margin-top:8px">${poolOf(b).sort((x, y) => y.rarity - x.rarity).map(c => `<button class="cc ${S.owned[c.id] ? '' : 'off'}" data-go="char:${c.id}">${thumb(c)}<span class="cr r${c.rarity}">${rarName(c.rarity)}</span><span class="cn">${esc(c.name)}</span></button>`).join('')}</div></div>
      <button class="btn sub" style="width:100%" data-act="hist">영입 기록</button></div>`;
    bind({
      async p(n) {
        n = +n; const cost = n === 10 ? COST10 : COST1;
        if (S.gems < cost) { toast(`${T('currency')}이 부족해요`); return; }
        S.gems -= cost; const res = pull(b, n); await pullShow(res); refresh();
      },
      hist() {
        modal(`<h3>영입 기록</h3>${S.history.length ? S.history.slice(0, 60).map(h => { const c = charById(h.id); return c ? `<div class="sw"><span class="r${c.rarity}">${rarName(c.rarity)} ${esc(c.name)}</span><span class="muted">${esc(h.b)}</span></div>` : ''; }).join('') : '<p class="muted">아직 없어요</p>'}`);
      },
    });
  },

  // ============ 사원 목록 ============
  crew() {
    const list = [...G.chars].sort((a, b) => (!!S.owned[b.id] - !!S.owned[a.id]) || b.rarity - a.rarity || (power(b) - power(a)));
    scr().innerHTML = header(T('crew')) + `<div class="body"><p class="muted">보유 ${owned().length} / ${G.chars.length}</p>
      <div class="grid">${list.map(c => { const o = S.owned[c.id]; return `<button class="cc ${o ? '' : 'off'}" data-go="char:${c.id}">${thumb(c)}
        <span class="cr r${c.rarity}">${rarName(c.rarity)}</span><span class="ce">${elTag(c.elem)}</span><span class="cn">${esc(c.name)}</span>${o ? `<span class="lv">Lv.${o.lv}</span>` : ''}</button>`; }).join('')}</div></div>`;
    bind();
  },

  // ============ 사원 상세 ============
  char(id, tab = 'info') {
    const c = charById(id); if (!c) return go('crew');
    const o = S.owned[c.id];
    const st = stats(c, o || { lv: 1, limit: 0, wlv: 0, aff: 0 });
    const tabs = [['info', '정보'], ['grow', T('enhance')], ['lines', '대사'], ['files', T('files')], ['gallery', '갤러리']];
    const t = CHTAB[c.id] || tab;
    const body = {
      info: () => `<div class="card"><div class="stats"><div>HP<b>${fmt(st.hp)}</b></div><div>공격<b>${fmt(st.atk)}</b></div><div>방어<b>${fmt(st.def)}</b></div><div>속도<b>${fmt(st.spd)}</b></div><div>전투력<b>${fmt(power(c, o))}</b></div><div>소속<b style="color:var(--tx)">${esc(c.faction || '-')}</b></div></div></div>
        <div class="card"><b>${esc(c.skill?.name || '')}</b> <span class="tag">${c.skill?.passive ? '상시 패시브' : `재사용 ${c.skill?.cd ?? '-'}턴`}</span><p class="muted" style="margin:6px 0 0">${esc(c.skill?.desc || '')}</p></div>
        <div class="card"><b>${esc(T('weapon'))} · ${esc(c.weapon?.name || '')}</b>${c.weapon && img(c.weapon.id) ? `<img src="${img(c.weapon.id)}" style="width:100%;border-radius:10px;margin-top:6px">` : ''}<p class="muted" style="margin:6px 0 0">${esc(c.weapon?.desc || '')}</p></div>
        <div class="card"><p style="margin:0;font-size:14px;line-height:1.7">${esc(c.profile || '')}</p></div>`,
      grow: () => {
        if (!o) return '<p class="muted">아직 계약하지 않은 사원이에요.</p>';
        const lc = lvCost(o), mc = limitCost(o), wc = wCost(o), cap = capLv(o);
        return matLine() + `<div class="card"><div class="row"><b class="grow">레벨 ${o.lv} / ${cap}</b><span class="muted">${esc(T('expMat'))} ${lc.exp} · ${ic('gold')}${fmt(lc.gold)}</span></div>
          <div class="row" style="margin-top:8px"><button class="btn grow sm" data-act="lv" ${o.lv >= cap ? 'disabled' : ''}>${esc(T('enhance'))} +1</button><button class="btn sub sm" data-act="lvmax" ${o.lv >= cap ? 'disabled' : ''}>가능한 만큼</button></div>
          ${o.lv >= cap && o.limit < MAX_LIMIT ? '<p class="muted" style="margin:6px 0 0">레벨 상한이에요. 직급승진으로 상한을 올려요.</p>' : ''}</div>
          <div class="card"><div class="row"><b class="grow">${esc(T('limit'))} ${'★'.repeat(o.limit)}${'☆'.repeat(MAX_LIMIT - o.limit)}</b><span class="muted">${esc(T('core'))} ${mc.core} · ${ic('gold')}${fmt(mc.gold)}</span></div>
          <p class="muted" style="margin:6px 0">상한 +10, 능력치 +8%. 첫 승진 때 승진 CG가 열려요.</p>
          <button class="btn sm" style="width:100%" data-act="limit" ${o.limit >= MAX_LIMIT || o.lv < cap ? 'disabled' : ''}>${o.limit >= MAX_LIMIT ? '최대 직급' : esc(T('limit'))}</button></div>
          <div class="card"><div class="row"><b class="grow">${esc(T('weapon'))} +${o.wlv}</b><span class="muted">${esc(T('wMat'))} ${wc.wmat} · ${ic('gold')}${fmt(wc.gold)}</span></div>
          <p class="muted" style="margin:6px 0">강화마다 공격 +4%.</p><button class="btn sm" style="width:100%" data-act="w" ${o.wlv >= MAX_WLV ? 'disabled' : ''}>${o.wlv >= MAX_WLV ? '최대 강화' : '강화'}</button></div>
          <div class="card"><div class="row"><b class="grow">호감도 ${o.aff} / ${MAX_AFF}</b><span class="muted">잠재 ${o.dup}/${MAX_DUP}</span></div><div class="bar" style="margin-top:6px"><i style="width:${o.aff >= MAX_AFF ? 100 : o.affExp}%;background:var(--warn)"></i></div>
          <p class="muted" style="margin:6px 0 0">로비 대화, 전투, 메신저, 파견으로 올라요.</p></div>`;
      },
      lines: () => {
        const aff = o?.aff || 0;
        const sec = (title, arr, open) => arr?.length ? `<div class="card ${open ? '' : 'lock'}"><b>${esc(title)}</b>${open ? arr.map(l => `<p class="lines" style="margin:6px 0;font-size:14px;line-height:1.6">「${esc(fill(l, S))}」</p>`).join('') : '<p class="muted">🔒 잠겨 있어요</p>'}</div>` : '';
        return sec('인사', [c.intro].filter(Boolean), true) + sec('일상', c.lines, !!o)
          + Object.keys(c.affLines || {}).map(k => sec(`호감도 ${k}`, c.affLines[k], aff >= +k)).join('')
          + sec('터치 · 머리', c.touch?.head, !!o) + sec('터치 · 몸', c.touch?.body, !!o) + sec('터치 · 특수', (c.touch?.chest || []).flat(), !!o && aff >= 1)
          + sec('레벨 업', c.lvLines, !!o) + sec('중복 영입', c.dupLines, !!o && o.dup > 0);
      },
      files: () => (c.files || []).map((f, i) => filesOpen(c, f) ? `<div class="card"><b>${esc(T('files'))} ${i + 1}</b><p style="font-size:14px;line-height:1.75;margin:6px 0 0">${esc(fill(f.text, S))}</p></div>`
        : `<div class="card lock"><b>${esc(T('files'))} ${i + 1}</b><p class="muted">🔒 ${f.dup > 1 ? `중복 영입 ${f.dup - 1}회 이상` : '계약 후'} 열려요</p></div>`).join('') || '<p class="muted">기록이 없어요</p>',
      gallery: () => {
        const items = [['일러스트', c.illust, !!o], ['로비', c.pose, !!o], ['상반신', c.upper, !!o], [`${T('limit')} CG`, c.lbcg, !!o && o.limit >= 1]];
        return `<div class="thumbs">${items.filter(x => x[1] && img(x[1].id)).map(([n, it, op]) => `<button data-act="${op ? 'view' : ''}" data-v="${it.id}" class="${op ? '' : 'lock'}">${op ? `<img src="${img(it.id)}">` : '<div class="ph" style="height:100%">🔒</div>'}<span>${esc(n)}</span></button>`).join('')}</div>`;
      },
    };
    scr().innerHTML = header(c.name, 'crew') + `<div class="body">
      <div class="ch-hero">${standing(c) ? `<img src="${standing(c)}" alt="">` : ph(c)}</div>
      <div class="row" style="margin-top:6px"><span class="r${c.rarity}" style="font-weight:900">${rarName(c.rarity)}</span>${elTag(c.elem)}<span class="tag">${esc(roleName(c.role))}</span><b class="grow" style="font-size:18px">${esc(c.name)}</b>${o ? `<span class="muted">Lv.${o.lv}</span>` : '<span class="tag">미보유</span>'}</div>
      ${o ? `<div class="row" style="margin-top:8px"><button class="btn sub sm grow" data-act="lobby">${S.lobbyChar === c.id ? '✓ 로비 사원' : '로비에 세우기'}</button><button class="btn sub sm grow" data-act="squad">${S.squad.includes(c.id) ? '✓ 편성 중' : '편성에 넣기'}</button></div>` : ''}
      <div class="tabs">${tabs.map(([k, n]) => `<button class="${k === t ? 'on' : ''}" data-act="tab" data-v="${k}">${esc(n)}</button>`).join('')}</div>
      ${body[t]()}</div>`;
    const lvUp = () => {
      const c2 = lvCost(o); if (o.lv >= capLv(o)) return false; if (!pay(c2)) return false;
      o.lv++; count('enhance'); return true;
    };
    bind({
      tab(v) { CHTAB[c.id] = v; refresh(); },
      lobby() { S.lobbyChar = c.id; save(); toast(`${c.name}이(가) 로비에 서요`); refresh(); },
      squad() {
        if (S.squad.includes(c.id)) S.squad = S.squad.filter(x => x !== c.id);
        else { if (S.squad.length >= 4) { toast('편성은 4명까지예요'); return; } S.squad.push(c.id); }
        save(); refresh();
      },
      lv() { if (lvUp()) { sfx('up'); save(); toast(pick(c.lvLines || ['좋아요!'])); refresh(); } else toast('재료가 부족해요'); },
      lvmax() { let n = 0; while (lvUp()) n++; save(); if (n) { sfx('up'); toast(`레벨 +${n}`); refresh(); } else toast('재료가 부족해요'); },
      async limit() {
        const mc = limitCost(o); if (!canPay(mc)) { toast('재료가 부족해요'); return; }
        if (!await confirmBox(`<h3>${esc(T('limit'))}</h3><p>${esc(rewardText(mc))}을(를) 써서 승진할까요?</p>`, '승진')) return;
        pay(mc); o.limit++; save(); sfx('ssr');
        if (o.limit === 1 && c.lbcg && img(c.lbcg.id)) await viewImg(img(c.lbcg.id));
        refresh();
      },
      w() { const wc = wCost(o); if (!pay(wc)) { toast('재료가 부족해요'); return; } o.wlv++; save(); sfx('up'); refresh(); },
      view(v) { if (v) viewImg(img(v)); },
    });
  },

  // ============ 출격 ============
  ops(tab = 'story') {
    const sq = squadChars();
    const tp = teamPower();
    const st = allStages();
    const farms = G.meta.farms?.length ? G.meta.farms : [{ key: 'exp', name: '경험 훈련' }, { key: 'gold', name: '자금 확보' }, { key: 'wmat', name: '재료 회수' }, { key: 'core', name: '핵 회수' }];
    scr().innerHTML = header(T('ops')) + `<div class="body">
      <div class="card"><div class="row"><b class="grow">편성 · 전투력 ${fmt(tp)}</b><button class="btn sub sm" data-act="edit">편성 변경</button></div>
        <div class="squad-pick">${[0, 1, 2, 3].map(i => sq[i] ? `<div class="cc">${thumb(sq[i])}<span class="ce">${elTag(sq[i].elem)}</span><span class="cn">${esc(sq[i].name)}</span></div>` : '<div class="empty" data-act="edit">+</div>').join('')}</div></div>
      <div class="tabs"><button class="${tab === 'story' ? 'on' : ''}" data-go="ops:story">메인 스토리</button><button class="${tab === 'farm' ? 'on' : ''}" data-go="ops:farm">${esc(T('farm'))}</button></div>
      ${tab === 'story' ? (G.chapters || []).map(ch => `<h3 style="margin:14px 0 4px;font-size:15px">${esc(ch.title)}</h3>${chMap(ch)}${ch.stages.map(s => {
        const op = stageOpen(s.id), dn = !!S.cleared[s.id];
        return `<button class="stage ${dn ? 'done' : ''} ${op ? '' : 'lockd'}" data-act="stage" data-v="${s.id}"><span class="no">${esc(s.title.split(/[.\s]/)[0])}</span><span class="grow">${esc(s.title.replace(/^[\d-]+\.\s*/, ''))}<br><span class="muted">${s.enemies.length ? s.enemies.map(e => `${e.name}${e.boss ? ' 👑' : ''}`).join(', ') : '스토리'}</span></span>${dn ? '' : `<span class="rw">${ic('gems')}${s.reward}</span>`}</button>`;
      }).join('')}`).join('') : farms.map(f => {
        const left = 3 - (S.farm.n[f.key] || 0), top = farmTop(f.key);
        return `<div class="farm ${left > 0 ? '' : 'lockd'}"><div class="fh"><span class="no">${ICON_EMO[f.key] ? ic(f.key) : '⚔️'}</span><b class="grow">${esc(f.name)}</b><span class="muted">오늘 ${left}/3</span></div>
          <div class="ftiers">${FARM_TIER.map((t, i) => { const open = i <= top, ok = tp >= t.rec;
            return `<button class="ft t${i} ${open ? '' : 'lockd'} ${i < top ? 'done' : ''}" data-act="farm" data-v="${f.key}:${i}"><b>${t.name}${i < top ? ' ✓' : ''}</b>
              <small class="${open && !ok ? 'warn' : ''}">${open ? `권장 ${fmt(t.rec)} · 제한 ${t.limit}차례` : `🔒 ${FARM_TIER[i - 1].name}을 먼저 깨요`}</small>
              <span>${esc(rewardText(farmReward(f.key, i)))}</span></button>`; }).join('')}</div></div>`;
      }).join('')}
    </div>`;
    bind({
      edit: () => squadEdit().then(refresh),
      async stage(id) {
        if (!stageOpen(id)) { toast('이전 작전을 먼저 끝내요'); return; }
        const { ch, s } = st.find(x => x.s.id === id);
        const first = !S.cleared[s.id];
        // 적이 없는 스테이지는 스토리만 읽고 끝나요
        if (!s.enemies.length) {
          const r = await modal(`<h3>${esc(s.title)}</h3><p class="muted">${esc(ch.title)}</p><p style="margin:10px 0 0">${first ? `첫 열람 보상: ${ic('gems')} ${s.reward} · ${ic('gold')} 3,000` : '이미 읽은 이야기예요.'}</p>`,
            [{ label: '취소', cls: 'sub', value: 0 }, { label: first ? '읽기' : '다시 보기', value: 1 }]);
          if (!r) return;
          await playStory(s.title, s.pre); if (s.post) await playStory(s.title, s.post);
          if (first) { const rw = { gems: s.reward, gold: 3000 }; S.cleared[s.id] = Date.now(); save(); give(rw, true); await modal(`<h3>${esc(s.title)}</h3><p>${esc(rewardText(rw))}</p>${newThreads()}`); }
          refresh(); return;
        }
        if (!await needSquad()) return;
        const r = await modal(`<h3>${esc(s.title)}</h3><p class="muted">${esc(ch.title)}</p>
          ${s.enemies.map(e => `<div class="sw"><span>${elTag(e.elem)} ${esc(e.name)}${e.boss ? ' 👑' : ''}</span><span class="muted">HP ${fmt(e.hp)} · 공격 ${e.atk}</span></div>`).join('')}
          ${squadScale() < 1 ? `<p class="muted" style="margin:8px 0 0">편성이 ${squadChars().length}명이라 적도 그만큼 약하게 나와요.</p>` : ''}
          <p style="margin:10px 0 0">${first ? `첫 클리어 보상: ${esc(rewardText(firstReward(s)))}` : `반복 보상: ${esc(rewardText(repeatReward(s)))}`}</p>`,
          [{ label: '취소', cls: 'sub', value: 0 }, ...(first ? [] : [{ label: '스토리 다시 보기', cls: 'sub', value: 2 }]), { label: '출격', value: 1 }]);
        if (!r) return;
        if (r === 2) { await playStory(s.title, s.pre); await playStory(s.title, s.post); refresh(); return; }
        if (first && s.pre) await playStory(s.title, s.pre);
        const bgName = (parseScript(s.pre).find(l => l.type === 'cmd' && l.cmd === '배경') || {}).arg;
        const res = await runBattle({ title: s.title, bg: bgName, enemies: s.enemies, squad: squadChars(), scale: squadScale() });
        if (!res.win) { await modal('<h3>작전 실패</h3><p class="muted">사원을 육성하거나 편성을 바꿔서 다시 도전해요.</p>'); refresh(); return; }
        count('battle'); afterBattle(res);
        if (first) {
          S.cleared[s.id] = Date.now(); save();
          if (s.post) await playStory(s.title, s.post);
          const rw = firstReward(s); give(rw, true);
          await modal(`<h3>작전 성공!</h3><p>${esc(rewardText(rw))}</p>${newThreads()}`);
        } else { const rw = repeatReward(s); give(rw, true); await modal(`<h3>작전 성공!</h3><p>${esc(rewardText(rw))}</p>${newThreads()}`); }
        refresh();
      },
      async farm(v) {
        const [key, ti] = v.split(':'), t = +ti || 0, T0 = FARM_TIER[t];
        if ((S.farm.n[key] || 0) >= 3) { toast('오늘은 더 할 수 없어요'); return; }
        if (t > farmTop(key)) { toast(`${FARM_TIER[t - 1].name}을 먼저 깨요`); return; }
        if (!await needSquad()) return;
        const f = farms.find(x => x.key === key);
        if (tp < T0.rec && !await confirmBox(`<h3>${esc(f.name)} · ${T0.name}</h3><p class="muted">권장 전투력 ${fmt(T0.rec)}, 지금 편성은 ${fmt(tp)}이에요.<br>그래도 출격할까요?</p>`, '출격')) return;
        const res = await runBattle({ title: `${f.name} · ${T0.name}`, bg: G.prog?.lobbyBg, enemies: farmEnemies(key, t), squad: squadChars(), limit: T0.limit });
        if (!res.win) { await modal(`<h3>실패</h3><p class="muted">${res.why ? `제한 차례 ${T0.limit} 안에 정리하지 못했어요.<br>` : ''}조금 더 육성하거나 아래 단계에서 재료를 모아 와요.</p>`); refresh(); return; }
        S.farm.n[key] = (S.farm.n[key] || 0) + 1; count('battle'); afterBattle(res);
        const unlock = t === farmTop(key) && t < FARM_TIER.length - 1;
        S.farmTier = { ...(S.farmTier || {}), [key]: Math.max(farmTop(key), t + 1) };
        const rw = farmReward(key, t); give(rw, true);
        await modal(`<h3>정리 완료!</h3><p>${esc(rewardText(rw))}</p>${unlock ? `<p class="muted">${FARM_TIER[t + 1].name}이 열렸어요!</p>` : ''}${newThreads()}`); refresh();
      },
    });
  },

  // ============ 사내메신저 ============
  talk() {
    const ts = (G.threads || []).filter(threadOpen);
    scr().innerHTML = header(T('talk')) + `<div class="body">${ts.length ? ts.map(t => {
      const c = charById(t.charId); const d = S.threads[t.id]?.done;
      return `<button class="thread" data-go="thread:${t.id}"><div class="av">${c && small(c) ? `<img src="${small(c)}">` : ''}</div><div class="grow"><b style="font-size:14px">${esc(c?.name || '?')}</b><div class="muted">${esc(t.title)}</div></div>${d ? '<span class="muted">읽음</span>' : '<span class="dot" style="position:static"></span>'}</button>`;
    }).join('') : '<p class="muted">아직 온 메시지가 없어요. 작전을 진행하면 사원들이 말을 걸어와요.</p>'}</div>`;
    bind();
  },
  thread(id) {
    const t = (G.threads || []).find(x => x.id === id); if (!t) return go('talk');
    const c = charById(t.charId);
    scr().innerHTML = `<div class="top"><button class="back" data-go="talk">‹</button><div class="av" style="width:34px;height:34px;flex-basis:34px">${c && small(c) ? `<img src="${small(c)}">` : ''}</div><h1>${esc(c?.name || '')}<div class="muted" style="font-size:11px;font-weight:400">${esc(t.title)}</div></h1></div>
      <div class="chat" id="chat"></div><div class="chat-ch" id="chch"></div>`;
    bind();
    playThread(t, c);
  },

  // ============ 현장파견 ============
  dispatch() {
    const fast = S.settings.fastDispatch;
    const busy = new Set(Object.values(S.disp).flatMap(d => d.chars));
    scr().innerHTML = header(T('dispatch')) + `<div class="body">${fast ? '<p class="muted" style="color:var(--gold)">빠른 파견(시험용) 켜짐: 시간이 분 단위로 줄어요</p>' : ''}${(G.dispatches || []).map(d => {
      const run = S.disp[d.id];
      const left = run ? run.end - Date.now() : 0;
      return `<div class="li" style="flex-direction:column;align-items:stretch"><div class="row"><div class="grow"><div class="t">${esc(d.name)}</div><div class="d">${esc(d.desc || '')}</div></div></div>
        <div class="row" style="margin-top:6px"><span class="muted grow">⏱ ${d.hours}${fast ? '분' : '시간'} · ${d.need}명 · <span class="rw">${esc(rewardText(d.reward || {}))}</span></span>
        ${run ? (left <= 0 ? `<button class="btn sm" data-act="claim" data-v="${d.id}">보상 받기</button>` : `<span class="tag" data-end="${run.end}">${esc(dur(left))}</span>`) : `<button class="btn sub sm" data-act="send" data-v="${d.id}">보내기</button>`}</div>
        ${run ? `<div class="row" style="margin-top:6px;gap:4px">${run.chars.map(id => { const c = charById(id); return c ? `<div class="av" style="width:30px;height:30px;flex-basis:30px">${small(c) ? `<img src="${small(c)}">` : ''}</div>` : ''; }).join('')}</div>` : ''}</div>`;
    }).join('')}</div>`;
    bind({
      async send(id) {
        const d = G.dispatches.find(x => x.id === id);
        const free = owned().filter(c => !busy.has(c.id));
        if (free.length < d.need) { toast(`쉬고 있는 ${T('crew')}이 ${d.need}명 필요해요`); return; }
        const sel = await pickChars(free, d.need, `${d.name} · ${d.need}명 선택`);
        if (!sel) return;
        const ms = d.hours * (S.settings.fastDispatch ? 60e3 : 3600e3);
        S.disp[id] = { chars: sel, start: Date.now(), end: Date.now() + ms }; count('dispatch'); save(); sfx('ok'); refresh();
      },
      claim(id) {
        const d = G.dispatches.find(x => x.id === id), run = S.disp[id];
        delete S.disp[id]; run.chars.forEach(cid => addAff(cid, 10));
        give(d.reward || {}); refresh();
      },
    });
    // 남은 시간 글자만 바꾸고, 다 끝난 파견이 생길 때만 화면을 다시 그려요 (매초 다시 그리면 스크롤이 튀어요)
    clearInterval(TICK); TICK = setInterval(() => {
      if (current !== 'dispatch') { clearInterval(TICK); return; }
      let done = false;
      scr().querySelectorAll('[data-end]').forEach(el => { const left = +el.dataset.end - Date.now(); if (left <= 0) done = true; else el.textContent = dur(left); });
      if (done) refresh();
    }, 1000);
  },

  // ============ 우편 ============
  mail() {
    scr().innerHTML = header('우편') + `<div class="body">${S.mail.length ? `<button class="btn" style="width:100%" data-act="all">모두 받기</button>` + S.mail.map((m, i) => `<div class="li"><div class="grow"><div class="t">${esc(m.title)}</div><div class="d">${esc(m.from || '')} · ${esc(fill(m.body || '', S))}</div>${m.reward ? `<div class="rw">${esc(rewardText(m.reward))}</div>` : ''}</div>${m.got ? '<span class="muted">받음</span>' : `<button class="btn sm" data-act="get" data-v="${i}">받기</button>`}</div>`).join('') : '<p class="muted">우편이 없어요</p>'}</div>`;
    const get = i => { const m = S.mail[i]; if (m.got) return; m.got = true; m.read = true; give(m.reward || {}, true); };
    bind({
      get(i) { get(+i); save(); toast('받았어요'); refresh(); },
      all() { S.mail.forEach((m, i) => get(i)); save(); toast('모두 받았어요'); refresh(); },
    });
  },

  // ============ 보급관(상점) ============
  shop() {
    const sh = G.meta.shop || { name: '상점' }, clerk = sh.charId && charById(sh.charId);
    const items = shopItems();
    scr().innerHTML = header(sh.name || '상점') + `<div class="body">
      <div class="card row">${clerk && small(clerk) ? `<div class="av" style="width:56px;height:56px;flex-basis:56px"><img src="${small(clerk)}"></div>` : '<div style="font-size:36px">🧑‍💼</div>'}<p class="grow" style="margin:0;font-size:14px" id="clerk">${esc(fill(pick(sh.hello || ['어서 오세요!']), S))}</p></div>
      ${matLine()}
      ${items.map(it => { const left = it.lim - (S.shop.buy[it.id] || 0); return `<div class="li"><div class="grow"><div class="t">${esc(it.name)}</div><div class="d">오늘 ${left}/${it.lim} · ${esc(rewardText(it.cost))}</div></div><button class="btn sm" data-act="buy" data-v="${it.id}" ${left <= 0 ? 'disabled' : ''}>구매</button></div>`; }).join('')}
      <div style="text-align:right;margin-top:18px"><button class="vault" data-act="vault">🗝 관리관 전용 비상금고</button></div></div>`;
    bind({
      vault() { give({ gems: 10000 }, true); sfx('ok'); toast(`${T('currency')} +10,000`); refresh(); },
      buy(id) {
        const it = items.find(x => x.id === id);
        if ((S.shop.buy[id] || 0) >= it.lim) return;
        if (!pay(it.cost)) { $('#clerk').textContent = fill(pick(sh.poor || ['조금 모자라요.']), S); return; }
        S.shop.buy[id] = (S.shop.buy[id] || 0) + 1; give(it.give, true); sfx('ok');
        toast(rewardText(it.give)); refresh(); const cl = $('#clerk'); if (cl) cl.textContent = fill(pick(sh.buy || ['고마워요!']), S);
      },
    });
  },

  // ============ 임무 / 근태패스 ============
  missions() {
    const lv = Math.floor(S.pass.xp / PASS_STEP);
    scr().innerHTML = header('임무') + `<div class="body"><h3 style="font-size:15px;margin:8px 0">일일 임무</h3>
      ${MISSIONS.map(m => { const n = S.daily.cnt[m.k] || 0, done = n >= m.n, got = S.daily.got[m.k]; return `<div class="li"><div class="grow"><div class="t">${esc(m.t)}</div><div class="d">${Math.min(n, m.n)}/${m.n} · ${ic('gems')}${m.gems} · 패스 +${PASS_STEP / 2}</div></div>${got ? '<span class="muted">완료</span>' : `<button class="btn sm" data-act="m" data-v="${m.k}" ${done ? '' : 'disabled'}>받기</button>`}</div>`; }).join('')}
      <h3 style="font-size:15px;margin:16px 0 6px">${esc(T('pass'))} <span class="muted">Lv.${lv} · ${S.pass.xp % PASS_STEP}/${PASS_STEP}</span></h3>
      <div class="bar"><i style="width:${S.pass.xp % PASS_STEP}%"></i></div>
      <div class="pass" style="margin-top:10px">${PASS.map(p => { const ok = lv >= p.lv, got = S.pass.got.includes(p.lv); return `<button class="${ok ? 'ok' : ''} ${got ? 'got' : ''}" data-act="p" data-v="${p.lv}">${p.lv}<br>${esc(rewardText(p.r).split(' · ')[0])}</button>`; }).join('')}</div>
      <p class="muted">매월 1일에 처음부터 다시 시작해요.</p></div>`;
    bind({
      m(k) { const m = MISSIONS.find(x => x.k === k); if (S.daily.got[k] || (S.daily.cnt[k] || 0) < m.n) return; S.daily.got[k] = 1; give({ gems: m.gems, passXp: PASS_STEP / 2 }); refresh(); },
      p(v) { v = +v; if (S.pass.got.includes(v) || Math.floor(S.pass.xp / PASS_STEP) < v) return; S.pass.got.push(v); give(PASS.find(x => x.lv === v).r); refresh(); },
    });
  },

  // ============ 기록실 ============
  records(tab = 'world') {
    const w = G.world || {};
    const cleared = allStages().filter(x => S.cleared[x.s.id]);
    scr().innerHTML = header('기록') + `<div class="body"><div class="tabs"><button class="${tab === 'world' ? 'on' : ''}" data-go="records:world">세계관</button><button class="${tab === 'story' ? 'on' : ''}" data-go="records:story">스토리 다시 보기</button></div>
      ${tab === 'world' ? `<div class="card"><b>${esc(w.name || '')}</b><p style="font-size:14px;line-height:1.75">${esc(w.summary || '')}</p></div>
        ${w.lore ? `<div class="card"><b>배경</b><p style="font-size:14px;line-height:1.75;white-space:pre-wrap">${esc(w.lore)}</p></div>` : ''}
        <button class="stage" data-go="codex"><span class="no">⚑</span><span class="grow">팩션 도감<br><span class="muted">세력 소개와 소속 사원 모으기</span></span></button>`
        : `${G.opening?.prologue ? '<button class="stage" data-act="pro"><span class="no">✦</span><span class="grow">프롤로그</span></button>' : ''}
        ${cleared.map(({ s }) => `<button class="stage" data-act="st" data-v="${s.id}"><span class="no">▶</span><span class="grow">${esc(s.title)}</span></button>`).join('') || '<p class="muted">작전을 끝내면 여기서 다시 볼 수 있어요.</p>'}`}</div>`;
    bind({
      async pro() { await playStory('프롤로그', G.opening?.prologue); refresh(); },
      async st(id) { const { s } = allStages().find(x => x.s.id === id); await playStory(s.title, s.pre); await playStory(s.title, s.post); refresh(); },
    });
  },

  // ============ 팩션 도감 ============
  codex(sel) {
    const fs = factions().map(f => ({ ...f, n: factionMembers(f.name).length, got: factionOwned(f.name) }))
      .sort((x, y) => (y.n > 0) - (x.n > 0));
    const i = Math.min(Math.max(0, +sel || 0), fs.length - 1), f = fs[i];
    const mem = f ? factionMembers(f.name).sort((x, y) => (!!S.owned[y.id] - !!S.owned[x.id]) || y.rarity - x.rarity) : [];
    const steps = f ? codexSteps(f.name) : [];
    scr().innerHTML = header('팩션 도감') + `<div class="body">
      <div class="cx-list">${fs.map((x, k) => `<button class="cx-f ${k === i ? 'on' : ''} ${x.n ? '' : 'none'}" data-go="codex:${k}"><b>${esc(x.name)}</b><small>${x.n ? `${x.got} / ${x.n}` : '소속 사원 없음'}</small>${codexClaimable(x.name).length ? '<span class="dot"></span>' : ''}${x.n ? `<i style="width:${x.got / x.n * 100}%"></i>` : ''}</button>`).join('')}</div>
      ${f ? `<div class="cx-main">
        <div class="card"><div class="row"><b class="grow" style="font-size:18px;font-family:var(--serif)">${esc(f.name)}</b>${f.n ? `<span class="muted">영입 ${f.got} / ${f.n}</span>` : ''}</div>
          ${f.desc ? `<p class="muted" style="margin:6px 0 0;line-height:1.6">${esc(f.desc)}</p>` : ''}</div>
        ${f.n ? `<div class="cx-steps">${steps.map(st => { const ok = f.got >= st.need, got = !!S.codex?.[st.key];
          return `<div class="cx-step ${ok ? 'ok' : ''} ${got ? 'got' : ''}"><b>${st.label} <small>(${st.need}명)</small></b><span>${esc(rewardText(st.reward))}</span>
            ${got ? '<em>받음</em>' : ok ? `<button class="btn sm" data-act="claim" data-v="${esc(st.key)}">받기</button>` : `<em>${f.got} / ${st.need}</em>`}</div>`; }).join('')}</div>
        <div class="grid cx-mem">${mem.map(c => { const o = S.owned[c.id];
          return `<button class="cc ${o ? '' : 'off cx-off'}" ${o ? `data-go="char:${c.id}"` : 'data-act="unown"'}>${thumb(c)}<span class="cr r${c.rarity}">${rarName(c.rarity)}</span><span class="ce">${elTag(c.elem)}</span><span class="cn">${o ? esc(c.name) : '미영입'}</span></button>`; }).join('')}</div>`
        : '<p class="muted">아직 이 세력 소속 사원은 없어요.</p>'}</div>` : ''}
    </div>`;
    bind({
      claim(key) {
        const st = steps.find(x => x.key === key); if (!st || S.codex?.[key] || f.got < st.need) return;
        S.codex = { ...(S.codex || {}), [key]: Date.now() }; give(st.reward, true); sfx('up');
        toast(`${f.name} · ${st.label}: ${rewardText(st.reward)}`); refresh();
      },
      unown() { toast('영입하면 여기에 모습이 드러나요'); },
    });
  },

  // ============ 설정 ============
  settings() {
    const st = S.settings;
    scr().innerHTML = header('설정') + `<div class="body">
      <div class="card"><b>${esc(T('player'))} 이름</b><div class="row" style="margin-top:8px"><input type="text" id="nm" value="${esc(S.name)}" placeholder="${esc(T('player'))}" maxlength="12"><button class="btn sm" data-act="name">저장</button></div></div>
      <div class="card">
        <div class="sw"><span>소리</span><button class="btn sub sm" data-act="mute">${st.muted ? '꺼짐' : '켜짐'}</button></div>
        <div class="sw"><span>배경음</span><span class="vol"><input type="range" min="0" max="100" step="5" id="volBgm" value="${Math.round((st.bgm ?? .5) * 100)}"><b id="volBgmN">${Math.round((st.bgm ?? .5) * 100)}</b></span></div>
        <div class="sw"><span>효과음</span><span class="vol"><input type="range" min="0" max="100" step="5" id="volSfx" value="${Math.round((st.sfx ?? .6) * 100)}"><b id="volSfxN">${Math.round((st.sfx ?? .6) * 100)}</b></span></div>
        <div class="sw"><span>글자 속도</span><button class="btn sub sm" data-act="text">${st.text >= 50 ? '빠름' : st.text >= 28 ? '보통' : '느림'}</button></div>
        <div class="sw"><span>스토리 자동 넘김</span><button class="btn sub sm" data-act="autoText">${st.autoText ? '켜짐' : '꺼짐'}</button></div>
        <div class="sw"><span>빠른 파견 (시험용)</span><button class="btn sub sm" data-act="fast">${st.fastDispatch ? '켜짐' : '꺼짐'}</button></div>
      </div>
      <div class="card"><b>세이브</b><p class="muted">진행 상황은 이 브라우저에 저장돼요. 다른 기기로 옮기려면 내보내기를 써요.</p>
        <div class="row"><button class="btn sub sm grow" data-act="exp">내보내기</button><button class="btn sub sm grow" data-act="imp">불러오기</button><button class="btn warn sm" data-act="reset">초기화</button></div>
        <input type="file" id="sf" accept=".json,.txt" hidden></div>
      <p class="muted" style="text-align:center">${esc(G.meta.title || '')} · Usual Saviors Web</p></div>`;
    // 볼륨: 끌면 바로 바뀌고, 손을 떼면 저장해요 (효과음은 손을 뗄 때 한 번 들려줘요)
    for (const [id, k] of [['volBgm', 'bgm'], ['volSfx', 'sfx']]) {
      const r = $('#' + id);
      r.oninput = () => { const v = +r.value / 100; st[k] = v; setVolume(k, v); $('#' + id + 'N').textContent = r.value; };
      r.onchange = () => { save(); if (k === 'sfx') sfx('ok'); };
    }
    bind({
      name() { S.name = $('#nm').value.trim(); save(); applyNameEgg(S); toast('저장했어요'); },
      mute() { st.muted = !st.muted; setMuted(st.muted); save(); refresh(); },
      text() { st.text = st.text >= 50 ? 14 : st.text >= 28 ? 52 : 28; save(); refresh(); },
      autoText() { st.autoText = !st.autoText; save(); refresh(); },
      fast() { st.fastDispatch = !st.fastDispatch; save(); refresh(); },
      exp() {
        const blob = new Blob([exportSave()], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `usual-saviors-save-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      },
      imp() { const f = $('#sf'); f.onchange = async () => { try { importSave(await f.files[0].text()); toast('불러왔어요'); go('lobby'); } catch (e) { toast('불러오지 못했어요'); } }; f.click(); },
      async reset() { if (await confirmBox('<h3>처음부터 시작할까요?</h3><p class="muted">모든 진행 상황이 지워져요.</p>', '초기화')) { resetSave(); location.reload(); } },
    });
  },
};
let TICK = null;
const bannerArt = c => img(c.illust?.id) || upper(c) || standing(c);
function chMap(ch) { const key = String(ch.title || '').split(':')[0].trim(); const m = (G.lib || []).find(l => l.kind === 'map' && key && l.name.startsWith(key) && img(l.id)); return m ? `<img src="${img(m.id)}" alt="" style="width:100%;height:150px;object-fit:cover;border-radius:12px;margin:4px 0 6px;border:1px solid var(--line)">` : ''; }
// 로비 배경은 새로 그릴 예정이라, 그 전까지는 자리 표시만 보여요. 이미지가 생기면 false로 바꿔요.
// 로비 배경: 새벽등대 사무소 (NovelAI V5 → Real-ESRGAN 애니 모델로 확대, 오른쪽 40%는 메뉴 자리)
const LOBBY_BG = 'img/lobby_bg.webp';
// 타이틀 키아트: 해 질 녘 거리의 클레이·리베르·에리얼 (NovelAI V5 1216×832 → Real-ESRGAN 애니 모델로 2432×1664, 위쪽 가운데는 로고 자리)
const TITLE_KEYART = 'img/title_keyart.webp';
const CHTAB = {};
function nextOp() {
  const n = allStages().find(x => !S.cleared[x.s.id] && stageOpen(x.s.id));
  return n ? n.s.title : '모든 작전 완료';
}
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const LICON = {
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>'),
  task: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8.5 10.5l2 2 4-4M8.5 16h7"/>'),
  shop: svg('<path d="M4 9h16l-1.2 10.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8z"/><path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2"/>'),
  book: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  crew: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>'),
  spark: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m12 8 1.2 2.8L16 12l-2.8 1.2L12 16l-1.2-2.8L8 12l2.8-1.2z"/>'),
  chat: svg('<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l.9-4.1A8 8 0 1 1 20 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>'),
  compass: svg('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  flag: svg('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
};

// ---------- 보조 ----------
function viewImg(u) {
  return new Promise(r => {
    const d = document.createElement('div'); d.className = 'viewer'; d.innerHTML = `<img src="${u}">`;
    d.onclick = () => { d.remove(); r(); }; $('#app').append(d);
  });
}
// 스토리 전투는 4명 편성 기준이에요. 인원이 적으면 적 체력·공격을 줄여요 (프롤로그는 클레이 혼자서도 깰 수 있게)
function squadScale() { return [0.45, 0.7, 0.85][squadChars().length - 1] || 1; }
// 크레딧은 연수(레벨)에 계속 들어가서, 작전마다 넉넉히 줘요
function firstReward(s) { return { gems: s.reward, gold: 5000 + s.reward * 20, exp: 3 }; }
function repeatReward(s) { return { gold: 2000 + s.reward * 20, exp: 2 }; }
// 상시정리: 던전마다 초급 · 중급 · 상급. 앞 단계를 한 번 깨면 다음 단계가 열려요 (하루 횟수는 던전마다 3번, 단계와 상관없이)
export const FARM_TIER = [
  { name: '초급', rec: 4000, hp: 800, atk: 110, def: 30, mult: 1, limit: 40 },
  { name: '중급', rec: 7500, hp: 3000, atk: 480, def: 90, mult: 2.2, limit: 32 },
  { name: '상급', rec: 13000, hp: 7000, atk: 900, def: 150, mult: 4, boss: true, limit: 60 },
];
const FARM_BASE = { exp: { exp: 6, gold: 3000 }, gold: { gold: 20000 }, wmat: { wmat: 5, gold: 3000 }, core: { core: 2, gold: 3000 } };
function farmReward(k, t = 0) {
  const base = FARM_BASE[k] || { gold: 8000 }, m = FARM_TIER[t].mult, out = {};
  for (const [x, v] of Object.entries(base)) out[x] = x === 'gold' ? Math.round(v * m / 100) * 100 : Math.round(v * m);
  return out;
}
const farmTop = k => S.farmTier?.[k] || 0; // 깬 가장 높은 단계 수 (0이면 아직 없음)
export function farmEnemies(k, t = 0) {
  const T0 = FARM_TIER[t];
  const names = (G.lib || []).filter(l => l.kind === 'enemy').map(l => l.name);
  const nm = i => names[i % Math.max(1, names.length)] || '훈련 표적';
  const E = elems();
  return [0, 1, 2].map(i => {
    const boss = !!T0.boss && i === 2, b = boss ? 1.8 : 1;
    return { name: nm(i), elem: E[(i + k.length) % E.length], hp: Math.round(T0.hp * b), atk: Math.round(T0.atk * (boss ? 1.15 : 1)), def: T0.def, spd: 95 + i * 5, boss };
  });
}
function afterBattle(res) {
  const ups = [];
  for (const id of S.squad) { const u = addAff(id, 8); if (u.length) ups.push(charById(id).name); }
  save(); if (ups.length) toast(`${ups.join(', ')} 호감도 상승!`);
}
// 승리 보상 창에 붙는 메신저 도착 알림. 한 번에 몇 통씩만 도착해요
function newThreads() {
  const ts = deliverThreads(3); save();
  if (!ts.length) return '';
  sfx('noti');
  const names = ts.map(t => esc(charById(t.charId)?.name || ''));
  const who = names.length > 2 ? `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}명` : names.join(', ');
  return `<p style="margin-top:10px;color:var(--ac)">💬 ${who}에게서 메시지가 왔어요</p>`;
}
async function needSquad() {
  if (squadChars().length) return true;
  const own = owned();
  if (!own.length) { await modal(`<h3>${esc(T('crew'))}이 없어요</h3><p class="muted">${esc(T('gacha'))}에서 먼저 계약해 주세요.</p>`); return false; }
  S.squad = own.sort((a, b) => power(b) - power(a)).slice(0, 4).map(c => c.id); save();
  toast('전투력 순으로 자동 편성했어요');
  return true;
}
function shopItems() {
  return [
    { id: 'exp5', name: `${T('expMat')} ×5`, cost: { gold: 4000 }, give: { exp: 5 }, lim: 6 },
    { id: 'wm3', name: `${T('wMat')} ×3`, cost: { gold: 6000 }, give: { wmat: 3 }, lim: 5 },
    { id: 'core1', name: `${T('core')} ×1`, cost: { gold: 15000 }, give: { core: 1 }, lim: 3 },
    { id: 'gold', name: `${T('gold')} ×20,000`, cost: { gems: 100 }, give: { gold: 20000 }, lim: 3 },
  ];
}
function pickChars(list, n, title) {
  return new Promise(res => {
    const sel = new Set();
    const m = $('#modal'); m.hidden = false;
    const draw = () => {
      m.innerHTML = `<div class="mbox"><h3>${esc(title)}</h3><div class="grid">${list.map(c => `<button class="cc ${sel.has(c.id) ? 'sel' : ''}" data-c="${c.id}">${thumb(c)}<span class="ce">${elTag(c.elem)}</span><span class="cn">${esc(c.name)}</span><span class="lv">Lv.${S.owned[c.id].lv}</span></button>`).join('')}</div>
        <div class="acts"><button class="btn sub sm" data-x="0">취소</button><button class="btn sm" data-x="1" ${sel.size === n ? '' : 'disabled'}>확인 (${sel.size}/${n})</button></div></div>`;
    };
    draw();
    m.onclick = e => {
      const c = e.target.closest('[data-c]');
      if (c) { const id = c.dataset.c; if (sel.has(id)) sel.delete(id); else if (sel.size < n) sel.add(id); sfx('btn'); draw(); return; }
      const x = e.target.closest('[data-x]'); if (!x || x.disabled) return;
      m.hidden = true; m.onclick = null; m.innerHTML = ''; res(x.dataset.x === '1' ? [...sel] : null);
    };
  });
}
function squadEdit() {
  return new Promise(res => {
    const own = owned().sort((a, b) => power(b) - power(a));
    if (!own.length) { toast(`${T('gacha')}에서 먼저 계약해요`); res(); return; }
    const sel = [...S.squad.filter(id => S.owned[id])];
    const m = $('#modal'); m.hidden = false;
    const draw = () => {
      m.innerHTML = `<div class="mbox"><h3>편성 (최대 4명)</h3><div class="squad-pick">${[0, 1, 2, 3].map(i => { const c = charById(sel[i]); return c ? `<button class="cc" data-r="${c.id}">${thumb(c)}<span class="cn">${esc(c.name)}</span></button>` : '<div class="empty">+</div>'; }).join('')}</div>
        <div class="grid">${own.map(c => `<button class="cc ${sel.includes(c.id) ? 'sel' : ''}" data-c="${c.id}">${thumb(c)}<span class="cr r${c.rarity}">${rarName(c.rarity)}</span><span class="ce">${elTag(c.elem)}</span><span class="cn">${esc(c.name)}<br><span class="muted" style="font-size:10px">${esc(roleName(c.role))} · ${fmt(power(c))}</span></span></button>`).join('')}</div>
        <div class="acts"><button class="btn sub sm" data-x="auto">자동</button><button class="btn sm" data-x="ok">완료</button></div></div>`;
    };
    draw();
    m.onclick = e => {
      const c = e.target.closest('[data-c],[data-r]');
      if (c) { const id = c.dataset.c || c.dataset.r; const i = sel.indexOf(id); if (i >= 0) sel.splice(i, 1); else if (sel.length < 4) sel.push(id); sfx('btn'); draw(); return; }
      const x = e.target.closest('[data-x]'); if (!x) return;
      if (x.dataset.x === 'auto') { sel.length = 0; sel.push(...own.slice(0, 4).map(c => c.id)); draw(); return; }
      S.squad = sel; save(); m.hidden = true; m.onclick = null; m.innerHTML = ''; res();
    };
  });
}

// 메신저 재생
async function playThread(t, c) {
  const chat = $('#chat'), ch = $('#chch');
  const lines = parseScript(t.script);
  const me = playerName(S);
  let pick = 0, alive = true;
  const add = (text, mine, who) => { if (!$('#chat')) { alive = false; return; } chat.insertAdjacentHTML('beforeend', `<div class="msg ${mine ? 'me' : ''}">${!mine && who && who !== c?.name ? `<span class="who">${esc(who)}</span>` : ''}${esc(fill(text, S))}</div>`); chat.scrollTop = 1e6; };
  const replay = S.threads[t.id]?.done;
  for (const L of lines) {
    if (!alive || !$('#chat')) return;
    if (L.cond && L.cond !== pick) continue;
    if (L.type === 'choice') {
      const v = await new Promise(r => {
        ch.innerHTML = L.opts.map((o, i) => `<button data-c="${i + 1}">${esc(fill(o, S))}</button>`).join('');
        ch.onclick = e => { const b = e.target.closest('[data-c]'); if (b) { sfx('ok'); r(+b.dataset.c); } };
      });
      ch.innerHTML = ''; pick = v; add(L.opts[v - 1], true); await sleep(300); continue;
    }
    if (L.type === 'say' || L.type === 'nar') {
      if (!replay) { const ty = document.createElement('div'); ty.className = 'typing'; ty.textContent = `${L.who || ''} 입력 중…`; chat.append(ty); chat.scrollTop = 1e6; await sleep(Math.min(1400, 350 + L.text.length * 22)); ty.remove(); }
      add(L.text, L.who === me || L.who === T('player'), L.who); sfx('btn');
      if (replay) await sleep(60);
    }
  }
  if (!$('#chat')) return;
  if (!S.threads[t.id]?.done) {
    S.threads[t.id] = { done: true, at: Date.now() }; count('talk');
    const ups = addAff(t.charId, 20); give({ gems: 30 }, true); save();
    toast(`💎 30${ups.length ? ` · ${c?.name} 호감도 상승!` : ''}`);
  }
  ch.innerHTML = '<button data-go="talk">목록으로</button>';
}

// 첫 실행: 오프닝 → 이름 → 프롤로그 → 첫 사원 지급
async function firstRun() {
  if (G.opening?.lines?.length) await playLines(G.opening.lines);
  const nm = await new Promise(r => {
    const m = $('#modal'); m.hidden = false;
    m.innerHTML = `<div class="mbox"><h3>${esc(T('player'))}님의 이름은?</h3><input type="text" id="nm0" maxlength="12" placeholder="${esc(T('player'))}"><div class="acts"><button class="btn sm" id="nmok">확인</button></div></div>`;
    $('#nmok').onclick = () => { const v = $('#nm0').value.trim(); m.hidden = true; m.innerHTML = ''; r(v); };
  });
  S.name = nm; save(); applyNameEgg(S);
  if (G.opening?.prologue) await playStory('프롤로그', G.opening.prologue);
  // 메인 스토리 첫 화가 스토리 전용이면, 가입 직후 그대로 이어서 보여 줘요 (클레이와의 첫 만남)
  const p0 = allStages()[0]?.s;
  if (p0 && !p0.enemies.length && !S.cleared[p0.id]) {
    await playStory(p0.title, p0.pre); if (p0.post) await playStory(p0.title, p0.post);
    S.cleared[p0.id] = Date.now(); give({ gems: p0.reward, gold: 3000 }, true); save();
  }
  const first = G.chars[0];
  if (first && !owned().length) {
    addChar(first.id); S.squad = [first.id]; S.lobbyChar = first.id;
    S.mail.unshift({ id: 'welcome-char', from: '인사팀', title: `${first.name} 배정 안내`, body: `${first.name}이(가) ${playerName(S)}님의 첫 ${T('crew')}으로 배정됐어요.`, reward: null, got: true, read: false, at: Date.now() });
  }
  S.seenOpening = true; save();
  if (first) await modal(`<h3>첫 ${esc(T('crew'))} 배정</h3>${standing(first) ? `<img src="${standing(first)}" style="width:100%;max-height:260px;object-fit:contain">` : ''}<p style="text-align:center"><b>${esc(first.name)}</b><br><span class="muted">${esc(fill(first.intro || '', S))}</span></p><p class="muted">우편함의 선물로 ${esc(T('gacha'))}도 해 보세요!</p>`);
}

export { SCREENS };
