// 영입(가챠)
import { $, esc, sfx, bgm, sleep, toast, confirmBox, modal } from './util.js';
import { G, T, charById, standing, upper, img, rarName, roleName } from './data.js';
import { S, save, addChar, count, give } from './state.js';

export const COST1 = 160, COST10 = 1600;
export const rates = () => { const s = G.prog?.settings || {}; return { ssr: s.ssr ?? 4, sr: s.sr ?? 18, pity: s.pity ?? 70 }; };
export const banners = () => (G.banners || []).filter(b => b.active !== false);

export function poolOf(b) {
  let p = G.chars.filter(c => !c.limited || (b.pickup || []).includes(c.id));
  const m = b.pool?.mode;
  if (m === 'faction' && b.pool.factions?.length) p = p.filter(c => b.pool.factions.includes(c.faction));
  if (m === 'ids' && b.pool.ids?.length) p = p.filter(c => b.pool.ids.includes(c.id));
  return p.length ? p : G.chars;
}
function rollOne(b, forceSR, forceSSR) {
  const R = rates(), pool = poolOf(b), key = b.id;
  S.pity[key] = (S.pity[key] || 0) + 1;
  let r = Math.random() * 100, rar;
  if (forceSSR || S.pity[key] >= R.pity || r < R.ssr) rar = 3;
  else if (forceSR || r < R.ssr + R.sr) rar = 2; else rar = 1;
  let cand = pool.filter(c => c.rarity === rar);
  if (!cand.length) cand = pool.filter(c => c.rarity <= rar).length ? pool.filter(c => c.rarity <= rar) : pool;
  let pickC;
  if (rar === 3) {
    S.pity[key] = 0;
    const pu = (b.pickup || []).map(charById).filter(c => c && c.rarity === 3);
    if (pu.length) {
      const g = S.pity[key + '_g'];
      if (g || Math.random() * 100 < (b.rate ?? 50)) { pickC = pu[Math.floor(Math.random() * pu.length)]; S.pity[key + '_g'] = 0; }
      else { const others = cand.filter(c => !pu.includes(c)); pickC = (others.length ? others : cand)[Math.floor(Math.random() * (others.length || cand.length))]; S.pity[key + '_g'] = 1; }
    }
  } else {
    const pu = (b.pickup || []).map(charById).filter(c => c && c.rarity === rar);
    if (pu.length && Math.random() < 0.5) pickC = pu[Math.floor(Math.random() * pu.length)];
  }
  pickC = pickC || cand[Math.floor(Math.random() * cand.length)];
  return pickC;
}
export function pull(b, n) {
  const res = [];
  const firstTen = n === 10 && S.firstTen;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const needSR = n === 10 && last && !res.some(x => x.c.rarity >= 2);
    const needSSR = firstTen && last && !res.some(x => x.c.rarity >= 3);
    const c = rollOne(b, needSR, needSSR);
    const kind = addChar(c.id);
    res.push({ c, kind });
  }
  if (firstTen) S.firstTen = false;
  S.pulls += n; count('pull', n);
  S.history.unshift(...res.map(x => ({ id: x.c.id, b: b.name, at: Date.now() })));
  S.history = S.history.slice(0, 200);
  save();
  return res;
}

// 연출
export async function pullShow(res) {
  const ov = $('#ov'); ov.hidden = false;
  const top = Math.max(...res.map(r => r.c.rarity));
  bgm(G.prog?.scene?.gacha || '계약');
  ov.innerHTML = `<div class="pull" id="pl"><div class="seal" id="seal"></div><p class="muted" style="margin-top:24px">탭해서 계약 진행</p></div>`;
  sfx('seal');
  await new Promise(r => { $('#pl', ov).onclick = r; setTimeout(r, 2600); });
  const seal = $('#seal', ov); seal.classList.add(top === 3 ? 'ssr' : top === 2 ? 'sr' : 'r');
  sfx(top === 3 ? 'ssr' : 'flash'); await sleep(top === 3 ? 900 : 500);
  $('#pl', ov).insertAdjacentHTML('beforeend', '<div class="flash"></div>'); await sleep(300);
  let skip = false;
  for (const r of res) {
    if (skip) break;
    if (res.length > 1 && r.c.rarity < 2 && r.kind !== 'new') continue;
    const u = img(r.c.illust?.id) || upper(r.c) || standing(r.c);
    const stars = '★'.repeat(r.c.rarity) + '☆'.repeat(3 - r.c.rarity);
    const no = String(r.c.ord ?? 0).padStart(3, '0');
    ov.innerHTML = `<div class="reveal" id="rv">
      <div class="idcard rr${r.c.rarity}">
        <div class="idh"><span>${esc(G.meta.title || '')}</span><span>No.${no}</span></div>
        <div class="idp">${u ? `<img src="${u}" alt="">` : ''}${r.kind === 'new' ? '<span class="idnew">NEW</span>' : ''}</div>
        <div class="idn"><div class="ids">${stars}</div><b>${esc(r.c.name)}</b>
          <div class="idm"><span>${esc(r.c.faction || '')}</span><span>${esc(roleName(r.c.role) || '')}${r.c.elem ? ' · ' + esc(r.c.elem) : ''}</span></div>
          <div class="idbar"></div></div>
      </div>
      <p class="muted" style="position:relative;margin:12px 24px 10px;text-align:center">${esc(r.kind === 'new' ? r.c.intro || '' : r.kind === 'dup' ? '중복 영입 · 잠재 해금' : `최대 중복 · ${T('core')} +2`)}</p>
      ${res.length > 1 ? '<button class="btn sub sm" id="rvSkip" style="position:relative">건너뛰기</button>' : ''}</div>`;
    sfx(r.c.rarity === 3 ? 'ssr' : 'card');
    await new Promise(ok => { $('#rv', ov).onclick = e => { if (e.target.id === 'rvSkip') skip = true; ok(); }; });
  }
  ov.innerHTML = `<div class="reveal" style="justify-content:center"><div class="results">${res.map(r => `<div class="cc fr${r.c.rarity}"><img src="${upper(r.c) || standing(r.c) || ''}" alt="">
      ${r.kind === 'new' ? '<span class="new">NEW</span>' : ''}<span class="cr r${r.c.rarity}" style="${r.kind === 'new' ? 'top:18px' : ''}">${rarName(r.c.rarity)}</span><span class="cn">${esc(r.c.name)}</span></div>`).join('')}</div>
    <button class="btn" id="rvOk" style="position:relative;margin-top:10px">확인</button></div>`;
  await new Promise(ok => $('#rvOk', ov).onclick = ok);
  sfx('ok'); ov.hidden = true; ov.innerHTML = '';
}
