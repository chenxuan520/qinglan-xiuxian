# 素材与生成提示词

## 二十八种丹药图集（2026-09-21）

内置 imagegen 生成 `public/assets/medicines.webp`：八列四行，前三行各八种，第四行左侧四种永久珍品，其余四格留空，严格按 `src/medicine-data.ts` 顺序映射。统一手绘瓷瓶、玉盏、灵丹风格，全部为图片图标，不混用 SVG。项目只保留最终 WebP。

原图 1774 × 887 RGBA、1,935,095 字节；按网页图标用途缩至 1024 × 512，WebP quality=78、method=6、保留透明通道，204,474 字节，减少约 89.4%。每格 128 × 128，页面展示 72 × 72。图集加入初始资源预载，与法宝图集共用基础路径处理。

完整最终生成提示词见 [丹药图集提示词](medicine-art-prompt.txt)。

## 山河一梦 · 序章与 README 封面（2026-09-20）

亮版路径：`public/assets/qinglan-prologue.webp`，保留给 README。内置 imagegen 先生成青岚镇、竹海、云山与仙门的全景图，再按反馈将暮色改成明亮晨光：青绿群峰、金色霞光、白色云海与仙鹤。1672 × 941 RGB，保持原尺寸，WebP quality=76、method=6；2,843,572 字节 PNG 压缩至 249,902 字节（减少 91.2%）。

暗版路径：`public/assets/qinglan-prologue-dark.webp`，用于游戏序章。以亮版为底图，用内置 imagegen 编辑为青蓝暮色与暖色灯火，保留原有构图。1672 × 941 RGB，同样使用 quality=76、method=6，2,717,911 字节 PNG 压缩至 212,726 字节（减少 92.2%）。两版均保留，原始工具输出留在生成目录，不作为网页下载资源。

首访在场景加载进度条中预载暗版，加载完成后展示序章；已读存档不再加载该背景。序章使用深青渐变、浅色正文与淡金标题；游戏不同时下载亮版，README 继续展示完整晨光版。

初始生成提示词：

```text
Use case: stylized-concept. Create an original wide panoramic background painting for the Chinese xianxia game Qinglan Xian Tu, shared by its poetic prologue screen and README cover. Landscape 16:9 composition, highest available quality. Beautiful sophisticated hand-painted Chinese blue-green shanshui fantasy illustration, delicate atmospheric brushwork, mineral jade, deep teal and ink blue, restrained warm amber lamps. Foreground lower left: a lived-in ancient riverside town, clusters of black tiled timber houses, little bridges, warmly glowing windows, fishing boats with lanterns reflected in dark calm water, tiny human silhouettes conveying mortal life. A winding river and bamboo groves lead into immense layers of misty mountains, a distant graceful immortal temple gate perched on a high peak in the left-center, slender waterfalls dissolving into a luminous sea of cloud. A very small lone robed traveler on the nearest bridge, no large character. Blue hour just after sunset, thin crescent moon, quiet longing, human warmth amid vast mountains, a sense of embarking on an uncertain immortal journey. Architectural and mountain detail concentrated in the left half and lower third, the upper right half should be quieter deep teal sky and elegant mist with low visual contrast so overlaid prose will remain readable. It must also be a gorgeous coherent standalone landscape without text. Layered painterly detail, cinematic atmospheric depth, Chinese traditional architecture, no European castles. NO lettering, NO title, NO logos, NO watermark, NO borders, NO interface, NO panels, NO collage.
```

晨光版编辑提示词（以上一版图片为参考）：

```text
Edit this landscape for the Chinese xianxia cultivation game 青岚仙途. The user says this picture is too dark and does not feel like immortal cultivation fantasy. Make a substantial daylight lighting and color revision, preserving the panoramic composition, riverside mortal town on the lower left, arched bridge and boats, bamboo groves, layered mountains, distant immortal temple gates, waterfalls and sea of clouds. Replace dark blue-hour night with luminous early-morning peach-gold sunshine, soft pale jade and emerald blue-green mountain colors, bright ivory mist and airy pearl-white cloud sea, subtly glowing golden immortal temple gates, shafts of warm sunlight from the upper right. Remove the night moon and stars. Make the river clear luminous celadon turquoise with gentle golden reflections; town roofs warm grey teal, houses visible and welcoming, lanterns secondary in daylight. Strong feeling of a magnificent Chinese xianxia immortal realm with heavenly mist, soaring peaks, ethereal light and delicate small white cranes far above the clouds. Refined hand-painted Chinese blue-green shanshui fantasy painting, elegant tranquil wonder, generous atmospheric depth; bright and clear rather than moody or dark. Keep enough pale clean sky and gentle low-contrast mist on the right half to overlay dark green poetic text. Overall midtones and shadows should be markedly brighter; no blackened corners, no heavy dark vignette. Beautiful coherent standalone illustration. NO text, no title, no logos, no watermark, no UI, no borders. Landscape wide 16:9.
```

暮色版编辑提示词（以保留的晨光版为参考）：

```text
Use case: lighting-weather. Edit the provided panoramic Chinese xianxia painting into an elegant dusk / blue-hour variant for a poetic game prologue. Preserve the exact landscape composition, the riverside town and fishing boats at lower left, bridge, bamboo, immense green peaks, distant immortal gate, delicate waterfalls and mist, tiny human figures, detailed hand-painted illustration style, and wide landscape aspect ratio. Change only time-of-day lighting and palette: deep but luminous jade and ink-teal mountains, soft silver-blue evening mist, a muted blue dusk sky instead of bright sunrise; small warm amber windows and lanterns reflect in the river. Retain clear and beautiful architectural and landscape details, a serene hopeful immortal atmosphere and visible layers of cloud. The right half should be low-contrast dark teal mist suitable behind pale prose. Remove harsh white sunshine and bright golden sunrays. No large moon, no pitch-black crushed shadows, no horror atmosphere, no purple neon, no text, no interface, no borders or watermarks. This must look like the same painting at dusk, not a different town.
```

## 网页素材压缩与场景加载（2026-09-20）

运行资源统一为 WebP，`public/assets/` 不保留未压缩 PNG。原有 25 张图片从 68,873,273 字节压缩到 9,217,774 字节（减少 86.6%）；原尺寸不变，RGBA 素材逐像素校验 alpha 通道无损。纹理 quality=75，角色与图集 quality=82，method=6。需要 Pillow 的生成维护命令：

