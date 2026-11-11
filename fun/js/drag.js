/* ============================================================
   趣味历史乐园 · 拖拽互动馆
   1) 时间轴排序  2) 连连看（4 种题型·不重复出题）
   统一规则：做题过程中不给任何对错反馈；点「提交答案」后
   系统一次性集中判分，并针对做错的题目显示正确答案。
   ============================================================ */
(function () {
  "use strict";

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
  function recordWrong(item) {
    if (window.FunStore && FunStore.addReview) FunStore.addReview(item);
  }

  var SUB = "sort"; // sort | link

  /* ---- 连连看：题型选择 + 去重出题状态 ---- */
  var LINK_TYPE = "mix";                  // mix | capital | figure | deed | event
  var LINK_LAST_TYPE = "";                // 混合模式下避免连续两批同题型
  var LINK_STATE_KEY = "fun_link_state_v1";
  var linkState = { seen: {}, last: {} }; // seen: 本轮已出题；last: 上一批题目（新一轮时排除）

  function loadLinkState() {
    try {
      var o = JSON.parse(localStorage.getItem(LINK_STATE_KEY));
      if (o && o.seen && o.last) linkState = o;
    } catch (e) { linkState = { seen: {}, last: {} }; }
  }
  function saveLinkState() {
    try { localStorage.setItem(LINK_STATE_KEY, JSON.stringify(linkState)); } catch (e) {}
  }
  function linkTypes() {
    return (window.FunLinkData && FunLinkData.types) ? FunLinkData.types : [];
  }
  function linkTypeById(id) {
    var ts = linkTypes();
    for (var i = 0; i < ts.length; i++) if (ts[i].id === id) return ts[i];
    return ts[0] || null;
  }
  function chooseLinkType() {
    var ts = linkTypes();
    if (!ts.length) return null;
    if (LINK_TYPE !== "mix") return linkTypeById(LINK_TYPE);
    var pool = ts.filter(function (t) { return t.id !== LINK_LAST_TYPE; });
    if (!pool.length) pool = ts;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  // 抽一批：只从「本轮未出过」的题里取；题目用尽自动开新一轮（并排除上一批）
  // 同时做同批左右文本二次去重，确保一局内绝不出现重复题目/选项
  function nextLinkBatch(type, n) {
    var seen = linkState.seen[type.id] || [];
    var last = linkState.last[type.id] || [];
    var avail = type.pairs.filter(function (p) { return seen.indexOf(p.id) < 0; });
    if (avail.length < n) {
      seen = [];
      avail = type.pairs.filter(function (p) { return last.indexOf(p.id) < 0; });
      if (avail.length < n) avail = type.pairs.slice();
    }
    var count = Math.min(n, avail.length);
    var pool = shuffle(avail), picked = [], useL = {}, useR = {};
    for (var i = 0; i < pool.length && picked.length < count; i++) {
      var p = pool[i];
      if (useL[p.l] || useR[p.r]) continue;   // 同批内左项/右项文本不得重复
      useL[p.l] = useR[p.r] = true;
      picked.push(p);
    }
    linkState.seen[type.id] = seen.concat(picked.map(function (p) { return p.id; }));
    linkState.last[type.id] = picked.map(function (p) { return p.id; });
    saveLinkState();
    return picked;
  }

  function open() {
    var root = el("view-drag");
    root.innerHTML =
      '<div class="back-link" data-go="home">← 返回主页</div>' +
      '<div class="panel">' +
        '<div class="section-title">🎮 拖拽互动馆</div>' +
        '<div class="section-sub">动手又动脑：把事件排回时间线，把人物、典故与朝代连起来。' +
          '<b>做题过程中不提示对错</b>，点「提交答案」后系统一次性集中判分，并公布做错题目的正确答案；答错的题会自动收进「间隔复习」。</div>' +
        '<div class="subtabs">' +
          '<button class="subtab active" data-sub="sort">⏳ 时间轴排序</button>' +
          '<button class="subtab" data-sub="link">🔗 连连看</button>' +
        "</div>" +
        '<div id="dragBody"></div>' +
      "</div>";
    root.querySelectorAll(".subtab").forEach(function (b) {
      b.onclick = function () {
        root.querySelectorAll(".subtab").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        SUB = b.getAttribute("data-sub");
        renderBody();
      };
    });
    root.querySelector('[data-go="home"]').onclick = function () { FunUI.go("home"); };
    renderBody();
  }

  function renderBody() {
    if (SUB === "sort") renderSort();
    else renderLink();
  }

  /* ---------------- 时间轴排序 ---------------- */
  function renderSort() {
    var body = el("dragBody");
    var ds = FunData.dynasties.filter(function (d) { return FunData.eventsOf(d.id).length >= 2; });
    body.innerHTML =
      '<div class="tl-intro">📜 <b>玩法：</b>系统随机抽取一个朝代，把打乱的历史事件<b>按时间先后排好</b>。' +
        '排序时只显示事件内容、不显示时间，也不提示对错；可以拖拽整条或用 ↑↓ 微调。' +
        '点「提交排序」后系统<b>一次性集中判分</b>，并公布每个事件的正确位置与时间，做错的题会进入「间隔复习」。</div>' +
      '<div id="sortStage"></div>';
    if (!ds.length) { el("sortStage").innerHTML = "<p>暂无足够事件，稍后再来～</p>"; return; }
    var pick = ds[Math.floor(Math.random() * ds.length)];
    playSort(pick.id);
  }

  function playSort(id) {
    var d = FunData.dynastyById(id);
    var evs = FunData.eventsOf(id);
    if (evs.length < 2) { el("sortStage").innerHTML = "<p>该朝代事件较少，换一个试试～</p>"; return; }
    var order = shuffle(evs.map(function (e) { return e.index; })); // order[pos] = 原事件 index
    var stage = el("sortStage");
    var dragFrom = null;
    var submitted = false;
    var awardMsg = "";
    var correctOrder = evs.map(function (e) { return e.index; });
    var answerText = evs.map(function (e, i) {
      return (i + 1) + ". " + e.title + "（" + (e.yearLabel || e.time || "年代不详") + "）";
    }).join("　→　");

    function moveTo(from, to) {
      if (submitted || from === to) return;
      to = Math.max(0, Math.min(order.length - 1, to));
      var item = order.splice(from, 1)[0];
      order.splice(to, 0, item);
      draw();
    }

    function draw() {
      var rows = order.map(function (origIdx, pos) {
        var e = evs.filter(function (x) { return x.index === origIdx; })[0];
        var right = origIdx === pos;
        var cls = "tl-item" + (submitted ? (right ? " right" : " wrong") : "");
        var posTip = submitted && !right
          ? '<span class="tl-correct">正确位置：第 ' + (origIdx + 1) + " 位</span>" : "";
        var time = submitted
          ? '<span class="tl-time">' + esc(e.yearLabel || e.time || "") + "</span>" : "";
        return '<div class="' + cls + '" data-pos="' + pos + '" draggable="' + (!submitted) + '">' +
          '<span class="grip">⠿</span>' +
          '<span class="order-num">' + (pos + 1) + "</span>" +
          time + "<span>" + esc(e.title) + "</span>" + posTip +
          '<span class="order-move">' +
            (submitted ? "" : '<button data-dir="-1">↑</button><button data-dir="1">↓</button>') +
          "</span>" +
        "</div>";
      }).join("");

      var bar;
      if (!submitted) {
        bar = '<div class="quiz-actions">' +
          '<button class="btn" id="sortSubmit">提交排序</button>' +
          '<button class="btn ghost" id="sortShuffle">打乱重来</button>' +
        "</div>";
      } else {
        var correctCnt = order.filter(function (idx, i) { return idx === i; }).length;
        var allOk = correctCnt === order.length;
        bar = '<div class="feedback ' + (allOk ? "ok" : "no") + '">' +
            (allOk
              ? "<b>完美！时间线正确 👏</b>" + awardMsg
              : "<b>集中判分：" + correctCnt + " / " + order.length + " 项就位</b>　绿色正确、红色错位，每条错位事件已标出正确位置。" + awardMsg) +
          "</div>" +
          '<div class="tl-answer"><b>✅ 正确答案（完整时间线）：</b><br>' + esc(answerText) + "</div>" +
          '<div class="quiz-actions">' +
            '<button class="btn ghost" id="sortAnswer">按正确顺序排列</button>' +
            '<button class="btn" id="sortAgain">换一个朝代</button>' +
          "</div>";
      }
      stage.innerHTML =
        '<div class="tl-dyn-label">📍 当前朝代：<b>' + esc(d.name) + "</b>" +
          (d.period ? "（" + esc(d.period) + "）" : "") + "</div>" +
        rows + bar;

      stage.querySelectorAll(".tl-item").forEach(function (item) {
        var pos = parseInt(item.getAttribute("data-pos"), 10);
        var up = item.querySelector('[data-dir="-1"]');
        var down = item.querySelector('[data-dir="1"]');
        if (up) up.onclick = function (ev) { ev.stopPropagation(); moveTo(pos, pos - 1); };
        if (down) down.onclick = function (ev) { ev.stopPropagation(); moveTo(pos, pos + 1); };
        if (!submitted) {
          item.ondragstart = function (ev) {
            dragFrom = pos; item.classList.add("dragging");
            if (ev.dataTransfer) {
              ev.dataTransfer.effectAllowed = "move";
              ev.dataTransfer.setData("text/plain", String(pos));
            }
          };
          item.ondragend = function () { item.classList.remove("dragging"); };
          item.ondragover = function (ev) { ev.preventDefault(); item.classList.add("drag-over"); };
          item.ondragleave = function () { item.classList.remove("drag-over"); };
          item.ondrop = function (ev) {
            ev.preventDefault(); item.classList.remove("drag-over");
            moveTo(dragFrom, pos);
          };
        }
      });
      if (!submitted) {
        el("sortSubmit").onclick = grade;
        el("sortShuffle").onclick = function () {
          order = shuffle(correctOrder.slice());
          draw();
        };
      } else {
        el("sortAnswer").onclick = function () { order = correctOrder.slice(); draw(); };
        el("sortAgain").onclick = renderSort;
      }
    }

    function grade() {
      if (submitted) return;
      submitted = true;                       // 提交后一次性集中判分
      var correctCnt = order.filter(function (idx, i) { return idx === i; }).length;
      var allOk = correctCnt === order.length;

      // 做错的每一条都写入错题本，并附上正确答案
      order.forEach(function (origIdx, pos) {
        if (origIdx === pos) return;
        var e = evs.filter(function (x) { return x.index === origIdx; })[0];
        recordWrong({
          q: "【" + d.name + "】「" + e.title + "」应排在时间线第几位？",
          a: "第 " + (origIdx + 1) + " 位（" + (e.yearLabel || e.time || "年代不详") + "）",
          source: "时间轴排序",
          note: "正确顺序：" + answerText
        });
      });

      if (allOk) {
        FunStore.addXp(25);
        FunUI.award("timeline");
        var res = (window.FunCampaign ? FunCampaign.award("drag", FunCampaign.CONFIG.DRAG_GAME_CARDS.sort, id) : { awarded: 0, cards: [] });
        var cardNames = (res.cards || []).map(function (c) { return c.name; }).join("、");
        awardMsg = " · +25 经验" + (cardNames ? " · 获得卡牌 " + esc(cardNames) : " · 该玩法卡牌已达上限");
        FunUI.refreshHUD();
      }
      draw();
    }

    draw();
  }

  /* ---------------- 连连看（提交后集中判分） ---------------- */
  function renderLink() {
    var body = el("dragBody");
    var ts = linkTypes();
    if (!ts.length) { body.innerHTML = "<p>题库未加载，请刷新页面重试～</p>"; return; }
    loadLinkState();

    var tabs = '<button class="lt-btn' + (LINK_TYPE === "mix" ? " active" : "") + '" data-lt="mix">🎲 全部混合</button>' +
      ts.map(function (t) {
        return '<button class="lt-btn' + (LINK_TYPE === t.id ? " active" : "") + '" data-lt="' + t.id + '">' + esc(t.name) + "</button>";
      }).join("");

    body.innerHTML =
      '<div class="tl-intro">🔗 <b>玩法：</b>左边点一项、右边点一项即可连成一对，' +
        '连线时<b>不提示对错</b>；全部连好后点「提交答案」，系统<b>一次性集中判分</b>，' +
        '并针对连错的题目<b>显示正确答案</b>。同一批不会出现重复题目或选项，答错的题会进入「间隔复习」。</div>' +
      '<div class="link-types" id="linkTypes">' + tabs + "</div>" +
      '<div class="tl-intro lk-intro" id="linkIntro"></div>' +
      '<div class="quiz-actions"><button class="btn ghost" id="linkNew">换一批</button></div>' +
      '<div id="linkBoard" class="lk-board"></div>';

    body.querySelectorAll("#linkTypes .lt-btn").forEach(function (b) {
      b.onclick = function () {
        LINK_TYPE = b.getAttribute("data-lt");
        body.querySelectorAll("#linkTypes .lt-btn").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        playLink();
      };
    });
    el("linkNew").onclick = playLink;
    playLink();
  }

  function playLink() {
    var board = el("linkBoard");
    var type = chooseLinkType();
    if (!type || !type.pairs.length) { board.innerHTML = "<p>题库暂不可用，请刷新页面重试～</p>"; return; }
    LINK_LAST_TYPE = type.id;
    var pick = nextLinkBatch(type, 5);
    var total = pick.length;
    var byId = {}, byLeft = {};
    pick.forEach(function (p) { byId[p.id] = p; byLeft[p.l] = p; });

    var intro = el("linkIntro");
    if (intro) intro.innerHTML = "📌 <b>本批题型：" + esc(type.name) + "</b>（" + esc(type.left) + " ↔ " + esc(type.right) + "）　" + esc(type.intro);

    var left = shuffle(pick.map(function (p, i) { return { key: "L" + i, pid: p.id, text: p.l }; }));
    var right = shuffle(pick.map(function (p, i) { return { key: "R" + i, pid: p.id, text: p.r }; }));
    var leftByKey = {}, rightByKey = {};
    left.forEach(function (c) { leftByKey[c.key] = c; });
    right.forEach(function (c) { rightByKey[c.key] = c; });

    var pairs = [];          // { lKey, rKey }，做题过程中只记录连线，不判对错
    var selL = null, selR = null;
    var submitted = false, graded = null;

    function pairOfL(k) { return pairs.filter(function (p) { return p.lKey === k; })[0]; }
    function pairOfR(k) { return pairs.filter(function (p) { return p.rKey === k; })[0]; }

    function onPick(kind, key) {
      if (submitted) return;
      // 点击已连线的卡 → 取消这一对，重新连
      var hit = kind === "L" ? pairOfL(key) : pairOfR(key);
      if (hit) {
        pairs = pairs.filter(function (p) { return p !== hit; });
        selL = selR = null;
        draw(); return;
      }
      if (kind === "L") selL = (selL === key ? null : key);
      else selR = (selR === key ? null : key);
      if (selL && selR) {
        pairs.push({ lKey: selL, rKey: selR });
        selL = selR = null;
      }
      draw();
    }

    function cardHtml(c, kind, num) {
      var cls = "lk-card";
      if (num) cls += " paired";
      if (selL === c.key || selR === c.key) cls += " pick";
      if (submitted && num) cls += (graded.pairOk[num - 1] ? " lk-ok" : " lk-bad");
      return '<div class="' + cls + '" data-kind="' + kind + '" data-key="' + c.key + '">' +
        (num ? '<span class="lk-pair-no">' + num + "</span>" : "") +
        "<span>" + esc(c.text) + "</span></div>";
    }
    function colHtml(list, kind) {
      return '<div class="lk-col"><div class="lk-col-title">' +
        esc(kind === "L" ? type.left : type.right) + '</div><div class="lk-col-body">' +
        list.map(function (c) {
          var num = 0;
          pairs.forEach(function (p, i) {
            if ((kind === "L" ? p.lKey : p.rKey) === c.key) num = i + 1;
          });
          return cardHtml(c, kind, num);
        }).join("") + "</div></div>";
    }

    function draw() {
      var actions = "";
      if (!submitted) {
        actions = '<div class="quiz-actions lk-actions">' +
          '<button class="btn" id="linkSubmit">提交答案</button>' +
          '<button class="btn ghost" id="linkReset">清空重连</button>' +
        "</div>";
      } else {
        actions = '<div class="quiz-actions lk-actions">' +
          '<button class="btn" id="linkRetry">再做一次（同批）</button>' +
          '<button class="btn ghost" id="linkNext">换一批 →</button>' +
        "</div>";
      }
      board.innerHTML =
        '<div class="lk-cols">' + colHtml(left, "L") + colHtml(right, "R") + "</div>" +
        '<div class="lk-progress">已连线 ' + pairs.length + " / " + total + " 对" +
          (submitted ? "　·　判分完成" : "　·　提交前不显示对错") + "</div>" +
        actions +
        (submitted ? resultHtml() : "");

      board.querySelectorAll(".lk-card").forEach(function (c) {
        c.onclick = function () { onPick(c.getAttribute("data-kind"), c.getAttribute("data-key")); };
      });
      if (!submitted) {
        var sub = el("linkSubmit"); if (sub) sub.onclick = grade;
        var rst = el("linkReset"); if (rst) rst.onclick = function () { pairs = []; selL = selR = null; draw(); };
      } else {
        var nx = el("linkNext"); if (nx) nx.onclick = playLink;
        var rt = el("linkRetry"); if (rt) rt.onclick = function () {
          pairs = []; selL = selR = null; submitted = false; graded = null;
          left = shuffle(left); right = shuffle(right);
          draw();
        };
      }
    }

    function resultHtml() {
      var okCnt = graded.pairOk.filter(Boolean).length;
      var allOk = okCnt === total && pairs.length === total;
      var rows = graded.mistakes.map(function (m) {
        return '<div class="lk-ans-row">' +
          '<div class="lk-ans-wrong">❌ 你连的：<b>' + esc(m.lText) + "</b> → " + esc(m.chosen || "（未连线）") + "</div>" +
          '<div class="lk-ans-right">✅ 正确答案：<b>' + esc(m.lText) + "</b> → " + esc(m.correct) + "</div>" +
        "</div>";
      }).join("");
      return '<div class="feedback ' + (allOk ? "ok" : "no") + '">' +
          (allOk
            ? "<b>全部配对正确 🔗</b>" + graded.awardMsg
            : "<b>集中判分：答对 " + okCnt + " / " + total + " 对</b>　连错和漏连的题目，正确答案已在下方公布。") +
        "</div>" +
        (rows ? '<div class="lk-answer-box"><div class="lk-answer-title">📖 错题正确答案</div>' + rows + "</div>" : "");
    }

    function grade() {
      if (submitted) return;
      submitted = true;
      var pairOk = [], mistakes = [];
      var usedLeft = {}, awardMsg = "";

      pairs.forEach(function (p) {
        var l = leftByKey[p.lKey], r = rightByKey[p.rKey];
        if (!l || !r) return;
        usedLeft[l.key] = 1;
        var ok = l.pid === r.pid;
        pairOk.push(ok);
        if (!ok) {
          var correct = byId[l.pid] ? byId[l.pid].r : "";
          mistakes.push({ lText: l.text, chosen: r.text, correct: correct });
          recordWrong({
            q: "【" + type.name + "】" + l.text + " ↔ ？",
            a: correct,
            source: "连连看",
            note: "你连的是：" + r.text + "；本批关系：" + type.left + " ↔ " + type.right
          });
        }
      });
      // 漏连的左项也算做错，并公布正确答案
      left.forEach(function (c) {
        if (usedLeft[c.key]) return;
        var correct = byId[c.pid] ? byId[c.pid].r : "";
        mistakes.push({ lText: c.text, chosen: "", correct: correct });
        recordWrong({
          q: "【" + type.name + "】" + c.text + " ↔ ？",
          a: correct,
          source: "连连看",
          note: "本题未连线；本批关系：" + type.left + " ↔ " + type.right
        });
      });

      var allOk = pairOk.length === total && pairOk.every(Boolean);
      if (allOk) {
        FunStore.addXp(25);
        FunUI.award("matcher");
        var res = (window.FunCampaign ? FunCampaign.award("drag", FunCampaign.CONFIG.DRAG_GAME_CARDS.link, pick[0].d) : { awarded: 0, cards: [] });
        var names = (res.cards || []).map(function (c) { return c.name; }).join("、");
        awardMsg = " · +25 经验" + (names ? " · 获得卡牌 " + esc(names) : " · 该玩法卡牌已达上限");
        FunUI.refreshHUD();
      }
      graded = { pairOk: pairOk, mistakes: mistakes, awardMsg: awardMsg };
      draw();
    }

    draw();
  }

  window.FunDrag = { open: open };
})();
