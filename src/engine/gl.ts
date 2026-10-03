/**
 * GPU effect pipeline. A single WebGL canvas runs fragment shaders over a
 * 2D-canvas source; results are drawn back with drawImage. Colors are kept
 * premultiplied throughout, shaders that change color un-premultiply first.
 */

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const HEAD = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_time;
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec4 unpre(vec4 c) { return c.a > 0.0001 ? vec4(c.rgb / c.a, c.a) : vec4(0.0); }
vec4 pre(vec4 c) { return vec4(c.rgb * c.a, c.a); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec4 tex(vec2 uv) { return texture2D(u_tex, uv); }
vec4 texClip(vec2 uv) {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(u_tex, uv);
}
`;

export const SHADERS: Record<string, string> = {
  copy: `void main() { gl_FragColor = tex(v_uv); }`,

  blur: `
uniform vec2 u_dir; uniform float u_sigma;
void main() {
  if (u_sigma < 0.3) { gl_FragColor = tex(v_uv); return; }
  float st = max(1.0, u_sigma * 3.0 / 16.0);
  vec4 sum = vec4(0.0); float ws = 0.0;
  for (int i = -16; i <= 16; i++) {
    float x = float(i) * st;
    float w = exp(-0.5 * x * x / (u_sigma * u_sigma));
    sum += texClip(v_uv + u_dir * x / u_res) * w;
    ws += w;
  }
  gl_FragColor = sum / ws;
}`,

  dirBlur: `
uniform vec2 u_vec;
void main() {
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 32; i++) {
    float k = float(i) / 31.0 - 0.5;
    sum += texClip(v_uv + u_vec * k / u_res);
  }
  gl_FragColor = sum / 32.0;
}`,

  zoomBlur: `
uniform vec2 u_center; uniform float u_amount;
void main() {
  vec4 sum = vec4(0.0);
  vec2 d = v_uv - u_center;
  for (int i = 0; i < 32; i++) {
    float k = 1.0 - u_amount * float(i) / 31.0;
    sum += texClip(u_center + d * k);
  }
  gl_FragColor = sum / 32.0;
}`,

  outline: `
uniform float u_width; uniform vec4 u_color;
void main() {
  vec4 c = tex(v_uv);
  float a = c.a;
  for (int r = 1; r <= 4; r++) {
    float rad = u_width * float(r) / 4.0;
    for (int i = 0; i < 24; i++) {
      float ang = float(i) * 0.261799;
      a = max(a, texClip(v_uv + vec2(cos(ang), sin(ang)) * rad / u_res).a);
    }
  }
  vec4 o = vec4(u_color.rgb * u_color.a, u_color.a) * a;
  gl_FragColor = c + o * (1.0 - c.a);
}`,

  color: `
uniform float u_bright; uniform float u_contrast; uniform float u_sat; uniform float u_hue; uniform float u_temp;
vec3 hueShift(vec3 col, float a) {
  const vec3 k = vec3(0.57735);
  float c = cos(a);
  return col * c + cross(k, col) * sin(a) + k * dot(k, col) * (1.0 - c);
}
void main() {
  vec4 c = unpre(tex(v_uv));
  vec3 rgb = c.rgb + u_bright;
  rgb = (rgb - 0.5) * u_contrast + 0.5;
  rgb = mix(vec3(lum(rgb)), rgb, u_sat);
  rgb = hueShift(rgb, u_hue);
  rgb += vec3(u_temp, u_temp * 0.2, -u_temp);
  gl_FragColor = pre(vec4(clamp(rgb, 0.0, 1.0), c.a));
}`,

  tint: `
uniform vec4 u_color; uniform float u_amount;
void main() {
  vec4 c = unpre(tex(v_uv));
  float l = lum(c.rgb);
  vec3 t = u_color.rgb;
  vec3 r = l < 0.5 ? 2.0 * l * t : 1.0 - 2.0 * (1.0 - l) * (1.0 - t);
  gl_FragColor = pre(vec4(mix(c.rgb, r, u_amount), c.a));
}`,

  duotone: `
uniform vec4 u_dark; uniform vec4 u_light; uniform float u_amount;
void main() {
  vec4 c = unpre(tex(v_uv));
  vec3 r = mix(u_dark.rgb, u_light.rgb, smoothstep(0.0, 1.0, lum(c.rgb)));
  gl_FragColor = pre(vec4(mix(c.rgb, r, u_amount), c.a));
}`,

  mul: `
uniform vec4 u_color; uniform float u_gain;
void main() { vec4 c = tex(v_uv); gl_FragColor = vec4(c.rgb * u_color.rgb, c.a) * u_gain; }`,

  fill: `
