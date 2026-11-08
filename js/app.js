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
        'DPM': {
            helmet: S('#555a36'),
            face: S('#555a36'),
            shirt: P('dpm'),
            carrier: S('#555a36'),
            belt: S('#555a36'),
            pants: P('dpm'),
            kneepads: S('#555a36'),
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
        'Casual (denim + plaid)': {
            helmet: S('#1c1c1c'),
            face: S('#1c1c1c'),
            shirt: P('plaid_red'),
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

    // element with optional class and text (text is never parsed as HTML)
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
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

    // number from a share link, clamped to the slider's range; NaN or missing keeps the fallback
    function num(v, lo, hi, fallback) {
        const n = parseFloat(v);
        return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
    }

    function decode(h) {
        try {
            const [items, gs, w, ex, gr] = decodeURIComponent(h).split('~');
            items.split(',').forEach((v, i) => {
                const k = A.items[i];
                if (!k) return;
                const [body, sc] = v.split('*');
                let it;
                if (body[0] === 'p') {
                    // links made before a pattern was removed fall back to the original photo
                    it = allPatterns().some(p => p.id === body.slice(1)) ? P(body.slice(1)) : {type: 'original'};
                } else if (body[0] === 'c' && /^[0-9a-f]{6}$/i.test(body.slice(1))) {
                    it = S('#' + body.slice(1));
                } else {
                    it = {type: 'original'};
                }
                it.scale = num(sc, 0.4, 2.5, 1);
                state.items[k] = it;
            });
            state.globalScale = num(gs, 0.4, 2.5, state.globalScale);
            state.warp = num(w, 0, 40, state.warp);
            state.exposure = num(ex, 0.35, 1.3, state.exposure);
            state.grade = num(gr, 0, 1, state.grade);
            return true;
        } catch (e) {
            return false;
        }
    }

    function shareUrl() {
        return location.href.split('#')[0] + '#' + encode();
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
            row.setAttribute('aria-pressed', k === active);
            const sw = el('span', 'sw');
            swatchStyle(sw, it);
            row.append(sw, el('span', 'nm', LABELS[k] || k), el('span', 'val', describe(it)));
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
                const on = isCurrent({type: 'pattern', pattern: p.id});
                b.className = 'tile' + (on ? ' on' : '');
                b.setAttribute('aria-pressed', on);
                b.title = p.credit ? `${p.name}\nSource: ${p.credit.title} (${p.credit.site}, ${p.credit.license})` : p.name;
                const img = el('span', 'img');
                img.style.background = `url(${p.src}) center/200%`;
                b.append(img, el('span', 'cap', p.name));
                b.onclick = () => setActive(P(p.id));
                pg.appendChild(b);
            });
        });
        const sg = $('#solids');
        sg.innerHTML = '';
        SOLIDS.forEach(([n, c]) => {
            const b = document.createElement('button');
            b.className = 'chip' + (isCurrent(S(c)) ? ' on' : '');
            b.setAttribute('aria-pressed', isCurrent(S(c)));
            b.title = n;
            b.setAttribute('aria-label', n);
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
        $('#share').onclick = () => copy(shareUrl(), 'Link copied');
        initFeedback();
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

    async function copy(text, done) {
        try {
            await navigator.clipboard.writeText(text);
            toast(done);
        } catch (e) {
            prompt('Copy this:', text);
        }
    }

    // ---------- feedback ----------
    // The site has no server, so the form is relayed to email by FormSubmit (formsubmit.co).
    // The first submission sends a one-time activation email; after activating, FormSubmit also
    // emails a random alias that can replace the address below so it isn't public.
    const FEEDBACK_ENDPOINT = 'https://formsubmit.co/ajax/c1b44d8c0e8e8c7d5eb802ea9cf41123';
    const REPO = 'https://github.com/FilipRaic/loadout-builder';
    const KINDS = {
        bug: {prefix: 'Bug', label: 'bug'},
        idea: {prefix: 'Idea', label: 'enhancement'},
        pattern: {prefix: 'Pattern request', label: 'pattern request'},
        other: {prefix: 'Feedback', label: ''},
    };

    function initFeedback() {
        const dlg = $('#feedbackDlg'), form = $('#feedbackForm');
        const status = $('#fbStatus'), send = $('#fbSend');
        // what the form says and does for each "Send via" choice
        const VIA = {
            email: {note: 'Sent straight to my inbox. No account needed.', button: 'Send'},
            github: {
                note: 'Opens a pre-filled public issue on GitHub. You need a GitHub account.',
                button: 'Continue on GitHub'
            },
        };
        const via = () => form.elements.via.value;
        const showVia = () => {
            const v = VIA[via()];
            setStatus(v.note);
            send.textContent = v.button;
            $('#fbEmailField').hidden = via() !== 'email';
        };
        form.elements.via.forEach(r => r.addEventListener('change', showVia));
        const setStatus = (text, error) => {
            status.textContent = text;
            status.classList.toggle('error', !!error);
        };
        const openIssue = (m) => {
            const q = new URLSearchParams({title: m.title, body: m.body});
            if (m.label) q.set('labels', m.label);
            window.open(`${REPO}/issues/new?${q}`, '_blank', 'noopener');
        };
        const open = (kind) => {
            form.reset();
            send.disabled = false;
            if (kind) form.elements.kind.value = kind;
            showVia();
            dlg.showModal();
            form.elements.title.focus();
        };
        const compose = () => {
            const f = form.elements, k = KINDS[f.kind.value] || KINDS.other;
            const lines = [f.body.value.trim() || '(No details given)'];
            if (f.loadout.checked) lines.push('', `Loadout: ${shareUrl()}`);
            lines.push('', '---', `Browser: ${navigator.userAgent}`, `Screen: ${innerWidth}×${innerHeight}`);
            return {title: `${k.prefix}: ${f.title.value.trim()}`, body: lines.join('\n'), label: k.label};
        };
        $('#feedback').onclick = () => open();
        $('#requestPattern').onclick = (e) => {
            e.preventDefault();
            open('pattern');
        };
        $('#fbCancel').onclick = () => dlg.close();
        form.onsubmit = async (e) => {
            e.preventDefault();
            const f = form.elements, m = compose();
            if (via() === 'github') {
                openIssue(m);
                dlg.close();
                toast('Thanks! Finish the issue on GitHub');
                return;
            }
            send.disabled = true;
            setStatus('Sending…');
            try {
                const res = await fetch(FEEDBACK_ENDPOINT, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
                    body: JSON.stringify({
                        _subject: `Loadout Builder: ${m.title}`, _template: 'box', _honey: f._honey.value,
                        email: f.email.value.trim() || undefined,  // FormSubmit uses it as Reply-To
                        type: f.kind.value, summary: f.title.value.trim(), message: m.body,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || String(data.success) !== 'true') throw new Error(data.message || res.statusText);
                dlg.close();
                toast('Thanks! Feedback sent');
            } catch (err) {
                send.disabled = false;
                setStatus(`Couldn't send the email (${err.message || 'network error'}). ` +
                    'Please try again, or choose GitHub issue above.', true);
            }
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
