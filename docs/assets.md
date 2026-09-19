# 素材与生成提示词

全部位图由内置 `image_gen.imagegen` 工具生成，未使用 CLI/API 回退。最终素材均已保存进项目：

| 文件                                 | 用途                                | 规格                  |
| ------------------------------------ | ----------------------------------- | --------------------- |
| `public/assets/terrain.png`          | 可重复铺设的苔石地面                | 1254 × 1254           |
| `public/assets/characters.png`       | 主角及基础妖物，4 列 × 2 行         | 1536 × 1024，透明 PNG |
| `public/assets/enemies-distinct.png` | 独立妖物变体与九幽冥主，3 列 × 2 行 | 1536 × 1024，透明 PNG |

法宝与功法图标统一使用生成图集，法术特效使用 Canvas 绘制。妖物图集的裁切定义统一在 `src/sprites.ts`，图鉴与战斗共用，避免映射不一致。

## 扩展图集：法宝、功法与高阶妖物

均通过内置 `image_gen.imagegen` 生成。法宝图集 1–3 为 1448 × 1086、4 列 × 3 行；功法图集为 1254 × 1254、4 列 × 4 行。所有法宝和功法图标统一读取图片，不再使用 SVG 物品图标。物品按 `TREASURES` / `PASSIVES` 顺序映射，见 `src/item-art.ts`。

高阶妖物图集 1–2 为 1536 × 1024、4 列 × 2 行；六境妖王为 1536 × 1024、3 列 × 2 行。三个角色图集保留真实 alpha 通道，使用 `src/sprites.ts` 的统一映射，战斗与妖物志共用。已有角色图集继续保留，保证旧存档和旧妖物可用。

### treasures-1.png

项目路径：`public/assets/treasures-1.png`。

```text
Use case: stylized-concept. Asset type: a polished Chinese xianxia game INVENTORY ICON ATLAS. One image, EXACT regular 4 columns by 3 rows, TWELVE different isolated inventory artifacts, centered in equal cells with generous 18 percent inner padding. Landscape 1536x1152. No visible grid, no borders, no labels, NO TEXT OR CHARACTERS. Uniform flat deep jade-green #12352d background everywhere, NOT transparent and NOT checkerboard. Each object is an exquisite detailed hand-painted 2.5D fantasy inventory illustration, consistent angled overhead view, delicate gilt and jade decoration, soft controlled rim light, highly readable silhouette. Each object entirely contained in its own cell, nothing touches cell boundaries. Cohesive premium Chinese fantasy RPG art. Make every object visually distinct. ORDER STRICTLY row major left to right: Row 1: (1) long elegant azure jade straight sword with a golden hilt, (2) green lotus lantern with turquoise petals and glowing golden center, (3) purple thunder talisman made of paper with a tiny lightning arc but no lettering, (4) ornate bronze temple bell. Row 2: (5) green double-gourd poison flask, (6) round icy silver mirror surrounded by snowflake crystals, (7) orange fire pearl inside a delicate gold flame frame, (8) broad pale green palm-leaf fan. Row 3: (9) crimson crescent bladed metal wheel, (10) curved golden star bow with one bright arrow, (11) square heavy bronze seal with carved mountain-shaped handle, (12) coiled golden rope with hooked jade ends.
```

### treasures-2.png

项目路径：`public/assets/treasures-2.png`。

