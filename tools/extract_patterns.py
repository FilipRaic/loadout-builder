"""Extract real camo patterns from full-loadout reference images (same pose as the base set)
and turn them into seamless 512x512 swatches.

How it works (no AI):
  1. Each reference image is resized to the base resolution and every angle is aligned to the
     base photo with ECC image registration, so the item maps in tools/labels/ line up.
  2. The pixels of the chosen items (e.g. shirt + pants) are collected as the "exemplar".
     Fold shading is flattened and the photo's lighting/colour grade is removed, so the swatch
     stores the fabric colour the renderer expects.
  3. A seamless tile is synthesised from the exemplar with image quilting (Efros & Freeman
     2001) on a torus: blocks are copied from the exemplar and stitched along minimum-error
     seams, including across the tile's wrap-around edges, so it repeats without visible seams.

Usage: python tools/extract_patterns.py            (all sources in SOURCES)
       python tools/extract_patterns.py woodland_m81
Then run python tools/pack_assets.py (or Save & update in the mask editor).
"""
import cv2
import json
import numpy as np
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PD = os.path.join(ROOT, 'assets', 'patterns')
SRC = os.path.join(ROOT, 'source', 'patterns')
LABDIR = os.path.join(ROOT, 'tools', 'labels')
LABELS = json.load(open(os.path.join(LABDIR, 'labels.json')))['labels']
BASE = os.path.join(ROOT, 'source', 'variant_ranger_green.jpg')
X0, W, H = [0, 456, 919], 455, 752
BASE_TILE = 190  # renderer: source px per tile at scale 1.0
EXPOSURE, GRADE = 0.7, 0.5  # renderer defaults (js/app.js)

# id, display name, source file, items whose pixels carry the pattern,
# colours (k): flat-colour camos are cleaned up to their k printed colours, which also removes
# fold shadows; None keeps continuous tones (MultiCam family has soft gradients),
# flat: blur radius used to remove large-scale fold shading, med: clean-up filter size
# (3 keeps small details like the rocks in 6-colour desert)
SOURCES = [
    ('woodland_m81', 'Woodland (M81)', 'woodland_m81.jpg', ['shirt', 'pants'], 4, 22, 5),
    ('multicam', 'MultiCam', 'multicam.jpg', ['shirt', 'pants'], 7, 10, 3),
    ('multicam_tropic', 'MultiCam Tropic', 'multicam_tropic.jpg', ['shirt', 'pants'], 7, 10, 3),
    ('multicam_black', 'MultiCam Black', 'multicam_black.jpg', ['shirt', 'pants'], 5, 10, 3),
    ('olive_brushstroke', 'Olive brushstroke', 'olive_brushstroke.jpg', ['shirt', 'pants'], 5, 10, 5),
    ('desert_dcu', 'Desert 3-colour (DCU)', 'desert_dcu.jpg', ['shirt', 'pants'], 3, 22, 5),
    ('desert_6color', 'Desert 6-colour (chip)', 'desert_6color.jpg', ['shirt', 'pants'], 6, 22, 3),
    ('urban_grey', 'Urban grey', 'urban_grey.jpg', ['shirt', 'pants'], 4, 22, 5),
    ('blue_urban', 'Blue urban', 'blue_urban.jpg', ['shirt', 'pants'], 4, 22, 5),
]


def s2l(c): c = c / 255.0; return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def l2s(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055) * 255


def grad(g):
    g = cv2.GaussianBlur(g, (0, 0), 2)
    return cv2.magnitude(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))


def load_labels(p):
    im = np.asarray(Image.open(os.path.join(LABDIR, f'angle{p}.png')))
    return im[..., 0] if im.ndim == 3 else im


