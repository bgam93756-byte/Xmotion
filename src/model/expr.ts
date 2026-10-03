/**
 * A small, sandboxed expression language for animating properties.
 *
 * Expressions never touch `eval`/`Function`, so a project file shared by someone
 * else can't execute arbitrary code. Values are numbers or numeric arrays, and
 * arithmetic broadcasts element-wise (`value + [10, 0]`, `value * 2`).
 *
 * Examples:  wiggle(2, 30)   value + time * 90   [width/2, height/2 + sin(time*3)*40]
 *            loop()          pingpong()          time > 2 ? 100 : 0
 */
import { applyEase } from './easing';
import { fbm1, hash1 } from './noise';

export type EValue = number | number[];

export interface ExprEnv {
  time: number;
  frame: number;
  fps: number;
  value: EValue;
  index: number;
  width: number;
  height: number;
  inPoint: number;
  outPoint: number;
  duration: number;
  seed: number;
  /** Keyframed (pre-expression) value of this property at a comp time. */
  valueAt: (t: number) => EValue;
  /** Comp-time range covered by keyframes, if any. */
  keyRange: [number, number] | null;
}

export class ExprError extends Error {}

type Node =
  | { k: 'num'; v: number }
  | { k: 'id'; name: string }
  | { k: 'arr'; items: Node[] }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'tern'; c: Node; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[] }
  | { k: 'idx'; a: Node; i: Node };

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string } | { t: 'end' };

const OPS = ['**', '<=', '>=', '==', '!=', '&&', '||', '+', '-', '*', '/', '%', '^', '(', ')', '[', ']', ',', '?', ':', '<', '>', '!'];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) throw new ExprError(`Bad number at ${i}`);
      out.push({ t: 'num', v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][A-Za-z0-9_$.]*/.exec(src.slice(i))!;
      // Allow `Math.sin` style by stripping the namespace.
      out.push({ t: 'id', v: m[0].replace(/^Math\./, '') });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExprError(`Unexpected "${c}"`);
    out.push({ t: 'op', v: op });
    i += op.length;
  }
  out.push({ t: 'end' });
  return out;
}

const BIN_PREC: Record<string, number> = {
  '||': 2,
  '&&': 3,
  '==': 4,
  '!=': 4,
  '<': 5,
  '>': 5,
  '<=': 5,
  '>=': 5,
  '+': 6,
  '-': 6,
  '*': 7,
  '/': 7,
  '%': 7,
  '^': 9,
  '**': 9,
};

function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => {
    const t = toks[p];
    return t.t === 'op' && t.v === v;
  };
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError(`Expected "${v}"`);
    p++;
  };

  function primary(): Node {
    const t = toks[p++];
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'id') {
      if (isOp('(')) {
        p++;
        const args: Node[] = [];
        if (!isOp(')')) {
          do args.push(expr(0));
          while (isOp(',') && ++p);
        }
        expect(')');
        return { k: 'call', name: t.v, args };
      }
      return { k: 'id', name: t.v };
    }
    if (t.t === 'op') {
      if (t.v === '(') {
        const e = expr(0);
        expect(')');
        return e;
      }
      if (t.v === '[') {
        const items: Node[] = [];
        if (!isOp(']')) {
          do items.push(expr(0));
          while (isOp(',') && ++p);
        }
        expect(']');
        return { k: 'arr', items };
      }
      if (t.v === '-' || t.v === '!' || t.v === '+') return { k: 'un', op: t.v, a: expr(8) };
    }
    throw new ExprError(t.t === 'end' ? 'Unexpected end of expression' : `Unexpected "${(t as { v: unknown }).v}"`);
  }

  function postfix(): Node {
    let n = primary();
    while (isOp('[')) {
      p++;
      const i = expr(0);
      expect(']');
      n = { k: 'idx', a: n, i };
    }
    return n;
  }

  function expr(minPrec: number): Node {
    let left = postfix();
    for (;;) {
      const t = peek();
      if (t.t !== 'op') break;
      if (t.v === '?' && minPrec <= 1) {
        p++;
        const a = expr(0);
        expect(':');
        const b = expr(1);
        left = { k: 'tern', c: left, a, b };
        continue;
      }
      const prec = BIN_PREC[t.v];
      if (prec === undefined || prec < minPrec) break;
      p++;
      const rightAssoc = t.v === '^' || t.v === '**';
      const right = expr(rightAssoc ? prec : prec + 1);
      left = { k: 'bin', op: t.v, a: left, b: right };
    }
    return left;
  }

  const root = expr(0);
  if (peek().t !== 'end') throw new ExprError('Unexpected trailing input');
  return root;
}

const num = (v: EValue, what = 'value'): number => {
  if (typeof v === 'number') return v;
  if (v.length === 1) return v[0];
  throw new ExprError(`Expected a number for ${what}`);
};

