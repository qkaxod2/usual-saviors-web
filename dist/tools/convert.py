#!/usr/bin/env python3
"""툴(gacha-game-maker) 백업 JSON → 웹게임 정적 데이터로 변환.

사용법:
    python3 tools/convert.py <백업.json> [출력폴더=data]

결과:
    data/game.json      게임 데이터(이미지 경로 포함)
    data/img/<id>.webp  이미지 (Pillow가 있으면 WebP로 압축, 없으면 원본 형식)
    data/audio/<id>.*   음악·효과음 (백업에 있을 때만)
"""
import base64, json, os, re, sys, io

try:
    from PIL import Image
except Exception:  # Pillow 없으면 원본 그대로 저장
    Image = None

EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
       "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/ogg": "ogg", "audio/wav": "wav",
       "audio/x-wav": "wav", "audio/webm": "webm", "audio/mp4": "m4a", "audio/aac": "aac"}


def split_data_url(u):
    m = re.match(r"data:([^;,]+)?(;base64)?,(.*)", u, re.S)
    if not m:
        return None, None
    mime = m.group(1) or "application/octet-stream"
    raw = base64.b64decode(m.group(3)) if m.group(2) else m.group(3).encode()
    return mime, raw


def safe(name):
    return re.sub(r"[^\w-]", "_", name)


def save_image(raw, mime, path_noext, max_side=1600, quality=86):
    if Image is not None:
        try:
            im = Image.open(io.BytesIO(raw))
            im.load()
            if max(im.size) > max_side:
                r = max_side / max(im.size)
                im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
            out = path_noext + ".webp"
            im.save(out, "WEBP", quality=quality, method=4)
            return out
        except Exception as e:  # 깨진 이미지는 원본 저장
            print("  (WebP 변환 실패, 원본 저장)", e)
    out = path_noext + "." + EXT.get(mime, "bin")
    with open(out, "wb") as f:
        f.write(raw)
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    src = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else "data"
    os.makedirs(os.path.join(out_dir, "img"), exist_ok=True)
    os.makedirs(os.path.join(out_dir, "audio"), exist_ok=True)
    with open(src, encoding="utf-8") as f:
        d = json.load(f)
    if "game" not in d:
        sys.exit("백업 파일이 아니에요 (game 항목이 없어요)")
    assets = {"img": {}, "audio": {}, "voice": {}}
    imgs = d.get("images") or {}
    for i, (k, v) in enumerate(imgs.items(), 1):
        mime, raw = split_data_url(v)
        if raw is None:
            continue
        p = save_image(raw, mime, os.path.join(out_dir, "img", safe(k)))
        assets["img"][k] = os.path.relpath(p, out_dir).replace(os.sep, "/")
        print(f"이미지 {i}/{len(imgs)}  {k}")
    for kind, key in (("audio", "audios"), ("voice", "voices")):
        for k, v in (d.get(key) or {}).items():
            mime, raw = split_data_url(v)
            if raw is None:
                continue
            p = os.path.join(out_dir, "audio", safe(k) + "." + EXT.get(mime, "bin"))
            with open(p, "wb") as f:
                f.write(raw)
            assets[kind][k] = os.path.relpath(p, out_dir).replace(os.sep, "/")
    game = d["game"]
    out = {"format": "usual-saviors-web/1", "from": {"app": d.get("app"), "build": d.get("build"), "at": d.get("at")},
           "game": game, "assets": assets}
    with open(os.path.join(out_dir, "game.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"완료: {out_dir}/game.json · 이미지 {len(assets['img'])}개 · 오디오 {len(assets['audio'])}개")


if __name__ == "__main__":
    main()
