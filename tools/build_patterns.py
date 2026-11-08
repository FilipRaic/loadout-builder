"""Build the pattern swatches in assets/patterns/ from real photos and scans of real fabric.

Nothing here is generated or drawn by the script: every swatch comes from an openly licensed
image of the actual pattern (Wikimedia Commons, Poly Haven, ambientCG). The script only
downloads, crops, evens out the lighting and makes the image tile without seams.

Two kinds of sources:
  seamless  Poly Haven and ambientCG textures are photo scans that already tile. They are
            only resized to 512x512 (repeating along the short side first if needed).
  quilt     Photos and scans of camo fabric don't tile. The usable areas (`rects`, in source
            pixels) are flattened (slow lighting gradients and vignettes removed), resampled to
            the target print size and stitched into a seamless tile with image quilting
            (Efros & Freeman 2001) on a torus, so the tile repeats without visible seams.

Physical size: each entry says how many centimetres its tile covers (`tile_cm`). In the base
photos 190 px (one tile at scale 1.0) is roughly 49 cm, so scale = tile_cm / 49.

Downloads are cached in tools/work/swatches/ (not committed).
Writes assets/patterns/<id>.jpg, assets/patterns/patterns.json and assets/patterns/CREDITS.md.

Usage: python tools/build_patterns.py                 (all patterns)
       python tools/build_patterns.py dpm ucp         (only these)
       python tools/build_patterns.py --credits-only  (only rewrite patterns.json and CREDITS.md)
Then run python tools/pack_assets.py.
"""
import cv2
import html
import io
import json
import numpy as np
import os
import re
import sys
import urllib.parse
import urllib.request
import zipfile
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PD = os.path.join(ROOT, 'assets', 'patterns')
CACHE = os.path.join(ROOT, 'tools', 'work', 'swatches')
UA = {'User-Agent': 'loadout-builder-asset-build/1.0 (https://github.com/FilipRaic/loadout-builder)'}
N = 512  # output tile size
CM_PER_SCALE = 49.0  # cm covered by one tile at scale 1.0 in the base photos
# Brightness limits (linear luminance). Swatch scans are exposed much brighter than fabric in
# the base photos, so light patterns looked like they were glowing. Tiles whose average is
# above MEAN_CAP are darkened as a whole, then highlights above KNEE roll off towards CEIL.
MEAN_CAP, KNEE, CEIL = 0.26, 0.38, 0.6
# Fold warp for regular geometric fabrics (checks, stripes): bending them along the shading
# makes straight lines wobble (dark items amplify it a lot), so they get none (1.0 = full warp).
GEOMETRIC_WARP = 0.0

C, F = 'Camo', 'Fabric'

