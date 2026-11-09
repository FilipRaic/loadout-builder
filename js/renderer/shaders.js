// GLSL shaders for the WebGL2 compositor (see renderer.js).
(function () {
  "use strict";

  const VS = `#version 300 es
  in vec2 aPos;
  out vec2 vUv;
  void main() {
    vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);   // image rows top-down
    gl_Position = vec4(aPos, 0.0, 1.0);
  }`;

  const FS_BASE = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uBase;
  out vec4 o;
  void main() { o = vec4(texture(uBase, vUv).rgb, 1.0); }`;

  const FS_ITEM = `#version 300 es
  precision highp float;
  in vec2 vUv;
  uniform sampler2D uShade;     // r: luminance, g: blurred luminance (sRGB encoded)
  uniform sampler2D uMask;      // item masks packed in rgb
  uniform sampler2D uPattern;
  uniform vec3  uChannel;       // selects the item's channel in uMask
  uniform vec2  uImgSize;       // source image size in px
  uniform float uMedian;        // item's median luminance (linear)
  uniform float uContrast;      // shading strength
  uniform int   uSolid;
  uniform vec3  uColor;         // solid colour (sRGB)
  uniform float uTile;          // pattern tile size in source px
  uniform vec2  uOffset;
  uniform float uAngle;
  uniform float uWarp;          // fold displacement strength
  uniform vec3  uTint;          // photo colour cast, partially applied
  uniform float uGrade;
  uniform float uExposure;      // scene lighting: how bright a swatch colour appears in this photo
  out vec4 o;

  vec3  toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
  float toLin(float c){ return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
  vec3  toSrgb(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }

  void main() {
    float m = dot(texture(uMask, vUv).rgb, uChannel);
    if (m < 0.003) discard;

    float Y = toLin(texture(uShade, vUv).r);
    float s = pow(max(Y, 1e-4) / uMedian, uContrast);
    s = clamp(s, 0.0, 4.0);

    vec3 albedo;
    if (uSolid == 1) {
      albedo = toLin(uColor);
    } else {
      // Displace pattern lookup along the gradient of the blurred shading, so
      // prints bend into folds instead of sitting flat like a sticker.
      vec2 px = 1.0 / uImgSize;
      float gx = toLin(texture(uShade, vUv + vec2(2.0*px.x, 0)).g) - toLin(texture(uShade, vUv - vec2(2.0*px.x, 0)).g);
      float gy = toLin(texture(uShade, vUv + vec2(0, 2.0*px.y)).g) - toLin(texture(uShade, vUv - vec2(0, 2.0*px.y)).g);
      vec2 disp = vec2(gx, gy) / uMedian;
      vec2 p = vUv * uImgSize + uWarp * disp;
      float c = cos(uAngle), sn = sin(uAngle);
      p = mat2(c, -sn, sn, c) * p;
      albedo = toLin(texture(uPattern, p / uTile + uOffset).rgb);
    }
    float al = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
    albedo = mix(albedo, vec3(al), 0.3 * uGrade);                 // photo is slightly desaturated
    albedo *= mix(vec3(1.0), uTint, uGrade);                      // and warm
    vec3 col = albedo * s * uExposure;
    // gentle highlight roll-off instead of hard clipping
    col = col / (1.0 + max(col - 0.85, 0.0) * 1.5);
    o = vec4(toSrgb(col) * m, m);   // premultiplied
  }`;

  window.LoadoutShaders = { VS, FS_BASE, FS_ITEM };
})();
