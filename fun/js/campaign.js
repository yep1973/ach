/* ============================================================
   趣味历史乐园 · 终极目标流程（campaign 层）
   登录(账号唯一·续进度) → 游戏目标 → 多玩法发卡 → 每10卡合成1片省级地图碎片
   → 集齐 34 片（34 个省级行政区）→ 34 片汇成中国地图 → 结算 + 排名。
   碎片形状来自 fun/js/fragment-data.js 的真实行政区划边界。
   ============================================================ */
(function () {
  "use strict";
  function el(id) { return document.getElementById(id); }
  function ce(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }

  /* ---------------- 规则配置 ----------------
     总目标 = 34 片 × 10 卡 = 340 张人物卡牌。
     四种玩法产卡上限之和 = 100 + 120 + 60 + 60 = 340，必须都玩到才能通关。 */
  var CONFIG = {
    FRAGMENTS_TOTAL: 34,
    CARDS_PER_FRAGMENT: 10,
    TOTAL_CARDS: 340,
    MODULE_CAPS: { quiz: 100, drag: 120, theater: 60, clue: 60 },
    QUIZ_CARDS_PER_CORRECT: 1,
    DRAG_GAME_CARDS: { sort: 4, link: 4 },
    CLUE_REWARDS: { 1: 3, 2: 2, 3: 1 },
    THEATER_GRADE_CARDS: { S: 5, A: 4, B: 3, C: 2 }
  };

  // 34 片省级行政区地图碎片：名称 / 类别 / 真实轮廓均取自地图数据
  var MAP = window.FunFragmentMap || null;
  var VB = MAP ? MAP.viewBox : [0, 0, 1000, 1146];
  var FRAGMENTS = (MAP ? MAP.regions : []).map(function (r) {
    return {
      id: r.id, adcode: r.adcode, name: r.name, short: r.short, type: r.type,
      color: r.color, path: r.path, box: r.box, cx: r.cx, cy: r.cy,
      lx: r.lx, ly: r.ly, labelOffset: r.labelOffset, area: r.area, index: r.index
    };
  });
  // 地图数据缺失时的兜底（保证流程仍可运行，形状退化为编号块）
  if (FRAGMENTS.length !== CONFIG.FRAGMENTS_TOTAL) {
    FRAGMENTS = [];
    for (var fi = 1; fi <= CONFIG.FRAGMENTS_TOTAL; fi++) {
      FRAGMENTS.push({ id: "r" + fi, name: "第 " + fi + " 片省级行政区", short: "第" + fi + "片",
        type: "省级行政区", color: "#c8604f", path: "", box: [0, 0, 100, 100],
        cx: 500, cy: 573, lx: 500, ly: 573, area: 1000, index: fi });
    }
  }

  var pendingFrags = [];   // 待展示的阶段提醒队列
  var footerTimer = null;
  var finaleTimers = [];

  /* ---------------- 碎片 SVG ---------------- */
  // 单块碎片：按该行政区的真实取景框放大显示（阶段弹窗 / 图鉴共用）
  function fragSvg(r, cls) {
    var b = r.box || [0, 0, VB[2], VB[3]];
    var sw = Math.max(0.9, (b[2] / 110) * 1.6);
    if (!r.path) return '<div class="frag-fallback">' + r.short + "</div>";
    return '<svg class="' + (cls || "") + '" viewBox="' + b.join(" ") + '" ' +
      'preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-label="' + r.name + '">' +
      '<path d="' + r.path + '" fill="' + r.color + '" stroke="#7e3b2c" stroke-width="' +
      sw.toFixed(2) + '" stroke-linejoin="round" fill-rule="evenodd"/>' +
      "</svg>";
  }
  function vbStr() { return VB.join(" "); }

  /* ================= 登录门 ================= */
  function showLogin() {
    hideAll();
    var layer = ensureLayer("loginLayer", "campaign-layer");
    var hasPlayers = FunStore.listPlayers().length > 0;
    layer.innerHTML =
      '<div class="campaign-card login-card">' +
        '<div class="login-seal">趣</div>' +
        "<h2>趣味历史乐园</h2>" +
        '<p class="login-sub">玩着学 · 中华上下五千年</p>' +
        '<div class="login-rule">🎯 <b>终极目标：</b>答题赢人物卡牌，每 <b>10 张</b>合成 1 片省级地图碎片，集齐 <b>34 片</b>（对应 34 个省级行政区）拼出完整<b>中国地图</b>即通关！</div>' +
        '<label class="login-label">游戏账号（用于登录，唯一不可重复）</label>' +
        '<input id="accInput" class="login-input" maxlength="20" placeholder="例如：player_001" />' +
        '<label class="login-label">昵称（展示名）</label>' +
        '<input id="nickInput" class="login-input" maxlength="12" placeholder="例如：小史官" />' +
        '<div id="nickErr" class="login-err"></div>' +
        '<button id="enterBtn" class="btn login-btn">进入乐园 ▶</button>' +
        (hasPlayers
          ? '<div class="login-hint">已有存档；同一游戏账号在手机 / 电脑上自动同步，输入账号即可继续上次进度。</div>'
          : '<div class="login-hint">同一游戏账号在手机 / 电脑上进度自动同步。</div>') +
        '<button id="loginBackHome" class="btn ghost login-back-home">← 返回学习系统</button>' +
      "</div>";
    layer.classList.remove("hidden");
    var accInput = el("accInput");
    var input = el("nickInput");
    accInput.focus();
    function tryEnter() {
      var a = accInput.value, v = input.value;
      if (!a.trim()) { el("nickErr").textContent = "请输入游戏账号"; return; }
      if (!v.trim()) { el("nickErr").textContent = "请输入昵称"; return; }
      var r = FunStore.loginOrCreate(a, v);
      if (!r.ok) { el("nickErr").textContent = r.msg; return; }
      // 必须先等云端档案拉回来再渲染，否则手机扫码登录会先看到一份空白本地档
      if (!(window.FunStore && FunStore.syncFromCloud)) { onEntered(r); return; }
      var btn = el("enterBtn");
      if (btn) { btn.disabled = true; btn.textContent = "正在同步云端进度…"; }
      el("nickErr").textContent = "";
      FunStore.syncFromCloud(a.trim(), function () {
        if (btn) { btn.disabled = false; btn.textContent = "进入乐园 ▶"; }
        FunStore.flush();
        onEntered({ ok: true, created: r.created, profile: FunStore.get() });
      }, true);
    }
    el("enterBtn").onclick = tryEnter;
    input.onkeydown = function (e) { if (e.key === "Enter") tryEnter(); };
    accInput.onkeydown = function (e) { if (e.key === "Enter") { input.focus(); } };
    var lbh = el("loginBackHome");
    if (lbh) lbh.onclick = function () {
      if (window.FunStore && FunStore.tempExit) FunStore.tempExit();
      window.location.href = "../index.html";
    };
    if (window.FunUI && FunUI.renderAccount) FunUI.renderAccount();
  }

  function onEntered(r) {
    FunStore.startClock();
    FunStore.tickDaily();
    if (!r.profile.introSeen) {
      showObjectives(function () {
        FunStore.markIntroSeen();
        enterPark();
      });
    } else {
      enterPark();
    }
  }

  function enterPark() {
    hideAll();
    startFooter();
    FunStore.markPlaying(true);
    if (window.FunUI) { FunUI.go("home"); FunUI.renderAccount(); }
  }

  /* ================= 游戏目标弹窗 ================= */
  function showObjectives(done) {
    var layer = ensureLayer("objLayer", "campaign-layer");
    var c = CONFIG.MODULE_CAPS;
    layer.innerHTML =
      '<div class="campaign-card obj-card">' +
        '<div class="obj-badge">🧩</div>' +
        "<h2>游戏目标</h2>" +
        '<p class="obj-lead">通过四种玩法收集 <b>340 张</b>历史人物卡牌，每 <b>10 张</b>自动合成 1 片<b>省级地图碎片</b>；集齐 <b>34 片</b>（23 个省、5 个自治区、4 个直辖市、2 个特别行政区）后，34 片汇成完整<b>中国地图</b>，即完成终极目标！</p>' +
        '<div class="obj-how">' +
          '<div class="obj-row"><span class="obj-ico">⚔️</span><div><b>闯关答题</b>（最多 ' + c.quiz + ' 张）<br><span class="obj-dim">每答对一题获得 1 张人物卡牌（不限题型）</span></div></div>' +
          '<div class="obj-row"><span class="obj-ico">🎮</span><div><b>拖拽互动馆</b>（最多 ' + c.drag + ' 张）<br><span class="obj-dim">时间轴排序 / 连连看，每通关 1 次 4 张</span></div></div>' +
          '<div class="obj-row"><span class="obj-ico">🕵️</span><div><b>线索推理</b>（最多 ' + c.clue + ' 张）<br><span class="obj-dim">三条线索由难到易；1 / 2 / 3 条猜中得 3 / 2 / 1 张</span></div></div>' +
          '<div class="obj-row"><span class="obj-ico">🎭</span><div><b>穿越剧场</b>（最多 ' + c.theater + ' 张）<br><span class="obj-dim">按结局评级：S 5 / A 4 / B 3 / C 2 张</span></div></div>' +
        "</div>" +
        '<p class="obj-tip">💡 四种玩法的产卡上限合计正好 <b>340 张 = 34 片 × 10 张</b>，只刷一种无法通关——每种都要体验！</p>' +
        '<button id="objStart" class="btn login-btn">开始游戏 ▶</button>' +
      "</div>";
    layer.classList.remove("hidden");
    el("objStart").onclick = function () { layer.classList.add("hidden"); if (done) done(); };
  }

  /* ================= 底部实时栏 ================= */
  function ensureFooter() {
    var f = el("campFooter");
    if (f) return f;
    f = ce("div", "camp-footer");
    f.id = "campFooter";
    f.innerHTML =
      '<div class="cf-item"><span class="cf-ico">⏱</span><span class="cf-label">总时长</span><b id="cfTime">00:00</b></div>' +
      '<div class="cf-item cf-frag"><span class="cf-ico">🧩</span><span class="cf-label">地图碎片</span><b id="cfFrag">0 / ' + CONFIG.FRAGMENTS_TOTAL + '</b></div>' +
      '<div class="cf-item"><span class="cf-ico">🃏</span><span class="cf-label">卡牌</span><b id="cfCards">0</b></div>' +
      '<button class="cf-btn ghost" id="cfGoal">目标</button>' +
      '<button class="cf-btn" id="cfPuzzle">🔓 观看最终拼图</button>';
    document.body.appendChild(f);
    el("cfGoal").onclick = function () { showObjectives(function () {}); };
    el("cfPuzzle").onclick = function () { openPuzzle(); };
    return f;
  }

  function startFooter() {
    if (footerTimer) clearInterval(footerTimer);
    ensureFooter();
    refreshFooter();
    footerTimer = setInterval(refreshFooter, 1000);
  }

  function refreshFooter() {
    var f = el("campFooter");
    if (!f) return;
    var p = FunStore.get();
    if (!p) { f.classList.add("hidden"); return; }
    f.classList.remove("hidden");
    el("cfTime").textContent = FunStore.fmtTime(p.playedMs);
    el("cfFrag").textContent = p.fragments + " / " + CONFIG.FRAGMENTS_TOTAL;
    el("cfCards").textContent = FunStore.totalCards() + " / " + CONFIG.TOTAL_CARDS;
    var puzzleBtn = el("cfPuzzle");
    if (p.fragments >= CONFIG.FRAGMENTS_TOTAL) {
      puzzleBtn.classList.remove("hidden");
      puzzleBtn.classList.add("ready");
    } else {
      puzzleBtn.classList.add("hidden");
    }
  }

  /* ================= 发卡 + 阶段提醒 ================= */
  function award(module, count, dynId, opts) {
    var res = FunStore.awardCards(module, count, dynId, opts);
    if (res.fragGained > 0) {
      var p = FunStore.get();
      for (var i = 0; i < res.fragGained; i++) pendingFrags.push(p.fragments - res.fragGained + i + 1);
      toast("🧩 解锁第 " + p.fragments + " 片省级地图碎片！");
      pulseFrag();
      flushFragModal();
    }
    if (window.FunUI) FunUI.refreshHUD();
    refreshFooter();
    return res;
  }

  function toast(msg) {
    var t = el("fragToast");
    if (!t) { t = ce("div", "frag-toast hidden"); t.id = "fragToast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.remove("hidden");
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove("show"); t.classList.add("hidden"); }, 2600);
  }

  function pulseFrag() {
    var cf = el("cfFrag");
    if (!cf) return;
    cf.classList.remove("pulse");
    void cf.offsetWidth;
    cf.classList.add("pulse");
  }

  function flushFragModal() {
    var ex = el("fragModal");
    if (ex && !ex.classList.contains("hidden")) return;
    if (!pendingFrags.length) return;
    var num = pendingFrags.shift();
    var frag = FRAGMENTS[(num - 1) % FRAGMENTS.length];
    var layer = ensureLayer("fragModal", "campaign-layer");
    layer.innerHTML =
      '<div class="campaign-card frag-card">' +
        '<div class="frag-ribbon" style="background:' + frag.color + '">阶段解锁</div>' +
        '<div class="frag-piece">' + fragSvg(frag, "frag-shape") +
          '<span class="fp-num">' + num + " / " + CONFIG.FRAGMENTS_TOTAL + "</span></div>" +
        '<h2>🧩 合成第 ' + num + ' 片地图碎片！</h2>' +
        '<p class="frag-name" style="color:' + frag.color + '">「' + frag.name + '」</p>' +
        '<p class="frag-kind">' + frag.type + ' · 34 个省级行政区之一 · 真实行政区划轮廓</p>' +
        '<p class="frag-sub">已集齐 ' + FunStore.get().fragments + " / " + CONFIG.FRAGMENTS_TOTAL +
          " 片，离拼出完整中国地图又近一步！</p>" +
        '<button id="fragOk" class="btn login-btn">继续 ▶</button>' +
      "</div>";
    layer.classList.remove("hidden");
    el("fragOk").onclick = function () {
      layer.classList.add("hidden");
      if (pendingFrags.length) { flushFragModal(); return; }
      // 最后一片也看完 → 自动进入 34 片汇入的震撼结算
      if (FunStore.get().fragments >= CONFIG.FRAGMENTS_TOTAL) openPuzzle();
    };
  }

  /* ================= 最终拼合动画 + 结算 ================= */
  /* 集齐 34 片后：34 块真实省份轮廓从四面八方飞入归位 → 完整中国地图
     → 浮现巨大的「中国」二字 → 显示通关时间与排名。 */
  function openPuzzle() {
    var p = FunStore.get();
    if (!p || p.fragments < CONFIG.FRAGMENTS_TOTAL) return;
    showFinale(false);
  }
  function showSettlement() { showFinale(true); }   // 已通关账号再次进入：直接看结果

  function showFinale(skipFly) {
    var p = FunStore.get();
    if (!p) return;
    hideAll();
    finaleTimers.forEach(clearTimeout);
    finaleTimers = [];
    clearFooterTimer();
    if (!p.completed) FunStore.complete();          // 记录通关用时并写入排行榜
    p = FunStore.get();
    FunStore.markPlaying(false);
    var f = el("campFooter"); if (f) f.classList.add("hidden");

    var layer = ensureLayer("finaleLayer", "campaign-layer finale-layer");
    var pieces = "", labels = "";
    for (var i = 0; i < FRAGMENTS.length; i++) {
      var r = FRAGMENTS[i];
      var ang = (i / FRAGMENTS.length) * Math.PI * 2 + (i % 3) * 0.35;
      var dist = 660 + (i % 5) * 135;
      var dx = Math.round(Math.cos(ang) * dist);
      var dy = Math.round(Math.sin(ang) * dist * 0.74);
      var rot = ((i * 47) % 150) - 75;
      var sc = r.area < 700 ? 3.4 : (1.05 + (i % 4) * 0.16);
      var delay = (0.10 + (i % 17) * 0.055).toFixed(2);
      pieces += '<svg class="fn-piece" viewBox="' + vbStr() + '" preserveAspectRatio="xMidYMid meet" ' +
        'style="--dx:' + dx + 'px;--dy:' + dy + 'px;--rot:' + rot + 'deg;--sc:' + sc +
        ';--d:' + delay + 's" aria-label="' + r.name + '">' +
        '<path d="' + r.path + '" fill="' + r.color + '" stroke="#7e3b2c" ' +
        'stroke-width="1.8" stroke-linejoin="round" fill-rule="evenodd"/></svg>';
      if (r.labelOffset && (r.labelOffset[0] || r.labelOffset[1])) {
        labels += '<line x1="' + r.cx + '" y1="' + r.cy + '" x2="' + r.lx + '" y2="' + r.ly +
          '" stroke="#f5e2b8" stroke-width="1.4" opacity=".85"/>';
      }
      labels += '<text x="' + r.lx + '" y="' + (r.ly + 5) + '">' + r.short + "</text>";
    }

    layer.innerHTML =
      '<div class="fn-glow"></div>' +
      '<div class="fn-shell">' +
        '<div class="fn-left">' +
          '<div class="fn-caption">三十四片山河 · 汇成一幅中国</div>' +
          '<div class="fn-stage" id="fnStage">' +
            '<div class="fn-map" id="fnMap">' +
              pieces +
              (MAP ? '<svg class="fn-nine" viewBox="' + vbStr() + '" preserveAspectRatio="xMidYMid meet">' +
                '<path d="' + MAP.nineDash + '" fill="#e8b96a" fill-rule="evenodd"/></svg>' : "") +
              '<svg class="fn-labels" viewBox="' + vbStr() + '" preserveAspectRatio="xMidYMid meet">' +
                labels + "</svg>" +
            "</div>" +
            '<div class="fn-china"><span>中</span><span>国</span><i>山河一统</i></div>' +
          "</div>" +
          '<div class="fn-note">地图含 34 个省级行政区及南海诸岛；台湾省、香港特别行政区、澳门特别行政区均为中国领土不可分割的部分。</div>' +
        "</div>" +
        '<div class="fn-right">' +
          '<div class="fn-result" id="fnResult">' +
            '<div class="fn-crown">👑</div>' +
            '<h2>通关啦！一统山河</h2>' +
            '<p class="fn-sub">' + escapeHtml(p.nick) + "，你用 <b>" + FunStore.fmtTime(p.completedMs) +
              "</b> 集齐 34 片省级地图碎片，拼出了完整的中国地图！</p>" +
            '<div class="fn-time"><span>⏱ 通关用时</span><b>' + FunStore.fmtTime(p.completedMs) + "</b></div>" +
            '<div class="fn-stats">' +
              '<div class="ss"><span>🃏 收集卡牌</span><b>' + FunStore.totalCards() + " / " + CONFIG.TOTAL_CARDS + "</b></div>" +
              '<div class="ss"><span>🧩 省级碎片</span><b>' + p.fragments + " / " + CONFIG.FRAGMENTS_TOTAL + "</b></div>" +
              '<div class="ss"><span>🏅 徽章</span><b>' + FunStore.badgeCount() + " 枚</b></div>" +
              '<div class="ss"><span>🗺️ 行政区划</span><b>34 / 34</b></div>' +
            "</div>" +
            '<div class="rank-title">🏆 玩家排名（按通关用时）</div>' +
            '<div class="rank-list" id="rankList"></div>' +
            '<div class="settle-actions">' +
              '<button id="settleRestart" class="btn">重新开始挑战 ↻</button>' +
              '<button id="settleExit" class="btn ghost">退出系统</button>' +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>";
    layer.classList.remove("hidden");

    // 排名：先本地榜，再用云端榜覆盖
    renderRank(FunStore.ranking());
    if (window.FunStore.cloudRanking) FunStore.cloudRanking(function (list) { if (list) renderRank(list); });

    el("settleRestart").onclick = function () {
      if (!confirm("确定要清空当前进度、重新开始挑战吗？")) return;
      FunStore.resetProgress();
      layer.classList.add("hidden");
      showObjectives(function () { FunStore.markIntroSeen(); enterPark(); });
    };
    el("settleExit").onclick = function () {
      FunStore.logout();
      layer.classList.add("hidden");
      showLogin();
    };

    if (skipFly) {
      layer.classList.add("fn-assembled", "fn-china-show", "fn-result-show");
    } else {
      // 双 rAF 保证浏览器先绘制初态再播放过渡
      var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
      raf(function () {
        raf(function () { layer.classList.add("fn-fly"); });
      });
      finaleTimers.push(setTimeout(function () { layer.classList.add("fn-assembled"); }, 2600));
      finaleTimers.push(setTimeout(function () { layer.classList.add("fn-china-show"); }, 3050));
      finaleTimers.push(setTimeout(function () { layer.classList.add("fn-result-show"); }, 4300));
    }
  }

  function renderRank(list) {
    var box = el("rankList");
    if (!box) return;
    var p = FunStore.get();
    if (!list || !list.length) { box.innerHTML = '<p class="rank-empty">暂无其他玩家记录</p>'; return; }
    box.innerHTML = list.map(function (rp, i) {
      var me = p && rp.account === p.account;
      return '<div class="rank-row' + (me ? " me" : "") + '">' +
        '<span class="rank-no">' + (i + 1) + "</span>" +
        '<span class="rank-name">' + escapeHtml(rp.nick) + (me ? " （你）" : "") + "</span>" +
        '<span class="rank-time">⏱ ' + FunStore.fmtTime(rp.completedMs) + "</span>" +
        "</div>";
    }).join("");
  }

  function clearFooterTimer() { if (footerTimer) { clearInterval(footerTimer); footerTimer = null; } }

  /* ================= 地图碎片图鉴 ================= */
  function showFragments() {
    var p = FunStore.get();
    var fragTotal = CONFIG.FRAGMENTS_TOTAL;
    var got = p ? p.fragments : 0;
    var cells = "";
    for (var i = 0; i < FRAGMENTS.length; i++) {
      var r = FRAGMENTS[i];
      var unlocked = (i < got);
      cells += '<div class="fg-cell' + (unlocked ? " on" : "") + '" title="' + r.name + '">' +
        '<div class="fg-shape">' + (unlocked ? fragSvg(r, "fg-svg") : '<span class="fg-lock">🔒</span>') + "</div>" +
        '<span class="fg-num">' + (i + 1) + "</span>" +
        '<span class="fg-name">' + (unlocked ? r.name : "未解锁") + "</span>" +
        (unlocked ? '<span class="fg-kind">' + r.type + "</span>" : "") +
      "</div>";
    }
    var layer = ensureLayer("fragGallery", "campaign-layer");
    layer.innerHTML =
      '<div class="campaign-card frag-gallery-card">' +
        '<div class="obj-badge">🧩</div>' +
        "<h2>省级地图碎片图鉴</h2>" +
        '<p class="obj-lead">已集齐 <b>' + got + " / " + fragTotal +
          "</b> 片，对应全国 34 个省级行政区（23 省 · 5 自治区 · 4 直辖市 · 2 特别行政区）。每收集 10 张人物卡牌自动合成 1 片，碎片形状为真实行政区划轮廓。</p>" +
        '<div class="fg-grid">' + cells + "</div>" +
        '<p class="fg-note">台湾省、香港特别行政区、澳门特别行政区及南海诸岛均为中国领土不可分割的部分。</p>' +
        (got >= fragTotal ? '<button id="fgPuzzle" class="btn login-btn">🔓 观看最终拼图 ▶</button>' : "") +
        '<button id="fgClose" class="btn ghost">关闭</button>' +
      "</div>";
    layer.classList.remove("hidden");
    el("fgClose").onclick = function () { layer.classList.add("hidden"); };
    var fp = el("fgPuzzle");
    if (fp) fp.onclick = function () { layer.classList.add("hidden"); openPuzzle(); };
  }

  /* ================= 工具 ================= */
  function ensureLayer(id, cls) {
    var l = el(id);
    if (!l) {
      l = ce("div", cls);
      l.id = id;
      document.body.appendChild(l);
    }
    l.className = cls;
    return l;
  }
  function hideAll() {
    ["loginLayer", "objLayer", "fragModal", "puzzleLayer", "finaleLayer", "settleLayer", "fragGallery"].forEach(function (id) {
      var l = el(id); if (l) l.classList.add("hidden");
    });
    var f = el("campFooter"); if (f) f.classList.add("hidden");
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ================= 启动 ================= */
  function init() {
    if (/[?&]reset=1\b/.test(location.search)) FunStore.logout();
    if (FunStore.get()) {
      if (FunStore.syncPull) FunStore.syncPull(FunStore.get().account);
      FunStore.startClock();
      FunStore.tickDaily();
      var p = FunStore.get();   // get() 内的 normalize 已把「旧版 20 片已通关」的档恢复为进行中
      if (p.completed) { showSettlement(); }
      else {
        startFooter();
        FunStore.markPlaying(true);
        if (window.FunUI) { FunUI.go("home"); FunUI.renderAccount(); }
        if (p.fragments >= CONFIG.FRAGMENTS_TOTAL) openPuzzle();
      }
    } else {
      showLogin();
    }
  }

  // 视图切换时由 app.js 调用：在玩法界面才计时
  function setView(view) {
    var p = FunStore.get();
    if (!p) return;
    var playing = (view === "home" || view === "quiz" || view === "clue" || view === "drag" || view === "hall" || view === "theater");
    FunStore.markPlaying(playing && !p.completed);
  }

  window.FunCampaign = {
    CONFIG: CONFIG,
    FRAGMENTS: FRAGMENTS,
    init: init,
    setView: setView,
    quitToLogin: function () { FunStore.logout(); showLogin(); },
    award: award,
    openPuzzle: openPuzzle,
    showSettlement: showSettlement,
    refreshFooter: refreshFooter,
    showObjectives: showObjectives,
    showFragments: showFragments
  };
})();
