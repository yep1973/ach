/* ============================================================
   趣味历史乐园 · 终极目标流程（campaign 层）
   登录(昵称唯一·续进度) → 游戏目标 → 多玩法发卡 → 每10卡合成地图碎片
   → 阶段解锁提醒 → 集齐20片解锁中国地图拼图 → 结算 + 排名。
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

  /* ---------------- 规则配置（卡牌分配） ----------------
     总目标 = 20 碎片 × 10 卡 = 200 卡。
     每个玩法各有产卡上限，全局 200 卡封顶，鼓励玩家把玩法都体验一遍。 */
  var CONFIG = {
    FRAGMENTS_TOTAL: 20,
    CARDS_PER_FRAGMENT: 10,
    MODULE_CAPS: { quiz: 90, drag: 60, theater: 50, clue: 50 },
    QUIZ_CARDS_PER_CORRECT: 1,   // 答题：每答对 1 题得 1 张卡牌（不论题型，同一题只给一张）
    DRAG_GAME_CARDS: { sort: 4, link: 4 },
    CLUE_REWARDS: { 1: 3, 2: 2, 3: 1 },  // 线索推理：用了几条提示答对 → 得几张卡
    THEATER_GRADE_CARDS: { S: 5, A: 4, B: 3, C: 2 }
  };

  // 20 片中国地图碎片（区域命名，用于阶段解锁提醒 & 拼图）
  var FRAGMENTS = [
    { name: "东北 · 黑吉辽", color: "#e74c3c" },
    { name: "华北 · 京津冀", color: "#e67e22" },
    { name: "山西", color: "#f1c40f" },
    { name: "内蒙古", color: "#2ecc71" },
    { name: "西北 · 陕甘宁", color: "#16a085" },
    { name: "新疆", color: "#1abc9c" },
    { name: "青藏 · 青西", color: "#3498db" },
    { name: "巴蜀 · 川渝", color: "#9b59b6" },
    { name: "云贵", color: "#8e44ad" },
    { name: "中原 · 河南", color: "#34495e" },
    { name: "山东", color: "#c0392b" },
    { name: "江淮 · 苏皖", color: "#d35400" },
    { name: "上海", color: "#27ae60" },
    { name: "浙江", color: "#2980b9" },
    { name: "赣闽", color: "#8e44ad" },
    { name: "两湖 · 鄂湘", color: "#137a4d" },
    { name: "岭南 · 粤桂", color: "#f39c12" },
    { name: "海南", color: "#e84393" },
    { name: "台湾", color: "#00b894" },
    { name: "港澳", color: "#fd79a8" }
  ];

  var pendingFrags = [];   // 待展示的阶段提醒队列
  var footerTimer = null;

  // 拼图布局（5 列 × 4 行 = 20 块），与最终拼图、碎片图鉴共用同一套裁切坐标
  var PUZ = { COLS: 5, ROWS: 4, CELL: 118 };
  // 第 pos 块碎片在 china.svg 上的裁切背景（让“碎片”真的是中国地图的一块）
  function fragCrop(pos) {
    var COLS = PUZ.COLS, cell = PUZ.CELL, W = COLS * cell, H = PUZ.ROWS * cell;
    var r = Math.floor(pos / COLS), c = pos % COLS;
    return "url(maps/china.svg) " + (-c * cell) + "px " + (-r * cell) + "px / " + W + "px " + H + "px no-repeat";
  }

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
        '<div class="login-rule">🎯 <b>终极目标：</b>答题赢人物卡牌，每 10 张合成 1 片中国地图碎片，集齐 20 片拼出当代<b>中国地图</b>即通关！</div>' +
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
      // 关键：必须先等云端档案拉回来再渲染游戏界面。
      // 否则手机扫码登录时会先显示一份刚新建的空白本地档，看起来就是「和电脑不同步」。
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
    // 登录页面提供“返回学习系统”接口：清空活动会话（不影响已存账号与进度）后跳转
    var lbh = el("loginBackHome");
    if (lbh) lbh.onclick = function () {
      if (window.FunStore && FunStore.tempExit) FunStore.tempExit();
      window.location.href = "../index.html";
    };
    if (window.FunUI && FunUI.renderAccount) FunUI.renderAccount(); // 未登录时隐藏右上角账户区
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
    // 直接进入主页
    if (window.FunUI) { FunUI.go("home"); FunUI.renderAccount(); }
  }

  /* ================= 游戏目标弹窗 ================= */
  function showObjectives(done) {
    var layer = ensureLayer("objLayer", "campaign-layer");
    var dist = CONFIG;
    layer.innerHTML =
      '<div class="campaign-card obj-card">' +
        '<div class="obj-badge">🧩</div>' +
        "<h2>游戏目标</h2>" +
        '<p class="obj-lead">通过答题与互动收集 <b>200 张</b>历史人物卡牌，每 <b>10 张</b>自动合成 1 片<b>中国地图碎片</b>，集齐 <b>20 片</b>后拼出完整中国地图，即完成终极目标！</p>' +
        '<div class="obj-how">' +
          '<div class="obj-row"><span class="obj-ico">⚔️</span><div><b>闯关答题</b>（最多 '+dist.MODULE_CAPS.quiz+' 张）<br><span class="obj-dim">每答对一题获得 1 张人物卡牌（不限题型）</span></div></div>' +
          '<div class="obj-row"><span class="obj-ico">🕵️</span><div><b>线索推理</b>（最多 '+dist.MODULE_CAPS.clue+' 张）<br><span class="obj-dim">三条线索由难到易依次给出；1 / 2 / 3 条猜中得 3 / 2 / 1 张</span></div></div>' +
          '<div class="obj-row"><span class="obj-ico">🎮</span><div><b>拖拽互动馆</b>（最多 '+dist.MODULE_CAPS.drag+' 张）<br><span class="obj-dim">时间轴排序 / 连连看，每通关 1 次 4 张</span></div></div>' +
          '<div class="obj-row"><span class="obj-ico">🎭</span><div><b>穿越剧场</b>（最多 '+dist.MODULE_CAPS.theater+' 张）<br><span class="obj-dim">按结局评级：S 5 / A 4 / B 3 / C 2 张</span></div></div>' +
        "</div>" +
        '<p class="obj-tip">💡 每种玩法都设有产卡上限，只刷一种无法快速集齐——多试几种，越玩越上头！</p>' +
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
      '<div class="cf-item cf-frag"><span class="cf-ico">🧩</span><span class="cf-label">地图碎片</span><b id="cfFrag">0 / 20</b></div>' +
      '<div class="cf-item"><span class="cf-ico">🃏</span><span class="cf-label">卡牌</span><b id="cfCards">0</b></div>' +
      '<button class="cf-btn ghost" id="cfGoal">目标</button>' +
      '<button class="cf-btn" id="cfPuzzle">🔓 解锁最终拼图</button>';
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
    el("cfCards").textContent = FunStore.totalCards();
    var puzzleBtn = el("cfPuzzle");
    if (p.fragments >= CONFIG.FRAGMENTS_TOTAL) {
      puzzleBtn.classList.remove("hidden");
      puzzleBtn.classList.add("ready");
    } else {
      puzzleBtn.classList.add("hidden");
    }
  }

  /* ================= 发卡 + 阶段提醒 ================= */
  // 供各玩法模块调用（答题 / 线索推理 / 拖拽 / 剧场）
  function award(module, count, dynId, opts) {
    var res = FunStore.awardCards(module, count, dynId, opts);
    if (res.fragGained > 0) {
      for (var i = 0; i < res.fragGained; i++) pendingFrags.push(FunStore.get().fragments - res.fragGained + i + 1);
      toast("🧩 解锁第 " + FunStore.get().fragments + " 片地图碎片！");
      pulseFrag();
      flushFragModal();
    }
    if (window.FunUI) FunUI.refreshHUD();
    refreshFooter();
    return res;
  }

  // 顶部轻提示：确保「阶段解锁」一定被看到
  function toast(msg) {
    var t = el("fragToast");
    if (!t) { t = ce("div", "frag-toast hidden"); t.id = "fragToast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.remove("hidden");
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove("show"); t.classList.add("hidden"); }, 2600);
  }

  // 底栏碎片数字脉冲，强化反馈
  function pulseFrag() {
    var cf = el("cfFrag");
    if (!cf) return;
    cf.classList.remove("pulse");
    void cf.offsetWidth; // 强制回流以重启动画
    cf.classList.add("pulse");
  }

  function flushFragModal() {
    var ex = el("fragModal");
    if (ex && !ex.classList.contains("hidden")) return; // 已有在展示，等其关闭再排
    if (!pendingFrags.length) return;
    var num = pendingFrags.shift();
    var frag = FRAGMENTS[(num - 1) % FRAGMENTS.length];
    var layer = ensureLayer("fragModal", "campaign-layer");
    layer.innerHTML =
      '<div class="campaign-card frag-card">' +
        '<div class="frag-ribbon" style="background:' + frag.color + '">阶段解锁</div>' +
        '<div class="frag-piece" style="background-image:' + fragCrop(num - 1) + ';background-size:cover;"><span class="fp-num">' + num + " / 20</span></div>" +
        '<h2>🧩 合成第 ' + num + ' 片地图碎片！</h2>' +
        '<p class="frag-name" style="color:' + frag.color + '">「' + frag.name + '」</p>' +
        '<p class="frag-sub">已集齐 ' + FunStore.get().fragments + " / " + CONFIG.FRAGMENTS_TOTAL + " 片，离拼出中国地图又近一步！</p>" +
        '<button id="fragOk" class="btn login-btn">继续 ▶</button>' +
      "</div>";
    layer.classList.remove("hidden");
    el("fragOk").onclick = function () {
      layer.classList.add("hidden");
      if (pendingFrags.length) flushFragModal();
    };
  }

  /* ================= 最终拼图 ================= */
  function openPuzzle() {
    var p = FunStore.get();
    if (!p || p.fragments < CONFIG.FRAGMENTS_TOTAL) return;
    hideAll();
    FunStore.markPlaying(false);
    var layer = ensureLayer("puzzleLayer", "campaign-layer puzzle-layer");
    var COLS = PUZ.COLS, ROWS = PUZ.ROWS, N = COLS * ROWS;
    var cell = PUZ.CELL, W = COLS * cell, H = ROWS * cell;
    var hintSlot = -1;
    // 初始打乱（确保非已解）
    var order = shuffleRange(N);
    layer.innerHTML =
      '<div class="puzzle-wrap">' +
        '<div class="puzzle-head"><h2>🗺️ 拼出中国地图</h2>' +
          '<p>把 20 块碎片拖到正确位置，拼出完整的当代中国地图！</p>' +
          '<div class="puzzle-prog" id="pzProg">已就位 0 / ' + N + '</div>' +
          '<div class="puzzle-tools">' +
            '<button id="pzHint" class="btn ghost">💡 提示</button>' +
            '<button id="pzSnap" class="btn ghost">🧲 自动吸附</button>' +
            '<button id="pzShuffle" class="btn ghost">打乱重来</button>' +
          '</div></div>' +
        '<div class="puzzle-board" id="pzBoard" style="width:' + W + 'px;height:' + H + 'px;"></div>' +
        '<div class="puzzle-ref"><h4>🎯 目标图</h4><img src="maps/china.svg" width="220" style="border-radius:12px;box-shadow:var(--shadow);background:#fff"/><p class="pz-hint">拖动碎片交换位置；拿不准就点「提示」看正确位置，或点「自动吸附」帮你归位一块。</p></div>' +
      "</div>";
    layer.classList.remove("hidden");

    function tileBg(pos) {
      var r = Math.floor(pos / COLS), c = pos % COLS;
      return "url(maps/china.svg) " + (-c * cell) + "px " + (-r * cell) + "px / " + W + "px " + H + "px no-repeat";
    }
    function correctCount() { var n = 0; for (var s = 0; s < N; s++) if (order[s] === s) n++; return n; }

    function draw() {
      var board = el("pzBoard");
      board.innerHTML = "";
      for (var s = 0; s < N; s++) {
        var slot = ce("div", "pz-cell");
        slot.setAttribute("data-s", s);
        var tp = order[s];
        var tile = ce("div", "pz-frag");
        tile.style.background = tileBg(tp);
        tile.setAttribute("data-pos", tp);
        tile.draggable = true;
        tile.ondragstart = function (ev) {
          ev.dataTransfer.setData("text/plain", ev.target.getAttribute("data-pos"));
          ev.target.classList.add("dragging");
        };
        tile.ondragend = function (ev) { ev.target.classList.remove("dragging"); };
        slot.appendChild(tile);
        slot.ondragover = function (ev) { ev.preventDefault(); };
        slot.ondrop = function (ev) {
          ev.preventDefault();
          var from = parseInt(ev.dataTransfer.getData("text/plain"), 10);
          var to = parseInt(ev.currentTarget.getAttribute("data-s"), 10);
          var fi = order.indexOf(from);
          if (fi === to) return; // 拖回自己所在槽位，无需交换
          // 交换两格上的碎片（from 为被拖碎片的值，to 为目标槽位下标）
          var t = order[fi]; order[fi] = order[to]; order[to] = t;
          draw(); updateProg();
        };
        if (order[s] === s) slot.classList.add("placed");
        if (s === hintSlot) slot.classList.add("hint");
        board.appendChild(slot);
      }
    }
    function updateProg() {
      var c = correctCount();
      el("pzProg").textContent = "已就位 " + c + " / " + N;
      if (c === N) winPuzzle(layer);
    }
    function winPuzzle(layer) {
      FunStore.complete();
      if (footerTimer) clearInterval(footerTimer);
      var f = el("campFooter"); if (f) f.classList.add("hidden");
      setTimeout(function () { showSettlement(); }, 700);
    }
    el("pzShuffle").onclick = function () { order = shuffleRange(N); hintSlot = -1; draw(); updateProg(); };
    el("pzHint").onclick = function () {
      hintSlot = -1;
      for (var s = 0; s < N; s++) { if (order[s] !== s) { hintSlot = s; break; } }
      draw();
      if (hintSlot >= 0) setTimeout(function () { hintSlot = -1; draw(); }, 2500);
    };
    el("pzSnap").onclick = function () {
      var s = -1; for (var k = 0; k < N; k++) { if (order[k] !== k) { s = k; break; } }
      if (s < 0) return;
      var j = order.indexOf(s);
      var t = order[s]; order[s] = order[j]; order[j] = t;
      hintSlot = -1; draw(); updateProg();
    };

    function shuffleRange(n) {
      var a = []; for (var i = 0; i < n; i++) a.push(i);
      for (var j = a.length - 1; j > 0; j--) { var k = Math.floor(Math.random() * (j + 1)); var t = a[j]; a[j] = a[k]; a[k] = t; }
      // 避免一上来就是解好的
      var solved = true; for (var s = 0; s < n; s++) { if (a[s] !== s) { solved = false; break; } }
      if (solved) { var x = a[0]; a[0] = a[1]; a[1] = x; }
      return a;
    }

    draw(); updateProg();
  }

  /* ================= 结算 + 排名 ================= */
  function showSettlement() {
    var p = FunStore.get();
    var rank = FunStore.ranking();
    // 渲染排行榜列表（本地榜与云端榜共用）
    function renderRank(list) {
      var box = el("rankList");
      if (!box) return;
      if (!list || !list.length) { box.innerHTML = '<p style="color:var(--ink-soft)">暂无其他玩家记录</p>'; return; }
      box.innerHTML = list.map(function (rp, i) {
        var me = rp.account === p.account;
        var frag = (rp.fragments != null) ? rp.fragments : (rp.cards || 0);
        return '<div class="rank-row' + (me ? " me" : "") + '">' +
          '<span class="rank-no">' + (i + 1) + '</span>' +
          '<span class="rank-name">' + escapeHtml(rp.nick) + (me ? " （你）" : "") + '</span>' +
          '<span class="rank-time">⏱ ' + FunStore.fmtTime(rp.completedMs) + '</span>' +
          '<span class="rank-frag">🧩 ' + frag + '</span>' +
        "</div>";
      }).join("");
    }

    var layer = ensureLayer("settleLayer", "campaign-layer settle-layer");
    layer.innerHTML =
      '<div class="campaign-card settle-card">' +
        '<div class="settle-crown">👑</div>' +
        "<h2>通关啦！一统江山</h2>" +
        '<p class="settle-sub">' + escapeHtml(p.nick) + "，你用 <b>" + FunStore.fmtTime(p.completedMs) + "</b> 拼出了完整的中国地图！</p>" +
        '<div class="settle-stats">' +
          '<div class="ss"><span>🃏 收集卡牌</span><b>' + FunStore.totalCards() + ' 张</b></div>' +
          '<div class="ss"><span>🧩 地图碎片</span><b>' + p.fragments + ' / 20</b></div>' +
          '<div class="ss"><span>🏅 徽章</span><b>' + FunStore.badgeCount() + ' 枚</b></div>' +
          '<div class="ss"><span>📊 总时长</span><b>' + FunStore.fmtTime(p.completedMs) + '</b></div>' +
        "</div>" +
        '<div class="rank-title">🏆 玩家排名（按通关用时）</div>' +
        '<div class="rank-list" id="rankList"></div>' +
        '<div class="settle-actions">' +
          '<button id="settleRestart" class="btn">重新开始挑战 ↻</button>' +
          '<button id="settleExit" class="btn ghost">退出系统</button>' +
        "</div>" +
      "</div>";
    layer.classList.remove("hidden");
    renderRank(rank);   // 先显示本地榜
    if (window.FunStore.cloudRanking) FunStore.cloudRanking(function (list) { if (list) renderRank(list); }); // 云端榜覆盖（若可用）
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
  }

  /* ================= 地图碎片图鉴 ================= */
  function showFragments() {
    var p = FunStore.get();
    var fragTotal = CONFIG.FRAGMENTS_TOTAL;
    var got = p ? p.fragments : 0;
    var layer = ensureLayer("fragGallery", "campaign-layer");
    var cells = "";
    for (var i = 0; i < FRAGMENTS.length; i++) {
      var f = FRAGMENTS[i];
      var unlocked = (i < got);
      cells += '<div class="fg-cell' + (unlocked ? " on" : "") + '"' +
        (unlocked ? ' style="background-image:' + fragCrop(i) + ';background-size:cover;"' : "") + ">" +
        '<span class="fg-num">' + (i + 1) + "</span>" +
        '<span class="fg-name">' + (unlocked ? f.name : "未解锁") + "</span>" +
      "</div>";
    }
    layer.innerHTML =
      '<div class="campaign-card frag-gallery-card">' +
        '<div class="obj-badge">🧩</div>' +
        "<h2>地图碎片图鉴</h2>" +
        '<p class="obj-lead">已集齐 <b>' + got + ' / ' + fragTotal + '</b> 片中国地图碎片。每收集 10 张人物卡牌自动合成 1 片，集齐 ' + fragTotal + ' 片即可拼出完整中国地图！</p>' +
        '<div class="fg-grid">' + cells + "</div>" +
        (got >= fragTotal ? '<button id="fgPuzzle" class="btn login-btn">🔓 拼出中国地图 ▶</button>' : "") +
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
    ["loginLayer", "objLayer", "fragModal", "puzzleLayer", "settleLayer"].forEach(function (id) {
      var l = el(id); if (l) l.classList.add("hidden");
    });
    var f = el("campFooter"); if (f) f.classList.add("hidden");
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ================= 启动 ================= */
  function init() {
    // 带 ?reset=1 打开：强制退出当前登录，回到昵称录入门（用于"重新开始录入昵称"）
    if (/[?&]reset=1\b/.test(location.search)) {
      FunStore.logout();
    }
    if (FunStore.get()) {
      // 已登录（刷新页面等情况）：后台拉取云端最新档案，避免刷新后看到另一台设备的旧进度
      if (FunStore.syncPull) FunStore.syncPull(FunStore.get().account);
      FunStore.startClock();
      FunStore.tickDaily();
      if (!FunStore.get().completed) { startFooter(); FunStore.markPlaying(true); if (window.FunUI) { FunUI.go("home"); FunUI.renderAccount(); } }
      else { showSettlement(); }
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
    refreshFooter: refreshFooter,
    showObjectives: showObjectives,
    showFragments: showFragments
  };
})();
