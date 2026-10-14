import { $, esc, toast, setMuted, audio } from './util.js';
import { loadGame, G } from './data.js';
import { load, S, save, sync, setOnSync, claim, checkOwner, setOnKicked } from './state.js';
import { go, redraw } from './screens.js';
import { migrate } from './move.js';

// 가로 16:9 화면(960×540)을 창 크기에 맞춰 늘리고 줄여요
function fitStage() {
  const k = Math.min(innerWidth / 960, innerHeight / 540);
  document.documentElement.style.setProperty('--k', k);
}
addEventListener('resize', fitStage); fitStage();

async function boot() {
  if (!await loadGame()) return showMissing();
  document.title = G.meta.title || 'Usual Saviors';
  if (G.meta.accent) document.documentElement.style.setProperty('--ac', G.meta.accent);
  load();
  claim(); setOnKicked(showKicked);
  if (await migrate()) return;
  audio.vol.bgm = S.settings.bgm ?? .5; audio.vol.sfx = S.settings.sfx ?? .6; setMuted(!!S.settings.muted);
  go('title');
  setOnSync(redraw);
  setInterval(() => save(), 30000);
  // 화면을 떠날 때는 저장, 돌아오면 다른 창에서 저장한 게 있는지 먼저 확인해요
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else if (!checkOwner()) sync(); });
  addEventListener('pagehide', () => save());
  addEventListener('pageshow', e => { if (e.persisted && !checkOwner()) sync(); });
}

// 다른 창에서 게임을 열면 이 창은 멈춰요. 진행 상황은 새 창 쪽에만 저장돼요.
function showKicked() {
  setMuted(true);
  if ($('#kicked')) return;
  const d = document.createElement('div'); d.id = 'kicked';
  d.innerHTML = `<div class="mbox"><h3>다른 창에서 게임을 열었어요</h3>
    <p class="muted">진행 상황이 엇갈리지 않도록 이 창은 멈췄어요.<br>새 창에서 계속 플레이해 주세요.</p>
    <div class="acts"><button class="btn sm" id="kickedGo">이 창에서 계속하기</button></div></div>`;
  $('#app').appendChild(d);
  $('#kickedGo').onclick = () => location.reload();
}

function showMissing() {
  $('#screen').innerHTML = `<div class="boot"><div class="logo">Usual Saviors</div>
    <p class="muted">게임 데이터(<code>data/game.json</code>)를 불러오지 못했어요.<br>잠시 뒤에 다시 열어 주세요.</p></div>`;
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
boot().catch(e => { console.error(e); $('#screen').innerHTML = `<div class="boot"><p>시작하지 못했어요</p><pre class="muted" style="white-space:pre-wrap">${esc(e.stack || e)}</pre></div>`; });