# id, name, group, source, options
#   source: ('commons', file title) | ('polyhaven', asset id) | ('ambientcg', asset id)
#   seamless: src_cm (physical width of the whole texture; Poly Haven reports it, so it may be omitted),
#          geometric (True for checks and stripes: less fold warp, see GEOMETRIC_WARP)
#   quilt: rects [(x0, y0, x1, y1)...] usable areas in source px (measured on an image ref_w px
#          wide, if given), src_cm (physical width of the
#          full source image), tile_cm, flat (blur sigma in cm for lighting removal; None for
#          clean digital swatches), n (blocks per tile side: 4 for big shapes, 8 for fine ones),
#          mean (optional '#rrggbb': white-balance an over-exposed or colour-cast photo so the
#          tile's average colour matches the real fabric's)
PATTERNS = [
    # --- camo ---
    ('woodland_m81', 'Woodland (M81)', C, ('commons', '"M81" U.S. woodland camouflage pattern swatch.png'),
     dict(src_cm=62, tile_cm=55, flat=None, n=4)),
    ('multicam', 'MultiCam', C, ('commons', 'Multicam pattern (cropped).jpg'),
     dict(src_cm=48, tile_cm=40, flat=14, n=4, mean='#857c62')),
    ('multicam_tropic', 'MultiCam Tropic', C, ('commons', 'TROPIC MULTICAM (cropped).jpg'),
     dict(src_cm=50, tile_cm=40, flat=None, n=4)),
    ('multicam_black', 'MultiCam Black', C, ('commons', 'BLACK MULTICAM.jpg'),
     dict(src_cm=60, tile_cm=40, flat=None, n=4)),
    ('desert_dcu', 'Desert 3-colour (DCU)', C, ('commons', 'DCU camo swatch (cropped).png'),
     dict(src_cm=60, tile_cm=50, flat=None, n=4)),
    ('desert_6color', 'Desert 6-colour (chocolate chip)', C, ('commons', 'Six-Color Desert Pattern.jpg'),
     dict(rects=[(0, 70, 1200, 255), (165, 565, 395, 1300), (467, 565, 760, 1220), (840, 565, 1080, 1290)],
          src_cm=22, tile_cm=22, flat=4, n=8)),
    ('flecktarn', 'Flecktarn', C, ('commons', 'Flecktarn pattern.jpg'),
     dict(src_cm=45, tile_cm=40, flat=None, n=4)),
    ('tropentarn', 'Tropentarn', C, ('commons', 'Tropentarn Fabric (cropped).jpg'),
     dict(src_cm=55, tile_cm=36, flat=12, n=8)),
    ('dpm', 'DPM (British)', C, ('commons', 'DPM Combat 95 Camouflage Material MOD 45149982 (cropped).jpg'),
     dict(src_cm=45, tile_cm=40, flat=14, n=4)),
    ('marpat_woodland', 'MARPAT woodland', C, ('commons', 'MARPAT woodland pattern.jpg'),
     dict(src_cm=22, tile_cm=22, flat=8, n=8)),
    ('marpat_desert', 'MARPAT desert', C, ('commons', 'MARPAT desert camouflage swatch, 24.55" (cropped).jpg'),
     dict(src_cm=62, tile_cm=40, flat=14, n=8)),
    ('ucp', 'UCP / ACU', C, ('commons', 'ACU Universal Camouflage Pattern.jpg'),
     dict(src_cm=32, tile_cm=30, flat=10, n=8)),
    ('cadpat', 'CADPAT (temperate)', C, ('commons', 'Temperate CADPAT camouflage pattern swatch.png'),
     dict(src_cm=36, tile_cm=36, flat=None, n=8)),
    ('m05', 'M05 woodland (Finnish)', C, ('commons', 'M05 woodland pattern (cropped).jpg'),
     dict(src_cm=30, tile_cm=30, flat=10, n=8)),
    ('brushstroke', 'Rhodesian brushstroke', C, ('commons', 'Rhodesian Brushstroke pattern (cropped).jpg'),
     dict(src_cm=40, tile_cm=40, flat=12, n=4)),
    ('urban_grey', 'Urban (M81 city)', C, ('commons', 'US City Camo (M81 Urban).png'),
     dict(src_cm=70, tile_cm=55, flat=None, n=4)),
    ('blue_urban', 'Navy blue digital (NWU)', C, ('commons', 'NWU Type I camouflage pattern swatch (cropped).jpg'),
     dict(src_cm=26, tile_cm=26, flat=8, n=8)),
    # --- fabric (photo scans that already tile) ---
    ('denim_indigo', 'Denim (indigo)', F, ('ambientcg', 'Fabric069'), dict(src_cm=20)),
    ('denim_light', 'Denim (light wash)', F, ('polyhaven', 'denim_fabric_04'), {}),
    ('denim_dark', 'Denim (dark rinse)', F, ('polyhaven', 'denim_fabric_06'), {}),
    ('denim_grey', 'Denim (grey)', F, ('polyhaven', 'denim_fabric_05'), {}),
    ('gingham_green', 'Gingham (green)', F, ('polyhaven', 'gingham_check'), {}),
    ('plaid_red', 'Madras plaid (red)', F, ('ambientcg', 'Fabric080'), dict(src_cm=30, geometric=True)),
    ('glen_check', 'Glen check', F, ('polyhaven', 'wool_boucle'), dict(geometric=True)),
    ('check_grey', 'Check (grey)', F, ('ambientcg', 'Fabric083'), dict(src_cm=14, geometric=True)),
    ('check_green', 'Check (green)', F, ('ambientcg', 'Fabric078'), dict(src_cm=14, geometric=True)),
    ('herringbone', 'Herringbone (grey wool)', F, ('polyhaven', 'poly_wool_herringbone'), dict(geometric=True)),
    ('pinstripe_blue', 'Pinstripe (blue)', F, ('ambientcg', 'Fabric072'), dict(src_cm=16, geometric=True)),
    ('stripe_navy', 'Nautical stripe', F, ('ambientcg', 'Fabric071'), dict(src_cm=18, geometric=True)),
    ('stripe_ticking', 'Ticking stripe', F, ('ambientcg', 'Fabric076'), dict(src_cm=18, geometric=True)),
    ('stripe_black', 'Pencil stripe (black)', F, ('ambientcg', 'Fabric079'), dict(src_cm=10, geometric=True)),
    ('corduroy_sage', 'Corduroy (sage)', F, ('polyhaven', 'ribbed_corduroy'), dict(geometric=True)),
    ('heather_grey', 'Heather grey', F, ('polyhaven', 'jogging_melange'), dict(geometric=True)),
    ('heather_blue', 'Heather blue', F, ('polyhaven', 'jersey_melange'), {}),
    ('linen_blue', 'Linen (blue)', F, ('polyhaven', 'rough_linen'), {}),
]


