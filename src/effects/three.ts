import { DEG, ang, col, num, pct, point, type EffectSpec, type FxEval } from './types';

const SHAPES = `
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdBoxFrame(vec3 p, vec3 b, float e) {
  p = abs(p) - b; vec3 q = abs(p + e) - e;
  return min(min(
    length(max(vec3(p.x, q.y, q.z), 0.0)) + min(max(p.x, max(q.y, q.z)), 0.0),
    length(max(vec3(q.x, p.y, q.z), 0.0)) + min(max(q.x, max(p.y, q.z)), 0.0)),
    length(max(vec3(q.x, q.y, p.z), 0.0)) + min(max(q.x, max(q.y, p.z)), 0.0));
}
float sdCyl(vec3 p, float r, float h) { vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
float sdHexPrism(vec3 p, vec2 h) {
  vec3 k = vec3(-0.8660254, 0.5, 0.57735);
  p = abs(p);
  p.xy -= 2.0 * min(dot(k.xy, p.xy), 0.0) * k.xy;
  vec2 d = vec2(length(p.xy - vec2(clamp(p.x, -k.z * h.x, k.z * h.x), h.x)) * sign(p.y - h.x), p.z - h.y);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
float sdOcta(vec3 p, float s) { p = abs(p); return (p.x + p.y + p.z - s) * 0.57735027; }
float sdPyramid(vec3 p, float h) {
  float m2 = h * h + 0.25;
  p.xz = abs(p.xz);
  p.xz = (p.z > p.x) ? p.zx : p.xz;
  p.xz -= 0.5;
  vec3 q = vec3(p.z, h * p.y - 0.5 * p.x, h * p.x + 0.5 * p.y);
  float s = max(-q.x, 0.0);
  float t = clamp((q.y - 0.5 * p.z) / (m2 + 0.25), 0.0, 1.0);
  float a = m2 * (q.x + s) * (q.x + s) + q.y * q.y;
  float b = m2 * (q.x + 0.5 * t) * (q.x + 0.5 * t) + (q.y - m2 * t) * (q.y - m2 * t);
  float d2 = min(q.y, -q.x * m2 - q.y * 0.5) > 0.0 ? 0.0 : min(a, b);
  return sqrt((d2 + q.z * q.z) / m2) * sign(max(q.z, -p.y));
}
float sdTetra(vec3 p, float s) { return (max(abs(p.x + p.y) - p.z, abs(p.x - p.y) + p.z) - s) / 1.7320508; }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float sdStar2(vec2 p, float r, float n, float m) {
  float an = PI / n; float en = PI / m;
  vec2 acs = vec2(cos(an), sin(an)); vec2 ecs = vec2(cos(en), sin(en));
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= r * acs;
  p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
  return length(p) * sign(p.x);
}
`;

