// 비주얼 노벨식 스토리 재생기
import { $, esc, sfx, bgm, sleep } from './util.js';
import { G, charByName, upper, standing, img, libImg, bgCss, fill, playerName } from './data.js';
import { S as SAVE } from './state.js';

const CMD = /^\[(배경|소품|효과음|효과|사진|음악|톡|CG|cg)\s*[:：]\s*(.+?)\]$/;
export function parseScript(t) {
  return String(t || '').split('\n').map(l => l.trim()).filter(Boolean).map(raw => {
    let l = raw, cond = 0, m, o;
    if ((m = l.match(/^(\d)\)\s*(.+)$/))) { cond = +m[1]; l = m[2]; }
    if (/^\[소품\s*끝\]$/.test(l)) o = { type: 'cmd', cmd: '소품끝' };
    else if (/^\[음악\s*끝\]$/.test(l)) o = { type: 'cmd', cmd: '음악끝' };
    else if (/^\[톡\s*끝\]$/.test(l)) o = { type: 'cmd', cmd: '톡끝' };
    else if (/^\[(CG|사진)\s*끝\]$/i.test(l)) o = { type: 'cmd', cmd: 'CG끝' };
    else if ((m = l.match(CMD))) o = { type: 'cmd', cmd: m[1].toUpperCase() === 'CG' ? 'CG' : m[1], arg: m[2].trim() };
    else if ((m = l.match(/^\[(.+?)\]/))) o = { type: 'place', text: m[1].trim() };
    else if ((m = l.match(/^선택\s*[:：]\s*(.+)$/))) o = { type: 'choice', opts: m[1].split('|').map(s => s.trim()).filter(Boolean) };
    else if ((m = l.match(/^([^:：\s][^:：]{0,20})[:：]\s*(.+)$/))) {
      let who = m[1].trim(), face = ''; const fm = who.match(/^(.+?)\s*\[(.+?)\]$/); if (fm) { who = fm[1].trim(); face = fm[2].trim(); }
      const cm = m[2].trim().match(CMD);
      o = cm ? { type: 'cmd', cmd: cm[1], arg: cm[2].trim(), who } : { type: 'say', who, face, text: m[2] };
    } else o = { type: 'nar', text: l };
    o.cond = cond; return o;
  });
}

// CG/사진 이름 → 그림 (라이브러리 cg·사진 → 캐릭터 일러스트/승진CG 이름 → 캐릭터 이름)
function findCG(name) {
  const u = libImg('cg', name) || libImg('photo', name) || libImg(null, name); if (u) return u;
  for (const c of G.chars) {
    for (const k of ['lbcg', 'illust', 'pose', 'upper']) if (c[k] && c[k].name === name && img(c[k].id)) return img(c[k].id);
  }
  const c = charByName(name); if (c) return img(c.illust?.id) || img(c.lbcg?.id) || standing(c);
  return null;
}
function charImg(c, face) {
  const f = face && (c.faces || []).find(x => x.name === face); if (f && img(f.id)) return img(f.id);
  return upper(c) || standing(c);
}

