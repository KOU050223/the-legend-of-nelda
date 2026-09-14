from PIL import Image
import math, random

W, H = 320, 180
im = Image.new('RGB', (W, H))
px = im.load()

BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
]

def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))

# --- 空: 上から下へのグラデーションを Bayer でディザして retro 感を出す
SKY_TOP = (58, 150, 214)
SKY_MID = (120, 198, 232)
SKY_LOW = (198, 232, 240)
SKY_STEPS = 6
sky_band = []
for i in range(SKY_STEPS):
    t = i / (SKY_STEPS - 1)
    sky_band.append(lerp(SKY_TOP, SKY_MID, t / 0.55) if t < 0.55
                    else lerp(SKY_MID, SKY_LOW, (t - 0.55) / 0.45))

for y in range(H):
    t = y / (H - 1)
    pos = t * (SKY_STEPS - 1)
    i = min(SKY_STEPS - 2, int(pos))
    frac = pos - i
    base, nxt = sky_band[i], sky_band[i + 1]
    for x in range(W):
        # 段の境目だけ 4x4 の閾値で2色を混ぜ、帯の切れ目をぼかす
        th = BAYER[y % 4][x % 4] / 16
        px[x, y] = nxt if frac > th else base

def fill_poly(points, color, y_from=0):
    """多角形を走査線で塗る。ドット絵なのでアンチエイリアスはしない。"""
    ys = [p[1] for p in points]
    for y in range(max(y_from, min(ys)), min(H, max(ys) + 1)):
        xs = []
        n = len(points)
        for i in range(n):
            x1, y1 = points[i]
            x2, y2 = points[(i + 1) % n]
            if y1 == y2:
                continue
            if min(y1, y2) <= y < max(y1, y2):
                xs.append(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
        xs.sort()
        for i in range(0, len(xs) - 1, 2):
            for x in range(max(0, int(xs[i])), min(W, int(xs[i + 1]) + 1)):
                px[x, y] = color

def ridge_points(seed, base_y, amp, step, jag):
    """尾根の折れ線。山ごとに高さと幅を変え、同じ形が並ばないようにする。"""
    rnd = random.Random(seed)
    pts = [(0, H), (0, base_y)]
    x = 0
    up = True
    while x < W:
        if up:
            dx = rnd.randint(step, int(step * 2.1))
            # たまに低い山を挟んで、峰の高さを揃えない
            high = rnd.random() < 0.55
            y = base_y - (rnd.randint(int(amp * 0.62), amp) if high
                          else rnd.randint(int(amp * 0.2), int(amp * 0.5)))
        else:
            dx = rnd.randint(step // 2, step)
            y = base_y + rnd.randint(-jag // 2, jag)
        x = min(W, x + dx)
        pts.append((x, max(4, y)))
        up = not up
    pts.append((W, base_y))
    pts.append((W, H))
    return pts

# --- 遠景の雪山
FAR = (150, 186, 208)
SNOW = (226, 240, 246)
far = ridge_points(7, 104, 46, 30, 8)
fill_poly(far, FAR)

# 雪冠: 各列の稜線の高さを見て、高いところほど厚く白を積む
top_y = {}
for x in range(W):
    for y in range(H):
        if px[x, y] == FAR:
            top_y[x] = y
            break
if top_y:
    peak = min(top_y.values())
    for x, ty in top_y.items():
        # 峰から 26px 下までを雪の範囲とし、高い列ほど深く塗る
        depth = int((1 - (ty - peak) / 26) * 11)
        for d in range(max(0, depth)):
            if ty + d < H and px[x, ty + d] == FAR:
                px[x, ty + d] = SNOW
    # 雪の下端をギザつかせて、境界が直線にならないようにする
    rnd = random.Random(99)
    for x in range(W):
        if x not in top_y:
            continue
        for y in range(H - 1, 0, -1):
            if px[x, y] == SNOW:
                if rnd.random() < 0.5:
                    px[x, y] = FAR
                break

# --- 中景の青緑の尾根
mid = ridge_points(21, 128, 34, 28, 7)
fill_poly(mid, (96, 150, 142), y_from=60)
for x in range(W):
    for y in range(60, H):
        if px[x, y] == (96, 150, 142):
            for d in range(3):
                if y + d < H and px[x, y + d] == (96, 150, 142):
                    px[x, y + d] = (128, 178, 160)
            break

# --- 前景の濃い緑
near = ridge_points(43, 152, 26, 22, 6)
fill_poly(near, (46, 96, 64), y_from=90)
for x in range(W):
    for y in range(90, H):
        if px[x, y] == (46, 96, 64):
            for d in range(3):
                if y + d < H and px[x, y + d] == (46, 96, 64):
                    px[x, y + d] = (74, 132, 78)
            break

# --- 左下の崖: 勇者を立たせる足場
CLIFF = (163, 138, 104)
CLIFF_TOP = (206, 190, 150)
CLIFF_DARK = (96, 76, 58)
CLIFF_GRASS = (108, 166, 88)
cliff = [(0, H), (0, 140), (16, 135), (44, 133), (70, 136), (88, 142), (100, 152), (106, H)]
fill_poly(cliff, CLIFF, y_from=120)
for x in range(0, 110):
    for y in range(120, H):
        if px[x, y] == CLIFF:
            for d in range(4):
                if y + d < H and px[x, y + d] == CLIFF:
                    px[x, y + d] = CLIFF_TOP
            break
# 岩の天面の上端に草を乗せる (元ネタの崖と同じ作り)
rnd_g = random.Random(5)
for x in range(0, 110):
    for y in range(120, H):
        if px[x, y] == CLIFF_TOP:
            for d in range(rnd_g.choice((1, 2, 2, 3))):
                if y + d < H and px[x, y + d] == CLIFF_TOP:
                    px[x, y + d] = CLIFF_GRASS
            break

# 崖の下側に影を落として厚みを出す
for x in range(0, 110):
    col = [y for y in range(130, H) if px[x, y] in (CLIFF, CLIFF_TOP)]
    if col:
        for y in col[-10:]:
            if px[x, y] == CLIFF:
                px[x, y] = CLIFF_DARK

# --- 雲: 角の立った塊で描く
def cloud(cx, cy, scale, color=(245, 250, 252)):
    blobs = [(-14, 2, 7), (-6, -2, 9), (4, -4, 10), (13, 0, 8), (20, 3, 6)]
    for bx, by, br in blobs:
        r = max(2, int(br * scale))
        ox, oy = cx + int(bx * scale), cy + int(by * scale)
        for y in range(oy - r, oy + r + 1):
            for x in range(ox - r, ox + r + 1):
                if 0 <= x < W and 0 <= y < H:
                    if (x - ox) ** 2 + ((y - oy) * 1.6) ** 2 <= r * r:
                        if y < 118:
                            px[x, y] = color

cloud(52, 30, 1.15)
cloud(150, 20, 0.9)
cloud(246, 36, 1.25)
cloud(300, 16, 0.8)
cloud(196, 58, 0.7, (232, 243, 248))
cloud(96, 62, 0.6, (232, 243, 248))

# --- 鳥: v の字を数羽
for bx, by in ((176, 44), (186, 38), (196, 46), (208, 40)):
    for dx, dy in ((-2, -1), (-1, 0), (0, 1), (1, 0), (2, -1)):
        x, y = bx + dx, by + dy
        if 0 <= x < W and 0 <= y < H:
            px[x, y] = (68, 84, 96)

# 全体を1つのパレットへ寄せてドット絵として締める
# 使っている色をそのまま残す。MEDIANCUT に任せると岩の色が緑へ寄るため、
# 出現色をパレットとして与えて量子化する。
used = sorted({px[x, y] for y in range(H) for x in range(W)})
pal = Image.new('P', (1, 1))
flat = [v for c in used for v in c][: 256 * 3]
pal.putpalette(flat + [0] * (768 - len(flat)))
im = im.quantize(palette=pal, dither=Image.NONE).convert('RGB')
print('colors', len(used))
im.save('/private/tmp/claude-501/-Users-uozumikouhei-orca-workspaces-the-legend-of-nelda-feat-title-page/d6ab8b5b-0522-4bde-bde5-3086212f2ba9/scratchpad/bg.png')
im.resize((W * 4, H * 4), Image.NEAREST).save('/private/tmp/claude-501/-Users-uozumikouhei-orca-workspaces-the-legend-of-nelda-feat-title-page/d6ab8b5b-0522-4bde-bde5-3086212f2ba9/scratchpad/bg-preview.png')
print('ok')
