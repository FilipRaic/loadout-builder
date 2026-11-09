// Entry point: starts the renderer, restores a shared loadout and wires up the controls.
(function (L) {
  "use strict";

  const { $, state } = L;
  let renderer;
  let raf = 0;

  // redraw on the next frame (repeated calls in the same frame are merged) and keep the URL current
  L.draw = function () {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      L.syncLinked();
      renderer.render(state);
      try {
        history.replaceState(null, "", "#" + L.encode());
      } catch (e) {
        /* file:// in some browsers */
      }
    });
  };

  // global "Rendering" sliders; each input id matches its key in `state`
  const SLIDERS = ["globalScale", "warp", "exposure", "grade"];

  function bindPicker() {
    $("#customColor").oninput = (e) => L.setActive(L.solid(e.target.value));
    $("#keepOriginal").onclick = () => L.setActive(L.ORIGINAL);
    $("#applyAll").onclick = () => {
      const cur = state.items[L.ui.active];
      L.assets.items.forEach((k) => {
        state.items[k] = { ...L.clone(cur), scale: state.items[k].scale || 1 };
      });
      L.buildItems();
      L.draw();
    };
    $("#itemScale").oninput = (e) => {
      const it = state.items[L.ui.active];
      it.scale = parseFloat(e.target.value);
      $("#itemScaleVal").textContent = it.scale.toFixed(2) + "×";
      L.draw();
    };
    $("#upload").onchange = async (e) => {
      for (const f of e.target.files) {
        const src = await readAsDataUrl(f);
        const id = "custom" + (L.customPatterns.length + 1);
        await renderer.addPattern(id, src, 1);
        L.customPatterns.push({
          id,
          name: f.name.replace(/\.[^.]+$/, ""),
          src,
          scale: 1,
          group: "Your uploads",
        });
      }
      e.target.value = "";
      L.buildPicker();
      L.toast("Pattern added for this session");
    };
  }

  function bindRenderingSliders() {
    SLIDERS.forEach((key) => {
      const input = $("#" + key);
      input.value = state[key];
      input.oninput = () => {
        state[key] = parseFloat(input.value);
        L.draw();
      };
    });
  }

  function bindToolbar(canvas) {
    $("#random").onclick = () => {
      L.randomize();
      L.refreshPanels();
      L.draw();
    };

    // "Hold: original" shows the source photo while pressed
    const cmp = $("#compare");
    cmp.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      state.original = true;
      L.draw();
    });
    const release = () => {
      if (!state.original) return;
      state.original = false;
      L.draw();
    };
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) =>
      cmp.addEventListener(ev, release),
    );

    $("#export").onclick = () => {
      L.syncLinked();
      renderer.render(state);
      canvas.toBlob((b) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = "loadout.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }, "image/png");
    };
    $("#share").onclick = () => L.copy(L.shareUrl(), "Link copied");
  }

  function readAsDataUrl(file) {
    return new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(file);
    });
  }

  async function init() {
    const canvas = $("#view");
    try {
      renderer = new window.LoadoutRenderer(canvas, L.assets, 2);
      await renderer.load();
    } catch (e) {
      $("#error").textContent = "Could not start the renderer: " + e.message;
      $("#error").hidden = false;
      return;
    }
    L.applyPreset("Ranger green");
    if (location.hash.length > 2) L.decode(location.hash.slice(1));

    L.buildPresets();
    L.refreshPanels();
    bindPicker();
    bindRenderingSliders();
    bindToolbar(canvas);
    L.initFeedback();
    L.draw();
    document.body.classList.add("ready");
  }

  window.addEventListener("DOMContentLoaded", init);
})((window.Loadout = window.Loadout || {}));