```bash
python3 scripts/compress-assets.py
```

脚本先写临时文件，检查尺寸、透明通道和体积，通过后原子替换 WebP，再移除对应 PNG；不会让构建读到编码中的半成品。原始 imagegen 输出仍在工具生成目录，项目只携带压缩成品。首境预载 8 张图、约 2.51 MB；其他秘境只补齐对应地图和妖物，旧续局额外在场妖物也补载。城镇和宗门按需加载，音乐独立加载。场景进度条全部完成才允许开局或入城计龄，失败可重试。

## 青岚镇模块化素材（2026-09-20）

地图为 3600 × 2500 世界坐标，由 `src/town.ts` 摆放街道、28 栋建筑与港口杂物，镜头跟随玩家；扩展街区只需增加道路、建筑及事件坐标。没有使用一整张城镇背景放大。新图由内置 imagegen 生成，保留透明边缘、尺寸与格子顺序后压缩；九位具名镇民与街上行人共用同一图集，行人做小幅饱和度与明暗变化。

- `town-buildings.webp`：1254 × 1254 RGBA，3 × 3，472,856 字节。按行：药铺、茶馆、镖局；民居院落、铁匠铺、书铺；鱼市、粮蔬铺、裁缝铺。
- `town-props.webp`：1536 × 1024 RGBA，3 × 2，313,364 字节。按行：树、菜摊、灯笼架；渔船、木栈桥、晾衣架。船只跨过规则格边，因此船与栈桥按实际边界分别取景，避免相邻碎片。
- `town-npcs.webp`：1254 × 1254 RGBA，3 × 3，333,998 字节。按行：药师、茶馆掌柜、镖师；货商、铁匠、书生；渔夫、农人、裁缝。最终图明确生成九人；四人草案和背景不透明的九人草案均未采用。
- `town-ground.webp`：1254 × 1254、240,728 字节，独立铺地纹理，可重复铺展，不再借用秘境废墟地面。

生成要求：统一手绘中国古镇 RPG 俯视偏正面角度，整个人物或建筑完全位于自己的等宽格子内，真实 alpha 透明，无网格、文字或棋盘底；房屋用青瓦木窗、暖色灯火、布幌、生活器具表现市井感，不带整块矩形地台。杂物图要求六个独立完整对象，栈桥能重复拼接。NPC 使用普通人间职业、年龄和服饰区分，便于后续复用。

地面最终提示词：

```text
Use case: stylized-concept. Production asset for a modular Chinese medieval riverside town web game. Generate ONE seamlessly repeating square ground texture, 1024x1024, direct overhead flat orthographic view. Warm muted grey and beige small worn rectangular flagstones, tidy hand-laid historic street paving, subtle varied stone sizes and narrow sandy mortar seams. Hand painted softly detailed RPG game texture. Human lived-in clean market town, gentle sunny warmth, occasional very tiny scattered straw pieces, minimal moss at seams, understated low contrast. Small stones evenly fill the canvas edge to edge, consistent scale throughout, each stone about 60-120 pixels across, so it tiles subtly. NO buildings, NO people, NO large objects, NO dramatic cracks, NO broken columns, NO foliage piles, NO decorative ancient ruins, NO path edge, NO pavement border, NO perspective, NO vignette, NO text or UI. Opaque floor surface, natural irregular stone detail, not a flat vector pattern. This needs to be the reusable pleasant walking surface for a lively Chinese town, not a ruined battlefield.
```

## 人间十六宗门（2026-09-20）

正魔两张图集均由内置 imagegen 生成，1536 × 1024 RGBA、4 列 × 2 行。由原图保尺寸压缩为 WebP，未经裁切或缩放；运行时 CSS 背景定位。建筑带半透明环境光晕，16 个格子按 `SECTS` / `PASSIVES` 顺序映射，每门有不同造型。魔道图按实际建筑左右边界设置不等宽取景，避免邻格碎片串入；底边少量裁除图集跨行尖角。后续两次背景修正生成了不透明棋盘底，未纳入项目，最终采用最初的 RGBA 图经 WebP 压缩后的素材。仅打开宗门页签时加载，不加入战斗素材预加载。

### 正道宗门

项目路径：`public/assets/sects-orthodox.webp`。

```text
Use case: stylized-concept. Asset type: one production-ready transparent PNG architecture sprite atlas for a polished Chinese xianxia web game. EXACTLY 4 columns by 2 rows, eight separate orthodox cultivation sect headquarters, row-major order. Landscape 1536x1024, each cell equal 384x512, each whole miniature building ensemble centered inside its own cell with 15 percent empty padding on every side. Authentic Chinese fantasy architecture, hand-painted richly detailed 2.5D isometric miniatures seen from a consistent three-quarter overhead view, elegant jade-green, ivory, antique gold, restrained magical glow, crisp readable silhouettes. Same perspective, scale and lighting across all eight; each sect architecturally DISTINCT, not recolors. Genuine alpha-transparent background, soft contained contact shadows, NO grid, NO labels, NO text, NO UI, NO people, no surrounding rectangular landscape panels. Row-major subjects: 1 Taixuan Sword sect: tall azure sword-shaped stone mountain pavilion, bronze sword monument and narrow ascending stair; 2 Celestial Star observatory: round blue celestial observatory with large brass armillary sphere, constellation disc and terraced roof; 3 Qiankun formation sect: octagonal jade temple on a circular yin-yang stone formation platform, concentric rune geometry without lettering; 4 Vajra sanctuary: broad sturdy golden Buddhist-style monastery, imposing serene guardian statue, squat bell tower, no sword spires; 5 Longevity valley: low timber herbal pavilions nestled around a large ancient sacred green tree, tiny medicine garden and stream contained on the miniature base; 6 Insight Mirror academy: slender white stone sanctuary with a large upright circular bronze mirror and angular crystal reflecting pools; 7 Spirit Gathering pavilion: turquoise pagoda surrounding a luminous jade basin with a spiraling ribbon of gathered spiritual mist, no giant tree; 8 Purple Palace sect: regal multi-tier palace elevated upon lavender crystal rock, luminous purple lotus courtyard. Every ensemble completely contained within its cell, no overlaps, no clipped finials, no connecting scenery between cells. Polished painterly video-game environment assets, not flat SVG or generic symbols.
```

