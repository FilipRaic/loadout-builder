"""Generate seamless (tileable) 512x512 swatches for patterns that aren't extracted from photos:
recreations of real camo patterns (using their published colour palettes and characteristic
shapes) and everyday fabrics (denim, checks, plaid, tweed ...).

Every noise field is made by filtering white noise in the Fourier domain and every stripe or
check period divides 512, so all swatches tile without seams.
Entries are merged into assets/patterns/patterns.json; patterns made by
tools/extract_patterns.py are kept.

Usage: python tools/build_patterns.py
"""
import json, os
import numpy as np, cv2
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PD = os.path.join(ROOT, 'assets', 'patterns')
os.makedirs(PD, exist_ok=True)
N = 512
rng = np.random.default_rng(7)
yy, xx = np.mgrid[0:N, 0:N]

def field(scale, aniso=(1.0, 1.0), seed=None):
    r = np.random.default_rng(seed)
    wn = r.standard_normal((N, N))
    fy = np.fft.fftfreq(N)[:, None] * aniso[0]; fx = np.fft.fftfreq(N)[None, :] * aniso[1]
    out = np.real(np.fft.ifft2(np.fft.fft2(wn) * np.exp(-(fx ** 2 + fy ** 2) * (np.pi * scale) ** 2 / 2)))
    return (out - out.mean()) / (out.std() + 1e-9)

def blobs(scale, detail=0.35, seed=0, aniso=(1, 1)):
    return field(scale, aniso, seed) + detail * field(scale / 3.5, aniso, seed + 1000)

def hexrgb(h): h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float64)
def q(f, frac): return f > np.quantile(f, 1 - frac)

def paint(base, layers):
    img = np.zeros((N, N, 3)); img[:] = hexrgb(base)
    for m, c in layers: img[m] = hexrgb(c)
    return img