function broadcast(a: EValue, b: EValue, f: (x: number, y: number) => number): EValue {
  if (typeof a === 'number' && typeof b === 'number') return f(a, b);
  if (typeof a === 'number') return (b as number[]).map((y) => f(a, y));
  if (typeof b === 'number') return a.map((x) => f(x, b));
  const n = Math.max(a.length, b.length);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(f(a[i] ?? 0, b[i] ?? 0));
  return out;
}

const map1 = (v: EValue, f: (x: number) => number): EValue => (typeof v === 'number' ? f(v) : v.map(f));

type Fn = (args: EValue[], env: ExprEnv) => EValue;

const mathFn = (f: (x: number) => number): Fn => (a) => map1(a[0] ?? 0, f);

const lerpV = (a: EValue, b: EValue, k: number) => broadcast(a, b, (x, y) => x + (y - x) * k);

/** AE-style linear()/ease(): remap t from [tMin,tMax] to [v1,v2]. */
function remap(args: EValue[], easeFn: (x: number) => number): EValue {
  if (args.length === 3) {
    const t = num(args[0]);
    return lerpV(args[1], args[2], easeFn(Math.min(1, Math.max(0, t))));
  }
  const [t, tMin, tMax] = args.slice(0, 3).map((a) => num(a));
  const k = tMax === tMin ? (t >= tMax ? 1 : 0) : (t - tMin) / (tMax - tMin);
  return lerpV(args[3] ?? 0, args[4] ?? 1, easeFn(Math.min(1, Math.max(0, k))));
}

function loopAt(env: ExprEnv, mode: 'cycle' | 'pingpong'): EValue {
  if (!env.keyRange) return env.value;
  const [a, b] = env.keyRange;
  const span = b - a;
  if (span <= 0 || env.time <= b) return env.value;
  const local = env.time - a;
  let t: number;
  if (mode === 'cycle') t = a + (local % span);
  else {
    const m = local % (2 * span);
    t = a + (m <= span ? m : 2 * span - m);
  }
  return env.valueAt(t);
}

export const EXPR_FUNCS: Record<string, Fn> = {
  sin: mathFn(Math.sin),
  cos: mathFn(Math.cos),
  tan: mathFn(Math.tan),
  asin: mathFn(Math.asin),
  acos: mathFn(Math.acos),
  atan: mathFn(Math.atan),
  abs: mathFn(Math.abs),
  floor: mathFn(Math.floor),
  ceil: mathFn(Math.ceil),
  round: mathFn(Math.round),
  sqrt: mathFn(Math.sqrt),
  exp: mathFn(Math.exp),
  log: mathFn(Math.log),
  sign: mathFn(Math.sign),
  fract: mathFn((x) => x - Math.floor(x)),
  deg: mathFn((x) => (x * 180) / Math.PI),
  rad: mathFn((x) => (x * Math.PI) / 180),
  atan2: (a) => Math.atan2(num(a[0]), num(a[1])),
  pow: (a) => broadcast(a[0], a[1], Math.pow),
  mod: (a) => broadcast(a[0], a[1], (x, y) => ((x % y) + y) % y),
  min: (a) => a.reduce((x, y) => broadcast(x, y, Math.min)),
  max: (a) => a.reduce((x, y) => broadcast(x, y, Math.max)),
  clamp: (a) => broadcast(broadcast(a[0], a[1], Math.max), a[2], Math.min),
  lerp: (a) => lerpV(a[0], a[1], num(a[2])),
  mix: (a) => lerpV(a[0], a[1], num(a[2])),
  step: (a) => (num(a[1]) >= num(a[0]) ? 1 : 0),
  smoothstep: (a) => {
    const [e0, e1, x] = a.map((v) => num(v));
    const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return k * k * (3 - 2 * k);
  },
  hypot: (a) => Math.hypot(...a.map((v) => num(v))),
  length: (a) => {
    const v = a[0];
    return typeof v === 'number' ? Math.abs(v) : Math.hypot(...v);
  },
  normalize: (a) => {
    const v = a[0];
    if (typeof v === 'number') return Math.sign(v);
    const l = Math.hypot(...v) || 1;
    return v.map((x) => x / l);
  },
  linear: (a) => remap(a, (x) => x),
  ease: (a) => remap(a, (x) => applyEase('easeInOut', x)),
  easeIn: (a) => remap(a, (x) => applyEase('easeIn', x)),
  easeOut: (a) => remap(a, (x) => applyEase('easeOut', x)),
  noise: (a, env) => fbm1(num(a[0]), env.seed),
  /** Deterministic per-seed random in [0,1) (or [min,max) with 2 args). */
  rand: (a, env) => {
    const r = hash1(num(a[0] ?? 0), env.seed);
    return a.length >= 3 ? num(a[1]) + r * (num(a[2]) - num(a[1])) : r;
  },
  /** Random value that changes every frame: random() or random(min, max). */
  random: (a, env) => {
    const r = hash1(env.frame + 0.5, env.seed);
    if (a.length >= 2) return num(a[0]) + r * (num(a[1]) - num(a[0]));
    if (a.length === 1) return r * num(a[0]);
    return r;
  },
  /** wiggle(freq, amount, octaves?) — organic shake around the current value. */
  wiggle: (a, env) => {
    const freq = num(a[0] ?? 2);
    const amp = num(a[1] ?? 20);
    const oct = Math.round(num(a[2] ?? 1));
    const x = env.time * freq;
    const v = env.value;
    return typeof v === 'number'
      ? v + fbm1(x, env.seed, oct) * amp
      : v.map((c, i) => c + fbm1(x, env.seed + i * 101.7, oct) * amp);
  },
  valueAt: (a, env) => env.valueAt(num(a[0])),
  loop: (_a, env) => loopAt(env, 'cycle'),
  loopOut: (_a, env) => loopAt(env, 'cycle'),
  pingpong: (_a, env) => loopAt(env, 'pingpong'),
};

