/**
 * GPU effect pipeline. One WebGL canvas runs fragment shaders over a 2D-canvas
 * source; the result is drawn back with drawImage. Colors stay premultiplied
 * throughout; shaders that change color un-premultiply first (see `unpre`).
 *
 * Texture units: 0 = u_tex (output of the previous pass), 1 = u_orig (the
 * effect's input), 2 = u_aux (optional: background or a map layer).
 */

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/** Shared header for every effect shader. */
export const HEAD = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform sampler2D u_orig;
uniform sampler2D u_aux;
uniform vec2 u_res;
uniform float u_time;
uniform float u_ltime;
uniform float u_scale;
uniform float u_seed;
uniform mat3 u_toLocal;
uniform mat3 u_toBuf;
uniform vec4 u_lb;

#define PI 3.14159265
#define TAU 6.28318531

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec4 unpre(vec4 c) { return c.a > 0.0001 ? vec4(c.rgb / c.a, c.a) : vec4(0.0); }
vec4 pre(vec4 c) { return vec4(c.rgb * c.a, c.a); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash1(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p, float oct) {
  float s = 0.0; float a = 0.5; float n = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= oct) break;
    s += a * vnoise(p); n += a; p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5;
  }
  return s / max(n, 0.0001);
}
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
mat2 rot(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }
vec4 tex(vec2 uv) { return texture2D(u_tex, uv); }
vec4 texClip(vec2 uv) {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(u_tex, uv);
}
vec4 orig(vec2 uv) { return texture2D(u_orig, uv); }
vec4 origClip(vec2 uv) {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(u_orig, uv);
}
vec4 aux(vec2 uv) { return texture2D(u_aux, clamp(uv, 0.0, 1.0)); }
// Buffer pixels have a top-left origin; GL uvs have a bottom-left origin.
vec2 pix() { return vec2(v_uv.x, 1.0 - v_uv.y) * u_res; }
vec2 uvOf(vec2 px) { return vec2(px.x / u_res.x, 1.0 - px.y / u_res.y); }
// Layer-local space: the layer's own (unrotated, unscaled) coordinates in comp pixels.
vec2 toLocal(vec2 px) { return (u_toLocal * vec3(px, 1.0)).xy; }
vec2 toBuf(vec2 q) { return (u_toBuf * vec3(q, 1.0)).xy; }
vec2 lp() { return toLocal(pix()); }
vec2 lcenter() { return u_lb.xy + 0.5 * u_lb.zw; }
float lmin() { return max(1.0, min(u_lb.z, u_lb.w)); }
vec2 lnorm(vec2 p) { return (p - u_lb.xy) / max(u_lb.zw, vec2(1.0)); }
vec2 ldenorm(vec2 n) { return u_lb.xy + n * u_lb.zw; }
bool inBounds(vec2 p) { vec2 n = lnorm(p); return n.x >= 0.0 && n.y >= 0.0 && n.x <= 1.0 && n.y <= 1.0; }
vec4 texL(vec2 p) { return texClip(uvOf(toBuf(p))); }
vec4 origL(vec2 p) { return origClip(uvOf(toBuf(p))); }
// Buffer pixels per local pixel (layer scale x render scale).
float lpx() { return length(vec2(u_toBuf[0][0], u_toBuf[0][1])); }
`;

export type Uniform = number | number[] | Float32Array;

export interface Pass {
  frag: string;
  u?: Record<string, Uniform>;
}

export interface Common {
  time: number;
  ltime: number;
  scale: number;
  seed: number;
  toLocal: Float32Array;
  toBuf: Float32Array;
  lb: [number, number, number, number];
}

interface Program {
  prog: WebGLProgram;
  loc: Map<string, WebGLUniformLocation | null>;
}

export class GLFX {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private programs = new Map<string, Program>();
  private srcTex: WebGLTexture;
  private auxTex: WebGLTexture;
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
    this.auxTex = this.makeTex();
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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
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

  private program(frag: string): Program {
    let p = this.programs.get(frag);
    if (p) return p;
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader error: ${gl.getShaderInfoLog(s)}\n${frag.slice(0, 200)}`);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, HEAD + frag));
    gl.bindAttribLocation(prog, 0, 'a_pos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Link error: ${gl.getProgramInfoLog(prog)}`);
    p = { prog, loc: new Map() };
    this.programs.set(frag, p);
    return p;
  }

  private draw(pass: Pass, input: WebGLTexture, target: WebGLFramebuffer | null, common: Common) {
    const gl = this.gl;
    const p = this.program(pass.frag);
    gl.useProgram(p.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.w, this.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.auxTex);
    const loc = (n: string) => {
      if (!p.loc.has(n)) p.loc.set(n, gl.getUniformLocation(p.prog, n));
      return p.loc.get(n)!;
    };
    gl.uniform1i(loc('u_tex'), 0);
    gl.uniform1i(loc('u_orig'), 1);
    gl.uniform1i(loc('u_aux'), 2);
    gl.uniform2f(loc('u_res'), this.w, this.h);
    gl.uniform1f(loc('u_time'), common.time);
    gl.uniform1f(loc('u_ltime'), common.ltime);
    gl.uniform1f(loc('u_scale'), common.scale);
    gl.uniform1f(loc('u_seed'), common.seed);
    gl.uniform4f(loc('u_lb'), ...common.lb);
    gl.uniformMatrix3fv(loc('u_toLocal'), false, common.toLocal);
    gl.uniformMatrix3fv(loc('u_toBuf'), false, common.toBuf);
    for (const [k, v] of Object.entries(pass.u ?? {})) {
      const l = loc(k);
      if (!l) continue;
      if (typeof v === 'number') gl.uniform1f(l, v);
      else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
      else if (v.length === 4) gl.uniform4f(l, v[0], v[1], v[2], v[3]);
      else if (v.length === 9) gl.uniformMatrix3fv(l, false, v instanceof Float32Array ? v : new Float32Array(v));
    }
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Compiles a shader up front (used by tests to validate every effect). */
  compile(frag: string) {
    this.program(frag);
  }

  /**
   * Runs shader passes over `src` and leaves the result in this.canvas.
   * Intermediate passes ping-pong between two framebuffers.
   */
  run(src: TexImageSource, w: number, h: number, passes: Pass[], common: Common, aux?: TexImageSource | null): HTMLCanvasElement {
    const gl = this.gl;
    this.resize(w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.bindTexture(gl.TEXTURE_2D, this.auxTex);
    if (aux) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, aux);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    let input = this.srcTex;
    passes.forEach((pass, i) => {
      const last = i === passes.length - 1;
      const fbIndex = i % 2;
      this.draw(pass, input, last ? null : this.fbs[fbIndex], common);
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

/**
 * Perspective warp: u_inv maps an output pixel to homogeneous source pixels.
 * Drawing a 3D layer (u_near = 1), its third component is 1 / camera depth and
 * points nearer than the near plane are cut; warping frame-space inputs into a
 * layer's plane (u_near = 0) only needs it positive.
 */
export const WARP_FRAG = `
uniform mat3 u_inv;
uniform vec2 u_src;
uniform float u_near;
void main() {
  vec3 q = u_inv * vec3(pix(), 1.0);
  if (q.z <= 0.0 || (u_near > 0.5 && q.z > 1.0)) { gl_FragColor = vec4(0.0); return; }
  vec2 sp = q.xy / q.z;
  vec2 uv = vec2(sp.x / u_src.x, 1.0 - sp.y / u_src.y);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0); return; }
  gl_FragColor = texture2D(u_tex, uv);
}`;

/** Turns a layer into a luminance matte: alpha = luma × alpha (inverted: 1 − that). */
export const LUMA_MATTE_FRAG = `
uniform float u_invert;
void main() {
  vec4 c = unpre(tex(v_uv));
  float m = lum(c.rgb) * c.a;
  m = mix(m, 1.0 - m, u_invert);
  gl_FragColor = vec4(0.0, 0.0, 0.0, m);
}`;
