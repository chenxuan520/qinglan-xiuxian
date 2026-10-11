# 生成分享卡片封面（og:image / twitter:image），输出 public/assets/og-cover.jpg。
#
# 运行：python3 scripts/generate-og-image.py（需要 Pillow）。
# 来源为 qinglan-prologue-dark.webp（黄昏山门全景，与官网深色主视觉同系），
# 标准 1200x630 cover 裁剪保存为 JPEG——社交平台抓取器对 JPEG 支持最完备，不压成 WebP。
from pathlib import Path

from PIL import Image

SOURCE = Path(__file__).resolve().parents[1] / "public/assets/qinglan-prologue-dark.webp"
TARGET = Path(__file__).resolve().parents[1] / "public/assets/og-cover.jpg"
WIDTH, HEIGHT = 1200, 630

with Image.open(SOURCE) as image:
    src_w, src_h = image.size
    # cover：先按宽度等比放大，再垂直居中裁掉多余高度。
    scaled_w = WIDTH
    scaled_h = round(src_h * WIDTH / src_w)
    scaled = image.resize((scaled_w, scaled_h), Image.LANCZOS)
    # 防御：换用更扁的源图时，宁可失败也不要静输出带黑边的封面。
    assert scaled_h >= HEIGHT, f"{SOURCE} 按宽缩放后高度不足 {HEIGHT}"
    top = (scaled_h - HEIGHT) // 2
    cover = scaled.crop((0, top, WIDTH, top + HEIGHT)).convert("RGB")
    cover.save(TARGET, "JPEG", quality=85, optimize=True)

with Image.open(TARGET) as check:
    assert check.size == (WIDTH, HEIGHT), TARGET
print(f"og-cover.jpg: {TARGET.stat().st_size:,} bytes")