def pixelate(img, cell):
    s = cv2.resize(img.astype(np.float32), (N // cell, N // cell), interpolation=cv2.INTER_AREA)
    return cv2.resize(s, (N, N), interpolation=cv2.INTER_NEAREST).astype(np.float64)

def digital(base, layers, cell=8):
    """MARPAT/CADPAT-style: classify on a coarse grid so every patch is made of square pixels."""
    img = paint(base, layers)
    small = img[cell // 2::cell, cell // 2::cell]
    return np.repeat(np.repeat(small, cell, 0), cell, 1)

def weave(img, amount=5, seed=1):
    g = np.random.default_rng(seed).standard_normal((N, N)) * amount
    return img + g[..., None]

def mix(a, b, t): t = np.asarray(t, np.float64)[..., None] if np.ndim(t) == 2 else t; return a * (1 - t) + b * t

OUT = []
def save(pid, name, group, img, scale=1.0):
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(os.path.join(PD, f'{pid}.jpg'), quality=88)
    OUT.append({'id': pid, 'name': name, 'group': group, 'scale': scale})

# ============================== real camo, recreated ==============================
# Flecktarn (German, 5 colours): clusters of small dots
cl = field(26, seed=11)
dots = lambda s, sd: blobs(3.2, 0.25, seed=sd)
img = paint('#7c7b5c', [])
for col, frac, sd, clusterfrac in [('#5f6c3c', .36, 12, .60), ('#3a4429', .30, 13, .55), ('#5c4533', .22, 14, .5), ('#1d1c19', .12, 15, .45)]:
    m = q(dots(3.2, sd), frac) & q(field(22, seed=sd + 50), clusterfrac)
    img[m] = hexrgb(col)
save('flecktarn', 'Flecktarn', 'Camo', weave(img, 4), 1.5)

# Tropentarn (German desert flecktarn): sparse 3-colour dots on sand
img = paint('#c6b48c', [])
for col, frac, sd, cf in [('#8e8457', .28, 21, .55), ('#6f5a3d', .16, 22, .5), ('#9b8e65', .20, 23, .5)]:
    img[q(blobs(3.0, .25, seed=sd), frac) & q(field(20, seed=sd + 50), cf)] = hexrgb(col)
save('tropentarn', 'Tropentarn', 'Camo', weave(img, 4), 1.5)

# DPM (British temperate): brush-stroke blobs, 4 colours on khaki
f1, f2, f3 = blobs(16, .5, 31, (1, .45)), blobs(14, .5, 32, (1, .45)), blobs(7, .5, 33, (1, .4))
img = paint('#a49d6c', [(q(f1, .40), '#6f7e4c'), (q(f2, .30), '#5b4430'), (q(f3, .16), '#1d1d19')])
save('dpm', 'DPM (British)', 'Camo', weave(img, 4), 1.8)

# MARPAT woodland (digital)
f1, f2, f3 = blobs(14, .7, 41), blobs(11, .7, 42), blobs(7, .7, 43)
img = digital('#8c8a67', [(q(f1, .42), '#5a6243'), (q(f2, .30), '#4a3f30'), (q(f3, .15), '#1f1f1b')], 8)
save('marpat_woodland', 'MARPAT woodland', 'Camo', weave(img, 3), 1.2)

# MARPAT desert (digital)
f1, f2, f3 = blobs(14, .7, 51), blobs(11, .7, 52), blobs(7, .7, 53)
img = digital('#cdb892', [(q(f1, .40), '#a58660'), (q(f2, .28), '#7b6048'), (q(f3, .12), '#e0d5b8')], 8)
save('marpat_desert', 'MARPAT desert', 'Camo', weave(img, 3), 1.2)

# UCP / ACU (US Army Universal Camouflage Pattern): grey-green-sand pixels
f1, f2 = blobs(12, .8, 61), blobs(10, .8, 62)
img = digital('#8f9387', [(q(f1, .38), '#c3bca5'), (q(f2, .30), '#6d7563')], 8)
save('ucp', 'UCP / ACU', 'Camo', weave(img, 3), 1.2)

# Croatian digital woodland (HV "MDU"-style): green/brown/black pixels on olive
f1, f2, f3, f4 = blobs(15, .7, 71), blobs(12, .7, 72), blobs(8, .7, 73), blobs(10, .7, 74)
img = digital('#7b7751', [(q(f4, .30), '#9c9670'), (q(f1, .34), '#4b5732'), (q(f2, .26), '#58432f'), (q(f3, .12), '#23231e')], 8)
save('croatian_digital', 'Croatian digital (woodland)', 'Camo', weave(img, 3), 1.3)

# Tiger stripe (Vietnam-era)
f1, f2 = blobs(14, .5, 81, (.22, 1.6)), blobs(10, .5, 82, (.22, 1.6))
img = paint('#7f7e52', [(q(f2, .24), '#4d5a33'), (q(f1, .33), '#1c1c17')])
save('tiger', 'Tiger stripe', 'Camo', weave(img, 4), 1.5)

# ============================== fabrics ==============================
F = 'Fabric'

def twill(base, light, dark, contrast=0.35, seed=0, period=4):
    d = ((xx + yy) % period) / period
    line = np.cos(2 * np.pi * d) * 0.5 + 0.5
    mott = field(30, seed=seed) * 0.5 + field(3, (1, .15), seed=seed + 1) * 0.5
    t = np.clip(0.5 + contrast * (line - 0.5) + 0.18 * mott, 0, 1)
    return mix(hexrgb(dark), hexrgb(light), t)

# Denim: indigo twill with slub mottling
save('denim_indigo', 'Denim (indigo)', F, weave(twill('#2f4a70', '#4c6a93', '#1d2f4b', seed=101), 4), 0.45)
save('denim_light', 'Denim (light wash)', F, weave(twill('#7493b8', '#9bb4d1', '#57759b', seed=102), 4), 0.45)
save('denim_black', 'Denim (black)', F, weave(twill('#2b2c30', '#45474d', '#1b1c1f', seed=103), 3), 0.45)

def stripes(period, width, axis):
    c = (xx if axis == 'x' else yy) % period
    return (c < width).astype(np.float64)

def gingham(color, period=32):
    v, h = stripes(period, period // 2, 'x'), stripes(period, period // 2, 'y')
    t = (v + h) / 2
    return mix(hexrgb('#f3f1ec'), hexrgb(color), t)

save('gingham_red', 'Gingham (red)', F, weave(gingham('#b3262d'), 3), 0.6)
save('gingham_blue', 'Gingham (blue)', F, weave(gingham('#2f5aa0'), 3), 0.6)
save('gingham_black', 'Gingham (black)', F, weave(gingham('#1f1f1f'), 3), 0.6)

# Buffalo check (red/black)
v, h = stripes(128, 64, 'x'), stripes(128, 64, 'y')
img = np.where((v * h)[..., None] > 0, hexrgb('#171717'),
               np.where(((v + h) > 0)[..., None], hexrgb('#5b1416'), hexrgb('#b01e23')))
save('buffalo_check', 'Buffalo check', F, weave(img.astype(float), 5), 0.45)

def tartan(sett, colors, period=128):
    """sett: list of (colour index, width) repeated symmetrically; weave alternates warp/weft."""
    seq = []
    for ci, w in sett + sett[::-1]: seq += [ci] * w
    seq = np.array(seq); seq = seq[(np.arange(period) * len(seq) // period)]
    cols = np.array([hexrgb(c) for c in colors])
    warp = cols[seq[xx % period]]; weft = cols[seq[yy % period]]
    tw = (((xx + yy) // 2) % 2 == 0)[..., None]
    return np.where(tw, warp, weft).astype(float)

# Red flannel plaid
img = tartan([(0, 14), (1, 6), (0, 6), (2, 2), (0, 6), (1, 14), (3, 2), (1, 14)], ['#a8232a', '#1d1d1f', '#e8d9b0', '#2d4a2f'])
save('flannel_red', 'Flannel plaid (red)', F, weave(cv2.GaussianBlur(img, (0, 0), 0.7), 6), 0.5)
# Green/blue flannel
img = tartan([(0, 14), (1, 8), (0, 4), (2, 2), (0, 4), (1, 14), (3, 2), (1, 12)], ['#2f5a3a', '#1c2a44', '#d9cf9f', '#6d1f22'])
save('flannel_green', 'Flannel plaid (green)', F, weave(cv2.GaussianBlur(img, (0, 0), 0.7), 6), 0.5)
# Black Watch tartan
img = tartan([(0, 12), (1, 2), (0, 2), (1, 2), (0, 2), (1, 2), (0, 12), (2, 12), (1, 16), (2, 12)], ['#1b2b52', '#141414', '#1f4a2c'])
save('black_watch', 'Black Watch tartan', F, weave(cv2.GaussianBlur(img, (0, 0), 0.7), 5), 0.5)

# Houndstooth (black/white): classic 8x8 unit
unit = np.array([
    [1, 1, 1, 1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0, 0, 1, 1],
    [1, 1, 1, 1, 0, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 1, 0, 0, 0, 0],
    [0, 0, 1, 1, 0, 0, 0, 0],
    [0, 1, 1, 1, 0, 0, 0, 0],
    [1, 1, 1, 0, 0, 0, 0, 0]], float)
t = np.tile(np.kron(unit, np.ones((4, 4))), (16, 16))
save('houndstooth', 'Houndstooth', F, weave(mix(hexrgb('#ece8df'), hexrgb('#1c1c1c'), t), 4), 0.55)

# Herringbone tweed (grey-brown)
band = (xx // 16) % 2
d = np.where(band == 0, (xx + yy) % 8, (yy - xx) % 8) / 8
t = np.clip(0.5 + 0.35 * np.cos(2 * np.pi * d) + 0.25 * field(1.5, seed=121) + 0.15 * field(20, seed=122), 0, 1)
save('herringbone', 'Herringbone tweed', F, mix(hexrgb('#4b443c'), hexrgb('#8a8174'), t), 0.5)

# Navy pinstripe
t = stripes(32, 2, 'x') * 0.8
save('pinstripe_navy', 'Pinstripe (navy)', F, weave(mix(hexrgb('#1e2536'), hexrgb('#c9ccd6'), t), 3), 0.5)

# Corduroy (brown): vertical ribs
rib = np.cos(2 * np.pi * (xx % 16) / 16) * 0.5 + 0.5
t = np.clip(0.25 + 0.6 * rib + 0.1 * field(25, seed=131), 0, 1)
save('corduroy_brown', 'Corduroy (brown)', F, weave(mix(hexrgb('#4a3322'), hexrgb('#8a6446'), t), 3), 0.5)

# Ripstop (olive): reinforcement grid
g = np.maximum(stripes(32, 2, 'x'), stripes(32, 2, 'y'))
t = 0.15 * g + 0.08 * field(20, seed=141)
save('ripstop_olive', 'Ripstop (olive)', F, weave(mix(hexrgb('#555b3a'), hexrgb('#8a9064'), np.clip(t + 0.1, 0, 1)), 4), 0.5)

# Heather grey
t = np.clip(0.5 + 0.35 * field(1.2, (1, .4), seed=151) + 0.1 * field(15, seed=152), 0, 1)
save('heather_grey', 'Heather grey', F, mix(hexrgb('#6f7275'), hexrgb('#a8abad'), t), 0.5)

# Breton stripe (navy/white)
t = stripes(64, 20, 'y')
save('breton_stripe', 'Breton stripe', F, weave(mix(hexrgb('#f0eee8'), hexrgb('#1f2b4d'), t), 3), 0.5)

# ------------------------------ merge into patterns.json ------------------------------
pj_path = os.path.join(PD, 'patterns.json')
old = json.load(open(pj_path)) if os.path.exists(pj_path) else []
extracted = [p for p in old if p.get('source')]                 # from extract_patterns.py
ours = {p['id'] for p in OUT}
keep_ids = {p['id'] for p in extracted}
obsolete = [p['id'] for p in old if p['id'] not in ours and p['id'] not in keep_ids]
for pid in obsolete:                                            # old generic look-alikes
    for ext in ('.jpg', '.png'):
        f = os.path.join(PD, pid + ext)
        if os.path.exists(f): os.remove(f)
merged = extracted + [p for p in OUT if p['id'] not in keep_ids]
json.dump(merged, open(pj_path, 'w'), indent=1)
print('patterns:', len(merged), 'removed:', obsolete)

# contact sheet for review
os.makedirs(os.path.join(ROOT, 'tools', 'work'), exist_ok=True)
th = [np.asarray(Image.open(os.path.join(PD, p['id'] + '.jpg')).resize((128, 128))) for p in merged]
while len(th) % 8: th.append(np.zeros_like(th[0]))
Image.fromarray(np.concatenate([np.concatenate(th[k:k + 8], 1) for k in range(0, len(th), 8)], 0)).save(
    os.path.join(ROOT, 'tools', 'work', 'patterns_sheet.png'))
