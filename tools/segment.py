"""Segment each angle into gear items with a scribble-seeded random walker (no AI).

Uses two colour variants of the same shot (identical pose) as a 6-channel feature image;
seeds live in scribbles.py. Writes tools/work/lab{p}.npy and seg{p}.png previews.
Usage: python tools/segment.py [--force] [angle ...]

The result is written to tools/labels/angle{p}.png (grey value = label index). That file is
what the mask editor (tools/mask-editor.html) edits, so this script refuses to overwrite it
unless you pass --force - otherwise hand-painted fixes would be lost.
"""
import cv2
import numpy as np
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, 'tools', 'work')
os.makedirs(WORK, exist_ok=True)
from PIL import Image
from skimage.segmentation import random_walker
from skimage.color import rgb2lab
from scribbles import S, LABELS, POLYS

A = np.asarray(Image.open(os.path.join(ROOT, 'source', 'variant_ranger_green.jpg')).convert('RGB'))
B = np.asarray(Image.open(os.path.join(ROOT, 'source', 'variant_black.jpg')).convert('RGB'))
X0 = [0, 456, 919]
W, H = 455, 752
COLORS = np.array([[0, 0, 0], [255, 255, 255], [255, 0, 0], [255, 160, 0], [0, 120, 255], [0, 255, 0],
                   [255, 0, 255], [0, 255, 255], [160, 80, 255], [255, 255, 0], [120, 60, 0],
                   [255, 120, 180], [120, 255, 160], [200, 200, 60], [60, 200, 200]], np.uint8)

import sys, json

LABDIR = os.path.join(ROOT, 'tools', 'labels')
os.makedirs(LABDIR, exist_ok=True)
json.dump({'labels': LABELS}, open(os.path.join(LABDIR, 'labels.json'), 'w'), indent=1)
FORCE = '--force' in sys.argv
ANGLES = [int(x) for x in sys.argv[1:] if x.isdigit()] or range(3)
for p in ANGLES:
    out_png = os.path.join(LABDIR, f'angle{p}.png')
    if os.path.exists(out_png) and not FORCE:
        print(f'angle {p}: {out_png} exists (may contain hand edits) - skipping. Use --force to overwrite.')
        continue
    a = A[:, X0[p]:X0[p] + W]
    b = B[:, X0[p]:X0[p] + W]
    la = rgb2lab(a)
    lb = rgb2lab(b)
    feat = np.concatenate([la / np.array([100, 60, 60]), 0.6 * lb / np.array([100, 60, 60])], 2)
    seeds = np.zeros((H, W), np.int32)
    for li, name in enumerate(LABELS):
        for line in S[p].get(name, []):
            pts = np.array(line, np.int32)
            cv2.polylines(seeds, [pts], False, li + 1, 3)
    # automatic background seeds: bright, unchanged between the two variants
    diff = np.abs(a.astype(int) - b.astype(int)).sum(2)
    auto = (la[..., 0] > 58) & (diff < 18)
    auto = cv2.erode(auto.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    seeds[(seeds == 0) & auto] = 1
    present = np.unique(seeds[seeds > 0])
    remap = np.zeros(present.max() + 1, np.int32)
    remap[present] = np.arange(1, len(present) + 1)
    out = random_walker(feat, remap[seeds], beta=3000, mode='cg_j', channel_axis=-1)
    lab = present[out - 1] - 1
    # cleanup: bright pixels that didn't change between the two photo variants are background
    bright_bg = (la[..., 0] > 62) & (diff < 20) & (lab >= 2)
    lab[bright_bg] = 0
    for li in range(2, len(LABELS)):
        n, cc, st, _ = cv2.connectedComponentsWithStats((lab == li).astype(np.uint8), connectivity=4)
        for c in range(1, n):
            if st[c, cv2.CC_STAT_AREA] < 40:
                lab[cc == c] = 0
    for name, fallback, poly in POLYS.get(p, []):
        inside = np.zeros((H, W), np.uint8)
        cv2.fillPoly(inside, [np.array(poly, np.int32)], 1)
        inside = inside > 0
        li, lf = LABELS.index(name), LABELS.index(fallback)
        near = cv2.dilate(inside.astype(np.uint8), np.ones((31, 31), np.uint8)) > 0
        lab[(lab == li) & ~inside & near] = lf
        lab[(lab == lf) & inside] = li
    np.save(os.path.join(WORK, f'seeds{p}.npy'), seeds)
    Image.fromarray(lab.astype(np.uint8), 'L').save(out_png)
    ov = (0.45 * a + 0.55 * COLORS[lab]).astype(np.uint8)
    sv = ov.copy()
    sv[seeds > 0] = COLORS[seeds[seeds > 0] - 1]
    Image.fromarray(np.concatenate([a, ov, sv], 1)).resize((W * 3 * 2 // 2, H)).save(os.path.join(WORK, f'seg{p}.png'))
    print(p, np.bincount(lab.ravel(), minlength=len(LABELS)))