# ---------------------------------------------------------------- downloads
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180).read()


def strip_html(s):
    s = html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()
    half = len(s) // 2
    return s[:half] if len(s) % 2 == 0 and s[:half] == s[half:] else s  # 'Unknown authorUnknown author'


def fetch(kind, ident):
    """Return (PIL image, credit dict). Cached in tools/work/swatches/."""
    os.makedirs(CACHE, exist_ok=True)
    key = re.sub(r'[^A-Za-z0-9._-]+', '_', f'{kind}_{ident}')
    img_path, meta_path = os.path.join(CACHE, key + '.img'), os.path.join(CACHE, key + '.json')
    if not (os.path.exists(img_path) and os.path.exists(meta_path)):
        if kind == 'commons':
            q = urllib.parse.urlencode(dict(action='query', format='json', titles='File:' + ident, prop='imageinfo',
                                            iiprop='url|size|extmetadata', iiurlwidth=2400))
            page = next(iter(json.loads(get('https://commons.wikimedia.org/w/api.php?' + q))['query']['pages'].values()))
            ii = page['imageinfo'][0]
            data = get(ii['thumburl'] if ii['width'] > 2400 else ii['url'])
            m = ii['extmetadata']
            meta = dict(site='Wikimedia Commons', title=ident, url=ii['descriptionurl'],
                        license=m.get('LicenseShortName', {}).get('value', ''),
                        license_url=m.get('LicenseUrl', {}).get('value', ''),
                        author=strip_html(m.get('Artist', {}).get('value', '')), orig_width=ii['width'])
        elif kind == 'polyhaven':
            files = json.loads(get('https://api.polyhaven.com/files/' + ident))
            info = json.loads(get('https://api.polyhaven.com/info/' + ident))
            data = get(files['Diffuse']['2k']['jpg']['url'])
            meta = dict(site='Poly Haven', title=info['name'], url='https://polyhaven.com/a/' + ident, license='CC0',
                        license_url='https://creativecommons.org/publicdomain/zero/1.0/',
                        author=', '.join(info.get('authors', {})), width_mm=info.get('dimensions', [None])[0])
        elif kind == 'ambientcg':
            z = zipfile.ZipFile(io.BytesIO(get(f'https://ambientcg.com/get?file={ident}_1K-JPG.zip')))
            data = z.read(next(n for n in z.namelist() if n.endswith('_Color.jpg')))
            meta = dict(site='ambientCG', title=ident, url='https://ambientcg.com/a/' + ident, license='CC0',
                        license_url='https://creativecommons.org/publicdomain/zero/1.0/', author='ambientCG')
        else:
            raise ValueError(kind)
        open(img_path, 'wb').write(data)
        json.dump(meta, open(meta_path, 'w'), indent=1)
    return Image.open(img_path).convert('RGB'), json.load(open(meta_path))


# ---------------------------------------------------------------- colour helpers
def s2l(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)


def l2s(c):
    c = np.clip(c, 0, 1)
    return (np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055) * 255).round().astype(np.uint8)


LUM = np.array([0.2126, 0.7152, 0.0722], np.float32)


def tone(lin):
    """Keep a tile within the brightness range of fabric in the base photos (see MEAN_CAP)."""
    Y = lin @ LUM
    if Y.mean() > MEAN_CAP:
        lin = lin * (MEAN_CAP / Y.mean())
        Y = lin @ LUM
    hi = KNEE + (CEIL - KNEE) * (1 - np.exp(-(Y - KNEE) / (CEIL - KNEE)))
    Yc = np.where(Y > KNEE, hi, Y)
    return lin * (Yc / np.maximum(Y, 1e-6))[..., None]


