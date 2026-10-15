# 배포용 폴더 만들기: dist를 복사하고 PNG는 전부 webp로 바꿔서 넣어요.
# 원본 PNG는 레포(dist)에 그대로 남고, 배포본에는 들어가지 않아요.
# 사용: python3 scripts/build_pages.py [원본 폴더=dist] [출력 폴더=_site]
import re
import shutil
import sys
from pathlib import Path

from PIL import Image

from audio_list import write_list

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else 'dist')
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else '_site')
TEXT = {'.html', '.js', '.css', '.json', '.webmanifest'}
QUALITY = 90

shutil.rmtree(OUT, ignore_errors=True)
shutil.copytree(SRC, OUT)

# 소리 파일 목록을 실제 폴더 내용으로 새로 적어요 (파일만 넣으면 바로 나오게)
print('소리 파일:', ', '.join(write_list(OUT)) or '없음')

renamed = {}
before = after = 0
for png in sorted(OUT.rglob('*.png')):
    webp = png.with_suffix('.webp')
    before += png.stat().st_size
    if not webp.exists():  # 이미 다듬어 둔 webp가 있으면 그걸 써요
        with Image.open(png) as im:
            im.save(webp, 'WEBP', quality=QUALITY, method=6)
        after += webp.stat().st_size
        print(f'{png.relative_to(OUT)}: {png.stat().st_size // 1024}KB -> {webp.stat().st_size // 1024}KB')
    else:
        print(f'{png.relative_to(OUT)}: 같은 이름의 webp가 있어서 그대로 써요')
    renamed[png.stem] = webp.stem
    png.unlink()

# 게임 데이터·코드에 적힌 .png 경로를 .webp로 바꿔요
if renamed:
    pat = re.compile(r'(' + '|'.join(re.escape(s) for s in sorted(renamed, key=len, reverse=True)) + r')\.png\b')
    for f in OUT.rglob('*'):
        if f.suffix in TEXT and f.is_file():
            t = f.read_text(encoding='utf-8')
            n = pat.sub(r'\1.webp', t)
            if n != t:
                f.write_text(n, encoding='utf-8')
                print(f'경로 수정: {f.relative_to(OUT)}')

left = [str(p.relative_to(OUT)) for p in OUT.rglob('*') if p.is_file() and re.search(r'\.png\b', p.read_text(encoding='utf-8', errors='ignore')) and p.suffix in TEXT]
if left:
    sys.exit(f'아직 .png를 가리키는 파일이 있어요: {left}')
print(f'PNG {len(renamed)}개 정리: {before // 1024}KB 빠짐, 새 webp {after // 1024}KB')
