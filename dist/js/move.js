// 주소 이사: 예전 주소(GPT Sites)에서 진행한 세이브를 새 주소(GitHub Pages)로 넘겨요.
// 세이브는 브라우저에 주소별로 따로 저장돼서, 예전 주소에서 세이브를 주소 끝(#move=…)에 실어 새 주소를 열어 줘요.
import { $, confirmBox, modal, toast } from './util.js';
import { S, exportSave, importSave } from './state.js';

export const HOME = 'https://qkaxod2.github.io/usual-saviors-web/';
const TAG = '#move=';
const isHome = () => location.href.startsWith(HOME);
const isLocal = () => !location.protocol.startsWith('http') || /^(localhost|127\.|\[::1\]$)/.test(location.hostname);

// 세이브 글자 → 주소에 넣을 수 있는 글자 (가능하면 gzip으로 줄여요)
async function pack(txt) {
  let bytes = new TextEncoder().encode(txt), kind = 'j';
  if (typeof CompressionStream === 'function') {
    try { bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()); kind = 'z'; } catch (e) { }
  }
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return kind + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function unpack(s) {
  const kind = s[0], b = atob(s.slice(1).replace(/-/g, '+').replace(/_/g, '/'));
  let bytes = Uint8Array.from(b, c => c.charCodeAt(0));
  if (kind === 'z') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  return new TextDecoder().decode(bytes);
}

const when = t => t ? new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '알 수 없음';

// 시작할 때 불러요. 새 주소로 떠나면 true (그 뒤 시작은 하지 않아요)
export async function migrate() {
  if (isLocal()) return false;
  if (isHome()) {
    if (!location.hash.startsWith(TAG)) return false;
    const data = location.hash.slice(TAG.length);
    history.replaceState(null, '', location.pathname + location.search);
    let txt;
    try { txt = await unpack(data); JSON.parse(txt); } catch (e) { toast('이전 주소의 세이브를 읽지 못했어요'); return false; }
    const old = JSON.parse(txt);
    if ((S.rev || 0) > 0 && !await confirmBox(`<h3>이전 주소의 진행 상황을 가져올까요?</h3>
      <p class="muted">이 주소에도 진행 상황이 있어요. 가져오면 이 주소의 진행 상황은 덮어써져요.<br>
      이전 주소: ${when(old.savedAt)} 저장 · 이 주소: ${when(S.savedAt)} 저장</p>`, '가져오기', '이 주소 유지')) return false;
    try { importSave(txt); toast('이전 주소의 진행 상황을 가져왔어요'); } catch (e) { toast('이전 주소의 세이브를 읽지 못했어요'); }
    return false;
  }
  // 예전 주소: 새 주소가 열려 있을 때만 이사를 안내해요
  try { const r = await fetch(HOME + 'data/game.json', { cache: 'no-store' }); if (!r.ok) return false; } catch (e) { return false; }
  const go = await modal(`<h3>게임 주소가 바뀌었어요</h3>
    <p class="muted">새 주소에서 계속 플레이해 주세요. 지금까지의 진행 상황도 함께 옮겨 드려요.</p>`,
    [{ label: '여기서 계속', cls: 'sub', value: false }, { label: '새 주소로 옮기기', value: true }]);
  if (!go) return false;
  location.href = HOME + ((S.rev || 0) > 0 ? TAG + await pack(exportSave()) : '');
  $('#screen').innerHTML = '<div class="boot"><p class="muted">새 주소로 옮기는 중이에요…</p></div>';
  return true;
}
