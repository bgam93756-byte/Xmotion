import{n as e}from"./rolldown-runtime-Dd_uD5pT.js";function t(e,t=0){let n=Math.sin(e*127.1+t*311.7)*43758.5453123;return n-Math.floor(n)}function n(e,n=0){let r=Math.floor(e),i=e-r,a=t(r,n)*2-1,o=t(r+1,n)*2-1,s=i*i*i*(i*(i*6-15)+10),c=a*i;return(c+(o*(i-1)-c)*s)*2}function r(e,t=0,r=1){let i=0,a=1,o=0,s=1;for(let c=0;c<Math.max(1,Math.min(8,r));c++)i+=n(e*s,t+c*17.13)*a,o+=a,a*=.5,s*=2;return i/o}function i(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return(t>>>0)%10007}var a=(e,t,n,r,i,a={})=>({key:e,label:t,kind:`number`,def:n,min:r,max:i,slider:r!==void 0&&i!==void 0,...a}),o=(e,t,n,r=0,i=100)=>a(e,t,n,r,i,{unit:`%`}),s=(e,t,n)=>a(e,t,n,void 0,void 0,{unit:`°`}),c=(e,t,n,r=500)=>a(e,t,n,0,r,{unit:`px`}),l=(e,t,n)=>({key:e,label:t,kind:`color`,def:n}),u=(e,t,n=[50,50])=>({key:e,label:t,kind:`vec2`,def:n,unit:`%`}),d=(e,t,n,r=`px`)=>({key:e,label:t,kind:`vec2`,def:n,unit:r}),f=(e,t,n,r=0)=>({key:e,label:t,kind:`number`,def:r,options:n,step:1,min:0,max:n.length-1}),p=(e=100)=>o(`mix`,`Blend with original`,e),m=Math.PI/180;function h(e,t){let n=t-Math.floor(t);switch(e){case 1:return 1-4*Math.abs(n-.5);case 2:return n<.5?1:-1;case 3:return n*2-1;default:return Math.sin(t*Math.PI*2)}}var g=[`Sine`,`Triangle`,`Square`,`Sawtooth`],_=`
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
}`,v=`
uniform vec2 u_dir; uniform float u_radius;
void main() {
  if (u_radius < 0.5) { gl_FragColor = tex(v_uv); return; }
  float st = max(1.0, u_radius / 16.0);
  vec4 s = vec4(0.0); float n = 0.0;
  for (int i = -16; i <= 16; i++) {
    float x = float(i) * st;
    if (abs(x) > u_radius) continue;
    s += texClip(v_uv + u_dir * x / u_res); n += 1.0;
  }
  gl_FragColor = s / max(n, 1.0);
}`;function y(e,t=0){let n=[];return t!==2&&n.push({frag:_,u:{u_dir:[1,0],u_sigma:e}}),t!==1&&n.push({frag:_,u:{u_dir:[0,1],u_sigma:e}}),n}function b(e,t=1){let n=[];for(let r=0;r<t;r++)n.push({frag:v,u:{u_dir:[1,0],u_radius:e}},{frag:v,u:{u_dir:[0,1],u_radius:e}});return n}var ee=`
uniform float u_th;
void main() {
  vec4 c = tex(v_uv);
  float l = lum(unpre(c).rgb);
  gl_FragColor = c * smoothstep(u_th, u_th + 0.12, l);
}`,x=(e,t)=>{let[n,r]=e.toBuf(t);return[n/e.w,1-r/e.h]},S=(e,t)=>{let[n,r]=e.toBuf(t);return[n,e.h-r]},te=`
uniform vec2 u_vec;
void main() {
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 40; i++) sum += texClip(v_uv + u_vec * (float(i) / 39.0 - 0.5) / u_res);
  gl_FragColor = sum / 40.0;
}`,ne=`
uniform vec2 u_c; uniform float u_amount;
void main() {
  vec4 sum = vec4(0.0);
  vec2 d = v_uv - u_c;
  for (int i = 0; i < 40; i++) sum += texClip(u_c + d * (1.0 - u_amount * float(i) / 39.0));
  gl_FragColor = sum / 40.0;
}`,re=`
uniform vec2 u_c; uniform float u_angle;
void main() {
  vec2 p = v_uv * u_res - u_c;
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 40; i++) {
    float a = (float(i) / 39.0 - 0.5) * u_angle;
    sum += texClip((u_c + rot(a) * p) / u_res);
  }
  gl_FragColor = sum / 40.0;
}`,ie=`
uniform float u_r; uniform float u_boost;
void main() {
  vec4 acc = vec4(0.0); float ws = 0.0;
  for (int i = 0; i < 72; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / 72.0) * u_r;
    float a = fi * 2.39996;
    vec4 s = texClip(v_uv + vec2(cos(a), sin(a)) * r / u_res);
    float w = 1.0 + u_boost * pow(lum(unpre(s).rgb), 4.0) * s.a;
    acc += s * w; ws += w;
  }
  gl_FragColor = acc / ws;
}`,ae=`
void main() {
  vec4 b = tex(v_uv); vec4 o = orig(v_uv);
  vec3 rgb = b.a > 0.001 ? b.rgb / b.a : unpre(o).rgb;
  gl_FragColor = vec4(rgb * o.a, o.a);
}`,oe=`
void main() {
  vec4 b = tex(v_uv); vec4 o = orig(v_uv);
  vec3 rgb = o.a > 0.01 ? o.rgb / o.a : (b.a > 0.001 ? b.rgb / b.a : vec3(0.0));
  gl_FragColor = vec4(rgb * b.a, b.a);
}`,se=`
void main() {
  vec4 b = tex(v_uv); vec4 o = orig(v_uv);
  float a = o.a * clamp((b.a - 0.5) * 2.0, 0.0, 1.0);
  gl_FragColor = vec4(unpre(o).rgb * a, a);
}`,ce=`
uniform float u_k;
void main() {
  vec4 b = tex(v_uv); vec4 o = orig(v_uv);
  float a = smoothstep(0.5 - u_k, 0.5 + u_k, b.a);
  vec3 rgb = o.a > 0.01 ? o.rgb / o.a : (b.a > 0.001 ? b.rgb / b.a : vec3(0.0));
  gl_FragColor = vec4(rgb * a, a);
}`,le=`
uniform float u_amt;
void main() {
  vec2 d = 1.0 / u_res;
  vec4 c = tex(v_uv);
  vec4 n = tex(v_uv + vec2(d.x, 0.0)) + tex(v_uv - vec2(d.x, 0.0)) + tex(v_uv + vec2(0.0, d.y)) + tex(v_uv - vec2(0.0, d.y));
  vec4 s = c * (1.0 + 4.0 * u_amt) - n * u_amt;
  gl_FragColor = vec4(clamp(s.rgb, 0.0, c.a), c.a);
}`,ue=`
uniform float u_amt; uniform float u_th;
void main() {
  vec4 b = tex(v_uv); vec4 o = orig(v_uv);
  vec3 d = o.rgb - b.rgb;
  float m = smoothstep(u_th, u_th + 0.02, abs(lum(d)));
  gl_FragColor = vec4(clamp(o.rgb + d * u_amt * m, 0.0, o.a), o.a);
}`,C=[`Both`,`Horizontal`,`Vertical`],de=[{type:`blur`,label:`Gaussian Blur`,category:`Blur & Sharpen`,description:`Creates a smooth, soft blur.`,props:[a(`amount`,`Blurriness`,12,0,200),f(`dims`,`Direction`,C)],passes:e=>y(e.n(`amount`)*.6*e.scale,e.o(`dims`))},{type:`boxBlur`,label:`Box Blur`,category:`Blur & Sharpen`,description:`Softens an image using a box-shaped blur.`,props:[c(`radius`,`Radius`,10,200)],passes:e=>b(e.n(`radius`)*e.scale)},{type:`preciseBoxBlur`,label:`Precise Box Blur`,category:`Blur & Sharpen`,description:`Applies a box blur with more precise control.`,props:[c(`radius`,`Radius`,8,200),a(`iterations`,`Iterations`,3,1,5,{step:1}),f(`dims`,`Direction`,C)],passes:e=>{let t=e.n(`radius`)*e.scale,n=e.o(`dims`);return b(t,Math.round(e.n(`iterations`))).filter(e=>n===0||(n===1?e.u.u_dir[0]===1:e.u.u_dir[1]===1))}},{type:`dirBlur`,label:`Directional Blur`,category:`Blur & Sharpen`,description:`Blurs an image in a chosen direction.`,props:[c(`amount`,`Length`,30,400),s(`angle`,`Direction`,0)],passes:e=>{let t=e.n(`angle`)*m,n=e.n(`amount`)*e.scale;return[{frag:te,u:{u_vec:[Math.cos(t)*n,-Math.sin(t)*n]}}]}},{type:`zoomBlur`,label:`Zoom Blur`,category:`Blur & Sharpen`,description:`Creates blur radiating toward or away from a center.`,props:[o(`amount`,`Strength`,25),u(`center`,`Center`)],passes:e=>[{frag:ne,u:{u_c:x(e,e.pt(`center`)),u_amount:e.n(`amount`)/100}}]},{type:`spinBlur`,label:`Spin Blur`,category:`Blur & Sharpen`,description:`Blurs content around a rotation center.`,props:[a(`angle`,`Angle`,20,0,360,{unit:`°`}),u(`center`,`Center`)],passes:e=>[{frag:re,u:{u_c:S(e,e.pt(`center`)),u_angle:e.n(`angle`)*m}}]},{type:`lensBlur`,label:`Lens Blur`,category:`Blur & Sharpen`,description:`Simulates camera lens or depth-of-field blur with bokeh highlights.`,props:[c(`radius`,`Iris radius`,14,120),o(`boost`,`Specular brightness`,60,0,400)],passes:e=>[{frag:ie,u:{u_r:e.n(`radius`)*e.scale,u_boost:e.n(`boost`)/10}}]},{type:`innerBlur`,label:`Inner Blur`,category:`Blur & Sharpen`,description:`Blurs content within a layer's boundaries, keeping its edges.`,props:[a(`amount`,`Blurriness`,12,0,200)],passes:e=>[...y(e.n(`amount`)*.6*e.scale),{frag:ae}]},{type:`maskBlur`,label:`Mask Blur`,category:`Blur & Sharpen`,description:`Blurs the layer's mask edges while keeping its colors crisp.`,props:[a(`amount`,`Blurriness`,16,0,200)],passes:e=>[...y(e.n(`amount`)*.6*e.scale),{frag:oe}]},{type:`feather`,label:`Feather`,category:`Blur & Sharpen`,description:`Softens the edges of a layer inward.`,props:[c(`amount`,`Feather`,20,300)],passes:e=>[...y(e.n(`amount`)*.5*e.scale),{frag:se}]},{type:`smoothEdges`,label:`Smooth Edges`,category:`Blur & Sharpen`,description:`Reduces jagged edges.`,props:[c(`amount`,`Smoothness`,2,20)],passes:e=>[...y(Math.max(.5,e.n(`amount`)*.6*e.scale)),{frag:ce,u:{u_k:.18}}]},{type:`sharpen`,label:`Sharpen`,category:`Blur & Sharpen`,description:`Makes edges and details appear crisper.`,props:[o(`amount`,`Amount`,50,0,300)],passes:e=>[{frag:le,u:{u_amt:e.n(`amount`)/100}}]},{type:`unsharpMask`,label:`Unsharp Mask`,category:`Blur & Sharpen`,description:`Sharpens details by increasing contrast around edges.`,props:[o(`amount`,`Amount`,80,0,500),c(`radius`,`Radius`,3,50),o(`threshold`,`Threshold`,0)],passes:e=>[...y(e.n(`radius`)*e.scale),{frag:ue,u:{u_amt:e.n(`amount`)/100,u_th:e.n(`threshold`)/100}}]},{type:`motionBlur`,label:`Motion Blur`,category:`Blur & Sharpen`,description:`Adds blur based on animated movement, rotation or scaling of this layer.`,props:[a(`shutter`,`Shutter angle`,180,0,720,{unit:`°`}),a(`samples`,`Samples`,12,2,48,{step:1})],render:`motionBlur`}],w=`
uniform vec4 u_color; uniform float u_k; uniform float u_bloom;
void main() {
  vec4 o = orig(v_uv); vec4 g = tex(v_uv);
  g = vec4(g.rgb * u_color.rgb, g.a) * u_k;
  vec4 c = o + g * (1.0 - o.a) + g * u_bloom * o.a;
  c.a = min(c.a, 1.0);
  gl_FragColor = vec4(min(c.rgb, vec3(c.a)), c.a);
}`,fe=`
uniform float u_k;
void main() {
  vec4 o = orig(v_uv); vec4 b = unpre(tex(v_uv));
  vec4 u = unpre(o);
  vec3 s = 1.0 - (1.0 - u.rgb) * (1.0 - b.rgb * u_k);
  gl_FragColor = pre(vec4(s, o.a));
}`,pe=`
uniform vec4 u_color; uniform float u_k;
void main() {
  vec4 o = orig(v_uv);
  float a = clamp(tex(v_uv).a * u_k, 0.0, 1.0) * u_color.a;
  gl_FragColor = o + vec4(u_color.rgb, 1.0) * a * (1.0 - o.a);
}`,me=`
void main() {
  vec2 d = 1.0 / u_res;
  float l = tex(v_uv - vec2(d.x, 0.0)).a, r = tex(v_uv + vec2(d.x, 0.0)).a;
  float b = tex(v_uv - vec2(0.0, d.y)).a, t = tex(v_uv + vec2(0.0, d.y)).a;
  float ll = lum(unpre(tex(v_uv - vec2(d.x, 0.0))).rgb), lr = lum(unpre(tex(v_uv + vec2(d.x, 0.0))).rgb);
  float lb = lum(unpre(tex(v_uv - vec2(0.0, d.y))).rgb), lt = lum(unpre(tex(v_uv + vec2(0.0, d.y))).rgb);
  float e = clamp(length(vec2(r - l, t - b)) * 1.5 + length(vec2(lr - ll, lt - lb)) * 0.8, 0.0, 1.0);
  gl_FragColor = vec4(vec3(e), e);
}`,he=`
uniform float u_freq; uniform float u_amp; uniform float u_speed;
void main() {
  vec2 p = v_uv * u_res;
  float t = u_time * u_speed;
  vec2 n = vec2(fbm(p * u_freq + vec2(t, 0.0), 4.0), fbm(p * u_freq + vec2(3.1, t) + 13.7, 4.0)) - 0.5;
  float a = texClip((p + n * u_amp) / u_res).a;
  float line = 1.0 - smoothstep(0.0, 0.35, abs(a - 0.5) * 2.0);
  gl_FragColor = vec4(vec3(line), line);
}`,ge=`
uniform vec4 u_color; uniform float u_k;
void main() {
  vec4 o = orig(v_uv); vec4 g = tex(v_uv);
  float core = smoothstep(0.35, 0.8, g.a);
  vec3 add = u_color.rgb * g.a * u_k + vec3(core);
  float a = max(o.a, clamp(g.a * u_k + core, 0.0, 1.0));
  gl_FragColor = vec4(min(o.rgb + add, vec3(a)), a);
}`,_e=`
uniform vec4 u_color; uniform float u_k; uniform float u_invert;
void main() {
  vec4 o = orig(v_uv);
  float b = tex(v_uv).a;
  float g = (u_invert > 0.5 ? b : 1.0 - b) * u_k;
  vec4 u = unpre(o);
  vec3 rgb = mix(u.rgb, u_color.rgb, clamp(g, 0.0, 1.0) * u_color.a);
  gl_FragColor = pre(vec4(rgb, u.a));
}`,ve=`
uniform float u_pos; uniform float u_width; uniform vec2 u_dir; uniform vec4 u_color; uniform float u_k;
void main() {
  vec4 o = tex(v_uv);
  vec2 q = lp() - lcenter();
  float span = abs(u_lb.z * u_dir.x) + abs(u_lb.w * u_dir.y);
  float d = dot(q, u_dir) / max(span, 1.0) + 0.5;
  float band = exp(-pow((d - u_pos) / max(u_width, 0.001), 2.0));
  vec3 add = u_color.rgb * band * u_k * o.a;
  gl_FragColor = vec4(min(o.rgb + add, vec3(o.a)), o.a);
}`,ye=`
uniform vec2 u_L; uniform float u_size; uniform float u_k; uniform vec4 u_color;
void main() {
  vec4 o = tex(v_uv);
  vec2 p = v_uv * u_res;
  vec2 d = p - u_L;
  float r = length(d) / u_size;
  float core = exp(-r * r * 6.0) * 1.4 + exp(-r * 2.2) * 0.35;
  float ring = exp(-pow((r - 1.3) * 7.0, 2.0)) * 0.22;
  float a = atan(d.y, d.x);
  float rays = pow(abs(sin(a * 6.0 + 0.4)), 30.0) * exp(-r * 1.1) * 0.5;
  float streak = exp(-abs(d.y) / u_size * 18.0) * exp(-abs(d.x) / u_size * 0.6) * 0.6;
  vec3 c = u_color.rgb * (core + ring + rays + streak);
  vec2 axis = u_res * 0.5 - u_L;
  for (int i = 1; i <= 6; i++) {
    float fi = float(i);
    vec2 gp = u_L + axis * (0.35 * fi);
    float gr = length(p - gp) / (u_size * (0.12 + 0.18 * hash1(fi + 3.0)));
    c += hsv2rgb(vec3(fract(0.13 * fi + 0.5), 0.55, 1.0)) * 0.16 * exp(-gr * gr * 2.5);
  }
  c *= u_k;
  float al = max(o.a, clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0));
  gl_FragColor = vec4(min(o.rgb + c, vec3(al)), al);
}`,be=`
uniform vec2 u_c; uniform float u_len; uniform float u_k; uniform float u_th;
void main() {
  vec4 o = tex(v_uv);
  vec2 d = v_uv - u_c;
  vec4 acc = vec4(0.0); float w = 1.0; float ws = 0.0;
  for (int i = 0; i < 56; i++) {
    float f = float(i) / 55.0 * u_len;
    vec4 s = texClip(v_uv - d * f);
    acc += s * smoothstep(u_th, u_th + 0.15, lum(unpre(s).rgb)) * w;
    ws += w; w *= 0.965;
  }
  vec4 r = acc / ws * u_k;
  float a = max(o.a, min(1.0, r.a));
  gl_FragColor = vec4(min(o.rgb + r.rgb, vec3(a)), a);
}`,T=`
uniform float u_mode; uniform vec2 u_c; uniform vec2 u_vec; uniform float u_amount; uniform float u_th; uniform float u_k;
void main() {
  vec4 o = tex(v_uv);
  vec2 p = v_uv * u_res;
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 48; i++) {
    float f = float(i) / 47.0;
    vec2 q;
    if (u_mode < 0.5) q = p - u_vec * f;
    else if (u_mode < 1.5) q = u_c + (p - u_c) * (1.0 - u_amount * f);
    else q = u_c + rot(u_amount * f) * (p - u_c);
    vec4 s = texClip(q / u_res);
    acc += s * smoothstep(u_th, u_th + 0.12, lum(unpre(s).rgb)) * (1.0 - f);
  }
  vec4 r = acc / 24.0 * u_k;
  float a = max(o.a, min(1.0, r.a));
  gl_FragColor = vec4(min(o.rgb + r.rgb, vec3(a)), a);
}`,xe=`
uniform float u_h; uniform vec2 u_light; uniform float u_soft; uniform float u_spec;
float L(vec2 uv) { return lum(unpre(tex(uv)).rgb); }
void main() {
  vec4 c = tex(v_uv);
  vec2 d = u_soft / u_res;
  float dx = L(v_uv + vec2(d.x, 0.0)) - L(v_uv - vec2(d.x, 0.0));
  float dy = L(v_uv + vec2(0.0, d.y)) - L(v_uv - vec2(0.0, d.y));
  vec3 n = normalize(vec3(-dx * u_h, -dy * u_h, 1.0));
  vec3 l = normalize(vec3(u_light, 0.9));
  float diff = max(dot(n, l), 0.0);
  float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0) * u_spec;
  vec4 u = unpre(c);
  gl_FragColor = pre(vec4(clamp(u.rgb * (0.3 + 0.85 * diff) + spec, 0.0, 1.0), u.a));
}`,Se=`
uniform vec2 u_light; uniform float u_depth; uniform vec4 u_hi; uniform vec4 u_sh;
void main() {
  vec4 o = orig(v_uv);
  if (o.a < 0.001) { gl_FragColor = vec4(0.0); return; }
  vec2 d = 1.5 / u_res;
  float dx = tex(v_uv + vec2(d.x, 0.0)).a - tex(v_uv - vec2(d.x, 0.0)).a;
  float dy = tex(v_uv + vec2(0.0, d.y)).a - tex(v_uv - vec2(0.0, d.y)).a;
  vec3 n = normalize(vec3(-dx * u_depth, -dy * u_depth, 1.0));
  float s = dot(n.xy, u_light) * 1.6;
  vec4 u = unpre(o);
  vec3 rgb = mix(u.rgb, u_hi.rgb, clamp(s, 0.0, 1.0) * u_hi.a);
  rgb = mix(rgb, u_sh.rgb, clamp(-s, 0.0, 1.0) * u_sh.a);
  gl_FragColor = pre(vec4(rgb, u.a));
}`,Ce=`
uniform vec2 u_off; uniform vec4 u_color;
void main() {
  vec4 o = orig(v_uv);
  float a = texClip(v_uv - u_off / u_res).a * u_color.a;
  gl_FragColor = o + vec4(u_color.rgb, 1.0) * a * (1.0 - o.a);
}`,we=`
uniform vec2 u_dir; uniform float u_len; uniform vec4 u_color; uniform float u_fade;
void main() {
  vec4 o = tex(v_uv);
  vec2 p = v_uv * u_res;
  float a = 0.0;
  for (int i = 1; i <= 96; i++) {
    float f = float(i) / 96.0;
    a = max(a, origClip((p - u_dir * f * u_len) / u_res).a * (1.0 - u_fade * f));
  }
  gl_FragColor = o + vec4(u_color.rgb, 1.0) * a * u_color.a * (1.0 - o.a);
}`,Te=`
uniform vec2 u_L; uniform float u_k; uniform float u_soft; uniform vec4 u_color;
void main() {
  vec4 o = tex(v_uv);
  vec2 p = v_uv * u_res;
  float a = 0.0;
  for (int i = 0; i < 12; i++) {
    float j = (float(i) / 11.0 - 0.5) * u_soft;
    a += origClip((u_L + (p - u_L) / (1.0 + u_k + j)) / u_res).a;
  }
  a /= 12.0;
  gl_FragColor = o + vec4(u_color.rgb, 1.0) * a * u_color.a * (1.0 - o.a);
}`,Ee=`
uniform vec2 u_dir; uniform float u_len; uniform float u_shade;
void main() {
  vec4 o = tex(v_uv);
  vec2 p = v_uv * u_res;
  vec4 ex = vec4(0.0);
  for (int i = 1; i <= 96; i++) {
    float f = float(i) / 96.0;
    vec4 s = origClip((p - u_dir * f * u_len) / u_res);
    if (s.a > 0.5) { vec4 u = unpre(s); ex = pre(vec4(u.rgb * (1.0 - u_shade * f), 1.0)); break; }
  }
  gl_FragColor = o + ex * (1.0 - o.a);
}`,De=`
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
}`,Oe=`
uniform vec2 u_c; uniform float u_mag; uniform float u_amt;
void main() {
  vec4 o = tex(v_uv);
  vec3 bg = unpre(aux(u_c + (v_uv - u_c) / max(u_mag, 0.01))).rgb;
  gl_FragColor = mix(o, vec4(bg * o.a, o.a), u_amt);
}`,ke=`
uniform float u_refr; uniform float u_noise; uniform float u_size; uniform float u_src; uniform float u_hl;
void main() {
  vec4 o = orig(v_uv);
  if (o.a < 0.001) { gl_FragColor = vec4(0.0); return; }
  vec2 d = 1.5 / u_res;
  float dx = tex(v_uv + vec2(d.x, 0.0)).a - tex(v_uv - vec2(d.x, 0.0)).a;
  float dy = tex(v_uv + vec2(0.0, d.y)).a - tex(v_uv - vec2(0.0, d.y)).a;
  vec2 q = lp() / max(u_size, 1.0);
  vec2 nz = vec2(vnoise(q), vnoise(q + 19.3)) - 0.5;
  vec2 off = (-vec2(dx, dy) * u_refr * 3.0 + nz * u_noise) * u_scale / u_res;
  vec4 s = u_src < 0.5 ? aux(v_uv + off) : origClip(v_uv + off);
  vec3 rgb = unpre(s).rgb;
  float spec = pow(clamp(dot(normalize(vec2(-dx, -dy) + 1e-5), vec2(-0.7, 0.7)), 0.0, 1.0), 6.0) * clamp(length(vec2(dx, dy)) * 4.0, 0.0, 1.0) * u_hl;
  rgb = rgb * 0.94 + 0.04 + spec;
  gl_FragColor = pre(vec4(clamp(rgb, 0.0, 1.0), o.a));
}`,Ae=`
uniform float u_amt; uniform float u_con; uniform float u_sat;
void main() {
  vec4 o = orig(v_uv); vec4 b = tex(v_uv);
  vec4 u = unpre(o); vec4 bu = unpre(b);
  vec3 sc = 1.0 - (1.0 - u.rgb) * (1.0 - bu.rgb);
  vec3 rgb = mix(u.rgb, sc, u_amt);
  rgb = (rgb - 0.5) * (1.0 + u_con) + 0.5;
  rgb = mix(vec3(lum(rgb)), rgb, 1.0 + u_sat);
  vec4 inside = pre(vec4(clamp(rgb, 0.0, 1.0), u.a));
  vec4 c = inside + b * u_amt * 0.6 * (1.0 - o.a);
  gl_FragColor = vec4(min(c.rgb, vec3(c.a)), min(c.a, 1.0));
}`,je=`
uniform float u_w; uniform float u_refr; uniform vec2 u_dir;
void main() {
  vec2 q = lp();
  float s = dot(q, u_dir) / max(u_w, 1.0);
  float f = fract(s) - 0.5;
  vec4 c = texL(q + u_dir * f * u_refr);
  c.rgb += (1.0 - smoothstep(0.0, 0.12, 0.5 - abs(f))) * 0.18 * c.a;
  gl_FragColor = vec4(min(c.rgb, vec3(c.a)), c.a);
}`,Me=e=>[Math.cos(e*m),-Math.sin(e*m)],E=e=>[Math.sin(e*m),Math.cos(e*m)],D=e=>[Math.cos(e*m),Math.sin(e*m)],O=(e,t,n,r,i,a)=>[...t>0?[{frag:ee,u:{u_th:t}}]:[],...y(n*.5*e.scale),{frag:w,u:{u_color:r,u_k:i,u_bloom:a}}];function Ne(e){let t=e>>>0||1;return()=>{t=t+1831565813>>>0;let e=t;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}}var Pe=[{type:`glow`,label:`Glow`,category:`Glow & Light`,description:`Adds a luminous halo to bright areas or edges.`,props:[c(`radius`,`Radius`,24,300),o(`strength`,`Intensity`,120,0,500),o(`threshold`,`Threshold`,0),l(`color`,`Tint`,`#ffffff`)],passes:e=>O(e,e.n(`threshold`)/100,e.n(`radius`),e.c(`color`),e.n(`strength`)/100,.3)},{type:`lightGlow`,label:`Light Glow`,category:`Glow & Light`,description:`Creates a soft glow around brighter areas.`,props:[c(`radius`,`Radius`,40,300),o(`strength`,`Intensity`,150,0,500),o(`threshold`,`Threshold`,55)],passes:e=>O(e,e.n(`threshold`)/100,e.n(`radius`),[1,1,1,1],e.n(`strength`)/100,.6)},{type:`softGlow`,label:`Soft Glow`,category:`Glow & Light`,description:`Adds a gentle, diffused glow.`,props:[c(`radius`,`Radius`,20,300),o(`amount`,`Amount`,60,0,200)],passes:e=>[...y(e.n(`radius`)*.5*e.scale),{frag:fe,u:{u_k:e.n(`amount`)/100}}]},{type:`darkGlow`,label:`Dark Glow`,category:`Glow & Light`,description:`Adds a dark or contrasting glow around the layer.`,props:[c(`radius`,`Radius`,30,300),o(`strength`,`Intensity`,150,0,500),l(`color`,`Color`,`#000000`)],passes:e=>[...y(e.n(`radius`)*.5*e.scale),{frag:pe,u:{u_color:e.c(`color`),u_k:e.n(`strength`)/100}}]},{type:`edgeGlow`,label:`Edge Glow`,category:`Glow & Light`,description:`Adds a glow around detected edges.`,props:[c(`radius`,`Radius`,12,200),o(`strength`,`Intensity`,200,0,800),l(`color`,`Color`,`#4de1ff`)],passes:e=>[{frag:me},...y(e.n(`radius`)*.5*e.scale),{frag:w,u:{u_color:e.c(`color`),u_k:e.n(`strength`)/100,u_bloom:1}}]},{type:`electricEdges`,label:`Electric Edges`,category:`Glow & Light`,description:`Creates glowing, irregular electric-looking outlines.`,props:[l(`color`,`Color`,`#5ad1ff`),o(`strength`,`Intensity`,260,0,600),c(`amplitude`,`Jaggedness`,16,100),a(`frequency`,`Detail`,3,.5,30),a(`speed`,`Speed`,4,0,30),c(`thickness`,`Thickness`,6,40),c(`glow`,`Glow radius`,12,120)],passes:e=>[...y(Math.max(.5,e.n(`thickness`)*e.scale)),{frag:he,u:{u_freq:e.n(`frequency`)/100/e.scale,u_amp:e.n(`amplitude`)*e.scale,u_speed:e.n(`speed`)}},...y(e.n(`glow`)*.5*e.scale),{frag:ge,u:{u_color:e.c(`color`),u_k:e.n(`strength`)/100}}]},{type:`innerGlow`,label:`Inner Glow`,category:`Glow & Light`,description:`Adds a glow inside the edges of a layer.`,props:[c(`radius`,`Radius`,20,300),o(`strength`,`Intensity`,120,0,500),l(`color`,`Color`,`#ffffff`),f(`source`,`Source`,[`Edges`,`Center`])],passes:e=>[...y(e.n(`radius`)*.5*e.scale),{frag:_e,u:{u_color:e.c(`color`),u_k:e.n(`strength`)/100,u_invert:e.o(`source`)}}]},{type:`glowScan`,label:`Glow Scan`,category:`Glow & Light`,description:`Creates a moving scan effect with glowing highlights.`,props:[l(`color`,`Color`,`#ffffff`),o(`strength`,`Intensity`,120,0,500),s(`angle`,`Direction`,20),o(`width`,`Width`,12,1,100),o(`position`,`Position`,50,-50,150),a(`speed`,`Auto speed (scans/s)`,.5,0,10)],passes:e=>{let t=e.n(`speed`),n=t>0?(e.local*t-Math.floor(e.local*t))*1.6-.3:e.n(`position`)/100,r=e.n(`angle`)*m;return[{frag:ve,u:{u_pos:n,u_width:e.n(`width`)/100,u_dir:[Math.cos(r),Math.sin(r)],u_color:e.c(`color`),u_k:e.n(`strength`)/100}}]}},{type:`lensFlare`,label:`Lens Flare`,category:`Glow & Light`,description:`Adds a bright lens-flare effect.`,props:[u(`position`,`Light position`,[25,25]),c(`size`,`Size`,120,1e3),o(`brightness`,`Brightness`,100,0,400),l(`color`,`Color`,`#ffd9a8`)],passes:e=>[{frag:ye,u:{u_L:S(e,e.pt(`position`)),u_size:Math.max(1,e.n(`size`)*e.scale),u_k:e.n(`brightness`)/100,u_color:e.c(`color`)}}]},{type:`lightning`,label:`Lightning`,category:`Glow & Light`,description:`Generates lightning-like bolts between two points.`,props:[u(`start`,`Start`,[50,0]),u(`end`,`End`,[50,100]),l(`color`,`Color`,`#9fd8ff`),c(`thickness`,`Thickness`,3,30),c(`glow`,`Glow`,18,80),o(`jag`,`Jaggedness`,35,0,100),a(`branches`,`Branches`,3,0,12,{step:1}),a(`speed`,`Strikes / sec`,8,0,60)],apply:e=>{let t=Ne(Math.floor(e.local*Math.max(1e-4,e.n(`speed`)))*7919+e.seed),n=e.toBuf(e.pt(`start`)),r=e.toBuf(e.pt(`end`)),i=e.n(`jag`)/100,a=(e,n,r)=>{let a=[e,n],o=Math.hypot(n[0]-e[0],n[1]-e[1])*i*.5;for(let e=0;e<r;e++){let e=[a[0]];for(let n=1;n<a.length;n++){let[r,i]=a[n-1],[s,c]=a[n],l=Math.hypot(s-r,c-i)||1,u=(t()-.5)*o;e.push([(r+s)/2+-(c-i)/l*u,(i+c)/2+(s-r)/l*u],a[n])}a=e,o*=.55}return a},o=e.ctx,s=(e,t)=>{o.beginPath(),e.forEach(([e,t],n)=>n?o.lineTo(e,t):o.moveTo(e,t)),o.lineWidth=t,o.stroke()},[c,l,u]=e.c(`color`).map(e=>Math.round(e*255)),d=a(n,r,7);o.save(),o.setTransform(1,0,0,1,0,0),o.lineCap=`round`,o.lineJoin=`round`,o.shadowColor=`rgb(${c},${l},${u})`,o.shadowBlur=e.n(`glow`)*e.scale,o.strokeStyle=`rgba(${c},${l},${u},0.9)`;let f=Math.max(.5,e.n(`thickness`)*e.scale);s(d,f*2);for(let i=0;i<e.n(`branches`);i++){let e=d[Math.floor(t()*(d.length-2))+1],i=Math.hypot(r[0]-n[0],r[1]-n[1])*(.15+t()*.25),o=Math.atan2(r[1]-n[1],r[0]-n[0])+(t()-.5)*1.6;s(a(e,[e[0]+Math.cos(o)*i,e[1]+Math.sin(o)*i],5),f)}o.shadowBlur=0,o.strokeStyle=`#ffffff`,s(d,f*.8),o.restore()}},{type:`rays`,label:`Rays`,category:`Glow & Light`,description:`Creates visible beams of light streaming from bright areas.`,props:[u(`center`,`Light source`,[50,30]),o(`length`,`Length`,60,0,100),o(`strength`,`Intensity`,100,0,600),o(`threshold`,`Threshold`,55)],passes:e=>[{frag:be,u:{u_c:x(e,e.pt(`center`)),u_len:e.n(`length`)/100,u_k:e.n(`strength`)/100,u_th:e.n(`threshold`)/100}}]},{type:`linearStreaks`,label:`Linear Streaks`,category:`Glow & Light`,description:`Creates elongated streaks of light or color.`,props:[s(`angle`,`Direction`,0),c(`length`,`Length`,120,1e3),o(`strength`,`Intensity`,120,0,600),o(`threshold`,`Threshold`,50)],passes:e=>{let[t,n]=Me(e.n(`angle`)),r=e.n(`length`)*e.scale;return[{frag:T,u:{u_mode:0,u_c:[0,0],u_vec:[t*r,n*r],u_amount:0,u_th:e.n(`threshold`)/100,u_k:e.n(`strength`)/100}}]}},{type:`zoomStreaks`,label:`Zoom Streaks`,category:`Glow & Light`,description:`Creates streaks that simulate rapid zooming.`,props:[u(`center`,`Center`),o(`length`,`Length`,30,0,100),o(`strength`,`Intensity`,120,0,600),o(`threshold`,`Threshold`,50)],passes:e=>[{frag:T,u:{u_mode:1,u_c:S(e,e.pt(`center`)),u_vec:[0,0],u_amount:e.n(`length`)/100,u_th:e.n(`threshold`)/100,u_k:e.n(`strength`)/100}}]},{type:`spinStreaks`,label:`Spin Streaks`,category:`Glow & Light`,description:`Creates streaks associated with spinning movement.`,props:[u(`center`,`Center`),a(`angle`,`Angle`,30,0,360,{unit:`°`}),o(`strength`,`Intensity`,120,0,600),o(`threshold`,`Threshold`,50)],passes:e=>[{frag:T,u:{u_mode:2,u_c:S(e,e.pt(`center`)),u_vec:[0,0],u_amount:e.n(`angle`)*m,u_th:e.n(`threshold`)/100,u_k:e.n(`strength`)/100}}]},{type:`bumpMap`,label:`Bump Map`,category:`Glow & Light`,description:`Uses lighting and surface information to create a raised, embossed appearance.`,props:[a(`height`,`Height`,8,0,60),s(`light`,`Light angle`,135),c(`softness`,`Softness`,2,20),o(`specular`,`Shine`,30)],passes:e=>[{frag:xe,u:{u_h:e.n(`height`),u_light:D(e.n(`light`)),u_soft:Math.max(1,e.n(`softness`)*e.scale),u_spec:e.n(`specular`)/100}}]},{type:`smoothBevel`,label:`Smooth Bevel`,category:`Glow & Light`,description:`Creates softened beveled edges that give shapes depth.`,props:[c(`size`,`Bevel size`,12,120),s(`light`,`Light angle`,135),a(`depth`,`Depth`,10,0,40),l(`highlight`,`Highlight`,`#ffffffcc`),l(`shadow`,`Shadow`,`#000000aa`)],passes:e=>[...y(e.n(`size`)*.5*e.scale),{frag:Se,u:{u_light:D(e.n(`light`)),u_depth:e.n(`depth`)*4,u_hi:e.c(`highlight`),u_sh:e.c(`shadow`)}}]},{type:`shadow`,label:`Drop Shadow`,category:`Glow & Light`,description:`Casts a soft shadow behind the layer.`,props:[l(`color`,`Color`,`#000000b0`),c(`distance`,`Distance`,16,400),s(`angle`,`Direction`,135),c(`softness`,`Softness`,18,200)],passes:e=>{let[t,n]=E(e.n(`angle`)),r=e.n(`distance`)*e.scale;return[...y(e.n(`softness`)*.5*e.scale),{frag:Ce,u:{u_off:[t*r,n*r],u_color:e.c(`color`)}}]}},{type:`longShadow`,label:`Long Shadow`,category:`Glow & Light`,description:`Extends a shadow away from an object.`,props:[s(`angle`,`Direction`,135),c(`length`,`Length`,300,2e3),l(`color`,`Color`,`#00000099`),o(`fade`,`Fade`,60)],passes:e=>[{frag:we,u:{u_dir:E(e.n(`angle`)),u_len:e.n(`length`)*e.scale,u_color:e.c(`color`),u_fade:e.n(`fade`)/100}}]},{type:`radialShadow`,label:`Radial Shadow`,category:`Glow & Light`,description:`Casts a shadow away from a point light.`,props:[u(`light`,`Light position`,[30,10]),o(`distance`,`Projection distance`,15,0,200),o(`softness`,`Softness`,10,0,100),l(`color`,`Color`,`#000000aa`)],passes:e=>[{frag:Te,u:{u_L:S(e,e.pt(`light`)),u_k:e.n(`distance`)/100,u_soft:e.n(`softness`)/100,u_color:e.c(`color`)}}]},{type:`rasterExtrude`,label:`Raster Extrude`,category:`Glow & Light`,description:`Gives raster imagery an extended, dimensional appearance.`,props:[s(`angle`,`Direction`,135),c(`depth`,`Depth`,40,400),o(`shade`,`Shading`,50)],passes:e=>[{frag:Ee,u:{u_dir:E(e.n(`angle`)),u_len:e.n(`depth`)*e.scale,u_shade:e.n(`shade`)/100}}]},{type:`outline`,label:`Outline / Sticker`,category:`Glow & Light`,description:`Draws a solid outline around the layer, like a sticker.`,props:[c(`width`,`Width`,10,60),l(`color`,`Color`,`#ffffff`)],passes:e=>[{frag:De,u:{u_width:e.n(`width`)*e.scale,u_color:e.c(`color`)}}]},{type:`copyBackground`,label:`Copy Background`,category:`Glow & Light`,description:`Copies the imagery behind the layer into its shape — add blur for frosted glass.`,props:[c(`blur`,`Background blur`,0,200),p()],apply:e=>{let t=e.background();if(!t)return;let n=e.temp();n.getContext(`2d`).drawImage(e.buf,0,0);let r=e.ctx,i=e.n(`mix`)/100;r.save(),r.setTransform(1,0,0,1,0,0),r.globalCompositeOperation=`copy`,r.drawImage(t,0,0),r.restore(),e.n(`blur`)>0&&e.shade(y(e.n(`blur`)*.6*e.scale)),r.save(),r.setTransform(1,0,0,1,0,0),r.globalCompositeOperation=`destination-in`,r.drawImage(n,0,0),i<1&&(r.globalCompositeOperation=`source-over`,r.globalAlpha=1-i,r.drawImage(n,0,0)),r.restore()}},{type:`magnifyBackground`,label:`Magnify Background`,category:`Glow & Light`,description:`Magnifies the background behind the layer, like a lens.`,props:[o(`magnification`,`Magnification`,200,10,1e3),u(`center`,`Center`),p()],aux:`background`,passes:e=>[{frag:Oe,u:{u_c:x(e,e.pt(`center`)),u_mag:e.n(`magnification`)/100,u_amt:e.n(`mix`)/100}}]},{type:`glass`,label:`Glass`,category:`Glow & Light`,description:`Makes the layer look like glass refracting what is behind it (or itself).`,props:[f(`source`,`Refract`,[`Background`,`Layer itself`]),c(`refraction`,`Edge refraction`,20,200),c(`noise`,`Surface distortion`,8,100),c(`size`,`Surface size`,60,600),o(`highlight`,`Highlight`,50)],aux:`background`,passes:e=>[...y(6*e.scale),{frag:ke,u:{u_refr:e.n(`refraction`),u_noise:e.n(`noise`),u_size:e.n(`size`),u_src:e.o(`source`),u_hl:e.n(`highlight`)/100}}]},{type:`ominoDiffusion`,label:`Omino Diffusion+`,category:`Glow & Light`,description:`A dreamy diffusion: soft bloom with contrast and saturation control.`,props:[c(`radius`,`Radius`,24,300),o(`amount`,`Amount`,60),o(`contrast`,`Contrast`,10,-100,100),o(`saturation`,`Saturation`,10,-100,100)],passes:e=>[...y(e.n(`radius`)*.5*e.scale),{frag:Ae,u:{u_amt:e.n(`amount`)/100,u_con:e.n(`contrast`)/100,u_sat:e.n(`saturation`)/100}}]},{type:`ominoGlass`,label:`Omino Glass`,category:`Glow & Light`,description:`Fluted / reeded glass distortion.`,props:[c(`width`,`Flute width`,40,400),c(`refraction`,`Refraction`,30,300),s(`angle`,`Angle`,0)],passes:e=>{let t=e.n(`angle`)*m;return[{frag:je,u:{u_w:e.n(`width`),u_refr:e.n(`refraction`),u_dir:[Math.cos(t),Math.sin(t)]}}]}}],k=(e,t,n=``)=>`
${e}
${n}
void main() {
  vec4 c = unpre(tex(v_uv));
  vec3 rgb = c.rgb;
  ${t}
  gl_FragColor = pre(vec4(clamp(rgb, 0.0, 1.0), c.a));
}`,Fe=k(`uniform float u_b; uniform float u_c;`,`rgb = (rgb + u_b - 0.5) * u_c + 0.5;`),Ie=k(`uniform float u_e; uniform float u_off; uniform float u_g;`,`rgb = pow(max(rgb * exp2(u_e) + u_off, 0.0), vec3(1.0 / max(u_g, 0.01)));`),Le=k(`uniform float u_t; uniform float u_tint;`,`rgb *= vec3(1.0 + u_t * 0.22, 1.0 + u_t * 0.04 - u_tint * 0.18, 1.0 - u_t * 0.24); rgb += vec3(u_tint * 0.05, 0.0, u_tint * 0.05);`),Re=k(`uniform vec3 u_gain; uniform float u_lift; uniform float u_gamma;`,`rgb = pow(max(rgb * u_gain + u_lift, 0.0), vec3(1.0 / max(u_gamma, 0.01)));`),ze=k(`uniform float u_h;`,`vec3 h = rgb2hsv(rgb); h.x = fract(h.x + u_h); rgb = hsv2rgb(h);`),Be=k(`uniform float u_s; uniform float u_v;`,`float l = lum(rgb); rgb = mix(vec3(l), rgb, 1.0 + u_s); float s = rgb2hsv(clamp(rgb, 0.0, 1.0)).y; rgb = mix(vec3(lum(rgb)), rgb, 1.0 + u_v * (1.0 - s));`),Ve=k(`uniform float u_sh; uniform float u_hl;`,`float l = lum(rgb); rgb += u_sh * 0.5 * (1.0 - smoothstep(0.0, 0.6, l)); rgb += u_hl * 0.5 * smoothstep(0.4, 1.0, l);`),He=k(`uniform float u_k;`,`vec3 s = smoothstep(0.04, 0.96, rgb); s = mix(vec3(lum(s)), s, 1.0 + 0.9 * u_k); s += vec3(0.09, 0.02, -0.07) * u_k; rgb = mix(rgb, s, clamp(u_k, 0.0, 1.0)) + (s - rgb) * max(u_k - 1.0, 0.0);`),Ue=k(`uniform vec4 u_color; uniform float u_amount;`,`float l = lum(rgb); vec3 t = u_color.rgb; vec3 r = l < 0.5 ? 2.0 * l * t : 1.0 - 2.0 * (1.0 - l) * (1.0 - t); rgb = mix(rgb, r, u_amount);`),We=k(`uniform vec4 u_dark; uniform vec4 u_light; uniform float u_amount;`,`rgb = mix(rgb, mix(u_dark.rgb, u_light.rgb, smoothstep(0.0, 1.0, lum(rgb))), u_amount);`),Ge=k(`uniform vec4 u_c0; uniform vec4 u_c1; uniform vec4 u_c2; uniform float u_amount;`,`float l = lum(rgb); vec3 g = l < 0.5 ? mix(u_c0.rgb, u_c1.rgb, l * 2.0) : mix(u_c1.rgb, u_c2.rgb, (l - 0.5) * 2.0); rgb = mix(rgb, g, u_amount);`),A=`
vec3 blendMode(vec3 b, vec3 s, float m) {
  if (m < 0.5) return s;
  if (m < 1.5) return b * s;
  if (m < 2.5) return 1.0 - (1.0 - b) * (1.0 - s);
  if (m < 3.5) return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
  if (m < 4.5) return min(b + s, 1.0);
  return mix(vec3(lum(b)), s, 1.0) * lum(b) / max(lum(s), 0.001);
}`,j=[`Normal`,`Multiply`,`Screen`,`Overlay`,`Add`,`Color`],Ke=k(`uniform vec4 u_c1; uniform vec4 u_c2; uniform vec2 u_dir; uniform float u_type; uniform float u_mode; uniform float u_op;`,`vec2 q = lp() - lcenter(); float t;
  if (u_type < 0.5) { float span = abs(u_lb.z * u_dir.x) + abs(u_lb.w * u_dir.y); t = dot(q, u_dir) / max(span, 1.0) + 0.5; }
  else t = length(q) / max(0.5 * length(u_lb.zw), 1.0);
  vec4 g = mix(u_c1, u_c2, clamp(t, 0.0, 1.0));
  rgb = mix(rgb, blendMode(rgb, g.rgb, u_mode), g.a * u_op);`,A),qe=k(`uniform vec2 u_p0; uniform vec2 u_p1; uniform vec2 u_p2; uniform vec2 u_p3; uniform vec4 u_k0; uniform vec4 u_k1; uniform vec4 u_k2; uniform vec4 u_k3; uniform float u_blend; uniform float u_mode; uniform float u_op;`,`vec2 q = lp(); float s = lmin();
  float w0 = 1.0 / pow(length(q - u_p0) / s + 0.02, u_blend);
  float w1 = 1.0 / pow(length(q - u_p1) / s + 0.02, u_blend);
  float w2 = 1.0 / pow(length(q - u_p2) / s + 0.02, u_blend);
  float w3 = 1.0 / pow(length(q - u_p3) / s + 0.02, u_blend);
  vec3 g = (u_k0.rgb * w0 + u_k1.rgb * w1 + u_k2.rgb * w2 + u_k3.rgb * w3) / (w0 + w1 + w2 + w3);
  rgb = mix(rgb, blendMode(rgb, g, u_mode), u_op);`,A),Je=k(`uniform vec4 u_k0; uniform vec4 u_k1; uniform vec4 u_k2; uniform vec4 u_k3; uniform vec4 u_k4; uniform float u_mode; uniform float u_amount;`,`vec3 best;
  if (u_mode < 0.5) {
    best = u_k0.rgb; float bd = distance(rgb, u_k0.rgb);
    float d = distance(rgb, u_k1.rgb); if (d < bd) { bd = d; best = u_k1.rgb; }
    d = distance(rgb, u_k2.rgb); if (d < bd) { bd = d; best = u_k2.rgb; }
    d = distance(rgb, u_k3.rgb); if (d < bd) { bd = d; best = u_k3.rgb; }
    d = distance(rgb, u_k4.rgb); if (d < bd) { bd = d; best = u_k4.rgb; }
  } else {
    float i = floor(clamp(lum(rgb), 0.0, 0.999) * 5.0);
    best = i < 0.5 ? u_k0.rgb : i < 1.5 ? u_k1.rgb : i < 2.5 ? u_k2.rgb : i < 3.5 ? u_k3.rgb : u_k4.rgb;
  }
  rgb = mix(rgb, best, u_amount);`),Ye=k(`uniform vec4 u_from; uniform vec4 u_to; uniform float u_tol; uniform float u_soft;`,`float d = distance(rgb, u_from.rgb) / 1.732; float m = 1.0 - smoothstep(u_tol, u_tol + u_soft + 0.001, d); rgb = rgb + (u_to.rgb - u_from.rgb) * m;`),Xe=k(`uniform vec4 u_keep; uniform float u_tol; uniform float u_soft; uniform float u_amount;`,`vec3 hk = rgb2hsv(u_keep.rgb); vec3 hc = rgb2hsv(rgb); float dh = abs(hc.x - hk.x); dh = min(dh, 1.0 - dh) * 2.0; float d = mix(dh, distance(rgb, u_keep.rgb) / 1.732, 0.35) + (hc.y < 0.12 ? 1.0 : 0.0); float m = 1.0 - smoothstep(u_tol, u_tol + u_soft + 0.001, d); rgb = mix(rgb, mix(vec3(lum(rgb)), rgb, m), u_amount);`),Ze=k(`uniform float u_cycles; uniform float u_offset; uniform float u_amount;`,`rgb = mix(rgb, hsv2rgb(vec3(fract(lum(rgb) * u_cycles + u_offset), 1.0, 1.0)), u_amount);`),Qe=k(`uniform float u_freq; uniform float u_phase; uniform float u_size; uniform float u_sat; uniform float u_amount;`,`vec2 q = lp();
  float h = fract(lum(rgb) * u_freq + u_phase + (q.x + q.y * 0.6) / max(u_size, 1.0) + vnoise(q / max(u_size, 1.0) * 2.0) * 0.3);
  vec3 ir = hsv2rgb(vec3(h, u_sat, 1.0));
  vec3 ov = mix(2.0 * rgb * ir, 1.0 - 2.0 * (1.0 - rgb) * (1.0 - ir), step(0.5, rgb));
  rgb = mix(rgb, ov, u_amount);`),$e=k(`uniform vec3 u_src; uniform float u_a;`,`vec4 k = vec4(c.rgb, c.a); rgb = vec3(pick(k, u_src.x), pick(k, u_src.y), pick(k, u_src.z));`,`float pick(vec4 k, float i) {
    if (i < 0.5) return k.r; if (i < 1.5) return k.g; if (i < 2.5) return k.b; if (i < 3.5) return k.a;
    if (i < 4.5) return lum(k.rgb); if (i < 5.5) return 0.0; return 1.0;
  }`),et=k(`uniform vec3 u_src;`,`vec3 h = rgb2hsv(rgb); rgb = hsv2rgb(vec3(pick(h, rgb, u_src.x), pick(h, rgb, u_src.y), pick(h, rgb, u_src.z)));`,`float pick(vec3 h, vec3 r, float i) {
    if (i < 0.5) return h.x; if (i < 1.5) return h.y; if (i < 2.5) return h.z; if (i < 3.5) return r.r;
    if (i < 4.5) return r.g; if (i < 5.5) return r.b; if (i < 6.5) return lum(r); if (i < 7.5) return 0.0; return 1.0;
  }`),tt=k(`uniform float u_amount; uniform float u_mode;`,`vec3 inv = 1.0 - rgb; if (u_mode > 0.5) { vec3 h = rgb2hsv(rgb); h.z = 1.0 - h.z; inv = hsv2rgb(h); } rgb = mix(rgb, inv, u_amount);`),nt=k(`uniform float u_levels;`,`float n = u_levels - 1.0; rgb = floor(rgb * n + 0.5) / n;`),rt=k(`uniform float u_level; uniform float u_soft;`,`rgb = vec3(smoothstep(u_level - u_soft, u_level + u_soft + 0.0001, lum(rgb)));`),it=`
uniform vec4 u_color; uniform float u_amt;
void main() {
  vec4 o = tex(v_uv);
  float a = o.a * u_color.a;
  gl_FragColor = mix(o, vec4(u_color.rgb * a, a), u_amt);
}`,at=k(`uniform float u_bright; uniform float u_contrast; uniform float u_sat; uniform float u_hue; uniform float u_temp;`,`rgb += u_bright;
  rgb = (rgb - 0.5) * u_contrast + 0.5;
  rgb = mix(vec3(lum(rgb)), rgb, u_sat);
  vec3 h = rgb2hsv(clamp(rgb, 0.0, 1.0)); h.x = fract(h.x + u_hue); rgb = hsv2rgb(h);
  rgb += vec3(u_temp, u_temp * 0.2, -u_temp);`),M=e=>e>=0?1+e/100*2:1+e/100,N=[`Red`,`Green`,`Blue`,`Alpha`,`Luminance`,`Zero`,`Full`],P=[`Hue`,`Saturation`,`Value`,`Red`,`Green`,`Blue`,`Luminance`,`Zero`,`Full`],ot=(e,t)=>[Math.cos(e.n(t)*m),Math.sin(e.n(t)*m)],st=[{type:`brightnessContrast`,label:`Brightness / Contrast`,category:`Color`,description:`Adjusts overall brightness and the difference between light and dark areas.`,props:[a(`brightness`,`Brightness`,10,-100,100),a(`contrast`,`Contrast`,20,-100,100)],passes:e=>[{frag:Fe,u:{u_b:e.n(`brightness`)/100*.5,u_c:M(e.n(`contrast`))}}]},{type:`exposureGamma`,label:`Exposure / Gamma`,category:`Color`,description:`Adjusts exposure, midtones and overall brightness.`,props:[a(`exposure`,`Exposure (stops)`,.5,-5,5,{step:.05}),a(`offset`,`Offset`,0,-50,50),a(`gamma`,`Gamma`,1,.1,4,{step:.01})],passes:e=>[{frag:Ie,u:{u_e:e.n(`exposure`),u_off:e.n(`offset`)/100,u_g:e.n(`gamma`)}}]},{type:`colorTemp`,label:`Color Temperature`,category:`Color`,description:`Makes colors look warmer or cooler.`,props:[a(`temperature`,`Temperature`,25,-100,100),a(`tint`,`Tint (green ↔ magenta)`,0,-100,100)],passes:e=>[{frag:Le,u:{u_t:e.n(`temperature`)/100,u_tint:e.n(`tint`)/100}}]},{type:`colorTune`,label:`Color Tune`,category:`Color`,description:`Fine-tunes red, green and blue levels, lift and gamma.`,props:[o(`red`,`Red`,110,0,200),o(`green`,`Green`,100,0,200),o(`blue`,`Blue`,88,0,200),a(`lift`,`Lift`,0,-50,50),a(`gamma`,`Gamma`,1,.1,4,{step:.01})],passes:e=>[{frag:Re,u:{u_gain:[e.n(`red`)/100,e.n(`green`)/100,e.n(`blue`)/100],u_lift:e.n(`lift`)/100,u_gamma:e.n(`gamma`)}}]},{type:`hueShift`,label:`Hue Shift`,category:`Color`,description:`Changes the hues of an image without changing its brightness.`,props:[a(`hue`,`Hue`,90,-360,360,{unit:`°`})],passes:e=>[{frag:ze,u:{u_h:e.n(`hue`)/360}}]},{type:`satVibrance`,label:`Saturation / Vibrance`,category:`Color`,description:`Adjusts color intensity and strengthens less-saturated colors.`,props:[a(`saturation`,`Saturation`,0,-100,100),a(`vibrance`,`Vibrance`,30,-100,100)],passes:e=>[{frag:Be,u:{u_s:e.n(`saturation`)/100,u_v:e.n(`vibrance`)/100}}]},{type:`highlightsShadows`,label:`Highlights and Shadows`,category:`Color`,description:`Adjusts bright highlights and dark shadow regions separately.`,props:[a(`shadows`,`Shadows`,30,-100,100),a(`highlights`,`Highlights`,-20,-100,100)],passes:e=>[{frag:Ve,u:{u_sh:e.n(`shadows`)/100,u_hl:e.n(`highlights`)/100}}]},{type:`hotColor`,label:`Hot Color`,category:`Color`,description:`Produces intense, high-contrast color treatments.`,props:[o(`amount`,`Amount`,80,0,200)],passes:e=>[{frag:He,u:{u_k:e.n(`amount`)/100}}]},{type:`color`,label:`Color Adjust`,category:`Color`,description:`Brightness, contrast, saturation, hue and temperature in one effect.`,props:[a(`brightness`,`Brightness`,0,-100,100),a(`contrast`,`Contrast`,0,-100,100),a(`saturation`,`Saturation`,0,-100,100),a(`hue`,`Hue shift`,0,-180,180,{unit:`°`}),a(`temperature`,`Temperature`,0,-100,100)],passes:e=>[{frag:at,u:{u_bright:e.n(`brightness`)/100*.6,u_contrast:M(e.n(`contrast`)),u_sat:1+e.n(`saturation`)/100,u_hue:e.n(`hue`)/360,u_temp:e.n(`temperature`)/100*.15}}]},{type:`tint`,label:`Colorize`,category:`Color`,description:`Adds or replaces colors with a chosen color treatment.`,props:[l(`color`,`Color`,`#ff3d7f`),o(`amount`,`Amount`,100)],passes:e=>[{frag:Ue,u:{u_color:e.c(`color`),u_amount:e.n(`amount`)/100}}]},{type:`duotone`,label:`Duotone`,category:`Color`,description:`Maps shadows and highlights to two colors.`,props:[l(`dark`,`Shadows`,`#1b0b4a`),l(`light`,`Highlights`,`#ffc94d`),o(`amount`,`Amount`,100)],passes:e=>[{frag:We,u:{u_dark:e.c(`dark`),u_light:e.c(`light`),u_amount:e.n(`amount`)/100}}]},{type:`gradientMap`,label:`Gradient Map`,category:`Color`,description:`Maps different brightness levels to selected colors.`,props:[l(`c0`,`Shadows`,`#120a3a`),l(`c1`,`Midtones`,`#e0457b`),l(`c2`,`Highlights`,`#ffe9a8`),o(`amount`,`Amount`,100)],passes:e=>[{frag:Ge,u:{u_c0:e.c(`c0`),u_c1:e.c(`c1`),u_c2:e.c(`c2`),u_amount:e.n(`amount`)/100}}]},{type:`gradientOverlay`,label:`Gradient Overlay`,category:`Color`,description:`Places a color gradient over a layer.`,props:[l(`c1`,`Start color`,`#7c5cff`),l(`c2`,`End color`,`#ff5c8a`),f(`type`,`Type`,[`Linear`,`Radial`]),s(`angle`,`Angle`,90),f(`mode`,`Blend`,j,3),o(`opacity`,`Opacity`,100)],passes:e=>[{frag:Ke,u:{u_c1:e.c(`c1`),u_c2:e.c(`c2`),u_type:e.o(`type`),u_dir:ot(e,`angle`),u_mode:e.o(`mode`),u_op:e.n(`opacity`)/100}}]},{type:`fourColor`,label:`Four-color Gradient`,category:`Color`,description:`Blends four colors across an image.`,props:[l(`k0`,`Color 1`,`#ff3d7f`),u(`p0`,`Point 1`,[10,10]),l(`k1`,`Color 2`,`#ffc94d`),u(`p1`,`Point 2`,[90,10]),l(`k2`,`Color 3`,`#3fe08f`),u(`p2`,`Point 3`,[10,90]),l(`k3`,`Color 4`,`#4d7dff`),u(`p3`,`Point 4`,[90,90]),a(`blend`,`Blend`,2.5,1,8,{step:.1}),f(`mode`,`Blend mode`,j),o(`opacity`,`Opacity`,100)],passes:e=>[{frag:qe,u:{u_p0:e.pt(`p0`),u_p1:e.pt(`p1`),u_p2:e.pt(`p2`),u_p3:e.pt(`p3`),u_k0:e.c(`k0`),u_k1:e.c(`k1`),u_k2:e.c(`k2`),u_k3:e.c(`k3`),u_blend:e.n(`blend`),u_mode:e.o(`mode`),u_op:e.n(`opacity`)/100}}]},{type:`paletteMap`,label:`Palette Map`,category:`Color`,description:`Replaces image colors with colors from a selected palette.`,props:[l(`k0`,`Color 1`,`#0f0e17`),l(`k1`,`Color 2`,`#2e2a5c`),l(`k2`,`Color 3`,`#e53170`),l(`k3`,`Color 4`,`#ff8906`),l(`k4`,`Color 5`,`#fffffe`),f(`mode`,`Match by`,[`Nearest color`,`Brightness`]),o(`amount`,`Amount`,100)],passes:e=>[{frag:Je,u:{u_k0:e.c(`k0`),u_k1:e.c(`k1`),u_k2:e.c(`k2`),u_k3:e.c(`k3`),u_k4:e.c(`k4`),u_mode:e.o(`mode`),u_amount:e.n(`amount`)/100}}]},{type:`replaceColor`,label:`Replace Color`,category:`Color`,description:`Replaces a selected color with another.`,props:[l(`from`,`Color to replace`,`#ff0000`),l(`to`,`Replace with`,`#00a2ff`),o(`tolerance`,`Tolerance`,25),o(`softness`,`Softness`,15)],passes:e=>[{frag:Ye,u:{u_from:e.c(`from`),u_to:e.c(`to`),u_tol:e.n(`tolerance`)/100,u_soft:e.n(`softness`)/100}}]},{type:`spotColor`,label:`Spot Color`,category:`Color`,description:`Keeps a selected color and turns everything else gray.`,props:[l(`keep`,`Color to keep`,`#ff2020`),o(`tolerance`,`Tolerance`,20),o(`softness`,`Softness`,15),o(`amount`,`Desaturate others`,100)],passes:e=>[{frag:Xe,u:{u_keep:e.c(`keep`),u_tol:e.n(`tolerance`)/100,u_soft:e.n(`softness`)/100,u_amount:e.n(`amount`)/100}}]},{type:`spectralMap`,label:`Spectral Map`,category:`Color`,description:`Maps brightness into a rainbow spectrum.`,props:[a(`cycles`,`Cycles`,1,.1,10,{step:.1}),a(`offset`,`Hue offset`,0,-360,360,{unit:`°`}),o(`amount`,`Amount`,100)],passes:e=>[{frag:Ze,u:{u_cycles:e.n(`cycles`),u_offset:e.n(`offset`)/360,u_amount:e.n(`amount`)/100}}]},{type:`iridescence`,label:`Iridescence`,category:`Color`,description:`Creates shifting, rainbow-like surface colors.`,props:[o(`amount`,`Amount`,70),a(`frequency`,`Frequency`,1.5,0,10,{step:.1}),a(`speed`,`Shift speed`,.2,-5,5,{step:.05}),a(`size`,`Pattern size`,400,20,4e3),o(`saturation`,`Saturation`,70)],passes:e=>[{frag:Qe,u:{u_freq:e.n(`frequency`),u_phase:e.local*e.n(`speed`),u_size:e.n(`size`),u_sat:e.n(`saturation`)/100,u_amount:e.n(`amount`)/100}}]},{type:`channelRemapRGB`,label:`Channel Remap (RGB)`,category:`Color`,description:`Rearranges red, green and blue color channels.`,props:[f(`r`,`Red from`,N,2),f(`g`,`Green from`,N,0),f(`b`,`Blue from`,N,1)],passes:e=>[{frag:$e,u:{u_src:[e.o(`r`),e.o(`g`),e.o(`b`)]}}]},{type:`channelRemapHSV`,label:`Channel Remap (HSV)`,category:`Color`,description:`Rearranges hue, saturation and value between channels.`,props:[f(`h`,`Hue from`,P,2),f(`s`,`Saturation from`,P,1),f(`v`,`Value from`,P,0)],passes:e=>[{frag:et,u:{u_src:[e.o(`h`),e.o(`s`),e.o(`v`)]}}]},{type:`invert`,label:`Invert`,category:`Color`,description:`Reverses image colors to their opposites.`,props:[o(`amount`,`Amount`,100),f(`mode`,`Invert`,[`RGB`,`Brightness only`])],passes:e=>[{frag:tt,u:{u_amount:e.n(`amount`)/100,u_mode:e.o(`mode`)}}]},{type:`posterize`,label:`Posterize`,category:`Color`,description:`Reduces the number of color or brightness levels.`,props:[a(`levels`,`Levels`,5,2,32,{step:1})],passes:e=>[{frag:nt,u:{u_levels:Math.max(2,e.n(`levels`))}}]},{type:`threshold`,label:`Threshold`,category:`Color`,description:`Converts brightness into black and white regions based on a cutoff.`,props:[o(`level`,`Level`,50),o(`softness`,`Softness`,0,0,50)],passes:e=>[{frag:rt,u:{u_level:e.n(`level`)/100,u_soft:e.n(`softness`)/100}}]},{type:`fill`,label:`Solid Color`,category:`Color`,description:`Fills a layer with a chosen color, keeping its shape.`,props:[l(`color`,`Color`,`#ffffff`),p()],passes:e=>[{frag:it,u:{u_color:e.c(`color`),u_amt:e.n(`mix`)/100}}]}],ct=`
uniform vec4 u_key; uniform float u_tol; uniform float u_soft; uniform float u_spill;
vec2 cbcr(vec3 c) { return vec2(-0.1687 * c.r - 0.3313 * c.g + 0.5 * c.b, 0.5 * c.r - 0.4187 * c.g - 0.0813 * c.b); }
void main() {
  vec4 c = unpre(tex(v_uv));
  float d = distance(cbcr(c.rgb), cbcr(u_key.rgb)) / 0.7;
  float a = smoothstep(u_tol, u_tol + u_soft + 0.0001, d);
  float spill = (1.0 - smoothstep(u_tol, u_tol + u_soft + 0.35, d)) * u_spill;
  vec3 rgb = mix(c.rgb, vec3(lum(c.rgb)), spill);
  gl_FragColor = pre(vec4(rgb, c.a * a));
}`,lt=`
uniform float u_level; uniform float u_soft; uniform float u_invert;
void main() {
  vec4 c = unpre(tex(v_uv));
  float l = lum(c.rgb);
  if (u_invert > 0.5) l = 1.0 - l;
  float a = smoothstep(u_level, u_level + u_soft + 0.0001, l);
  gl_FragColor = pre(vec4(c.rgb, c.a * a));
}`,ut=`
uniform float u_r; uniform float u_soft;
void main() {
  vec4 o = tex(v_uv);
  float r = abs(u_r);
  float mn = o.a; float mx = o.a;
  for (int k = 1; k <= 3; k++) {
    float rad = r * float(k) / 3.0;
    for (int i = 0; i < 16; i++) {
      float a = float(i) * 0.3927;
      float s = texClip(v_uv + vec2(cos(a), sin(a)) * rad / u_res).a;
      mn = min(mn, s); mx = max(mx, s);
    }
  }
  float a = u_r >= 0.0 ? mn : mx;
  a = smoothstep(0.5 - u_soft, 0.5 + u_soft + 0.0001, a);
  vec3 rgb = o.a > 0.01 ? o.rgb / o.a : vec3(0.0);
  if (o.a <= 0.01) {
    vec4 acc = vec4(0.0);
    for (int i = 0; i < 16; i++) { float an = float(i) * 0.3927; acc += texClip(v_uv + vec2(cos(an), sin(an)) * r / u_res); }
    rgb = acc.a > 0.0 ? acc.rgb / acc.a : vec3(0.0);
  }
  gl_FragColor = vec4(rgb * a, a);
}`,dt=`
uniform float u_th; uniform vec4 u_color; uniform float u_use;
void main() {
  vec4 o = tex(v_uv);
  float a = step(u_th, o.a);
  vec3 rgb = u_use > 0.5 ? u_color.rgb : (o.a > 0.001 ? o.rgb / o.a : vec3(0.0));
  gl_FragColor = vec4(rgb * a, a);
}`,ft=`
uniform float u_amt; uniform float u_size; uniform float u_cx; uniform float u_speed;
void main() {
  vec4 o = tex(v_uv);
  vec2 q = lp() / max(u_size, 1.0) + vec2(u_ltime * u_speed);
  vec2 off = (vec2(fbm(q, u_cx), fbm(q + 31.7, u_cx)) - 0.5) * 2.0 * u_amt * lpx();
  vec4 d = texClip(v_uv + off / u_res);
  float a = d.a;
  vec3 rgb = o.a > 0.01 ? o.rgb / o.a : (d.a > 0.001 ? d.rgb / d.a : vec3(0.0));
  gl_FragColor = vec4(rgb * a, a);
}`,pt=`
uniform vec4 u_color;
void main() {
  vec4 o = tex(v_uv);
  if (!inBounds(lp())) { gl_FragColor = o; return; }
  gl_FragColor = o + vec4(u_color.rgb, 1.0) * u_color.a * (1.0 - o.a);
}`,mt=[{type:`chromaKey`,label:`Chroma Key`,category:`Keying & Matte`,description:`Removes a selected color, commonly a green-screen background.`,props:[l(`key`,`Key color`,`#00ff00`),o(`tolerance`,`Tolerance`,30),o(`softness`,`Edge softness`,10),o(`spill`,`Spill removal`,50)],passes:e=>[{frag:ct,u:{u_key:e.c(`key`),u_tol:e.n(`tolerance`)/100*.6,u_soft:e.n(`softness`)/100*.4,u_spill:e.n(`spill`)/100}}]},{type:`lumaKey`,label:`Luma Key`,category:`Keying & Matte`,description:`Makes areas transparent based on brightness.`,props:[o(`level`,`Threshold`,20),o(`softness`,`Softness`,10),a(`invert`,`Key out bright areas`,0,0,1,{step:1,options:[`No (key dark)`,`Yes (key bright)`]})],passes:e=>[{frag:lt,u:{u_level:e.n(`level`)/100,u_soft:e.n(`softness`)/100,u_invert:e.o(`invert`)}}]},{type:`matteChoker`,label:`Matte Choker`,category:`Keying & Matte`,description:`Shrinks (or spreads) a matte to clean up unwanted edges.`,props:[a(`choke`,`Choke`,3,-40,40,{unit:`px`}),o(`softness`,`Softness`,20,0,50)],passes:e=>[{frag:ut,u:{u_r:e.n(`choke`)*e.scale,u_soft:e.n(`softness`)/100}}]},{type:`solidMatte`,label:`Solid Matte`,category:`Keying & Matte`,description:`Turns the layer into a solid, hard-edged opacity mask.`,props:[o(`threshold`,`Threshold`,50,1,100),a(`useColor`,`Fill`,0,0,1,{step:1,options:[`Keep colors`,`Solid color`]}),l(`color`,`Color`,`#ffffff`)],passes:e=>[{frag:dt,u:{u_th:e.n(`threshold`)/100,u_use:e.o(`useColor`),u_color:e.c(`color`)}}]},{type:`roughenEdges`,label:`Roughen Edges`,category:`Keying & Matte`,description:`Makes smooth edges appear irregular or distressed.`,props:[c(`amount`,`Border`,8,100),c(`size`,`Scale`,24,400),a(`complexity`,`Complexity`,3,1,8,{step:1}),a(`speed`,`Evolution speed`,0,0,10,{step:.1})],passes:e=>[{frag:ft,u:{u_amt:e.n(`amount`),u_size:e.n(`size`),u_cx:e.n(`complexity`),u_speed:e.n(`speed`)}}]},{type:`fillBehind`,label:`Fill Behind`,category:`Keying & Matte`,description:`Fills transparent areas behind the layer's content, within its bounds.`,props:[l(`color`,`Color`,`#101014`)],passes:e=>[{frag:pt,u:{u_color:e.c(`color`)}}]}],ht=`
uniform float u_amt; uniform float u_dir; uniform vec2 u_c;
void main() {
  vec2 p = lp(); vec2 d = p - u_c; vec2 q = p;
  if (u_dir < 0.5) { float x = d.x / max(u_lb.z * 0.5, 1.0); q.y = p.y - u_amt * x * x * u_lb.w * 0.5; }
  else { float y = d.y / max(u_lb.w * 0.5, 1.0); q.x = p.x - u_amt * y * y * u_lb.z * 0.5; }
  gl_FragColor = texL(q);
}`,gt=`
uniform vec2 u_c; uniform float u_amp; uniform float u_len; uniform float u_speed; uniform float u_rad;
void main() {
  vec2 p = lp(); vec2 d = p - u_c; float r = length(d);
  float fall = u_rad > 0.0 ? 1.0 - smoothstep(u_rad * 0.6, u_rad, r) : 1.0;
  float w = sin(r / max(u_len, 1.0) * TAU - u_ltime * u_speed * TAU) * u_amp * fall;
  gl_FragColor = texL(p + (r > 0.0 ? d / r : vec2(0.0)) * w);
}`,_t=`
uniform float u_prog; uniform vec2 u_dir; uniform float u_R; uniform vec4 u_back;
vec4 pageAt(vec2 p, float sx, float x) {
  vec2 q = p + u_dir * (sx - x);
  if (!inBounds(q)) return vec4(0.0);
  return texL(q);
}
vec4 backSide(vec4 b, float shade) {
  vec4 u = unpre(b);
  return pre(vec4(mix(u.rgb, u_back.rgb, u_back.a) * shade, u.a));
}
void main() {
  vec2 p = lp();
  float hs = 0.5 * (abs(u_lb.z * u_dir.x) + abs(u_lb.w * u_dir.y));
  float x = dot(p - lcenter(), u_dir);
  float L = mix(hs + u_R, -hs - PI * u_R, u_prog);
  vec4 col = vec4(0.0);
  if (x < L) {
    col = pageAt(p, x, x);
    float x3 = L + PI * u_R + (L - x);
    if (x3 < hs) {
      vec4 b = pageAt(p, x3, x);
      if (b.a > 0.0) { vec4 bb = backSide(b, 0.9); col = bb + col * (1.0 - bb.a); }
    } else {
      col.rgb *= 1.0 - 0.35 * exp(-(L - x) / max(u_R, 1.0)) * step(-hs, L);
    }
  } else if (x < L + u_R) {
    float th = asin(clamp((x - L) / u_R, -1.0, 1.0));
    float x1 = L + u_R * th;
    float x2 = L + u_R * (PI - th);
    vec4 f = x1 < hs ? pageAt(p, x1, x) : vec4(0.0);
    f.rgb *= 0.7 + 0.3 * cos(th);
    if (x2 < hs) {
      vec4 b = pageAt(p, x2, x);
      if (b.a > 0.0) { vec4 bb = backSide(b, 0.55 + 0.45 * sin(th)); f = bb + f * (1.0 - bb.a); }
    }
    col = f;
  }
  gl_FragColor = col;
}`,F=`
float chan(vec4 c, float i) {
  vec4 u = unpre(c);
  if (i < 0.5) return lum(u.rgb); if (i < 1.5) return u.r; if (i < 2.5) return u.g; if (i < 3.5) return u.b; return c.a;
}`,vt=`
uniform vec2 u_amt; uniform vec2 u_ch; uniform float u_useAux;
${F}
void main() {
  vec4 m = u_useAux > 0.5 ? aux(v_uv) : orig(v_uv);
  vec2 off = vec2(chan(m, u_ch.x) - 0.5, chan(m, u_ch.y) - 0.5) * u_amt * 2.0 * m.a;
  gl_FragColor = texL(lp() + off);
}`,yt=`
uniform vec2 u_c; uniform float u_rad; uniform float u_ang; uniform float u_useAux; uniform float u_ch;
${F}
void main() {
  vec4 m = u_useAux > 0.5 ? aux(v_uv) : orig(v_uv);
  float v = (chan(m, u_ch) - 0.5) * m.a;
  vec2 d = lp() - u_c;
  float r = length(d) + v * 2.0 * u_rad;
  float a = atan(d.y, d.x) + v * 2.0 * u_ang;
  gl_FragColor = texL(u_c + vec2(cos(a), sin(a)) * r);
}`,bt=`
uniform float u_amt; uniform float u_size; uniform float u_oct; uniform float u_speed;
void main() {
  vec2 p = lp();
  vec2 s = p / max(u_size, 1.0) + u_ltime * u_speed * 0.2;
  vec2 q1 = vec2(fbm(s, u_oct), fbm(s + vec2(5.2, 1.3), u_oct));
  vec2 q2 = vec2(fbm(s + 4.0 * q1 + vec2(1.7, 9.2), u_oct), fbm(s + 4.0 * q1 + vec2(8.3, 2.8), u_oct));
  gl_FragColor = texL(p + (q2 - 0.5) * 2.0 * u_amt);
}`,xt=`
uniform float u_amt; uniform float u_size; uniform float u_speed; uniform float u_oct;
void main() {
  vec2 p = lp();
  vec2 s = p / max(u_size, 1.0) + vec2(u_ltime * u_speed * 0.3);
  vec2 off = vec2(fbm(s, u_oct), fbm(s + 19.1, u_oct)) - 0.5;
  gl_FragColor = texL(p + off * 2.0 * u_amt);
}`,St=`
uniform float u_amt; uniform float u_cell; uniform float u_step;
void main() {
  vec2 p = lp();
  vec2 cell = floor(p / max(u_cell, 1.0));
  vec2 r = hash2(cell + vec2(u_step * 7.13, u_seed)) - 0.5;
  gl_FragColor = texL(p + r * 2.0 * u_amt);
}`,Ct=`
uniform vec2 u_shift;
void main() {
  vec2 p = lp();
  if (!inBounds(p)) { gl_FragColor = vec4(0.0); return; }
  gl_FragColor = texL(ldenorm(fract(lnorm(p) - u_shift)));
}`,I=`
uniform vec2 u_c; uniform float u_amt; uniform float u_rad; uniform float u_feather;
void main() {
  vec2 p = lp(); vec2 d = p - u_c; float r = length(d); vec2 q = p;
  if (r < u_rad && r > 0.0) {
    float k = r / u_rad;
    float nk = u_amt >= 0.0 ? pow(k, 1.0 + u_amt * 1.5) : pow(k, 1.0 / (1.0 - u_amt * 1.5));
    nk = mix(nk, k, smoothstep(1.0 - u_feather, 1.0, k));
    q = u_c + d / r * nk * u_rad;
  }
  gl_FragColor = texL(q);
}`,wt=`
uniform float u_mode; uniform float u_amt;
void main() {
  vec2 p = lp();
  if (!inBounds(p)) { gl_FragColor = vec4(0.0); return; }
  vec2 n = lnorm(p); vec2 q;
  if (u_mode < 0.5) {
    vec2 d = (n - 0.5) * 2.0;
    q = vec2(atan(d.x, -d.y) / TAU + 0.5, 1.0 - length(d));
  } else {
    float a = (n.x - 0.5) * TAU; float r = 1.0 - n.y;
    q = 0.5 + 0.5 * vec2(sin(a), -cos(a)) * r;
  }
  gl_FragColor = texL(ldenorm(mix(n, q, u_amt)));
}`,Tt=`
uniform vec2 u_c; uniform float u_rad; uniform float u_amt;
void main() {
  vec2 p = lp(); vec2 d = (p - u_c) / max(u_rad, 1.0); float r = length(d); vec2 q = p;
  if (r < 1.0) { float k = mix(1.0, (asin(r) / (PI * 0.5)) / max(r, 1e-4), u_amt); q = u_c + d * k * u_rad; }
  gl_FragColor = texL(q);
}`,Et=`
uniform float u_amt; uniform vec2 u_c;
void main() {
  vec2 d = lp() - u_c; float k = exp(u_amt);
  gl_FragColor = texL(u_c + vec2(d.x * k, d.y / k));
}`,Dt=`
uniform vec2 u_dir; uniform float u_k; uniform vec2 u_c;
void main() {
  vec2 d = lp() - u_c; float a = dot(d, u_dir);
  gl_FragColor = texL(u_c + (d - a * u_dir) + u_dir * a / max(u_k, 0.01));
}`,Ot=`
uniform vec2 u_dir; uniform float u_pos; uniform float u_w; uniform float u_amt;
void main() {
  vec2 p = lp();
  float hs = 0.5 * (abs(u_lb.z * u_dir.x) + abs(u_lb.w * u_dir.y));
  float s = dot(p - lcenter(), u_dir);
  float s0 = -hs + u_pos * 2.0 * hs - u_w * hs;
  float s1 = s0 + 2.0 * u_w * hs;
  float L = s1 - s0; float src;
  if (s < s0) src = s;
  else if (s < s1 + u_amt) src = s0 + (s - s0) * L / max(L + u_amt, 0.001);
  else src = s - u_amt;
  gl_FragColor = texL(p + u_dir * (src - s));
}`,kt=`
uniform vec2 u_c; uniform float u_ang; uniform float u_rad;
void main() {
  vec2 d = lp() - u_c; float r = length(d);
  if (r < u_rad) { float k = 1.0 - r / u_rad; d = rot(u_ang * k * k) * d; }
  gl_FragColor = texL(u_c + d);
}`,At=`
uniform float u_amp; uniform float u_len; uniform float u_speed; uniform vec2 u_dir; uniform float u_type; uniform float u_phase;
float wv(float x, float t) {
  float f = fract(x);
  if (t < 0.5) return sin(x * TAU);
  if (t < 1.5) return 1.0 - 4.0 * abs(f - 0.5);
  if (t < 2.5) return f < 0.5 ? 1.0 : -1.0;
  return f * 2.0 - 1.0;
}
void main() {
  vec2 p = lp(); vec2 perp = vec2(-u_dir.y, u_dir.x);
  float ph = dot(p, perp) / max(u_len, 1.0) - u_ltime * u_speed + u_phase;
  gl_FragColor = texL(p + u_dir * u_amp * wv(ph, u_type));
}`,jt=`
uniform vec2 u_c; uniform float u_seg; uniform float u_ang;
void main() {
  vec2 d = lp() - u_c; float r = length(d);
  float a = atan(d.y, d.x) - u_ang; float seg = TAU / u_seg;
  a = mod(a, seg); if (a > seg * 0.5) a = seg - a;
  a += u_ang;
  gl_FragColor = texL(u_c + vec2(cos(a), sin(a)) * r);
}`,Mt=`
uniform vec2 u_c; uniform vec2 u_n;
void main() {
  vec2 d = lp() - u_c; float k = dot(d, u_n);
  if (k < 0.0) d -= 2.0 * k * u_n;
  gl_FragColor = texL(u_c + d);
}`,Nt=`
uniform vec2 u_c; uniform float u_speed; uniform float u_twist; uniform float u_rep; uniform float u_depth;
void main() {
  vec2 p = lp();
  if (!inBounds(p)) { gl_FragColor = vec4(0.0); return; }
  vec2 d = (p - u_c) / lmin(); float r = length(d);
  float a = atan(d.y, d.x) / TAU + 0.5;
  float z = u_depth / max(r, 0.001) + u_ltime * u_speed;
  vec2 n = vec2(fract(a * u_rep + z * u_twist), fract(z));
  vec4 c = texL(ldenorm(n));
  gl_FragColor = c * smoothstep(0.0, 0.35, r);
}`,L=(e,t)=>[Math.cos(e.n(t)*m),Math.sin(e.n(t)*m)],R=(e,t)=>e.n(t)/100*Math.min(e.lb.w,e.lb.h),z=[`Luminance`,`Red`,`Green`,`Blue`,`Alpha`],B=[{key:`map`,label:`Map layer`,hint:`Leave empty to use this layer itself`}],Pt=[{type:`bend`,label:`Bend`,category:`Distort`,description:`Bends a layer or shape.`,props:[o(`amount`,`Bend`,30,-100,100),f(`direction`,`Direction`,[`Horizontal`,`Vertical`]),u(`center`,`Center`)],passes:e=>[{frag:ht,u:{u_amt:e.n(`amount`)/100,u_dir:e.o(`direction`),u_c:e.pt(`center`)}}]},{type:`circularRipple`,label:`Circular Ripple`,category:`Distort`,description:`Creates circular waves spreading across an image.`,props:[u(`center`,`Center`),c(`amplitude`,`Amplitude`,12,200),c(`wavelength`,`Wavelength`,60,1e3),a(`speed`,`Speed`,1,-10,10,{step:.1}),o(`radius`,`Radius (0 = no limit)`,0,0,300)],passes:e=>[{frag:gt,u:{u_c:e.pt(`center`),u_amp:e.n(`amplitude`),u_len:e.n(`wavelength`),u_speed:e.n(`speed`),u_rad:R(e,`radius`)}}]},{type:`curl`,label:`Curl`,category:`Distort`,description:`Makes a layer appear to curl or fold like a page.`,props:[o(`progress`,`Curl`,35),s(`angle`,`Direction`,315),c(`radius`,`Roll radius`,60,600),l(`back`,`Back side`,`#ffffffb0`)],passes:e=>[{frag:_t,u:{u_prog:e.n(`progress`)/100,u_dir:L(e,`angle`),u_R:Math.max(1,e.n(`radius`)),u_back:e.c(`back`)}}]},{type:`displacementMap`,label:`Displacement Map`,category:`Distort`,description:`Uses another layer's brightness or color to distort this layer.`,props:[c(`h`,`Horizontal amount`,30,500),f(`hch`,`Horizontal from`,z),c(`v`,`Vertical amount`,30,500),f(`vch`,`Vertical from`,z)],refs:B,aux:{ref:`map`},passes:e=>[{frag:vt,u:{u_amt:[e.n(`h`),e.n(`v`)],u_ch:[e.o(`hch`),e.o(`vch`)],u_useAux:+!!e.ref(`map`)}}]},{type:`polarDisplacement`,label:`Polar Displacement Map`,category:`Distort`,description:`Distorts radially and around a center using a map layer.`,props:[u(`center`,`Center`),c(`radial`,`Radial amount`,40,500),a(`angular`,`Angular amount`,20,-180,180,{unit:`°`}),f(`ch`,`Map channel`,z)],refs:B,aux:{ref:`map`},passes:e=>[{frag:yt,u:{u_c:e.pt(`center`),u_rad:e.n(`radial`),u_ang:e.n(`angular`)*m,u_ch:e.o(`ch`),u_useAux:+!!e.ref(`map`)}}]},{type:`fractalWarp`,label:`Fractal Warp`,category:`Distort`,description:`Distorts an image using complex fractal patterns.`,props:[c(`amount`,`Amount`,40,500),c(`size`,`Scale`,200,3e3),a(`octaves`,`Complexity`,4,1,8,{step:1}),a(`speed`,`Evolution speed`,.5,0,10,{step:.1})],passes:e=>[{frag:bt,u:{u_amt:e.n(`amount`),u_size:e.n(`size`),u_oct:e.n(`octaves`),u_speed:e.n(`speed`)}}]},{type:`turbulence`,label:`Turbulent Displace`,category:`Distort`,description:`Distorts a layer using turbulent patterns.`,props:[c(`amount`,`Amount`,20,400),c(`scale`,`Size`,120,2e3),a(`speed`,`Evolution speed`,1,0,20,{step:.1}),a(`octaves`,`Complexity`,2,1,8,{step:1})],passes:e=>[{frag:xt,u:{u_amt:e.n(`amount`),u_size:e.n(`scale`),u_speed:e.n(`speed`),u_oct:e.n(`octaves`)}}]},{type:`randomDisplacement`,label:`Random Displacement`,category:`Distort`,description:`Randomly shifts blocks of the image, changing over time.`,props:[c(`amount`,`Amount`,10,300),c(`cell`,`Block size`,24,500),a(`speed`,`Changes / sec`,8,0,60)],passes:e=>[{frag:St,u:{u_amt:e.n(`amount`),u_cell:e.n(`cell`),u_step:Math.floor(e.local*e.n(`speed`))}}]},{type:`offset`,label:`Offset`,category:`Distort`,description:`Shifts image content, wrapping it around the edges.`,props:[{key:`shift`,label:`Shift`,kind:`vec2`,def:[25,0],unit:`%`}],passes:e=>{let[t,n]=e.v(`shift`);return[{frag:Ct,u:{u_shift:[t/100,n/100]}}]}},{type:`bulge`,label:`Pinch/Bulge`,category:`Distort`,description:`Pulls image content inward or pushes it outward.`,props:[o(`amount`,`Amount`,50,-100,100),o(`radius`,`Radius`,50,1,200),u(`center`,`Center`)],passes:e=>[{frag:I,u:{u_c:e.pt(`center`),u_amt:e.n(`amount`)/100,u_rad:R(e,`radius`),u_feather:.15}}]},{type:`innerPinchBulge`,label:`Inner Pinch/Bulge`,category:`Distort`,description:`Pinches or bulges content within an area, with a soft edge.`,props:[o(`amount`,`Amount`,60,-100,100),o(`radius`,`Radius`,25,1,200),o(`feather`,`Feather`,50),u(`center`,`Center`)],passes:e=>[{frag:I,u:{u_c:e.pt(`center`),u_amt:e.n(`amount`)/100,u_rad:R(e,`radius`),u_feather:e.n(`feather`)/100}}]},{type:`polarCoordinates`,label:`Polar Coordinates`,category:`Distort`,description:`Converts between circular and rectangular image layouts.`,props:[f(`mode`,`Conversion`,[`Rectangular to polar`,`Polar to rectangular`]),o(`amount`,`Interpolation`,100)],passes:e=>[{frag:wt,u:{u_mode:e.o(`mode`),u_amt:e.n(`amount`)/100}}]},{type:`spherize`,label:`Spherize`,category:`Distort`,description:`Distorts a layer into a spherical appearance.`,props:[o(`amount`,`Amount`,100,-100,100),o(`radius`,`Radius`,50,1,200),u(`center`,`Center`)],passes:e=>[{frag:Tt,u:{u_c:e.pt(`center`),u_rad:R(e,`radius`),u_amt:e.n(`amount`)/100}}]},{type:`squeeze`,label:`Squeeze`,category:`Distort`,description:`Compresses content along one axis while stretching the other.`,props:[o(`amount`,`Squeeze`,30,-100,100),u(`center`,`Center`)],passes:e=>[{frag:Et,u:{u_amt:e.n(`amount`)/100*.8,u_c:e.pt(`center`)}}]},{type:`stretchAxis`,label:`Stretch Axis`,category:`Distort`,description:`Stretches content along a selected axis.`,props:[s(`angle`,`Axis`,0),o(`amount`,`Stretch`,150,1,500),u(`center`,`Center`)],passes:e=>[{frag:Dt,u:{u_dir:L(e,`angle`),u_k:e.n(`amount`)/100,u_c:e.pt(`center`)}}]},{type:`stretchSegment`,label:`Stretch Segment`,category:`Distort`,description:`Stretches a selected band of the image, pushing the rest outward.`,props:[s(`angle`,`Axis`,0),o(`position`,`Segment position`,50),o(`width`,`Segment width`,10,0,100),c(`amount`,`Stretch`,150,2e3)],passes:e=>[{frag:Ot,u:{u_dir:L(e,`angle`),u_pos:e.n(`position`)/100,u_w:e.n(`width`)/100,u_amt:e.n(`amount`)}}]},{type:`swirl`,label:`Swirl`,category:`Distort`,description:`Twists image content around a center.`,props:[a(`angle`,`Angle`,180,-1080,1080,{unit:`°`}),o(`radius`,`Radius`,50,1,200),u(`center`,`Center`)],passes:e=>[{frag:kt,u:{u_c:e.pt(`center`),u_ang:e.n(`angle`)*m,u_rad:R(e,`radius`)}}]},{type:`wave`,label:`Wave Warp`,category:`Distort`,description:`Distorts content into wave patterns.`,props:[f(`type`,`Wave type`,g),c(`amp`,`Height`,20,300),c(`length`,`Width`,120,2e3),s(`angle`,`Direction`,0),a(`speed`,`Speed (waves/s)`,1,-20,20,{step:.1}),a(`phase`,`Phase`,0,-360,360,{unit:`°`})],passes:e=>[{frag:At,u:{u_amp:e.n(`amp`),u_len:e.n(`length`),u_speed:e.n(`speed`),u_dir:L(e,`angle`),u_type:e.o(`type`),u_phase:e.n(`phase`)/360}}]},{type:`kaleido`,label:`Kaleidoscope`,category:`Distort`,description:`Repeats and reflects imagery into a symmetrical pattern.`,props:[a(`segments`,`Segments`,6,2,32,{step:1}),s(`angle`,`Rotation`,0),u(`center`,`Center`)],passes:e=>[{frag:jt,u:{u_c:e.pt(`center`),u_seg:Math.max(2,Math.round(e.n(`segments`))),u_ang:e.n(`angle`)*m}}]},{type:`mirror`,label:`Mirror`,category:`Distort`,description:`Reflects imagery to create symmetry.`,props:[s(`angle`,`Reflection angle`,0),u(`center`,`Center`)],passes:e=>[{frag:Mt,u:{u_c:e.pt(`center`),u_n:L(e,`angle`)}}]},{type:`tunnel`,label:`Tunnel`,category:`Distort`,description:`Creates a tunnel-like perspective with repeating depth.`,props:[u(`center`,`Center`),a(`speed`,`Speed`,.5,-10,10,{step:.05}),a(`repeat`,`Repeats around`,2,1,12,{step:1}),a(`twist`,`Twist`,0,-2,2,{step:.05}),a(`depth`,`Depth`,.3,.05,2,{step:.01})],passes:e=>[{frag:Nt,u:{u_c:e.pt(`center`),u_speed:e.n(`speed`),u_rep:Math.round(e.n(`repeat`)),u_twist:e.n(`twist`),u_depth:e.n(`depth`)}}]}],V=(e,t)=>`
uniform float u_mix; uniform float u_over; uniform float u_ang;
${e}
vec2 rp(vec2 p) { return rot(u_ang) * (p - lcenter()); }
${t}
void main() {
  vec4 o = tex(v_uv);
  vec4 g = pattern(lp()) * o.a;
  vec4 res = u_over > 0.5 ? g + o * (1.0 - g.a) : g;
  gl_FragColor = mix(o, res, u_mix);
}`,Ft=V(`uniform float u_size; uniform vec4 u_c1; uniform vec4 u_c2; uniform vec2 u_off;`,`vec4 pattern(vec2 p) {
    vec2 c = floor((rp(p) + u_off) / max(u_size, 1.0));
    return pre(mod(c.x + c.y, 2.0) < 0.5 ? u_c1 : u_c2);
  }`),It=V(`uniform float u_sp; uniform float u_w; uniform vec4 u_line; uniform vec4 u_bg; uniform vec2 u_off;`,`vec4 pattern(vec2 p) {
    vec2 q = rp(p) + u_off;
    vec2 f = abs(fract(q / max(u_sp, 1.0) + 0.5) - 0.5) * u_sp;
    float k = 1.0 - smoothstep(u_w * 0.5 - 0.75, u_w * 0.5 + 0.75, min(f.x, f.y));
    return pre(u_line) * k + pre(u_bg) * (1.0 - k);
  }`),Lt=V(`uniform float u_w; uniform float u_ratio; uniform vec4 u_c1; uniform vec4 u_c2; uniform float u_shift;`,`vec4 pattern(vec2 p) {
    float s = rp(p).x / max(u_w, 1.0) + u_shift;
    float f = fract(s);
    float aa = 1.0 / max(u_w, 1.0);
    float k = smoothstep(u_ratio - aa, u_ratio + aa, f) * (1.0 - smoothstep(1.0 - aa, 1.0, f));
    return mix(pre(u_c1), pre(u_c2), k);
  }`),Rt=V(`uniform float u_sp; uniform float u_size; uniform vec4 u_dot; uniform vec4 u_bg; uniform float u_stagger;`,`vec4 pattern(vec2 p) {
    vec2 g = rp(p) / max(u_sp, 1.0);
    if (u_stagger > 0.5) g.x += 0.5 * mod(floor(g.y), 2.0);
    vec2 f = (fract(g) - 0.5) * u_sp;
    float r = u_size * 0.5 * u_sp;
    float k = 1.0 - smoothstep(r - 1.0, r + 1.0, length(f));
    return pre(u_dot) * k + pre(u_bg) * (1.0 - k);
  }`),zt=V(`uniform float u_size; uniform vec4 u_sky; uniform vec4 u_cloud; uniform float u_cover; uniform float u_soft; uniform float u_speed;`,`vec4 pattern(vec2 p) {
    vec2 q = rp(p) / max(u_size, 1.0) + vec2(u_ltime * u_speed * 0.05, u_ltime * u_speed * 0.015);
    float n = clamp((fbm(q, 6.0) - 0.5) * 2.4 + 0.5, 0.0, 1.0);
    float k = smoothstep(1.0 - u_cover - u_soft * 0.5, 1.0 - u_cover + u_soft * 0.5 + 0.001, n);
    return mix(pre(u_sky), pre(u_cloud), k);
  }`),Bt=V(`uniform float u_size; uniform float u_oct; uniform vec4 u_c1; uniform vec4 u_c2; uniform float u_sharp; uniform float u_speed;`,`float ridged(vec2 p) {
    float s = 0.0; float a = 0.5; float n = 0.0;
    for (int i = 0; i < 8; i++) {
      if (float(i) >= u_oct) break;
      float v = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
      s += a * v * v; n += a; p = p * 2.03 + vec2(7.1, 3.3); a *= 0.5;
    }
    return s / n;
  }
  vec4 pattern(vec2 p) {
    float v = pow(ridged(rp(p) / max(u_size, 1.0) + u_ltime * u_speed * 0.1), u_sharp);
    return mix(pre(u_c1), pre(u_c2), clamp(v, 0.0, 1.0));
  }`),Vt=V(`uniform float u_size; uniform float u_oct; uniform vec4 u_c1; uniform vec4 u_c2; uniform float u_contrast; uniform float u_speed;`,`vec4 pattern(vec2 p) {
    vec2 q = rp(p) / max(u_size, 1.0) + vec2(u_ltime * u_speed * 0.1);
    float s = 0.0; float a = 0.5; float n = 0.0;
    for (int i = 0; i < 8; i++) {
      if (float(i) >= u_oct) break;
      s += a * abs(vnoise(q) * 2.0 - 1.0); n += a; q = q * 2.03 + vec2(3.7, 8.1); a *= 0.5;
    }
    float v = clamp((s / n - 0.5) * u_contrast + 0.5, 0.0, 1.0);
    return mix(pre(u_c1), pre(u_c2), v);
  }`),Ht=V(`uniform vec2 u_c; uniform float u_density; uniform float u_size; uniform float u_speed; uniform vec4 u_star; uniform vec4 u_bg;`,`float starLayer(vec2 uv, float seed) {
    vec2 g = floor(uv); vec2 f = fract(uv) - 0.5;
    vec2 h = hash2(g + seed * 17.0);
    if (h.x < 1.0 - u_density) return 0.0;
    vec2 pos = (hash2(g + seed * 31.0 + 5.0) - 0.5) * 0.7;
    return smoothstep(0.09 * u_size, 0.0, length(f - pos));
  }
  vec4 pattern(vec2 p) {
    vec2 uv = (p - u_c) / lmin() * 2.0;
    float acc = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float depth = fract(u_ltime * u_speed * 0.15 + fi / 5.0);
      float sc = mix(24.0, 0.8, depth);
      acc += starLayer(uv * sc + fi * 13.7, fi) * depth * smoothstep(1.0, 0.85, depth);
    }
    acc = clamp(acc * 1.6, 0.0, 1.0);
    return pre(u_bg) * (1.0 - acc) + pre(u_star) * acc;
  }`),Ut=V(`uniform float u_density; uniform float u_cell; uniform float u_size; uniform float u_tw; uniform vec4 u_star; uniform vec4 u_bg;`,`vec4 pattern(vec2 p) {
    vec2 g = p / max(u_cell, 1.0);
    vec2 ig = floor(g); vec2 f = fract(g) - 0.5;
    vec2 h = hash2(ig + u_seed);
    float b = 0.0;
    if (h.x > 1.0 - u_density) {
      vec2 pos = (hash2(ig + 9.1) - 0.5) * 0.8;
      float tw = 0.65 + 0.35 * sin(u_ltime * u_tw * (1.0 + h.y * 3.0) + h.y * 40.0);
      float d = length(f - pos) * u_cell;
      b = (smoothstep(u_size, 0.0, d) + 0.35 * smoothstep(u_size * 3.0, 0.0, d)) * tw * (0.55 + 0.45 * h.y);
    }
    b = clamp(b, 0.0, 1.0);
    return pre(u_bg) * (1.0 - b) + pre(u_star) * b;
  }`),Wt=V(`uniform vec2 u_c; uniform float u_size; uniform float u_soft; uniform vec4 u_color; uniform vec4 u_bg;`,`float sdHeart(vec2 p) {
    p.x = abs(p.x);
    if (p.y + p.x > 1.0) return length(p - vec2(0.25, 0.75)) - 0.35355;
    return sqrt(min(dot(p - vec2(0.0, 1.0), p - vec2(0.0, 1.0)), dot(p - 0.5 * max(p.x + p.y, 0.0), p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
  }
  vec4 pattern(vec2 p) {
    vec2 q = rot(u_ang) * (p - u_c) / max(u_size, 1.0);
    q = vec2(q.x, -q.y) * 1.25 + vec2(0.0, 0.55);
    float d = sdHeart(q);
    float k = 1.0 - smoothstep(-u_soft, u_soft + 0.003, d);
    return pre(u_color) * k + pre(u_bg) * (1.0 - k);
  }`),Gt=V(`uniform vec2 u_c; uniform float u_size; uniform float u_n; uniform float u_m; uniform float u_round; uniform float u_soft; uniform vec4 u_color; uniform vec4 u_bg;`,`float sdStar(vec2 p, float r, float n, float m) {
    float an = PI / n; float en = PI / m;
    vec2 acs = vec2(cos(an), sin(an)); vec2 ecs = vec2(cos(en), sin(en));
    float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
    p = length(p) * vec2(cos(bn), abs(sin(bn)));
    p -= r * acs;
    p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
    return length(p) * sign(p.x);
  }
  vec4 pattern(vec2 p) {
    vec2 q = rot(u_ang) * (p - u_c) / max(u_size, 1.0);
    q.y = -q.y;
    float d = sdStar(q, 1.0 - u_round, u_n, u_m) - u_round;
    float k = 1.0 - smoothstep(-u_soft, u_soft + 0.004, d);
    return pre(u_color) * k + pre(u_bg) * (1.0 - k);
  }`),Kt=V(`uniform vec2 u_c; uniform float u_count; uniform float u_soft; uniform float u_spin; uniform vec4 u_color; uniform vec4 u_bg; uniform float u_fade;`,`vec4 pattern(vec2 p) {
    vec2 d = p - u_c;
    float a = atan(d.y, d.x) + u_spin;
    float r = 0.5 + 0.5 * cos(a * u_count);
    float k = smoothstep(0.5 - u_soft, 0.5 + u_soft + 0.001, r);
    k *= 1.0 - u_fade * smoothstep(0.0, 1.0, length(d) / (0.75 * length(u_lb.zw)));
    return pre(u_bg) * (1.0 - k) + pre(u_color) * k;
  }`),qt=V(`uniform float u_count; uniform float u_amp; uniform float u_len; uniform float u_th; uniform float u_sp; uniform float u_speed; uniform vec4 u_c1; uniform vec4 u_c2;`,`vec4 pattern(vec2 p) {
    vec2 q = rp(p);
    vec4 acc = vec4(0.0);
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      if (fi >= u_count) break;
      float x = q.x / max(u_len, 1.0) * TAU;
      float y = sin(x + u_ltime * u_speed + fi * 0.7) * u_amp + sin(x * 0.5 - u_ltime * u_speed * 0.6 + fi) * u_amp * 0.35 + (fi - (u_count - 1.0) * 0.5) * u_sp;
      float d = abs(q.y - y);
      float k = 1.0 - smoothstep(u_th * 0.5 - 1.0, u_th * 0.5 + 1.0, d);
      vec4 c = pre(mix(u_c1, u_c2, fi / max(u_count - 1.0, 1.0)));
      c.rgb *= 0.78 + 0.22 * sin(x * 2.0 + fi);
      acc = c * k + acc * (1.0 - k);
    }
    return acc;
  }`),Jt=V(`uniform float u_cell; uniform float u_mode; uniform float u_edge; uniform vec4 u_c1; uniform vec4 u_c2; uniform vec4 u_ec; uniform float u_speed;`,`vec4 pattern(vec2 p) {
    vec2 g = p / max(u_cell, 1.0);
    vec2 ig = floor(g); vec2 fg = fract(g);
    float md = 8.0; float md2 = 8.0; vec2 mc = vec2(0.0); vec2 mp = vec2(0.0);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 b = vec2(float(i), float(j));
        vec2 h = 0.5 + 0.5 * sin(u_ltime * u_speed + TAU * hash2(ig + b));
        vec2 r = b + h - fg;
        float d = dot(r, r);
        if (d < md) { md2 = md; md = d; mc = ig + b; mp = ig + b + h; }
        else if (d < md2) md2 = d;
      }
    }
    float e = 1.0 - smoothstep(0.0, u_edge, sqrt(md2) - sqrt(md));
    if (u_mode < 0.5) {
      vec3 c = mix(u_c1.rgb, u_c2.rgb, hash(mc));
      return pre(vec4(mix(c, u_ec.rgb, e * u_ec.a), 1.0));
    }
    if (u_mode < 1.5) {
      vec4 s = unpre(texL(mp * u_cell));
      return pre(vec4(mix(s.rgb, u_ec.rgb, e * u_ec.a), 1.0));
    }
    return pre(vec4(u_ec.rgb, e * u_ec.a));
  }`),H=`
uniform float u_mode; uniform float u_count; uniform float u_w; uniform float u_offset; uniform vec4 u_c1; uniform vec4 u_c2; uniform float u_mix;
void main() {
  vec4 o = orig(v_uv);
  vec2 d = 1.5 / u_res;
  float h = (tex(v_uv).a * 2.0 + tex(v_uv + vec2(d.x, 0.0)).a + tex(v_uv - vec2(d.x, 0.0)).a + tex(v_uv + vec2(0.0, d.y)).a + tex(v_uv - vec2(0.0, d.y)).a) / 6.0;
  vec4 res;
  if (u_mode < 0.5) {
    vec4 g = mix(u_c2, u_c1, smoothstep(0.5, 1.0, h));
    res = pre(vec4(g.rgb, g.a * o.a));
  } else if (u_mode < 1.5) {
    float f = fract(h * u_count + u_offset);
    float dd = min(f, 1.0 - f);
    float line = (1.0 - smoothstep(u_w * 0.5, u_w * 0.5 + 0.05, dd)) * step(0.02, h) * (1.0 - smoothstep(0.93, 0.98, h));
    vec4 l = pre(vec4(u_c1.rgb, u_c1.a * line));
    res = l + o * (1.0 - l.a);
  } else {
    float k = mod(floor(h * u_count + u_offset), 2.0);
    vec4 g = k < 0.5 ? u_c1 : u_c2;
    res = pre(vec4(g.rgb, g.a * step(0.02, h) * (1.0 - smoothstep(0.96, 0.995, h)))) + o * smoothstep(0.96, 0.995, h);
  }
  gl_FragColor = mix(o, res, u_mix);
}`,Yt=[`Replace layer`,`Over layer`],U=e=>({u_mix:e.n(`mix`)/100,u_over:e.o(`composite`),u_ang:-e.n(`angle`)*m}),W=(e=0)=>[f(`composite`,`Composite`,Yt,e),p()],Xt=[{type:`checker`,label:`Checker`,category:`Generate`,description:`Creates a checkerboard pattern.`,props:[c(`size`,`Square size`,60,1e3),l(`c1`,`Color 1`,`#ffffff`),l(`c2`,`Color 2`,`#111111`),s(`angle`,`Angle`,0),{key:`offset`,label:`Offset`,kind:`vec2`,def:[0,0],unit:`px`},...W()],passes:e=>[{frag:Ft,u:{...U(e),u_size:e.n(`size`),u_c1:e.c(`c1`),u_c2:e.c(`c2`),u_off:e.v(`offset`)}}]},{type:`grid`,label:`Grid`,category:`Generate`,description:`Generates a grid pattern.`,props:[c(`spacing`,`Spacing`,80,1e3),c(`width`,`Line width`,3,100),l(`line`,`Line color`,`#ffffff`),l(`bg`,`Background`,`#00000000`),s(`angle`,`Angle`,0),{key:`offset`,label:`Offset`,kind:`vec2`,def:[0,0],unit:`px`},...W(1)],passes:e=>[{frag:It,u:{...U(e),u_sp:e.n(`spacing`),u_w:e.n(`width`),u_line:e.c(`line`),u_bg:e.c(`bg`),u_off:e.v(`offset`)}}]},{type:`stripes`,label:`Stripes`,category:`Generate`,description:`Creates a striped pattern.`,props:[c(`width`,`Stripe width`,60,1e3),o(`ratio`,`Balance`,50,1,99),l(`c1`,`Color 1`,`#ffffff`),l(`c2`,`Color 2`,`#ff3d7f`),s(`angle`,`Angle`,45),a(`speed`,`Scroll speed`,0,-10,10,{step:.1}),...W()],passes:e=>[{frag:Lt,u:{...U(e),u_w:e.n(`width`),u_ratio:e.n(`ratio`)/100,u_c1:e.c(`c1`),u_c2:e.c(`c2`),u_shift:e.local*e.n(`speed`)}}]},{type:`dots`,label:`Dots`,category:`Generate`,description:`Creates a pattern of dots.`,props:[c(`spacing`,`Spacing`,50,1e3),o(`size`,`Dot size`,50,1,100),l(`dot`,`Dot color`,`#ffffff`),l(`bg`,`Background`,`#00000000`),f(`stagger`,`Layout`,[`Grid`,`Staggered`],1),s(`angle`,`Angle`,0),...W(1)],passes:e=>[{frag:Rt,u:{...U(e),u_sp:e.n(`spacing`),u_size:e.n(`size`)/100,u_dot:e.c(`dot`),u_bg:e.c(`bg`),u_stagger:e.o(`stagger`)}}]},{type:`clouds`,label:`Clouds`,category:`Generate`,description:`Generates a cloud-like texture.`,props:[c(`size`,`Scale`,300,3e3),l(`sky`,`Sky`,`#4a8fe7`),l(`cloud`,`Clouds`,`#ffffff`),o(`cover`,`Coverage`,55),o(`softness`,`Softness`,35),a(`speed`,`Drift speed`,1,-20,20,{step:.1}),s(`angle`,`Angle`,0),...W()],passes:e=>[{frag:zt,u:{...U(e),u_size:e.n(`size`),u_sky:e.c(`sky`),u_cloud:e.c(`cloud`),u_cover:e.n(`cover`)/100,u_soft:e.n(`softness`)/100,u_speed:e.n(`speed`)}}]},{type:`fractalRidges`,label:`Fractal Ridges`,category:`Generate`,description:`Generates rough, mountainous ridged patterns.`,props:[c(`size`,`Scale`,250,3e3),a(`octaves`,`Complexity`,5,1,8,{step:1}),l(`c1`,`Low`,`#14102b`),l(`c2`,`Ridges`,`#ffb36b`),a(`sharpness`,`Sharpness`,2,.3,8,{step:.1}),a(`speed`,`Evolution`,0,0,10,{step:.1}),s(`angle`,`Angle`,0),...W()],passes:e=>[{frag:Bt,u:{...U(e),u_size:e.n(`size`),u_oct:e.n(`octaves`),u_c1:e.c(`c1`),u_c2:e.c(`c2`),u_sharp:e.n(`sharpness`),u_speed:e.n(`speed`)}}]},{type:`turbulenceGen`,label:`Turbulence`,category:`Generate`,description:`Generates irregular, turbulent patterns.`,props:[c(`size`,`Scale`,200,3e3),a(`octaves`,`Complexity`,5,1,8,{step:1}),l(`c1`,`Color 1`,`#000000`),l(`c2`,`Color 2`,`#ffffff`),a(`contrast`,`Contrast`,2,.2,8,{step:.1}),a(`speed`,`Evolution`,.5,0,10,{step:.1}),s(`angle`,`Angle`,0),...W()],passes:e=>[{frag:Vt,u:{...U(e),u_size:e.n(`size`),u_oct:e.n(`octaves`),u_c1:e.c(`c1`),u_c2:e.c(`c2`),u_contrast:e.n(`contrast`),u_speed:e.n(`speed`)}}]},{type:`starfield`,label:`Starfield`,category:`Generate`,description:`Generates a field of stars flying toward you.`,props:[u(`center`,`Center`),o(`density`,`Density`,30),a(`size`,`Star size`,1,.2,4,{step:.05}),a(`speed`,`Speed`,1,-10,10,{step:.1}),l(`star`,`Stars`,`#ffffff`),l(`bg`,`Background`,`#05050c`),...W()],passes:e=>[{frag:Ht,u:{...U(e),u_ang:0,u_c:e.pt(`center`),u_density:e.n(`density`)/100,u_size:e.n(`size`),u_speed:e.n(`speed`),u_star:e.c(`star`),u_bg:e.c(`bg`)}}]},{type:`simpleStarfield`,label:`Simple Starfield`,category:`Generate`,description:`Generates twinkling stars against a space-like background.`,props:[o(`density`,`Density`,25),c(`cell`,`Spacing`,40,400),c(`size`,`Star size`,3,20),a(`twinkle`,`Twinkle speed`,3,0,20,{step:.1}),l(`star`,`Stars`,`#ffffff`),l(`bg`,`Background`,`#05050c`),...W()],passes:e=>[{frag:Ut,u:{...U(e),u_ang:0,u_density:e.n(`density`)/100,u_cell:e.n(`cell`),u_size:e.n(`size`),u_tw:e.n(`twinkle`),u_star:e.c(`star`),u_bg:e.c(`bg`)}}]},{type:`heart`,label:`Heart`,category:`Generate`,description:`Generates a heart shape.`,props:[u(`center`,`Center`),c(`size`,`Size`,300,3e3),l(`color`,`Color`,`#ff2d6f`),l(`bg`,`Background`,`#00000000`),o(`softness`,`Edge softness`,1,0,50),s(`angle`,`Rotation`,0),...W()],passes:e=>[{frag:Wt,u:{...U(e),u_c:e.pt(`center`),u_size:e.n(`size`),u_soft:e.n(`softness`)/100,u_color:e.c(`color`),u_bg:e.c(`bg`)}}]},{type:`star`,label:`Star`,category:`Generate`,description:`Generates a star shape.`,props:[u(`center`,`Center`),c(`size`,`Size`,250,3e3),a(`points`,`Points`,5,3,24,{step:1}),o(`inner`,`Inner radius`,45,5,100),o(`round`,`Roundness`,0,0,40),l(`color`,`Color`,`#ffc94d`),l(`bg`,`Background`,`#00000000`),o(`softness`,`Edge softness`,1,0,50),s(`angle`,`Rotation`,0),...W()],passes:e=>{let t=Math.round(e.n(`points`)),n=2+(1-e.n(`inner`)/100)*(t-2);return[{frag:Gt,u:{...U(e),u_c:e.pt(`center`),u_size:e.n(`size`),u_n:t,u_m:Math.max(2,n),u_round:e.n(`round`)/100*.5,u_soft:e.n(`softness`)/100,u_color:e.c(`color`),u_bg:e.c(`bg`)}}]}},{type:`radialRays`,label:`Radial Rays`,category:`Generate`,description:`Creates rays spreading from a central point (sunburst).`,props:[u(`center`,`Center`),a(`count`,`Rays`,12,2,64,{step:1}),o(`softness`,`Softness`,10,0,50),a(`speed`,`Spin (°/s)`,15,-360,360),l(`color`,`Ray color`,`#ffd166`),l(`bg`,`Background`,`#ff8a3d`),o(`fade`,`Fade out`,0),...W()],passes:e=>[{frag:Kt,u:{...U(e),u_ang:0,u_c:e.pt(`center`),u_count:Math.round(e.n(`count`)),u_soft:e.n(`softness`)/100,u_spin:e.local*e.n(`speed`)*m,u_color:e.c(`color`),u_bg:e.c(`bg`),u_fade:e.n(`fade`)/100}}]},{type:`ribbon`,label:`Ribbon`,category:`Generate`,description:`Creates flowing ribbon-like waves.`,props:[a(`count`,`Ribbons`,4,1,12,{step:1}),c(`amplitude`,`Amplitude`,120,1e3),c(`length`,`Wavelength`,700,4e3),c(`thickness`,`Thickness`,40,400),c(`spacing`,`Spacing`,50,400),a(`speed`,`Speed`,1.5,-10,10,{step:.1}),l(`c1`,`Color 1`,`#7c5cff`),l(`c2`,`Color 2`,`#ff5c8a`),s(`angle`,`Angle`,0),...W(1)],passes:e=>[{frag:qt,u:{...U(e),u_count:Math.round(e.n(`count`)),u_amp:e.n(`amplitude`),u_len:e.n(`length`),u_th:e.n(`thickness`),u_sp:e.n(`spacing`),u_speed:e.n(`speed`),u_c1:e.c(`c1`),u_c2:e.c(`c2`)}}]},{type:`voronoi`,label:`Voronoi Cells`,category:`Generate`,description:`Creates a pattern of irregular polygonal cells (or a stained-glass mosaic).`,props:[f(`mode`,`Style`,[`Colored cells`,`Mosaic of layer`,`Edges only`]),c(`cell`,`Cell size`,70,1e3),o(`edge`,`Edge width`,8,0,50),l(`c1`,`Color 1`,`#7c5cff`),l(`c2`,`Color 2`,`#3fe08f`),l(`edgeColor`,`Edge color`,`#000000`),a(`speed`,`Animate`,.5,0,10,{step:.1}),...W()],passes:e=>[{frag:Jt,u:{...U(e),u_ang:0,u_mode:e.o(`mode`),u_cell:e.n(`cell`),u_edge:Math.max(.001,e.n(`edge`)/100),u_c1:e.c(`c1`),u_c2:e.c(`c2`),u_ec:e.c(`edgeColor`),u_speed:e.n(`speed`)}}]},{type:`contourGradient`,label:`Contour Gradient`,category:`Generate`,description:`Creates gradients that follow the layer's contours.`,props:[c(`distance`,`Distance`,40,400),l(`c1`,`Inner color`,`#ffd166`),l(`c2`,`Edge color`,`#ef476f`),p()],passes:e=>[...y(e.n(`distance`)*.5*e.scale),{frag:H,u:{u_mode:0,u_count:1,u_w:0,u_offset:0,u_c1:e.c(`c1`),u_c2:e.c(`c2`),u_mix:e.n(`mix`)/100}}]},{type:`contourLines`,label:`Contour Lines`,category:`Generate`,description:`Creates contour or topographic-style lines around the layer.`,props:[c(`distance`,`Spread`,60,600),a(`count`,`Lines`,8,1,40,{step:1}),o(`width`,`Line width`,12,1,50),l(`c1`,`Line color`,`#ffffff`),a(`speed`,`Flow speed`,0,-5,5,{step:.05}),p()],passes:e=>[...y(e.n(`distance`)*.5*e.scale),{frag:H,u:{u_mode:1,u_count:e.n(`count`),u_w:e.n(`width`)/100,u_offset:e.local*e.n(`speed`),u_c1:e.c(`c1`),u_c2:[0,0,0,0],u_mix:e.n(`mix`)/100}}]},{type:`contourStrips`,label:`Contour Strips`,category:`Generate`,description:`Produces layered strips following the contours.`,props:[c(`distance`,`Spread`,60,600),a(`count`,`Strips`,6,1,40,{step:1}),l(`c1`,`Color 1`,`#ff5c8a`),l(`c2`,`Color 2`,`#ffc94d`),a(`speed`,`Flow speed`,0,-5,5,{step:.05}),p()],passes:e=>[...y(e.n(`distance`)*.5*e.scale),{frag:H,u:{u_mode:2,u_count:e.n(`count`),u_w:0,u_offset:e.local*e.n(`speed`),u_c1:e.c(`c1`),u_c2:e.c(`c2`),u_mix:e.n(`mix`)/100}}]}],Zt=`
uniform float u_size; uniform float u_ang; uniform float u_paper;
float screen(vec2 p, float a, float ch) {
  vec2 q = rot(a) * p;
  vec2 cc = (floor(q / u_size) + 0.5) * u_size;
  vec4 s = unpre(texL(rot(-a) * cc));
  vec3 c = s.rgb;
  float k = 1.0 - max(c.r, max(c.g, c.b));
  float ink;
  if (ch < 0.5) ink = (1.0 - c.r - k) / max(1.0 - k, 0.001);
  else if (ch < 1.5) ink = (1.0 - c.g - k) / max(1.0 - k, 0.001);
  else if (ch < 2.5) ink = (1.0 - c.b - k) / max(1.0 - k, 0.001);
  else ink = k;
  ink *= s.a;
  float r = u_size * 0.5 * sqrt(clamp(ink, 0.0, 1.0)) * 1.35;
  return 1.0 - smoothstep(r - 0.7, r + 0.7, length(q - cc));
}
void main() {
  vec4 o = tex(v_uv);
  vec2 p = lp();
  float C = screen(p, u_ang + 0.2618, 0.0);
  float M = screen(p, u_ang + 1.309, 1.0);
  float Y = screen(p, u_ang, 2.0);
  float K = screen(p, u_ang + 0.7854, 3.0);
  vec3 rgb = vec3(1.0);
  rgb *= mix(vec3(1.0), vec3(0.0, 1.0, 1.0), C);
  rgb *= mix(vec3(1.0), vec3(1.0, 0.0, 1.0), M);
  rgb *= mix(vec3(1.0), vec3(1.0, 1.0, 0.0), Y);
  rgb *= 1.0 - K;
  float ink = max(max(C, M), max(Y, K));
  float a = u_paper > 0.5 ? o.a * ink : o.a;
  gl_FragColor = vec4(rgb * a, a);
}`,Qt=`
uniform float u_size; uniform float u_ang; uniform float u_mode; uniform vec4 u_ink;
void main() {
  vec2 p = lp();
  vec2 q = rot(u_ang) * p;
  vec2 cc = (floor(q / u_size) + 0.5) * u_size;
  vec4 s = unpre(texL(rot(-u_ang) * cc));
  float v = u_mode < 0.5 ? lum(s.rgb) : 1.0 - lum(s.rgb);
  float rad = u_size * 0.72 * sqrt(clamp(v, 0.0, 1.0)) * s.a;
  float cov = 1.0 - smoothstep(rad - 0.8, rad + 0.8, length(q - cc));
  vec3 c = u_mode < 1.5 ? s.rgb : u_ink.rgb;
  if (u_mode > 0.5 && u_mode < 1.5) c = s.rgb;
  gl_FragColor = vec4(c * cov, cov);
}`,$t=`
uniform float u_size; uniform float u_ang; uniform float u_mode; uniform vec4 u_ink;
void main() {
  vec2 p = lp();
  vec2 q = rot(u_ang) * p;
  float cy = (floor(q.y / u_size) + 0.5) * u_size;
  vec4 s = unpre(texL(rot(-u_ang) * vec2(q.x, cy)));
  float dark = (1.0 - lum(s.rgb)) * s.a;
  float th = u_size * 0.5 * dark * 1.15;
  float cov = 1.0 - smoothstep(th - 0.7, th + 0.7, abs(q.y - cy));
  vec3 c = u_mode < 0.5 ? u_ink.rgb : s.rgb;
  gl_FragColor = vec4(c * cov, cov) * step(0.001, s.a);
}`,en=`
uniform vec2 u_size;
void main() {
  vec2 p = lp();
  vec2 q = u_lb.xy + (floor((p - u_lb.xy) / u_size) + 0.5) * u_size;
  gl_FragColor = texL(q);
}`,tn=`
uniform vec2 u_n; uniform float u_sharp;
void main() {
  vec2 p = lp();
  vec2 cell = u_lb.zw / max(u_n, vec2(1.0));
  vec2 id = floor((p - u_lb.xy) / cell);
  vec2 c0 = u_lb.xy + (id + 0.5) * cell;
  vec4 c = texL(c0);
  if (u_sharp < 0.5) c = (c + texL(c0 + cell * vec2(0.25, 0.25)) + texL(c0 + cell * vec2(-0.25, 0.25)) + texL(c0 + cell * vec2(0.25, -0.25)) + texL(c0 + cell * vec2(-0.25, -0.25))) / 5.0;
  gl_FragColor = c;
}`,nn=`
uniform float u_amt; uniform float u_size; uniform float u_color; uniform float u_frame; uniform float u_clip;
void main() {
  vec4 c = unpre(tex(v_uv));
  vec2 g = floor(pix() / max(u_size, 0.5));
  float f = u_frame * 7.13;
  vec3 n = u_color > 0.5 ? vec3(hash(g + f), hash(g + f + 17.0), hash(g + f + 31.0)) - 0.5 : vec3(hash(g + f) - 0.5);
  gl_FragColor = pre(vec4(clamp(c.rgb + n * u_amt, 0.0, 1.0), c.a));
}`,rn=`
uniform vec2 u_off;
void main() {
  vec2 o = u_off / u_res;
  vec4 r = texClip(v_uv + o); vec4 g = tex(v_uv); vec4 b = texClip(v_uv - o);
  float a = max(max(r.a, g.a), b.a);
  gl_FragColor = vec4(r.r, g.g, b.b, a);
}`,an=`
uniform float u_amt; uniform vec2 u_block; uniform float u_step; uniform float u_color;
void main() {
  vec2 p = pix();
  vec4 acc = tex(v_uv);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 bs = u_block * (1.0 + fi * 1.7);
    vec2 cell = floor(p / bs);
    if (hash(cell + vec2(u_step * 3.1 + fi * 11.0, fi + u_seed)) > 1.0 - u_amt * 0.35) {
      vec2 sh = (hash2(cell + u_step + fi) - 0.5) * bs * 3.0;
      vec4 s = texClip(uvOf(p + sh));
      if (u_color > 0.5 && hash(cell + 5.0 + u_step) > 0.5) s.rgb = s.gbr;
      if (hash(cell + 9.0 + u_step) > 0.82) s.rgb = s.a - s.rgb;
      acc = s;
    }
  }
  gl_FragColor = acc;
}`,on=`
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
}`,sn=`
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
}`,cn=`
uniform float u_amount; uniform float u_size; uniform float u_soft; uniform vec4 u_color;
void main() {
  vec4 c = tex(v_uv);
  vec2 n = (lnorm(lp()) - 0.5) * 2.0;
  float m = max(u_lb.z, u_lb.w);
  n *= vec2(u_lb.z / m, u_lb.w / m);
  float v = smoothstep(u_size, u_size + u_soft, length(n) * 0.75) * u_amount;
  vec4 u = unpre(c);
  gl_FragColor = pre(vec4(mix(u.rgb, u_color.rgb, v * u_color.a), u.a));
}`,ln=`
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
}`,un=[{type:`cmykHalftone`,label:`CMYK Halftone Dots`,category:`Stylize`,description:`Creates a printed comic-book or newspaper dot pattern using printing colors.`,props:[c(`size`,`Dot size`,10,100),s(`angle`,`Screen angle`,0),f(`paper`,`Paper`,[`White`,`Transparent`])],passes:e=>[{frag:Zt,u:{u_size:Math.max(2,e.n(`size`)),u_ang:e.n(`angle`)*m,u_paper:e.o(`paper`)}}]},{type:`halftone`,label:`Halftone Dots`,category:`Stylize`,description:`Converts imagery into a dot-based print pattern.`,props:[c(`size`,`Dot size`,10,100),s(`angle`,`Angle`,45),f(`mode`,`Dots for`,[`Highlights (color)`,`Shadows (color)`,`Shadows (ink)`]),l(`ink`,`Ink`,`#111111`)],passes:e=>[{frag:Qt,u:{u_size:Math.max(2,e.n(`size`)),u_ang:e.n(`angle`)*m,u_mode:e.o(`mode`),u_ink:e.c(`ink`)}}]},{type:`halftoneLines`,label:`Halftone Lines`,category:`Stylize`,description:`Converts imagery into a pattern of lines.`,props:[c(`size`,`Line spacing`,8,100),s(`angle`,`Angle`,30),f(`mode`,`Color`,[`Ink`,`Original colors`],1),l(`ink`,`Ink`,`#111111`)],passes:e=>[{frag:$t,u:{u_size:Math.max(2,e.n(`size`)),u_ang:e.n(`angle`)*m,u_mode:e.o(`mode`),u_ink:e.c(`ink`)}}]},{type:`pixelate`,label:`Pixelate`,category:`Stylize`,description:`Makes an image look pixelated.`,props:[c(`size`,`Pixel size`,16,400)],passes:e=>[{frag:en,u:{u_size:[Math.max(1,e.n(`size`)),Math.max(1,e.n(`size`))]}}]},{type:`mosaic`,label:`Mosaic`,category:`Stylize`,description:`Breaks an image into larger colored blocks.`,props:[a(`h`,`Horizontal blocks`,20,1,400,{step:1}),a(`v`,`Vertical blocks`,20,1,400,{step:1}),f(`sharp`,`Colors`,[`Averaged`,`Sharp`])],passes:e=>[{frag:tn,u:{u_n:[Math.max(1,e.n(`h`)),Math.max(1,e.n(`v`))],u_sharp:e.o(`sharp`)}}]},{type:`grain`,label:`Noise`,category:`Stylize`,description:`Adds random grain or visual static.`,props:[o(`amount`,`Amount`,20),a(`size`,`Grain size`,1.5,.5,8,{step:.1}),f(`color`,`Type`,[`Monochrome`,`Color`]),f(`animated`,`Animate`,[`Every frame`,`Static`])],passes:e=>[{frag:nn,u:{u_amt:e.n(`amount`)/100*.6,u_size:Math.max(.5,e.n(`size`)*e.scale),u_color:e.o(`color`),u_frame:e.o(`animated`)?0:Math.floor(e.t*e.fps)}}]},{type:`rgbSplit`,label:`RGB Split`,category:`Stylize`,description:`Separates red, green and blue channels for a chromatic glitch look.`,props:[c(`amount`,`Offset`,12,200),s(`angle`,`Angle`,0)],passes:e=>{let t=e.n(`angle`)*m,n=e.n(`amount`)*e.scale;return[{frag:rn,u:{u_off:[Math.cos(t)*n,-Math.sin(t)*n]}}]}},{type:`blockNoise`,label:`Block Noise`,category:`Stylize`,description:`Adds random rectangular glitch patterns.`,props:[o(`amount`,`Amount`,40),{key:`block`,label:`Block size`,kind:`vec2`,def:[60,14],unit:`px`},a(`speed`,`Changes / sec`,10,0,60),f(`color`,`Color glitches`,[`Off`,`On`],1)],passes:e=>{let[t,n]=e.v(`block`);return[{frag:an,u:{u_amt:e.n(`amount`)/100,u_block:[Math.max(1,t*e.scale),Math.max(1,n*e.scale)],u_step:Math.floor(e.local*e.n(`speed`)),u_color:e.o(`color`)}}]}},{type:`glitch`,label:`Glitch`,category:`Stylize`,description:`Digital glitch: sliced, shifted rows with color splitting.`,props:[o(`amount`,`Strength`,50),a(`speed`,`Speed`,12,0,60),c(`blocks`,`Block size`,40,400)],passes:e=>[{frag:on,u:{u_amount:e.n(`amount`)/100,u_speed:e.n(`speed`),u_block:Math.max(1,e.n(`blocks`)*e.scale)}}]},{type:`scanlines`,label:`Scanlines / CRT`,category:`Stylize`,description:`Old-TV scanlines with optional screen curvature.`,props:[o(`amount`,`Strength`,40),a(`lines`,`Line spacing`,4,2,40),o(`curve`,`Screen curve`,0)],passes:e=>[{frag:sn,u:{u_amount:e.n(`amount`)/100,u_lines:Math.max(1,e.n(`lines`)*e.scale),u_curve:e.n(`curve`)/100}}]},{type:`vignette`,label:`Vignette`,category:`Stylize`,description:`Darkens or tints the edges of an image.`,props:[o(`amount`,`Amount`,50),o(`size`,`Size`,60),o(`softness`,`Softness`,50,1,100),l(`color`,`Color`,`#000000`)],passes:e=>[{frag:cn,u:{u_amount:e.n(`amount`)/100,u_size:e.n(`size`)/100,u_soft:Math.max(.01,e.n(`softness`)/100),u_color:e.c(`color`)}}]},{type:`edges`,label:`Find Edges`,category:`Stylize`,description:`Detects and highlights outlines in an image.`,props:[o(`amount`,`Amount`,100),f(`invert`,`Style`,[`Neon edges`,`Ink on paper`])],passes:e=>[{frag:ln,u:{u_amount:e.n(`amount`)/100,u_invert:e.o(`invert`)}}]}],dn=`
uniform float u_shape; uniform mat3 u_rot; uniform mat3 u_irot; uniform vec3 u_dim; uniform float u_size;
uniform float u_shade; uniform float u_persp; uniform vec2 u_c; uniform float u_p1; uniform float u_p2; uniform vec4 u_side; uniform float u_ext;

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
}`,fn=`
uniform mat3 u_rot; uniform float u_tan;
vec2 dirToEq(vec3 d) { return vec2(atan(d.x, d.z) / TAU + 0.5, 0.5 - asin(clamp(d.y, -1.0, 1.0)) / PI); }
void main() {
  vec2 p = lp();
  if (!inBounds(p)) { gl_FragColor = vec4(0.0); return; }
  vec2 n = lnorm(p) - 0.5;
  float aspect = u_lb.z / max(u_lb.w, 1.0);
  vec3 d = normalize(vec3(n.x * 2.0 * u_tan * aspect, -n.y * 2.0 * u_tan, 1.0));
  gl_FragColor = texL(ldenorm(dirToEq(u_rot * d)));
}`,pn=`
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
}`;function G(e,t,n){let[r,i,a]=[e*m,t*m,n*m],o=Math.cos(r),s=Math.sin(r),c=Math.cos(i),l=Math.sin(i),u=Math.cos(a),d=Math.sin(a),f=[u*c,u*l*s-d*o,u*l*o+d*s,d*c,d*l*s+u*o,d*l*o-u*s,-l,c*s,c*o];return[f[0],f[3],f[6],f[1],f[4],f[7],f[2],f[5],f[8]]}var mn={cube:.7,cylinder:.9,hexPrism:.85,hollowBox:.8,octahedron:.75,pyramid:.85,starPolyhedron:.75,starPrism:1,threeAxisCross:1,torus:.95},hn=e=>[e[0],e[3],e[6],e[1],e[4],e[7],e[2],e[5],e[8]],gn=e=>{let t=e.n(`spin`)*e.local;return G(e.n(`rx`),e.n(`ry`)+t,e.n(`rz`))},_n=[`box`,`cube`,`cylinder`,`ellipsoid`,`hexPrism`,`hollowBox`,`octahedron`,`pyramid`,`starPolyhedron`,`starPrism`,`threeAxisCross`,`torus`],K={box:[`Box`,`Turns a layer into a 3D box with adjustable width, height and depth.`],cube:[`Cube`,`Wraps the layer around a 3D cube.`],cylinder:[`Cylinder`,`Wraps a layer around a cylinder.`],ellipsoid:[`Ellipsoid`,`Turns a layer into an ellipsoid-shaped 3D object.`],hexPrism:[`Hexagonal Prism`,`Creates a hexagonal prism-shaped 3D object.`],hollowBox:[`Hollow Box`,`Creates a hollow, box-frame 3D object.`],octahedron:[`Octahedron`,`Creates an eight-faced 3D object.`],pyramid:[`Pyramid`,`Creates a pyramid-shaped 3D object.`],starPolyhedron:[`Star Polyhedron`,`Creates a star-like three-dimensional polyhedron.`],starPrism:[`Star Prism`,`Creates a prism-like 3D star shape.`],threeAxisCross:[`Three-axis Cross`,`Creates a cross-shaped 3D object with three axes.`],torus:[`Torus`,`Creates a doughnut-shaped 3D object.`]};function vn(e,t){let n=e===`box`||e===`ellipsoid`?[o(`w`,`Width`,90,5,200),o(`h`,`Height`,60,5,200),o(`d`,`Depth`,40,5,200)]:e===`hollowBox`?[o(`thickness`,`Frame thickness`,10,1,50)]:e===`starPrism`?[a(`points`,`Points`,5,3,16,{step:1}),o(`inner`,`Inner radius`,45,5,95),o(`d`,`Depth`,25,2,100)]:e===`threeAxisCross`?[o(`thickness`,`Arm thickness`,22,2,60)]:e===`torus`?[o(`thickness`,`Tube thickness`,30,2,70)]:[];return{type:e,label:K[e][0],category:`3D & Perspective`,description:K[e][1],props:[...n,o(`size`,`Size`,45,1,300),u(`center`,`Center`),s(`rx`,`Rotate X`,20),s(`ry`,`Rotate Y`,30),s(`rz`,`Rotate Z`,0),a(`spin`,`Spin (°/s)`,30,-720,720),o(`shading`,`Shading`,80),a(`persp`,`Camera distance`,4,1.5,30,{step:.1}),l(`side`,`Surface color`,`#2a2d39`)],passes:n=>{let r=gn(n),i=Math.round(n.n(`points`)||5),a=e===`hollowBox`||e===`threeAxisCross`?n.n(`thickness`)/100:e===`torus`?n.n(`thickness`)/100*.6:i,o=e===`starPrism`?Math.max(2,2+(1-n.n(`inner`)/100)*(i-2)):0;return[{frag:dn,u:{u_shape:t,u_rot:hn(r),u_irot:r,u_dim:e===`box`||e===`ellipsoid`?[n.n(`w`)/100,n.n(`h`)/100,n.n(`d`)/100]:[.7,.7,e===`starPrism`?n.n(`d`)/100*.8:.7],u_size:n.n(`size`)/100*Math.min(n.lb.w,n.lb.h),u_shade:n.n(`shading`)/100,u_persp:n.n(`persp`),u_c:n.pt(`center`),u_p1:a,u_p2:o,u_side:n.c(`side`),u_ext:mn[e]??Math.max(n.n(`w`),n.n(`h`),n.n(`d`))/100}}]}}}var yn=[..._n.map((e,t)=>vn(e,t)),{type:`viewer360`,label:`360º Viewer`,category:`3D & Perspective`,description:`Views a 360° (equirectangular) image or video through a virtual camera.`,props:[s(`yaw`,`Pan (yaw)`,0),s(`pitch`,`Tilt (pitch)`,0),s(`roll`,`Roll`,0),a(`fov`,`Field of view`,90,10,170,{unit:`°`}),a(`spin`,`Auto pan (°/s)`,0,-180,180)],passes:e=>{let t=e.n(`yaw`)+e.n(`spin`)*e.local;return[{frag:fn,u:{u_rot:G(-e.n(`pitch`),t,e.n(`roll`)),u_tan:Math.tan(e.n(`fov`)*m/2)}}]}},{type:`reorient360`,label:`360º Reorient Sphere`,category:`3D & Perspective`,description:`Changes the orientation of a spherical 360° image.`,props:[s(`yaw`,`Yaw`,90),s(`pitch`,`Pitch`,0),s(`roll`,`Roll`,0)],passes:e=>[{frag:pn,u:{u_rot:G(e.n(`pitch`),e.n(`yaw`),e.n(`roll`))}}]}],bn=`
uniform vec2 u_out; uniform float u_mirror; uniform vec2 u_phase;
void main() {
  vec2 n = lnorm(lp()) - 0.5;
  if (abs(n.x) > u_out.x * 0.5 || abs(n.y) > u_out.y * 0.5) { gl_FragColor = vec4(0.0); return; }
  vec2 g = n + 0.5 + u_phase;
  vec2 f = fract(g);
  if (u_mirror > 0.5) { vec2 m = mod(floor(g), 2.0); f = mix(f, 1.0 - f, m); }
  gl_FragColor = texL(ldenorm(f));
}`,xn=`
uniform float u_size; uniform float u_ang; uniform float u_rand;
void main() {
  vec2 p = lp();
  vec2 id = floor(p / u_size);
  vec2 c = (id + 0.5) * u_size;
  float a = u_ang + (hash(id + u_seed) - 0.5) * 2.0 * u_rand;
  vec2 q = c + rot(a) * (p - c);
  if (abs(q.x - c.x) > u_size * 0.5 || abs(q.y - c.y) > u_size * 0.5) { gl_FragColor = vec4(0.0); return; }
  gl_FragColor = texL(q);
}`,Sn=`
uniform float u_size; uniform vec2 u_shift; uniform float u_rand;
void main() {
  vec2 p = lp();
  vec2 id = floor(p / u_size);
  vec2 sh = vec2(mod(id.y, 2.0) * u_shift.x, mod(id.x, 2.0) * u_shift.y) + (hash2(id + u_seed) - 0.5) * 2.0 * u_rand;
  gl_FragColor = texL(p - sh);
}`,q=`
uniform float u_size; uniform float u_mode; uniform float u_ang; uniform float u_rand; uniform vec2 u_shift; uniform float u_gap;

vec4 hexCell(vec2 p) {
  vec2 s = vec2(1.0, 1.7320508);
  vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hc.xy * s, p - (hc.zw + 0.5) * s);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hc.xy) : vec4(h.zw, hc.zw + 0.5);
}
float hexDist(vec2 p) { p = abs(p); return max(dot(p, vec2(0.5, 0.8660254)), p.x); }

void main() {
  vec2 p = lp();
  vec2 sp = p / u_size;
  vec4 h = hexCell(sp);
  vec2 center = (sp - h.xy) * u_size;
  float r = hash(h.zw + u_seed);
  if (u_mode < 0.5) {
    vec2 n = vec2(h.x + 0.5, h.y / 1.1547 + 0.5);
    gl_FragColor = texL(ldenorm(n));
  } else if (u_mode < 1.5) {
    float a = u_ang + (r - 0.5) * 2.0 * u_rand;
    gl_FragColor = texL(center + rot(a) * h.xy * u_size);
  } else if (u_mode < 2.5) {
    vec2 sh = u_shift * (mod(h.z + h.w, 2.0) < 1.0 ? 1.0 : -1.0) + (hash2(h.zw + u_seed) - 0.5) * 2.0 * u_rand;
    gl_FragColor = texL(p - sh);
  } else {
    vec4 c = texL(center);
    float d = hexDist(h.xy);
    float cov = 1.0 - smoothstep(0.5 - u_gap - 0.02, 0.5 - u_gap, d);
    gl_FragColor = c * cov;
  }
}`;function J(e,t,n){let r=e.temp();r.getContext(`2d`).drawImage(e.buf,0,0);let i=[[e.lb.x,e.lb.y],[e.lb.x+e.lb.w,e.lb.y],[e.lb.x+e.lb.w,e.lb.y+e.lb.h],[e.lb.x,e.lb.y+e.lb.h]].map(t=>e.toBuf(t)),a=Math.max(0,Math.floor(Math.min(...i.map(e=>e[0]))-4)),o=Math.max(0,Math.floor(Math.min(...i.map(e=>e[1]))-4)),s=Math.min(e.w,Math.ceil(Math.max(...i.map(e=>e[0]))+4)),c=Math.min(e.h,Math.ceil(Math.max(...i.map(e=>e[1]))+4)),l=e.ctx;if(l.save(),l.setTransform(1,0,0,1,0,0),n!==`front`&&l.clearRect(0,0,e.w,e.h),s>a&&c>o)for(let e of t)e.alpha<=.001||(l.setTransform(e.m),l.globalAlpha=Math.min(1,e.alpha),l.drawImage(r,a,o,s-a,c-o,a,o,s-a,c-o));n===`behind`&&(l.setTransform(1,0,0,1,0,0),l.globalAlpha=1,l.drawImage(r,0,0)),l.restore()}var Y=(e,t)=>e.m.multiply(t).multiply(e.m.inverse());function Cn(e){let t=e>>>0||1;return()=>{t=t+1831565813>>>0;let e=t;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}}var X=(e,t,n)=>e+(t-e)*n,wn=[{type:`tile`,label:`Tiles`,category:`Tiles & Repeat`,description:`Repeats a layer in a tiled pattern beyond its edges.`,props:[o(`outW`,`Output width`,300,100,2e3),o(`outH`,`Output height`,300,100,2e3),f(`mirror`,`Mirror edges`,[`Off`,`On`]),d(`phase`,`Phase`,[0,0],`%`)],passes:e=>{let[t,n]=e.v(`phase`);return[{frag:bn,u:{u_out:[e.n(`outW`)/100,e.n(`outH`)/100],u_mirror:e.o(`mirror`),u_phase:[t/100,n/100]}}]}},{type:`tileRotate`,label:`Tile Rotate`,category:`Tiles & Repeat`,description:`Divides an image into tiles and rotates them.`,props:[c(`size`,`Tile size`,80,1e3),s(`angle`,`Rotation`,30),a(`random`,`Random rotation`,0,0,180,{unit:`°`})],passes:e=>[{frag:xn,u:{u_size:Math.max(2,e.n(`size`)),u_ang:e.n(`angle`)*m,u_rand:e.n(`random`)*m}}]},{type:`tileShift`,label:`Tile Shift`,category:`Tiles & Repeat`,description:`Shifts tiles within an image (brick-style offsets).`,props:[c(`size`,`Tile size`,80,1e3),d(`shift`,`Shift`,[30,0]),c(`random`,`Random shift`,0,300)],passes:e=>[{frag:Sn,u:{u_size:Math.max(2,e.n(`size`)),u_shift:e.v(`shift`),u_rand:e.n(`random`)}}]},{type:`hexTiling`,label:`Hexagon Tiling`,category:`Tiles & Repeat`,description:`Repeats imagery in a hexagonal arrangement.`,props:[c(`size`,`Hexagon size`,160,2e3)],passes:e=>[{frag:q,u:{u_size:Math.max(4,e.n(`size`)),u_mode:0,u_ang:0,u_rand:0,u_shift:[0,0],u_gap:0}}]},{type:`hexTileRotate`,label:`Hexagon Tile Rotate`,category:`Tiles & Repeat`,description:`Creates hexagonal tiles with rotational variations.`,props:[c(`size`,`Hexagon size`,120,2e3),s(`angle`,`Rotation`,60),a(`random`,`Random rotation`,30,0,180,{unit:`°`})],passes:e=>[{frag:q,u:{u_size:Math.max(4,e.n(`size`)),u_mode:1,u_ang:e.n(`angle`)*m,u_rand:e.n(`random`)*m,u_shift:[0,0],u_gap:0}}]},{type:`hexTileShift`,label:`Hexagon Tile Shift`,category:`Tiles & Repeat`,description:`Creates a hexagonal tiled pattern with shifted tiles.`,props:[c(`size`,`Hexagon size`,120,2e3),d(`shift`,`Shift`,[20,10]),c(`random`,`Random shift`,10,300)],passes:e=>[{frag:q,u:{u_size:Math.max(4,e.n(`size`)),u_mode:2,u_ang:0,u_rand:e.n(`random`),u_shift:e.v(`shift`),u_gap:0}}]},{type:`hexArray`,label:`Hexagon Array`,category:`Tiles & Repeat`,description:`Rebuilds the layer as an array of colored hexagons.`,props:[c(`size`,`Hexagon size`,40,1e3),o(`gap`,`Gap`,8,0,45)],passes:e=>[{frag:q,u:{u_size:Math.max(4,e.n(`size`)),u_mode:3,u_ang:0,u_rand:0,u_shift:[0,0],u_gap:e.n(`gap`)/100}}]},{type:`repeat`,label:`Repeat`,category:`Tiles & Repeat`,description:`Duplicates content multiple times, each copy offset, rotated and scaled a bit more.`,props:[a(`count`,`Copies`,5,1,60,{step:1}),d(`offset`,`Offset per copy`,[40,0]),s(`rotation`,`Rotation per copy`,0),o(`scale`,`Scale per copy`,100,10,200),o(`fade`,`Opacity falloff`,15),f(`order`,`Copies are`,[`Behind`,`In front`])],apply:e=>{let t=Math.round(e.n(`count`)),[n,r]=e.v(`offset`),i=[e.lb.x+e.lb.w/2,e.lb.y+e.lb.h/2],a=[];for(let o=1;o<=t;o++){let t=(e.n(`scale`)/100)**o,s=new DOMMatrix().translate(i[0]+n*o,i[1]+r*o).rotate(e.n(`rotation`)*o).scale(t,t).translate(-i[0],-i[1]);a.push({m:Y(e,s),alpha:(1-e.n(`fade`)/100)**o})}let o=e.o(`order`)===0;J(e,o?a.reverse():a,o?`behind`:`front`)}},{type:`linearRepeat`,label:`Linear Repeat`,category:`Tiles & Repeat`,description:`Repeats a layer in a line.`,props:[a(`count`,`Count`,5,1,60,{step:1}),c(`distance`,`Spacing`,150,4e3),s(`angle`,`Direction`,0),o(`scaleEnd`,`End scale`,100,0,300),o(`opacityEnd`,`End opacity`,100),f(`align`,`Alignment`,[`Centered`,`From layer`])],apply:e=>{let t=Math.max(1,Math.round(e.n(`count`))),n=Math.cos(e.n(`angle`)*m)*e.n(`distance`),r=Math.sin(e.n(`angle`)*m)*e.n(`distance`),i=[e.lb.x+e.lb.w/2,e.lb.y+e.lb.h/2],a=e.o(`align`)===0?-(t-1)/2:0,o=[];for(let s=0;s<t;s++){let c=t>1?s/(t-1):0,l=X(1,e.n(`scaleEnd`)/100,c),u=new DOMMatrix().translate(i[0]+n*(a+s),i[1]+r*(a+s)).scale(l,l).translate(-i[0],-i[1]);o.push({m:Y(e,u),alpha:X(1,e.n(`opacityEnd`)/100,c)})}J(e,o.reverse(),`none`)}},{type:`radialRepeat`,label:`Radial Repeat`,category:`Tiles & Repeat`,description:`Repeats content around a center in a circular arrangement.`,props:[a(`count`,`Count`,8,1,60,{step:1}),c(`radius`,`Radius`,250,4e3),s(`start`,`Start angle`,-90),a(`arc`,`Arc`,360,1,360,{unit:`°`}),f(`orient`,`Rotate copies`,[`Yes`,`No`]),o(`scale`,`Scale`,100,1,300)],apply:e=>{let t=Math.max(1,Math.round(e.n(`count`))),n=[e.lb.x+e.lb.w/2,e.lb.y+e.lb.h/2],r=e.n(`arc`),i=r>=360?360/t:t>1?r/(t-1):0,a=e.n(`scale`)/100,o=[];for(let r=0;r<t;r++){let t=e.n(`start`)+i*r,s=new DOMMatrix().translate(n[0]+Math.cos(t*m)*e.n(`radius`),n[1]+Math.sin(t*m)*e.n(`radius`)).rotate(e.o(`orient`)===0?t+90:0).scale(a,a).translate(-n[0],-n[1]);o.push({m:Y(e,s),alpha:1})}J(e,o,`none`)}},{type:`gridRepeat`,label:`Grid Repeat`,category:`Tiles & Repeat`,description:`Repeats content in a grid arrangement.`,props:[a(`cols`,`Columns`,3,1,30,{step:1}),a(`rows`,`Rows`,3,1,30,{step:1}),d(`gap`,`Gap`,[20,20]),o(`scale`,`Scale`,100,1,300),f(`stagger`,`Layout`,[`Grid`,`Staggered rows`])],apply:e=>{let t=Math.max(1,Math.round(e.n(`cols`))),n=Math.max(1,Math.round(e.n(`rows`))),[r,i]=e.v(`gap`),a=e.n(`scale`)/100,o=e.lb.w*a+r,s=e.lb.h*a+i,c=[e.lb.x+e.lb.w/2,e.lb.y+e.lb.h/2],l=[];for(let r=0;r<n;r++)for(let i=0;i<t;i++){let u=e.o(`stagger`)===1&&r%2?o/2:0,d=new DOMMatrix().translate(c[0]+(i-(t-1)/2)*o+u,c[1]+(r-(n-1)/2)*s).scale(a,a).translate(-c[0],-c[1]);l.push({m:Y(e,d),alpha:1})}J(e,l,`none`)}},{type:`scatterRepeat`,label:`Scatter Repeat`,category:`Tiles & Repeat`,description:`Repeats copies of content with scattered placement.`,props:[a(`count`,`Count`,12,1,100,{step:1}),d(`spread`,`Spread`,[600,400]),o(`scaleVar`,`Scale variation`,40),a(`rotVar`,`Rotation variation`,45,0,180,{unit:`°`}),o(`opacityVar`,`Opacity variation`,30),a(`seed`,`Random seed`,1,0,9999,{step:1}),a(`drift`,`Drift speed`,0,0,200)],apply:e=>{let t=Cn(Math.round(e.n(`seed`))*7919+13),[n,r]=e.v(`spread`),i=[e.lb.x+e.lb.w/2,e.lb.y+e.lb.h/2],a=[];for(let o=0;o<Math.round(e.n(`count`));o++){let o=(t()-.5)*n,s=(t()-.5)*r,c=1+(t()-.5)*2*(e.n(`scaleVar`)/100),l=(t()-.5)*2*e.n(`rotVar`),u=1-t()*(e.n(`opacityVar`)/100),d=e.n(`drift`)*e.local,f=t()*Math.PI*2,p=new DOMMatrix().translate(i[0]+o+Math.cos(f)*d,i[1]+s+Math.sin(f)*d).rotate(l).scale(Math.max(.01,c)).translate(-i[0],-i[1]);a.push({m:Y(e,p),alpha:u})}J(e,a,`none`)}},{type:`repeatAlongPath`,label:`Repeat Along Path`,category:`Tiles & Repeat`,description:`Repeats objects along a path (pick a shape or drawing layer as the path).`,props:[a(`count`,`Count`,10,1,100,{step:1}),o(`start`,`Start`,0),o(`end`,`End`,100),o(`offset`,`Offset (animate me)`,0,-1e3,1e3),f(`align`,`Align to path`,[`Yes`,`No`]),o(`scale`,`Scale`,100,1,300)],refs:[{key:`path`,label:`Path layer`,hint:`A shape or drawing layer (it can be hidden). Default: a circle.`}],apply:e=>{let t=e.refPath(`path`),n=e.toBuf([e.lb.x+e.lb.w/2,e.lb.y+e.lb.h/2]);if(!t||t.length<2){let r=Math.min(e.lb.w,e.lb.h)*1.2*e.lpx;t=Array.from({length:97},(e,t)=>[n[0]+Math.cos(t/96*Math.PI*2)*r,n[1]+Math.sin(t/96*Math.PI*2)*r])}let r=[0];for(let e=1;e<t.length;e++)r.push(r[e-1]+Math.hypot(t[e][0]-t[e-1][0],t[e][1]-t[e-1][1]));let i=r[r.length-1]||1,a=e=>{let n=(e%1+1)%1*i,a=1;for(;a<r.length-1&&r[a]<n;)a++;let o=(n-r[a-1])/Math.max(1e-6,r[a]-r[a-1]),[s,c]=t[a-1],[l,u]=t[a];return{p:[s+(l-s)*o,c+(u-c)*o],ang:Math.atan2(u-c,l-s)}},o=Math.max(1,Math.round(e.n(`count`))),s=e.n(`scale`)/100,c=e.n(`start`)/100,l=e.n(`end`)/100,u=Math.hypot(t[0][0]-t[t.length-1][0],t[0][1]-t[t.length-1][1])<2,d=[];for(let t=0;t<o;t++){let r=o>1?t/(u&&l-c>=1?o:o-1):0,i=c+(l-c)*r+e.n(`offset`)/100,{p:f,ang:p}=a(u?i:Math.min(.9999,Math.max(0,i))),m=new DOMMatrix().translate(f[0],f[1]).rotate(e.o(`align`)===0?p*180/Math.PI:0).scale(s,s).translate(-n[0],-n[1]);d.push({m,alpha:1})}J(e,d,`none`)}}],Tn=`
uniform float u_prog; uniform float u_block; uniform float u_soft;
void main() {
  vec4 o = tex(v_uv);
  vec2 id = floor(lp() / max(u_block, 1.0));
  float r = hash(id + u_seed);
  float t = u_prog * (1.0 + u_soft);
  gl_FragColor = o * smoothstep(t - u_soft, t + 0.0001, r);
}`,En=`
uniform float u_prog; uniform float u_size; uniform float u_soft; uniform vec4 u_edge; uniform float u_ew;
void main() {
  vec4 o = tex(v_uv);
  float n = fbm(lp() / max(u_size, 1.0), 4.0);
  n = clamp((n - 0.2) / 0.6, 0.0, 1.0);
  float t = u_prog * (1.0 + u_soft + u_ew) - u_soft;
  float a = smoothstep(t, t + u_soft + 0.0001, n);
  float e = smoothstep(t - u_ew, t, n) * (1.0 - a) * step(0.0001, u_ew);
  vec4 glow = vec4(u_edge.rgb, 1.0) * u_edge.a * e * o.a;
  gl_FragColor = o * a + glow;
}`,Dn=`
uniform float u_prog; uniform vec2 u_c; uniform float u_start; uniform float u_feather; uniform float u_dir;
void main() {
  vec4 o = tex(v_uv);
  vec2 d = lp() - u_c;
  float a = fract((atan(d.y, d.x) - u_start) / TAU);
  if (u_dir > 0.5 && u_dir < 1.5) a = 1.0 - a;
  if (u_dir > 1.5) a = 1.0 - abs(a * 2.0 - 1.0);
  float t = u_prog * (1.0 + u_feather) - u_feather;
  gl_FragColor = o * smoothstep(t, t + u_feather + 0.0001, a);
}`,On=`
uniform float u_prog; uniform vec2 u_dir; uniform float u_feather;
void main() {
  vec4 o = tex(v_uv);
  float span = abs(u_lb.z * u_dir.x) + abs(u_lb.w * u_dir.y);
  float s = dot(lp() - lcenter(), u_dir) / max(span, 1.0) + 0.5;
  float t = u_prog * (1.0 + u_feather) - u_feather;
  gl_FragColor = o * smoothstep(t, t + u_feather + 0.0001, s);
}`,kn=[{type:`blockDissolve`,label:`Block Dissolve`,category:`Transition`,description:`Breaks an image into blocks that disappear.`,props:[o(`progress`,`Transition (animate me)`,50),c(`block`,`Block size`,24,500),o(`softness`,`Softness`,5,0,100)],passes:e=>[{frag:Tn,u:{u_prog:e.n(`progress`)/100,u_block:Math.max(1,e.n(`block`)),u_soft:e.n(`softness`)/100}}]},{type:`dissolve`,label:`Dissolve`,category:`Transition`,description:`Makes an image burn or break away into disappearing parts.`,props:[o(`progress`,`Transition (animate me)`,50),c(`size`,`Pattern size`,80,1e3),o(`softness`,`Softness`,5,0,100),l(`edge`,`Edge glow`,`#ff9a3d`),o(`edgeWidth`,`Edge width`,6,0,50)],passes:e=>[{frag:En,u:{u_prog:e.n(`progress`)/100,u_size:e.n(`size`),u_soft:e.n(`softness`)/100,u_edge:e.c(`edge`),u_ew:e.n(`edgeWidth`)/100}}]},{type:`radialWipe`,label:`Radial Wipe`,category:`Transition`,description:`Reveals or hides content with a clock-like sweep.`,props:[o(`progress`,`Transition (animate me)`,50),u(`center`,`Center`),s(`start`,`Start angle`,-90),o(`feather`,`Feather`,2,0,50),f(`dir`,`Direction`,[`Clockwise`,`Counter-clockwise`,`Both`])],passes:e=>[{frag:Dn,u:{u_prog:e.n(`progress`)/100,u_c:e.pt(`center`),u_start:e.n(`start`)*m,u_feather:e.n(`feather`)/100,u_dir:e.o(`dir`)}}]},{type:`wipe`,label:`Wipe`,category:`Transition`,description:`Reveals or hides a layer through a directional transition.`,props:[o(`progress`,`Transition (animate me)`,50),s(`angle`,`Direction`,0),o(`feather`,`Feather`,5,0,100)],passes:e=>[{frag:On,u:{u_prog:e.n(`progress`)/100,u_dir:[Math.cos(e.n(`angle`)*m),Math.sin(e.n(`angle`)*m)],u_feather:e.n(`feather`)/100}}]}],An=[{type:`shake`,label:`Auto-Shake`,category:`Motion`,description:`Automatically shakes a layer to create energetic movement.`,props:[c(`amount`,`Amount`,20,500),a(`speed`,`Frequency`,8,0,60),a(`rotation`,`Rotation`,2,0,90,{unit:`°`})],transform:(e,t)=>{let n=i(e.layer.id)+e.seed,a=e.t*e.n(`speed`);t.dx+=r(a,n,2)*e.n(`amount`),t.dy+=r(a,n+50,2)*e.n(`amount`),t.rot+=r(a,n+99,2)*e.n(`rotation`)}},{type:`oscillate`,label:`Oscillate`,category:`Motion`,description:`Makes a layer move back and forth repeatedly.`,props:[f(`wave`,`Wave`,g),s(`angle`,`Direction`,0),c(`amplitude`,`Amplitude`,60,2e3),a(`frequency`,`Frequency (Hz)`,1,0,30,{step:.05}),a(`phase`,`Phase`,0,-360,360,{unit:`°`})],transform:(e,t)=>{let n=h(e.o(`wave`),e.local*e.n(`frequency`)+e.n(`phase`)/360)*e.n(`amplitude`);t.dx+=Math.cos(e.n(`angle`)*m)*n,t.dy+=Math.sin(e.n(`angle`)*m)*n}},{type:`pulseSize`,label:`Pulse Size`,category:`Motion`,description:`Makes a layer repeatedly grow and shrink.`,props:[f(`wave`,`Wave`,g),o(`amount`,`Amount`,15,0,200),a(`frequency`,`Frequency (Hz)`,1.5,0,30,{step:.05}),a(`phase`,`Phase`,0,-360,360,{unit:`°`})],transform:(e,t)=>{let n=1+e.n(`amount`)/100*(.5+.5*h(e.o(`wave`),e.local*e.n(`frequency`)+e.n(`phase`)/360));t.sx*=n,t.sy*=n}},{type:`spin`,label:`Spin`,category:`Motion`,description:`Rotates the layer continuously.`,props:[a(`speed`,`Speed (°/s)`,90,-3600,3600)],transform:(e,t)=>{t.rot+=e.n(`speed`)*e.local}},{type:`swing`,label:`Swing`,category:`Motion`,description:`Animates a layer with swinging movement (set the anchor at the pivot).`,props:[a(`amplitude`,`Swing angle`,20,0,180,{unit:`°`}),a(`frequency`,`Frequency (Hz)`,1,0,20,{step:.05}),o(`damping`,`Damping`,0),a(`phase`,`Phase`,0,-360,360,{unit:`°`})],transform:(e,t)=>{let n=Math.exp(-(e.n(`damping`)/100)*3*e.local);t.rot+=Math.sin((e.local*e.n(`frequency`)+e.n(`phase`)/360)*Math.PI*2)*e.n(`amplitude`)*n}},{type:`randomJitter`,label:`Random Jitter`,category:`Motion`,description:`Adds irregular, random jumps in position, rotation and size.`,props:[c(`amount`,`Position jitter`,10,500),a(`rotation`,`Rotation jitter`,3,0,180,{unit:`°`}),o(`scale`,`Scale jitter`,0,0,100),a(`speed`,`Jumps / sec`,12,0,60),a(`seed`,`Random seed`,1,0,9999,{step:1})],transform:(e,n)=>{let r=Math.floor(e.local*e.n(`speed`)),a=i(e.layer.id)+e.n(`seed`)*13.1,o=e=>t(r*3.17+e,a)*2-1;n.dx+=o(1)*e.n(`amount`),n.dy+=o(2)*e.n(`amount`),n.rot+=o(3)*e.n(`rotation`);let s=1+o(4)*(e.n(`scale`)/100);n.sx*=s,n.sy*=s}},{type:`flipLayer`,label:`Flip Layer`,category:`Motion`,description:`Flips a layer to create a mirrored orientation.`,props:[f(`axis`,`Flip`,[`Horizontal`,`Vertical`,`Both`])],transform:(e,t)=>{let n=e.o(`axis`);(n===0||n===2)&&(t.sx*=-1),(n===1||n===2)&&(t.sy*=-1)}},{type:`moveAlongPath`,label:`Move Along Path`,category:`Motion`,description:`Animates a layer along a path — pick a shape or drawing layer as the path.`,props:[o(`progress`,`Progress (animate me)`,0,-1e3,1e3),f(`orient`,`Orient along path`,[`Yes`,`No`]),a(`rotation`,`Extra rotation`,0,-360,360,{unit:`°`}),a(`speed`,`Auto speed (loops/s)`,0,-10,10,{step:.05})],refs:[{key:`path`,label:`Path layer`,hint:`A shape or drawing layer (it can be hidden)`}],transform:()=>{}},{type:`blink`,label:`Blink`,category:`Motion`,description:`Makes a layer flash on and off.`,props:[a(`frequency`,`Blinks / sec`,2,0,30,{step:.05}),o(`duty`,`Time visible`,50,1,99),o(`softness`,`Softness`,0,0,100),o(`low`,`Off opacity`,0)],opacity:e=>{let t=e.local*e.n(`frequency`)%1,n=e.n(`duty`)/100,r=e.n(`softness`)/100*.25,i;i=r<=0?+(t<n):Math.min(Z(0,r,t),1-Z(n-r,n,t));let a=e.n(`low`)/100;return a+(1-a)*i}},{type:`flicker`,label:`Flicker`,category:`Motion`,description:`Creates rapid random changes in visibility.`,props:[o(`amount`,`Amount`,60),a(`speed`,`Flickers / sec`,15,0,60),o(`chance`,`Flicker chance`,40)],opacity:e=>{let n=Math.floor(e.local*e.n(`speed`));return t(n*1.37+5,i(e.layer.id))>e.n(`chance`)/100?1:1-e.n(`amount`)/100*t(n*2.11+9,i(e.layer.id))}},{type:`pulseOpacity`,label:`Pulse Opacity`,category:`Motion`,description:`Makes opacity repeatedly increase and decrease.`,props:[f(`wave`,`Wave`,g),o(`amount`,`Amount`,60),a(`frequency`,`Frequency (Hz)`,1,0,30,{step:.05}),a(`phase`,`Phase`,0,-360,360,{unit:`°`})],opacity:e=>1-e.n(`amount`)/100*(.5+.5*h(e.o(`wave`),e.local*e.n(`frequency`)+e.n(`phase`)/360))},{type:`fadeInOut`,label:`Fade In/Out`,category:`Motion`,description:`Gradually fades a layer in at its start and out at its end.`,props:[a(`in`,`Fade in (s)`,.5,0,30,{step:.05}),a(`out`,`Fade out (s)`,.5,0,30,{step:.05})],opacity:e=>{let t=1;return e.n(`in`)>0&&(t*=Math.min(1,Math.max(0,e.local/e.n(`in`)))),e.n(`out`)>0&&(t*=Math.min(1,Math.max(0,(e.dur-e.local)/e.n(`out`)))),t}},{type:`timeQuantization`,label:`Time Quantization`,category:`Motion`,description:`Reduces temporal smoothness to create stepped or choppy motion (stop-motion look).`,props:[a(`fps`,`Frame rate`,8,1,60,{step:1})],time:e=>e.layer.start+Math.floor(e.local*e.n(`fps`)+1e-6)/Math.max(1,e.n(`fps`))},{type:`echo`,label:`Echo Keyframes`,category:`Motion`,description:`Creates repeated visual echoes (trails) from the layer’s animation.`,props:[a(`count`,`Echoes`,5,1,30,{step:1}),a(`delay`,`Delay (s)`,.06,.01,2,{step:.01}),o(`start`,`Starting intensity`,60),o(`decay`,`Decay`,70),f(`order`,`Echoes are`,[`Behind`,`In front`])],render:`echo`}];function Z(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e||1)));return r*r*(3-2*r)}var jn=[{type:`drawingProgress`,label:`Drawing Progress`,category:`Shape`,description:`Animates a drawing or stroke as it is gradually revealed (text layers reveal letter by letter).`,props:[o(`progress`,`Progress (animate me)`,50),o(`start`,`Start`,0)],shape:e=>({progress:[e.n(`start`)/100,e.n(`progress`)/100]}),text:e=>({reveal:e.n(`progress`)})},{type:`strokeColor`,label:`Stroke Color`,category:`Shape`,description:`Changes the color of a shape or text outline (turns the stroke on).`,props:[l(`color`,`Stroke color`,`#ffcc00`),c(`width`,`Width (0 = keep)`,0,200)],shape:e=>{let[t,n,r,i]=e.c(`color`),a=e=>Math.round(e*255).toString(16).padStart(2,`0`);return{strokeColor:`#${a(t)}${a(n)}${a(r)}${a(i)}`,strokeWidth:e.n(`width`)>0?e.n(`width`):void 0}}},{type:`strokeTaper`,label:`Stroke Taper`,category:`Shape`,description:`Makes a stroke narrow or widen along its length.`,props:[o(`start`,`Start width`,0,0,300),o(`end`,`End width`,100,0,300),o(`middle`,`Middle width`,100,0,300)],shape:e=>({taper:[e.n(`start`)/100,e.n(`end`)/100,e.n(`middle`)/100]})}],Mn=[{type:`textProgress`,label:`Text Progress`,category:`Text`,description:`Reveals text progressively, letter by letter.`,props:[o(`progress`,`Progress (animate me)`,50),f(`unit`,`Reveal by`,[`Letter`,`Word`,`Line`])],text:e=>({reveal:e.n(`progress`),unit:[`char`,`word`,`line`][e.o(`unit`)]})},{type:`textRandomizer`,label:`Text Randomizer`,category:`Text`,description:`Randomizes text characters, like a decoding display.`,props:[o(`amount`,`Randomness`,50),a(`speed`,`Changes / sec`,15,0,60)],text:e=>({random:{amount:e.n(`amount`)/100,speed:e.n(`speed`)}})},{type:`textSpacing`,label:`Text Spacing`,category:`Text`,description:`Adjusts spacing between text characters.`,props:[a(`spacing`,`Letter spacing`,20,-200,1e3,{unit:`px`})],text:e=>({tracking:e.n(`spacing`)})},{type:`textTransform`,label:`Text Transform`,category:`Text`,description:`Moves, rotates and scales characters within a range — animate the range for kinetic text.`,props:[{key:`offset`,label:`Position`,kind:`vec2`,def:[0,-40],unit:`px`},s(`rotation`,`Rotation`,0),o(`scale`,`Scale`,100,0,500),o(`opacity`,`Opacity`,100),o(`rangeStart`,`Range start`,0),o(`rangeEnd`,`Range end`,100),o(`falloff`,`Smoothness`,30),a(`stagger`,`Wave`,0,0,10,{step:.1})],text:e=>{let[t,n]=e.v(`offset`),r=e.n(`rangeStart`)/100,i=e.n(`rangeEnd`)/100,a=Math.max(1e-4,e.n(`falloff`)/100),o=e.n(`stagger`);return{glyph:(s,c)=>{let l=c>1?s/(c-1):0,u=Math.min(r,i),d=Math.max(r,i),f=Math.min(Z(u-a,u,l),1-Z(d,d+a,l));return u<=0&&(f=Math.max(f,l<=d?1-Z(d,d+a,l):0)),o>0&&(f*=.5+.5*Math.sin(e.local*o*Math.PI*2-s*.6)),{dx:t*f,dy:n*f,rot:e.n(`rotation`)*f,scale:1+(e.n(`scale`)/100-1)*f,alpha:1+(e.n(`opacity`)/100-1)*f}}}}},{type:`countUpDown`,label:`Count Up/Down`,category:`Text`,description:`Displays a number that counts up or down. On text layers, “#” in the text is replaced by the number.`,props:[a(`from`,`From`,0,-1e9,1e9),a(`to`,`To`,100,-1e9,1e9),a(`decimals`,`Decimals`,0,0,6,{step:1}),f(`ease`,`Easing`,[`Linear`,`Ease out`,`Ease in-out`]),f(`grouping`,`Thousands separator`,[`None`,`1,000`,`1 000`],1),a(`duration`,`Duration (s, 0 = layer)`,0,0,3600)],text:(e,t)=>({text:Q(t,Nn(e))})},{type:`timecode`,label:`Timecode`,category:`Text`,description:`Displays a timecode counter. On text layers, “#” in the text is replaced by the timecode.`,props:[f(`format`,`Format`,[`HH:MM:SS:FF`,`MM:SS`,`MM:SS.ms`,`Seconds`,`Frames`]),a(`offset`,`Start at (s)`,0,-86400,86400),f(`source`,`Time`,[`Composition`,`Layer`])],text:(e,t)=>({text:Q(t,Pn(e.o(`source`)?e.local:e.t,e.n(`offset`),e.o(`format`),e.fps))})}];function Q(e,t){return e.includes(`#`)?e.replace(/#/g,t):t}function Nn(e){let t=e.n(`duration`)>0?e.n(`duration`):e.dur,n=Math.min(1,Math.max(0,e.local/Math.max(1e-4,t))),r=e.o(`ease`);r===1&&(n=1-(1-n)**3),r===2&&(n=n<.5?4*n*n*n:1-(-2*n+2)**3/2);let i=e.n(`from`)+(e.n(`to`)-e.n(`from`))*n,a=Math.round(e.n(`decimals`)),o=Math.abs(i).toFixed(a),s=e.o(`grouping`);if(s){let[e,t]=o.split(`.`);o=e.replace(/\B(?=(\d{3})+(?!\d))/g,s===1?`,`:` `)+(t?`.${t}`:``)}return(i<0?`-`:``)+o}function Pn(e,t,n,r){let i=Math.max(0,e+t),a=e=>String(Math.floor(e)).padStart(2,`0`),o=Math.floor(i/3600),s=Math.floor(i%3600/60),c=Math.floor(i%60),l=Math.floor((i-Math.floor(i))*r+1e-6);switch(n){case 1:return`${a(s+o*60)}:${a(c)}`;case 2:return`${a(s+o*60)}:${a(c)}.${String(Math.floor(i%1*1e3)).padStart(3,`0`)}`;case 3:return i.toFixed(2);case 4:return String(Math.floor(i*r+1e-6));default:return`${a(o)}:${a(s)}:${a(c)}:${a(l)}`}}var $=[...de,...Pe,...st,...mt,...Pt,...Xt,...un,...wn,...kn,...yn,...An,...Mn,...jn],Fn=Object.fromEntries($.map(e=>[e.type,e])),In=[`Blur & Sharpen`,`Glow & Light`,`Color`,`Keying & Matte`,`Distort`,`Generate`,`Stylize`,`Tiles & Repeat`,`Transition`,`3D & Perspective`,`Motion`,`Text`,`Shape`],Ln=e=>!!e&&(!!e.passes||!!e.apply),Rn=e({EFFECT_DEFS:()=>zn,EFFECT_LIST:()=>Bn}),zn=Fn,Bn=$;export{Fn as a,t as c,In as i,i as l,Bn as n,Ln as o,Rn as r,r as s,zn as t};