### 魔道宗门

项目路径：`public/assets/sects-demonic.webp`。

```text
Use case: stylized-concept. Asset type: one production-ready transparent PNG architecture sprite atlas for a polished Chinese xianxia web game. EXACTLY 4 columns by 2 rows, eight separate demonic cultivation sect headquarters, row-major order. Landscape 1536x1024, each cell equal 384x512, each whole miniature building ensemble centered inside its own cell with 15 percent empty padding on every side. Authentic Chinese fantasy architecture, hand-painted richly detailed 2.5D isometric miniatures seen from a consistent three-quarter overhead view, aged obsidian, deep crimson, violet, tarnished bronze, restrained magical glow, crisp readable silhouettes. Match sophisticated jade-and-gold Chinese fantasy game craftsmanship, strong architectural variety, not repeated recolors. Genuine alpha-transparent background, soft contained contact shadows, NO grid, NO labels, NO text, NO UI, NO people, NO gore, no surrounding rectangular landscape panels. Row-major subjects: 1 Blood Scripture palace: dignified crimson temple surrounding a red crystal ritual pool, a pair of dark sweeping roof wings; 2 Heavenly Demon sect: towering black basalt fortress with imposing horned guardian statue and cracked violet glowing stone steps; 3 Nine Nether gate: monumental dark Chinese ceremonial gate spanning a miniature sunken chasm, cyan ghost lanterns, arched stone bridge; 4 White Bone citadel: pale ivory rib-like architectural buttresses supporting a black jade tiled keep, sculpted fantasy bone motif, no gore; 5 Soul Devouring abbey: round violet sanctuary with a floating hollow soul orb above its roof, pale wisps drawn into its center; 6 Curse altar: low hexagonal obsidian ritual courtyard with six leaning black curse pillars tied with crimson ribbons and a bronze ritual bell; 7 Soul Binding tower: tall narrow midnight-blue tower wrapped in bronze chains, hanging luminous lanterns and sealed spirit urns; 8 Fate Defying pavilion: sharply angular dark red pavilion raised on broken levitating stone terraces, immense fractured celestial wheel behind it, gold and violet rift glow. Every ensemble completely contained within its cell, no overlaps, no clipped finials, no connecting scenery between cells. Polished painterly video-game environment assets, not flat SVG or generic symbols.
```

## 仙侠背景音乐（2026-09-20）

项目路径：`public/assets/audio/qinglan-mist.m4a`，曲名「青岚烟渚」。本项目原创五声音阶编曲，离线合成拨弦、笛箫与轻柔铺底音色，没有使用外部歌曲、录音或采样。72 BPM，24 小节，80 秒立体声循环，AAC 96 kbps，约 0.96 MB。混响与音符尾音回卷到开头，保持循环衔接；播放不参与战斗计算，也不阻塞场景加载。

可在安装了 Python 3、numpy 的 macOS 上使用系统 `afconvert` 重新生成：

```bash
python3 scripts/generate-music.py
```

生成使用固定随机种子，临时 WAV 自动清理。运行和部署直接使用已提交的 M4A 文件，不需要 Python 或音频编码器。每次进入页面先静音，序章右上角和主界面提供开启声音按钮；普通点击 / 按键不触发播放。音乐和战斗音效共用总音量与静音，保留音量，导入存档不自动打开声音。

## 最终首领：九天执劫仙尊（2026-09-19）

项目路径：`public/assets/boss-immortal.webp`。通过内置 imagegen 生成，1254 × 1254 RGBA PNG，白金仙袍、天冠、雷杖与金色光轮，实际透明背景。作为独立单格立绘用于战场与妖物志。

```text
Use case: stylized-concept. Production game asset: ONE final-boss Chinese celestial immortal deity for a polished xianxia survivors game. TRANSPARENT RGBA BACKGROUND, square 1024x1024 canvas. One full-body character centered, from crown to feet entirely visible with 12 percent transparent margin. Rich detailed hand-painted 2.5D chibi fantasy RPG art, slightly overhead three-quarter front view, readable at 160px. A majestic male immortal elder, long flowing silver hair and white beard, stern luminous eyes, ornate golden celestial crown, layered WHITE and pale blue silk robes with intricate GOLD armor and jade details, imposing broad silhouette. Floating over a compact cloud-shaped golden pedestal, holding a long ornate lightning scepter, concentric golden celestial halo behind shoulders, several small blue-gold thunder glyph shapes around him WITHOUT letters or writing. He looks divine and vastly more powerful than ordinary monsters, beautifully detailed and solemn. All magical effects contained within character footprint and margins. Clean transparent alpha outside figure, no solid background, no checkerboard, no scenery, no terrain, no text, no UI, no label, no watermark. Only ONE boss, not a sprite sheet.
```

## 终关地面（2026-09-19）

项目路径：`public/assets/terrain-trial.webp`。通过内置 imagegen 生成，万劫归墟专用黑玉石与银金天象纹地面，预览和战斗共用。

```text
Use case: stylized-concept. Asset type: seamless square ground texture for the FINAL TRIAL arena of a Chinese xianxia survivors videogame. 1536x1536, DIRECTLY OVERHEAD orthographic flat walkable floor, tileable on every edge. Premium finely hand-painted game environment art, understated contrast so tiny fighters and red attack telegraphs remain readable. Ancient storm-worn BLACK JADE and dark blue obsidian slabs, narrow aged SILVER and muted GOLD inlay fracture patterns, subtle circular astronomical carvings embedded flush in the paving, occasional thin drifting indigo mist, scattered small mineral chips. Grand desolate tribulation ground, material clearly different from white celestial marble or green forest. Broad open paving evenly distributed, no large central medallion or focal point. NO characters, bosses, buildings, horizon, perspective, elevated walls, bright lightning strokes, red cracks, text, UI, labels, borders, watermarks. Opaque textured background, no transparency.
```

## 各境专属妖物扩充（2026-09-19）

本轮使用内置 imagegen 生成 44 个地域进阶种，五张图集均为 1536 × 1024 RGBA PNG，已检查实际透明通道。古墟为 6 列 × 2 行，其余为 4 列 × 2 行；顺序与 `src/data.ts` 中地域进阶种一致。先落盘验证，再接入加载清单。最终提示词如下。

### enemies-ruins.webp

项目路径：`public/assets/enemies-ruins.webp`。

