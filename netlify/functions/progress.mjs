// Netlify Function: /api/progress
// 按「游戏账号」存全量档案到 Netlify Blobs，手机 / 电脑登录同一账号读到同一份进度。
// GET    ?account=x        -> { ok:true, profile } 或 { ok:false, notFound:true }
// POST   { account, profile } -> 合并后 upsert，返回 { ok:true, profile }
// DELETE ?account=x        -> 删除该账号云端存档
//
// 严格计时：playedMs 只增不减（防回退 / 防篡改），completedMs 取较小（越快越好）。

import { getStore } from "@netlify/blobs";

const STORE_NAME = "history-fun";
const PREFIX = "player:";
const GRADE = { S: 4, A: 3, B: 2, C: 1 };

function reply(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

function store() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0;
}
function obj(v) { return (v && typeof v === "object" && !Array.isArray(v)) ? v : {}; }
function arr(v) { return Array.isArray(v) ? v : []; }
function str(v, max) { return String(v == null ? "" : v).slice(0, max || 40); }

function minMs(a, b) {
  const va = (a == null) ? null : num(a);
  const vb = (b == null) ? null : num(b);
  if (va == null) return vb;
  if (vb == null) return va;
  return Math.min(va, vb);
}

function cardKey(c, i) {
  if (!c || typeof c !== "object") return "x" + i;
  return [str(c.id, 60), c.ts != null ? num(c.ts) : "", str(c.source, 20), str(c.name, 40)].join("|");
}

function mergeCards(a, b) {
  const out = [], seen = {};
  arr(a).concat(arr(b)).forEach(function (c, i) {
    if (!c || typeof c !== "object") return;
    const k = cardKey(c, i);
    if (seen[k]) return;
    seen[k] = 1;
    out.push({
      id: str(c.id, 60), name: str(c.name, 40), role: str(c.role, 40),
      dynasty: str(c.dynasty, 40), source: str(c.source, 20), ts: num(c.ts)
    });
  });
  return out.slice(0, 500);
}

function mergeReviews(a, b) {
  const map = {};
  arr(a).concat(arr(b)).forEach(function (r) {
    if (!r || typeof r !== "object") return;
    const q = str(r.q, 200);
    if (!q) return;
    const old = map[q];
    if (!old || num(r.wrong) > num(old.wrong)) {
      map[q] = { q: q, a: str(r.a, 200), due: str(r.due, 20), wrong: num(r.wrong) };
    }
  });
  return Object.keys(map).slice(0, 200).map(function (k) { return map[k]; });
}

function mergeGrades(a, b) {
  const x = obj(a), y = obj(b), out = {};
  Object.keys(Object.assign({}, x, y)).slice(0, 200).forEach(function (k) {
    const key = str(k, 60);
    out[key] = (GRADE[x[k]] || 0) >= (GRADE[y[k]] || 0) ? x[k] : y[k];
  });
  return out;
}

// 线索推理：已出过的提示 id 取并集（每台设备出题后就上传，避免重复）
function mergeClueUsed(a, b) {
  const out = [], seen = {};
  arr(a).concat(arr(b)).forEach(function (x) {
    const id = str(x, 80);
    if (id && !seen[id]) { seen[id] = 1; out.push(id); }
  });
  return out.slice(0, 2000);
}

function mergeClueStats(a, b) {
  const x = obj(a), y = obj(b);
  return {
    asked: Math.max(num(x.asked), num(y.asked)),
    solved: Math.max(num(x.solved), num(y.solved)),
    firstTry: Math.max(num(x.firstTry), num(y.firstTry))
  };
}

// 只保留业务字段，丢弃运行期状态（playing / lastTick / lastActive / _clock 等）
function sanitize(account, raw) {
  const src = obj(raw);
  const mod = obj(src.modCards);
  return {
    account: account,
    nick: str(src.nick || account, 12),
    createdAt: num(src.createdAt),
    xp: num(src.xp),
    streak: num(src.streak),
    lastDay: str(src.lastDay, 20),
    badges: obj(src.badges),
    reviews: mergeReviews(src.reviews, []),
    theaterBest: obj(src.theaterBest),
    cards: mergeCards(src.cards, []),
    modCards: { quiz: num(mod.quiz), drag: num(mod.drag), theater: num(mod.theater), clue: num(mod.clue) },
    fragments: num(src.fragments),
    fragShown: num(src.fragShown),
    introSeen: !!src.introSeen,
    clueUsed: mergeClueUsed(src.clueUsed, []),
    clueStats: mergeClueStats(src.clueStats, {}),
    playedMs: num(src.playedMs),
    completed: !!src.completed,
    completedMs: src.completedMs == null ? null : num(src.completedMs),
    updatedAt: Date.now()
  };
}

