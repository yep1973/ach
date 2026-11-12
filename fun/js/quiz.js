/* ============================================================
   趣味历史乐园 · 闯关答题模块
   复用 FunData.quizOf(id) 的五种题型；加入生命值/连击/Boss。
   规则：
   ① 账号已有全站总计时，本题型不再设置每题倒计时；题头实时显示账号总时长。
   ② 连线（连连看）做题过程中只记录配对、不提示对错；点「提交答案」后
      一次性集中判分，公布每道错题的正确答案，并把错题写入「间隔复习」。
   ③ 同考点题目不重复：题库按知识点分组，一个考点一局只出一道；已出过的题
      记录到账号档案（随账号跨设备同步），本轮不再出现，全部轮完才开新一轮。
   交互：单选/判断 点选即出结果（即时反馈）；多选/排序/连线 点“提交答案”出结果。
   答对：连击加分 + 生命值 +1（上限 3）；答错：扣血、连击清零。
   ============================================================ */
(function () {
  "use strict";

  var Q = null;              // 当前闯关状态
  var totalClock = null;     // 仅用于题头「总时长」展示，不参与判分
  var ROUND_KEEP = 8;        // 开新一轮时，开头避开最近出过的 8 道题

  /* ------------------------------------------------------------
     同考点分组：由题库内容相似度聚类 + 人工核对得到。
     同组题目考查同一知识点（含跨朝代、跨题型），一局内只抽一道。
     未列出的题目各成一个独立考点；题干完全相同的客观题也会自动合并。
     ------------------------------------------------------------ */
  var TOPIC_GROUPS = [
    ["neolithic:1", "neolithic:9"],              // 龙山文化 · 蛋壳黑陶
    ["sanhuan:3", "sanhuan:10"],                  // 尧舜禅让制
    ["spring:1", "spring:9"],                     // 齐桓公 · 尊王攘夷
    ["spring:3", "spring:10"],                    // 鲁国初税亩
    ["westzhou:1", "westzhou:9"],                 // 西周分封 / 宗法核心制度
    ["qin:2", "qin:10"],                          // 秦始皇巩固统一的措施
    ["westhan:5", "westhan:10"],                  // 推恩令 · 削弱诸侯王
    ["sanguo:0", "sanguo:9"],                     // 赤壁之战奠定三国鼎立
    ["nanbei:1", "sui:0"],                        // 隋结束南北朝、重归一统
    ["wudai:0", "wudai:8"],                       // 陈桥兵变 · 赵匡胤建北宋
    ["wudai:1", "wudai:10", "liao:3"],            // 石敬瑭割让燕云十六州
    ["beisong:1", "liao:9"],                      // 澶渊之盟
    ["beisong:7", "jin:1", "jin:9"],              // 靖康之变 · 金灭北宋
    ["xixia:0", "xixia:8"],                       // 西夏建立者与民族
    ["xixia:2", "xixia:7"],                       // 西夏综合
    ["nansong:2", "nansong:7"],                   // 南宋综合
    ["liao:2", "liao:7"],                         // 辽朝综合
    ["jin:2", "jin:7"],                           // 金朝综合
    ["jin:3", "jin:8"],                           // 猛安谋克
    ["yuan:1", "yuan:9"],                         // 元朝行省制度
    ["yuan:2", "yuan:8"],                         // 元朝综合
    ["ming:2", "ming:8"],                         // 明朝综合
    ["ming:5", "ming:10"],                        // 王阳明心学
    ["qing:2", "qing:4", "qing:8"]                // 清朝史事（综合 / 时间线排序）
  ];
  var TOPIC_OF = {};
  TOPIC_GROUPS.forEach(function (ids, i) {
    ids.forEach(function (id) { TOPIC_OF[id] = "t" + i; });
  });

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function normStem(s) {
    return String(s || "").replace(/[\s，,。．\.、；;：:！!？?"'“”‘’「」『』《》〈〉（）()【】\[\]—\-–~～·\/\\]/g, "");
  }
  function fmtMs(ms) {
    var s = Math.floor((Number(ms) || 0) / 1000);
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
  }

  /* ---------------- 已出题记录（写进账号档案，跨设备同步） ---------------- */
  function profile() { return window.FunStore ? FunStore.get() : null; }
  function seenList() {
    var p = profile();
    return (p && Array.isArray(p.quizSeen)) ? p.quizSeen : [];
  }
  function commitSeen(reset, keep) {
    var p = profile();
    if (!p) return;
    if (!Array.isArray(p.quizSeen)) p.quizSeen = [];
    if (reset) {
      var k = (keep == null ? ROUND_KEEP : keep);
      p.quizSeen = k > 0 ? p.quizSeen.slice(-k) : [];
    }
    if (window.FunStore) {
      if (FunStore.save) FunStore.save();
      if (FunStore.flush) FunStore.flush();   // 立即同步，另一台设备也不会重复出题
    }
  }
  function markSeen(qid) {
    var p = profile();
    if (!p) return;
    if (!Array.isArray(p.quizSeen)) p.quizSeen = [];
    if (p.quizSeen.indexOf(qid) < 0) p.quizSeen.push(qid);
    if (p.quizSeen.length > 2000) p.quizSeen = p.quizSeen.slice(-2000);
    commitSeen(false);
  }

  /* ---------------- 按考点出题 ---------------- */
  // 同一考点只取一道；已出过的题本轮跳过；题目全部轮完后自动开新一轮。
  function buildPool(all) {
    var ownerOfStem = {}, topicOfQid = {};
    all.forEach(function (q) {
      var key = TOPIC_OF[q.qid];
      if (!key && q.type !== "order" && q.type !== "match") {
        var s = normStem(q.q);
        if (s && ownerOfStem[s]) key = ownerOfStem[s];   // 题干完全相同 → 同一考点
        else { key = "q:" + q.qid; if (s) ownerOfStem[s] = key; }
      }
      topicOfQid[q.qid] = key || ("q:" + q.qid);
    });

    var groups = {};
    all.forEach(function (q) {
      var t = topicOfQid[q.qid];
      (groups[t] = groups[t] || []).push(q);
    });

    // 已出题记录按「考点」折算：同组任一题出过，整个考点本轮都不再出
    function seenState() {
      var byQid = {}, byTopic = {};
      seenList().forEach(function (id) {
        byQid[id] = 1;
        if (topicOfQid[id]) byTopic[topicOfQid[id]] = 1;
      });
      return { qid: byQid, topic: byTopic, recent: seenList().slice(-ROUND_KEEP) };
    }
    function choose(state) {
      var chosen = [];
      Object.keys(groups).forEach(function (t) {
        if (state.topic[t]) return;                // 该考点本轮已考过 → 整组跳过
        var fresh = groups[t].filter(function (q) { return !state.qid[q.qid]; });
        if (!fresh.length) fresh = groups[t];
        var prefer = fresh.filter(function (q) { return state.recent.indexOf(q.qid) < 0; });
        var cand = prefer.length ? prefer : fresh;
        chosen.push(cand[Math.floor(Math.random() * cand.length)]);
      });
      return shuffle(chosen);
    }

    var pool = choose(seenState());
    if (!pool.length) {                            // 一轮全部轮完 → 开新一轮
      // 只保留最近 8 题（题库很小时相应减少），避免紧接着重复，也保证仍有题可出
      var keep = Math.min(ROUND_KEEP, Math.max(0, all.length - 1));
      commitSeen(true, keep);
      pool = choose(seenState());
    }
    return pool;
  }

  /* ---------------- 题头总时长（不再有每题倒计时） ---------------- */
  function stopTotalClock() {
    if (totalClock) { clearInterval(totalClock); totalClock = null; }
  }
  function startTotalClock() {
    stopTotalClock();
    function tick() {
      var t = el("qTotal");
      if (!t) { stopTotalClock(); return; }       // 视图已切换，自动停止
      var p = (window.FunStore && FunStore.get) ? FunStore.get() : null;
      var ms = p ? (p.playedMs || 0) : 0;
      var txt = (window.FunStore && FunStore.fmtTime) ? FunStore.fmtTime(ms) : fmtMs(ms);
      t.textContent = "⏱ 总时长 " + txt + " · 本题不限时";
    }
    tick();
    totalClock = setInterval(tick, 1000);
  }

  /* ---------------- 打开 / 开始一局 ---------------- */
  function open() {
    stopTotalClock();
    var root = el("view-quiz");
    root.innerHTML =
      '<div class="back-link" data-go="home">← 返回主页</div>' +
      '<div class="panel">' +
        '<div class="section-title">⚔️ 闯关答题</div>' +
        '<div class="section-sub">全朝代题库随机出题，每题标注出自哪个朝代。' +
          '<b>每题不限时</b>，全站按账号统一累计总时长；<b>同一考点不会重复出题</b>；' +
          '连线题在<b>提交答案后一次性集中判分</b>并公布错题正确答案。' +
          '答对连击加分并回血 +1，答错扣血；生命耗尽即结束！</div>' +
      "</div>";
    root.querySelector('[data-go="home"]').onclick = function () { stopTotalClock(); FunUI.go("home"); };
    startRun();
  }

  function startRun() {
    var pool = [];
    FunData.dynasties.forEach(function (d) {
      FunData.quizOf(d.id).forEach(function (q) { pool.push(q); });
    });
    if (!pool.length) {
      el("view-quiz").innerHTML =
        '<div class="back-link" data-go="home">← 返回主页</div>' +
        '<div class="panel">题库暂为空，稍后再来～</div>';
      el("view-quiz").querySelector('[data-go="home"]').onclick = function () { stopTotalClock(); FunUI.go("home"); };
      return;
    }
    Q = {
      id: "all", name: "全朝代混合", qs: buildPool(pool), i: 0,
      lives: 3, combo: 0, wrong: 0, xp: 0, answered: false, seen: 0,
      _matchMistakes: [], _linkOk: null
    };
    if (!Q.qs.length) { finish(); return; }
    renderQuestion();
  }

  function renderQuestion() {
    var root = el("view-quiz");
    var q = Q.qs[Q.i];
    Q.seen++;
    Q._matchMistakes = [];
    Q._linkOk = null;
    markSeen(q.qid);                              // 已呈现即记入账号档案，本轮不再出
    var isBoss = (Q.i === Q.qs.length - 1);
    var hearts = "";
    for (var h = 0; h < 3; h++) hearts += (h < Q.lives ? "❤️" : "🤍");

    var html =
      '<div class="back-link" data-go="home">← 退出闯关</div>' +
      '<div class="panel">' +
        '<div class="quiz-top">' +
          '<div class="lives" id="qHearts">' + hearts + "</div>" +
          '<div class="combo" id="qCombo">连击 ×' + Q.combo + "</div>" +
          '<div class="timer" id="qTotal">⏱ 总时长 00:00 · 本题不限时</div>' +
        "</div>" +
        '<div class="q-dyn">📍 本题出自：<b>' + (q.dynasty || "历史") + "</b></div>" +
        '<div class="q-card" id="qCard"></div>' +
      "</div>";
    root.innerHTML = html;
    root.querySelector('[data-go="home"]').onclick = function () { stopTotalClock(); FunUI.go("home"); };

    var typeLabel = { single: "单选", multiple: "多选", judge: "判断", order: "排序", match: "连线" }[q.type] || "题";
    var titleHtml =
      '<div class="q-text">' + (isBoss ? "👑 Boss 关 · " : "") + q.q +
      '<span class="q-type">' + typeLabel + "</span></div>";

    var card = el("qCard");
    card.innerHTML = titleHtml + '<div id="qBody"></div>';

    // 提交 / 下一题 按钮（先建好，供下面各题型安全地启用/禁用）
    var actions = document.createElement("div");
    actions.className = "quiz-actions";
    actions.innerHTML =
      '<button class="btn ghost hidden" id="qReset">清空重连</button>' +
      '<button class="btn ghost" id="qSubmit">提交答案</button>' +
      '<button class="btn hidden" id="qNext">下一题 →</button>';
    card.appendChild(actions);

    if (q.type === "single" || q.type === "judge") renderChoice(q, card);
    else if (q.type === "multiple") renderMulti(q, card);
    else if (q.type === "order") renderOrder(q, card);
    else if (q.type === "match") renderMatch(q, card);

    // 单选/判断：点选即判，隐藏“提交”
    if (q.type === "single" || q.type === "judge") {
      el("qSubmit").classList.add("hidden");
    } else {
      el("qSubmit").classList.remove("hidden");
      el("qSubmit").onclick = function () { answer(q); };
    }
    el("qNext").onclick = next;
    // 多选：未选时禁用；排序：默认可交；连线：配对完成后由 drawLinks 启用
    if (q.type === "multiple") el("qSubmit").disabled = true;
    if (q.type === "order") el("qSubmit").disabled = false;
    if (q.type === "match") drawLinks();

    startTotalClock();
  }

  function updateTop() {
    if (!Q) return;
    var hearts = "";
    for (var h = 0; h < 3; h++) hearts += (h < Q.lives ? "❤️" : "🤍");
    var hh = el("qHearts"); if (hh) hh.innerHTML = hearts;
    var cc = el("qCombo"); if (cc) cc.textContent = "连击 ×" + Q.combo;
  }

  // ---- 单选 / 判断（点选即出结果）----
  function renderChoice(q, card) {
    var opts = q.type === "judge"
      ? [{ t: "正确", v: true }, { t: "错误", v: false }]
      : q.options.map(function (o, i) { return { t: o, v: i }; });
    var body = el("qBody");
    Q._pick = null;
    opts.forEach(function (o, i) {
      var d = document.createElement("div");
      d.className = "opt";
      d.innerHTML = '<span class="mark">' + String.fromCharCode(65 + i) + "</span><span>" + o.t + "</span>";
      d.onclick = function () {
        if (Q.answered) return;
        body.querySelectorAll(".opt").forEach(function (x) { x.classList.remove("pick"); });
        d.classList.add("pick");
        Q._pick = o.v;
        answer(q); // 即时反馈
      };
      body.appendChild(d);
    });
    Q._check = function () { return Q._pick === q.answer; };
    Q._reveal = function () {
      body.querySelectorAll(".opt").forEach(function (x, idx) {
        if (opts[idx].v === q.answer) x.classList.add("right");
        else if (opts[idx].v === Q._pick) x.classList.add("wrong");
      });
    };
  }

  // ---- 多选 ----
  function renderMulti(q, card) {
    var body = el("qBody");
    Q._picks = {};
    q.options.forEach(function (o, i) {
      var d = document.createElement("div");
      d.className = "opt";
      d.innerHTML = '<span class="mark">' + String.fromCharCode(65 + i) + "</span><span>" + o + "</span>";
      d.onclick = function () {
        if (Q.answered) return;
        if (d.classList.contains("pick")) { d.classList.remove("pick"); Q._picks[i] = false; }
        else { d.classList.add("pick"); Q._picks[i] = true; }
        var any = Object.keys(Q._picks).some(function (k) { return Q._picks[k]; });
        el("qSubmit").disabled = !any;
      };
      body.appendChild(d);
    });
    Q._check = function () {
      var ans = q.answer.slice().sort().join(",");
      var got = [];
      Object.keys(Q._picks).forEach(function (k) { if (Q._picks[k]) got.push(parseInt(k, 10)); });
      return got.sort().join(",") === ans;
    };
    Q._reveal = function () {
      body.querySelectorAll(".opt").forEach(function (x, idx) {
        if (q.answer.indexOf(idx) >= 0) x.classList.add("right");
        else if (Q._picks[idx]) x.classList.add("wrong");
      });
    };
  }

  // ---- 排序（闯关内）----
  function renderOrder(q, card) {
    var body = el("qBody");
    var items = q.items.map(function (t, i) { return { t: t, correct: q.answer.indexOf(i) }; });
    Q._order = shuffle(items);
    renderOrderList(body);
    Q._check = function () {
      for (var i = 0; i < Q._order.length; i++) if (Q._order[i].correct !== i) return false;
      return true;
    };
    Q._reveal = function () {
      body.querySelectorAll(".order-item").forEach(function (x, idx) {
        if (Q._order[idx].correct === idx) x.classList.add("right");
        else x.classList.add("wrong");
      });
    };
  }
  function renderOrderList(body) {
    body.innerHTML = "";
    Q._order.forEach(function (it, idx) {
      var d = document.createElement("div");
      d.className = "order-item";
      d.draggable = true;
      d.innerHTML =
        '<span class="order-num">' + (idx + 1) + "</span>" +
        "<span>" + it.t + "</span>" +
        '<span class="order-move">' +
          '<button data-dir="-1">↑</button><button data-dir="1">↓</button>' +
        "</span>";
      d.querySelector('[data-dir="-1"]').onclick = function (e) { e.stopPropagation(); move(idx, -1); };
      d.querySelector('[data-dir="1"]').onclick = function (e) { e.stopPropagation(); move(idx, 1); };
      d.ondragstart = function (e) { Q._dragFrom = idx; d.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(idx)); };
      d.ondragend = function () { d.classList.remove("dragging"); };
      d.ondragover = function (e) { e.preventDefault(); d.classList.add("drag-over"); };
      d.ondragleave = function () { d.classList.remove("drag-over"); };
      d.ondrop = function (e) { e.preventDefault(); d.classList.remove("drag-over"); move(Q._dragFrom, 0, idx); };
      body.appendChild(d);
    });
  }
  function move(from, dir, to) {
    if (Q.answered) return;
    var target = (to !== undefined) ? to : from + dir;
    if (target < 0 || target >= Q._order.length) return;
    var arr = Q._order;
    var t = arr[from]; arr[from] = arr[target]; arr[target] = t;
    renderOrderList(el("qBody"));
  }

  /* ------------------------------------------------------------
     连线（闯关内·连连看）：做题过程零对错反馈
     - 左点一项、右点一项即连成一对，只记录配对、显示编号
     - 点击已连线的项可取消该对重连；「清空重连」一键全部重来
     - 连满后点「提交答案」，一次性集中判分并公布错题正确答案
     ------------------------------------------------------------ */
  function renderMatch(q, card) {
    var body = el("qBody");
    var pairs = q.pairs;
    var rights = shuffle(pairs.map(function (p) { return p.r; }));
    Q._pairs = pairs;
    Q._rights = rights;
    Q._links = [];             // [{ l, r }]，做题过程中只记录连线
    Q._selL = null; Q._selR = null;

    body.innerHTML =
      '<div class="match-wrap">' +
        '<div class="match-col" id="mL"></div>' +
        '<div class="match-col" id="mR"></div>' +
      "</div>" +
      '<div class="lk-progress" id="mProgress"></div>';
    var mL = el("mL"), mR = el("mR");
    pairs.forEach(function (p, i) {
      var d = document.createElement("div");
      d.className = "match-item"; d.setAttribute("data-l", i);
      d.textContent = p.l;
      d.onclick = function () { pickSide("L", i); };
      mL.appendChild(d);
    });
    rights.forEach(function (txt, j) {
      var d = document.createElement("div");
      d.className = "match-item"; d.setAttribute("data-r", j);
      d.textContent = txt;
      d.onclick = function () { pickSide("R", j); };
      mR.appendChild(d);
    });

    var reset = el("qReset");
    reset.classList.remove("hidden");
    reset.onclick = function () { Q._links = []; Q._selL = Q._selR = null; drawLinks(); };
    el("qSubmit").disabled = true;

    Q._check = function () {
      var allOk = Q._links.length === Q._pairs.length;
      var usedL = {}, mistakes = [];
      Q._linkOk = [];
      Q._links.forEach(function (lk, i) {
        usedL[lk.l] = 1;
        var correct = Q._pairs[lk.l].r;
        var chosen = Q._rights[lk.r];
        var ok = (chosen === correct);
        Q._linkOk[i] = ok;
        if (!ok) {
          allOk = false;
          mistakes.push({ l: Q._pairs[lk.l].l, chosen: chosen, correct: correct, skipped: false });
        }
      });
      Q._pairs.forEach(function (p, i) {
        if (usedL[i]) return;
        allOk = false;
        mistakes.push({ l: p.l, chosen: "", correct: p.r, skipped: true });
      });
      Q._matchMistakes = mistakes;
      return allOk;
    };
    Q._reveal = drawLinks;
  }

  function pickSide(kind, idx) {
    if (Q.answered) return;
    // 点击已连线的项 → 取消这一对，重新连
    var hit = -1;
    Q._links.forEach(function (lk, i) {
      if ((kind === "L" ? lk.l : lk.r) === idx) hit = i;
    });
    if (hit >= 0) {
      Q._links.splice(hit, 1);
      Q._selL = Q._selR = null;
      drawLinks(); return;
    }
    if (kind === "L") Q._selL = (Q._selL === idx ? null : idx);
    else Q._selR = (Q._selR === idx ? null : idx);
    if (Q._selL !== null && Q._selR !== null) {
      Q._links.push({ l: Q._selL, r: Q._selR });
      Q._selL = Q._selR = null;
    }
    drawLinks();
  }

  function drawLinks() {
    if (!Q || !Q._pairs) return;
    var submitted = !!Q.answered;
    var numL = {}, numR = {}, okL = {}, okR = {};
    Q._links.forEach(function (lk, i) {
      numL[lk.l] = i + 1; numR[lk.r] = i + 1;
      if (submitted && Q._linkOk && Q._linkOk.length) {
        okL[lk.l] = Q._linkOk[i]; okR[lk.r] = Q._linkOk[i];
      }
    });
    function paint(colId, side) {
      var col = el(colId);
      if (!col) return;
      col.querySelectorAll(".match-item").forEach(function (node, idx) {
        var key = side === "L" ? "l" : "r";
        var txt = side === "L" ? Q._pairs[idx].l : Q._rights[idx];
        node.className = "match-item";
        var num = side === "L" ? numL[idx] : numR[idx];
        if (num) node.classList.add("paired");
        if (submitted && num) node.classList.add((side === "L" ? okL[idx] : okR[idx]) ? "right" : "wrong");
        if (!submitted && ((side === "L" && Q._selL === idx) || (side === "R" && Q._selR === idx))) node.classList.add("pick");
        node.innerHTML = (num ? '<span class="lk-pair-no">' + num + "</span>" : "") + "<span>" + esc(txt) + "</span>";
      });
    }
    paint("mL", "L"); paint("mR", "R");
    var prog = el("mProgress");
    if (prog) prog.textContent = "已连线 " + Q._links.length + " / " + Q._pairs.length + " 对" +
      (submitted ? "　·　判分完成" : "　·　提交前不显示对错");
    var sub = el("qSubmit");
    if (sub && !submitted) sub.disabled = Q._links.length < Q._pairs.length;
    var rst = el("qReset");
    if (rst) rst.classList.toggle("hidden", submitted);
  }

  function mistakeHtml() {
    var ms = Q._matchMistakes || [];
    if (!ms.length) return "";
    return '<div class="lk-answer-title">📖 错题正确答案</div>' +
      ms.map(function (m) {
        return '<div class="lk-ans-row">' +
          '<div class="lk-ans-wrong">❌ 你连的：<b>' + esc(m.l) + "</b> → " +
            esc(m.skipped ? "（未连线）" : m.chosen) + "</div>" +
          '<div class="lk-ans-right">✅ 正确答案：<b>' + esc(m.l) + "</b> → " + esc(m.correct) + "</div>" +
        "</div>";
      }).join("");
  }

  // ---- 提交 / 即时判分 / 下一题 ----
  function answer(q) {
    if (Q.answered) return;
    var ok = Q._check();
    Q.answered = true;
    if (Q._reveal) Q._reveal();

    var fb = document.createElement("div");
    fb.className = "feedback " + (ok ? "ok" : "no");
    if (ok) {
      Q.combo++;
      var gain = 10 + Math.min(Q.combo, 10) * 2;
      Q.xp += gain;
      var healed = false;
      if (Q.lives < 3) { Q.lives++; healed = true; }
      var res = (window.FunCampaign ? FunCampaign.award("quiz", 1, q.dynastyId) : { awarded: 0 });
      var cardLine = res.awarded > 0
        ? "<br>🃏 获得 " + res.awarded + " 张卡牌"
        : "<br>🃏 该玩法卡牌已达上限";
      fb.innerHTML = "<b>答对啦！🎉</b> +" + gain + " 经验（连击 ×" + Q.combo + "）" +
        (healed ? "<br>❤️ 生命值 +1" : "") +
        cardLine +
        (q.explanation ? "<br>📖 " + q.explanation : "");
    } else {
      Q.combo = 0; Q.lives--; Q.wrong++;
      fb.innerHTML = "<b>答错了～</b> 正确答案已高亮。" +
        (q.explanation ? "<br>📖 " + q.explanation : "");
      if (Q._matchMistakes && Q._matchMistakes.length) {
        Q._matchMistakes.forEach(function (m) {
          FunStore.addReview({
            q: "【连线题】" + m.l + " ↔ ？",
            a: m.correct,
            source: "闯关答题",
            note: "你连的是：" + (m.chosen || "未连线") + "。" +
              (q.dynasty ? "【" + q.dynasty + "】" : "") + (q.explanation || "")
          });
        });
      } else {
        FunStore.addReview({
          q: q.q, a: q.answer, source: "闯关答题",
          note: (q.dynasty ? "【" + q.dynasty + "】" : "") + (q.explanation || "")
        });
      }
    }
    el("qCard").appendChild(fb);
    if (Q._matchMistakes && Q._matchMistakes.length) {
      var box = document.createElement("div");
      box.className = "lk-answer-box";
      box.innerHTML = mistakeHtml();
      el("qCard").appendChild(box);
    }
    var sub = el("qSubmit"); if (sub) sub.classList.add("hidden");
    el("qNext").classList.remove("hidden");
    updateTop();
  }

  function next() {
    if (Q.lives <= 0) { finish(); return; }
    Q.i++;
    if (Q.i >= Q.qs.length) { finish(); return; }
    Q.answered = false;
    renderQuestion();
  }

  function finish() {
    stopTotalClock();
    var root = el("view-quiz");
    var total = Q.seen;
    var acc = total ? Math.round(((total - Q.wrong) / total) * 100) : 0;
    var survived = Q.lives > 0;
    var xpTotal = Q.xp + (survived ? 20 : 0); // 通关奖励
    FunStore.addXp(xpTotal);

    var notes = [];
    if (FunUI.award("rookie")) notes.push("🌱 初出茅庐");
    if (survived && Q.wrong === 0 && FunUI.award("perfect")) notes.push("🎯 百发百中");

    var emoji = survived ? (Q.wrong === 0 ? "🏆" : "🎉") : "💪";
    var html =
      '<div class="panel result">' +
        '<div class="big-emoji">' + emoji + "</div>" +
        "<h2>" + (survived ? "闯关成功！" : "闯关结束") + "</h2>" +
        '<div class="score-line">正确率 <b>' + acc + "%</b> · 剩余生命 " + Q.lives + "❤️</div>" +
        '<div class="xp-gain">+ ' + xpTotal + " 经验</div>" +
        (notes.length ? '<div class="score-line">解锁徽章：' + notes.join("、") + "</div>" : "") +
        '<div class="actions">' +
          '<button class="btn" id="rAgain">再玩一次</button>' +
          '<button class="btn ghost" id="rHome">回主页</button>' +
        "</div>" +
      "</div>";
    root.innerHTML = html;
    el("rAgain").onclick = function () { startRun(); };
    el("rHome").onclick = function () { FunUI.go("home"); };
    FunUI.refreshHUD();
  }

  // 只读自检接口：供本地回归脚本验证考点去重与跨轮出题，不参与游戏逻辑
  window.FunQuiz = {
    open: open,
    _test: { buildPool: buildPool, topics: TOPIC_OF, markSeen: markSeen }
  };
})();