```text
Use case: stylized-concept. Asset type: a polished Chinese xianxia game INVENTORY ICON ATLAS. One image, EXACT regular 4 columns by 3 rows, TWELVE different isolated inventory artifacts, centered in equal cells with generous 18 percent inner padding. Landscape 1536x1152. No visible grid, no borders, no labels, NO TEXT OR CHARACTERS. Uniform flat deep jade-green #12352d background everywhere, NOT transparent and NOT checkerboard. Each object is an exquisite detailed hand-painted 2.5D fantasy inventory illustration, consistent angled overhead view, delicate gilt and jade decoration, soft controlled rim light, highly readable silhouette. Each object entirely contained in its own cell, nothing touches cell boundaries. Cohesive premium Chinese fantasy RPG art. Make every object visually distinct. ORDER STRICTLY row major left to right: Row 1: (1) circular yin-yang jade formation disk in black ivory and silver, (2) dark purple ghost banner on a slender staff, (3) aqua ocean pearl cradled by waves, (4) ornate long gold dragon-shaped ruler. Row 2: (5) horizontal green jade seven-string guqin zither, (6) large ivory-and-gold calligraphy brush with dark ink bristles, (7) seven-tier small golden Chinese pagoda, (8) three small green formation flags arranged as a triangular cluster. Row 3: (9) round bronze three-legged medicinal cauldron with small pale green herbal vapor, (10) long jade bamboo flute with red tassel, (11) loop of golden wooden Buddhist prayer beads with a jade bead, (12) intricate dark blue brass astronomical compass with tiny star inlays.
```

### treasures-3.png

项目路径：`public/assets/treasures-3.png`。

```text
Use case: stylized-concept. Asset type: a polished Chinese xianxia game INVENTORY ICON ATLAS. One image, EXACT regular 4 columns by 3 rows, TWELVE different isolated inventory artifacts, centered in equal cells with generous 18 percent inner padding. Landscape 1536x1152. No visible grid, no borders, no labels, NO TEXT OR CHARACTERS. Uniform flat deep jade-green #12352d background everywhere, NOT transparent and NOT checkerboard. Each object is an exquisite detailed hand-painted 2.5D fantasy inventory illustration, consistent angled overhead view, delicate gilt and jade decoration, soft controlled rim light, highly readable silhouette. Each object entirely contained in its own cell, nothing touches cell boundaries. Cohesive premium Chinese fantasy RPG art. Make every object visually distinct. ORDER STRICTLY row major left to right: Row 1: (1) open pale blue Chinese oil-paper umbrella with white cloud patterns, (2) long straight gold spear with a broad jade pointed head, (3) black and purple crescent scythe with a curved bone shaft, (4) three sharp crimson dark-metal throwing nails. Row 2: (5) closed dark plum ornate coffin with pale bone trim, (6) flexible coiling red-scaled whip with gold handle, (7) small ivory skull crowned with black horns and violet eyes, (8) crimson chalice with a dark silver stem and swirling red liquid. Row 3: (9) organic green beetle nest pod with amber eggs, (10) jagged purple broken mirror radiating separate mirror shards, (11) huge double-edged bronze battle axe with ancient green patina, (12) a small open blue silk pouch spilling bright silver star-shaped grains of sand.
```

### cultivation-manuals.png

项目路径：`public/assets/cultivation-manuals.png`。

```text
Use case: stylized-concept. Asset type: Chinese xianxia game CULTIVATION MANUAL ICON ATLAS. EXACT regular 4 columns by 4 rows of SIXTEEN different distinct isolated cultivation books or ritual objects, 1536x1536 square. Each centered in equal cell with generous 18 percent padding. Flat opaque dark jade-green #12352d background, NO grid, NO labels, NO text, NO letters, NO checkerboard. Exquisite hand-painted 2.5D fantasy inventory art matching gold and jade Chinese RPG artifacts, readable detailed silhouettes, controlled magical aura contained within cell. Upper two rows are righteous, lower two rows are sinister but tasteful. Strict row major: Row1: (1) ivory closed sword manual with gold sword-shaped emblem, (2) blue folded star chart with seven gold stars, (3) pale jade open scroll displaying a circular geometric world diagram without writing, (4) gold shield-shaped jade amulet with a protective glowing center. Row2: (5) green herbal book sprouting a delicate vine, (6) golden eye-shaped pendant with a red gemstone pupil, (7) turquoise spiral-shaped vessel drawing in three small cyan pearls, (8) purple jade miniature palace-shaped scripture case. Row3: (9) dark crimson book bound by three red cords with a blood-drop gem, (10) black torn scroll with a red flame silhouette, (11) dark blue book with a small moon and spiraling abyss decoration, (12) ivory rib-shaped armor charm surrounding a violet stone. Row4: (13) purple crystal mouth-shaped soul-devouring talisman with wisps, (14) dark ragged curse scroll with a thorn-wrapped eye but no writing, (15) blue-black chained ghost lantern holding green soul fire, (16) black hourglass with red sand and broken golden halo. Every icon must look DIFFERENT, no repeated simple book recolors.
```