```text
Use case: stylized-concept. Asset type: transparent PNG sprite atlas for a polished Chinese xianxia survivors videogame. EXACTLY 6 columns and 2 rows, 12 separate full-body monsters. Landscape 1536x1024. Every equal cell has ONE centered monster, generous 18 percent transparent padding, each body fully inside its cell; no overlaps or clipped parts. Highly detailed hand-painted 2.5D top-down/front angled chibi Chinese fantasy game art, soft overhead light, rich readable silhouettes and material detail, cohesive jade and gold RPG aesthetic. Genuine alpha-transparent background (NOT painted checkerboard, NOT a colored background), no visible grid, no labels, NO TEXT, no interface, no scenery. STRICT row-major order left to right: (1) ember-capped mushroom imp with sandstone cracks; (2) russet bronze-armored jackal with copper mane; (3) floating amber flame with broken ceramic mask; (4) copper-red desert fox with tasselled tail; (5) terracotta turtle with ancient temple roof shell; (6) ochre-robed masked talisman caster; (7) cracked red clay explosive urn monster with tiny legs; (8) rust-red saber-tooth cat with ember stripes; (9) bronze ritual summoner with bell staff and ceremonial hat; (10) sand-colored scorpion spirit with smoky tail; (11) massive clay-armored halberd sentinel; (12) golden wind fox with long swirling tails. Each monster visually distinct, new regional evolutions of familiar fantasy archetypes, beautiful contained magical accents, no effects extending outside cell.
```

### enemies-ice.webp

项目路径：`public/assets/enemies-ice.webp`。

```text
Use case: stylized-concept. Asset type: transparent PNG sprite atlas for a polished Chinese xianxia survivors videogame. EXACTLY 4 columns and 2 rows, 8 separate full-body monsters. Landscape 1536x1024. Every equal cell has ONE centered monster, generous 18 percent transparent padding, each body fully inside its cell; no overlaps or clipped parts. Highly detailed hand-painted 2.5D top-down/front angled chibi Chinese fantasy game art, soft overhead light, rich readable silhouettes and material detail, cohesive jade and gold RPG aesthetic. Genuine alpha-transparent background (NOT painted checkerboard, NOT a colored background), no visible grid, no labels, NO TEXT, no interface, no scenery. STRICT row-major order left to right: (1) pale blue frost-capped mushroom imp; (2) white ice-armored arctic wolf; (3) floating blue frozen flame with crystal face; (4) snow-white fox with icy long tails; (5) snow-covered stone tortoise with icicle shell; (6) navy-robed frost shaman with ice orb; (7) round cracked ice core monster with small feet; (8) tall ice-bound ritual summoner holding frost lantern. Each monster visually distinct, new regional evolutions of familiar fantasy archetypes, beautiful contained magical accents, no effects extending outside cell.
```

### enemies-marsh.webp

项目路径：`public/assets/enemies-marsh.webp`。

```text
Use case: stylized-concept. Asset type: transparent PNG sprite atlas for a polished Chinese xianxia survivors videogame. EXACTLY 4 columns and 2 rows, 8 separate full-body monsters. Landscape 1536x1024. Every equal cell has ONE centered monster, generous 18 percent transparent padding, each body fully inside its cell; no overlaps or clipped parts. Highly detailed hand-painted 2.5D top-down/front angled chibi Chinese fantasy game art, soft overhead light, rich readable silhouettes and material detail, cohesive jade and gold RPG aesthetic. Genuine alpha-transparent background (NOT painted checkerboard, NOT a colored background), no visible grid, no labels, NO TEXT, no interface, no scenery. STRICT row-major order left to right: (1) olive toxic mushroom imp with purple spores; (2) mossy green swamp hound with thorny mane; (3) floating wispy violet poison spirit; (4) green swamp fox with vine tails; (5) algae-covered snapping turtle with mossy shell; (6) ragged olive-robed witch with venom orb; (7) bulbous purple spore pod monster with legs; (8) tall vine-wrapped shaman summoner with insect staff. Each monster visually distinct, new regional evolutions of familiar fantasy archetypes, beautiful contained magical accents, no effects extending outside cell.
```

### enemies-nether.webp

项目路径：`public/assets/enemies-nether.webp`。

```text
Use case: stylized-concept. Asset type: transparent PNG sprite atlas for a polished Chinese xianxia survivors videogame. EXACTLY 4 columns and 2 rows, 8 separate full-body monsters. Landscape 1536x1024. Every equal cell has ONE centered monster, generous 18 percent transparent padding, each body fully inside its cell; no overlaps or clipped parts. Highly detailed hand-painted 2.5D top-down/front angled chibi Chinese fantasy game art, soft overhead light, rich readable silhouettes and material detail, cohesive jade and gold RPG aesthetic. Genuine alpha-transparent background (NOT painted checkerboard, NOT a colored background), no visible grid, no labels, NO TEXT, no interface, no scenery. STRICT row-major order left to right: (1) pale bone-capped mushroom imp with ghostfire eyes; (2) charcoal skeletal hound with blue flaming mane; (3) floating ragged cyan ghost with hollow mask; (4) black spectral fox with wispy violet tails; (5) black tombstone tortoise with bone studs; (6) dark red-robed underworld sorcerer with skull orb; (7) cracked purple spirit urn monster leaking ghostfire; (8) tall black ceremonial soul summoner carrying a chained lantern. Each monster visually distinct, new regional evolutions of familiar fantasy archetypes, beautiful contained magical accents, no effects extending outside cell.
```

### enemies-heaven.webp

项目路径：`public/assets/enemies-heaven.webp`。

```text
Use case: stylized-concept. Asset type: transparent PNG sprite atlas for a polished Chinese xianxia survivors videogame. EXACTLY 4 columns and 2 rows, 8 separate full-body monsters. Landscape 1536x1024. Every equal cell has ONE centered monster, generous 18 percent transparent padding, each body fully inside its cell; no overlaps or clipped parts. Highly detailed hand-painted 2.5D top-down/front angled chibi Chinese fantasy game art, soft overhead light, rich readable silhouettes and material detail, cohesive jade and gold RPG aesthetic. Genuine alpha-transparent background (NOT painted checkerboard, NOT a colored background), no visible grid, no labels, NO TEXT, no interface, no scenery. STRICT row-major order left to right: (1) ivory celestial mushroom imp with golden rune-like abstract bands; (2) silver storm wolf with electric blue mane; (3) floating golden star-flame spirit with jade eyes; (4) pearl-white cloud fox with flowing golden tails; (5) jade-and-gold tortoise with small celestial pavilion shell; (6) white-and-gold robed astral sorcerer with star orb; (7) round violet lightning core monster in a broken gold casing; (8) tall silver astral summoner with star wheel and long azure robes. Each monster visually distinct, new regional evolutions of familiar fantasy archetypes, beautiful contained magical accents, no effects extending outside cell.
```

