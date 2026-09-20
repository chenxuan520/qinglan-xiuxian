"""将生成素材转换为网页使用的 WebP，验证后移除未压缩 PNG。

运行：python3 scripts/compress-assets.py（需要 Pillow 的 WebP 支持）。
不缩放、不裁切；透明通道无损，纹理 quality=75，人物与物品 quality=82。
"""

from pathlib import Path

from PIL import Image

assets = Path(__file__).resolve().parents[1] / "public" / "assets"
before = after = 0
for source in sorted(assets.glob("*.png")):
    target = source.with_suffix(".webp")
    pending = source.with_suffix(".webp.next")
    with Image.open(source) as image:
        quality = 75 if source.stem.startswith(("terrain", "town-ground")) else 82
        image.save(pending, "WEBP", quality=quality, method=6, alpha_quality=100)
        with Image.open(pending) as result:
            assert result.size == image.size, source.name
            if image.mode == "RGBA":
                assert result.getchannel("A").tobytes() == image.getchannel("A").tobytes(), source.name
    assert pending.stat().st_size < source.stat().st_size, source.name
    pending.replace(target)
    before += source.stat().st_size
    after += target.stat().st_size
    assert target.stat().st_size < source.stat().st_size, source.name
    print(f"{source.name}: {source.stat().st_size:,} -> {target.stat().st_size:,} bytes", flush=True)
    source.unlink()
if before:
    print(f"Total: {before:,} -> {after:,} bytes, saved {1 - after / before:.1%}")