### enemies-ascended-1.png

项目路径：`public/assets/enemies-ascended-1.png`。

```text
Use case: stylized-concept. Asset type: production Chinese xianxia survivors game transparent PNG sprite atlas. Rich detailed hand painted chibi fantasy creatures, 3/4 overhead game view, facing slightly down-left, full body including feet/tails/weapons, readable silhouettes at 64px. Real RGBA TRANSPARENT BACKGROUND, alpha zero outside creatures; NO painted checkerboard, no ground/background rectangles, no text, grid lines, labels or watermark. Even equal cells, each sprite centered in own cell with at least 12% clear margin on every side; never cross cell boundaries. Similar visual weight and consistent polished 2D painting across all sprites. 1536x1024 landscape, EXACTLY 4 columns and 2 rows, 8 characters in row-major order. Top row, frozen valley: 1 ice-crystal armored insect with six sharp legs, 2 blue-white crane spirit with swept wings and icy crest, 3 stocky armored frost golem with a square shield and single cyan core, 4 female-looking nonhuman snow wraith in flowing white silk holding a moon mirror. Bottom row, poisonous marsh: 5 massive emerald-black scorpion with curled stinger, 6 squat orange-eyed toad with dark moss and spore pouches, 7 tall green mantis with jade blade forearms, 8 dark violet snake spirit coiled around a bronze incense vessel. Eight distinct species and body plans; no wolves, mushrooms or generic purple hooded mage.
```

### enemies-ascended-2.png

项目路径：`public/assets/enemies-ascended-2.png`。

```text
Use case: stylized-concept. Asset type: production Chinese xianxia survivors game transparent PNG sprite atlas. Rich detailed hand painted chibi fantasy creatures, 3/4 overhead game view, facing slightly down-left, full body including feet/tails/weapons, readable silhouettes at 64px. Real RGBA TRANSPARENT BACKGROUND, alpha zero outside creatures; NO painted checkerboard, no ground/background rectangles, no text, grid lines, labels or watermark. Even equal cells, each sprite centered in own cell with at least 12% clear margin on every side; never cross cell boundaries. Similar visual weight and consistent polished 2D painting across all sprites. 1536x1024 landscape, EXACTLY 4 columns and 2 rows, 8 characters in row-major order. Top row, underworld: 1 bone-armored skeleton swordsman with blue ghost sword, 2 black and red iron prison executioner with a huge broken chain and cage helmet, 3 pale floating ghost official with a very tall white hat and jade soul lantern, 4 winged dark bat-demon with ruby heart and small horns. Bottom row, celestial heaven: 5 celestial armored gold-and-white spear guardian with bright blue face visor, 6 elegant silver star phoenix with a long split comet tail and spread compact wings, 7 floating ancient bronze celestial bell automaton with glowing amber core and tiny mechanical arms, 8 humanoid sage-like cosmic spirit made of indigo starlight wearing flowing white gold robes with a hovering astrolabe halo. Heavenly enemies feel powerful and divine, underworld enemies clearly undead. No mushrooms, wolves, mundane foxes, or recycled silhouettes.
```

### bosses-six.png

项目路径：`public/assets/bosses-six.png`。

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

输入参考：`public/assets/characters.png`，仅参考绘画风格。