全部位图由内置 `image_gen.imagegen` 工具生成，未使用 CLI/API 回退。最终素材均已保存进项目：

| 文件                                  | 用途                                | 规格                  |
| ------------------------------------- | ----------------------------------- | --------------------- |
| `public/assets/terrain.webp`          | 可重复铺设的苔石地面                | 1254 × 1254           |
| `public/assets/characters.webp`       | 主角及基础妖物，4 列 × 2 行         | 1536 × 1024，透明 PNG |
| `public/assets/enemies-distinct.webp` | 独立妖物变体与九幽冥主，3 列 × 2 行 | 1536 × 1024，透明 PNG |

法宝与功法图标统一使用生成图集，法术特效使用 Canvas 绘制。妖物图集的裁切定义统一在 `src/sprites.ts`，图鉴与战斗共用，避免映射不一致。

## 扩展图集：法宝、功法与高阶妖物

均通过内置 `image_gen.imagegen` 生成。法宝图集 1–3 为 1448 × 1086、4 列 × 3 行；功法图集为 1254 × 1254、4 列 × 4 行。所有法宝和功法图标统一读取图片，不再使用 SVG 物品图标。物品按 `TREASURES` / `PASSIVES` 顺序映射，见 `src/item-art.ts`。

高阶妖物图集 1–2 为 1536 × 1024、4 列 × 2 行；六境妖王为 1536 × 1024、3 列 × 2 行。三个角色图集保留真实 alpha 通道，使用 `src/sprites.ts` 的统一映射，战斗与妖物志共用。已有角色图集继续保留，保证旧存档和旧妖物可用。

### treasures-1.webp

项目路径：`public/assets/treasures-1.webp`。

```text
Use case: stylized-concept. Asset type: a polished Chinese xianxia game INVENTORY ICON ATLAS. One image, EXACT regular 4 columns by 3 rows, TWELVE different isolated inventory artifacts, centered in equal cells with generous 18 percent inner padding. Landscape 1536x1152. No visible grid, no borders, no labels, NO TEXT OR CHARACTERS. Uniform flat deep jade-green #12352d background everywhere, NOT transparent and NOT checkerboard. Each object is an exquisite detailed hand-painted 2.5D fantasy inventory illustration, consistent angled overhead view, delicate gilt and jade decoration, soft controlled rim light, highly readable silhouette. Each object entirely contained in its own cell, nothing touches cell boundaries. Cohesive premium Chinese fantasy RPG art. Make every object visually distinct. ORDER STRICTLY row major left to right: Row 1: (1) long elegant azure jade straight sword with a golden hilt, (2) green lotus lantern with turquoise petals and glowing golden center, (3) purple thunder talisman made of paper with a tiny lightning arc but no lettering, (4) ornate bronze temple bell. Row 2: (5) green double-gourd poison flask, (6) round icy silver mirror surrounded by snowflake crystals, (7) orange fire pearl inside a delicate gold flame frame, (8) broad pale green palm-leaf fan. Row 3: (9) crimson crescent bladed metal wheel, (10) curved golden star bow with one bright arrow, (11) square heavy bronze seal with carved mountain-shaped handle, (12) coiled golden rope with hooked jade ends.
```

### treasures-2.webp

项目路径：`public/assets/treasures-2.webp`。

```text
Use case: stylized-concept. Asset type: a polished Chinese xianxia game INVENTORY ICON ATLAS. One image, EXACT regular 4 columns by 3 rows, TWELVE different isolated inventory artifacts, centered in equal cells with generous 18 percent inner padding. Landscape 1536x1152. No visible grid, no borders, no labels, NO TEXT OR CHARACTERS. Uniform flat deep jade-green #12352d background everywhere, NOT transparent and NOT checkerboard. Each object is an exquisite detailed hand-painted 2.5D fantasy inventory illustration, consistent angled overhead view, delicate gilt and jade decoration, soft controlled rim light, highly readable silhouette. Each object entirely contained in its own cell, nothing touches cell boundaries. Cohesive premium Chinese fantasy RPG art. Make every object visually distinct. ORDER STRICTLY row major left to right: Row 1: (1) circular yin-yang jade formation disk in black ivory and silver, (2) dark purple ghost banner on a slender staff, (3) aqua ocean pearl cradled by waves, (4) ornate long gold dragon-shaped ruler. Row 2: (5) horizontal green jade seven-string guqin zither, (6) large ivory-and-gold calligraphy brush with dark ink bristles, (7) seven-tier small golden Chinese pagoda, (8) three small green formation flags arranged as a triangular cluster. Row 3: (9) round bronze three-legged medicinal cauldron with small pale green herbal vapor, (10) long jade bamboo flute with red tassel, (11) loop of golden wooden Buddhist prayer beads with a jade bead, (12) intricate dark blue brass astronomical compass with tiny star inlays.
```

### treasures-3.webp

项目路径：`public/assets/treasures-3.webp`。

```text
Use case: stylized-concept. Asset type: a polished Chinese xianxia game INVENTORY ICON ATLAS. One image, EXACT regular 4 columns by 3 rows, TWELVE different isolated inventory artifacts, centered in equal cells with generous 18 percent inner padding. Landscape 1536x1152. No visible grid, no borders, no labels, NO TEXT OR CHARACTERS. Uniform flat deep jade-green #12352d background everywhere, NOT transparent and NOT checkerboard. Each object is an exquisite detailed hand-painted 2.5D fantasy inventory illustration, consistent angled overhead view, delicate gilt and jade decoration, soft controlled rim light, highly readable silhouette. Each object entirely contained in its own cell, nothing touches cell boundaries. Cohesive premium Chinese fantasy RPG art. Make every object visually distinct. ORDER STRICTLY row major left to right: Row 1: (1) open pale blue Chinese oil-paper umbrella with white cloud patterns, (2) long straight gold spear with a broad jade pointed head, (3) black and purple crescent scythe with a curved bone shaft, (4) three sharp crimson dark-metal throwing nails. Row 2: (5) closed dark plum ornate coffin with pale bone trim, (6) flexible coiling red-scaled whip with gold handle, (7) small ivory skull crowned with black horns and violet eyes, (8) crimson chalice with a dark silver stem and swirling red liquid. Row 3: (9) organic green beetle nest pod with amber eggs, (10) jagged purple broken mirror radiating separate mirror shards, (11) huge double-edged bronze battle axe with ancient green patina, (12) a small open blue silk pouch spilling bright silver star-shaped grains of sand.
```

