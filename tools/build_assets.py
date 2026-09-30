"""Build per-angle assets (base, shading, masks) from the segmentation labels.

Run after tools/segment.py. Outputs to assets/angle{p}/ :
  base.jpg    original photo (background + fixed items come from here)
  shade.png   R = denoised luminance (sRGB-encoded), G = blurred luminance (for fold displacement)
  maskA..E.png  item masks, three per image in R/G/B, in ITEMS order
and assets/meta.json with the per-item median luminance per angle.
"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LABDIR = os.path.join(ROOT, 'tools', 'labels')

def load_labels(p):
    im = np.asarray(Image.open(os.path.join(LABDIR, f'angle{p}.png')))
    return (im[..., 0] if im.ndim == 3 else im).astype(np.int64)
import numpy as np, cv2
from PIL import Image
from scribbles import LABELS

SRC = os.path.join(ROOT, 'source', 'variant_ranger_green.jpg')
X0 = [0, 456, 919]
W, H = 455, 752
ITEMS = ['helmet', 'face', 'shirt', 'carrier', 'belt', 'pants', 'kneepads', 'gloves', 'boots',
         'headset', 'holster', 'hippouch', 'chestpouch']

A = np.asarray(Image.open(SRC).convert('RGB'))

def srgb_to_lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)

def open2x2(m):
    # morphological opening with a 2x2 square (same as the mask editor): removes 1-px specks
    e = np.zeros_like(m)
    e[:-1, :-1] = np.minimum.reduce([m[:-1, :-1], m[:-1, 1:], m[1:, :-1], m[1:, 1:]])
    o = e.copy()
    o[:, 1:] = np.maximum(o[:, 1:], e[:, :-1]); o[1:, :] = np.maximum(o[1:, :], e[:-1, :])
    o[1:, 1:] = np.maximum(o[1:, 1:], e[:-1, :-1])
    return o

def guided_filter(I, p, r, eps):
    # grayscale-guide guided filter (He et al.)
    box = lambda x: cv2.boxFilter(x, -1, (2 * r + 1, 2 * r + 1))
    mI, mp = box(I), box(p)
    cov = box(I * p) - mI * mp
    var = box(I * I) - mI * mI
    a_ = cov / (var + eps); b_ = mp - a_ * mI
    return box(a_) * I + box(b_)

meta = {'items': ITEMS, 'width': W, 'height': H, 'angles': []}
os.makedirs(os.path.join(ROOT, 'assets'), exist_ok=True)
for p in range(3):
    out = os.path.join(ROOT, 'assets', f'angle{p}'); os.makedirs(out, exist_ok=True)
    a = A[:, X0[p]:X0[p] + W].copy()
    lab = load_labels(p)
    Image.fromarray(a).save(f'{out}/base.jpg', quality=93)

    # luminance: edge-preserving denoise so dark items (boots) don't turn into noise when brightened
    den = cv2.bilateralFilter(a, 5, 18, 3)
    lin = srgb_to_lin(den.astype(np.float64))
    Y = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
    # Soft mask edges mix in bright background; replace luminance near the silhouette with values
    # extrapolated from inside the gear so recoloured edges don't get a light halo.
    gear = np.isin(lab, [LABELS.index(n) for n in ITEMS]).astype(np.uint8)
    core = cv2.erode(gear, np.ones((5, 5), np.uint8)).astype(np.float64)
    num = cv2.GaussianBlur(Y * core, (0, 0), 2.0); den_ = cv2.GaussianBlur(core, (0, 0), 2.0)
    Yext = num / np.maximum(den_, 1e-6)
    band = (core == 0) & (cv2.dilate(gear, np.ones((7, 7), np.uint8)) > 0) & (den_ > 1e-3)
    Y = np.where(band, np.minimum(Y, Yext), Y)
    Yb = cv2.GaussianBlur(Y, (0, 0), 3.0)
    shade = np.zeros((H, W, 3), np.uint8)
    shade[..., 0] = np.round(lin_to_srgb(Y) * 255)
    shade[..., 1] = np.round(lin_to_srgb(Yb) * 255)
    Image.fromarray(shade).save(f'{out}/shade.png')

    # soft, edge-aware masks
    # guide from the saved JPEG so the mask editor (which only sees base.jpg) gets identical masks
    b = np.asarray(Image.open(f'{out}/base.jpg').convert('RGB')).astype(np.float64)
    guide = (0.299 * b[..., 0] + 0.587 * b[..., 1] + 0.114 * b[..., 2]) / 255
    masks = []
    medians = {}
    for name in ITEMS:
        li = LABELS.index(name)
        m = (lab == li).astype(np.float64)
        # remove specks
        m = open2x2(m)
        if m.sum() > 0:
            m = guided_filter(guide, m, 2, 2e-3)
            m = cv2.GaussianBlur(m, (0, 0), 0.6)
        m = np.clip(m, 0, 1)
        masks.append(m)
        core = lab == li
        medians[name] = float(np.median(Y[core])) if core.any() else 0.1
    # normalise so overlapping soft edges never sum above 1
    tot = np.maximum(np.sum(masks, 0), 1.0)
    masks = [m / tot for m in masks]
    for k, tag in enumerate('ABCDE'[:(len(ITEMS) + 2) // 3]):
        ch = masks[3 * k:3 * k + 3]
        ch += [np.zeros_like(masks[0])] * (3 - len(ch))
        rgb = np.stack(ch, -1)
        Image.fromarray(np.round(rgb * 255).astype(np.uint8)).save(f'{out}/mask{tag}.png')
    meta['angles'].append({'medians': medians})
    print(p, {k: round(v, 4) for k, v in medians.items()})

# scene colour cast, estimated from the background (used to grade new colours like the photo)
bgs = []
for p in range(3):
    a = A[:, X0[p]:X0[p] + W]; lab = load_labels(p)
    bgs.append(srgb_to_lin(a[lab == 0].astype(np.float64)))
m = np.concatenate(bgs).mean(0)
meta['tint'] = [float(v) for v in m / (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2])]
json.dump(meta, open(os.path.join(ROOT, 'assets', 'meta.json'), 'w'), indent=1)
