// Sidebar: presets, the gear list and the pattern/colour picker for the active item.
(function (L) {
  "use strict";

  const { $, el } = L;

  function swatchStyle(node, it) {
    if (it.type === "pattern") {
      const p = L.findPattern(it.pattern);
      node.style.background = p ? `url(${p.src}) center/200%` : "#777";
    } else if (it.type === "original") {
      node.style.background =
        "repeating-linear-gradient(45deg,#666 0 4px,#444 4px 8px)";
    } else node.style.background = it.color;
  }

  function describe(it) {
    if (it.type === "pattern") {
      const p = L.findPattern(it.pattern);
      return p ? p.name : it.pattern;
    }
    if (it.type === "original") return "Original photo";
    const s = L.SOLIDS.find(
      (x) => x[1].toLowerCase() === it.color.toLowerCase(),
    );
    return s ? s[0] : it.color.toUpperCase();
  }

  // items in display order, then any the list doesn't know about; linked items are hidden
  function visibleItems() {
    const all = L.assets.items;
    return L.DISPLAY.filter((k) => all.includes(k))
      .concat(all.filter((k) => !L.DISPLAY.includes(k)))
      .filter((k) => !L.LINKED[k]);
  }

  L.buildItems = function () {
    const list = $("#items");
    list.innerHTML = "";
    visibleItems().forEach((k) => {
      const it = L.state.items[k];
      const row = el("button", "item" + (k === L.ui.active ? " active" : ""));
      row.setAttribute("aria-pressed", k === L.ui.active);
      const sw = el("span", "sw");
      swatchStyle(sw, it);
      row.append(
        sw,
        el("span", "nm", L.LABELS[k] || k),
        el("span", "val", describe(it)),
      );
      row.onclick = () => {
        L.ui.active = k;
        L.refreshPanels();
      };
      list.appendChild(row);
    });
  };

  function isCurrent(it) {
    const cur = L.state.items[L.ui.active];
    if (it.type !== cur.type) return false;
    if (it.type === "pattern") return it.pattern === cur.pattern;
    if (it.type === "solid")
      return it.color.toLowerCase() === cur.color.toLowerCase();
    return true;
  }

  // replace the active item's selection, keeping its pattern size
  L.setActive = function (it) {
    const k = L.ui.active;
    L.state.items[k] = { ...it, scale: L.state.items[k].scale || 1 };
    L.refreshPanels();
    L.draw();
  };

  function patternTile(p) {
    const on = isCurrent(L.pattern(p.id));
    const b = el("button", "tile" + (on ? " on" : ""));
    b.setAttribute("aria-pressed", on);
    b.title = p.credit
      ? `${p.name}\nSource: ${p.credit.title} (${p.credit.site}, ${p.credit.license})`
      : p.name;
    const img = el("span", "img");
    img.style.background = `url(${p.src}) center/200%`;
    b.append(img, el("span", "cap", p.name));
    b.onclick = () => L.setActive(L.pattern(p.id));
    return b;
  }

  function solidChip([name, color]) {
    const on = isCurrent(L.solid(color));
    const b = el("button", "chip" + (on ? " on" : ""));
    b.setAttribute("aria-pressed", on);
    b.title = name;
    b.setAttribute("aria-label", name);
    b.style.background = color;
    b.onclick = () => L.setActive(L.solid(color));
    return b;
  }

  L.buildPicker = function () {
    $("#pickerTitle").textContent = L.LABELS[L.ui.active];

    // pattern tiles, grouped in the order groups first appear
    const pg = $("#patterns");
    pg.innerHTML = "";
    const groupOf = (p) => p.group || "Custom";
    const groups = [...new Set(L.allPatterns().map(groupOf))];
    groups.forEach((g) => {
      pg.appendChild(el("div", "group", g));
      L.allPatterns()
        .filter((p) => groupOf(p) === g)
        .forEach((p) => pg.appendChild(patternTile(p)));
    });

    const sg = $("#solids");
    sg.innerHTML = "";
    L.SOLIDS.forEach((s) => sg.appendChild(solidChip(s)));

    const cur = L.state.items[L.ui.active];
    $("#customColor").value = cur.type === "solid" ? cur.color : "#777777";
    $("#itemScale").value = cur.scale || 1;
    $("#itemScaleVal").textContent = (cur.scale || 1).toFixed(2) + "×";
    $("#scaleRow").style.opacity = cur.type === "pattern" ? 1 : 0.4;
  };

  L.refreshPanels = function () {
    L.buildItems();
    L.buildPicker();
  };

  L.buildPresets = function () {
    const list = $("#presets");
    list.innerHTML = "";
    Object.keys(L.PRESETS).forEach((name) => {
      const b = el("button", "preset", name);
      b.onclick = () => {
        L.applyPreset(name);
        L.refreshPanels();
        L.draw();
      };
      list.appendChild(b);
    });
  };
})((window.Loadout = window.Loadout || {}));