uniform vec4 u_color;
void main() { float a = tex(v_uv).a * u_color.a; gl_FragColor = vec4(u_color.rgb * a, a); }`,

  invert: `
uniform float u_amount;
void main() { vec4 c = unpre(tex(v_uv)); gl_FragColor = pre(vec4(mix(c.rgb, 1.0 - c.rgb, u_amount), c.a)); }`,

  posterize: `
uniform float u_levels;
void main() { vec4 c = unpre(tex(v_uv)); float n = u_levels - 1.0; gl_FragColor = pre(vec4(floor(c.rgb * n + 0.5) / n, c.a)); }`,

  threshold: `
uniform float u_level;
void main() { vec4 c = unpre(tex(v_uv)); float v = step(u_level, lum(c.rgb)); gl_FragColor = pre(vec4(vec3(v), c.a)); }`,

  chromaKey: `
uniform vec4 u_key; uniform float u_tol; uniform float u_soft; uniform float u_spill;
vec2 cbcr(vec3 c) { return vec2(-0.1687 * c.r - 0.3313 * c.g + 0.5 * c.b, 0.5 * c.r - 0.4187 * c.g - 0.0813 * c.b); }
void main() {
  vec4 c = unpre(tex(v_uv));
  float d = distance(cbcr(c.rgb), cbcr(u_key.rgb)) / 0.7;
  float a = smoothstep(u_tol, u_tol + u_soft + 0.0001, d);
  float spill = (1.0 - smoothstep(u_tol, u_tol + u_soft + 0.35, d)) * u_spill;
  vec3 rgb = mix(c.rgb, vec3(lum(c.rgb)), spill);
  gl_FragColor = pre(vec4(rgb, c.a * a));
}`,

  lumaKey: `
uniform float u_level; uniform float u_soft;
void main() { vec4 c = unpre(tex(v_uv)); float a = smoothstep(u_level, u_level + u_soft + 0.0001, lum(c.rgb)); gl_FragColor = pre(vec4(c.rgb, c.a * a)); }`,

  pixelate: `
uniform float u_size;
void main() {
  vec2 cell = vec2(u_size) / u_res;
  gl_FragColor = tex((floor(v_uv / cell) + 0.5) * cell);
}`,

  wave: `
uniform float u_amp; uniform float u_len; uniform float u_speed; uniform vec2 u_dir;
void main() {
  vec2 p = v_uv * u_res;
  vec2 perp = vec2(-u_dir.y, u_dir.x);
  float ph = dot(p, perp) / u_len * 6.28318 - u_time * u_speed * 6.28318;
  p += u_dir * u_amp * sin(ph);
  gl_FragColor = texClip(p / u_res);
}`,

  swirl: `
uniform vec2 u_center; uniform float u_angle; uniform float u_radius;
void main() {
  vec2 p = v_uv * u_res - u_center;
  float d = length(p);
  if (d < u_radius) {
    float k = 1.0 - d / u_radius;
    float a = u_angle * k * k;
    float s = sin(a), c = cos(a);
    p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  }
  gl_FragColor = texClip((p + u_center) / u_res);
}`,

  bulge: `
uniform vec2 u_center; uniform float u_amount; uniform float u_radius;
void main() {
  vec2 p = v_uv * u_res - u_center;
  float d = length(p);
  if (d < u_radius && d > 0.0) {
    float k = d / u_radius;
    float nk = u_amount >= 0.0 ? pow(k, 1.0 + u_amount * 1.5) : pow(k, 1.0 / (1.0 - u_amount * 1.5));
    nk = mix(nk, k, smoothstep(0.85, 1.0, k));
    p = p / d * nk * u_radius;
  }
  gl_FragColor = texClip((p + u_center) / u_res);
}`,

  kaleido: `
uniform vec2 u_center; uniform float u_segments; uniform float u_angle;
void main() {
  vec2 p = v_uv * u_res - u_center;
  float r = length(p);
  float a = atan(p.y, p.x) - u_angle;
  float seg = 6.28318 / u_segments;
  a = mod(a, seg);
  if (a > seg * 0.5) a = seg - a;
  a += u_angle;
  p = vec2(cos(a), sin(a)) * r;
  gl_FragColor = texClip((p + u_center) / u_res);
}`,

  mirror: `
uniform vec2 u_center; uniform vec2 u_normal;
void main() {
  vec2 p = v_uv * u_res - u_center;
  float d = dot(p, u_normal);
  if (d < 0.0) p -= 2.0 * d * u_normal;
  gl_FragColor = texClip((p + u_center) / u_res);
}`,

  turbulence: `
