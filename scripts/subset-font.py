"""将官方 Noto Serif SC 变量字体裁剪为游戏用字；原始 TTF 不放入仓库。

python3 scripts/subset-font.py /tmp/NotoSerifSC.ttf
需要 fonttools 与 brotli，授权说明见 public/assets/fonts/OFL.txt。
"""

from hashlib import sha256
from pathlib import Path
import re
import sys
from fontTools import subset

root = Path(__file__).resolve().parent.parent
text = ''.join(path.read_text() for path in (root / 'src').glob('*') if path.suffix in ('.ts', '.css'))
text += (root / 'index.html').read_text()
options = subset.Options()
options.flavor = 'woff2'
options.desubroutinize = True
font = subset.load_font(sys.argv[1], options)
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=set(map(ord, text)) | set(range(32, 256)) | set(range(0x2000, 0x2070)))
subsetter.subset(font)
directory = root / 'public/assets/fonts'
directory.mkdir(parents=True, exist_ok=True)
temporary = directory / 'subset.woff2'
subset.save_font(font, str(temporary), options)
digest = sha256(temporary.read_bytes()).hexdigest()[:12]
target = directory / f'noto-serif-sc-{digest}.woff2'
temporary.replace(target)
css = root / 'src/style.css'
style = css.read_text()
declaration = f"""@font-face {{
  font-family: 'Noto Serif SC';
  font-style: normal;
  font-weight: 200 900;
  font-display: swap;
  src: url('/assets/fonts/{target.name}') format('woff2');
}}
"""
style = re.sub(r"^@import[^\n]+;\n|^@font-face\s*\{[^}]+\}\n", lambda _: declaration, style, count=1)
css.write_text(style)
print(f'{target.relative_to(root)}: {target.stat().st_size / 1024:.0f} KiB')
