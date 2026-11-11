/* ============================================================
   趣味历史乐园 · 闯关答题模块
   复用 FunData.quizOf(id) 的五种题型；加入生命值/连击/限时/Boss。
   交互：单选/判断 点选即出结果（即时反馈）；多选/排序/连线 点“提交答案”出结果。
   答对：连击加分 + 生命值 +1（上限 3）；答错：扣血、连击清零。
   ============================================================ */
(function () {
  "use strict";

  var Q = null;          // 当前闯关状态
  var timer = null;      // 倒计时
  var TIME_LIMIT = 20;   // 每题秒数

  function el(id) { return document.getElementById(id); }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function open() {
    var root = el("view-quiz");
    root.innerHTML =
      '<div class="back-link" data-go="home">← 返回主页</div>' +
      '<div class="panel">' +
        '<div class="section-title">⚔️ 闯关答题</div>' +
        '<div class="section-sub">所有朝代的题库已随机打乱，系统会自动出题——每道题都会标注它出自哪个朝代。答对连击加分并回血 +1，答错扣血；生命耗尽即结束！</div>' +
      "</div>";
    root.querySelector('[data-go="home"]').onclick = function () { FunUI.go("home"); };
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
      el("view-quiz").querySelector('[data-go="home"]').onclick = function () { FunUI.go("home"); };
      return;
    }
    Q = {
      id: "all", name: "全朝代混合", qs: shuffle(pool), i: 0,
      lives: 3, combo: 0, wrong: 0, xp: 0, answered: false, seen: 0
    };
    renderQuestion();
  }

  function renderQuestion() {
    var root = el("view-quiz");
    var q = Q.qs[Q.i];
    Q.seen++;
    var isBoss = (Q.i === Q.qs.length - 1);
    var hearts = "";
    for (var h = 0; h < 3; h++) hearts += (h < Q.lives ? "❤️" : "🤍");

    var html =
      '<div class="back-link" data-go="home">← 退出闯关</div>' +
      '<div class="panel">' +
        '<div class="quiz-top">' +
          '<div class="lives" id="qHearts">' + hearts + "</div>" +
          '<div class="combo" id="qCombo">连击 ×' + Q.combo + "</div>" +
          '<div class="timer" id="qTimer">⏱ ' + TIME_LIMIT + "s</div>" +
        "</div>" +
        '<div class="q-dyn">📍 本题出自：<b>' + (q.dynasty || "历史") + "</b></div>" +
        '<div class="q-card" id="qCard"></div>' +
      "</div>";
    root.innerHTML = html;
    root.querySelector('[data-go="home"]').onclick = function () { stopTimer(); FunUI.go("home"); };

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
    // 多选：未选时禁用；排序：默认可交；连线：配对完成后由 renderMatch 启用
    if (q.type === "multiple") el("qSubmit").disabled = true;
    if (q.type === "order") el("qSubmit").disabled = false;

    startTimer();
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

  // ---- 连线（闯关内）----
  function renderMatch(q, card) {
    var body = el("qBody");
    var pairs = q.pairs;
    var lefts = pairs.map(function (p) { return p.l; });
    var rights = shuffle(pairs.map(function (p) { return p.r; }));
    Q._matched = 0;
    Q._selL = null; Q._selR = null;
    Q._pairs = pairs;
    body.innerHTML =
      '<div class="match-wrap">' +
        '<div class="match-col" id="mL"></div>' +
        '<div class="match-col" id="mR"></div>' +
      "</div>";
    var mL = body.querySelector("#mL"), mR = body.querySelector("#mR");
    lefts.forEach(function (txt, i) {
      var d = document.createElement("div");
      d.className = "match-item"; d.setAttribute("data-l", i);
      d.textContent = txt;
      d.onclick = function () { pickL(d, i, mL); };
      mL.appendChild(d);
    });
    rights.forEach(function (txt, j) {
      var d = document.createElement("div");
      d.className = "match-item"; d.setAttribute("data-r", j);
      d.textContent = txt;
      d.onclick = function () { pickR(d, j, mR); };
      mR.appendChild(d);
    });
    el("qSubmit").disabled = true;
    Q._check = function () { return Q._matched === pairs.length; };
    Q._reveal = function () {};
  }
  function pickL(d, i, col) {
    if (Q.answered) return;
    col.querySelectorAll(".match-item").forEach(function (x) { x.classList.remove("pick"); });
    d.classList.add("pick"); Q._selL = i; Q._selLel = d;
    tryMatch();
  }
  function pickR(d, j, col) {
    if (Q.answered) return;
    col.querySelectorAll(".match-item").forEach(function (x) { x.classList.remove("pick"); });
    d.classList.add("pick"); Q._selR = j; Q._selRel = d;
    tryMatch();
  }
  function tryMatch() {
    if (Q._selL === null || Q._selR === null) return;
    var lTxt = Q._pairs[Q._selL].l;
    var rTxt = document.querySelectorAll("#mR .match-item")[Q._selR].textContent;
    var right = (Q._pairs[Q._selL].r === rTxt);
    if (right) {
      Q._selLel.classList.add("done"); Q._selRel.classList.add("done");
      Q._selLel.classList.remove("pick"); Q._selRel.classList.remove("pick");
      Q._matched++;
      Q._selL = Q._selR = null;
      if (Q._matched === Q._pairs.length) el("qSubmit").disabled = false;
    } else {
      Q._selLel.classList.remove("pick"); Q._selRel.classList.remove("pick");
      Q._selL = Q._selR = null;
    }
  }

  // ---- 提交 / 即时判分 / 超时 / 下一题 ----
  function answer(q) {
    if (Q.answered) return;
    var ok = Q._check();
    Q.answered = true;
    stopTimer();
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
      FunStore.addReview({ q: q.q, a: q.answer });
    }
    el("qCard").appendChild(fb);
    var sub = el("qSubmit"); if (sub) sub.classList.add("hidden");
    el("qNext").classList.remove("hidden");
    updateTop();
  }

  function timeout(q) {
    Q.answered = true;
    Q.combo = 0; Q.lives--; Q.wrong++;
    if (Q._reveal) Q._reveal();
    var fb = document.createElement("div");
    fb.className = "feedback no";
    fb.innerHTML = "<b>时间到！⏰</b> 正确答案已高亮。" +
      (q.explanation ? "<br>📖 " + q.explanation : "");
    el("qCard").appendChild(fb);
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
    stopTimer();
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

  /* 外部（超时）使用 */
  function startTimer() {
    stopTimer();
    var left = TIME_LIMIT;
    var t = el("qTimer");
    timer = setInterval(function () {
      left--;
      if (t) {
        t.textContent = "⏱ " + left + "s";
        if (left <= 5) t.classList.add("warn");
      }
      if (left <= 0) {
        stopTimer();
        if (!Q.answered) timeout(Q.qs[Q.i]);
      }
    }, 1000);
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  window.FunQuiz = { open: open };
})();
