// Fixed data about the gear items and the colour palette.
// Every app file adds itself to the shared `window.Loadout` namespace.
(function (L) {
  "use strict";

  L.LABELS = {
    helmet: "Helmet",
    face: "Face cover",
    shirt: "Combat shirt",
    carrier: "Plate carrier, pack & pouches",
    belt: "Belt",
    pants: "Pants",
    kneepads: "Knee pads",
    gloves: "Gloves",
    boots: "Boots",
    headset: "Headset",
    holster: "Pistol holster",
    hippouch: "Belt pouch",
    chestpouch: "Chest pouches",
  };

  // order in the gear list (render order comes from the assets)
  L.DISPLAY = [
    "helmet",
    "headset",
    "face",
    "shirt",
    "carrier",
    "chestpouch",
    "belt",
    "holster",
    "hippouch",
    "pants",
    "kneepads",
    "gloves",
    "boots",
  ];

  // items a preset doesn't mention borrow from a related item
  L.INHERIT = { holster: "belt", hippouch: "belt", chestpouch: "carrier" };

  // items that always follow another item's selection (hidden from the gear list)
  L.LINKED = { chestpouch: "carrier" };

  L.SOLIDS = [
    ["Black", "#1c1c1c"],
    ["Charcoal", "#34373a"],
    ["Wolf grey", "#5b5e60"],
    ["Ranger green", "#4b5139"],
    ["OD green", "#555a36"],
    ["Foliage", "#737457"],
    ["Coyote", "#7d6446"],
    ["Tan 499", "#9f8a6b"],
    ["Khaki", "#b9a784"],
    ["Brown", "#4e3d2d"],
    ["Navy", "#222b43"],
    ["Police blue", "#2f3f63"],
  ];

  // item selection builders
  L.solid = (color) => ({ type: "solid", color });
  L.pattern = (id) => ({ type: "pattern", pattern: id });
  L.ORIGINAL = Object.freeze({ type: "original" });
})((window.Loadout = window.Loadout || {}));