### cultivation-manuals.webp

项目路径：`public/assets/cultivation-manuals.webp`。

```text
Use case: stylized-concept. Asset type: Chinese xianxia game CULTIVATION MANUAL ICON ATLAS. EXACT regular 4 columns by 4 rows of SIXTEEN different distinct isolated cultivation books or ritual objects, 1536x1536 square. Each centered in equal cell with generous 18 percent padding. Flat opaque dark jade-green #12352d background, NO grid, NO labels, NO text, NO letters, NO checkerboard. Exquisite hand-painted 2.5D fantasy inventory art matching gold and jade Chinese RPG artifacts, readable detailed silhouettes, controlled magical aura contained within cell. Upper two rows are righteous, lower two rows are sinister but tasteful. Strict row major: Row1: (1) ivory closed sword manual with gold sword-shaped emblem, (2) blue folded star chart with seven gold stars, (3) pale jade open scroll displaying a circular geometric world diagram without writing, (4) gold shield-shaped jade amulet with a protective glowing center. Row2: (5) green herbal book sprouting a delicate vine, (6) golden eye-shaped pendant with a red gemstone pupil, (7) turquoise spiral-shaped vessel drawing in three small cyan pearls, (8) purple jade miniature palace-shaped scripture case. Row3: (9) dark crimson book bound by three red cords with a blood-drop gem, (10) black torn scroll with a red flame silhouette, (11) dark blue book with a small moon and spiraling abyss decoration, (12) ivory rib-shaped armor charm surrounding a violet stone. Row4: (13) purple crystal mouth-shaped soul-devouring talisman with wisps, (14) dark ragged curse scroll with a thorn-wrapped eye but no writing, (15) blue-black chained ghost lantern holding green soul fire, (16) black hourglass with red sand and broken golden halo. Every icon must look DIFFERENT, no repeated simple book recolors.
```

### enemies-ascended-1.webp

项目路径：`public/assets/enemies-ascended-1.webp`。

```text
Use case: stylized-concept. Asset type: production Chinese xianxia survivors game transparent PNG sprite atlas. Rich detailed hand painted chibi fantasy creatures, 3/4 overhead game view, facing slightly down-left, full body including feet/tails/weapons, readable silhouettes at 64px. Real RGBA TRANSPARENT BACKGROUND, alpha zero outside creatures; NO painted checkerboard, no ground/background rectangles, no text, grid lines, labels or watermark. Even equal cells, each sprite centered in own cell with at least 12% clear margin on every side; never cross cell boundaries. Similar visual weight and consistent polished 2D painting across all sprites. 1536x1024 landscape, EXACTLY 4 columns and 2 rows, 8 characters in row-major order. Top row, frozen valley: 1 ice-crystal armored insect with six sharp legs, 2 blue-white crane spirit with swept wings and icy crest, 3 stocky armored frost golem with a square shield and single cyan core, 4 female-looking nonhuman snow wraith in flowing white silk holding a moon mirror. Bottom row, poisonous marsh: 5 massive emerald-black scorpion with curled stinger, 6 squat orange-eyed toad with dark moss and spore pouches, 7 tall green mantis with jade blade forearms, 8 dark violet snake spirit coiled around a bronze incense vessel. Eight distinct species and body plans; no wolves, mushrooms or generic purple hooded mage.
```

### enemies-ascended-2.webp

项目路径：`public/assets/enemies-ascended-2.webp`。

```text
Use case: stylized-concept. Asset type: production Chinese xianxia survivors game transparent PNG sprite atlas. Rich detailed hand painted chibi fantasy creatures, 3/4 overhead game view, facing slightly down-left, full body including feet/tails/weapons, readable silhouettes at 64px. Real RGBA TRANSPARENT BACKGROUND, alpha zero outside creatures; NO painted checkerboard, no ground/background rectangles, no text, grid lines, labels or watermark. Even equal cells, each sprite centered in own cell with at least 12% clear margin on every side; never cross cell boundaries. Similar visual weight and consistent polished 2D painting across all sprites. 1536x1024 landscape, EXACTLY 4 columns and 2 rows, 8 characters in row-major order. Top row, underworld: 1 bone-armored skeleton swordsman with blue ghost sword, 2 black and red iron prison executioner with a huge broken chain and cage helmet, 3 pale floating ghost official with a very tall white hat and jade soul lantern, 4 winged dark bat-demon with ruby heart and small horns. Bottom row, celestial heaven: 5 celestial armored gold-and-white spear guardian with bright blue face visor, 6 elegant silver star phoenix with a long split comet tail and spread compact wings, 7 floating ancient bronze celestial bell automaton with glowing amber core and tiny mechanical arms, 8 humanoid sage-like cosmic spirit made of indigo starlight wearing flowing white gold robes with a hovering astrolabe halo. Heavenly enemies feel powerful and divine, underworld enemies clearly undead. No mushrooms, wolves, mundane foxes, or recycled silhouettes.
```

### bosses-six.webp

项目路径：`public/assets/bosses-six.webp`。

