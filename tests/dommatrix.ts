/* eslint-disable */
/**
 * Node has no DOMMatrix, and the engine needs one (already when its modules
 * load). This minimal stand-in follows the Geometry Interfaces spec for the
 * methods the engine uses: 4×4 matrices on column vectors, mCR = column C,
 * row R, stored column-major.
 */
export function installDOMMatrix() {
  if ('DOMMatrix' in globalThis) return;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  class Point {
    constructor(
      public x = 0,
      public y = 0,
      public z = 0,
      public w = 1,
    ) {}
  }
  class Matrix {
    m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    is2D = true;
    constructor(init?: number[]) {
      if (init?.length === 6) {
        const [a, b, c, d, e, f] = init;
        this.m = [a, b, 0, 0, c, d, 0, 0, 0, 0, 1, 0, e, f, 0, 1];
      } else if (init?.length === 16) {
        this.m = [...init];
        this.is2D = false;
      }
    }
    private static of(m: number[], is2D: boolean) {
      const r = new Matrix(m);
      r.is2D = is2D;
      return r;
    }
    multiplySelf(o: Matrix) {
      const r = new Array<number>(16).fill(0);
      for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) r[c * 4 + row] += this.m[k * 4 + row] * o.m[c * 4 + k];
      this.m = r;
      this.is2D &&= o.is2D;
      return this;
    }
    multiply(o: Matrix) {
      return Matrix.of(this.m, this.is2D).multiplySelf(o);
    }
    translateSelf(x = 0, y = 0, z = 0) {
      return this.multiplySelf(Matrix.of([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1], z === 0));
    }
    translate(x = 0, y = 0, z = 0) {
      return Matrix.of(this.m, this.is2D).translateSelf(x, y, z);
    }
    scaleSelf(sx = 1, sy = sx, sz = 1) {
      return this.multiplySelf(Matrix.of([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1], sz === 1));
    }
    rotateSelf(rx = 0, ry?: number, rz?: number) {
      if (ry === undefined && rz === undefined) [rx, ry, rz] = [0, 0, rx];
      const [z, y, x] = [rad(rz ?? 0), rad(ry ?? 0), rad(rx)];
      // Post-multiplies Z, then Y, then X rotations, as CSS rotate3d() matrices.
      this.multiplySelf(Matrix.of([Math.cos(z), Math.sin(z), 0, 0, -Math.sin(z), Math.cos(z), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], true));
      this.multiplySelf(Matrix.of([Math.cos(y), 0, -Math.sin(y), 0, 0, 1, 0, 0, Math.sin(y), 0, Math.cos(y), 0, 0, 0, 0, 1], y === 0));
      return this.multiplySelf(Matrix.of([1, 0, 0, 0, 0, Math.cos(x), Math.sin(x), 0, 0, -Math.sin(x), Math.cos(x), 0, 0, 0, 0, 1], x === 0));
    }
    skewXSelf(deg = 0) {
      return this.multiplySelf(Matrix.of([1, 0, 0, 0, Math.tan(rad(deg)), 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], true));
    }
    get isIdentity() {
      return this.m.every((v, i) => v === (i % 5 === 0 ? 1 : 0));
    }
    transformPoint(p: { x?: number; y?: number; z?: number; w?: number }) {
      const [x, y, z, w] = [p.x ?? 0, p.y ?? 0, p.z ?? 0, p.w ?? 1];
      const m = this.m;
      return new Point(m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w, m[2] * x + m[6] * y + m[10] * z + m[14] * w, m[3] * x + m[7] * y + m[11] * z + m[15] * w);
    }
    inverse() {
      // Gauss-Jordan on [A | I] with A row-major.
      const a = Array.from({ length: 4 }, (_, r) => [0, 1, 2, 3].map((c) => this.m[c * 4 + r]).concat([0, 1, 2, 3].map((c) => (c === r ? 1 : 0))));
      for (let col = 0; col < 4; col++) {
        let piv = col;
        for (let r = col + 1; r < 4; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
        if (Math.abs(a[piv][col]) < 1e-12) return Matrix.of(new Array(16).fill(NaN), false);
        [a[col], a[piv]] = [a[piv], a[col]];
        const p = a[col][col];
        a[col] = a[col].map((v) => v / p);
        for (let r = 0; r < 4; r++) if (r !== col) a[r] = a[r].map((v, i) => v - a[r][col] * a[col][i]);
      }
      return Matrix.of(
        Array.from({ length: 16 }, (_, i) => a[i % 4][4 + Math.floor(i / 4)]),
        this.is2D,
      );
    }
  }
  const names = ['m11', 'm12', 'm13', 'm14', 'm21', 'm22', 'm23', 'm24', 'm31', 'm32', 'm33', 'm34', 'm41', 'm42', 'm43', 'm44'];
  const alias: Record<string, number> = { a: 0, b: 1, c: 4, d: 5, e: 12, f: 13 };
  for (const [key, i] of [...names.map((n, i) => [n, i] as const), ...Object.entries(alias)]) {
    Object.defineProperty(Matrix.prototype, key, {
      get(this: Matrix) {
        return this.m[i];
      },
      set(this: Matrix, v: number) {
        this.m[i] = v;
      },
    });
  }
  Object.assign(globalThis, { DOMMatrix: Matrix, DOMPoint: Point });
}

