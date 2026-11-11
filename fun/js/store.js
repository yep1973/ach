/* ============================================================
   趣味历史乐园 · 存档与激励层（localStorage）
   —— 多账号版：每个昵称一份进度，支持登出/再登录续玩。
   负责：等级/经验、每日连击、徽章、卡牌收藏(可重复)、地图碎片、
        总游戏计时、终极目标完成与排名。主系统零改动。
   ============================================================ */
(function () {
  "use strict";

  var KEY = "fun_campaign_v1";        // { current, players:{ nick:profile } }
  var SAVE_EVERY = 2;                 // 每 N 秒落盘一次（计时精度足够）

  // —— 云端同步（Netlify Functions /api + Netlify Blobs）——
  // 按「游戏账号」把完整档案存到云端，手机 / 电脑登录同一账号读到同一份进度。
  // 默认同源 /api；可通过 window.FUN_API_BASE 覆盖为自定义域名。
  // 云端不可用时自动降级 localStorage，游戏照常进行，不阻塞。
  var API = (window.FUN_API_BASE) || "/api";
  var CLOUD_ON = true;                // 关闭云端：设为 false 即纯本地
  var _lastSync = 0;                  // 云端节流时间戳
  var _syncing = false;               // 登录拉取期间禁止推送，避免本地空档覆盖云端
  var SYNC_TIMEOUT = 4000;            // 拉取超时（毫秒），超时后照常用本地档进入游戏

  // 徽章定义
  var BADGES = {
    rookie:    { name: "初出茅庐", desc: "完成第一次闯关", icon: "🌱" },
    perfect:   { name: "百发百中", desc: "一次闯关全对",   icon: "🎯" },
    timeline:  { name: "时间大师", desc: "时间轴排序满分", icon: "⏳" },
    matcher:   { name: "配对高手", desc: "连连看零失误",   icon: "🔗" },
    puzzle:    { name: "拼图达人", desc: "复原一张历史地图", icon: "🗺️" },
    collector: { name: "收藏家",   desc: "集齐 10 位人物卡", icon: "🃏" },
    streak3:   { name: "持之以恒", desc: "连续打卡 3 天",   icon: "🔥" },
    theater:   { name: "剧情大师", desc: "完成一次穿越剧场", icon: "🎭" },
    pioneer:   { name: "九州绘成", desc: "集齐 20 片中国地图碎片", icon: "🧩" },
    conqueror: { name: "一统江山", desc: "完成中国地图拼图，通关！", icon: "👑" }
  };

  /* ---------------- 持久化 ---------------- */
  var box = loadAll();

  function loadAll() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return { current: null, players: {} };
      var s = JSON.parse(raw);
      if (!s.players) s.players = {};
      if (!("current" in s)) s.current = null;
      // 运行期计时句柄（setInterval 的 ID）不持久化。
      // 否则重载后 box._clock 残留旧 ID（已是死句柄），会让 startClock 误判“已在计时”而不重启时钟，
      // 表现为“退出再进入后时间不走”。
      delete s._clock;
      delete s._saveAcc;
      return s;
    } catch (e) { return { current: null, players: {} }; }
  }
  function saveLocal() {
    // 兜底：始终写 localStorage——保证离线/云端未就绪也能玩，并保持计时修复逻辑（_clock 不入库）
    try {
      var clone = {};
      for (var k in box) { if (k === "_clock" || k === "_saveAcc") continue; clone[k] = box[k]; }
      localStorage.setItem(KEY, JSON.stringify(clone));
    } catch (e) {}
  }
  function saveAll() { saveLocal(); syncPush(false); }
  // 关键节点强制同步（退出 / 通关 / 重开）：不受 15 秒节流限制，keepalive 保证页面跳转后仍能送达
  function flush() { saveLocal(); syncPush(true); }

  // 上传的完整业务档案：不含 playing / lastTick / lastActive 等运行期状态
  function cloudProfile(p) {
    return {
      account: p.account, nick: p.nick, createdAt: p.createdAt,
      xp: p.xp, streak: p.streak, lastDay: p.lastDay,
      badges: p.badges || {}, reviews: p.reviews || [],
      theaterBest: p.theaterBest || {}, cards: p.cards || [],
      modCards: p.modCards || {}, fragments: p.fragments,
      fragShown: p.fragShown, introSeen: p.introSeen,
      playedMs: p.playedMs, completed: p.completed, completedMs: p.completedMs
    };
  }

  // 云端同步（best-effort，失败静默）：节流 + 关键事件强制
  function syncPush(force) {
    if (!CLOUD_ON || _syncing) return;
    var now = Date.now();
    if (!force && now - _lastSync < 15000) return;   // 每 15 秒至多推送一次，省额度
    var acc = box.current;
    if (!acc || !box.players[acc]) return;
    _lastSync = now;
    var payload = { account: acc, profile: cloudProfile(normalize(box.players[acc])) };
    try {
      fetch(API + "/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        cache: "no-store"
      }).catch(function () {});
    } catch (e) {}
  }

  // 本地与云端卡牌并集（按 id+ts+source 去重），防止后台刷新时覆盖刚抽到的卡
  function mergeCardArrays(a, b) {
    var out = [], seen = {};
    (a || []).concat(b || []).forEach(function (c) {
      if (!c || typeof c !== "object") return;
      var k = [c.id || "", c.ts || "", c.source || "", c.name || ""].join("|");
      if (seen[k]) return;
      seen[k] = 1; out.push(c);
    });
    return out.slice(0, 500);
  }
  function maxN(a, b) { return Math.max(Number(a) || 0, Number(b) || 0); }
  function minMs2(a, b) {
    if (a == null) return b;
    if (b == null) return a;
    return Math.min(a, b);
  }

  // 把云端档案应用到本地：
  // strict=true（新设备登录）→ 完全以云端为准，仅保护累计时长；
  // strict=false（后台刷新）  → 合并本地尚未上传的增量，避免覆盖刚获得的进度。
  function applyRemote(account, remote, strict) {
    var local = box.players[account] ? normalize(box.players[account]) : null;
    var p = normalize(remote);
    p.account = account;
    if (!p.nick) p.nick = local ? local.nick : account;

    if (local && strict) {
      // 严格计时：取两端较大值，防止切设备丢时长或被较小值回退
      p.playedMs = maxN(local.playedMs, p.playedMs);
      p.playing = !!local.playing;
    } else if (local) {
      p.playedMs = maxN(local.playedMs, p.playedMs);
      p.xp = maxN(local.xp, p.xp);
      p.fragments = maxN(local.fragments, p.fragments);
      p.fragShown = maxN(local.fragShown, p.fragShown);
      p.introSeen = !!(local.introSeen || p.introSeen);
      p.completed = !!(local.completed || p.completed);
      p.completedMs = minMs2(local.completedMs, p.completedMs);
      p.badges = Object.assign({}, p.badges || {}, local.badges || {});
      p.theaterBest = Object.assign({}, p.theaterBest || {}, local.theaterBest || {});
      p.reviews = ((local.reviews || []).length > (p.reviews || []).length) ? local.reviews : p.reviews;
      p.cards = mergeCardArrays(p.cards, local.cards);
      var lm = local.modCards || {}, rm = p.modCards || {};
      p.modCards = {
        quiz: maxN(lm.quiz, rm.quiz), drag: maxN(lm.drag, rm.drag), theater: maxN(lm.theater, rm.theater)
      };
      p.playing = !!local.playing;
    }

    p.lastTick = Date.now();      // 重置心跳戳：离线时长不计入
    p.lastActive = Date.now();
    box.players[account] = p;
    saveLocal();                  // 只写本地，不回推，避免同步环
    notifySynced();
  }

  function notifySynced() {
    try {
      if (window.FunUI) {
        if (FunUI.refreshHUD) FunUI.refreshHUD();
        if (FunUI.renderAccount) FunUI.renderAccount();
      }
      if (window.FunCampaign && FunCampaign.refreshFooter) FunCampaign.refreshFooter();
    } catch (e) {}
  }

  // 登录时阻塞式拉取云端最新档案（跨设备续玩的关键）：
  // 必须等云端返回后再渲染游戏界面，否则手机会先显示一份空白/陈旧的本地档。
  // 云端不可用 / 超时则照常用本地档进入，不阻塞游戏。
  function syncFromCloud(account, cb, strict) {
    cb = cb || function () {};
    if (!CLOUD_ON || !account) { cb(false); return; }
    _syncing = true;
    var done = false, timer = null;
    function finish(ok) {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      _syncing = false;
      cb(ok);
    }
    timer = setTimeout(function () { finish(false); }, SYNC_TIMEOUT);
    try {
      fetch(API + "/progress?account=" + encodeURIComponent(account) + "&t=" + Date.now(), { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var ok = !!(d && d.ok && d.profile);
          if (ok) applyRemote(account, d.profile, !!strict);
          finish(ok);
        })
        .catch(function () { finish(false); });
    } catch (e) { finish(false); }
  }

  // 后台刷新（页面重新可见、刷新页面后自动登录时用）：合并式，不丢本地未上传增量
  function syncPull(account) { syncFromCloud(account, function () {}, false); }

  // 删除账号时同步删除云端档案，避免另一台设备又拉回旧存档
  function syncDelete(account) {
    if (!CLOUD_ON || !account) return;
    try {
      fetch(API + "/progress?account=" + encodeURIComponent(account), { method: "DELETE", keepalive: true })
        .catch(function () {});
    } catch (e) {}
  }

  // 云端排行榜（TOP 50，按通关用时升序）。返回 null 表示云端不可用，调用方回退本地榜
  function cloudRanking(cb) {
    if (!CLOUD_ON) { if (cb) cb(null); return; }
    try {
      fetch(API + "/leaderboard", { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (cb) cb((d && d.ok && Array.isArray(d.list)) ? d.list : null); })
        .catch(function () { if (cb) cb(null); });
    } catch (e) { if (cb) cb(null); }
  }

  function defaultProfile(account, nick) {
    return {
      account: account || "",
      nick: nick || account || "",
      createdAt: Date.now(),
      xp: 0,
      streak: 0,
      lastDay: "",
      badges: {},
      reviews: [],
      theaterBest: {},              // scenarioId -> grade
      cards: [],                    // 每张掉落卡 {id,name,role,dynasty,source,ts}（可重复）
      modCards: { quiz: 0, drag: 0, theater: 0 }, // 各模块已产卡数（受上限约束）
      fragments: 0,                 // 0..20
      fragShown: 0,                 // 已展示过阶段提醒的碎片数
      introSeen: false,             // 是否看过游戏目标
      playedMs: 0,                  // 累计游戏时长
      lastTick: 0,                  // 计时心跳戳
      playing: false,               // 是否处于“游戏中”（在玩法界面则计Tick）
      completed: false,
      completedMs: null,
      lastActive: Date.now()
    };
  }

  // 将任意（可能是旧版本遗留的）存档对象补全为标准 profile，
  // 避免旧档缺少 cards/fragments/modCards 等字段导致 uniqueCards()/awardCards() 抛错
  // （表现为：藏馆空白、发卡与碎片合成失效）。仅补全缺失字段，保留已有值。
  function normalize(p) {
    if (!p || typeof p !== "object") p = {};
    var d = defaultProfile(p.account || "__guest__", p.nick || "__guest__");
    for (var k in d) { if (!(k in p)) p[k] = d[k]; }
    if (!p.modCards || typeof p.modCards !== "object") p.modCards = {};
    ["quiz", "drag", "theater"].forEach(function (m) {
      if (typeof p.modCards[m] !== "number" || p.modCards[m] < 0) p.modCards[m] = 0;
    });
    if (!Array.isArray(p.cards)) p.cards = [];
    if (!p.badges || typeof p.badges !== "object") p.badges = {};
    if (!p.theaterBest || typeof p.theaterBest !== "object") p.theaterBest = {};
    if (!Array.isArray(p.reviews)) p.reviews = [];
    return p;
  }

  /* ---------------- 等级 / 经验 ---------------- */
  function getLevel() { return 1 + Math.floor(cur().xp / 200); }
  function xpInLevel() { return cur().xp % 200; }
  function xpForLevel() { return 200; }

  function addXp(amount) {
    var p = cur();
    var before = getLevel();
    p.xp += amount;
    saveAll();
    return getLevel() > before;
  }

  /* ---------------- 每日连击 ---------------- */
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  function tickDaily() {
    var p = cur();
    var t = todayStr();
    if (p.lastDay === t) return p.streak;
    var y = new Date(); y.setDate(y.getDate() - 1);
    var yStr = y.getFullYear() + "-" + (y.getMonth() + 1) + "-" + y.getDate();
    if (p.lastDay === yStr) p.streak += 1; else p.streak = 1;
    p.lastDay = t;
    saveAll();
    if (p.streak >= 3) award("streak3");
    return p.streak;
  }

  /* ---------------- 徽章 ---------------- */
  function award(id) {
    var p = cur();
    if (BADGES[id] && !p.badges[id]) { p.badges[id] = true; saveAll(); return true; }
    return false;
  }
  function hasBadge(id) { return !!cur().badges[id]; }
  function badgeCount() { return Object.keys(cur().badges).length; }

  /* ---------------- 卡牌 / 碎片 ---------------- */
  function totalCards() { return cur().cards.length; }              // 含重复：驱动碎片
  function uniqueCards() {                                           // 去重：图鉴展示
    var seen = {}, out = [];
    cur().cards.forEach(function (c) { if (!seen[c.id]) { seen[c.id] = 1; out.push(c); } });
    return out;
  }
  function cardCount() { return uniqueCards().length; }

  // 优先抽到尚未拥有的独特人物，集满图鉴；否则随机（允许重复，仍计入碎片）
  function pickCard(dynId, preferId) {
    var D = window.FunData;
    var ns = D ? D.notablesOf(dynId) : [];
    if (!ns.length) return null;
    if (preferId) {
      for (var i = 0; i < ns.length; i++) if (ns[i].id === preferId) return ns[i];
    }
    var owned = {};
    cur().cards.forEach(function (c) { owned[c.id] = 1; });
    var fresh = ns.filter(function (n) { return !owned[n.id]; });
    var pool = fresh.length ? fresh : ns;
    var n = pool[Math.floor(Math.random() * pool.length)];
    return { id: n.id, name: n.name, role: n.role || "", dynasty: n.dynasty };
  }

  // 核心发卡：受「模块上限」与「全局 200 上限」双重约束
  // 返回 { awarded, cards:[...], fragGained, capHit, globalHit }
  function awardCards(module, count, dynId, opts) {
    opts = opts || {};
    var p = cur();
    var CAP = (window.FunCampaign && window.FunCampaign.CONFIG && window.FunCampaign.CONFIG.MODULE_CAPS) || { quiz: 90, drag: 60, theater: 50 };
    var TOTAL_FRAG = (window.FunCampaign && window.FunCampaign.CONFIG && window.FunCampaign.CONFIG.FRAGMENTS_TOTAL) || 20;
    var PER = (window.FunCampaign && window.FunCampaign.CONFIG && window.FunCampaign.CONFIG.CARDS_PER_FRAGMENT) || 10;
    var globalMax = TOTAL_FRAG * PER;          // 200
    var out = { awarded: 0, cards: [], fragGained: 0, capHit: false, globalHit: false };
    if (p.completed) return out;

    var room = globalMax - p.cards.length;     // 距全局上限
    var modRoom = (CAP[module] || 0) - (p.modCards[module] || 0);
    var can = Math.min(count, room, modRoom);
    if (can <= 0) {
      if (room <= 0) out.globalHit = true; else out.capHit = true;
      return out;
    }
    for (var k = 0; k < can; k++) {
      var picked = pickCard(dynId, opts.preferId);
      if (!picked) break;
      picked.source = module;
      picked.ts = Date.now();
      p.cards.push(picked);
      p.modCards[module] = (p.modCards[module] || 0) + 1;
      out.cards.push(picked);
      out.awarded++;
    }
    // 碎片合成
    var newFrag = Math.min(TOTAL_FRAG, Math.floor(p.cards.length / PER));
    out.fragGained = newFrag - p.fragments;
    p.fragments = newFrag;
    if (p.fragments >= TOTAL_FRAG) award("pioneer");
    if (cardCount() >= 10) award("collector");
    saveAll();
    return out;
  }

  // 兼容旧调用：仅往图鉴加入一张独特卡（不驱动碎片）
  function addCard(card) {
    if (!card || !card.id) return false;
    var p = cur();
    var exists = p.cards.some(function (c) { return c.id === card.id; });
    if (exists) return false;
    p.cards.push({ id: card.id, name: card.name, role: card.role || "", dynasty: card.dynasty || "", source: "gift", ts: Date.now() });
    if (cardCount() >= 10) award("collector");
    saveAll();
    return true;
  }

  /* ---------------- 间隔复习 ---------------- */
  function addReview(item) {
    var p = cur();
    var exist = p.reviews.filter(function (r) { return r.q === item.q; })[0];
    var due = todayStr();
    if (exist) { exist.wrong += 1; exist.due = due; }
    else p.reviews.push({ q: item.q, a: item.a, due: due, wrong: 1 });
    saveAll();
  }
  function dueReviews() {
    var t = todayStr();
    return cur().reviews.filter(function (r) { return r.due <= t; });
  }
  function reviewDone(q) {
    var p = cur();
    var r = p.reviews.filter(function (x) { return x.q === q; })[0];
    if (!r) return;
    var d = new Date(); d.setDate(d.getDate() + 2);
    r.due = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    saveAll();
  }

  /* ---------------- 穿越剧场 ---------------- */
  var GRADE_RANK = { S: 4, A: 3, B: 2, C: 1 };
  function theaterBest(id) { var t = cur().theaterBest; return t[id] ? t[id] : null; }
  function theaterClear(id, grade) {
    var p = cur();
    var rec = p.theaterBest[id] || null;
    var first = !rec;
    var improved = !rec || GRADE_RANK[grade] > GRADE_RANK[rec];
    if (improved) p.theaterBest[id] = grade;
    saveAll();
    var badge = award("theater");
    return { first: first, badge: badge, best: p.theaterBest[id] };
  }

  /* ---------------- 计时心跳 ---------------- */
  function startClock() {
    if (box._clock) return;
    box._clock = setInterval(function () {
      var p = current();
      if (!p || p.completed) return;
      if (!p.playing) { p.lastTick = Date.now(); return; }
      if (document.visibilityState && document.visibilityState !== "visible") { p.lastTick = Date.now(); return; }
      var now = Date.now();
      var dt = now - (p.lastTick || now);
      if (dt > 0 && dt < 60000) p.playedMs += dt;   // 丢弃异常大跳变
      p.lastTick = now;
      box._saveAcc = (box._saveAcc || 0) + 1;
      if (box._saveAcc % SAVE_EVERY === 0) { saveAll(); if (window.FunCampaign) window.FunCampaign.refreshFooter(); }
    }, 1000);
  }

  /* ---------------- 账号 ---------------- */
  function current() { return box.current ? normalize(box.players[box.current]) : null; }
  function cur() { return current() || defaultProfile("__guest__"); }

  function listPlayers() { return Object.keys(box.players).map(function (n) { return box.players[n]; }); }

  // 登录或注册：游戏账号（唯一键）存在则续玩，不存在则新建；昵称为展示名
  function loginOrCreate(account, nick) {
    account = (account || "").trim();
    nick = (nick || "").trim();
    if (!account) return { ok: false, msg: "游戏账号不能为空" };
    if (account.length > 20) return { ok: false, msg: "游戏账号最多 20 个字符" };
    if (!nick) return { ok: false, msg: "昵称不能为空" };
    if (nick.length > 12) return { ok: false, msg: "昵称最多 12 个字" };
    var p = box.players[account];
    var created = false;
    if (!p) { p = defaultProfile(account, nick); box.players[account] = p; created = true; }
    else { p = normalize(p); p.nick = nick; box.players[account] = p; }   // 旧档续玩：补全缺失字段，并更新昵称
    box.current = account;
    p.lastActive = Date.now();
    p.lastTick = Date.now();
    p.playing = false;
    saveLocal();   // 登录时只写本地：须等 syncFromCloud 拉回云端档案后再推送，
                   // 否则新设备上的空白档会把云端已有进度覆盖掉。
    return { ok: true, created: created, profile: p };
  }
  function logout() {
    if (box.current) { var p = box.players[box.current]; if (p) { p.playing = false; p.lastTick = Date.now(); } }
    flush();          // 先强制上传（此刻仍有 current），否则退出前最后的计时会被 15s 节流吞掉
    box.current = null;
    saveLocal();
    _lastSync = 0;
  }

  // 暂时退出（点击“返回学习系统”用）：暂停游戏计时、清空当前活动会话，
  // 但完整保留账号与全部进度数据。用户之后再次进入游戏、输入相同游戏账号即可续玩。
  function tempExit() {
    var p = current();
    if (p) { p.playing = false; p.lastTick = Date.now(); p.lastActive = Date.now(); }
    flush();          // 页面即将跳转，keepalive 保证这次同步仍能送达
    box.current = null;
    saveLocal();
    _lastSync = 0;
  }
  function exists(account) { return !!(box.players[(account || "").trim()]); }

  function markPlaying(on) {
    var p = current();
    if (!p) return;
    p.playing = !!on;
    p.lastTick = Date.now();
    saveAll();
  }

  function complete() {
    var p = current();
    if (!p) return;
    p.completed = true;
    p.playing = false;
    p.completedMs = p.playedMs;
    award("conqueror");
    flush();
  }

  // 重新开始挑战：清空进度但保留账号与昵称
  function resetProgress() {
    var p = current();
    if (!p) return;
    var acc = p.account || p.nick;
    box.players[acc] = defaultProfile(acc, p.nick);
    box.players[acc].introSeen = true; // 重开不再弹目标
    box.current = acc;
    flush();
  }

  // 彻底删除某个游戏账号的存档（含进度），若该账号为当前登录则一并退出登录
  function deleteProfile(account) {
    account = (account || "").trim();
    if (!account) return false;
    var had = !!box.players[account];
    if (had) delete box.players[account];
    if (box.current === account) box.current = null;
    if (had) syncDelete(account);   // 云端一并删除，避免另一台设备又拉回旧档
    saveLocal();
    return had;
  }

  // 清空全部玩家存档（仅调试 / 重置环境用）
  function deleteAllProfiles() {
    Object.keys(box.players).forEach(function (a) { syncDelete(a); });
    box.players = {};
    box.current = null;
    saveLocal();
  }

  function markIntroSeen() { var p = current(); if (p) { p.introSeen = true; saveAll(); } }

  // 排名：已完成玩家按总时长升序（越快越靠前）
  function ranking() {
    return listPlayers().filter(function (p) { return p.completed; })
      .sort(function (a, b) { return (a.completedMs || 1e15) - (b.completedMs || 1e15); });
  }

  function fmtTime(ms) {
    var s = Math.floor((ms || 0) / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    return (h > 0 ? h + ":" : "") + pad(m) + ":" + pad(ss);
  }

  window.FunStore = {
    BADGES: BADGES,
    get: current,
    raw: function () { return box; },
    getLevel: getLevel,
    xpInLevel: xpInLevel,
    xpForLevel: xpForLevel,
    addXp: addXp,
    tickDaily: tickDaily,
    award: award,
    hasBadge: hasBadge,
    badgeCount: badgeCount,
    totalCards: totalCards,
    uniqueCards: uniqueCards,
    cardCount: cardCount,
    pickCard: pickCard,
    awardCards: awardCards,
    addCard: addCard,
    addReview: addReview,
    dueReviews: dueReviews,
    reviewDone: reviewDone,
    theaterBest: theaterBest,
    theaterClear: theaterClear,
    startClock: startClock,
    loginOrCreate: loginOrCreate,
    logout: logout,
    tempExit: tempExit,
    exists: exists,
    listPlayers: listPlayers,
    markPlaying: markPlaying,
    complete: complete,
    resetProgress: resetProgress,
    deleteProfile: deleteProfile,
    deleteAllProfiles: deleteAllProfiles,
    markIntroSeen: markIntroSeen,
    ranking: ranking,
    cloudRanking: cloudRanking,
    fmtTime: fmtTime,
    save: saveAll,
    flush: flush,
    syncFromCloud: syncFromCloud,
    syncPull: syncPull
  };

  // 切到后台 / 关闭页面前强制上传最新进度；回到页面时拉取另一端的最新档案。
  // 配合登录时的阻塞式拉取，保证「同一账号 = 同一份数据」。
  function installSyncHooks() {
    try {
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") { if (box.current) flush(); }
        else if (box.current) { syncPull(box.current); }
      });
      window.addEventListener("pagehide", function () { if (box.current) flush(); });
    } catch (e) {}
  }
  installSyncHooks();
})();