const OBJ3D = `
uniform float u_shape; uniform mat3 u_rot; uniform mat3 u_irot; uniform vec3 u_dim; uniform float u_size;
uniform float u_shade; uniform float u_persp; uniform vec2 u_c; uniform float u_p1; uniform float u_p2; uniform vec4 u_side; uniform float u_ext;
${SHAPES}
float map(vec3 p) {
  float s = u_shape;
  if (s < 0.5) return sdBox(p, u_dim);
  if (s < 1.5) return sdBox(p, vec3(0.7));
  if (s < 2.5) return sdCyl(p, 0.72, 0.9);
  if (s < 3.5) return sdEllipsoid(p, u_dim);
  if (s < 4.5) return sdHexPrism(p.xzy, vec2(0.75, 0.85));
  if (s < 5.5) return sdBoxFrame(p, vec3(0.8), u_p1);
  if (s < 6.5) return sdOcta(p, 1.1);
  if (s < 7.5) return sdPyramid(p * 0.6 + vec3(0.0, 0.42, 0.0), 1.0) / 0.6;
  if (s < 8.5) return min(sdTetra(p, 0.6), sdTetra(-p, 0.6));
  if (s < 9.5) {
    float d2 = sdStar2(p.xy, 1.0, u_p1, u_p2);
    vec2 w = vec2(d2, abs(p.z) - u_dim.z);
    return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
  }
  if (s < 10.5) return min(sdBox(p, vec3(1.0, u_p1, u_p1)), min(sdBox(p, vec3(u_p1, 1.0, u_p1)), sdBox(p, vec3(u_p1, u_p1, 1.0))));
  return sdTorus(p, vec2(0.72, u_p1));
}
vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0015, -0.0015);
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}
void main() {
  vec2 q = (lp() - u_c) / max(u_size, 1.0);
  q.y = -q.y;
  vec3 ro = u_rot * vec3(0.0, 0.0, -u_persp);
  vec3 rd = u_rot * normalize(vec3(q, u_persp));
  float t = max(0.0, u_persp - 2.2);
  float hit = -1.0;
  for (int i = 0; i < 96; i++) {
    float d = map(ro + rd * t);
    if (d < 0.0008) { hit = t; break; }
    t += d * 0.9;
    if (t > u_persp + 2.5) break;
  }
  if (hit < 0.0) { gl_FragColor = vec4(0.0); return; }
  vec3 pos = ro + rd * hit;
  vec3 n = normalAt(pos);
  vec3 an = abs(n);
  vec2 uv = an.x > an.y && an.x > an.z ? vec2(pos.z * sign(n.x), pos.y) : (an.y > an.z ? vec2(pos.x, pos.z * sign(n.y)) : vec2(-pos.x * sign(n.z), pos.y));
  vec2 tn = vec2(uv.x, -uv.y) / (2.0 * u_ext) + 0.5;
  vec4 tc = unpre(texL(ldenorm(clamp(tn, 0.0, 1.0))));
  vec3 base = mix(u_side.rgb, tc.rgb, tc.a);
  vec3 nv = u_irot * n;
  vec3 l = normalize(vec3(-0.45, 0.65, -0.62));
  float diff = max(dot(nv, l), 0.0);
  float spec = pow(max(dot(reflect(-l, nv), vec3(0.0, 0.0, -1.0)), 0.0), 32.0) * 0.35;
  vec3 c = base * mix(1.0, 0.32 + 0.78 * diff, u_shade) + spec * u_shade;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

const VIEWER360 = `
uniform mat3 u_rot; uniform float u_tan;
vec2 dirToEq(vec3 d) { return vec2(atan(d.x, d.z) / TAU + 0.5, 0.5 - asin(clamp(d.y, -1.0, 1.0)) / PI); }
void main() {
  vec2 p = lp();
  if (!inBounds(p)) { gl_FragColor = vec4(0.0); return; }
  vec2 n = lnorm(p) - 0.5;
  float aspect = u_lb.z / max(u_lb.w, 1.0);
  vec3 d = normalize(vec3(n.x * 2.0 * u_tan * aspect, -n.y * 2.0 * u_tan, 1.0));
  gl_FragColor = texL(ldenorm(dirToEq(u_rot * d)));
}`;

const REORIENT360 = `
uniform mat3 u_rot;
void main() {
  vec2 p = lp();
  if (!inBounds(p)) { gl_FragColor = vec4(0.0); return; }
  vec2 n = lnorm(p);
  float lon = (n.x - 0.5) * TAU; float lat = (0.5 - n.y) * PI;
  vec3 d = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
  d = u_rot * d;
  vec2 e = vec2(atan(d.x, d.z) / TAU + 0.5, 0.5 - asin(clamp(d.y, -1.0, 1.0)) / PI);
  gl_FragColor = texL(ldenorm(e));
}`;

/** Rotation matrix (column-major, for GLSL) from Euler angles in degrees, X then Y then Z. */
function rotMat(rx: number, ry: number, rz: number): number[] {
  const [a, b, c] = [rx * DEG, ry * DEG, rz * DEG];
  const cx = Math.cos(a), sx = Math.sin(a), cy = Math.cos(b), sy = Math.sin(b), cz = Math.cos(c), sz = Math.sin(c);
  // R = Rz * Ry * Rx (row-major)
  const m = [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
  // column-major
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}
/** Half-size of each shape's faces, so the layer image spans a face. */
const EXTENT: Partial<Record<(typeof SHAPE_IDS)[number], number>> = {
  cube: 0.7,
  cylinder: 0.9,
  hexPrism: 0.85,
  hollowBox: 0.8,
  octahedron: 0.75,
  pyramid: 0.85,
  starPolyhedron: 0.75,
  starPrism: 1,
  threeAxisCross: 1,
  torus: 0.95,
};
const transpose = (m: number[]) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

const rotation = (e: FxEval) => {
  const s = e.n('spin') * e.local;
  return rotMat(e.n('rx'), e.n('ry') + s, e.n('rz'));
};

const SHAPE_IDS = ['box', 'cube', 'cylinder', 'ellipsoid', 'hexPrism', 'hollowBox', 'octahedron', 'pyramid', 'starPolyhedron', 'starPrism', 'threeAxisCross', 'torus'] as const;
const SHAPE_INFO: Record<(typeof SHAPE_IDS)[number], [string, string]> = {
  box: ['Box', 'Turns a layer into a 3D box with adjustable width, height and depth.'],
  cube: ['Cube', 'Wraps the layer around a 3D cube.'],
  cylinder: ['Cylinder', 'Wraps a layer around a cylinder.'],
  ellipsoid: ['Ellipsoid', 'Turns a layer into an ellipsoid-shaped 3D object.'],
  hexPrism: ['Hexagonal Prism', 'Creates a hexagonal prism-shaped 3D object.'],
  hollowBox: ['Hollow Box', 'Creates a hollow, box-frame 3D object.'],
  octahedron: ['Octahedron', 'Creates an eight-faced 3D object.'],
  pyramid: ['Pyramid', 'Creates a pyramid-shaped 3D object.'],
  starPolyhedron: ['Star Polyhedron', 'Creates a star-like three-dimensional polyhedron.'],
  starPrism: ['Star Prism', 'Creates a prism-like 3D star shape.'],
  threeAxisCross: ['Three-axis Cross', 'Creates a cross-shaped 3D object with three axes.'],
  torus: ['Torus', 'Creates a doughnut-shaped 3D object.'],
};

function shapeSpec(id: (typeof SHAPE_IDS)[number], index: number): EffectSpec {
  const extra =
    id === 'box' || id === 'ellipsoid'
      ? [pct('w', 'Width', 90, 5, 200), pct('h', 'Height', 60, 5, 200), pct('d', 'Depth', 40, 5, 200)]
      : id === 'hollowBox'
        ? [pct('thickness', 'Frame thickness', 10, 1, 50)]
        : id === 'starPrism'
          ? [num('points', 'Points', 5, 3, 16, { step: 1 }), pct('inner', 'Inner radius', 45, 5, 95), pct('d', 'Depth', 25, 2, 100)]
          : id === 'threeAxisCross'
            ? [pct('thickness', 'Arm thickness', 22, 2, 60)]
            : id === 'torus'
              ? [pct('thickness', 'Tube thickness', 30, 2, 70)]
              : [];
  return {
    type: id,
    label: SHAPE_INFO[id][0],
    category: '3D & Perspective',
    description: SHAPE_INFO[id][1],
    props: [
      ...extra,
      pct('size', 'Size', 45, 1, 300),
      point('center', 'Center'),
      ang('rx', 'Rotate X', 20),
      ang('ry', 'Rotate Y', 30),
      ang('rz', 'Rotate Z', 0),
      num('spin', 'Spin (°/s)', 30, -720, 720),
      pct('shading', 'Shading', 80),
      num('persp', 'Camera distance', 4, 1.5, 30, { step: 0.1 }),
      col('side', 'Surface color', '#2a2d39'),
    ],
    passes: (e) => {
      const r = rotation(e);
      const n = Math.round(e.n('points') || 5);
      const p1 = id === 'hollowBox' ? e.n('thickness') / 100 : id === 'threeAxisCross' ? e.n('thickness') / 100 : id === 'torus' ? (e.n('thickness') / 100) * 0.6 : n;
      const p2 = id === 'starPrism' ? Math.max(2, 2 + (1 - e.n('inner') / 100) * (n - 2)) : 0;
      return [
        {
          frag: OBJ3D,
          u: {
            u_shape: index,
            u_rot: transpose(r),
            u_irot: r,
            u_dim: id === 'box' || id === 'ellipsoid' ? [e.n('w') / 100, e.n('h') / 100, e.n('d') / 100] : [0.7, 0.7, id === 'starPrism' ? (e.n('d') / 100) * 0.8 : 0.7],
            u_size: (e.n('size') / 100) * Math.min(e.lb.w, e.lb.h),
            u_shade: e.n('shading') / 100,
            u_persp: e.n('persp'),
            u_c: e.pt('center'),
            u_p1: p1,
            u_p2: p2,
            u_side: e.c('side'),
            u_ext: EXTENT[id] ?? Math.max(e.n('w'), e.n('h'), e.n('d')) / 100,
          },
        },
      ];
    },
  };
}

export const THREE_EFFECTS: EffectSpec[] = [
  ...SHAPE_IDS.map((id, i) => shapeSpec(id, i)),
  {
    type: 'viewer360',
    label: '360º Viewer',
    category: '3D & Perspective',
    description: 'Views a 360° (equirectangular) image or video through a virtual camera.',
    props: [ang('yaw', 'Pan (yaw)', 0), ang('pitch', 'Tilt (pitch)', 0), ang('roll', 'Roll', 0), num('fov', 'Field of view', 90, 10, 170, { unit: '°' }), num('spin', 'Auto pan (°/s)', 0, -180, 180)],
    passes: (e) => {
      const yaw = e.n('yaw') + e.n('spin') * e.local;
      return [{ frag: VIEWER360, u: { u_rot: rotMat(-e.n('pitch'), yaw, e.n('roll')), u_tan: Math.tan((e.n('fov') * DEG) / 2) } }];
    },
  },
  {
    type: 'reorient360',
    label: '360º Reorient Sphere',
    category: '3D & Perspective',
    description: 'Changes the orientation of a spherical 360° image.',
    props: [ang('yaw', 'Yaw', 90), ang('pitch', 'Pitch', 0), ang('roll', 'Roll', 0)],
    passes: (e) => [{ frag: REORIENT360, u: { u_rot: rotMat(e.n('pitch'), e.n('yaw'), e.n('roll')) } }],
  },
];
