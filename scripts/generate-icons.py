# 生成 PWA 与主屏幕图标，输出到 public/icons/。
#
# 运行：python3 scripts/generate-icons.py（需要 Pillow）。
# 图案与 public/favicon.svg 一致；manifest 图保留圆角与透明角，
# maskable 与 apple-touch-icon 满幅铺底（圆圈裁切与黑角分别由系统与 iOS 处理）。
# PNG 是 Web App Manifest 与 apple-touch-icon 的硬性格式要求，不经 compress-assets.py 转 WebP。
from pathlib import Path

from PIL import Image, ImageDraw

INK = "#163c34"
PEAK = "#dcebdd"
GOLD = "#d4bd7e"
PEAK_POINTS = [(32, 6), (38, 36), (32, 44), (26, 36)]
GOLD_LINES = [[(20, 42), (44, 42)], [(32, 42), (32, 56)]]
GOLD_WIDTH = 4
TARGETS = {
    "icon-192.png": dict(size=192, bleed=False, art=1.0),
    "icon-512.png": dict(size=512, bleed=False, art=1.0),
    "icon-maskable-512.png": dict(size=512, bleed=True, art=0.76),
    "apple-touch-icon.png": dict(size=180, bleed=True, art=0.9),
}


def paint(size: int, bleed: bool, art: float) -> Image.Image:
    supersample = 4
    big = size * supersample
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    pen = ImageDraw.Draw(image)
    if bleed:
        pen.rectangle([0, 0, big, big], fill=INK)
    else:
        pen.rounded_rectangle([0, 0, big, big], radius=big * 16 / 64, fill=INK)
    # 把 64x64 视窗的画作缩放到居中的 art 区域，满幅版本给系统裁切留安全区。
    area = big * art
    offset = (big - area) / 2

    def m(value: float) -> float:
        return offset + value / 64 * area

    pen.polygon([(m(x), m(y)) for x, y in PEAK_POINTS], fill=PEAK)
    width = max(1, round(GOLD_WIDTH / 64 * area))
    for line in GOLD_LINES:
        pen.line([(m(x), m(y)) for x, y in line], fill=GOLD, width=width)
    return image.resize((size, size), Image.LANCZOS)


icons = Path(__file__).resolve().parents[1] / "public" / "icons"
icons.mkdir(exist_ok=True)
for name, options in TARGETS.items():
    target = icons / name
    image = paint(options["size"], options["bleed"], options["art"])
    image.save(target, "PNG", optimize=True)
    with Image.open(target) as check:
        assert check.size == (options["size"], options["size"]), name
        assert check.mode == "RGBA", name
    print(f"{name}: {target.stat().st_size:,} bytes", flush=True)
