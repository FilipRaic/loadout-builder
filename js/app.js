(function () {
    'use strict';
    const A = window.LOADOUT_ASSETS;

    const LABELS = {
        helmet: 'Helmet', face: 'Face cover', shirt: 'Combat shirt', carrier: 'Plate carrier, pack & pouches',
        belt: 'Belt', pants: 'Pants', kneepads: 'Knee pads', gloves: 'Gloves', boots: 'Boots',
        headset: 'Headset', holster: 'Pistol holster', hippouch: 'Belt pouch', chestpouch: 'Chest pouches',
    };
    // order in the gear list (render order comes from the assets)
    const DISPLAY = ['helmet', 'headset', 'face', 'shirt', 'carrier', 'chestpouch', 'belt', 'holster', 'hippouch',
        'pants', 'kneepads', 'gloves', 'boots'];
    // items a preset doesn't mention borrow from a related item
    const INHERIT = {holster: 'belt', hippouch: 'belt', chestpouch: 'carrier'};
    // items that always follow another item's selection (hidden from the gear list)
    const LINKED = {chestpouch: 'carrier'};

    function syncLinked() {
        Object.entries(LINKED).forEach(([k, src]) => {
            if (A.items.includes(k) && state.items[src]) state.items[k] = clone(state.items[src]);
        });
    }

    const SOLIDS = [
        ['Black', '#1c1c1c'], ['Charcoal', '#34373a'], ['Wolf grey', '#5b5e60'], ['Ranger green', '#4b5139'],
        ['OD green', '#555a36'], ['Foliage', '#737457'], ['Coyote', '#7d6446'], ['Tan 499', '#9f8a6b'],
        ['Khaki', '#b9a784'], ['Brown', '#4e3d2d'], ['Navy', '#222b43'], ['Police blue', '#2f3f63'],
    ];

    const S = (c) => ({type: 'solid', color: c});
    const P = (id) => ({type: 'pattern', pattern: id});
    const PRESETS = {
        'Ranger green': {
            helmet: S('#4b5139'),
            face: S('#4b5139'),
            shirt: S('#5b5e60'),
            carrier: S('#4b5139'),
            belt: S('#4b5139'),
            pants: S('#4b5139'),
            kneepads: S('#4b5139'),
            gloves: S('#7d6446'),
            boots: S('#1c1c1c')
        },
        'Woodland + tan shirt': {
            helmet: S('#7d6446'),
            face: S('#9f8a6b'),
            shirt: S('#9f8a6b'),
            carrier: S('#7d6446'),
            belt: S('#7d6446'),
            pants: P('woodland_m81'),
            kneepads: S('#7d6446'),
            gloves: S('#7d6446'),
            boots: S('#7d6446')
        },
        'MultiCam': {
            helmet: P('multicam'),
            face: S('#1c1c1c'),
            shirt: P('multicam'),
            carrier: S('#7d6446'),
            belt: S('#7d6446'),
            pants: P('multicam'),
            kneepads: S('#7d6446'),
            gloves: S('#7d6446'),
            boots: S('#7d6446')
        },
        'Flecktarn': {
            helmet: S('#555a36'),
            face: S('#555a36'),
            shirt: P('flecktarn'),
            carrier: S('#555a36'),
            belt: S('#555a36'),
            pants: P('flecktarn'),
            kneepads: S('#555a36'),
            gloves: S('#1c1c1c'),
            boots: S('#1c1c1c')
        },
        'Croatian digital': {
            helmet: S('#4b5139'),
            face: S('#4b5139'),
            shirt: P('croatian_digital'),
            carrier: S('#4b5139'),
            belt: S('#4b5139'),
            pants: P('croatian_digital'),
            kneepads: S('#4b5139'),
            gloves: S('#1c1c1c'),
            boots: S('#1c1c1c')
        },
        'Desert': {
            helmet: S('#9f8a6b'),
            face: S('#1c1c1c'),
            shirt: P('desert_dcu'),
            carrier: S('#9f8a6b'),
            belt: S('#9f8a6b'),
            pants: P('desert_dcu'),
            kneepads: S('#9f8a6b'),
            gloves: S('#9f8a6b'),
            boots: S('#9f8a6b')
        },
        'Woodland M81': {
            helmet: S('#4b5139'),
            face: S('#4b5139'),
            shirt: P('woodland_m81'),
            carrier: S('#4b5139'),
            belt: S('#4b5139'),
            pants: P('woodland_m81'),
            kneepads: S('#4b5139'),
            gloves: S('#7d6446'),
            boots: S('#1c1c1c')
        },
        'MultiCam Black': {
            helmet: S('#1c1c1c'),
            face: S('#1c1c1c'),
            shirt: P('multicam_black'),
            carrier: S('#1c1c1c'),
            belt: S('#1c1c1c'),
            pants: P('multicam_black'),
            kneepads: S('#1c1c1c'),
            gloves: S('#1c1c1c'),
            boots: S('#1c1c1c')
        },
        'Casual (denim + flannel)': {
            helmet: S('#1c1c1c'),
            face: S('#1c1c1c'),
            shirt: P('flannel_red'),
            carrier: S('#1c1c1c'),
            belt: S('#4e3d2d'),
            pants: P('denim_indigo'),
            kneepads: S('#1c1c1c'),
            gloves: S('#1c1c1c'),
            boots: S('#4e3d2d')
        },
        'Night / black': {
            helmet: S('#1c1c1c'),
            face: S('#1c1c1c'),
            shirt: S('#34373a'),
            carrier: S('#1c1c1c'),
            belt: S('#1c1c1c'),
            pants: S('#34373a'),
            kneepads: S('#1c1c1c'),
            gloves: S('#1c1c1c'),
            boots: S('#1c1c1c')
        },
        'Blue urban': {
            helmet: S('#1c1c1c'),
            face: S('#1c1c1c'),
            shirt: P('blue_urban'),
            carrier: S('#1c1c1c'),
            belt: S('#1c1c1c'),
            pants: P('blue_urban'),
            kneepads: S('#1c1c1c'),
            gloves: S('#1c1c1c'),
            boots: S('#1c1c1c')
        },
    };

    const state = {items: {}, globalScale: 1, warp: 14, exposure: 0.7, grade: 0.5, original: false};
    let active = 'pants';
    let renderer;
    const $ = (s) => document.querySelector(s);

    function clone(o) {
        return JSON.parse(JSON.stringify(o));
    }

    function applyPreset(name) {
        const p = PRESETS[name];
        A.items.forEach(k => {
            const prev = state.items[k];
            const src = p[k] || p[INHERIT[k]] || {type: 'original'};
            state.items[k] = {...clone(src), scale: prev ? prev.scale || 1 : 1};
        });
    }

    // ---------- URL sharing ----------
    function encode() {
        const parts = A.items.map(k => {
            const it = state.items[k];
            const v = it.type === 'pattern' ? 'p' + it.pattern : it.type === 'original' ? 'o' : 'c' + it.color.slice(1);
            return v + (it.scale && it.scale !== 1 ? '*' + it.scale : '');
        });
        return parts.join(',') + '~' + state.globalScale + '~' + state.warp + '~' + state.exposure + '~' + state.grade;
    }

    function decode(h) {
        try {
            const [items, gs, w, ex, gr] = decodeURIComponent(h).split('~');
            items.split(',').forEach((v, i) => {
                const k = A.items[i];
                if (!k) return;
                const [body, sc] = v.split('*');
                const it = body[0] === 'p' ? P(body.slice(1)) : body[0] === 'o' ? {type: 'original'} : S('#' + body.slice(1));
                it.scale = sc ? parseFloat(sc) : 1;
                state.items[k] = it;
            });
            if (gs) state.globalScale = parseFloat(gs);
            if (w) state.warp = parseFloat(w);
            if (ex) state.exposure = parseFloat(ex);
            if (gr) state.grade = parseFloat(gr);
            return true;
        } catch (e) {
            return false;
        }
    }

    // ---------- UI ----------
    let raf = 0;

    function draw() {
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = 0;
            syncLinked();
            renderer.render(state);
            try {
                history.replaceState(null, '', '#' + encode());
            } catch (e) { /* file:// in some browsers */
            }
        });
    }

    function swatchStyle(el, it) {
        if (it.type === 'pattern') {
            const p = allPatterns().find(x => x.id === it.pattern);
            el.style.background = p ? `url(${p.src}) center/200%` : '#777';
        } else if (it.type === 'original') {
            el.style.background = 'repeating-linear-gradient(45deg,#666 0 4px,#444 4px 8px)';
        } else el.style.background = it.color;
    }

    function describe(it) {
        if (it.type === 'pattern') {
            const p = allPatterns().find(x => x.id === it.pattern);
            return p ? p.name : it.pattern;
        }
        if (it.type === 'original') return 'Original photo';
        const s = SOLIDS.find(x => x[1].toLowerCase() === it.color.toLowerCase());
        return s ? s[0] : it.color.toUpperCase();
    }

    const custom = [];

    function allPatterns() {
        return A.patterns.concat(custom);
    }

    function buildItems() {
        const list = $('#items');
        list.innerHTML = '';
        DISPLAY.filter(k => A.items.includes(k)).concat(A.items.filter(k => !DISPLAY.includes(k))).filter(k => !LINKED[k]).forEach(k => {
            const it = state.items[k];
            const row = document.createElement('button');
            row.className = 'item' + (k === active ? ' active' : '');
            row.innerHTML = `<span class="sw"></span><span class="nm">${LABELS[k] || k}</span><span class="val"></span>`;
            swatchStyle(row.querySelector('.sw'), it);
            row.querySelector('.val').textContent = describe(it);
            row.onclick = () => {
                active = k;
                buildItems();
                buildPicker();
            };
            list.appendChild(row);
        });
    }

    function isCurrent(it) {
        const cur = state.items[active];
        if (it.type !== cur.type) return false;
        return it.type === 'pattern' ? it.pattern === cur.pattern : it.type === 'solid' ? it.color.toLowerCase() === cur.color.toLowerCase() : true;
    }

    function setActive(it) {
        state.items[active] = {...it, scale: state.items[active].scale || 1};
        buildItems();
        buildPicker();
        draw();
    }

    function buildPicker() {
        $('#pickerTitle').textContent = LABELS[active];
        const pg = $('#patterns');
        pg.innerHTML = '';
        const groups = [];
        allPatterns().forEach(p => {
            const g = p.group || 'Custom';
            if (!groups.includes(g)) groups.push(g);
        });
        groups.forEach(g => {
            const h = document.createElement('div');
            h.className = 'group';
            h.textContent = g;
            pg.appendChild(h);
            allPatterns().filter(p => (p.group || 'Custom') === g).forEach(p => {
                const b = document.createElement('button');
                b.className = 'tile' + (isCurrent({type: 'pattern', pattern: p.id}) ? ' on' : '');
                b.title = p.name;
                b.innerHTML = `<span class="img"></span><span class="cap">${p.name}</span>`;
                b.querySelector('.img').style.background = `url(${p.src}) center/200%`;
                b.onclick = () => setActive(P(p.id));
                pg.appendChild(b);
            });
        });
        const sg = $('#solids');
        sg.innerHTML = '';
        SOLIDS.forEach(([n, c]) => {
            const b = document.createElement('button');
            b.className = 'chip' + (isCurrent(S(c)) ? ' on' : '');
            b.title = n;
            b.style.background = c;
            b.onclick = () => setActive(S(c));
            sg.appendChild(b);
        });
        const cur = state.items[active];
        $('#customColor').value = cur.type === 'solid' ? cur.color : '#777777';
        $('#itemScale').value = cur.scale || 1;
        $('#itemScaleVal').textContent = (cur.scale || 1).toFixed(2) + '×';
        $('#scaleRow').style.opacity = cur.type === 'pattern' ? 1 : 0.4;
    }

    function buildPresets() {
        const el = $('#presets');
        el.innerHTML = '';
        Object.keys(PRESETS).forEach(n => {
            const b = document.createElement('button');
            b.className = 'preset';
            b.textContent = n;
            b.onclick = () => {
                applyPreset(n);
                buildItems();
                buildPicker();
                draw();
            };
            el.appendChild(b);
        });
    }

    function randomize() {
        const pats = allPatterns().filter(p => p.group === 'Camo').map(p => p.id);
        const base = SOLIDS[Math.floor(Math.random() * SOLIDS.length)][1];
        const camo = pats[Math.floor(Math.random() * pats.length)];
        A.items.forEach(k => {
            const r = Math.random();
            let it;
            if (k === 'shirt' || k === 'pants') it = r < 0.6 ? P(camo) : S(SOLIDS[Math.floor(Math.random() * SOLIDS.length)][1]);
            else if (['boots', 'gloves', 'headset', 'holster'].includes(k)) it = S(['#1c1c1c', '#7d6446', '#9f8a6b'][Math.floor(Math.random() * 3)]);
            else it = r < 0.2 ? P(camo) : S(base);
            state.items[k] = {...it, scale: 1};
        });
        buildItems();
        buildPicker();
        draw();
    }

    async function init() {
        const canvas = $('#view');
        try {
            renderer = new window.LoadoutRenderer(canvas, A, 2);
            await renderer.load();
        } catch (e) {
            $('#error').textContent = 'Could not start the renderer: ' + e.message;
            $('#error').hidden = false;
            return;
        }
        applyPreset('Ranger green');
        if (location.hash.length > 2) decode(location.hash.slice(1));
        $('#globalScale').value = state.globalScale;
        $('#warp').value = state.warp;
        $('#exposure').value = state.exposure;
        $('#grade').value = state.grade;
        buildPresets();
        buildItems();
        buildPicker();
        draw();
        document.body.classList.add('ready');

        $('#customColor').oninput = (e) => setActive(S(e.target.value));
        $('#keepOriginal').onclick = () => setActive({type: 'original'});
        $('#applyAll').onclick = () => {
            const cur = state.items[active];
            A.items.forEach(k => {
                state.items[k] = {...clone(cur), scale: state.items[k].scale || 1};
            });
            buildItems();
            draw();
        };
        $('#itemScale').oninput = (e) => {
            state.items[active].scale = parseFloat(e.target.value);
            $('#itemScaleVal').textContent = state.items[active].scale.toFixed(2) + '×';
            draw();
        };
        $('#globalScale').oninput = (e) => {
            state.globalScale = parseFloat(e.target.value);
            draw();
        };
        $('#warp').oninput = (e) => {
            state.warp = parseFloat(e.target.value);
            draw();
        };
        $('#exposure').oninput = (e) => {
            state.exposure = parseFloat(e.target.value);
            draw();
        };
        $('#grade').oninput = (e) => {
            state.grade = parseFloat(e.target.value);
            draw();
        };
        $('#random').onclick = randomize;

        const cmp = $('#compare');
        const on = (e) => {
            e.preventDefault();
            state.original = true;
            draw();
        };
        const off = () => {
            if (state.original) {
                state.original = false;
                draw();
            }
        };
        cmp.addEventListener('pointerdown', on);
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => cmp.addEventListener(ev, off));

        $('#export').onclick = () => {
            syncLinked();
            renderer.render(state);
            canvas.toBlob(b => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(b);
                a.download = 'loadout.png';
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            }, 'image/png');
        };
        $('#share').onclick = async () => {
            const url = location.href.split('#')[0] + '#' + encode();
            try {
                await navigator.clipboard.writeText(url);
                toast('Link copied');
            } catch (e) {
                prompt('Copy this link:', url);
            }
        };
        $('#upload').onchange = async (e) => {
            for (const f of e.target.files) {
                const src = await new Promise(r => {
                    const fr = new FileReader();
                    fr.onload = () => r(fr.result);
                    fr.readAsDataURL(f);
                });
                const id = 'custom' + (custom.length + 1);
                await renderer.addPattern(id, src, 1);
                custom.push({id, name: f.name.replace(/\.[^.]+$/, ''), src, scale: 1, group: 'Your uploads'});
            }
            e.target.value = '';
            buildPicker();
            toast('Pattern added for this session');
        };
    }

    function toast(msg) {
        const t = $('#toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toast.t);
        toast.t = setTimeout(() => t.classList.remove('show'), 1600);
    }

    window.addEventListener('DOMContentLoaded', init);
})();
