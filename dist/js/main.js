import { $, esc, toast, setMuted, audio } from './util.js';
import { loadGame, importBackup, G } from './data.js';
import { load, S, save, sync, setOnSync } from './state.js';
import { go, setDataSrc, redraw } from './screens.js';

// 가로 16:9 화면(960×540)을 창 크기에 맞춰 늘리고 줄여요
function fitStage() {
  const k = Math.min(innerWidth / 960, innerHeight / 540);
  document.documentElement.style.setProperty('--k', k);
}
addEventListener('resize', fitStage); fitStage();

async function boot() {
  const src = await loadGame();
  if (!src) return showImport();
  setDataSrc(src);
  document.title = G.meta.title || 'Usual Saviors';
  if (G.meta.accent) document.documentElement.style.setProperty('--ac', G.meta.accent);
  load();
  audio.vol.bgm = S.settings.bgm ?? .5; audio.vol.sfx = S.settings.sfx ?? .6; setMuted(!!S.settings.muted);
  go('title');
  setOnSync(redraw);
  setInterval(() => save(), 30000);
  // 화면을 떠날 때는 저장, 돌아오면 다른 창에서 저장한 게 있는지 먼저 확인해요
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else sync(); });
  addEventListener('pagehide', () => save());
  addEventListener('pageshow', e => { if (e.persisted) sync(); });
}

function showImport() {
  $('#screen').innerHTML = `<div class="boot"><div class="logo">Usual Saviors</div>
    <p class="muted">게임 데이터가 없어요.<br>툴에서 저장한 <b>백업 파일(.json)</b>을 골라 주세요.<br>한 번 가져오면 이 브라우저에 저장돼요.</p>
    <label class="drop"><input type="file" id="bk" accept=".json" hidden><span class="btn">백업 파일 고르기</span><p class="muted" id="st" style="margin:12px 0 0"></p></label>
    <p class="muted" style="font-size:12px">배포할 때는 <code>tools/convert.py</code>로 만든 <code>data/</code> 폴더를 함께 올리면<br>이 화면 없이 바로 시작해요.</p></div>`;
  $('#bk').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const st = $('#st');
    try { await importBackup(f, m => st.textContent = m); st.textContent = '완료! 시작할게요'; setTimeout(() => location.reload(), 500); }
    catch (err) { console.error(err); st.textContent = '불러오지 못했어요: ' + esc(err.message); }
  };
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
boot().catch(e => { console.error(e); $('#screen').innerHTML = `<div class="boot"><p>시작하지 못했어요</p><pre class="muted" style="white-space:pre-wrap">${esc(e.stack || e)}</pre></div>`; });
