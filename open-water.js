// src/school.ts
var TURN = 7;
function stepSchool(s, animals, dt, random) {
  const k = KINDS[s.kind];
  const fish = s.fish;
  if (fish.length === 0) return;
  const bl = k.length;
  const near2 = bl * 0.8;
  const along = bl * 2.5;
  const around = bl * 3;
  const { x: cx, y: cy } = middleOf(fish);
  const threats = [];
  for (const o of animals) {
    if (o === s || KINDS[o.kind].plan === "school") continue;
    const ko = KINDS[o.kind];
    if (Math.hypot(o.x - cx, o.y - cy) > ko.length * 1.3 + 500) continue;
    for (const c of discsOf(o)) threats.push({ x: c.x, y: c.y, r: c.r + bl * 1.5, depth: o.depth });
    threats.push({ x: o.x + Math.cos(o.heading) * o.speed * 0.5, y: o.y + Math.sin(o.heading) * o.speed * 0.5, r: ko.reach * 0.7 + bl * 2, depth: o.depth });
  }
  if (Math.hypot(s.x - cx, s.y - cy) > bl * 5) {
    s.pace = Math.min(s.pace, 0.6);
    s.paceFor = 0.3;
  }
  const cruise = Math.max(s.speed, k.speed * 0.6);
  const next = fish.map((f) => {
    let sx = 0;
    let sy = 0;
    let ax = 0;
    let ay = 0;
    let n = 0;
    let mx = 0;
    let my = 0;
    let m = 0;
    for (const g of fish) {
      if (g === f) continue;
      const dx = g.x - f.x;
      const dy = g.y - f.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > around * around) continue;
      mx += g.x;
      my += g.y;
      m += 1;
      if (d2 > along * along) continue;
      ax += g.vx;
      ay += g.vy;
      n += 1;
      if (d2 > near2 * near2 || d2 === 0) continue;
      const d = Math.sqrt(d2);
      sx -= dx / d * (1 - d / near2);
      sy -= dy / d * (1 - d / near2);
    }
    let wx = 0;
    let wy = 0;
    if (n > 0) {
      const a = Math.hypot(ax, ay) || 1;
      wx += ax / a * 1;
      wy += ay / a * 1;
    }
    if (m > 0) {
      const tx = mx / m - f.x;
      const ty = my / m - f.y;
      const t = Math.hypot(tx, ty) || 1;
      wx += tx / t * 0.35;
      wy += ty / t * 0.35;
    }
    wx += sx * 2.2;
    wy += sy * 2.2;
    const lx = s.x - f.x;
    const ly = s.y - f.y;
    const l = Math.hypot(lx, ly) || 1;
    const stray = Math.min(1.6, Math.max(0, (l - bl * 1.2) / (bl * 3)));
    wx += Math.cos(s.heading) * 0.45 + lx / l * stray;
    wy += Math.sin(s.heading) * 0.45 + ly / l * stray;
    let fear = 0;
    const fd = fishDepth(s, f);
    for (const c of threats) {
      if (Math.abs(fd - c.depth) >= APART) continue;
      const dx = f.x - c.x;
      const dy = f.y - c.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d >= c.r) continue;
      const push = 1 - d / c.r;
      wx += dx / d * push * 6;
      wy += dy / d * push * 6;
      fear = Math.max(fear, push);
    }
    const heading = Math.atan2(f.vy, f.vx);
    const want = Math.atan2(wy, wx);
    const turn = Math.max(-TURN * dt, Math.min(TURN * dt, turnTo(heading, want)));
    const target = cruise * (1 + fear * (k.sprint - 1)) * (0.95 + random() * 0.1);
    const was = Math.hypot(f.vx, f.vy);
    const speed = was + (target - was) * Math.min(1, dt * (target > was ? 6 : 1.5));
    const h = heading + turn;
    const vx = Math.cos(h) * speed;
    const vy = Math.sin(h) * speed;
    return { x: f.x + vx * dt, y: f.y + vy * dt, vx, vy, swum: f.swum + speed * dt, turn: turn / dt, deep: f.deep };
  });
  s.fish = next;
}

