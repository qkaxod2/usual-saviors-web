# data/audio/ 폴더에 있는 소리 파일 목록을 data/audio/files.json으로 적어요.
# 게임은 이 목록을 보고 파일이 있는 소리만 틀어요 (없는 파일을 부르느라 헛걸음하지 않게).
# 배포할 때 build_pages.py가 알아서 불러요. 로컬에서 확인할 때는: python3 scripts/audio_list.py [폴더=dist]
import json
import sys
from pathlib import Path

EXT = {'.mp3', '.ogg', '.m4a', '.wav'}


def write_list(root):
    d = Path(root) / 'data' / 'audio'
    d.mkdir(parents=True, exist_ok=True)
    files = sorted(p.name for p in d.iterdir() if p.is_file() and p.suffix.lower() in EXT)
    (d / 'files.json').write_text(json.dumps(files, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return files


if __name__ == '__main__':
    files = write_list(sys.argv[1] if len(sys.argv) > 1 else 'dist')
    print(f'소리 파일 {len(files)}개: {", ".join(files)}')