uniform float u_amount; uniform float u_scale; uniform float u_speed;
void main() {
  vec2 p = v_uv * u_res;
  vec2 q = p / u_scale + vec2(u_time * u_speed * 0.3);
  vec2 off = vec2(vnoise(q) + 0.5 * vnoise(q * 2.0 + 7.3), vnoise(q + 19.1) + 0.5 * vnoise(q * 2.0 + 3.7)) / 1.5 - 0.5;
  gl_FragColor = texClip((p + off * 2.0 * u_amount) / u_res);
}`,

  tile: `
uniform float u_count; uniform float u_mirror;
void main() {
  vec2 g = v_uv * u_count;
  vec2 f = fract(g);
  if (u_mirror > 0.5) {
    vec2 m = mod(floor(g), 2.0);
    f = mix(f, 1.0 - f, m);
  }
  gl_FragColor = tex(f);
}`,

  rgbSplit: `
uniform vec2 u_off;
void main() {
  vec2 o = u_off / u_res;
  vec4 r = texClip(v_uv + o); vec4 g = tex(v_uv); vec4 b = texClip(v_uv - o);
  float a = max(max(r.a, g.a), b.a);
  gl_FragColor = vec4(r.r, g.g, b.b, a);
}`,

  glitch: `
uniform float u_amount; uniform float u_speed; uniform float u_block;
void main() {
  float st = floor(u_time * u_speed);
  vec2 p = v_uv * u_res;
  float row = floor(p.y / u_block);
  float r1 = hash(vec2(row, st));
  float r2 = hash(vec2(row * 1.7 + 3.1, st + 11.0));
  float on = step(1.0 - u_amount * 0.6, r1);
  float shift = (r2 - 0.5) * u_amount * 0.25 * on;
  float bigBlock = step(1.0 - u_amount * 0.15, hash(vec2(floor(p.y / (u_block * 4.0)), st + 5.0)));
  shift += (hash(vec2(st, 2.0)) - 0.5) * 0.1 * bigBlock * u_amount;
  vec2 uv = v_uv + vec2(shift, 0.0);
  float split = (0.004 + 0.02 * on) * u_amount;
  vec4 cr = texClip(uv + vec2(split, 0.0));
  vec4 cg = texClip(uv);
  vec4 cb = texClip(uv - vec2(split, 0.0));
  vec4 c = vec4(cr.r, cg.g, cb.b, max(max(cr.a, cg.a), cb.a));
  if (hash(vec2(row, st + 7.0)) > 1.0 - u_amount * 0.08) c.rgb = c.gbr;
  gl_FragColor = c;
}`,

  grain: `
uniform float u_amount; uniform float u_size;
void main() {
  vec4 c = unpre(tex(v_uv));
  vec2 p = floor(v_uv * u_res / u_size);
  float n = hash(p + fract(u_time * 7.13) * 100.0) - 0.5;
  gl_FragColor = pre(vec4(clamp(c.rgb + n * u_amount, 0.0, 1.0), c.a));
}`,

  scanlines: `
uniform float u_amount; uniform float u_lines; uniform float u_curve;
void main() {
  vec2 uv = v_uv;
  if (u_curve > 0.0) {
    vec2 cc = uv * 2.0 - 1.0;
    cc *= 1.0 + u_curve * 0.25 * dot(cc.yx, cc.yx);
    uv = cc * 0.5 + 0.5;
  }
  vec4 c = texClip(uv);
  float s = 0.5 + 0.5 * sin(uv.y * u_res.y * 3.14159 / u_lines * 2.0);
  c.rgb *= 1.0 - u_amount * s;
  gl_FragColor = c;
}`,

  vignette: `
uniform float u_amount; uniform float u_size; uniform float u_soft;
void main() {
  vec4 c = tex(v_uv);
  vec2 d = (v_uv - 0.5) * vec2(u_res.x / max(u_res.x, u_res.y), u_res.y / max(u_res.x, u_res.y)) * 2.0;
  float v = smoothstep(u_size, u_size + u_soft, length(d) * 0.75);
  c.rgb *= 1.0 - v * u_amount;
  gl_FragColor = c;
}`,

  halftone: `
uniform float u_size; uniform float u_angle;
void main() {
  vec2 p = v_uv * u_res;
  float s = sin(u_angle), co = cos(u_angle);
  mat2 rot = mat2(co, -s, s, co);
  mat2 inv = mat2(co, s, -s, co);
  vec2 q = rot * p;
  vec2 cellC = (floor(q / u_size) + 0.5) * u_size;
  vec4 c = unpre(texClip((inv * cellC) / u_res));
  float rad = u_size * 0.72 * sqrt(lum(c.rgb)) * c.a;
  float d = length(q - cellC);
  float cov = 1.0 - smoothstep(rad - 0.8, rad + 0.8, d);
  gl_FragColor = vec4(c.rgb * cov, cov);
}`,

  edges: `