```text
Use case: stylized-concept. The provided image is a STYLE REFERENCE ONLY for painterly Chinese xianxia game sprites. Create a completely NEW transparent PNG sprite atlas. EXACT 3 COLUMNS x 2 ROWS regular grid, 6 full-body separate sprites centered in each 512x512 cell on a 1536x1024 image, generous 12 percent transparent padding inside every cell. NO visible grid. Each creature must have a very distinct silhouette and recognizable personality, clearly different from the others and from existing reference characters. Match the reference premium highly detailed hand-painted 2.5D top-down/front angled chibi fantasy videogame rendering, beautiful readable textures, actual transparent background. Row 1 left to right: (1) explosive fire mushroom demon: jagged BLACK volcanic mushroom cap with hot orange glowing cracks, fiery orange body, embers emerging, angry expression, NOT a red spotted normal mushroom. (2) frostfang wolf: slender snow WHITE and pale ice BLUE wolf beast with sharp ice crystal spikes along spine and icy fangs, NOT an indigo wolf. (3) soul summoner: slim jade skeletal MASK face, tall black ceremonial Taoist hat with dangling paper charms, flowing WHITE ceremonial robes with dark navy trim, holding a ghost lantern in one hand and a spirit summoning banner in other, spectral pale mint aura, NO hood, NO purple robes, distinct from the small purple hooded sorcerer. Row 2 left to right: (4) poisonous marsh spirit: squat LIME GREEN toad-like slime demon with round glistening bulbous body and many small poison pods on its back, purple eyes and toxic droplets, NOT a floating green flame. (5) golden nine-tail phantom fox: elegant upright golden-white fox with NINE large clearly visible fanned-out tails and a red forehead jewel, long slim paws, NOT a two-tail ordinary orange fox. (6) netherworld emperor BOSS: tall menacing skeletal ghost king in ornate black, ivory and deep plum ceremonial armor and elaborate horned crown, glowing violet eyes, broad wing-like mantle, long spectral claw hands, dramatic silhouette, NOT the small hooded purple sorcerer. No text, no UI, no names, no backgrounds, no opaque colored backgrounds, no sprite overlaps, no clipped body parts. Preserve actual alpha transparency. 1536x1024.
```

## 独立图集最终透明通道修正提示词

首次生成中透明棋盘被画入图像，使用同一内置工具清除背景，保留六种造型。项目只保留修正后的最终素材。

```text
Use case: background-extraction. EDIT THIS EXACT ATLAS. Keep all six character illustrations, positions, sizes, colors, details and 3 columns x 2 rows layout EXACTLY unchanged. Remove the entire gray-and-white checkerboard background, including checkerboard visible through translucent glows, and output a PNG with REAL ALPHA TRANSPARENCY. The checkerboard in the source is incorrectly painted into an opaque RGB image. It MUST be replaced with genuine alpha=0 background pixels, not drawn checkerboard, not white, not black. Preserve clean character silhouettes with antialiased transparent edges. Do not redraw or rearrange any creature. Canvas stays 1536x1024. Actual transparent background required.
```

## 各秘境独立地面

青岚竹海沿用 `terrain.png`；其余五境由内置工具分别生成独立纹理，均为 1254 × 1254 PNG，保存于 `public/assets/`。关卡通过 `src/data.ts` 的 `terrain` 字段选择实际背景，战斗和选关预览共用。

### terrain-ruins.png

```text
Use case: stylized-concept. Asset type: one square seamless terrain texture for a top-down Chinese xianxia survivors game, 1024x1024. Strict directly overhead orthographic camera, flat walkable ground filling the entire image. Premium detailed hand-painted 2D videogame environment art. Evenly distributed material detail with generous open areas; no central focal point, no border, no vignette, no horizon or perspective. All four edges seamlessly tileable. Moderate subdued contrast so small characters, aqua XP crystals and red attack telegraphs remain easy to see. NO characters, monsters, UI, text, letters, watermarks, structures viewed from the side, tall foreground objects, opaque fog, or bright dots resembling loot. A ruined ancient Chinese temple courtyard at sunset. Warm dusty terracotta stone paving and weathered sandstone slabs, broken geometric floor mosaics and faint ornamental carvings, fine sand in cracks, scattered russet maple leaves, small fragments of fallen roof tiles embedded flush with the ground. Muted copper, ochre, warm taupe; material is clearly a red stone archaeological ruin, NOT green forest or moss.
```

### terrain-ice.png