const CONSTS: Record<string, number> = { PI: Math.PI, E: Math.E, TAU: Math.PI * 2 };

type Compiled = (env: ExprEnv) => EValue;

const truthy = (v: EValue) => (typeof v === 'number' ? v !== 0 : v.length > 0);

function compileNode(n: Node): Compiled {
  switch (n.k) {
    case 'num': {
      const v = n.v;
      return () => v;
    }
    case 'id': {
      const name = n.name;
      if (Object.hasOwn(CONSTS, name)) {
        const c = CONSTS[name];
        return () => c;
      }
      const envKeys = ['time', 'frame', 'fps', 'value', 'index', 'width', 'height', 'inPoint', 'outPoint', 'duration'];
      if (name === 't') return (env) => env.time;
      if (envKeys.includes(name)) return (env) => env[name as keyof ExprEnv] as EValue;
      throw new ExprError(`Unknown name "${name}"`);
    }
    case 'arr': {
      const items = n.items.map(compileNode);
      return (env) => items.map((f) => num(f(env), 'array item'));
    }
    case 'un': {
      const a = compileNode(n.a);
      if (n.op === '-') return (env) => map1(a(env), (x) => -x);
      if (n.op === '!') return (env) => (truthy(a(env)) ? 0 : 1);
      return a;
    }
    case 'idx': {
      const a = compileNode(n.a);
      const i = compileNode(n.i);
      return (env) => {
        const v = a(env);
        const k = Math.floor(num(i(env), 'index'));
        return typeof v === 'number' ? (k === 0 ? v : 0) : (v[k] ?? 0);
      };
    }
    case 'tern': {
      const c = compileNode(n.c);
      const a = compileNode(n.a);
      const b = compileNode(n.b);
      return (env) => (truthy(c(env)) ? a(env) : b(env));
    }
    case 'call': {
      const fn = Object.hasOwn(EXPR_FUNCS, n.name) ? EXPR_FUNCS[n.name] : undefined;
      if (!fn) throw new ExprError(`Unknown function "${n.name}()"`);
      const args = n.args.map(compileNode);
      return (env) =>
        fn(
          args.map((f) => f(env)),
          env,
        );
    }
    case 'bin': {
      const a = compileNode(n.a);
      const b = compileNode(n.b);
      const cmp = (f: (x: number, y: number) => boolean): Compiled => (env) => (f(num(a(env)), num(b(env))) ? 1 : 0);
      switch (n.op) {
        case '+':
          return (env) => broadcast(a(env), b(env), (x, y) => x + y);
        case '-':
          return (env) => broadcast(a(env), b(env), (x, y) => x - y);
        case '*':
          return (env) => broadcast(a(env), b(env), (x, y) => x * y);
        case '/':
          return (env) => broadcast(a(env), b(env), (x, y) => (y === 0 ? 0 : x / y));
        case '%':
          return (env) => broadcast(a(env), b(env), (x, y) => (y === 0 ? 0 : x % y));
        case '^':
        case '**':
          return (env) => broadcast(a(env), b(env), Math.pow);
        case '<':
          return cmp((x, y) => x < y);
        case '>':
          return cmp((x, y) => x > y);
        case '<=':
          return cmp((x, y) => x <= y);
        case '>=':
          return cmp((x, y) => x >= y);
        case '==':
          return cmp((x, y) => x === y);
        case '!=':
          return cmp((x, y) => x !== y);
        case '&&':
          return (env) => (truthy(a(env)) ? b(env) : 0);
        case '||':
          return (env) => {
            const v = a(env);
            return truthy(v) ? v : b(env);
          };
      }
    }
  }
  throw new ExprError('Invalid expression');
}

const cache = new Map<string, Compiled | ExprError>();

/** Compiles (with caching). Throws ExprError on syntax errors. */
export function compileExpr(src: string): Compiled {
  let c = cache.get(src);
  if (!c) {
    try {
      c = compileNode(parse(src));
    } catch (e) {
      c = e instanceof ExprError ? e : new ExprError(String(e));
    }
    if (cache.size > 500) cache.clear();
    cache.set(src, c);
  }
  if (c instanceof ExprError) throw c;
  return c;
}

/** Returns an error message for an invalid expression, or null when it's valid. */
export function validateExpr(src: string): string | null {
  try {
    compileExpr(src);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