uniform float u_amount; uniform float u_invert;
void main() {
  vec2 px = 1.0 / u_res;
  float tl = lum(tex(v_uv + px * vec2(-1.0, 1.0)).rgb), t = lum(tex(v_uv + px * vec2(0.0, 1.0)).rgb), tr = lum(tex(v_uv + px * vec2(1.0, 1.0)).rgb);
  float l = lum(tex(v_uv + px * vec2(-1.0, 0.0)).rgb), r = lum(tex(v_uv + px * vec2(1.0, 0.0)).rgb);
  float bl = lum(tex(v_uv + px * vec2(-1.0, -1.0)).rgb), b = lum(tex(v_uv + px * vec2(0.0, -1.0)).rgb), br = lum(tex(v_uv + px * vec2(1.0, -1.0)).rgb);
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -bl - 2.0 * b - br + tl + 2.0 * t + tr;
  float e = clamp(length(vec2(gx, gy)) * 1.5, 0.0, 1.0);
  vec4 c = unpre(tex(v_uv));
  vec3 rgb = u_invert > 0.5 ? vec3(1.0 - e) : c.rgb * e * 2.0;
  gl_FragColor = pre(vec4(mix(c.rgb, rgb, u_amount), c.a));
}`,
};

type Uniform = number | number[];

interface Program {
  prog: WebGLProgram;
  loc: Map<string, WebGLUniformLocation | null>;
}

export class GLFX {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private programs = new Map<string, Program>();
  private srcTex: WebGLTexture;
  private fbTex: WebGLTexture[] = [];
  private fbs: WebGLFramebuffer[] = [];
  private w = 0;
  private h = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.srcTex = this.makeTex();
    for (let i = 0; i < 2; i++) {
      const t = this.makeTex();
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      this.fbTex.push(t);
      this.fbs.push(fb);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  }

  private makeTex(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  private resize(w: number, h: number) {
    if (w === this.w && h === this.h) return;
    const gl = this.gl;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    for (const t of this.fbTex) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
  }

  private program(name: string): Program {
    let p = this.programs.get(name);
    if (p) return p;
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader ${name}: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, HEAD + SHADERS[name]));
    gl.bindAttribLocation(prog, 0, 'a_pos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Link ${name}: ${gl.getProgramInfoLog(prog)}`);
    p = { prog, loc: new Map() };
    this.programs.set(name, p);
    return p;
  }

  private draw(name: string, input: WebGLTexture, target: WebGLFramebuffer | null, uniforms: Record<string, Uniform>, time: number) {
    const gl = this.gl;
    const p = this.program(name);
    gl.useProgram(p.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.w, this.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    const loc = (n: string) => {
      if (!p.loc.has(n)) p.loc.set(n, gl.getUniformLocation(p.prog, n));
      return p.loc.get(n)!;
    };
    gl.uniform1i(loc('u_tex'), 0);
    gl.uniform2f(loc('u_res'), this.w, this.h);
    gl.uniform1f(loc('u_time'), time);
    for (const [k, v] of Object.entries(uniforms)) {
      const l = loc(k);
      if (!l) continue;
      if (typeof v === 'number') gl.uniform1f(l, v);
      else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
      else gl.uniform4f(l, v[0], v[1], v[2], v[3]);
    }
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Runs one or more shader passes over `src` and leaves the result in this.canvas.
   * Each pass is [shaderName, uniforms]. Intermediate passes ping-pong between framebuffers.
   */
  run(src: TexImageSource, w: number, h: number, passes: [string, Record<string, Uniform>][], time: number): HTMLCanvasElement {
    const gl = this.gl;
    this.resize(w, h);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    // Framebuffer textures are already in GL orientation; only the uploaded source needs flipping.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    let input = this.srcTex;
    passes.forEach(([name, uniforms], i) => {
      const last = i === passes.length - 1;
      const fbIndex = i % 2;
      this.draw(name, input, last ? null : this.fbs[fbIndex], uniforms, time);
      if (!last) input = this.fbTex[fbIndex];
    });
    return this.canvas;
  }
}

let shared: GLFX | null | undefined;
export function glfx(): GLFX | null {
  if (shared === undefined) {
    try {
      shared = new GLFX();
    } catch (e) {
      console.warn('GPU effects disabled:', e);
      shared = null;
    }
  }
  return shared;
}