// 字段级合并：多设备交替玩不丢进度；数值只增 / 时间只取更优，防止回退与刷榜
function merge(old, inc) {
  if (!old || typeof old !== "object") return inc;

  // 重新开始挑战会生成更大的 createdAt，视为新一轮：以新档为准（但累计时长不回退）。
  // 两端都必须带有效 createdAt 才判定，避免旧版/异常请求被误当成重开而清空进度。
  const incCreated = num(inc.createdAt), oldCreated = num(old.createdAt);
  if (incCreated > 0 && oldCreated > 0 && incCreated > oldCreated + 1000) {
    return Object.assign({}, inc, { playedMs: Math.max(num(old.playedMs), num(inc.playedMs)) });
  }

  const out = Object.assign({}, inc);
  out.playedMs = Math.max(num(old.playedMs), num(inc.playedMs));
  out.xp = Math.max(num(old.xp), num(inc.xp));
  out.fragments = Math.max(num(old.fragments), num(inc.fragments));
  out.fragShown = Math.max(num(old.fragShown), num(inc.fragShown));
  out.introSeen = !!(old.introSeen || inc.introSeen);
  out.completed = !!(old.completed || inc.completed);
  out.completedMs = minMs(old.completedMs, inc.completedMs);
  out.badges = Object.assign({}, obj(old.badges), obj(inc.badges));
  out.theaterBest = mergeGrades(old.theaterBest, inc.theaterBest);
  out.reviews = mergeReviews(old.reviews, inc.reviews);
  out.cards = mergeCards(old.cards, inc.cards);
  out.clueUsed = mergeClueUsed(old.clueUsed, inc.clueUsed);
  out.clueStats = mergeClueStats(old.clueStats, inc.clueStats);

  const om = obj(old.modCards), im = obj(inc.modCards);
  out.modCards = {
    quiz: Math.max(num(om.quiz), num(im.quiz)),
    drag: Math.max(num(om.drag), num(im.drag)),
    theater: Math.max(num(om.theater), num(im.theater)),
    clue: Math.max(num(om.clue), num(im.clue))
  };

  const dayOld = str(old.lastDay, 20), dayInc = str(inc.lastDay, 20);
  if (dayInc >= dayOld) {
    out.lastDay = dayInc;
    out.streak = Math.max(num(old.streak), num(inc.streak));
  } else {
    out.lastDay = dayOld;
    out.streak = num(old.streak);
  }

  out.nick = inc.nick || old.nick || inc.account;
  out.createdAt = num(old.createdAt) || inc.createdAt;
  out.updatedAt = Date.now();
  return out;
}

export default async function (req) {
  const method = (req.method || "GET").toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS"
      }
    });
  }

  let url;
  try { url = new URL(req.url); } catch (e) { url = new URL(req.url, "https://local.invalid"); }
  const account = str(url.searchParams.get("account") || "", 20);
  const s = store();

  if (method === "GET") {
    if (!account) return reply({ ok: false, msg: "missing account" }, 400);
    const p = await s.get(PREFIX + account, { type: "json", consistency: "strong" });
    if (!p) return reply({ ok: false, notFound: true });
    return reply({ ok: true, profile: p });
  }

  if (method === "POST") {
    const body = await req.text();
    if (body.length > 200000) return reply({ ok: false, msg: "payload too large" }, 413);
    let data;
    try { data = JSON.parse(body); } catch (e) { return reply({ ok: false, msg: "bad json" }, 400); }
    if (!data || typeof data !== "object") return reply({ ok: false, msg: "bad payload" }, 400);
    const acc = str(data.account || "", 20);
    if (!acc || !/^[^\/\\:\x00-\x1f]{1,20}$/.test(acc)) return reply({ ok: false, msg: "invalid account" }, 400);

    const inc = sanitize(acc, data.profile);
    const old = await s.get(PREFIX + acc, { type: "json", consistency: "strong" });
    const merged = merge(old, inc);
    await s.setJSON(PREFIX + acc, merged);
    return reply({ ok: true, profile: merged });
  }

  if (method === "DELETE") {
    if (!account) return reply({ ok: false, msg: "missing account" }, 400);
    await s.delete(PREFIX + account);
    return reply({ ok: true });
  }

  return reply({ ok: false, msg: "method not allowed" }, 405);
}
