# 生成 PWA 与主屏幕图标，输出到 public/icons/。
#
# 运行：python3 scripts/generate-icons.py（需要 Pillow）。
# 图案与 public/favicon.svg 一致（山门、玉月与远山）；manifest 图保留圆角与透明角，
# maskable 与 apple-touch-icon 满幅铺底（圆圈裁切与黑角分别由系统与 iOS 处理）。
# 满幅版本的门柱与远山延伸到画布底边，与 favicon 中被圆角底边裁出的效果一致。
# PNG 是 Web App Manifest 与 apple-touch-icon 的硬性格式要求，不经 compress-assets.py 转 WebP。
from pathlib import Path

from PIL import Image, ImageDraw

# 与 favicon.svg 同值：径向渐变中心 (0.5, 0.62)、半径 0.55，由内到外。
GLOW_INNER = (0x2F, 0x64, 0x55)
GLOW_OUTER = (0x10, 0x2D, 0x29)
GLOW_CENTER = (0.5, 0.62)
GLOW_RADIUS = 0.55
GOLD = "#d5c58e"
JADE = "#afccb0"
SHADOW = "#0b211d"
CORNER = 15  # 64x64 视窗中的圆角半径
MOON = (32, 41, 7)
PEAK = (32, 50)  # 远山山尖，两侧斜率为每下降 12 向外 10
PEAK_BASE = 62
LINTEL = (12, 27, 52, 31)
PILLARS = [(15, 21), (43, 49)]
PILLAR_TOP = 21
# 屋顶：M21 11 H43 L50 17 Q54 18 57 14 L55 22 H9 L7 14 Q10 18 14 17 Z
ROOF = [
    ("L", (21, 11)),
    ("L", (43, 11)),
    ("L", (50, 17)),
    ("Q", (54, 18), (57, 14)),
    ("L", (55, 22)),
    ("L", (9, 22)),
    ("L", (7, 14)),
    ("Q", (10, 18), (14, 17)),
]
TARGETS = {
    "icon-192.png": dict(size=192, bleed=False, art=1.0),
    "icon-512.png": dict(size=512, bleed=False, art=1.0),
    "icon-maskable-512.png": dict(size=512, bleed=True, art=0.76),
    "apple-touch-icon.png": dict(size=180, bleed=True, art=0.9),
}


def roof_points() -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    for step in ROOF:
        if step[0] == "L":
            points.append(step[1])
            continue
        (cx, cy), (ex, ey) = step[1], step[2]
        sx, sy = points[-1]
        for i in range(1, 17):
            t = i / 16
            points.append(
                (
                    (1 - t) ** 2 * sx + 2 * (1 - t) * t * cx + t * t * ex,
                    (1 - t) ** 2 * sy + 2 * (1 - t) * t * cy + t * t * ey,
                )
            )
    return points


def glow(size: int) -> Image.Image:
    # 先在低分辨率逐点计算再放大，避免依赖 numpy。
    low = 128
    image = Image.new("RGB", (low, low))
    cx, cy = GLOW_CENTER[0] * low, GLOW_CENTER[1] * low
    radius = GLOW_RADIUS * low
    pixels = image.load()
    for y in range(low):
        for x in range(low):
            t = min(1.0, ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) ** 0.5 / radius)
            pixels[x, y] = tuple(
                round(a + (b - a) * t) for a, b in zip(GLOW_INNER, GLOW_OUTER)
            )
    return image.resize((size, size), Image.BICUBIC).convert("RGBA")


def paint(size: int, bleed: bool, art: float) -> Image.Image:
    supersample = 4
    big = size * supersample
    image = glow(big)
    pen = ImageDraw.Draw(image)
    # 把 64x64 视窗的画作缩放到居中的 art 区域，满幅版本给系统裁切留安全区。
    area = big * art
    offset = (big - area) / 2

    def m(value: float) -> float:
        return offset + value / 64 * area

    # 底边在视窗坐标中的位置：圆角版为 64，满幅版延伸到画布底部。
    bottom = (big - offset) / area * 64 if bleed else 64
    x, y, r = MOON
    pen.ellipse([m(x - r), m(y - r), m(x + r), m(y + r)], fill=JADE)
    depth = bottom - PEAK[1] if bleed else PEAK_BASE - PEAK[1]
    spread = depth * 10 / 12
    # 满幅版延伸后远山会变宽，只保留门洞内（两门柱内沿之间）的部分。
    inner_left, inner_right = PILLARS[0][1], PILLARS[1][0]
    half = min(spread, PEAK[0] - inner_left)
    shoulder = PEAK[1] + half * 12 / 10
    peak = [
        (PEAK[0], PEAK[1]),
        (PEAK[0] + half, shoulder),
        (PEAK[0] + half, PEAK[1] + depth),
        (PEAK[0] - half, PEAK[1] + depth),
        (PEAK[0] - half, shoulder),
    ]
    assert PEAK[0] - inner_left == inner_right - PEAK[0]
    pen.polygon([(m(px), m(py)) for px, py in peak], fill=SHADOW)
    pen.polygon([(m(px), m(py)) for px, py in roof_points()], fill=GOLD)
    left, top, right, low = LINTEL
    pen.rectangle([m(left), m(top), m(right), m(low)], fill=GOLD)
    for left, right in PILLARS:
        pen.rectangle([m(left), m(PILLAR_TOP), m(right), m(bottom)], fill=GOLD)
    if not bleed:
        mask = Image.new("L", (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, big - 1, big - 1], radius=big * CORNER / 64, fill=255
        )
        image.putalpha(mask)
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