export function playStory(title, script) {
  const lines = parseScript(script);
  if (!lines.length) return Promise.resolve();
  return new Promise(done => {
    const ov = $('#ov');
    ov.innerHTML = `<div class="vn" id="vn">
      <div class="vn-bg" id="vnBg"></div><div class="vn-char dim" id="vnChar"></div>
      <div class="vn-cg" id="vnCG" hidden></div><div class="vn-prop" id="vnProp" hidden></div><div class="vn-flash" id="vnFlash"></div>
      <div class="vn-phone" id="vnPhone" hidden><div class="pt" id="vnPhName"></div><div class="pb" id="vnPhBody"></div></div>
      <div class="vn-top"><span class="ttl">${esc(title)}</span><button id="vnAuto">자동</button><button id="vnLog">로그</button><button id="vnSkip">건너뛰기</button></div>
      <div class="vn-place" id="vnPlace" hidden></div>
      <div class="vn-box" id="vnBox"><div class="vn-name" id="vnName"></div><div class="vn-text" id="vnText"></div><div class="vn-choices" id="vnCh"></div><span class="vn-next" id="vnNext" hidden>▼</span></div>
    </div>`;
    ov.hidden = false;
    const st = { i: 0, pick: 0, typing: false, full: '', timer: null, auto: !!SAVE.settings.autoText, autoT: null, choice: false, phone: false, log: [], ended: false };
    const el = id => $('#' + id, ov);
    const setBg = n => { const b = el('vnBg'); b.setAttribute('style', bgCss(n)); b.classList.remove('dark'); };
    const first = lines.find(l => l.type === 'cmd' && l.cmd === '배경'); setBg(first ? first.arg : (SAVE && G.prog?.lobbyBg) || '');

    const finish = () => {
      if (st.ended) return; st.ended = true;
      clearTimeout(st.autoT); clearInterval(st.timer);
      ov.hidden = true; ov.innerHTML = ''; done();
    };
    const showChar = (c, face) => {
      const box = el('vnChar');
      if (!c) { box.style.opacity = box.dataset.id ? '.35' : '0'; return; }
      const u = charImg(c, face); const isUp = !!(c.upper && img(c.upper.id) && !face);
      box.style.opacity = '1'; box.className = 'vn-char' + (isUp ? '' : ' up');
      if (box.dataset.id !== c.id + face) { box.dataset.id = c.id + face; box.innerHTML = u ? `<img src="${u}" alt="">` : ''; }
    };
    const type = (text, cls) => {
      const t = el('vnText'); t.className = 'vn-text ' + (cls || ''); st.full = text; st.typing = true; el('vnNext').hidden = true;
      let n = 0; const speed = Math.max(8, 60 - (SAVE.settings.text || 28));
      clearInterval(st.timer);
      st.timer = setInterval(() => { n += 1; t.textContent = text.slice(0, n); if (n >= text.length) endType(); }, speed);
    };
    const endType = () => {
      clearInterval(st.timer); st.typing = false; el('vnText').textContent = st.full; el('vnNext').hidden = false;
      if (st.auto) { clearTimeout(st.autoT); st.autoT = setTimeout(step, 900 + st.full.length * 35); }
    };
    const phoneMsg = (who, text, me) => {
      const b = el('vnPhBody'); b.insertAdjacentHTML('beforeend', `<div class="msg ${me ? 'me' : ''}">${who && !me ? `<span class="who">${esc(who)}</span>` : ''}${esc(text)}</div>`); b.scrollTop = 1e6;
    };
    const step = async () => {
      if (st.ended) return;
      if (st.typing) { endType(); return; }
      if (st.choice) return;
      clearTimeout(st.autoT);
      while (st.i < lines.length) {
        const L = lines[st.i++];
        if (L.cond && L.cond !== st.pick) continue;
        if (L.type === 'cmd') {
          const a = L.arg || '';
          switch (L.cmd) {
            case '배경': setBg(a); break;
            case '음악': bgm(a); break;
            case '음악끝': bgm(''); break;
            case '효과음': sfx(a); break;
            case '효과':
              if (/흔들/.test(a)) { const v = el('vn'); v.classList.remove('shake'); void v.offsetWidth; v.classList.add('shake'); }
              else if (/플래시|섬광/.test(a)) { const f = el('vnFlash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
              else if (/암전/.test(a)) el('vnBg').classList.add('dark');
              else if (/크게|큰\s*글씨|외침/.test(a)) st.big = true;
              break;
            case '소품': case '사진': {
              const u = libImg('prop', a) || libImg(null, a) || (L.cmd === '사진' ? findCG(a) : null);
              const p = el('vnProp'); p.innerHTML = (u ? `<img src="${u}" alt="">` : '') + esc(a); p.hidden = false; break;
            }
            case '소품끝': el('vnProp').hidden = true; break;
            case 'CG': { const u = findCG(a); const c = el('vnCG'); if (u) { c.innerHTML = `<img src="${u}" alt="">`; c.hidden = false; } break; }
            case 'CG끝': el('vnCG').hidden = true; break;
            case '톡': st.phone = true; el('vnPhName').textContent = '💬 ' + a; el('vnPhBody').innerHTML = ''; el('vnPhone').hidden = false; sfx('noti'); break;
            case '톡끝': st.phone = false; el('vnPhone').hidden = true; break;
          }
          continue;
        }
        if (L.type === 'place') { const p = el('vnPlace'); p.textContent = L.text; p.hidden = false; continue; }
        if (L.type === 'choice') {
          st.choice = true; el('vnNext').hidden = true;
          const ch = el('vnCh');
          ch.innerHTML = L.opts.map((o, i) => `<button data-c="${i + 1}">${esc(fill(o, SAVE))}</button>`).join('');
          ch.onclick = e => {
            const b = e.target.closest('[data-c]'); if (!b) return; e.stopPropagation();
            st.pick = +b.dataset.c; st.choice = false; ch.innerHTML = ''; sfx('ok');
            const text = L.opts[st.pick - 1]; st.log.push({ who: playerName(SAVE), text });
            if (st.phone) phoneMsg('', fill(text, SAVE), true);
            step();
          };
          return;
        }
        const text = fill(L.text, SAVE);
        const big = st.big ? ' big' : ''; st.big = false;
        if (L.type === 'nar') {
          showChar(null); el('vnName').textContent = ''; st.log.push({ who: '', text }); type(text, 'nar' + big); return;
        }
        // say
        const c = charByName(L.who);
        st.log.push({ who: L.who, text });
        if (st.phone) {
          phoneMsg(L.who, text, L.who === playerName(SAVE) || L.who === G.meta.terms?.player);
          el('vnName').textContent = L.who; type(text, big); return;
        }
        showChar(c, L.face); el('vnName').textContent = fill(L.who, SAVE); type(text, big); return;
      }
      await sleep(150); finish();
    };
    el('vn').addEventListener('click', e => { if (e.target.closest('.vn-top') || e.target.closest('.vn-choices') || e.target.closest('.vlog')) return; step(); });
    el('vnAuto').onclick = e => { e.stopPropagation(); st.auto = !st.auto; e.target.classList.toggle('on', st.auto); if (st.auto && !st.typing && !st.choice) step(); };
    el('vnAuto').classList.toggle('on', st.auto);
    el('vnSkip').onclick = e => { e.stopPropagation(); skipToChoice(); };
    el('vnLog').onclick = e => {
      e.stopPropagation();
      const d = document.createElement('div'); d.className = 'vlog';
      d.innerHTML = st.log.map(x => `<p>${x.who ? `<b>${esc(x.who)}</b><br>` : ''}${esc(x.text)}</p>`).join('') + '<p class="muted">탭하면 닫혀요</p>';
      d.onclick = ev => { ev.stopPropagation(); d.remove(); };
      el('vn').append(d); d.scrollTop = 1e6;
    };
    // 건너뛰기: 다음 선택지까지(없으면 끝까지) 명령만 처리하며 넘김
    const skipToChoice = () => {
      clearInterval(st.timer); st.typing = false;
      while (st.i < lines.length) {
        const L = lines[st.i];
        if (L.cond && L.cond !== st.pick) { st.i++; continue; }
        if (L.type === 'choice') { step(); return; }
        if (L.type === 'cmd' && ['배경', '음악', '음악끝', '톡끝', '소품끝', 'CG끝'].includes(L.cmd)) {
          if (L.cmd === '배경') setBg(L.arg); if (L.cmd === '음악') bgm(L.arg); if (L.cmd === '톡끝') { st.phone = false; el('vnPhone').hidden = true; }
          if (L.cmd === '소품끝') el('vnProp').hidden = true; if (L.cmd === 'CG끝') el('vnCG').hidden = true;
        }
        if (L.type === 'say' || L.type === 'nar') st.log.push({ who: L.who || '', text: fill(L.text, SAVE) });
        st.i++;
      }
      finish();
    };
    step();
  });
}

// 짧은 대사 연출 (오프닝 문구)
export function playLines(lines) {
  return new Promise(done => {
    const ov = $('#ov'); ov.hidden = false;
    ov.innerHTML = `<div class="opening" id="op"><p id="opl"></p></div>`;
    let i = 0, t = null, t2 = null, ended = false;
    const p = $('#opl', ov);
    const next = () => {
      if (ended) return;
      clearTimeout(t); clearTimeout(t2);
      if (i >= lines.length) { ended = true; ov.hidden = true; ov.innerHTML = ''; done(); return; }
      p.classList.remove('on');
      t2 = setTimeout(() => { if (ended) return; p.textContent = lines[i++]; p.classList.add('on'); t = setTimeout(next, 3200); }, 350);
    };
    $('#op', ov).onclick = next; next();
  });
}