```text
Use case: stylized-concept. Asset type: one square seamless terrain texture for a top-down Chinese xianxia survivors game, 1024x1024. Strict directly overhead orthographic camera, flat walkable ground filling the entire image. Premium detailed hand-painted 2D videogame environment art. Evenly distributed material detail with generous open areas; no central focal point, no border, no vignette, no horizon or perspective. All four edges seamlessly tileable. Moderate subdued contrast so small characters, aqua XP crystals and red attack telegraphs remain easy to see. NO characters, monsters, UI, text, letters, watermarks, structures viewed from the side, tall foreground objects, opaque fog, or bright dots resembling loot. An ancient frozen mountain valley ground. Blue-gray slate beneath translucent fractured ice plates, thin soft snow drifts, small low frost crystals, delicate frost fern patterns and scattered dark pebbles. Muted steel blue, cool gray, pale icy cyan, medium brightness, avoid pure white glare. Organic ice fissures and snow edges, distinctly a snowy frozen landscape, not recolored green courtyard.
```

### terrain-marsh.png

```text
Use case: stylized-concept. Asset type: one square seamless terrain texture for a top-down Chinese xianxia survivors game, 1024x1024. Strict directly overhead orthographic camera, flat walkable ground filling the entire image. Premium detailed hand-painted 2D videogame environment art. Evenly distributed material detail with generous open areas; no central focal point, no border, no vignette, no horizon or perspective. All four edges seamlessly tileable. Moderate subdued contrast so small characters, aqua XP crystals and red attack telegraphs remain easy to see. NO characters, monsters, UI, text, letters, watermarks, structures viewed from the side, tall foreground objects, opaque fog, or bright dots resembling loot. A poisonous misty wetland floor. Uneven dark peat mud, shallow olive and deep teal stagnant puddles with soft ripple rings, tangled flat roots, tiny dull purple fungi and short moss clumps, scattered reeds along small pools. Earthy olive, muted plum, dark khaki, desaturated jade. Clearly muddy organic swamp with water and roots, no paving, no large inaccessible lake, no tall vegetation, no luminous green neon.
```

### terrain-nether.png

```text
Use case: stylized-concept. Asset type: one square seamless terrain texture for a top-down Chinese xianxia survivors game, 1024x1024. Strict directly overhead orthographic camera, flat walkable ground filling the entire image. Premium detailed hand-painted 2D videogame environment art. Evenly distributed material detail with generous open areas; no central focal point, no border, no vignette, no horizon or perspective. All four edges seamlessly tileable. Moderate subdued contrast so small characters, aqua XP crystals and red attack telegraphs remain easy to see. NO characters, monsters, UI, text, letters, watermarks, structures viewed from the side, tall foreground objects, opaque fog, or bright dots resembling loot. A ghostly underworld burial plain. Irregular dark charcoal and muted violet basalt ground, winding ashen seams, shallow etched spirals on ancient fractured grave-stone fragments embedded into soil, small worn pale bone fragments and dried crooked roots, faint smoke wisps. Slate, smoky indigo, ash gray, low-key violet. Clearly barren haunted obsidian earth, NOT tiled green courtyard, no glowing red cracks that resemble damage zones, no bright sigils, no prominent skull centerpiece.
```

### terrain-heaven.png

```text
Use case: stylized-concept. Asset type: one square seamless terrain texture for a top-down Chinese xianxia survivors game, 1024x1024. Strict directly overhead orthographic camera, flat walkable ground filling the entire image. Premium detailed hand-painted 2D videogame environment art. Evenly distributed material detail with generous open areas; no central focal point, no border, no vignette, no horizon or perspective. All four edges seamlessly tileable. Moderate subdued contrast so small characters, aqua XP crystals and red attack telegraphs remain easy to see. NO characters, monsters, UI, text, letters, watermarks, structures viewed from the side, tall foreground objects, opaque fog, or bright dots resembling loot. A celestial Chinese immortal palace terrace among the clouds. Cool pearl-gray and pale blue jade floor slabs with thin understated aged-gold inlay geometric filigree, shallow lotus carvings, small patches of translucent cloud wisps drifting over the surface. Elegant broad stone planes in varied rectangular shapes, medium-light brightness, soft heavenly ambiance. Clearly refined celestial architecture viewed strictly from overhead, no raised walls, no cliff edges, no central medallion, no pure white glare.
```
