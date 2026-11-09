// Small DOM helpers shared by the UI files.
(function (L) {
  "use strict";

  L.$ = (selector) => document.querySelector(selector);

  // element with optional class and text (text is never parsed as HTML)
  L.el = function (tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  let toastTimer = 0;
  L.toast = function (msg) {
    const t = L.$("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
  };

  L.copy = async function (text, done) {
    try {
      await navigator.clipboard.writeText(text);
      L.toast(done);
    } catch (e) {
      prompt("Copy this:", text);
    }
  };
})((window.Loadout = window.Loadout || {}));