def exemplar(fn, items, tint, k=None, flat=22, med=5):
    base = np.asarray(Image.open(BASE).convert('L')).astype(np.float32)
    img = Image.open(os.path.join(SRC, fn)).convert('RGB').resize((1376, 752), Image.LANCZOS)
    rgb = np.asarray(img).astype(np.float32)
    gray = np.asarray(img.convert('L')).astype(np.float32)
    cols, masks = [], []
    for p in range(3):
        a, b = grad(base[:, X0[p]:X0[p] + W]), grad(gray[:, X0[p]:X0[p] + W])
        warp = np.eye(2, 3, dtype=np.float32)
        try:
            _, warp = cv2.findTransformECC(a, b, warp, cv2.MOTION_AFFINE,
                                           (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-5), None, 5)
        except cv2.error:
            pass
        al = cv2.warpAffine(rgb[:, X0[p]:X0[p] + W], warp, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
                            borderMode=cv2.BORDER_REFLECT)
        lab = load_labels(p)
        m = np.isin(lab, [LABELS.index(i) for i in items]).astype(np.uint8)
        m = cv2.erode(m, np.ones((9, 9), np.uint8)) > 0
        cols.append(al)
        masks.append(m)
    gap = np.zeros((H, 8, 3), np.float32)
    gm = np.zeros((H, 8), bool)
    E = np.concatenate(sum([[c, gap] for c in cols], [])[:-1], 1)
    M = np.concatenate(sum([[m, gm] for m in masks], [])[:-1], 1)

    # linear colour, flatten large-scale fold shading, undo the renderer's lighting and grade
    lin = s2l(E)
    Y = lin @ np.array([0.2126, 0.7152, 0.0722])
    mf = M.astype(np.float64)
    Yb = cv2.GaussianBlur(Y * mf, (0, 0), flat) / np.maximum(cv2.GaussianBlur(mf, (0, 0), flat), 1e-6)
    ref = np.median(Y[M])
    lin = lin / np.maximum((Yb / ref) ** 0.8, 0.2)[..., None]
    if k:
        # Printed camo is made of a few flat colours. Classify every pixel into k colour classes
        # (k-means on chroma + fold-flattened lightness, so creases don't change a pixel's class)
        # and repaint with each class's colour: removes folds, pocket shadows and JPEG noise.
        lab = cv2.cvtColor((l2s(lin) / 255).astype(np.float32), cv2.COLOR_RGB2Lab)
        L = lab[..., 0]
        mf32 = M.astype(np.float32)
        Lb = cv2.GaussianBlur(L * mf32, (0, 0), 5) / np.maximum(cv2.GaussianBlur(mf32, (0, 0), 5), 1e-6)
        Lf = L - Lb + np.median(L[M])
        feat = np.stack([0.6 * Lf + 0.4 * L, lab[..., 1] * 1.5, lab[..., 2] * 1.5], -1).astype(np.float32)
        _, _, cen = cv2.kmeans(feat[M][::2], k, None, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_MAX_ITER, 50, 0.1),
                               5, cv2.KMEANS_PP_CENTERS)
        cls = ((feat[..., None, :] - cen[None, None]) ** 2).sum(-1).argmin(-1).astype(np.uint8)
        cls = cv2.medianBlur(cls, med)
        cols_ = np.stack(
            [np.median(lin[M & (cls == c)], 0) if (M & (cls == c)).any() else np.zeros(3) for c in range(k)])
        new = cols_[cls]
        wY = np.array([0.2126, 0.7152, 0.0722])
        new *= (lin[M] @ wY).mean() / max((new[M] @ wY).mean(), 1e-6)  # keep overall brightness
        lin = new
    gray_ = (lin @ np.array([0.2126, 0.7152, 0.0722]))[..., None]
    lin = gray_ + (lin - gray_) / (1 - 0.3 * GRADE)
    lin = lin / (EXPOSURE * (1 + (np.array(tint) - 1) * GRADE))
    return lin, M


