# 素材与生成提示词

全部位图由内置 `image_gen.imagegen` 工具生成，未使用 CLI/API 回退。最终素材均已保存进项目：

| 文件                                 | 用途                                | 规格                  |
| ------------------------------------ | ----------------------------------- | --------------------- |
| `public/assets/terrain.png`          | 可重复铺设的苔石地面                | 1254 × 1254           |
| `public/assets/characters.png`       | 主角及基础妖物，4 列 × 2 行         | 1536 × 1024，透明 PNG |
| `public/assets/enemies-distinct.png` | 独立妖物变体与九幽冥主，3 列 × 2 行 | 1536 × 1024，透明 PNG |

法宝图标和法术特效使用项目内 SVG / Canvas 绘制。新妖物图集与基础图集的裁切定义统一在 `src/sprites.ts`，图鉴与战斗共用，避免映射不一致。

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
