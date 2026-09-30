// WebGL2 compositor: base photo + per-item recolour/pattern transfer that keeps the photo's shading.
(function () {
  'use strict';

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

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
    return { p, u };
  }

  function loadImage(src) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  }

  class Renderer {
    constructor(canvas, assets, scale) {
      this.canvas = canvas;
      this.assets = assets;
      this.S = scale || 2;
      this.W = assets.width; this.H = assets.height;
      canvas.width = this.W * this.S * assets.angles.length;
      canvas.height = this.H * this.S;
      const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false });
      if (!gl) throw new Error('WebGL2 is not available in this browser.');
      this.gl = gl;
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      this.pBase = program(gl, FS_BASE);
      this.pItem = program(gl, FS_ITEM);
      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.patternTex = {};
    }

    texture(img, { repeat = false, mip = false } = {}) {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
      else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      return t;
    }

    async load() {
      this.angles = [];
      for (const a of this.assets.angles) {
        const [base, shade, ...masks] = await Promise.all([a.base, a.shade, ...a.masks].map(loadImage));
        this.angles.push({
          medians: a.medians,
          base: this.texture(base), shade: this.texture(shade),
          masks: masks.map(m => this.texture(m)),
        });
      }
      for (const p of this.assets.patterns) await this.addPattern(p.id, p.src, p.scale);
    }

    async addPattern(id, src, scale) {
      this.patternScale = this.patternScale || {};
      this.patternScale[id] = scale || 1;
      const img = await loadImage(src);
      // WebGL needs power-of-two textures for REPEAT + mipmaps; resample if needed
      let el = img;
      const pot = n => (n & (n - 1)) === 0;
      if (!pot(img.width) || !pot(img.height)) {
        const c = document.createElement('canvas'); c.width = c.height = 512;
        c.getContext('2d').drawImage(img, 0, 0, 512, 512); el = c;
      }
      this.patternTex[id] = this.texture(el, { repeat: true, mip: true });
    }

    // state: { items: {name: {type:'solid'|'pattern', color:'#rrggbb', pattern:id, scale:number}}, globalScale, warp, original }
    render(state) {
      const gl = this.gl, S = this.S, items = this.assets.items;
      gl.disable(gl.BLEND);
      this.angles.forEach((ang, ai) => {
        gl.viewport(ai * this.W * S, 0, this.W * S, this.H * S);
        gl.useProgram(this.pBase.p);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ang.base);
        gl.uniform1i(this.pBase.u.uBase, 0);
        gl.disable(gl.BLEND);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (state.original) return;

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        const P = this.pItem; gl.useProgram(P.p);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ang.shade); gl.uniform1i(P.u.uShade, 0);
        gl.uniform1i(P.u.uMask, 1); gl.uniform1i(P.u.uPattern, 2);
        gl.uniform2f(P.u.uImgSize, this.W, this.H);
        gl.uniform1f(P.u.uWarp, state.warp);
        gl.uniform1f(P.u.uExposure, state.exposure);
        gl.uniform1f(P.u.uGrade, state.grade);
        gl.uniform3fv(P.u.uTint, this.assets.tint || [1, 1, 1]);
        items.forEach((name, i) => {
          const it = state.items[name];
          if (!it || it.type === 'original') return;
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ang.masks[Math.floor(i / 3)]);
          const ch = [0, 0, 0]; ch[i % 3] = 1; gl.uniform3fv(P.u.uChannel, ch);
          gl.uniform1f(P.u.uMedian, Math.max(ang.medians[name], 0.004));
          gl.uniform1f(P.u.uContrast, ['boots', 'belt', 'holster', 'chestpouch'].includes(name) ? 0.8 : 1.0);
          if (it.type === 'solid' || !this.patternTex[it.pattern]) {
            gl.uniform1i(P.u.uSolid, 1);
            gl.uniform3fv(P.u.uColor, hexToRgb(it.color || '#777777'));
          } else {
            gl.uniform1i(P.u.uSolid, 0);
            gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.patternTex[it.pattern]);
            gl.uniform1f(P.u.uTile, 190 * state.globalScale * (it.scale || 1) * (ITEM_SCALE[name] || 1) * (this.patternScale[it.pattern] || 1));
            // per-item offset so neighbouring garments don't line up unnaturally
            gl.uniform2f(P.u.uOffset, (i * 0.37) % 1, (i * 0.61) % 1);
            gl.uniform1f(P.u.uAngle, 0);
          }
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        });
      });
      gl.disable(gl.BLEND);
    }
  }

  // smaller prints on small, curved items
  const ITEM_SCALE = { helmet: 0.75, face: 0.7, gloves: 0.6, boots: 0.7, kneepads: 0.8, headset: 0.5, holster: 0.6, hippouch: 0.6, chestpouch: 0.7 };

  function hexToRgb(h) {
    h = h.replace('#', '');
    return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255);
  }

  window.LoadoutRenderer = Renderer;
})();