// src/sim.ts
var M = 80;
var shark = { plan: "shark", trunk: 0.8, sway: 0.05, surge: 0, whim: 1, stay: [30, 90] };
var cetacean = { plan: "cetacean", widest: 0, snout: 0, fin: 0, trunk: 0.9, sway: 4e-3, surge: 0, stay: [25, 80] };
var KINDS = [
  // Great white, 4.5 m: heavy and spindle-shaped, a rounded conical snout, long sickle pectorals.
  { ...shark, name: "white", length: 4.5 * M, girth: 40, widest: 0.33, snout: 0.62, fin: 83, reach: 125, speed: 62, beat: 2.6, turn: 0.6, sprint: 2.3, prey: ["blacktip", "dolphin", "turtle"], levels: [1, 2, 3] },
  // Great hammerhead, 4 m: the cephalofoil on a body already thick right behind it, short pectorals.
  { ...shark, name: "hammer", length: 4 * M, girth: 24, widest: 0.34, snout: 0.5, fin: 44, reach: 80, speed: 86, beat: 2, turn: 0.6, sprint: 2.3, hammer: true, prey: ["blacktip", "jacks"], levels: [2, 3] },
  // Tiger, 3.8 m: a broad blunt head, almost square from above, dark bars across the back. The turtles' hunter.
  { ...shark, name: "tiger", length: 3.8 * M, girth: 27, widest: 0.3, snout: 0.5, fin: 53, reach: 85, speed: 74, beat: 2.2, turn: 0.6, sprint: 2.3, prey: ["turtle", "blacktip", "jacks"], levels: [1, 2, 3] },
  // Blacktip, 1.6 m: slender and quick, a rounded snout, black-tipped fins.
  { ...shark, name: "blacktip", length: 1.6 * M, girth: 10, widest: 0.32, snout: 0.6, fin: 23, reach: 36, speed: 100, beat: 0.9, turn: 0.6, sprint: 2.3, whim: 1.3, prey: [], levels: [1, 2] },
  // Blue whale, 24 m: long and slender, a broad flat U-shaped head, a small fin far back, flukes a quarter its
  // length across. It barely turns; it passes through.
  { ...cetacean, name: "blue", length: 24 * M, girth: 0.06 * 24 * M, profile: [[0, 0.45], [0.05, 0.78], [0.15, 0.93], [0.35, 1], [0.6, 0.82], [0.8, 0.42], [0.9, 0.18]], reach: 330, speed: 128, beat: 6, turn: 0.8, sprint: 1.4, whim: 0.2, stay: [4, 14], prey: [], levels: [1, 2] },
  // Orca, 7 m: robust, a blunt rounded head, broad paddle flippers.
  { ...cetacean, name: "orca", length: 7 * M, girth: 0.09 * 7 * M, profile: [[0, 0.4], [0.06, 0.8], [0.25, 1], [0.5, 0.9], [0.75, 0.45], [0.9, 0.17]], reach: 135, speed: 120, beat: 1.6, turn: 0.45, sprint: 2.5, whim: 1.2, prey: ["white", "tiger", "hammer", "blacktip", "dolphin", "manta"], levels: [1, 2] },
  // Bottlenose dolphin, 2.7 m: a short beak before the melon, small pointed flippers. Quick and restless.
  { ...cetacean, name: "dolphin", length: 2.7 * M, girth: 0.093 * 2.7 * M, profile: [[0, 0.1], [0.05, 0.28], [0.09, 0.6], [0.3, 1], [0.55, 0.85], [0.78, 0.38], [0.9, 0.15]], reach: 50, speed: 140, beat: 0.8, turn: 0.3, sprint: 2.5, whim: 2.5, prey: ["jacks"], levels: [1, 2] },
  // Green sea turtle, 1.2 m: an oval shell, a small head, long front flippers it flies with, stroke and glide.
  { name: "turtle", plan: "turtle", length: 1.2 * M, girth: 32, widest: 0, snout: 0, fin: 0, profile: [[0, 0.25], [0.1, 0.32], [0.17, 0.8], [0.42, 1], [0.7, 0.75], [0.88, 0.3], [1, 0.05]], reach: 64, speed: 48, beat: 2.4, turn: 0.5, trunk: 1, sway: 0, surge: 0.35, sprint: 3, whim: 0.8, stay: [30, 80], prey: [], levels: [1, 2] },
  // Oceanic manta, 5.5 m across: a wide rigid disc, the horn-like cephalic fins in front, a short whip tail. Its
  // wings beat slowly, a wave running back along them.
  { name: "manta", plan: "ray", length: 4.1 * M, girth: 2.75 * M, widest: 0, snout: 0, fin: 0, profile: [[0, 0.4], [0.06, 0.45], [0.33, 1], [0.58, 0.12], [0.63, 0.04], [1, 0.02]], reach: 2.75 * M + 10, speed: 76, beat: 3, turn: 0.6, trunk: 1, sway: 0.01, surge: 0.12, sprint: 1.7, whim: 0.7, stay: [30, 80], prey: [], levels: [1, 2] },
  // Giant squid, 8 m with its feeding tentacles: a 2 m mantle with small fins at its tip, huge eyes, eight arms
  // trailing and the two long tentacles beyond. It jets mantle first, in pulses.
  { name: "squid", plan: "squid", length: 8 * M, girth: 22, widest: 0, snout: 0, fin: 0, profile: [[0, 0.35], [0.03, 1.1], [0.07, 0.8], [0.15, 1], [0.25, 0.9], [0.3, 1.05], [0.36, 0.85], [0.45, 1], [0.52, 0.5], [0.6, 0.18], [1, 0.12]], reach: 42, speed: 40, beat: 2.5, turn: 0.3, trunk: 1, sway: 0.03, surge: 0.6, sprint: 2.5, whim: 0.5, stay: [25, 60], prey: [], levels: [2, 3] },
  // A school of bigeye trevally, 60 cm each, the silver school of every drone shot from above: they keep together and
  // go one way; it parts round anything big and closes again.
  { name: "jacks", plan: "school", length: 0.6 * M, girth: 4, widest: 0, snout: 0, fin: 0, reach: 260, speed: 55, beat: 0.5, turn: 3.5, trunk: 1, sway: 0.1, surge: 0, sprint: 3, whim: 1, stay: [30, 70], prey: [], levels: [1, 2] },
  // Whale shark, 12 m: the biggest fish, broad and flat across the head, a blunt wide mouth, very slow.
  { ...shark, name: "whaleshark", length: 12 * M, girth: 125, widest: 0.3, snout: 0.3, fin: 170, reach: 260, speed: 60, beat: 3, turn: 0.4, sprint: 1.6, whim: 0.3, stay: [40, 90], prey: [], levels: [1, 2] },
  // Humpback whale, 15 m: a stout whale with very broad flippers, slower than the blue.
  { ...cetacean, name: "humpback", length: 15 * M, girth: 0.1 * 15 * M, reach: 0.2 * 15 * M + 10, speed: 110, beat: 4, turn: 0.7, sprint: 1.6, whim: 0.4, stay: [15, 50], prey: [], levels: [1, 2] }
];
var STEP = 10;
var clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
var turnTo = (heading, target) => {
  let d = (target - heading) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
function half(k, behind) {
  const u = behind / k.length;
  if (k.profile !== void 0) {
    const p = k.profile;
    let i = 1;
    while (i < p.length - 1 && p[i][0] < u) i += 1;
    const [u0, w0] = p[i - 1];
    const [u1, w1] = p[i];
    return Math.max(1, k.girth * (w0 + (w1 - w0) * clamp((u - u0) / (u1 - u0 || 1), 0, 1)));
  }
  if (u < k.widest) {
    const x = u / k.widest;
    if (k.hammer === true) return k.girth * (0.62 + 0.38 * Math.sin(x * Math.PI / 2));
    return k.girth * Math.pow(1 - (1 - x) * (1 - x), k.snout);
  }
  const t = Math.min(1, (u - k.widest) / (k.trunk - k.widest));
  return Math.max(1.5, k.girth * (0.11 + 0.89 * Math.pow(1 - t, 1.6)));
}
var strokes = (a) => a.swum / (KINDS[a.kind].speed * KINDS[a.kind].beat);
function poseOf(a) {
  const k = KINDS[a.kind];
  return { x: a.x, y: a.y, fx: Math.cos(a.heading), fy: Math.sin(a.heading), w: half(k, 0), u: 0 };
}
function spineOf(a) {
  const k = KINDS[a.kind];
  const frames = [];
  const phase = strokes(a);
  const spine = k.length * k.trunk;
  let p = a;
  let i = 0;
  let b = a.trail[0];
  let span = b === void 0 ? 0 : Math.hypot(p.x - b.x, p.y - b.y);
  let into = 0;
  for (let behind = 0; behind <= spine + 0.01; behind += STEP / 2) {
    while (b !== void 0 && into > span) {
      into -= span;
      p = b;
      i += 1;
      b = a.trail[i];
      span = b === void 0 ? 0 : Math.hypot(p.x - b.x, p.y - b.y);
    }
    if (b === void 0 || span === 0) break;
    const fx = (p.x - b.x) / span;
    const fy = (p.y - b.y) / span;
    const u = behind / k.length;
    const sway = k.length * k.sway * Math.pow(u, 1.7) * Math.sin(2 * Math.PI * (phase - 0.75 * u));
    frames.push({ x: p.x - fx * into - fy * sway, y: p.y - fy * into + fx * sway, fx, fy, w: half(k, behind), u });
    into += STEP / 2;
  }
  return frames;
}
function discsOf(a) {
  const k = KINDS[a.kind];
  if (k.plan === "school") return a.fish.map((f) => ({ x: f.x, y: f.y, r: k.length }));
  const frames = spineOf(a);
  const discs = frames.filter((_, i) => i % 4 === 0).map((f) => ({ x: f.x, y: f.y, r: Math.max(4, f.w) }));
  const widest = frames.reduce((best, f) => f.w > best.w ? f : best, frames[0] ?? poseOf(a));
  discs.push({ x: widest.x, y: widest.y, r: k.reach });
  const last = frames.at(-1);
  if (last !== void 0 && k.trunk < 1) discs.push({ x: last.x - last.fx * k.length * (1 - k.trunk) * 0.6, y: last.y - last.fy * k.length * (1 - k.trunk) * 0.6, r: k.length * (1 - k.trunk) * 0.6 });
  return discs;
}
function middleOf(fish) {
  let x = 0;
  let y = 0;
  for (const f of fish) {
    x += f.x;
    y += f.y;
  }
  return { x: x / fish.length, y: y / fish.length };
}
function tailOf(a) {
  if (a.fish.length > 0) return middleOf(a.fish);
  const k = KINDS[a.kind];
  let behind = 0;
  let last = a;
  for (const p of a.trail) {
    behind += Math.hypot(p.x - last.x, p.y - last.y);
    last = p;
    if (behind >= k.length * k.trunk) break;
  }
  return last;
}
function createSea(w, h) {
  return { w, h, animals: [], next: 0, gone: -1, atOnce: 4, allowed: new Set(KINDS.map((_, i) => i)) };
}
var depthOf = (level) => (level - 1) / 2;
var sizeOf = (depth) => 1 - 0.2 * depth;
var deepIn = (k, random) => depthOf(k.levels[Math.floor(random() * k.levels.length)]);
var APART = 0.25;
var apart = (a, b) => Math.abs(a.depth - b.depth) >= APART;
var fishDepth = (a, f) => Math.min(1, Math.max(0, a.depth + f.deep));
function make(kind, x, y, heading, to, random) {
  const k = KINDS[kind];
  const trail = [];
  for (let back = STEP; back <= k.length * 1.25; back += STEP) trail.push({ x: x - Math.cos(heading) * back, y: y - Math.sin(heading) * back });
  const a = { kind, x, y, heading, curve: 0, speed: k.speed, pace: 1, paceFor: 0, tight: 0, way: 0, wayFrom: 0, mode: "enter", modeFor: 0, prey: void 0, rest: 8 + random() * 12, to, stay: k.stay[0] + random() * (k.stay[1] - k.stay[0]), age: 0, seen: false, swum: random() * 500, trail, fish: [], depth: deepIn(k, random), dive: deepIn(k, random) };
  if (k.plan === "school") {
    for (let i = 0; i < 160; i += 1) {
      const back = Math.sqrt(random()) * 380;
      const side = (random() - 0.5) * 320;
      a.fish.push({ x: x - Math.cos(heading) * back - Math.sin(heading) * side, y: y - Math.sin(heading) * back + Math.cos(heading) * side, vx: Math.cos(heading) * k.speed, vy: Math.sin(heading) * k.speed, swum: random() * 50, turn: 0, deep: (random() * 2 - 1) * 0.3 });
    }
  }
  return a;
}
function place(sea, kind, random = Math.random) {
  const heading = random() * Math.PI * 2;
  const a = make(kind, sea.w / 2, sea.h / 2, heading, { x: sea.w / 2, y: sea.h / 2 }, random);
  Object.assign(a, { mode: "roam", stay: Infinity, seen: true });
  sea.animals = [a];
  sea.next = Infinity;
  return a;
}
function arrive(sea, random) {
  const here = new Set(sea.animals.map((a) => a.kind));
  const open = KINDS.map((_, i) => i).filter((i) => sea.allowed.has(i) && !here.has(i));
  const kinds = open.length > 1 ? open.filter((i) => i !== sea.gone) : open;
  const kind = kinds[Math.floor(random() * kinds.length)];
  if (kind === void 0) return;
  const k = KINDS[kind];
  const others = sea.animals.filter((o) => KINDS[o.kind].plan !== "school").map((o) => ({ o, discs: discsOf(o) }));
  for (let tries = 0; tries < 8; tries += 1) {
    const edge2 = Math.floor(random() * 4);
    const along = 0.1 + random() * 0.8;
    const off = 20 + k.reach + random() * 120;
    const x = edge2 === 0 ? -off : edge2 === 1 ? sea.w + off : along * sea.w;
    const y = edge2 === 2 ? -off : edge2 === 3 ? sea.h + off : along * sea.h;
    const to = { x: sea.w * (0.2 + random() * 0.6), y: sea.h * (0.2 + random() * 0.6) };
    const heading = Math.atan2(to.y - y, to.x - x);
    const path = [];
    for (let d = -k.length; d <= k.length; d += 40) path.push({ x: x + Math.cos(heading) * d, y: y + Math.sin(heading) * d });
    const clear = others.every(({ o, discs }) => discs.every((c) => path.every((p) => Math.hypot(p.x - c.x, p.y - c.y) > c.r + k.reach + KINDS[o.kind].reach * 0.5)));
    if (!clear) continue;
    const a = make(kind, x, y, heading, to, random);
    sea.animals.push(a);
    sea.next = 2 + random() * 5;
    return;
  }
  sea.next = 0.5;
}
function shift(sea, dx, dy) {
  const move = (p) => {
    p.x += dx;
    p.y += dy;
  };
  for (const a of sea.animals) {
    move(a);
    move(a.to);
    a.trail.forEach(move);
    a.fish.forEach(move);
  }
}
function stepSea(sea, dt, tile, random = Math.random) {
  const inView = (p, margin) => p.x > -margin && p.x < sea.w + margin && p.y > -margin && p.y < sea.h + margin;
  sea.animals = sea.animals.filter((a) => {
    a.age += dt;
    const discs = discsOf(a);
    if (!a.seen && discs.some((c) => inView(c, -c.r * 0.5))) a.seen = true;
    const gone = a.stay < Infinity && (a.seen && discs.every((c) => !inView(c, c.r + tile)) || !a.seen && a.age > 40);
    if (gone) {
      sea.gone = a.kind;
      for (const o of sea.animals) if (o.prey === a) o.prey = void 0;
    }
    return !gone;
  });
  sea.next -= dt;
  if (sea.animals.length < sea.atOnce && sea.next <= 0) arrive(sea, random);
  for (const s of sea.animals) {
    const k = KINDS[s.kind];
    const step = Math.max(1, s.speed * dt);
    const tightest = k.length * k.turn;
    const before = s.curve;
    const steer = (to) => {
      s.curve = turnTo(s.heading, Math.atan2(to.y - s.y, to.x - s.x)) / Math.max(k.length * 0.5, tightest * 0.5);
    };
    s.modeFor -= dt;
    s.paceFor -= dt;
    s.rest -= dt;
    s.stay -= dt;
    if (s.paceFor <= 0) s.pace = 1;
    const chaser = sea.animals.find((o) => o.mode === "chase" && o.prey === s);
    if (chaser !== void 0) {
      const away = Math.atan2(s.y - chaser.y, s.x - chaser.x);
      steer({ x: s.x + Math.cos(away) * 300, y: s.y + Math.sin(away) * 300 });
      s.pace = k.sprint;
      s.paceFor = 0.6;
      if (s.mode === "chase") s.prey = void 0;
      if (s.mode !== "leave") s.mode = "roam";
    } else if (s.mode === "chase") {
      const prey = s.prey;
      const tail = prey === void 0 ? void 0 : tailOf(prey);
      const far = tail === void 0 ? Infinity : Math.hypot(tail.x - s.x, tail.y - s.y);
      if (prey === void 0 || tail === void 0 || s.modeFor <= 0 || far > 760 || !inView(prey, 60)) {
        s.mode = "roam";
        s.prey = void 0;
        s.rest = 18 + random() * 17;
        s.pace = 0.65;
        s.paceFor = 3;
      } else {
        steer(tail);
        const top = 1 + (k.sprint - 1) * 0.6;
        s.pace = far < k.length * 0.5 + 60 ? Math.min(top, prey.speed / k.speed * 0.97) : top;
        s.paceFor = 0.3;
      }
    } else if (s.mode === "leave") {
      s.curve *= 0.98;
    } else if (s.mode === "enter" || s.mode === "return") {
      steer(s.to);
      if (s.x > 160 && s.x < sea.w - 160 && s.y > 140 && s.y < sea.h - 140) s.mode = "roam";
    } else if (s.stay <= 0) {
      s.mode = "leave";
    } else if (!inView(s, 110)) {
      s.mode = "return";
      s.to = { x: sea.w * (0.15 + random() * 0.7), y: sea.h * (0.2 + random() * 0.6) };
    } else {
      if (s.tight > 0) {
        s.tight -= step;
      } else {
        const scale = step / 20;
        s.curve = clamp(s.curve * Math.pow(0.9, scale) + (random() - 0.5) * 0.65 * Math.sqrt(scale) / tightest, -0.8 / tightest, 0.8 / tightest);
        if (random() < 7e-3 * scale * k.whim) {
          s.curve = (random() < 0.5 ? -1 : 1) / tightest;
          s.tight = k.length * (0.5 + random());
        }
      }
      if (s.paceFor <= 0) {
        const roll = random();
        if (roll < 0.07 * dt * k.whim) {
          s.pace = 1 + (k.sprint - 1) * (0.5 + random() * 0.5);
          s.paceFor = 1.5 + random() * 1.5;
        } else if (roll < 0.1 * dt * k.whim) {
          s.pace = 0.65;
          s.paceFor = 3 + random() * 2;
        }
      }
      if (s.rest <= 0 && inView(s, 0)) {
        for (const prey of sea.animals) {
          if (!k.prey.includes(KINDS[prey.kind].name)) continue;
          const far = Math.hypot(prey.x - s.x, prey.y - s.y);
          const off = Math.abs(turnTo(s.heading, Math.atan2(prey.y - s.y, prey.x - s.x)));
          if (far < 560 && far > k.length * 0.5 + 100 && off < 1 && Math.abs(turnTo(s.heading, prey.heading)) < 1 && inView(prey, -40) && !sea.animals.some((c) => c.mode === "chase" && c.prey === prey) && random() < 0.8 * dt) {
            s.mode = "chase";
            s.prey = prey;
            s.modeFor = 4 + random() * 3;
            break;
          }
        }
      }
    }
    const hx = Math.cos(s.heading);
    const hy = Math.sin(s.heading);
    const v = Math.max(s.speed, 1);
    const horizon = Math.max(4, k.length * 1.5 / v);
    let lo = Infinity;
    let hi = -Infinity;
    let first = Infinity;
    let clearBy = 0;
    let intoBody = false;
    let giant = false;
    for (const other of sea.animals) {
      const ko = KINDS[other.kind];
      if (other === s || k.plan === "school" || ko.plan === "school" || s.mode === "chase" && s.prey === other || ko.length < k.length * 0.3 || apart(s, other)) continue;
      const big = ko.length > k.length * 2.5;
      const room = k.reach + ko.reach + tile;
      const vo = Math.max(other.speed, 1);
      const pad = room / v;
      const held = (px, py, from, until) => {
        const rx = px - s.x;
        const ry = py - s.y;
        const along = rx * hx + ry * hy;
        const across = ry * hx - rx * hy;
        const t = Math.max(0, along) / v;
        if (Math.abs(across) >= room || along < -room || t > horizon || t < from - pad || t > until + pad) return;
        lo = Math.min(lo, across - room);
        hi = Math.max(hi, across + room);
        first = Math.min(first, t);
        clearBy = Math.max(clearBy, until + pad);
        if (from === 0 && t > 0.3 && ko.length >= k.length * 0.8) intoBody = true;
        if (big) giant = true;
      };
      for (let ahead = 20; ahead <= vo * horizon; ahead += 20) {
        held(other.x + Math.cos(other.heading) * ahead, other.y + Math.sin(other.heading) * ahead, ahead / vo, (ahead + ko.length) / vo);
      }
      held(other.x, other.y, 0, ko.length / vo);
      let behind = 0;
      let since2 = 0;
      let last = other;
      for (const p of other.trail) {
        const d = Math.hypot(p.x - last.x, p.y - last.y);
        behind += d;
        since2 += d;
        last = p;
        if (behind > ko.length) break;
        if (since2 < 20) continue;
        since2 = 0;
        held(p.x, p.y, 0, (ko.length - behind) / vo);
      }
    }
    if (lo < 0 && hi > 0) {
      if (s.way === 0) {
        s.way = hi < -lo ? 1 : -1;
        s.wayFrom = s.heading;
      }
      const shift2 = s.way > 0 ? hi : lo;
      const swerve = Math.atan2(shift2 / Math.max(first, 0.8), v);
      const fair = giant ? 1.4 : 0.8;
      const off = turnTo(s.wayFrom, s.heading) * s.way;
      s.curve = off > fair ? 0 : clamp(swerve, -0.6, 0.6) / Math.max(k.length * 0.35, tightest * 0.6);
      s.tight = 0;
      if (giant && chaser === void 0) {
        s.pace = Math.max(s.pace, Math.min(k.sprint, 1.8));
        s.paceFor = 0.5;
      } else if ((Math.abs(swerve) > 0.6 || off > fair) && intoBody && chaser === void 0 && s.mode !== "chase") {
        s.pace = clamp(first / clearBy, 0.35, 1);
        s.paceFor = 0.3;
      }
    } else {
      s.way = 0;
    }
    if (random() < 0.04 * dt) s.dive = deepIn(k, random);
    if (s.mode === "chase" && s.prey !== void 0) s.dive = s.prey.depth;
    s.depth += clamp(s.dive - s.depth, -0.1 * dt, 0.1 * dt);
    const want = k.speed * s.pace;
    s.speed += (want - s.speed) * (1 - Math.exp(-dt / (want > s.speed ? 0.3 : 1)));
    const ease = s.speed * dt / (tightest * Math.max(k.length * 0.15, tightest * 0.3));
    s.curve = clamp(before + clamp(s.curve - before, -ease, ease), -1 / tightest, 1 / tightest);
    const go = s.speed * dt * (1 + k.surge * Math.sin(2 * Math.PI * strokes(s)));
    s.trail.unshift({ x: s.x, y: s.y });
    s.heading += s.curve * go;
    s.x += Math.cos(s.heading) * go;
    s.y += Math.sin(s.heading) * go;
    s.swum += go;
    let length = 0;
    for (let i = 1; i < s.trail.length; i += 1) {
      length += Math.hypot(s.trail[i].x - s.trail[i - 1].x, s.trail[i].y - s.trail[i - 1].y);
      if (length > k.length * 1.25) {
        s.trail.length = i + 1;
        break;
      }
    }
    if (k.plan === "school") stepSchool(s, sea.animals, dt, random);
  }
}

// src/draw/common.ts
var EYE = "#1d1f22";
var at = (f, along, out) => [f.x + f.fx * along - f.fy * out, f.y + f.fy * along + f.fx * out];
function outline(ctx, frames, share) {
  ctx.beginPath();
  frames.forEach((f, i) => {
    const [x, y] = at(f, 0, f.w * share);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const [x, y] = at(frames[i], 0, -frames[i].w * share);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
}
var near = (frames, u) => frames.reduce((best, f) => Math.abs(f.u - u) < Math.abs(best.u - u) ? f : best);

// src/draw/cetacean.ts
var STEP2 = 5;
var WHITE = "#e6e8e6";
function smooth(knots) {
  const h = knots.slice(1).map((k, i) => k[0] - knots[i][0]);
  const s = knots.slice(1).map((k, i) => (k[1] - knots[i][1]) / h[i]);
  const m = knots.map((_, i) => {
    if (i === 0) return s[0];
    if (i === knots.length - 1) return s[i - 1];
    const [s0, s1, h0, h1] = [s[i - 1], s[i], h[i - 1], h[i]];
    return s0 * s1 <= 0 ? 0 : 3 * (h0 + h1) / ((2 * h1 + h0) / s0 + (h1 + 2 * h0) / s1);
  });
  return (x) => {
    let i = 0;
    while (i < knots.length - 2 && x > knots[i + 1][0]) i += 1;
    const [x0, y0] = knots[i];
    const y1 = knots[i + 1][1];
    const t = Math.min(1, Math.max(0, (x - x0) / h[i]));
    const [t2, t3] = [t * t, t * t * t];
    const [hi, m0, m1] = [h[i], m[i], m[i + 1]];
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * hi * m0 + (3 * t2 - 2 * t3) * y1 + (t3 - t2) * hi * m1;
  };
}
function extend(frames, to) {
  const line = [...frames];
  const last = line[line.length - 1];
  const gap = Math.min(8, line.length - 1);
  const before = line[line.length - 1 - gap];
  const turn = Math.atan2(before.fx * last.fy - before.fy * last.fx, before.fx * last.fx + before.fy * last.fy) / gap;
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  let p = last;
  while (line.length * STEP2 < to) {
    p = { x: p.x - p.fx * STEP2, y: p.y - p.fy * STEP2, fx: p.fx * c - p.fy * s, fy: p.fx * s + p.fy * c, w: 0, u: 0 };
    line.push(p);
  }
  return line;
}
var bend = (back, front) => Math.atan2(back.fx * front.fy - back.fy * front.fx, back.fx * front.fx + back.fy * front.fy);
function bez(path, [p0, c1, c2, p1, c3, c4, p2]) {
  path.moveTo(...p0);
  path.bezierCurveTo(...c1, ...c2, ...p1);
  path.bezierCurveTo(...c3, ...c4, ...p2);
  path.closePath();
}
function blob(ctx, x, y, rx, ry, rot) {
  ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}
var mirror = (pts) => pts.map(([u, v]) => [u, -v]);
var TIERS = [
  { n: 36, r: [60, 130], long: [1.2, 2], alpha: 0.11, dark: 0.5 },
  { n: 200, r: [14, 34], long: [1.3, 2.4], alpha: 0.2, dark: 0.45 },
  { n: 280, r: [4, 9], long: [1.1, 2.2], alpha: 0.24, dark: 0.2 }
];
var MOTTLE = (() => {
  let seed = 11;
  const rand = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  return TIERS.map(
    (t) => Array.from({ length: t.n }, () => ({
      u: 0.02 + rand() * 0.93,
      v: (rand() * 2 - 1) * 1.05,
      r: t.r[0] + rand() * (t.r[1] - t.r[0]),
      long: t.long[0] + rand() * (t.long[1] - t.long[0]),
      dark: rand() < t.dark
    }))
  );
})();
var FLUKE_MOTTLE = Array.from({ length: 30 }, (_, i) => ({
  x: 2e-3 + i * 7 % 11 * 55e-4,
  y: (i * 13 % 17 / 8 - 1) * 0.12,
  r: i % 3 === 0 ? 20 : 8,
  dark: i % 4 === 0
}));
function paintBlue(ctx, b) {
  const L2 = b.L;
  ctx.fillStyle = "#5a7385";
  ctx.fill(b.strip(0.03, 0.9, -0.6, 0.6, 0.06));
  ctx.save();
  ctx.clip(b.body);
  ctx.lineWidth = 70;
  ctx.strokeStyle = "rgba(30,46,60,.2)";
  ctx.stroke(b.body);
  TIERS.forEach((tier, i) => {
    const spots = MOTTLE[i].map((m) => {
      const p2 = b.pose(m.u * L2);
      const [x, y] = at(p2, 0, m.v * p2.w);
      return { x, y, rx: m.r * m.long, ry: m.r, rot: Math.atan2(p2.fy, p2.fx), dark: m.dark };
    });
    const layers = i < 2 ? [1, 0.66, 0.33] : [1];
    for (const dark of [false, true]) {
      const a = tier.alpha / layers.length;
      ctx.fillStyle = dark ? `rgba(62,84,100,${a * 1.3})` : `rgba(128,150,165,${a})`;
      for (const grow of layers) {
        ctx.beginPath();
        for (const m of spots) if (m.dark === dark) blob(ctx, m.x, m.y, m.rx * grow, m.ry * grow, m.rot);
        ctx.fill();
      }
    }
  });
  ctx.restore();
  ctx.save();
  ctx.clip(b.flukes);
  for (const dark of [false, true]) {
    ctx.beginPath();
    for (const m of FLUKE_MOTTLE) {
      if (m.dark !== dark) continue;
      const [x, y] = b.fluke(m.x, m.y);
      blob(ctx, x, y, m.r * 1.6, m.r, 0);
    }
    ctx.fillStyle = dark ? "rgba(62,84,100,.22)" : "rgba(128,150,165,.22)";
    ctx.fill();
  }
  ctx.restore();
  ctx.lineCap = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(170,195,210,.13)";
  ctx.beginPath();
  for (let u = 0.012; u <= 0.15; u += 0.01) ctx.lineTo(...at(b.pose(u * L2), 0, 0));
  ctx.stroke();
  ctx.strokeStyle = "rgba(44,62,76,.3)";
  ctx.beginPath();
  for (let u = 0.8; u <= 0.935; u += 0.01) ctx.lineTo(...at(b.pose(u * L2), 0, 0));
  ctx.stroke();
  const p = b.pose(L2 * 0.17);
  ctx.strokeStyle = "rgba(150,176,192,.45)";
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  for (let t = -1; t <= 1.01; t += 0.25) ctx.lineTo(...at(p, 30 - 18 * t * t, 26 * t));
  ctx.stroke();
  ctx.strokeStyle = "#2b3a45";
  ctx.lineWidth = 2.6;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(...at(p, 10, side * 5));
    ctx.lineTo(...at(p, -14, side * 11));
    ctx.stroke();
  }
  ctx.fillStyle = "#41586a";
  ctx.fill(b.blade(0.738, 0.768, 10));
}
var HALF_SADDLE = [
  [0.505, 0],
  [0.52, 0.32],
  [0.55, 0.6],
  [0.6, 0.8],
  [0.655, 0.84],
  [0.7, 0.76],
  [0.73, 0.5],
  [0.765, 0.2],
  [0.78, 0]
];
var SADDLE = [...HALF_SADDLE, ...mirror(HALF_SADDLE.slice(1, -1)).reverse()];
var FLANK = [[0.6, 1.1], [0.62, 0.9], [0.66, 0.72], [0.71, 0.62], [0.76, 0.62], [0.8, 0.78], [0.83, 1.1]];
function paintOrca(ctx, b) {
  const L2 = b.L;
  ctx.fillStyle = "#2b2e33";
  ctx.fill(b.strip(0.03, 0.9, -0.45, 0.45, 0.1));
  ctx.save();
  ctx.clip(b.body);
  ctx.fillStyle = WHITE;
  ctx.fill(b.patch(FLANK));
  ctx.fill(b.patch(mirror(FLANK)));
  ctx.fillStyle = "#5f6469";
  ctx.fill(b.patch(SADDLE));
  ctx.fillStyle = "#8a8f94";
  ctx.fill(b.patch(SADDLE, 0.82));
  const p = b.pose(L2 * 0.15);
  ctx.beginPath();
  for (const side of [-1, 1]) {
    const [x, y] = at(p, 0, side * p.w * 0.9);
    blob(ctx, x, y, 21, 8, Math.atan2(p.fy, p.fx) + side * 0.3);
  }
  ctx.fillStyle = WHITE;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#141517";
  ctx.strokeStyle = "#3a3f45";
  ctx.lineWidth = 1.4;
  const fin = b.blade(0.37, 0.515, 12);
  ctx.stroke(fin);
  ctx.fill(fin);
}
var CAPE = smooth([
  [0, 1],
  [0.05, 0.95],
  [0.075, 0.62],
  [0.12, 0.5],
  [0.3, 0.58],
  [0.5, 0.62],
  [0.7, 0.7],
  [0.85, 0.9],
  [0.95, 1.05]
]);
function paintHumpback(ctx, b) {
  ctx.fillStyle = "#56626a";
  ctx.fill(b.strip(0.02, 0.97, -0.9, 0.9, 0.08));
  ctx.fillStyle = "#44505a";
  ctx.fill(b.strip(0.02, 0.97, -0.55, 0.55, 0.08));
}
function paintDolphin(ctx, b) {
  ctx.fillStyle = "#858d94";
  ctx.fill(b.strip(0.01, 0.98, -0.93, 0.93));
  ctx.fillStyle = "#7d858c";
  ctx.fill(b.strip(0.01, 0.98, -0.8, 0.8));
  ctx.fillStyle = "#656d74";
  ctx.fill(b.strip(0, 0.99, (u) => -CAPE(u) * 1.14, (u) => CAPE(u) * 1.14));
  ctx.fillStyle = "#4f565d";
  ctx.fill(b.strip(0, 0.99, (u) => -CAPE(u), CAPE));
  ctx.fillStyle = "#3b4248";
  ctx.fill(b.blade(0.44, 0.555, 3.6));
}
var LOOKS = {
  // Blue whale, as seen from above in aerial photographs: a sleek body, the head tapering to a pointed snout, widest
  // about halfway, a long slender tail stock, flippers swept back, wide triangular flukes with a shallow notch.
  blue: {
    width: [
      [0, 0.2],
      [0.02, 0.45],
      [0.05, 0.62],
      [0.1, 0.78],
      [0.18, 0.9],
      [0.3, 0.99],
      [0.42, 1],
      [0.55, 0.97],
      [0.66, 0.88],
      [0.76, 0.7],
      [0.84, 0.5],
      [0.9, 0.3],
      [0.94, 0.14],
      [0.96, 0]
    ],
    tail: 0.96,
    skin: "#566f80",
    fin: "#566f80",
    rim: "#8aa1af",
    edge: "#3f5568",
    line: 3,
    flipper: {
      u: 0.235,
      theta: 0.6,
      len: 0.14,
      // A sickle: narrow, the leading edge nearly straight and the trailing edge curving back to a fine point.
      shape: [[-0.05, 0.06], [0.4, 0.18], [0.9, 0.08], [1.02, 0], [0.9, -0.07], [0.4, -0.14], [-0.05, -0.06]]
    },
    root: 0.925,
    // Broad and triangular, the leading edge swept back, the tips rounded off, a shallow notch in the trailing edge.
    flukes: [[0.04, 0], [0.05, 0.022], [0.065, 0.118], [0.056, 0.126], [0.047, 0.132], [-0.012, 0.06], [-0.04, 0.015]],
    pitch: 0.4,
    pivot: 0.68,
    paint: paintBlue
  },
  // Orca: a robust torpedo, a blunt head with no beak, big paddle flippers, broad flukes with a deep notch.
  orca: {
    width: [
      [0, 0],
      [2e-3, 0.18],
      [7e-3, 0.33],
      [0.015, 0.46],
      [0.03, 0.6],
      [0.055, 0.74],
      [0.09, 0.86],
      [0.14, 0.95],
      [0.2, 0.99],
      [0.27, 1],
      [0.34, 1],
      [0.42, 0.97],
      [0.5, 0.9],
      [0.58, 0.78],
      [0.66, 0.62],
      [0.74, 0.48],
      [0.82, 0.36],
      [0.88, 0.29],
      [0.915, 0.25],
      [0.94, 0.2],
      [0.955, 0.08],
      [0.96, 0]
    ],
    tail: 0.96,
    skin: "#222428",
    fin: "#202225",
    edge: "#3c4147",
    line: 2.4,
    flipper: {
      u: 0.18,
      theta: 1,
      len: 0.16,
      shape: [[-0.05, 0.3], [0.3, 0.4], [0.98, 0.32], [1.04, 0], [0.98, -0.32], [0.45, -0.4], [-0.05, -0.3]]
    },
    root: 0.915,
    flukes: [[0.04, 0], [0.052, 0.03], [0.075, 0.09], [0.082, 0.135], [0.048, 0.125], [-0.015, 0.08], [-0.035, 0.024]],
    pitch: 0.5,
    pivot: 0.62,
    paint: paintOrca
  },
  // Bottlenose dolphin: a short beak ahead of a rounded melon, small sickle flippers, small flukes.
  dolphin: {
    width: [
      [0, 0],
      [4e-3, 0.06],
      [0.015, 0.095],
      [0.035, 0.125],
      [0.055, 0.15],
      [0.07, 0.2],
      [0.085, 0.36],
      [0.1, 0.52],
      [0.13, 0.72],
      [0.17, 0.87],
      [0.22, 0.96],
      [0.3, 1],
      [0.38, 0.99],
      [0.47, 0.92],
      [0.56, 0.81],
      [0.65, 0.65],
      [0.74, 0.46],
      [0.82, 0.31],
      [0.88, 0.22],
      [0.915, 0.17],
      [0.935, 0.12],
      [0.95, 0.04],
      [0.955, 0]
    ],
    tail: 0.955,
    skin: "#8d959b",
    fin: "#454c52",
    edge: "#586067",
    line: 1.5,
    flipper: {
      u: 0.22,
      theta: 0.9,
      len: 0.12,
      shape: [[-0.05, 0.15], [0.3, 0.17], [0.7, 0.09], [1, -0.12], [0.75, -0.04], [0.35, -0.16], [-0.05, -0.13]]
    },
    root: 0.92,
    flukes: [[0.036, 0], [0.044, 0.03], [0.062, 0.08], [0.07, 0.11], [0.04, 0.105], [-0.01, 0.065], [-0.03, 0.017]],
    pitch: 0.55,
    pivot: 0.6,
    paint: paintDolphin
  },
  // Humpback whale: a stout body, the head broad and blunt, the widest just behind it; very broad paddle-shaped
  // flippers, dark, rounded at the tip; wide flukes with a ragged trailing edge.
  humpback: {
    width: [
      [0, 0.08],
      [0.012, 0.42],
      [0.035, 0.65],
      [0.08, 0.84],
      [0.14, 0.93],
      [0.2, 1],
      [0.35, 0.98],
      [0.5, 0.9],
      [0.62, 0.74],
      [0.72, 0.56],
      [0.8, 0.4],
      [0.86, 0.28],
      [0.91, 0.18],
      [0.95, 0.08],
      [0.975, 0]
    ],
    tail: 0.975,
    skin: "#3e4a52",
    fin: "#2b3138",
    edge: "#2a3238",
    line: 2,
    flipper: {
      u: 0.2,
      theta: 0.45,
      len: 0.2,
      shape: [[-0.05, 0.05], [0.45, 0.36], [0.95, 0.14], [1, 0], [0.95, -0.12], [0.45, -0.26], [-0.05, -0.05]]
    },
    root: 0.94,
    flukes: [[0.04, 0], [0.06, 0.03], [0.085, 0.14], [0.07, 0.16], [0.055, 0.165], [-0.01, 0.07], [-0.04, 0.015]],
    pitch: 0.45,
    pivot: 0.66,
    bumps: true,
    paint: paintHumpback
  }
};
function drawCetacean(ctx, a, tile) {
  const k = KINDS[a.kind];
  const look = LOOKS[k.name];
  const frames = spineOf(a);
  if (frames.length < 8) return;
  const L2 = k.length;
  const line = extend(frames, L2 + 2 * STEP2);
  const profile = smooth(look.width);
  const floor = (d) => tile === 0 ? 0 : tile * 0.5 * Math.max(0, Math.min(1, d / (tile * 1.5), (L2 * look.tail - d) / (tile * 1.5)));
  const wide = (d) => Math.max(k.girth * Math.max(0, profile(d / L2)), floor(d));
  const phase = strokes(a) % 1;
  const pitch = (lag, gain) => look.pitch * gain * Math.sin(2 * Math.PI * (phase - lag));
  const pivot = L2 * look.pivot;
  const squash = 1 - Math.cos(pitch(0, 1));
  const shift2 = (d) => d > pivot ? squash * (d - pivot) ** 2 / (L2 - pivot) : 0;
  const pose = (d) => {
    const s = Math.max(0, d - shift2(d)) / STEP2;
    const i = Math.min(line.length - 2, Math.floor(s));
    const t = s - i;
    const [f, g] = [line[i], line[i + 1]];
    const [fx, fy] = [f.fx + (g.fx - f.fx) * t, f.fy + (g.fy - f.fy) * t];
    const n2 = Math.hypot(fx, fy) || 1;
    return { x: f.x + (g.x - f.x) * t, y: f.y + (g.y - f.y) * t, fx: fx / n2, fy: fy / n2, w: wide(d), u: d / L2 };
  };
  const nose = L2 * 0.03;
  const grid = [];
  for (let i = 0; i < 12; i += 1) grid.push(nose * (i / 12) ** 2);
  for (let d = nose; d < L2; d += Math.min(STEP2, L2 / 100)) grid.push(d);
  const ribbon2 = (d0, d1, lo, hi) => {
    const ds = [d0, ...grid.filter((d) => d > d0 && d < d1), d1];
    const path = new Path2D();
    ds.forEach((d, i) => {
      const [x, y] = at(pose(d), 0, hi(d));
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    for (let i = ds.length - 1; i >= 0; i -= 1) path.lineTo(...at(pose(ds[i]), 0, lo(ds[i])));
    path.closePath();
    return path;
  };
  const share = (s, u) => typeof s === "number" ? s : s(u);
  const strip = (u0, u1, lo, hi, taper = 0) => {
    const round = (u) => {
      const t = taper === 0 ? 1 : Math.min(1, Math.max(0, Math.min(u - u0, u1 - u) / taper));
      return Math.sqrt(1 - (1 - t) ** 2);
    };
    const edge2 = (s) => (d) => share(s, d / L2) * wide(d) * round(d / L2);
    return ribbon2(L2 * u0, L2 * u1, edge2(lo), edge2(hi));
  };
  const blade = (u0, u1, thick) => {
    const h = (d) => thick / 2 * Math.sin(Math.PI * Math.pow((d - L2 * u0) / (L2 * (u1 - u0)), 0.7));
    return ribbon2(L2 * u0, L2 * u1, (d) => -h(d), h);
  };
  const patch = (pts, grow = 1) => {
    const cu = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const xy = pts.map(([u, v]) => {
      const p = pose((cu + (u - cu) * grow) * L2);
      return at(p, 0, v * grow * p.w);
    });
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const path = new Path2D();
    path.moveTo(...mid(xy[xy.length - 1], xy[0]));
    xy.forEach((p, i) => path.quadraticCurveTo(...p, ...mid(p, xy[(i + 1) % xy.length])));
    path.closePath();
    return path;
  };
  const body = ribbon2(0, L2 * look.tail, (d) => -wide(d), wide);
  const root = pose(L2 * look.root);
  const span = look.flukes[3][1];
  const chord = (r2) => Math.cos(pitch(0, 1.1)) * (1 - r2) + Math.cos(pitch(0.12, 1.3)) * r2;
  const fluke = (x, y) => at(root, -x * L2 * chord(Math.abs(y) / span), y * L2);
  const flukes = new Path2D();
  const [n, c1, c2, tip, c3, c4, r] = look.flukes;
  const m = (p, s) => fluke(p[0], p[1] * s);
  flukes.moveTo(...m(r, 1));
  flukes.bezierCurveTo(...m(c4, 1), ...m(c3, 1), ...m(tip, 1));
  flukes.bezierCurveTo(...m(c2, 1), ...m(c1, 1), ...m(n, 1));
  flukes.bezierCurveTo(...m(c1, -1), ...m(c2, -1), ...m(tip, -1));
  flukes.bezierCurveTo(...m(c3, -1), ...m(c4, -1), ...m(r, -1));
  flukes.closePath();
  const turn = bend(pose(L2 * 0.4), pose(L2 * 0.05));
  const fl = look.flipper;
  const flipperFrame = (s) => {
    const p = pose(L2 * fl.u);
    const th = fl.theta + s * Math.max(-0.3, Math.min(0.3, turn * 0.3));
    const [x, y] = at(p, 0, s * p.w * 0.97);
    return { base: { ...p, x, y }, ca: Math.cos(th), sa: Math.sin(th) };
  };
  const flipperPoint = (s, fs, ft, scale = [1, 1]) => {
    const { base, ca, sa } = flipperFrame(s);
    const [s0, t0] = [fs * scale[0] * fl.len * L2, ft * scale[1] * fl.len * L2];
    return at(base, -ca * s0 + sa * t0, s * (sa * s0 + ca * t0));
  };
  const flipper = (s, scale) => {
    const path = new Path2D();
    bez(path, fl.shape.map(([fs, ft]) => flipperPoint(s, fs, ft, scale)));
    return path;
  };
  const flippers = [flipper(-1, [1, 1]), flipper(1, [1, 1])];
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineWidth = look.line;
  ctx.strokeStyle = look.edge;
  for (const part of [flukes, ...flippers, body]) ctx.stroke(part);
  ctx.fillStyle = look.skin;
  ctx.fill(body);
  look.paint(ctx, { L: L2, body, flukes, pose, strip, patch, blade, fluke });
  for (const s of [-1, 1]) {
    const [rx, ry] = flipperPoint(s, 0, 0);
    const [tx, ty] = flipperPoint(s, 0.5, 0);
    const shade = ctx.createLinearGradient(rx, ry, tx, ty);
    shade.addColorStop(0, look.skin);
    shade.addColorStop(0.45, look.rim ?? look.fin);
    ctx.fillStyle = shade;
    ctx.fill(flippers[s === -1 ? 0 : 1]);
  }
  if (look.bumps) {
    const [p0, c12, c22, p1] = fl.shape;
    const edge2 = (t) => {
      const u = 1 - t;
      const at2 = (i) => u * u * u * p0[i] + 3 * u * u * t * c12[i] + 3 * u * t * t * c22[i] + t * t * t * p1[i];
      return [at2(0), at2(1)];
    };
    ctx.fillStyle = "#7c8890";
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.clip(flipper(s, [1, 1]));
      for (const t of [0.12, 0.26, 0.4, 0.54, 0.68, 0.82]) {
        const [fs, ft] = edge2(t);
        const [x, y] = flipperPoint(s, fs, ft - 0.03);
        ctx.beginPath();
        ctx.arc(x, y, fl.len * L2 * 0.02, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  ctx.fillStyle = look.fin;
  ctx.fill(flukes);
  if (look.rim !== void 0) for (const s of [-1, 1]) ctx.fill(flipper(s, [0.93, 0.62]));
  ctx.restore();
}

// src/draw/ray.ts
var BODY = "#24272b";
var EDGE = "#3f454c";
var HALF = 220;
var LENGTH = 328;
var ROOT = 190;
var AMP = 0.85;
var LAG_OUT = 0.14;
var LAG_BACK = 0.7;
function smooth2(pts, n) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [p0, p1, p2, p3] = [pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(pts.length - 1, i + 2)]];
    for (let j = 0; j < n; j += 1) {
      const t = j / n;
      const c = (d) => 0.5 * (2 * p1[d] + (p2[d] - p0[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t * t + (3 * p1[d] - p0[d] - 3 * p2[d] + p3[d]) * t * t * t);
      out.push([c(0), c(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
var HEAD = smooth2([[0, 27], [12, 26.5], [24, 25]], 4);
var HORN = smooth2([[24, 25], [26, 14], [28, 5], [31, 0.5], [34, 1.5], [37, 9], [40, 18], [45, 27]], 4);
var LEAD = smooth2([
  [45, 27],
  [60, 29],
  [85, 35],
  [115, 46.5],
  [150, 60.5],
  [182, 74.5],
  [206, 88],
  [218, 99],
  [223, 106]
], 5);
var TRAIL = smooth2([
  [223, 106],
  [214, 102.5],
  [200, 103],
  [180, 108.5],
  [155, 119],
  [130, 132],
  [105, 146],
  [80, 160],
  [57, 174],
  [38, 185],
  [21, 192.5],
  [9, 196.5],
  [0, 198]
], 5);
var RIGHT = [...HEAD, ...HORN.slice(1), ...LEAD.slice(1), ...TRAIL.slice(1)];
var PATCH = smooth2([[10, 50], [40, 48.5], [66, 52.5], [87, 66], [70, 84], [40, 108], [10, 126], [9, 88], [10, 50]], 4);
function tilt(r, back, side, phase, roll) {
  const wave = Math.cos(2 * Math.PI * (phase - LAG_OUT * r - LAG_BACK * back / 200));
  return AMP * Math.min(1, r / 0.25) * (0.5 + 0.5 * r) * wave - side * roll;
}
function reach(out, back, side, phase, roll) {
  const steps = Math.max(1, Math.ceil(out / 8));
  const d = out / steps;
  let y = 0;
  for (let i = 0; i < steps; i += 1) y += d * Math.cos(tilt((i + 0.5) * d / HALF, back, side, phase, roll));
  return y;
}
function drawRay(ctx, a, tile) {
  void tile;
  const k = KINDS[a.kind];
  const pose = poseOf(a);
  const frames = spineOf(a);
  const phase = strokes(a) % 1;
  const roll = Math.max(-0.3, Math.min(0.3, a.curve * 60));
  const sx = k.girth / HALF;
  const sy = k.length / LENGTH;
  const place2 = (out, back, side) => at(pose, -back * sy, side * reach(out, back, side, phase, roll) * sx);
  const trace = (pts) => pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  const right = RIGHT.map(([o, b]) => place2(o, b, 1));
  const left = RIGHT.map(([o, b]) => place2(o, b, -1));
  const disc = () => {
    ctx.beginPath();
    trace([...right, ...[...left].reverse()]);
    ctx.closePath();
  };
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const behind = (f) => f.u * k.length;
  const tail = frames.filter((f) => behind(f) >= ROOT * sy - 0.01);
  const first = tail[0];
  if (first !== void 0 && tail.length > 3) {
    const cos = first.fx * pose.fx + first.fy * pose.fy;
    const sin = first.fx * pose.fy - first.fy * pose.fx;
    const [rx, ry] = at(pose, -ROOT * sy, 0);
    const span = behind(tail[tail.length - 1]) - behind(first);
    const spine = tail.map((f) => {
      const [dx, dy] = [f.x - first.x, f.y - first.y];
      const [hx, hy] = [cos * f.fx - sin * f.fy, sin * f.fx + cos * f.fy];
      const t = (behind(f) - behind(first)) / span;
      const ripple = 3.5 * Math.pow(t, 1.5) * Math.sin(2 * Math.PI * (phase - 0.6 * t));
      return [rx + cos * dx - sin * dy - hy * ripple, ry + sin * dx + cos * dy + hx * ripple, t];
    });
    const edge2 = (side) => spine.map(([x, y, t], i) => {
      const [x0, y0] = spine[Math.max(0, i - 1)];
      const [x1, y1] = spine[Math.min(spine.length - 1, i + 1)];
      const l = Math.hypot(x1 - x0, y1 - y0) || 1;
      const w = side * (0.9 + 4.4 * Math.pow(1 - t, 1.1));
      return [x - (y1 - y0) / l * w, y + (x1 - x0) / l * w];
    });
    ctx.beginPath();
    trace([...edge2(1), ...edge2(-1).reverse()]);
    ctx.closePath();
    ctx.fillStyle = "#272b2f";
    ctx.fill();
  }
  const dome = ctx.createLinearGradient(...at(pose, -90, -HALF * sx), ...at(pose, -90, HALF * sx));
  dome.addColorStop(0, "#202327");
  dome.addColorStop(0.5, "#2a2e33");
  dome.addColorStop(1, "#202327");
  disc();
  ctx.fillStyle = BODY;
  ctx.fill();
  ctx.fillStyle = dome;
  ctx.fill();
  ctx.save();
  disc();
  ctx.clip();
  for (const [width, alpha] of [[16, 0.12], [8, 0.18], [3.5, 0.3]]) {
    ctx.lineWidth = width;
    ctx.strokeStyle = `rgba(139, 148, 154, ${alpha})`;
    ctx.beginPath();
    trace(right.slice(-TRAIL.length));
    trace(left.slice(-TRAIL.length));
    ctx.stroke();
  }
  for (const side of [1, -1]) {
    const grad = ctx.createLinearGradient(...place2(10, 60, side), ...place2(88, 70, side));
    grad.addColorStop(0, "#b4babb");
    grad.addColorStop(0.55, "#9aa1a3");
    grad.addColorStop(1, "#6d757a");
    ctx.beginPath();
    trace(PATCH.map(([o, b]) => place2(o, b, side)));
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }
  for (const side of [1, -1]) {
    const tip = reach(HALF, 90, side, phase, roll);
    const sheen = ctx.createLinearGradient(...at(pose, -90 * sy, 0), ...at(pose, -90 * sy, side * tip * sx));
    for (let i = 0; i <= 8; i += 1) {
      const out = reach(i / 8 * HALF, 90, side, phase, roll);
      const alpha = 0.2 * Math.abs(Math.sin(tilt(i / 8, 90, side, phase, roll)));
      sheen.addColorStop(out / tip, `rgba(150, 168, 184, ${alpha})`);
    }
    ctx.beginPath();
    trace([at(pose, 50, 0), at(pose, -250, 0), at(pose, -250, side * 300), at(pose, 50, side * 300)]);
    ctx.closePath();
    ctx.fillStyle = sheen;
    ctx.fill();
  }
  ctx.beginPath();
  const front = [...left.slice(0, HEAD.length).reverse(), ...right.slice(1, HEAD.length)];
  trace(front.map(([x, y]) => [x - pose.fx * 4, y - pose.fy * 4]));
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = "rgba(14, 16, 18, 0.55)";
  ctx.stroke();
  ctx.restore();
  disc();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = EDGE;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(...at(pose, -172 * sy, 0));
  ctx.quadraticCurveTo(...at(pose, -182 * sy, 3.6), ...at(pose, -198 * sy, 0));
  ctx.quadraticCurveTo(...at(pose, -182 * sy, -3.6), ...at(pose, -172 * sy, 0));
  ctx.fillStyle = "#1b1d20";
  ctx.fill();
  for (const side of [1, -1]) {
    const [x, y] = place2(57, 33, side);
    ctx.beginPath();
    ctx.arc(x, y, 4.6, 0, Math.PI * 2);
    ctx.fillStyle = "#2d3136";
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = EDGE;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = EYE;
    ctx.fill();
  }
}

// src/draw/school.ts
var BACK = "#46545d";
var FLANK2 = "#a3afb5";
var FLASH = "#dde4e7";
var DISTANT = "#7f939d";
function drawSchool(ctx, a, tile) {
  const k = KINDS[a.kind];
  for (const f of a.fish) {
    const fd = fishDepth(a, f);
    const z = sizeOf(fd) / sizeOf(a.depth);
    const L2 = k.length * z;
    ctx.globalAlpha = 1 - 0.8 * Math.max(0, fd - a.depth);
    const speed = Math.hypot(f.vx, f.vy) || 1;
    const fx = f.vx / speed;
    const fy = f.vy / speed;
    const p = (along, out) => [f.x + fx * along - fy * out, f.y + fy * along + fx * out];
    const flash = Math.abs(f.turn) > 1.8;
    if (tile > 0) {
      ctx.strokeStyle = flash ? FLASH : DISTANT;
      ctx.lineWidth = tile;
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(...p(tile * 1.25 * z, 0));
      ctx.lineTo(...p(-tile * 1.25 * z, 0));
      ctx.stroke();
      continue;
    }
    const sway = Math.sin(2 * Math.PI * f.swum / (k.speed * k.beat)) * L2 * 0.07;
    const w = L2 * 0.075;
    const tail = L2 * 0.16;
    ctx.beginPath();
    ctx.moveTo(...p(L2 * 0.5, 0));
    ctx.quadraticCurveTo(...p(L2 * 0.44, w * 0.9), ...p(L2 * 0.25, w));
    ctx.quadraticCurveTo(...p(-L2 * 0.1, w * 0.95), ...p(-L2 * 0.3, sway * 0.4 + w * 0.2));
    ctx.lineTo(...p(-L2 * 0.36, sway * 0.7 + w * 0.12));
    ctx.quadraticCurveTo(...p(-L2 * 0.42, sway + tail * 0.5), ...p(-L2 * 0.52, sway + tail));
    ctx.quadraticCurveTo(...p(-L2 * 0.44, sway + tail * 0.3), ...p(-L2 * 0.43, sway));
    ctx.quadraticCurveTo(...p(-L2 * 0.44, sway - tail * 0.3), ...p(-L2 * 0.52, sway - tail));
    ctx.quadraticCurveTo(...p(-L2 * 0.42, sway - tail * 0.5), ...p(-L2 * 0.36, sway * 0.7 - w * 0.12));
    ctx.lineTo(...p(-L2 * 0.3, sway * 0.4 - w * 0.2));
    ctx.quadraticCurveTo(...p(-L2 * 0.1, -w * 0.95), ...p(L2 * 0.25, -w));
    ctx.quadraticCurveTo(...p(L2 * 0.44, -w * 0.9), ...p(L2 * 0.5, 0));
    ctx.closePath();
    ctx.fillStyle = flash ? FLASH : FLANK2;
    ctx.fill();
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(...p(L2 * 0.22, side * w * 0.9));
      ctx.quadraticCurveTo(...p(L2 * 0.12, side * w * 2), ...p(L2 * 0.02, side * w * 2.1));
      ctx.quadraticCurveTo(...p(L2 * 0.1, side * w * 1.2), ...p(L2 * 0.14, side * w * 0.9));
    }
    ctx.fill();
    if (!flash) {
      ctx.beginPath();
      ctx.moveTo(...p(L2 * 0.47, 0));
      ctx.quadraticCurveTo(...p(L2 * 0.2, w * 0.62), ...p(-L2 * 0.33, sway * 0.6));
      ctx.quadraticCurveTo(...p(L2 * 0.2, -w * 0.62), ...p(L2 * 0.47, 0));
      ctx.fillStyle = BACK;
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// src/draw/shark.ts
var LOOKS2 = {
  // Great white: slate grey above, sometimes a little brown.
  white: { fringe: "#474e53", flank: "#7b8388", back: "#5c6469" },
  // Great hammerhead: light grey-brown to olive above.
  hammer: { fringe: "#55544b", flank: "#88877a", back: "#6c6b61" },
  // Tiger: grey-green above with dark bars, fading with age.
  tiger: { fringe: "#4a524d", flank: "#7b8580", back: "#5d6660", bar: "#363d38" },
  // Blacktip: bronze grey above; black tips on the fins.
  blacktip: { fringe: "#57544b", flank: "#8b877b", back: "#6e6a5f", tips: "#1a1b1d" },
  // Whale shark: dark blue-grey, its back and sides dotted with pale spots, paler below.
  whaleshark: { fringe: "#2e3d48", flank: "#6b7d88", back: "#3d4e5a", spots: "#dfe7ea" }
};
function fins(ctx, look, f, reach2, root) {
  for (const side of [-1, 1]) {
    const w = f.w;
    const p = (a, b) => at(f, a, side * b);
    ctx.beginPath();
    ctx.moveTo(...p(root * 0.5, w * 0.8));
    ctx.quadraticCurveTo(...p(-reach2 * 0.05, w + reach2 * 0.5), ...p(-reach2 * 0.62, w + reach2 * 0.72));
    ctx.quadraticCurveTo(...p(-reach2 * 0.32, w + reach2 * 0.3), ...p(-root * 0.5, w * 0.8));
    ctx.closePath();
    ctx.fillStyle = look.back;
    ctx.fill();
    if (look.tips !== void 0) {
      ctx.beginPath();
      ctx.arc(...p(-reach2 * 0.56, w + reach2 * 0.64), reach2 * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = look.tips;
      ctx.fill();
    }
  }
}
function drawShark(ctx, s, tile) {
  void tile;
  const k = KINDS[s.kind];
  const look = LOOKS2[k.name];
  const frames = spineOf(s);
  if (frames.length < 3) return;
  const L2 = k.length;
  const near2 = (u) => near(frames, u);
  const last = frames[frames.length - 1];
  const stock = last.w;
  const blade = L2 * (1 - k.trunk);
  const before = near2(k.trunk - 0.18);
  const bend2 = Math.atan2(before.fx * last.fy - before.fy * last.fx, before.fx * last.fx + before.fy * last.fy);
  const tall = Math.min(1, Math.max(0, (L2 - 230) / 120));
  const roll = Math.sin(Math.max(-0.9, Math.min(0.9, bend2 * 1.6)) * tall);
  const lobe = (along, out, thick) => {
    const l = Math.hypot(along, out);
    const [da, db] = [along / l, out / l];
    const p = (s2, w) => at(last, da * s2 - db * w, db * s2 + da * w);
    ctx.beginPath();
    ctx.moveTo(...p(-2, -stock));
    ctx.bezierCurveTo(...p(l * 0.3, -thick * 1.7), ...p(l * 0.75, -thick * 0.9), ...p(l, 0));
    ctx.bezierCurveTo(...p(l * 0.75, thick * 0.9), ...p(l * 0.3, thick * 1.7), ...p(-2, stock));
    ctx.closePath();
    ctx.fillStyle = look.fringe;
    ctx.fill();
  };
  lobe(-blade, roll * blade * 0.9, stock);
  if (roll !== 0) lobe(-blade * 0.7, -roll * blade * 0.6, stock * 0.8);
  fins(ctx, look, near2(0.27), k.fin, L2 * 0.07);
  fins(ctx, look, near2(0.6), k.fin * 0.3, L2 * 0.03);
  outline(ctx, frames, 1);
  ctx.fillStyle = look.flank;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = look.fringe;
  ctx.stroke();
  outline(ctx, frames, 0.6);
  ctx.fillStyle = look.back;
  ctx.fill();
  if (look.spots !== void 0 && tile === 0) {
    ctx.fillStyle = look.spots;
    ctx.beginPath();
    for (let i = 0; i < frames.length; i += 1) {
      const f = frames[i];
      for (let j = 0; j < 5; j += 1) {
        const r = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
        const u = r - Math.floor(r);
        const [x, y] = at(f, 0, (j % 2 === 0 ? -1 : 1) * f.w * (0.15 + 0.7 * u));
        ctx.moveTo(x + 1.6, y);
        ctx.arc(x, y, 1.1 + u * 0.9, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }
  if (look.bar !== void 0) {
    ctx.strokeStyle = look.bar;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const f of frames) {
      if (f.u < 0.22 || f.u > 0.72 || Math.abs(f.u * L2 % 26) > 2.6) continue;
      ctx.moveTo(...at(f, 0, f.w * 0.7));
      ctx.lineTo(...at(f, 0, -f.w * 0.7));
    }
    ctx.stroke();
  }
  const dorsal = near2(0.4);
  ctx.strokeStyle = look.tips ?? look.fringe;
  ctx.lineWidth = Math.max(2, k.girth * 0.13);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(...at(dorsal, L2 * 0.04, 0));
  ctx.lineTo(...at(dorsal, -L2 * 0.07, 0));
  ctx.stroke();
  const head = frames[0];
  ctx.fillStyle = EYE;
  if (k.hammer === true) {
    const span = L2 * 0.13;
    const deep = L2 * 0.028;
    const neck = near2(0.06).w;
    const side = [
      [1.3 * deep, 0],
      [1.25 * deep, 0.25 * span],
      [1.1 * deep, 0.5 * span],
      [0.85 * deep, 0.75 * span],
      [0.6 * deep, 0.9 * span],
      [0.3 * deep, 0.98 * span],
      [-0.1 * deep, span],
      [-0.5 * deep, 0.99 * span],
      [-0.8 * deep, 0.93 * span],
      [-0.95 * deep, 0.82 * span],
      [-1.02 * deep, 0.6 * span],
      [-1.08 * deep, Math.max(neck * 1.45, 0.38 * span)],
      [-1.3 * deep, neck * 1.15],
      [-1.8 * deep, neck * 1.03],
      [-2.6 * deep, neck]
    ];
    const pts = [...side, ...side.slice(1).reverse().map(([a, b]) => [a, -b])];
    ctx.beginPath();
    pts.forEach(([a, b], i) => i === 0 ? ctx.moveTo(...at(head, a, b)) : ctx.lineTo(...at(head, a, b)));
    ctx.closePath();
    ctx.fillStyle = look.back;
    ctx.fill();
    ctx.strokeStyle = look.fringe;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = EYE;
    for (const b of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(...at(head, -deep * 0.15, b * span * 0.93), 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const eye = near2(0.06);
    for (const b of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(...at(eye, 0, b * eye.w * 0.78), 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// src/draw/squid.ts
var MANTLE = [
  [0, 0.6],
  [6e-3, 2.8],
  [0.015, 5.5],
  [0.03, 8.6],
  [0.05, 11.3],
  [0.075, 14],
  [0.1, 16.4],
  [0.14, 19],
  [0.18, 20.6],
  [0.21, 21.3],
  [0.235, 21],
  [0.248, 19.6],
  [0.256, 17.5]
];
var HEAD2 = [[0.245, 12.5], [0.262, 13.4], [0.28, 14], [0.3, 13.2], [0.318, 12.2], [0.326, 10.8]];
var TENTACLE = [
  [0.33, 3.3],
  [0.4, 3],
  [0.6, 2.7],
  [0.9, 2.5],
  [0.925, 3.4],
  [0.945, 5.6],
  [0.96, 6.2],
  [0.975, 5.4],
  [0.99, 3.4],
  [1, 0.4]
];
var FIN = 0.078;
var CROWN = 0.318;
var ARMS = [
  { out: 4.2, len: 108, fan: 1.4, tone: "#7a312b" },
  { out: 8.4, len: 118, fan: 2.5, tone: "#82352f" },
  { out: 8.6, len: 112, fan: 1.5, tone: "#8a3a33" },
  { out: 3.8, len: 104, fan: 0.6, tone: "#8f3f37" }
];
var smooth3 = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
var squeeze = (phase) => phase < 0.17 ? smooth3(phase / 0.17) : 1 - smooth3((phase - 0.17) / 0.58);
var lookup = (table2, u) => {
  if (u <= table2[0][0]) return table2[0][1];
  for (let i = 1; i < table2.length; i += 1) {
    const [u1, w1] = table2[i];
    if (u <= u1) {
      const [u0, w0] = table2[i - 1];
      return w0 + (w1 - w0) * (u - u0) / (u1 - u0);
    }
  }
  return table2[table2.length - 1][1];
};
function loop(ctx, pts) {
  const n = pts.length;
  const mid = (i) => {
    const [a, b] = [pts[i % n], pts[(i + 1) % n]];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  ctx.beginPath();
  ctx.moveTo(...mid(n - 1));
  for (let i = 0; i < n; i += 1) ctx.quadraticCurveTo(...pts[i], ...mid(i));
  ctx.closePath();
}
function ribbon(ctx, frames, i0, i1, mid, hw) {
  const left = [];
  const right = [];
  for (let i = i0; i <= i1; i += 1) {
    left.push(at(frames[i], 0, mid(i) + hw(i)));
    right.unshift(at(frames[i], 0, mid(i) - hw(i)));
  }
  loop(ctx, [...left, ...right]);
}
var hash = (i, j) => {
  const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
function flecks(ctx, frames, i0, i1, mid, hw, per) {
  for (const [colour, light] of [["#4b1a18", false], ["#b0604c", true]]) {
    ctx.beginPath();
    for (let i = i0; i <= i1; i += 1) {
      for (let j = 0; j < per; j += 1) {
        if (hash(i, j + 11) > 0.82 !== light) continue;
        const r = 0.4 + hash(i, j + 5) * 0.65;
        const [x, y] = at(frames[i], (hash(i, j + 7) - 0.5) * 4, mid(i) + (hash(i, j) * 2 - 1) * hw(i) * 0.9);
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    ctx.globalAlpha = light ? 0.45 : 0.6;
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
function drawSquid(ctx, a, tile) {
  const k = KINDS[a.kind];
  const frames = spineOf(a);
  if (frames.length < 3) return;
  const L2 = k.length;
  const phase = strokes(a) % 1;
  const jet = squeeze(phase);
  const open = 1 - jet;
  const idx = (u) => Math.min(frames.length - 1, Math.round(u / frames[1].u));
  const last = frames.length - 1;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    const mid = (i) => {
      const t = Math.max(0, (frames[i].u - 0.33) / 0.67);
      const spread = 3.2 + (3 + 8 * open) * Math.pow(t, 1.2);
      const flap = (4 + 7 * open) * Math.pow(t, 1.5) * Math.sin(2 * Math.PI * (phase - 1.3 * t + 0.3 * side));
      return side * spread + flap;
    };
    const hw = (i) => Math.max(lookup(TENTACLE, frames[i].u), tile * 0.5);
    ribbon(ctx, frames, idx(0.33), last, mid, hw);
    ctx.fillStyle = "#8a3a33";
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = "#4d1c1a";
    ctx.stroke();
    ctx.fillStyle = "#9d4c42";
    ctx.globalAlpha = 0.34;
    for (const from of [0.915, 0.93, 0.945]) {
      ribbon(ctx, frames, idx(from), last, mid, hw);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let i = idx(0.945); i < last - 1; i += 1) {
      const [x, y] = at(frames[i], 0, mid(i) + (i % 2 === 0 ? 1.7 : -1.7));
      ctx.moveTo(x + 1.1, y);
      ctx.arc(x, y, 1.1, 0, Math.PI * 2);
    }
    ctx.fillStyle = "#c48470";
    ctx.fill();
  }
  const step = frames[1].u * L2;
  const start = idx(CROWN);
  ARMS.forEach((arm, rank) => {
    for (const side of [-1, 1]) {
      const n = Math.min(Math.round(arm.len / step), last - start);
      const t = (i) => (i - start) * step / arm.len;
      const mid = (i) => {
        const d = (i - start) * step;
        const wave = Math.sin(2 * Math.PI * (phase - 0.9 * t(i) + 0.17 * rank + (side > 0 ? 0 : 0.5)));
        const flutter = (0.8 + 2.2 * open) * t(i) * t(i) * wave;
        return side * (arm.out * (1 - 0.2 * t(i)) + arm.fan * (6e-3 + 0.045 * open) * d) + flutter;
      };
      const hw = (i) => 4.3 * Math.pow(1 - Math.pow(t(i), 2.2), 0.7);
      ribbon(ctx, frames, start, start + n, mid, hw);
      ctx.fillStyle = arm.tone;
      ctx.fill();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = "#43181a";
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (rank === ARMS.length - 1) flecks(ctx, frames, start, start + n - 2, mid, hw, 1);
    }
  });
  const head = (share) => {
    const [i0, i1] = [idx(HEAD2[0][0]), idx(HEAD2[HEAD2.length - 1][0])];
    const w = (i) => lookup(HEAD2, frames[i].u) * share;
    const pts = [];
    for (let i = i0; i <= i1; i += 1) pts.push(at(frames[i], 0, w(i)));
    pts.push(at(frames[i1], -3, w(i1) * 0.6), at(frames[i1], -4.2, 0), at(frames[i1], -3, -w(i1) * 0.6));
    for (let i = i1; i >= i0; i -= 1) pts.push(at(frames[i], 0, -w(i)));
    loop(ctx, pts);
  };
  head(1);
  ctx.fillStyle = "#833630";
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "#4d1c1a";
  ctx.stroke();
  head(0.4);
  ctx.fillStyle = "#6f2a26";
  ctx.globalAlpha = 0.7;
  ctx.fill();
  ctx.globalAlpha = 1;
  const mw = (i) => {
    const u = frames[i].u;
    return lookup(MANTLE, u) * (1 - 0.18 * jet * (0.55 + 0.45 * smooth3(u / 0.15)));
  };
  const nFin = idx(FIN);
  const finEdge = (i) => {
    const u = frames[i].u;
    const psi = u / FIN;
    const span = 23.5 * (1 - 0.2 * jet);
    const ripple = 1 + 0.05 * Math.sin(2 * Math.PI * (phase - 0.9 * psi));
    return Math.max(mw(i) + 0.5, span * ripple * Math.pow(Math.sin(Math.PI * Math.pow(psi, 1.25 + 0.2 * jet)), 0.45));
  };
  for (const side of [-1, 1]) {
    const pts = [at(frames[0], 0, 0)];
    for (let i = 1; i <= nFin; i += 1) pts.push(at(frames[i], 0, side * finEdge(i)));
    pts.push(at(frames[nFin], 0, 0));
    loop(ctx, pts);
    ctx.fillStyle = "#9a4a40";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#5a2420";
    ctx.stroke();
    ctx.beginPath();
    for (let i = 2; i < nFin; i += 2) {
      ctx.moveTo(...at(frames[i], 0, side * mw(i) * 0.85));
      ctx.lineTo(...at(frames[i], -2.5, side * finEdge(i) * 0.94));
    }
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = "#7e352d";
    ctx.stroke();
  }
  const nM = idx(0.256);
  const mantle = (share) => {
    const e2 = frames[nM];
    const w = mw(nM) * share;
    const pts = [at(frames[0], 2.5, 0)];
    for (let i = 0; i <= nM; i += 1) pts.push(at(frames[i], 0, mw(i) * share));
    pts.push(at(e2, -2.2, w * 0.7), at(e2, -4, w * 0.3), at(e2, -4.6, 0), at(e2, -4, -w * 0.3), at(e2, -2.2, -w * 0.7));
    for (let i = nM; i >= 0; i -= 1) pts.push(at(frames[i], 0, -mw(i) * share));
    loop(ctx, pts);
  };
  mantle(1);
  ctx.fillStyle = "#84352f";
  ctx.fill();
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = "#4d1c1a";
  ctx.stroke();
  mantle(0.82);
  ctx.fillStyle = "#7c2f2b";
  ctx.fill();
  mantle(0.64);
  ctx.fillStyle = "#722a26";
  ctx.fill();
  mantle(0.38);
  ctx.fillStyle = "#6a2622";
  ctx.fill();
  flecks(ctx, frames, 1, nM, () => 0, mw, 3);
  const e = frames[nM];
  ctx.beginPath();
  ctx.moveTo(...at(e, 0.5, mw(nM) * 0.97));
  ctx.quadraticCurveTo(...at(e, -9, 0), ...at(e, 0.5, -mw(nM) * 0.97));
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "#4b1a18";
  ctx.globalAlpha = 0.55;
  ctx.stroke();
  ctx.globalAlpha = 1;
  const f = near(frames, 0.282);
  const turn = Math.atan2(f.fy, f.fx);
  for (const side of [-1, 1]) {
    const ellipse = (out, along, rx, ry) => {
      ctx.beginPath();
      ctx.ellipse(...at(f, along, side * out), rx, ry, turn, 0, Math.PI * 2);
    };
    ellipse(13.3, 0, 10.8, 9.6);
    ctx.fillStyle = "#4a1a18";
    ctx.fill();
    ellipse(13.5, 0, 10, 8.8);
    ctx.fillStyle = "#9a8a80";
    ctx.fill();
    ellipse(14.4, 0, 8.7, 7.5);
    ctx.fillStyle = EYE;
    ctx.fill();
    ellipse(17.4, 2.8, 1.3, 0.8);
    ctx.fillStyle = "#9d948d";
    ctx.fill();
  }
  ctx.restore();
}

// src/draw/turtle.ts
var turtle = KINDS.find((k) => k.plan === "turtle");
var L = turtle.length;
var W = turtle.girth;
var SHELL = { base: "#6b5d3e", centre: "#8a7a50", seam: "#3f3524", ring: "#76684a" };
var STREAK = { pale: "rgba(160, 140, 85, 0.24)", dark: "rgba(63, 53, 36, 0.2)" };
var SKIN = { scale: "#5a5143", edge: "#b3a684", seam: "rgba(179, 166, 132, 0.45)", claw: "#d2c7a5" };
var clamp2 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function table(pts, x) {
  let i = 1;
  while (i < pts.length - 1 && pts[i][0] < x) i += 1;
  const [x0, y0] = pts[i - 1];
  const [x1, y1] = pts[i];
  return y0 + (y1 - y0) * clamp2((x - x0) / (x1 - x0), 0, 1);
}
var FRONT = 0.15 * L;
var SPAN = 0.78 * L;
var RING = 4.4;
function halfAt(t) {
  const [u, p] = t < 0.4 ? [1 - t / 0.4, 2.1] : [(t - 0.4) / 0.6, 1.75];
  return W * Math.pow(1 - Math.pow(Math.min(1, u), p), 1 / p);
}
var shell = (t, s) => [FRONT + t * SPAN, s * halfAt(t)];
function scute(corners, n) {
  const pts = [];
  corners.forEach(([t0, s0], i) => {
    const [t1, s1] = corners[(i + 1) % corners.length];
    for (let k = 0; k < 5; k += 1) pts.push(shell(t0 + (t1 - t0) * k / 5, s0 + (s1 - s0) * k / 5));
  });
  const c = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const r = pts.reduce((s, p) => s + Math.hypot(p[0] - c[0], p[1] - c[1]), 0) / pts.length;
  const rays = Array.from({ length: 12 }, (_, k) => {
    const a = (k + n % 3 / 3) / 12 * Math.PI * 2;
    const far = r * 1.8;
    const tip = (da) => [c[0] + Math.cos(a + da) * far, c[1] + Math.sin(a + da) * far];
    return { tri: [c, tip(-0.12), tip(0.12)], dark: k % 2 === 0 };
  });
  return { pts, c, r, rays };
}
var TV = [0.11, 0.28, 0.44, 0.6, 0.77, 0.93];
var SV = [0.26, 0.21, 0.2, 0.2, 0.2, 0.12];
var SM = [0.3, 0.32, 0.31, 0.3, 0.26];
var scutes = [];
for (let i = 0; i < 5; i += 1) {
  const m = (TV[i] + TV[i + 1]) / 2;
  const [a, b, c, d] = [TV[i], TV[i + 1], SV[i], SV[i + 1]];
  scutes.push(scute([[a, -c], [m, -SM[i]], [b, -d], [b, d], [m, SM[i]], [a, c]], i));
}
var edge = [];
for (let i = 0; i < 6; i += 1) {
  edge.push([TV[i], SV[i]]);
  if (i < 5) edge.push([(TV[i] + TV[i + 1]) / 2, SM[i]]);
}
var seamAt = [0, 3, 5, 7, 10];
var seamOut = [0.09, 0.42, 0.575, 0.735, 0.93];
for (const side of [1, -1]) {
  for (let c = 0; c < 4; c += 1) {
    const corners = [[seamOut[c], 0.97], ...edge.slice(seamAt[c], seamAt[c + 1] + 1), [seamOut[c + 1], 0.97]];
    scutes.push(scute(corners.map(([t, s]) => [t, s * side]), 5 + c + 4 * (side > 0 ? 0 : 1)));
  }
}
var contour = [];
for (let i = 0; i <= 40; i += 1) contour.push(shell((1 - Math.cos(Math.PI * i / 40)) / 2, 1));
for (let i = 39; i >= 1; i -= 1) contour.push([contour[i][0], -contour[i][1]]);
var ticks = [];
var since = 0;
contour.forEach(([b, y], i) => {
  const [pb, py] = contour[(i + contour.length - 1) % contour.length];
  since += Math.hypot(b - pb, y - py);
  if (since < 8) return;
  since = 0;
  const cb = FRONT + 0.44 * SPAN - b;
  const d = Math.hypot(cb, y);
  ticks.push([[b, y], [b + cb / d * RING, y - y / d * RING]]);
});
var HEAD3 = [
  [0, 0],
  [0.7, 2.4],
  [2, 4],
  [4, 5.3],
  [6.5, 6.1],
  [9, 6.2],
  [11.5, 5.4],
  [13.5, 4.8],
  [16, 5.4],
  [19, 7],
  [22, 8.8],
  [26, 10]
];
var CROWN2 = [
  [[3.4, -3.4], [3.4, 3.4]],
  [[1, 0], [5.8, 0]],
  [[5.8, 0], [8.8, 3.6]],
  [[5.8, 0], [8.8, -3.6]],
  [[8.8, -4.8], [8.8, 4.8]]
];
var NECK = 26;
var FLIP = 0.42 * L;
var SHOULDER = [27, 24];
var FLIP_W = [[0, 7], [0.12, 8], [0.3, 7.8], [0.55, 6.6], [0.78, 4.9], [0.9, 3.2], [0.97, 1.6], [1, 0.5]];
var REAR = 0.17 * L;
var REAR_ROOT = [78, 13];
var REAR_W = [[0, 5], [0.25, 6], [0.6, 5], [0.85, 3], [1, 0.8]];
var SWEEP = [
  [0, 0.66, 0],
  [0.18, -0.12, -5],
  [0.38, -0.7, -0.6],
  [0.5, -0.78, 0],
  [0.62, -0.75, 0.5],
  [0.82, -0.2, 4.5]
];
var LIFT = [[0, 0.9, 0], [0.18, 0, -5], [0.38, -0.45, 0], [0.62, -0.12, 0.5], [0.82, 0.5, 3.5]];
var GLIDE = { sweep: -0.75, lift: -0.1 };
function ride(keys, phase) {
  const p = phase - Math.floor(phase);
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1][0] <= p) i += 1;
  const [t0, v0, m0] = keys[i];
  const [next, v1, m1] = keys[(i + 1) % keys.length];
  const h = next + (i + 1 >= keys.length ? 1 : 0) - t0;
  const x = (p - t0) / h;
  const [x2, x3] = [x * x, x * x * x];
  return (2 * x3 - 3 * x2 + 1) * v0 + (x3 - 2 * x2 + x) * h * m0 + (3 * x2 - 2 * x3) * v1 + (x3 - x2) * h * m1;
}
function drawTurtle(ctx, a, tile) {
  const fine = tile === 0;
  const f = poseOf(a);
  const phase = strokes(a) % 1;
  const turn = clamp2(a.curve * L * turtle.turn, -1.3, 1.3);
  const P = (b, y) => at(f, -b, y);
  const line = (pts) => {
    pts.forEach(([b, y], i) => i === 0 ? ctx.moveTo(...P(b, y)) : ctx.lineTo(...P(b, y)));
  };
  const blob2 = (pts) => {
    const mid = (i) => {
      const [b0, y0] = pts[i % pts.length];
      const [b1, y1] = pts[(i + 1) % pts.length];
      return [(b0 + b1) / 2, (y0 + y1) / 2];
    };
    ctx.beginPath();
    ctx.moveTo(...P(...mid(pts.length - 1)));
    pts.forEach(([b, y], i) => ctx.quadraticCurveTo(...P(b, y), ...P(...mid(i))));
    ctx.closePath();
  };
  const trace = (pts) => {
    ctx.beginPath();
    line(pts);
    ctx.closePath();
  };
  const skin = () => {
    ctx.fillStyle = SKIN.scale;
    ctx.fill();
    ctx.lineWidth = 0.9;
    ctx.lineJoin = "round";
    ctx.strokeStyle = SKIN.edge;
    ctx.stroke();
  };
  blob2([[84, 2.6], [89, 2.2], [92.5, 0.9], [92.5, -0.9], [89, -2.2], [84, -2.6]]);
  skin();
  for (const side of [1, -1]) {
    const angle = clamp2(0.42 + side * 0.45 * turn + 0.05 * Math.sin(2 * Math.PI * (phase + 0.1)), 0.1, 1);
    const [sin, cos] = [Math.sin(angle), Math.cos(angle)];
    const one = [];
    const other = [];
    for (let i = 0; i <= 8; i += 1) {
      const s = i / 8;
      const h = table(REAR_W, s);
      const b = REAR_ROOT[0] + cos * REAR * s;
      const y = side * (REAR_ROOT[1] + sin * REAR * s);
      one.push([b - side * sin * h, y + cos * h]);
      other.unshift([b + side * sin * h, y - cos * h]);
    }
    blob2([...one, ...other]);
    skin();
  }
  const reach2 = 1.2 * Math.sin(2 * Math.PI * (phase + 0.05));
  const yaw = 0.2 * turn;
  const swing = (b, y) => {
    const ahead = NECK - b + reach2;
    return [NECK - (ahead * Math.cos(yaw) - y * Math.sin(yaw)), ahead * Math.sin(yaw) + y * Math.cos(yaw)];
  };
  blob2([...HEAD3.map(([b, h]) => swing(b, h)), ...HEAD3.slice(1, -1).reverse().map(([b, h]) => swing(b, -h))]);
  skin();
  if (fine) {
    ctx.strokeStyle = SKIN.seam;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const seam of CROWN2) line(seam.map(([b, y]) => swing(b, y)));
    ctx.stroke();
  }
  ctx.fillStyle = EYE;
  for (const side of [1, -1]) {
    ctx.beginPath();
    ctx.arc(...P(...swing(6.4, side * 5)), 1.15, 0, Math.PI * 2);
    ctx.fill();
  }
  const rate = (ride(SWEEP, phase + 0.01) - ride(SWEEP, phase - 0.01)) / 0.02;
  for (const side of [1, -1]) {
    const hold = side * turn > 0 ? clamp2(0.4 * Math.abs(turn), 0, 0.5) : 0;
    const sweep = ride(SWEEP, phase) * (1 - hold) + GLIDE.sweep * hold;
    const lift = ride(LIFT, phase) * (1 - hold) + GLIDE.lift * hold;
    const bend2 = -0.06 * rate * (1 - hold);
    const span = FLIP * Math.cos(lift);
    const chord = 1 - 0.2 * Math.abs(Math.sin(lift));
    const N = 14;
    const lead = [];
    const trail = [];
    const dir = [];
    let [b, y] = [SHOULDER[0], side * SHOULDER[1]];
    for (let i = 0; i <= N; i += 1) {
      const s = i / N;
      const angle = sweep + bend2 * (Math.pow(s, 1.5) - 0.4) - 0.25 * Math.pow(s, 1.5);
      const [nb, ny] = [-Math.cos(angle), -side * Math.sin(angle)];
      const h = table(FLIP_W, s) * chord;
      lead.push([b + nb * h * 0.82, y + ny * h * 0.82]);
      trail.push([b - nb * h * 1.18, y - ny * h * 1.18]);
      dir.push([-Math.sin(angle), side * Math.cos(angle)]);
      b += dir[i][0] * span / N;
      y += dir[i][1] * span / N;
    }
    blob2([...lead, ...[...trail].reverse()]);
    skin();
    if (!fine) continue;
    ctx.strokeStyle = SKIN.seam;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const [i, share] of [[3, 0.7], [6, 0.8], [9, 0.75], [12, 0.7]]) {
      const [lb, ly] = lead[i];
      const [tb, ty] = trail[i];
      line([[lb, ly], [lb + (tb - lb) * share, ly + (ty - ly) * share]]);
    }
    ctx.stroke();
    const [cb, cy] = lead[10];
    const out = trail[10];
    ctx.strokeStyle = SKIN.claw;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    line([[cb, cy], [cb + dir[10][0] * 2.2 + (cb - out[0]) * 0.1, cy + dir[10][1] * 2.2 + (cy - out[1]) * 0.1]]);
    ctx.stroke();
    ctx.lineCap = "butt";
  }
  ctx.save();
  trace(contour);
  ctx.clip();
  ctx.fillStyle = SHELL.ring;
  ctx.fill();
  for (const s of scutes) {
    trace(s.pts);
    const [cx, cy] = P(...s.c);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, s.r * 1.1);
    grad.addColorStop(0, SHELL.centre);
    grad.addColorStop(1, SHELL.base);
    ctx.fillStyle = grad;
    ctx.fill();
    if (!fine) continue;
    ctx.save();
    ctx.clip();
    for (const ray of s.rays) {
      trace(ray.tri);
      ctx.fillStyle = ray.dark ? STREAK.dark : STREAK.pale;
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.lineWidth = 0.9;
  ctx.lineJoin = "round";
  ctx.strokeStyle = SHELL.seam;
  ctx.beginPath();
  for (const s of scutes) {
    line(s.pts);
    ctx.closePath();
  }
  ctx.stroke();
  trace(contour);
  ctx.lineWidth = RING * 2 + 1.2;
  ctx.stroke();
  ctx.lineWidth = RING * 2;
  ctx.strokeStyle = SHELL.ring;
  ctx.stroke();
  if (fine) {
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = SHELL.seam;
    ctx.beginPath();
    for (const tick of ticks) line(tick);
    ctx.stroke();
  }
  ctx.restore();
  trace(contour);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = SHELL.seam;
  ctx.stroke();
}

// src/draw/all.ts
var DRAW = {
  shark: drawShark,
  cetacean: drawCetacean,
  turtle: drawTurtle,
  ray: drawRay,
  squid: drawSquid,
  school: drawSchool
};

// src/mosaic.ts
var GLYPHS = "$%tSX8@:;#S%X8tS";
var SHADES = [1, 0.886, 0.776, 0.659];
var GLYPH_INK = 0.227;
var GLYPH_LIFT = 0.72;
var OCEAN_NIGHT = "#0a2034";
var OCEAN_DAY = "#2f86ad";
var DEEP_DARK = OCEAN_NIGHT;
var DEEP_LIGHT = OCEAN_DAY;
var MONO_NIGHT = "#191919";
var MONO_DAY = "#dde6e9";
var MONO_DEEP_DARK = "#171d24";
var MONO_DEEP_LIGHT = "#c9d8de";
var TINT = 0.3;
var CLEAR = 0.85;
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function tileTable() {
  const rand = rng(7);
  const shade = [];
  const glyph = [];
  for (let i = 0; i < 256; i += 1) {
    const r = rand();
    shade.push(SHADES[r < 0.4 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3]);
    glyph.push(rand() < 0.86 ? GLYPHS[Math.floor(rand() * GLYPHS.length)] : "");
  }
  return { shade, glyph };
}

// src/panel.ts
var LABELS = {
  white: ["Great white", "Great white shark", "#7b8388"],
  hammer: ["Hammerhead", "Hammerhead shark", "#88877a"],
  tiger: ["Tiger", "Tiger shark", "#7b8580"],
  blacktip: ["Blacktip", "Blacktip shark", "#8b877b"],
  blue: ["Blue whale", "Blue whale", "#6d8799"],
  orca: ["Orca", "Orca", "#2a2d31"],
  dolphin: ["Dolphin", "Dolphin", "#7d858c"],
  turtle: ["Turtle", "Green turtle", "#8a7a50"],
  manta: ["Manta", "Manta ray", "#33373c"],
  squid: ["Giant squid", "Giant squid", "#8a3a33"],
  jacks: ["Jacks", "School of jacks", "#a3afb5"],
  whaleshark: ["Whale shark", "Whale shark", "#5f7a86"],
  humpback: ["Humpback", "Humpback whale", "#4a5860"]
};
var GROUPS = [
  ["Sharks", ["white", "hammer", "tiger", "blacktip", "whaleshark"]],
  ["Mammals", ["blue", "orca", "dolphin", "humpback"]],
  ["Others", ["turtle", "manta", "squid", "jacks"]]
];
var ORDER = GROUPS.flatMap(([, names]) => names);
var metres = (n) => `${n.toLocaleString("en", { maximumFractionDigits: 1 })} m`;
var sizeOf2 = (name) => {
  const k = KINDS.find((x) => x.name === name);
  return k.plan === "school" ? `${metres(k.length / 80)} each` : metres(k.length / 80);
};
var icon = (path, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
var ICONS = {
  pause: icon('<path d="M9 5v14M15 5v14"/>'),
  play: icon('<path d="M7 5l12 7-12 7z" fill="currentColor"/>'),
  sun: icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: icon('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  hide: icon('<path d="M9 6l6 6-6 6"/>'),
  sliders: icon('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  prev: icon('<path d="M15 6l-6 6 6 6"/>'),
  next: icon('<path d="M9 6l6 6-6 6"/>'),
  minus: icon('<path d="M6 12h12"/>', 16),
  plus: icon('<path d="M12 6v12M6 12h12"/>', 16),
  eye: icon('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 15)
};
var CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap {
  --glass: rgba(26, 29, 33, 0.22);
  --foot: rgba(18, 22, 26, 0.86);
  --edge: rgba(255, 255, 255, 0.12);
  --shine: rgba(255, 255, 255, 0.08);
  --text: #eef1f2;
  --muted: rgba(238, 241, 242, 0.6);
  --faint: rgba(238, 241, 242, 0.38);
  --track: rgba(255, 255, 255, 0.10);
  --chip: rgba(255, 255, 255, 0.06);
  --chip-hover: rgba(255, 255, 255, 0.11);
  --chip-on: rgba(255, 255, 255, 0.17);
  --accent: #8fd3e8;
  --accent-ink: #0d2a33;
  --live: #7ee0a1;
  --shadow: 0 18px 50px rgba(0, 0, 0, 0.38);
  color-scheme: dark;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  font: 13px/1.35 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--text);
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  max-height: calc(100% - 32px);
  display: flex;
  z-index: 10;
}
.wrap.light {
  --glass: rgba(255, 255, 255, 0.3);
  --foot: rgba(246, 249, 250, 0.9);
  --edge: rgba(255, 255, 255, 0.75);
  --shine: rgba(255, 255, 255, 0.5);
  --text: #1a2024;
  --muted: rgba(26, 32, 36, 0.62);
  --faint: rgba(26, 32, 36, 0.4);
  --track: rgba(20, 30, 40, 0.12);
  --chip: rgba(20, 30, 40, 0.05);
  --chip-hover: rgba(20, 30, 40, 0.09);
  --chip-on: rgba(20, 30, 40, 0.14);
  --accent: #1f7d99;
  --accent-ink: #ffffff;
  --live: #23935a;
  --shadow: 0 18px 50px rgba(30, 50, 70, 0.20);
  color-scheme: light;
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.5);
}
.glass {
  background: var(--glass);
  -webkit-backdrop-filter: blur(6px) saturate(150%);
  backdrop-filter: blur(6px) saturate(150%);
  border: 1px solid var(--edge);
  box-shadow: var(--shadow), inset 0 1px 0 var(--shine);
}
.panel {
  width: 304px;
  max-width: calc(100vw - 32px);
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}
.panel::-webkit-scrollbar { display: none; }
.wrap.closed .panel { display: none; }
.wrap:not(.closed) .fab { display: none; }

button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; border-radius: 10px; text-shadow: inherit; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.icon {
  width: 34px; height: 34px; display: grid; place-items: center; color: var(--muted); flex: none;
  transition: background 0.15s, color 0.15s;
}
.icon:hover { background: var(--chip-hover); color: var(--text); }
.icon[aria-pressed="true"] { color: var(--text); }

header { display: flex; align-items: center; gap: 4px; padding: 14px 10px 8px 18px; }
.title { flex: 1; min-width: 0; }
h1 { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: 0.01em; }
.status { margin-top: 2px; font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 6px; }
.pulse { width: 7px; height: 7px; border-radius: 50%; background: var(--live); box-shadow: 0 0 0 3px color-mix(in srgb, var(--live) 25%, transparent); }
.paused .pulse { background: var(--faint); box-shadow: none; }

.modes {
  margin: 4px 14px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 3px; padding: 3px;
  background: var(--chip); border-radius: 13px;
}
.modes button {
  padding: 8px 6px; border-radius: 10px; color: var(--muted); font-weight: 600;
  display: flex; align-items: center; justify-content: center; gap: 7px; transition: background 0.15s, color 0.15s;
}
.modes button:hover { color: var(--text); }
.modes button[aria-pressed="true"] { background: var(--accent); color: var(--accent-ink); text-shadow: none; }

.page { padding: 4px 18px 14px; }
.page[hidden] { display: none; }
.shared { padding: 4px 18px 14px; border-top: 1px solid var(--track); }
.section { margin: 12px 0 0; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--faint); }
.pair { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.pair > span { font-weight: 600; }
.pair .segmented { width: 184px; flex: none; }
.block { margin-top: 12px; }
.label { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
.label span:first-child { font-weight: 600; }
.hint { color: var(--muted); font-size: 12px; }
.links { display: flex; gap: 2px; }
.links button { font-size: 12px; color: var(--accent); padding: 2px 6px; }
.links button:hover { background: var(--chip-hover); }

.stepper { display: flex; align-items: center; justify-content: space-between; background: var(--chip); border-radius: 12px; padding: 3px; }
.stepper .icon { width: 36px; height: 30px; border-radius: 9px; }
.stepper .icon:disabled { opacity: 0.3; cursor: default; background: none; }
.stepper output { font-size: 15px; font-weight: 650; font-variant-numeric: tabular-nums; }

.group { margin: 10px 0 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--faint); }
.chips { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.chip {
  min-width: 0; display: flex; align-items: center; gap: 6px; padding: 7px 8px; border-radius: 11px; text-align: left;
  background: var(--chip); border: 1px solid transparent; color: var(--faint);
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.chip:hover { background: var(--chip-hover); }
.chip[aria-pressed="true"] { color: var(--text); background: var(--chip-on); border-color: var(--edge); }
.chip .dot { opacity: 0.35; }
.chip[aria-pressed="true"] .dot { opacity: 1; }
.chip .name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dot { width: 10px; height: 10px; border-radius: 50%; box-shadow: 0 0 0 1px var(--edge); flex: none; }
.here { width: 6px; height: 6px; border-radius: 50%; background: var(--live); flex: none; visibility: hidden; }
.here.on { visibility: visible; }

.segmented { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 2px; padding: 3px; background: var(--chip); border-radius: 12px; }
.segmented svg { width: 15px; height: 15px; }
.segmented button { padding: 7px 8px; border-radius: 9px; color: var(--muted); display: flex; align-items: center; justify-content: center; gap: 6px; transition: background 0.15s, color 0.15s; }
.segmented button:hover { color: var(--text); }
.segmented button[aria-pressed="true"] { background: var(--chip-on); color: var(--text); font-weight: 600; }

input[type="range"] { width: 100%; accent-color: var(--accent); margin: 0; }
.ends { display: flex; justify-content: space-between; font-size: 11px; color: var(--faint); margin-top: 2px; }

.watching { margin-top: 12px; padding: 12px; border-radius: 14px; background: var(--chip-on); border: 1px solid var(--edge); }
.watching .row { display: flex; align-items: center; gap: 6px; }
.watching .who { flex: 1; text-align: center; min-width: 0; }
.watching .who b { display: block; font-size: 14px; }
.watching .who span { color: var(--muted); font-size: 12px; }
.cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.card {
  display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: 8px; padding: 7px 10px; border-radius: 11px; min-width: 0;
  background: var(--chip); border: 1px solid transparent; text-align: left; transition: background 0.15s, border-color 0.15s;
}
.card:hover { background: var(--chip-hover); }
.card[aria-pressed="true"] { border-color: var(--accent); background: var(--chip-on); }
.card .name { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 550; }
/* Kept at the panel's foot as it scrolls: always in reach. */
.exporting { position: sticky; bottom: 0; padding: 10px 18px 14px; border-top: 1px solid var(--track); background: var(--foot); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
.export { width: 100%; padding: 10px; border-radius: 12px; background: var(--accent); color: var(--accent-ink); font-weight: 650; text-shadow: none; }
.export:disabled { opacity: 0.6; cursor: default; }
.note { margin-top: 8px; font-size: 12px; color: var(--muted); overflow-wrap: anywhere; user-select: text; }
.card .size { grid-column: 2; color: var(--muted); font-size: 11.5px; white-space: nowrap; font-variant-numeric: tabular-nums; }

footer { padding: 10px 18px 14px; border-top: 1px solid var(--track); color: var(--faint); font-size: 11.5px; display: flex; flex-wrap: wrap; gap: 4px 10px; }
kbd { font: 600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace; padding: 1px 5px; border-radius: 5px; background: var(--chip-on); color: var(--muted); }

.fab { width: 46px; height: 46px; border-radius: 16px; display: grid; place-items: center; color: var(--text); }
@media (hover: none) { footer { display: none; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;
function mountPanel(host, settings, change, inView, exportFile) {
  const root = document.createElement("div");
  host.appendChild(root);
  const shadow = root.attachShadow({ mode: "open" });
  const dot = (n) => `<span class="dot" style="background:${LABELS[n][2]}"></span>`;
  const seg = (name, label, options) => `<div class="segmented" role="group" aria-label="${label}">${options.map(([v, t]) => `<button type="button" data-${name}="${v}">${t}</button>`).join("")}</div>`;
  shadow.innerHTML = `<style>${CSS}</style>
  <div class="wrap">
    <div class="panel glass" id="panel" role="region" aria-label="Open Water controls">
      <header>
        <div class="title"><h1>Open Water</h1><div class="status" aria-live="polite"><span class="pulse"></span><span data-status></span></div></div>
        <button type="button" class="icon" data-theme-toggle></button>
        <button type="button" class="icon" data-pause></button>
        <button type="button" class="icon" data-collapse aria-label="Hide controls (H)" title="Hide (H)" aria-controls="panel">${ICONS.hide}</button>
      </header>
      <div class="modes" role="group" aria-label="Mode">
        <button type="button" data-mode="sea">Open sea</button>
        <button type="button" data-mode="watch">${ICONS.eye}Watch</button>
      </div>

      <div class="page" id="page-sea">
        <div class="block">
          <div class="label"><span>Animals at once</span><span class="hint">the school counts as 1</span></div>
          <div class="stepper"><button type="button" class="icon" data-less aria-label="Fewer animals">${ICONS.minus}</button><output data-count aria-live="polite"></output><button type="button" class="icon" data-more aria-label="More animals">${ICONS.plus}</button></div>
        </div>
        <div class="block">
          <div class="label"><span>Species that appear</span><span class="links"><button type="button" data-all>All</button><button type="button" data-none>None</button></span></div>
          ${GROUPS.map(([group, names]) => `<div class="group">${group}</div><div class="chips">${names.map((n) => `<button type="button" class="chip" data-kind="${n}" title="${LABELS[n][1]}">${dot(n)}<span class="name">${LABELS[n][0]}</span><span class="here" data-here="${n}" title="On screen now"></span></button>`).join("")}</div>`).join("")}
        </div>
      </div>

      <div class="page" id="page-watch">
        <div class="watching">
          <div class="row">
            <button type="button" class="icon" data-step="-1" aria-label="Previous animal (\u2190)" title="Previous (\u2190)">${ICONS.prev}</button>
            <div class="who"><b data-who></b><span data-who-size></span></div>
            <button type="button" class="icon" data-step="1" aria-label="Next animal (\u2192)" title="Next (\u2192)">${ICONS.next}</button>
          </div>
        </div>
        <div class="block pair"><span>Depth</span>${seg("level", "Depth", [["1", "Shallow"], ["2", "Mid"], ["3", "Deep"]])}</div>
        <div class="cards block">${ORDER.map((n) => `<button type="button" class="card" data-watch="${n}" title="${LABELS[n][1]}">${dot(n)}<span class="name">${LABELS[n][0]}</span><span class="size">${sizeOf2(n)}</span></button>`).join("")}</div>
      </div>

      <div class="shared">
        <div class="section">View</div>
        <div class="block pair"><span>Style</span>${seg("style", "Style", [["mosaic", "Mosaic"], ["smooth", "Smooth"]])}</div>
        <div class="block pair"><span>Surface</span>${seg("surface", "Surface", [["on", "Lit"], ["off", "Off"]])}</div>
        <div class="block pair"><span>Sea</span>${seg("colour", "Sea", [["on", "Blue"], ["off", "Mono"]])}</div>
        <div class="block">
          <div class="label"><label for="zoomOut">Distance</label><span class="hint" data-value="zoomOut"></span></div>
          <input id="zoomOut" type="range" min="0.6" max="3" step="0.1">
          <div class="ends"><span>Near</span><span>Far</span></div>
        </div>
        <div class="block" data-row="cell">
          <div class="label"><label for="cell">Mosaic tile</label><span class="hint" data-value="cell"></span></div>
          <input id="cell" type="range" min="6" max="20" step="1">
          <div class="ends"><span>Fine</span><span>Coarse</span></div>
        </div>
        <div class="block pair" data-row="grid"><span>Grid</span>${seg("grid", "Grid", [["on", "On"], ["off", "Off"]])}</div>
        <div class="block pair"><span>Speed</span>${seg("speed", "Speed", [["0.5", "0.5\xD7"], ["1", "1\xD7"], ["2", "2\xD7"]])}</div>
      </div>
      ${exportFile === void 0 ? "" : '<div class="exporting"><button type="button" class="export" data-export>Export</button><div class="note" data-export-note aria-live="polite"></div></div>'}

      <footer><span><kbd>Space</kbd> pause</span><span><kbd>H</kbd> hide</span><span><kbd>\u2190</kbd><kbd>\u2192</kbd> change animal</span><span><kbd>Esc</kbd> back to the sea</span></footer>
    </div>
    <button type="button" class="fab glass" data-open aria-label="Show controls (H)" title="Show controls (H)" aria-controls="panel">${ICONS.sliders}</button>
  </div>`;
  const $ = (sel) => shadow.querySelector(sel);
  const $$ = (sel) => [...shadow.querySelectorAll(sel)];
  const wrap = $(".wrap");
  let last = settings.observe ?? "white";
  const set = (patch) => {
    Object.assign(settings, patch);
    change(patch);
    refresh();
  };
  const watch = (name) => {
    if (name !== null) last = name;
    set({ observe: name });
  };
  const step = (by) => {
    const i = settings.observe === null ? by > 0 ? -1 : 0 : ORDER.indexOf(settings.observe);
    watch(ORDER[(i + by + ORDER.length) % ORDER.length]);
  };
  const toggle = (open) => {
    wrap.classList.toggle("closed", !open);
    $(open ? "[data-collapse]" : "[data-open]").focus();
  };
  function status() {
    const here = inView();
    const text = settings.observe !== null ? `Watching: ${LABELS[settings.observe][1]}` : settings.paused ? "Paused" : here.length === 0 ? "Waiting for the next animal" : `${here.length} ${here.length === 1 ? "animal" : "animals"} on screen`;
    $("[data-status]").textContent = text;
    wrap.classList.toggle("paused", settings.paused);
    for (const el of $$("[data-here]")) el.classList.toggle("on", settings.observe === null && here.includes(el.dataset.here));
  }
  function refresh() {
    wrap.classList.toggle("light", settings.theme === "light");
    const pause = $("[data-pause]");
    pause.innerHTML = settings.paused ? ICONS.play : ICONS.pause;
    pause.setAttribute("aria-label", settings.paused ? "Resume (space)" : "Pause (space)");
    pause.title = settings.paused ? "Resume (space)" : "Pause (space)";
    const watching = settings.observe !== null;
    for (const b of $$("[data-mode]")) b.setAttribute("aria-pressed", String(b.dataset.mode === "watch" === watching));
    $("#page-sea").hidden = watching;
    $("#page-watch").hidden = !watching;
    const count = $("[data-count]");
    count.textContent = String(settings.atOnce);
    $("[data-less]").disabled = settings.atOnce <= 1;
    $("[data-more]").disabled = settings.atOnce >= 8;
    for (const b of $$("[data-kind]")) b.setAttribute("aria-pressed", String(settings.species.includes(b.dataset.kind)));
    for (const b of $$("[data-speed]")) b.setAttribute("aria-pressed", String(Number(b.dataset.speed) === settings.speed));
    const theme = $("[data-theme-toggle]");
    const toLight = settings.theme === "dark";
    theme.innerHTML = toLight ? ICONS.sun : ICONS.moon;
    theme.setAttribute("aria-label", toLight ? "Light theme" : "Dark theme");
    theme.title = toLight ? "Light theme" : "Dark theme";
    for (const b of $$("[data-style]")) b.setAttribute("aria-pressed", String(b.dataset.style === settings.style));
    for (const b of $$("[data-level]")) b.setAttribute("aria-pressed", String(Number(b.dataset.level) === settings.level));
    for (const b of $$("[data-surface]")) b.setAttribute("aria-pressed", String(b.dataset.surface === "on" === settings.surface));
    for (const b of $$("[data-grid]")) b.setAttribute("aria-pressed", String(b.dataset.grid === "on" === settings.grid));
    for (const b of $$("[data-colour]")) b.setAttribute("aria-pressed", String(b.dataset.colour === "on" === settings.colour));
    for (const b of $$("[data-watch]")) b.setAttribute("aria-pressed", String(b.dataset.watch === settings.observe));
    if (settings.observe !== null) {
      $("[data-who]").textContent = LABELS[settings.observe][1];
      $("[data-who-size]").textContent = sizeOf2(settings.observe);
    }
    $("#zoomOut").value = String(settings.zoomOut);
    $('[data-value="zoomOut"]').textContent = `${settings.zoomOut.toFixed(1)}\xD7`;
    $("#cell").value = String(settings.cell);
    $('[data-value="cell"]').textContent = String(settings.cell);
    $('[data-row="cell"]').hidden = settings.style !== "mosaic";
    $('[data-row="grid"]').hidden = settings.style !== "mosaic";
    status();
  }
  shadow.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b === null) return;
    const d = b.dataset;
    if (d.mode !== void 0) watch(d.mode === "watch" ? settings.observe ?? last : null);
    else if (d.kind !== void 0) {
      const kind = d.kind;
      set({ species: settings.species.includes(kind) ? settings.species.filter((n) => n !== kind) : [...settings.species, kind] });
    } else if (d.watch !== void 0) watch(d.watch);
    else if (d.step !== void 0) step(Number(d.step));
    else if (d.speed !== void 0) set({ speed: Number(d.speed) });
    else if (b.hasAttribute("data-theme-toggle")) set({ theme: settings.theme === "dark" ? "light" : "dark" });
    else if (d.style !== void 0) set({ style: d.style });
    else if (d.level !== void 0) set({ level: Number(d.level) });
    else if (d.surface !== void 0) set({ surface: d.surface === "on" });
    else if (d.grid !== void 0) set({ grid: d.grid === "on" });
    else if (d.colour !== void 0) set({ colour: d.colour === "on" });
    else if (b.hasAttribute("data-pause")) set({ paused: !settings.paused });
    else if (b.hasAttribute("data-less")) set({ atOnce: Math.max(1, settings.atOnce - 1) });
    else if (b.hasAttribute("data-more")) set({ atOnce: Math.min(8, settings.atOnce + 1) });
    else if (b.hasAttribute("data-all")) set({ species: KINDS.map((k) => k.name) });
    else if (b.hasAttribute("data-none")) set({ species: [] });
    else if (b.hasAttribute("data-export") && exportFile !== void 0) {
      b.disabled = true;
      const note = $("[data-export-note]");
      exportFile().then((text) => note.textContent = text).catch((err) => note.textContent = `Could not export: ${String(err)}`).finally(() => b.disabled = false);
    } else if (b.hasAttribute("data-collapse")) toggle(false);
    else if (b.hasAttribute("data-open")) toggle(true);
  });
  shadow.addEventListener("input", (e) => {
    const input = e.target;
    if (input.id === "cell" || input.id === "zoomOut") set({ [input.id]: Number(input.value) });
  });
  const keys = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.composedPath()[0];
    const tag = t?.tagName ?? "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable === true) return;
    const onButton = tag === "BUTTON";
    if (e.key === " " && !onButton) set({ paused: !settings.paused });
    else if (e.key === "h" || e.key === "H") toggle(wrap.classList.contains("closed"));
    else if (e.key === "Escape" && settings.observe !== null) watch(null);
    else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && settings.observe !== null) step(e.key === "ArrowRight" ? 1 : -1);
    else return;
    e.preventDefault();
  };
  window.addEventListener("keydown", keys);
  const ticker = window.setInterval(status, 700);
  if (host.clientWidth < 640) wrap.classList.add("closed");
  refresh();
  return {
    remove: () => {
      window.removeEventListener("keydown", keys);
      clearInterval(ticker);
      root.remove();
    },
    covered: () => wrap.classList.contains("closed") ? 0 : host.getBoundingClientRect().right - $(".panel").getBoundingClientRect().left
  };
}

// src/index.ts
var LIGHT = OCEAN_DAY;
var FADE = 0.8;
var BLUR = 7;
var CAUSTIC_DAY = 0.26;
var CAUSTIC_NIGHT = 0.12;
var NETS = [
  [1, 9, 4],
  [1.37, -6, 7]
];
var SAVED = "open-water:settings";
var STEP3 = 1 / 60;
var MARGIN = 20;
var rgb = (r, g, b) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
var THEME_FADE = 0.6;
var hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
var mix = (a, b, k) => {
  const m = (i) => a[i] + (b[i] - a[i]) * k;
  return `rgba(${Math.round(m(0))},${Math.round(m(1))},${Math.round(m(2))},${m(3) ?? 1})`;
};
function causticNet() {
  const n = 128;
  const rand = rng(5);
  const seeds = Array.from({ length: 10 }, () => [rand() * n, rand() * n]);
  const img = new ImageData(n, n);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const wx = x + 5 * Math.sin(4 * Math.PI * y / n) + 3 * Math.sin(6 * Math.PI * (x + y) / n);
      const wy = y + 5 * Math.sin(4 * Math.PI * x / n) + 3 * Math.sin(6 * Math.PI * (x - y) / n);
      let d1 = Infinity;
      let d2 = Infinity;
      for (const [sx, sy] of seeds) {
        for (let ox = -n; ox <= n; ox += n) {
          for (let oy = -n; oy <= n; oy += n) {
            const d = Math.hypot(wx - sx - ox, wy - sy - oy);
            if (d < d1) [d1, d2] = [d, d1];
            else if (d < d2) d2 = d;
          }
        }
      }
      const i = (y * n + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.max(0, 1 - (d2 - d1) / 10) ** 3 * 255;
    }
  }
  return img;
}
function mountOpenWater(host, options = {}) {
  const settings = {
    theme: options.theme ?? "dark",
    style: options.style ?? "mosaic",
    zoomOut: options.zoomOut ?? 1.5,
    cell: options.cell ?? 10,
    atOnce: options.atOnce ?? 4,
    species: options.species ?? KINDS.map((k) => k.name),
    speed: options.speed ?? 1,
    paused: false,
    observe: null,
    level: 1,
    surface: options.surface ?? true,
    colour: options.colour ?? true,
    grid: options.grid ?? true
  };
  if (options.controls === true) {
    try {
      Object.assign(settings, JSON.parse(localStorage.getItem(SAVED) ?? "{}"), { paused: false });
    } catch {
    }
    const number = (v, lo, hi, fallback) => typeof v === "number" && v >= lo && v <= hi ? v : fallback;
    settings.theme = settings.theme === "light" ? "light" : "dark";
    settings.style = settings.style === "smooth" ? "smooth" : "mosaic";
    settings.zoomOut = number(settings.zoomOut, 0.6, 3, 1.5);
    settings.cell = number(settings.cell, 6, 20, 10);
    settings.atOnce = number(settings.atOnce, 1, 8, 4);
    settings.speed = [0.5, 1, 2].includes(settings.speed) ? settings.speed : 1;
    settings.surface = settings.surface !== false;
    settings.colour = settings.colour !== false;
    settings.grid = settings.grid !== false;
    settings.level = [1, 2, 3].includes(settings.level) ? settings.level : 1;
    settings.species = Array.isArray(settings.species) ? KINDS.map((k) => k.name).filter((n) => settings.species.includes(n)) : KINDS.map((k) => k.name);
    settings.observe = null;
  }
  const darkWater = options.background ?? OCEAN_NIGHT;
  const normalWidth = () => 1600 * Math.max(0.5, settings.zoomOut);
  const tiles = tileTable();
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  host.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const low = document.createElement("canvas");
  const lctx = low.getContext("2d", { willReadFrequently: true });
  const still = document.createElement("canvas");
  const layer = document.createElement("canvas");
  const lowLayer = document.createElement("canvas");
  const lowLayerCtx = lowLayer.getContext("2d", { willReadFrequently: true });
  const net = causticNet();
  const nets = /* @__PURE__ */ new Map();
  let clock = 0;
  let light = settings.theme === "light" ? 1 : 0;
  let lightTo = light;
  const lit = () => light * light * (3 - 2 * light);
  let sea;
  let scale = 1;
  let cols = 0;
  let rows = 0;
  let deep = new Float32Array(0);
  let watch;
  let panel;
  function rules() {
    sea.atOnce = settings.atOnce;
    sea.allowed = new Set(KINDS.flatMap((k, i) => settings.species.includes(k.name) ? [i] : []));
  }
  function layout() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(Math.max(1, host.clientWidth) * dpr);
    canvas.height = Math.round(Math.max(1, host.clientHeight) * dpr);
    const width = normalWidth();
    scale = canvas.width / width;
    sea = createSea(width, Math.round(canvas.height / scale));
    rules();
    water();
  }
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(Math.max(1, host.clientWidth) * dpr);
    const height = Math.round(Math.max(1, host.clientHeight) * dpr);
    if (width === canvas.width && height === canvas.height) return;
    canvas.width = width;
    canvas.height = height;
    scale = width / sea.w;
    const depth = Math.round(height / scale);
    shift(sea, 0, (depth - sea.h) / 2);
    sea.h = depth;
    water();
  }
  function rezoom() {
    const width = normalWidth();
    const depth = Math.round(canvas.height * width / canvas.width);
    shift(sea, (width - sea.w) / 2, (depth - sea.h) / 2);
    sea.w = width;
    sea.h = depth;
    scale = canvas.width / width;
    water();
  }
  function focusOf(a) {
    if (a.fish.length > 0) return middleOf(a.fish);
    const frames = spineOf(a);
    return frames[Math.floor(frames.length * 0.45)] ?? a;
  }
  function observe(name) {
    if (name === null) {
      watch = void 0;
      if (sea.w !== normalWidth()) {
        rezoom();
        return;
      }
    } else {
      const kind = KINDS.findIndex((k2) => k2.name === name);
      const k = KINDS[kind];
      const world = Math.max(framing(k, 3) * 4, 4e3);
      const own = createSea(world, Math.round(world * canvas.height / canvas.width));
      const a = place(own, kind);
      a.depth = a.dive = depthOf(settings.level);
      const focus = focusOf(a);
      watch = { sea: own, kind: k, view: framing(k, settings.zoomOut), x: focus.x, y: focus.y };
    }
    water();
  }
  function framing(k, zoomOut) {
    return (k.plan === "school" ? 1500 : Math.max(320, k.length * 2.2)) * (zoomOut / 1.5);
  }
  function view() {
    if (watch === void 0) return { animals: sea.animals, left: 0, top: 0, s: scale };
    const s = canvas.width / watch.view;
    const free = canvas.width - (panel?.covered() ?? 0) * (canvas.width / Math.max(1, host.clientWidth));
    return { animals: watch.sea.animals, left: watch.x - free / 2 / s, top: watch.y - canvas.height / s / 2, s };
  }
  function specks(v) {
    const g = watch.view / 6;
    const dpr = canvas.width / Math.max(1, host.clientWidth);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = mix([255, 255, 255, 0.18], [0, 0, 0, 0.14], lit());
    const right = v.left + canvas.width / v.s;
    const bottom = v.top + canvas.height / v.s;
    for (let gx = Math.floor(v.left / g); gx * g < right; gx += 1) {
      for (let gy = Math.floor(v.top / g); gy * g < bottom; gy += 1) {
        const rand = rng(Math.imul(gx, 73856093) ^ Math.imul(gy, 19349663));
        for (let i = 0; i < 3; i += 1) {
          const x = ((gx + rand()) * g - v.left) * v.s;
          const y = ((gy + rand()) * g - v.top) * v.s;
          ctx.fillRect(x, y, 3 * dpr, 1.2 * dpr);
        }
      }
    }
  }
  function water() {
    const cell = settings.cell;
    cols = Math.ceil(canvas.width / (cell * scale));
    rows = Math.ceil(canvas.height / (cell * scale));
    low.width = cols;
    low.height = rows;
    deep = new Float32Array(cols * rows);
    still.width = canvas.width;
    still.height = canvas.height;
    stillWater();
  }
  function stillWater() {
    const cell = settings.cell;
    const k = lit();
    const sctx = still.getContext("2d");
    sctx.fillStyle = mix([...hexRGB(settings.colour ? darkWater : MONO_NIGHT), 1], [...hexRGB(settings.colour ? LIGHT : MONO_DAY), 1], k);
    sctx.fillRect(0, 0, still.width, still.height);
    if (settings.style === "mosaic" && settings.grid) {
      sctx.strokeStyle = mix([255, 255, 255, 0.028], [0, 0, 0, 0.05], k);
      sctx.lineWidth = 1;
      sctx.beginPath();
      for (let c = 0; c <= cols; c += 1) {
        const x = Math.round(c * cell * scale) + 0.5;
        sctx.moveTo(x, 0);
        sctx.lineTo(x, still.height);
      }
      for (let r = 0; r <= rows; r += 1) {
        const y = Math.round(r * cell * scale) + 0.5;
        sctx.moveTo(0, y);
        sctx.lineTo(still.width, y);
      }
      sctx.stroke();
    }
    if (settings.style === "mosaic" && settings.grid && watch === void 0) {
      const rand = rng(99);
      sctx.fillStyle = mix([255, 255, 255, 0.2], [0, 0, 0, 0.12], k);
      for (let i = 0; i < 120; i += 1) {
        const x = Math.floor(rand() * cols) * cell;
        const y = Math.floor(rand() * rows) * cell;
        sctx.fillRect((x + cell * 0.3) * scale, (y + cell * 0.45) * scale, cell * 0.4 * scale, cell * 0.1 * scale);
      }
    }
  }
  function lay(onto, c, a, tile, s, left, top, blur) {
    const { width, height } = onto.canvas;
    if (c.canvas.width !== width || c.canvas.height !== height) {
      c.canvas.width = width;
      c.canvas.height = height;
    }
    const k = KINDS[a.kind];
    const discs = discsOf(a);
    const pad = (k.reach + 20) * s + blur * 2 + 2;
    let [l, t, r, b] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const d of discs) {
      l = Math.min(l, d.x - d.r);
      t = Math.min(t, d.y - d.r);
      r = Math.max(r, d.x + d.r);
      b = Math.max(b, d.y + d.r);
    }
    const x0 = Math.max(0, Math.floor((l - left) * s - pad));
    const y0 = Math.max(0, Math.floor((t - top) * s - pad));
    const x1 = Math.min(width, Math.ceil((r - left) * s + pad));
    const y1 = Math.min(height, Math.ceil((b - top) * s + pad));
    if (x1 <= x0 || y1 <= y0) return void 0;
    const [w, h] = [x1 - x0, y1 - y0];
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(x0, y0, w, h);
    const z = sizeOf(a.depth);
    c.setTransform(s * z, 0, 0, s * z, s * (1 - z) * a.x - left * s, s * (1 - z) * a.y - top * s);
    c.imageSmoothingEnabled = tile === 0;
    c.lineJoin = "round";
    DRAW[k.plan](c, a, tile);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "source-atop";
    c.globalAlpha = a.depth * (tile > 0 ? TINT : FADE);
    c.fillStyle = mix([...hexRGB(settings.colour ? DEEP_DARK : MONO_DEEP_DARK), 1], [...hexRGB(settings.colour ? DEEP_LIGHT : MONO_DEEP_LIGHT), 1], lit());
    c.fillRect(x0, y0, w, h);
    if (settings.surface) {
      const coarse = tile > 0 ? 2.5 : 1;
      c.globalAlpha = (1 - a.depth) ** 1.5 * (CAUSTIC_NIGHT + (CAUSTIC_DAY - CAUSTIC_NIGHT) * lit());
      let pattern = nets.get(c);
      if (pattern === void 0) {
        const source = document.createElement("canvas");
        source.width = net.width;
        source.height = net.height;
        source.getContext("2d", { willReadFrequently: c === lowLayerCtx }).putImageData(net, 0, 0);
        pattern = c.createPattern(source, "repeat");
        nets.set(c, pattern);
      }
      for (const [u, dx, dy] of NETS) {
        const q = u * coarse * s;
        pattern.setTransform(new DOMMatrix([q, 0, 0, q, (dx * clock - left) * s, (dy * clock - top) * s]));
        c.fillStyle = pattern;
        c.fillRect(x0, y0, w, h);
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    onto.setTransform(1, 0, 0, 1, 0, 0);
    if (blur >= 0.5) onto.filter = `blur(${blur.toFixed(1)}px)`;
    onto.drawImage(c.canvas, x0, y0, w, h, x0, y0, w, h);
    onto.filter = "none";
    return [x0, y0, w, h];
  }
  function paint() {
    const cell = settings.cell;
    const v = view();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(still, 0, 0);
    if (watch !== void 0) specks(v);
    const animals = [...v.animals].sort((a, b) => b.depth - a.depth);
    if (settings.style === "smooth") {
      const c = layer.getContext("2d");
      for (const a of animals) lay(ctx, c, a, 0, v.s, v.left, v.top, Math.max(0, a.depth - 0.25) * BLUR * v.s);
      return;
    }
    const tu = cell * scale / v.s;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, cols, rows);
    deep.fill(0);
    for (const a of animals) {
      const box = lay(lctx, lowLayerCtx, a, tu, 1 / tu, v.left, v.top, 0);
      if (box === void 0) continue;
      const [x0, y0, w, h] = box;
      const body = lowLayerCtx.getImageData(x0, y0, w, h).data;
      for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (body[(y * w + x) * 4 + 3] >= 128) deep[(y0 + y) * cols + x0 + x] = a.depth;
    }
    const px = lctx.getImageData(0, 0, cols, rows).data;
    const size = cell * scale;
    const k = lit();
    const inset = Math.max(0.5, size * 0.06);
    ctx.font = `700 ${Math.max(4, Math.round(size * 0.72))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const i = (r * cols + c) * 4;
        if (px[i + 3] < 128) continue;
        const tile = r % 16 * 16 + c % 16;
        const shade = tiles.shade[tile];
        const [cr, cg, cb] = [px[i], px[i + 1], px[i + 2]];
        const x = c * size;
        const y = r * size;
        ctx.globalAlpha = 1 - deep[r * cols + c] * CLEAR;
        ctx.fillStyle = rgb(cr * shade, cg * shade, cb * shade);
        ctx.fillRect(x + inset, y + inset, size - 2 * inset, size - 2 * inset);
        const g = tiles.glyph[tile];
        if (g !== "" && size >= 6) {
          ctx.fillStyle = mix([cr * GLYPH_INK, cg * GLYPH_INK, cb * GLYPH_INK, 1], [cr + (255 - cr) * GLYPH_LIFT, cg + (255 - cg) * GLYPH_LIFT, cb + (255 - cb) * GLYPH_LIFT, 1], k);
          ctx.fillText(g, x + size / 2, y + size / 2 + size * 0.04);
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  layout();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0;
  let last = performance.now();
  let owed = 0;
  const tick = (now) => {
    const dt = Math.min(0.25, (now - last) / 1e3);
    owed += settings.paused ? 0 : dt * settings.speed;
    last = now;
    let stepped = false;
    while (owed >= STEP3) {
      if (watch === void 0) {
        stepSea(sea, STEP3, MARGIN);
      } else {
        stepSea(watch.sea, STEP3, MARGIN);
        const a = watch.sea.animals[0];
        if (a !== void 0) {
          a.dive = depthOf(settings.level);
          const f = focusOf(a);
          watch.x += (f.x - watch.x) * 0.04;
          watch.y += (f.y - watch.y) * 0.04;
        }
      }
      owed -= STEP3;
      clock += STEP3;
      stepped = true;
    }
    const fading = light !== lightTo;
    if (fading) {
      light = light < lightTo ? Math.min(lightTo, light + dt / THEME_FADE) : Math.max(lightTo, light - dt / THEME_FADE);
      stillWater();
    }
    if (stepped || fading) paint();
    frame = requestAnimationFrame(tick);
  };
  if (reduced.matches) {
    for (let i = 0; i < 1500; i += 1) stepSea(sea, STEP3, MARGIN);
    paint();
  } else {
    paint();
    frame = requestAnimationFrame(tick);
  }
  const observer = new ResizeObserver(() => {
    resize();
    paint();
  });
  observer.observe(host);
  function apply(patch) {
    if (patch.zoomOut !== void 0) {
      if (watch !== void 0) {
        watch.view = framing(watch.kind, settings.zoomOut);
      } else {
        rezoom();
      }
    }
    if (patch.observe !== void 0) observe(patch.observe);
    if (patch.theme !== void 0) {
      lightTo = settings.theme === "light" ? 1 : 0;
      if (reduced.matches) {
        light = lightTo;
        stillWater();
      }
    }
    if (patch.style !== void 0 || patch.cell !== void 0 || patch.grid !== void 0 || patch.colour !== void 0) water();
    if (patch.species !== void 0 || patch.atOnce !== void 0) {
      rules();
      const oldest = [...sea.animals].sort((a, b) => b.age - a.age);
      oldest.forEach((a, i) => {
        if (!sea.allowed.has(a.kind) || i < sea.animals.length - sea.atOnce) a.stay = 0;
      });
    }
    paint();
    try {
      localStorage.setItem(SAVED, JSON.stringify(settings));
    } catch {
    }
  }
  panel = options.controls === true ? mountPanel(host, settings, apply, () => [...new Set(sea.animals.map((a) => KINDS[a.kind].name))]) : void 0;
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    canvas.remove();
    panel?.remove();
  };
}
export {
  mountOpenWater
};
