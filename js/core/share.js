// Share links: the whole loadout is packed into the URL hash.
// Format: item,item,…~globalScale~warp~exposure~grade, where each item is
// p<patternId> | c<rrggbb> | o (original), optionally followed by *<scale>.
(function (L) {
  "use strict";

  L.encode = function () {
    const s = L.state;
    const parts = L.assets.items.map((k) => {
      const it = s.items[k];
      const v =
        it.type === "pattern"
          ? "p" + it.pattern
          : it.type === "original"
            ? "o"
            : "c" + it.color.slice(1);
      return v + (it.scale && it.scale !== 1 ? "*" + it.scale : "");
    });
    return [parts.join(","), s.globalScale, s.warp, s.exposure, s.grade].join(
      "~",
    );
  };

  // number from a share link, clamped to the slider's range; NaN or missing keeps the fallback
  function num(v, lo, hi, fallback) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  }

  function decodeItem(body) {
    if (body[0] === "p") {
      // links made before a pattern was removed fall back to the original photo
      return L.findPattern(body.slice(1))
        ? L.pattern(body.slice(1))
        : { ...L.ORIGINAL };
    }
    if (body[0] === "c" && /^[0-9a-f]{6}$/i.test(body.slice(1)))
      return L.solid("#" + body.slice(1));
    return { ...L.ORIGINAL };
  }

  L.decode = function (hash) {
    const s = L.state;
    try {
      const [items, gs, w, ex, gr] = decodeURIComponent(hash).split("~");
      items.split(",").forEach((v, i) => {
        const k = L.assets.items[i];
        if (!k) return;
        const [body, sc] = v.split("*");
        s.items[k] = { ...decodeItem(body), scale: num(sc, 0.4, 2.5, 1) };
      });
      s.globalScale = num(gs, 0.4, 2.5, s.globalScale);
      s.warp = num(w, 0, 40, s.warp);
      s.exposure = num(ex, 0.35, 1.3, s.exposure);
      s.grade = num(gr, 0, 1, s.grade);
      return true;
    } catch (e) {
      return false;
    }
  };

  L.shareUrl = () => location.href.split("#")[0] + "#" + L.encode();
})((window.Loadout = window.Loadout || {}));
