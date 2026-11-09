// The current loadout and the helpers that change it. The renderer draws straight from `state`.
(function (L) {
  "use strict";

  const A = (L.assets = window.LOADOUT_ASSETS);

  L.state = {
    items: {},
    globalScale: 1,
    warp: 14,
    exposure: 0.7,
    grade: 0.5,
    original: false,
  };

  // the gear item the picker is editing
  L.ui = { active: "pants" };

  // patterns uploaded this session
  L.customPatterns = [];

  L.allPatterns = () => A.patterns.concat(L.customPatterns);
  L.findPattern = (id) => L.allPatterns().find((p) => p.id === id);

  L.clone = (o) => JSON.parse(JSON.stringify(o));

  L.syncLinked = function () {
    const items = L.state.items;
    Object.entries(L.LINKED).forEach(([k, src]) => {
      if (A.items.includes(k) && items[src]) items[k] = L.clone(items[src]);
    });
  };

  L.applyPreset = function (name) {
    const p = L.PRESETS[name];
    A.items.forEach((k) => {
      const prev = L.state.items[k];
      const src = p[k] || p[L.INHERIT[k]] || L.ORIGINAL;
      L.state.items[k] = { ...L.clone(src), scale: prev ? prev.scale || 1 : 1 };
    });
  };

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  L.randomize = function () {
    const camos = L.allPatterns()
      .filter((p) => p.group === "Camo")
      .map((p) => p.id);
    const randomSolid = () => pick(L.SOLIDS)[1];
    const base = randomSolid();
    const camo = pick(camos);
    A.items.forEach((k) => {
      const r = Math.random();
      let it;
      if (k === "shirt" || k === "pants")
        it = r < 0.6 ? L.pattern(camo) : L.solid(randomSolid());
      else if (["boots", "gloves", "headset", "holster"].includes(k))
        it = L.solid(pick(["#1c1c1c", "#7d6446", "#9f8a6b"]));
      else it = r < 0.2 ? L.pattern(camo) : L.solid(base);
      L.state.items[k] = { ...it, scale: 1 };
    });
  };
})((window.Loadout = window.Loadout || {}));