```text
Use case: stylized-concept. Asset type: production Chinese xianxia survivors game transparent PNG sprite atlas. Rich detailed hand painted chibi fantasy creatures, 3/4 overhead game view, facing slightly down-left, full body including feet/tails/weapons, readable silhouettes at 64px. Real RGBA TRANSPARENT BACKGROUND, alpha zero outside creatures; NO painted checkerboard, no ground/background rectangles, no text, grid lines, labels or watermark. Even equal cells, each sprite centered in own cell with at least 12% clear margin on every side; never cross cell boundaries. Similar visual weight and consistent polished 2D painting across all sprites. 1536x1024 landscape, EXACTLY 3 columns and 2 rows, 6 distinct boss monsters. Each fits entirely in a 512x512 cell with 12% transparent margins. Top row: 1 giant ancient tree demon king with carved wooden face, deer-like branch crown, thick root arms and hanging jade vines; 2 regal blazing nine-tail red fox monarch, orange-gold flames and ornate red armor; 3 massive glacier-white wolf king with a towering ice crystal mane and silver armor. Bottom row: 4 enormous poisonous black tortoise-dragon lord with a purple jagged shell, emerald vapor and jade claws; 5 imposing underworld emperor with a bone crown, crimson-and-black imperial robes, four ghostly arms and ethereal violet ribbons; 6 celestial calamity deity with gold-white armor, radiant six-wing halo, blue cosmic skin, a large celestial wheel behind him and floating gold blades. Majestic boss designs, each unique body plan and face, high detail, fully visible, no scenery.
```

## 地面最终生成提示词

```text
Use case: stylized-concept. Asset type: seamless top-down 2D game ground texture for an elegant Chinese xianxia survivors game. Create a square texture seen from DIRECTLY OVERHEAD, orthographic view, with very understated painterly illustration of a weathered jade green temple courtyard reclaimed by moss. Large irregular slate stone paving, subtle cracks, delicate tiny fern and grass tufts, minute white flowers, darker mossy seams. Flat walkable surface filling entire image; consistent scale across entire image. Low contrast, muted sage, pine green, gray celadon and moss. Fine detailed hand painted videogame art, subtle paper grain, premium indie game art, soft ambient morning light. Seamlessly tileable all edges. Composition evenly distributed, mostly open stone ground with moss patches, no focal point, no horizon, no perspective, no vignette, NO CHARACTERS, NO buildings, NO text, NO interface, NO large objects, NO bright glowing objects. 1536x1536.
```

## 基础角色最终生成提示词

```text
Use case: stylized-concept. Asset type: transparent PNG sprite atlas for a top-down Chinese xianxia roguelite videogame. ONE image, exact regular 4-column by 2-row grid of 8 distinct isolated full-body game sprites, each centered in its equal size cell with generous transparent padding, sprites not touching cell edges, NO visible grid or labels. Actual TRANSPARENT background. Premium cute hand-painted 2.5D isometric/front top-down Chinese fantasy videogame art, detailed readable forms, jade teal, cream and muted earthy colors. Row 1 left to right: 1 young heroic male sword cultivator, long dark hair high bun gold hairpin, elegant white flowing robe with deep teal jade trim, holding a small sword, standing full body facing down-right. 2 cute crimson capped mushroom monster with small cream body and angry eyes. 3 fierce small indigo and cyan wolf spirit, walking facing down-left, fluffy turquoise mane. 4 floating jade green ghost fire spirit with two gold eyes and a flowing wispy tail. Row 2 left to right: 5 large antlered forest demon king, bark armor, turquoise jade horns, skull-like face, bulky muscular body, boss enemy. 6 small golden brown fox yokai with two tails. 7 purple black hooded little sorcerer spirit with a violet orb. 8 ancient green turtle monster with mossy rock shell. Consistent soft overhead ambient lighting and cohesive highly polished illustrative game sprite art. No typography, no drop shadow beyond tiny contact shadow, no background scene, no UI, no weapons or effects extending outside individual cell. The 8 sprites should each occupy 70 percent of cell width and 80 percent of cell height. 1536x1024.
```

## 独立妖物图集生成提示词

输入参考：`public/assets/characters.webp`，仅参考绘画风格。

```text
Use case: stylized-concept. The provided image is a STYLE REFERENCE ONLY for painterly Chinese xianxia game sprites. Create a completely NEW transparent PNG sprite atlas. EXACT 3 COLUMNS x 2 ROWS regular grid, 6 full-body separate sprites centered in each 512x512 cell on a 1536x1024 image, generous 12 percent transparent padding inside every cell. NO visible grid. Each creature must have a very distinct silhouette and recognizable personality, clearly different from the others and from existing reference characters. Match the reference premium highly detailed hand-painted 2.5D top-down/front angled chibi fantasy videogame rendering, beautiful readable textures, actual transparent background. Row 1 left to right: (1) explosive fire mushroom demon: jagged BLACK volcanic mushroom cap with hot orange glowing cracks, fiery orange body, embers emerging, angry expression, NOT a red spotted normal mushroom. (2) frostfang wolf: slender snow WHITE and pale ice BLUE wolf beast with sharp ice crystal spikes along spine and icy fangs, NOT an indigo wolf. (3) soul summoner: slim jade skeletal MASK face, tall black ceremonial Taoist hat with dangling paper charms, flowing WHITE ceremonial robes with dark navy trim, holding a ghost lantern in one hand and a spirit summoning banner in other, spectral pale mint aura, NO hood, NO purple robes, distinct from the small purple hooded sorcerer. Row 2 left to right: (4) poisonous marsh spirit: squat LIME GREEN toad-like slime demon with round glistening bulbous body and many small poison pods on its back, purple eyes and toxic droplets, NOT a floating green flame. (5) golden nine-tail phantom fox: elegant upright golden-white fox with NINE large clearly visible fanned-out tails and a red forehead jewel, long slim paws, NOT a two-tail ordinary orange fox. (6) netherworld emperor BOSS: tall menacing skeletal ghost king in ornate black, ivory and deep plum ceremonial armor and elaborate horned crown, glowing violet eyes, broad wing-like mantle, long spectral claw hands, dramatic silhouette, NOT the small hooded purple sorcerer. No text, no UI, no names, no backgrounds, no opaque colored backgrounds, no sprite overlaps, no clipped body parts. Preserve actual alpha transparency. 1536x1024.
```

## 独立图集最终透明通道修正提示词

首次生成中透明棋盘被画入图像，使用同一内置工具清除背景，保留六种造型。项目只保留修正后的最终素材。

```text
Use case: background-extraction. EDIT THIS EXACT ATLAS. Keep all six character illustrations, positions, sizes, colors, details and 3 columns x 2 rows layout EXACTLY unchanged. Remove the entire gray-and-white checkerboard background, including checkerboard visible through translucent glows, and output a PNG with REAL ALPHA TRANSPARENCY. The checkerboard in the source is incorrectly painted into an opaque RGB image. It MUST be replaced with genuine alpha=0 background pixels, not drawn checkerboard, not white, not black. Preserve clean character silhouettes with antialiased transparent edges. Do not redraw or rearrange any creature. Canvas stays 1536x1024. Actual transparent background required.
```