def flatten(lin, mask, sigma):
    """Divide out slow lighting changes (vignette, uneven light) inside the mask."""
    Y = lin @ LUM
    mf = mask.astype(np.float32)
    Yb = cv2.GaussianBlur(Y * mf, (0, 0), sigma) / np.maximum(cv2.GaussianBlur(mf, (0, 0), sigma), 1e-6)
    return lin / np.maximum(Yb / np.median(Y[mask]), 0.2)[..., None]


# ---------------------------------------------------------------- image quilting on a torus
def quilt(E, M, T=N, n=8, seed=0, ncand=1500):
    """Seamless TxT tile from exemplar E (h,w,3) using only blocks fully inside mask M."""
    rng = np.random.default_rng(seed)
    s = T // n
    ov = max(8, s // 5)
    B = s + ov
    ii = np.pad(M.astype(np.int32), ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    full = ii[B:, B:] - ii[:-B, B:] - ii[B:, :-B] + ii[:-B, :-B] == B * B
    ys, xs = np.nonzero(full)
    if not len(ys):
        raise ValueError(f'exemplar too small for {B}px blocks: {E.shape[:2]}')
    pick = rng.choice(len(ys), min(ncand, len(ys)), replace=False)
    cy, cx = ys[pick], xs[pick]
    blocks = np.stack([E[y:y + B, x:x + B] for y, x in zip(cy, cx)]).astype(np.float32)
    pos = np.stack([cy, cx], 1).astype(np.float32)
    O = np.zeros((T, T, 3), np.float32)
    F = np.zeros((T, T), bool)
    used = []
    for i in range(n):
        for j in range(n):
            ry, rx = (np.arange(B) + i * s) % T, (np.arange(B) + j * s) % T
            cur, fil = O[np.ix_(ry, rx)], F[np.ix_(ry, rx)]
            if fil.any():
                err = np.einsum('nhwc,hw->n', (blocks - cur[None]) ** 2, fil.astype(np.float32)) / fil.sum()
                if used:  # avoid reusing the same exemplar spot (visible repeats)
                    dist = np.min(np.linalg.norm(pos[:, None] - np.array(used)[None], axis=2), 1)
                    err = np.where(dist < B * 0.75, err + 1e3, err)
                k = rng.choice(np.argsort(err)[:5])
            else:
                k = int(rng.integers(len(blocks)))
            blk = blocks[k]
            used.append(pos[k])
            use = np.ones((B, B), bool)
            if fil.any():
                e = ((blk - cur) ** 2).sum(-1)
                for side in ('left', 'right', 'top', 'bottom'):
                    sl = {'left': (slice(None), slice(0, ov)), 'right': (slice(None), slice(B - ov, B)),
                          'top': (slice(0, ov), slice(None)), 'bottom': (slice(B - ov, B), slice(None))}[side]
                    if not fil[sl].all():
                        continue
                    ee = e[sl] if side in ('left', 'right') else e[sl].T
                    if side in ('right', 'bottom'):
                        ee = ee[:, ::-1]
                    cost = ee.copy()  # minimum-error seam (dynamic programming)
                    for r in range(1, cost.shape[0]):
                        p = cost[r - 1]
                        cost[r] += np.minimum(np.minimum(p, np.r_[np.inf, p[:-1]]), np.r_[p[1:], np.inf])
                    path = np.zeros(cost.shape[0], int)
                    path[-1] = cost[-1].argmin()
                    for r in range(cost.shape[0] - 2, -1, -1):
                        c = path[r + 1]
                        lo, hi = max(c - 1, 0), min(c + 2, ov)
                        path[r] = lo + cost[r, lo:hi].argmin()
                    keep_old = np.arange(ov)[None, :] < path[:, None]
                    if side in ('right', 'bottom'):
                        keep_old = keep_old[:, ::-1]
                    if side in ('top', 'bottom'):
                        keep_old = keep_old.T
                    sub = use[sl]
                    sub[keep_old] = False
                    use[sl] = sub
            w = cv2.GaussianBlur(use.astype(np.float32), (0, 0), 0.8)
            w[~fil] = 1.0
            O[np.ix_(ry, rx)] = w[..., None] * blk + (1 - w[..., None]) * cur
            F[np.ix_(ry, rx)] = True
    return O


# ---------------------------------------------------------------- builders
def build_seamless(img, opt, meta):
    w, h = img.size
    kx, ky = max(1, round(h / w)), max(1, round(w / h))  # repeat the short side to get close to square
    if kx > 1 or ky > 1:
        big = Image.new('RGB', (w * kx, h * ky))
        for a in range(kx):
            for b in range(ky):
                big.paste(img, (a * w, b * h))
        img = big
    src_cm = opt.get('src_cm') or (meta.get('width_mm') or 300) / 10
    lin = tone(s2l(np.asarray(img.resize((N, N), Image.LANCZOS), np.float32)))
    return Image.fromarray(l2s(lin)), src_cm * kx


def build_quilt(img, opt):
    w, h = img.size
    k = w / opt.get('ref_w', w)
    rects = [tuple(v * k for v in r) for r in opt['rects']] if opt.get('rects') else [(0, 0, w, h)]
    x0, y0 = min(r[0] for r in rects), min(r[1] for r in rects)
    x1, y1 = max(r[2] for r in rects), max(r[3] for r in rects)
    # resample so the tile (N px) covers tile_cm
    f = (N / opt['tile_cm']) / (w / opt['src_cm'])
    sub = img.crop((x0, y0, x1, y1))
    sw, sh = max(1, round(sub.width * f)), max(1, round(sub.height * f))
    lin = s2l(np.asarray(sub.resize((sw, sh), Image.LANCZOS), np.float32))
    M = np.zeros((sh, sw), bool)
    for r in rects:
        M[round((r[1] - y0) * f):round((r[3] - y0) * f), round((r[0] - x0) * f):round((r[2] - x0) * f)] = True
    if opt.get('flat'):
        lin = flatten(lin, M, opt['flat'] * N / opt['tile_cm'])
    tile = quilt(lin, M, N, opt.get('n', 8))
    if opt.get('mean'):
        target = s2l(np.array([int(opt['mean'][i:i + 2], 16) for i in (1, 3, 5)], np.float32))
        tile *= target / tile.reshape(-1, 3).mean(0)
    return Image.fromarray(l2s(tone(tile))), opt['tile_cm']


def credit_line(pid, name, meta):
    lic = f"[{meta['license']}]({meta['license_url']})" if meta.get('license_url') else meta['license']
    by = f" by {meta['author']}" if meta.get('author') else ''
    return f"| {name} | [{meta['title']}]({meta['url']}) ({meta['site']}){by} | {lic} |"


if __name__ == '__main__':
    credits_only = '--credits-only' in sys.argv
    only = {a for a in sys.argv[1:] if not a.startswith('--')}
    pj_path = os.path.join(PD, 'patterns.json')
    old = {e['id']: e for e in json.load(open(pj_path))} if os.path.exists(pj_path) else {}
    entries, credits = [], []
    for pid, name, group, (kind, ident), opt in PATTERNS:
        img, meta = fetch(kind, ident)
        meta['author'] = strip_html(meta.get('author'))
        if not credits_only and (not only or pid in only):
            if kind == 'commons':
                out, tile_cm = build_quilt(img, opt)
            else:
                out, tile_cm = build_seamless(img, opt, meta)
            out.save(os.path.join(PD, f'{pid}.jpg'), quality=90)
            scale = round(tile_cm / CM_PER_SCALE, 3)
            print(f'ok {pid:18s} tile {tile_cm:5.1f} cm  scale {scale}')
        else:
            scale = old.get(pid, {}).get('scale', 1)
        entry = {'id': pid, 'name': name, 'group': group, 'scale': scale}
        if opt.get('geometric'):
            entry['warp'] = GEOMETRIC_WARP
        entry['credit'] = {k: meta.get(k) for k in ('site', 'title', 'url', 'license', 'author')}
        entries.append(entry)
        credits.append(credit_line(pid, name, meta))

    # drop swatches that are no longer listed
    keep = {e['id'] for e in entries}
    for fn in os.listdir(PD):
        stem, ext = os.path.splitext(fn)
        if ext.lower() in ('.jpg', '.png') and stem not in keep:
            os.remove(os.path.join(PD, fn))
    with open(pj_path, 'w', newline='\n') as f:
        json.dump(entries, f, indent=1)
    with open(os.path.join(PD, 'CREDITS.md'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('# Pattern credits\n\nEvery swatch is made from a photo or scan of the real pattern. '
                '`tools/build_patterns.py` crops it, evens out the lighting and makes it tile. '
                'The adapted swatches keep the licence of their source.\n\n'
                '| Pattern | Source | Licence |\n|---|---|---|\n' + '\n'.join(credits) + '\n')
    print('wrote', len(entries), 'patterns')