def quilt(E, M, T=240, B=32, ov=8, seed=0, ncand=5000):
    rng = np.random.default_rng(seed)
    s = B - ov
    assert T % s == 0
    ii = np.pad(M.astype(np.int32), ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    full = ii[B:, B:] - ii[:-B, B:] - ii[B:, :-B] + ii[:-B, :-B] == B * B
    ys, xs = np.nonzero(full)
    pick = rng.choice(len(ys), min(ncand, len(ys)), replace=False)
    cy, cx = ys[pick], xs[pick]
    blocks = np.stack([E[y:y + B, x:x + B] for y, x in zip(cy, cx)]).astype(np.float32)  # (n,B,B,3)
    O = np.zeros((T, T, 3))
    F = np.zeros((T, T), bool)
    # blocks from far-apart exemplar spots: penalise candidates close to already-used ones
    pos = np.stack([cy, cx], 1).astype(np.float64)
    used_pos = []
    n = T // s
    for i in range(n):
        for j in range(n):
            ry = (np.arange(B) + i * s) % T
            rx = (np.arange(B) + j * s) % T
            cur = O[np.ix_(ry, rx)]
            fil = F[np.ix_(ry, rx)]
            if fil.any():
                err = (((blocks - cur[None]) ** 2).sum(-1) * fil[None]).sum((1, 2)) / fil.sum()
                if used_pos:  # don't reuse (nearly) the same exemplar spot: avoids visible repeats
                    dist = np.min(np.linalg.norm(pos[:, None] - np.array(used_pos)[None], axis=2), 1)
                    err = np.where(dist < B * 0.75, np.inf, err)
                k = rng.choice(np.argsort(err)[:8])
            else:
                k = int(rng.integers(len(blocks)))
            blk = blocks[k]
            used_pos.append(pos[k])
            use = np.ones((B, B), bool)
            if fil.any():
                e = ((blk - cur) ** 2).sum(-1)
                # minimum-error seams along each already-filled side (left/top, and right/bottom on wrap)
                for side in ('left', 'right', 'top', 'bottom'):
                    if side == 'left':
                        region = fil[:, :ov].all(); sl = (slice(None), slice(0, ov))
                    elif side == 'right':
                        region = fil[:, -ov:].all(); sl = (slice(None), slice(B - ov, B))
                    elif side == 'top':
                        region = fil[:ov, :].all(); sl = (slice(0, ov), slice(None))
                    else:
                        region = fil[-ov:, :].all(); sl = (slice(B - ov, B), slice(None))
                    if not region: continue
                    ee = e[sl] if side in ('left', 'right') else e[sl].T  # rows x ov
                    if side in ('right', 'bottom'): ee = ee[:, ::-1]
                    cost = ee.copy()
                    for r in range(1, cost.shape[0]):
                        prev = cost[r - 1]
                        cost[r] += np.minimum(np.minimum(prev, np.r_[np.inf, prev[:-1]]), np.r_[prev[1:], np.inf])
                    path = np.zeros(cost.shape[0], int)
                    path[-1] = cost[-1].argmin()
                    for r in range(cost.shape[0] - 2, -1, -1):
                        c = path[r + 1]
                        lo, hi = max(c - 1, 0), min(c + 2, ov)
                        path[r] = lo + cost[r, lo:hi].argmin()
                    keep_old = np.arange(ov)[None, :] < path[:, None]  # rows x ov
                    if side in ('right', 'bottom'): keep_old = keep_old[:, ::-1]
                    if side in ('top', 'bottom'): keep_old = keep_old.T
                    sub = use[sl]
                    sub[keep_old] = False
                    use[sl] = sub
            w = cv2.GaussianBlur(use.astype(np.float64), (0, 0), 0.8)
            w[~fil] = 1.0
            O[np.ix_(ry, rx)] = w[..., None] * blk + (1 - w[..., None]) * cur
            F[np.ix_(ry, rx)] = True
    return O


if __name__ == '__main__':
    meta = json.load(open(os.path.join(ROOT, 'assets', 'meta.json')))
    tint = meta.get('tint', [1, 1, 1])
    only = sys.argv[1:]
    pj_path = os.path.join(PD, 'patterns.json')
    pj = json.load(open(pj_path)) if os.path.exists(pj_path) else []
    for pid, name, fn, items, k, flat, med in SOURCES:
        if only and pid not in only: continue
        E, M = exemplar(fn, items, tint, k, flat, med)
        T = 240
        tile = quilt(E, M, T=T)
        out = Image.fromarray(l2s(tile).astype(np.uint8)).resize((512, 512), Image.LANCZOS)
        out.save(os.path.join(PD, f'{pid}.jpg'), quality=92)
        entry = {'id': pid, 'name': name, 'scale': round(T / BASE_TILE, 4), 'group': 'Camo', 'source': fn}
        pj = [e for e in pj if e['id'] != pid] + [entry]
        print('ok', pid)
    json.dump(pj, open(pj_path, 'w'), indent=1)