## 各秘境独立地面

青岚竹海沿用 `terrain.webp`；其余五境由内置工具分别生成独立纹理，均为 1254 × 1254 PNG，保存于 `public/assets/`。关卡通过 `src/data.ts` 的 `terrain` 字段选择实际背景，战斗和选关预览共用。

### terrain-ruins.webp

```text
Use case: stylized-concept. Asset type: one square seamless terrain texture for a top-down Chinese xianxia survivors game, 1024x1024. Strict directly overhead orthographic camera, flat walkable ground filling the entire image. Premium detailed hand-painted 2D videogame environment art. Evenly distributed material detail with generous open areas; no central focal point, no border, no vignette, no horizon or perspective. All four edges seamlessly tileable. Moderate subdued contrast so small characters, aqua XP crystals and red attack telegraphs remain easy to see. NO characters, monsters, UI, text, letters, watermarks, structures viewed from the side, tall foreground objects, opaque fog, or bright dots resembling loot. A ruined ancient Chinese temple courtyard at sunset. Warm dusty terracotta stone paving and weathered sandstone slabs, broken geometric floor mosaics and faint ornamental carvings, fine sand in cracks, scattered russet maple leaves, small fragments of fallen roof tiles embedded flush with the ground. Muted copper, ochre, warm taupe; material is clearly a red stone archaeological ruin, NOT green forest or moss.
```

### terrain-ice.webp

```text
Use case: stylized-concept. Asset type: one square seamless terrain texture for a top-down Chinese xianxia survivors game, 1024x1024. Strict directly overhead orthographic camera, flat walkable ground filling the entire image. Premium detailed hand-painted 2D videogame environment art. Evenly distributed material detail with generous open areas; no central focal point, no border, no vignette, no horizon or perspective. All four edges seamlessly tileable. Moderate subdued contrast so small characters, aqua XP crystals and red attack telegraphs remain easy to see. NO characters, monsters, UI, text, letters, watermarks, structures viewed from the side, tall foreground objects, opaque fog, or bright dots resembling loot. An ancient frozen mountain valley ground. Blue-gray slate beneath translucent fractured ice plates, thin soft snow drifts, small low frost crystals, delicate frost fern patterns and scattered dark pebbles. Muted steel blue, cool gray, pale icy cyan, medium brightness, avoid pure white glare. Organic ice fissures and snow edges, distinctly a snowy frozen landscape, not recolored green courtyard.
```

### terrain-marsh.webp

```text
Use case: stylized-concept. Asset type: one square seamless terrain texture for a top-down Chinese xianxia survivors game, 1024x1024. Strict directly overhead orthographic camera, flat walkable ground filling the entire image. Premium detailed hand-painted 2D videogame environment art. Evenly distributed material detail with generous open areas; no central focal point, no border, no vignette, no horizon or perspective. All four edges seamlessly tileable. Moderate subdued contrast so small characters, aqua XP crystals and red attack telegraphs remain easy to see. NO characters, monsters, UI, text, letters, watermarks, structures viewed from the side, tall foreground objects, opaque fog, or bright dots resembling loot. A poisonous misty wetland floor. Uneven dark peat mud, shallow olive and deep teal stagnant puddles with soft ripple rings, tangled flat roots, tiny dull purple fungi and short moss clumps, scattered reeds along small pools. Earthy olive, muted plum, dark khaki, desaturated jade. Clearly muddy organic swamp with water and roots, no paving, no large inaccessible lake, no tall vegetation, no luminous green neon.
```

### terrain-nether.webp

```text
Use case: stylized-concept. Asset type: one square seamless terrain texture for a top-down Chinese xianxia survivors game, 1024x1024. Strict directly overhead orthographic camera, flat walkable ground filling the entire image. Premium detailed hand-painted 2D videogame environment art. Evenly distributed material detail with generous open areas; no central focal point, no border, no vignette, no horizon or perspective. All four edges seamlessly tileable. Moderate subdued contrast so small characters, aqua XP crystals and red attack telegraphs remain easy to see. NO characters, monsters, UI, text, letters, watermarks, structures viewed from the side, tall foreground objects, opaque fog, or bright dots resembling loot. A ghostly underworld burial plain. Irregular dark charcoal and muted violet basalt ground, winding ashen seams, shallow etched spirals on ancient fractured grave-stone fragments embedded into soil, small worn pale bone fragments and dried crooked roots, faint smoke wisps. Slate, smoky indigo, ash gray, low-key violet. Clearly barren haunted obsidian earth, NOT tiled green courtyard, no glowing red cracks that resemble damage zones, no bright sigils, no prominent skull centerpiece.
```

### terrain-heaven.webp

```text
Use case: stylized-concept. Asset type: one square seamless terrain texture for a top-down Chinese xianxia survivors game, 1024x1024. Strict directly overhead orthographic camera, flat walkable ground filling the entire image. Premium detailed hand-painted 2D videogame environment art. Evenly distributed material detail with generous open areas; no central focal point, no border, no vignette, no horizon or perspective. All four edges seamlessly tileable. Moderate subdued contrast so small characters, aqua XP crystals and red attack telegraphs remain easy to see. NO characters, monsters, UI, text, letters, watermarks, structures viewed from the side, tall foreground objects, opaque fog, or bright dots resembling loot. A celestial Chinese immortal palace terrace among the clouds. Cool pearl-gray and pale blue jade floor slabs with thin understated aged-gold inlay geometric filigree, shallow lotus carvings, small patches of translucent cloud wisps drifting over the surface. Elegant broad stone planes in varied rectangular shapes, medium-light brightness, soft heavenly ambiance. Clearly refined celestial architecture viewed strictly from overhead, no raised walls, no cliff edges, no central medallion, no pure white glare.
```

## 天劫首领（2026-09-19）

`public/assets/boss-tribulation.webp` 为本次通过 imagegen 生成的独立透明立绘，1254 × 1254 RGBA，Sprite 81。紫色劫云凝成雷霆巨人，白金雷面与破碎冠环；用于每两万年的独立天劫，不替换第七境仙尊。使用原图，未裁切或重新采样。渡劫场复用终关地形并绘制可见边界、护盾和核心状态。
