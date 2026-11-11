/* ============================================================
   趣味历史乐园 · 拖拽互动馆
   1) 时间轴排序  2) 连连看（4 种题型·不重复出题）
   统一交互：清晰规则 + 提交/检查按钮 + 即时对错反馈 + 换下一张。
   ============================================================ */
(function () {
  "use strict";

  function el(id) { return document.getElementById(id); }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
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
        '<div class="section-sub">动手又动脑：把事件排回时间线，把人物、典故与朝代连起来！每个游戏都有规则说明，做完会立刻告诉你对错。</div>' +
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
      '<div class="tl-intro">📜 <b>玩法：</b>系统会从全部朝代里随机抽取一个，把打乱的历史事件<b>按时间先后排好</b>。排序时卡片<b>只显示事件内容、不显示时间</b>，可以拖拽整条到目标位置，也可以用 ↑↓ 微调；排好后点「提交排序」，系统会判对错并<b>显示每个事件对应的具体时间</b>。点「换一个朝代」可随机抽取下一关。</div>' +
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
    var answered = false;
    var reveal = false;   // 提交后才显示对应时间
    var awardMsg = "";

    function moveTo(from, to) {
      if (answered || from === to) return;
      var item = order.splice(from, 1)[0];
      if (to > from) to--;           // 移除后索引前移
      order.splice(to, 0, item);
      draw();
    }

    function draw() {
      stage.innerHTML = '<div class="tl-dyn-label">📍 当前朝代：<b>' + d.name + '</b>' + (d.period ? '（' + d.period + '）' : '') + '</div>';
      order.forEach(function (origIdx, pos) {
        var e = evs.filter(function (x) { return x.index === origIdx; })[0];
        var item = document.createElement("div");
        item.className = "tl-item";
        if (answered) item.classList.add(order[pos] === pos ? "right" : "wrong");
        item.draggable = !answered;
        item.innerHTML =
          '<span class="grip">⠿</span>' +
          '<span class="order-num">' + (pos + 1) + "</span>" +
          (reveal ? '<span class="tl-time">' + (e.yearLabel || e.time || "") + "</span>" : "") +
          "<span>" + e.title + "</span>" +
          '<span class="order-move">' +
            '<button data-dir="-1">↑</button><button data-dir="1">↓</button>' +
          "</span>";
        item.querySelector('[data-dir="-1"]').onclick = function (ev) { ev.stopPropagation(); moveTo(pos, pos - 1); };
        item.querySelector('[data-dir="1"]').onclick = function (ev) { ev.stopPropagation(); moveTo(pos, pos + 1); };
        if (!answered) {
          item.ondragstart = function (ev) {
            dragFrom = pos; item.classList.add("dragging");
            ev.dataTransfer.effectAllowed = "move";
            ev.dataTransfer.setData("text/plain", String(pos));
          };
          item.ondragend = function () { item.classList.remove("dragging"); };
          item.ondragover = function (ev) { ev.preventDefault(); item.classList.add("drag-over"); };
          item.ondragleave = function () { item.classList.remove("drag-over"); };
          item.ondrop = function (ev) { ev.preventDefault(); item.classList.remove("drag-over"); moveTo(dragFrom, pos); };
        }
        stage.appendChild(item);
      });

      var bar = document.createElement("div");
      bar.className = "quiz-actions";
      if (!answered) {
        bar.innerHTML =
          '<button class="btn" id="sortSubmit">提交排序</button>' +
          '<button class="btn ghost" id="sortShuffle">打乱重来</button>';
      } else {
        var correctCnt = order.filter(function (idx, i) { return idx === i; }).length;
        var allOk = correctCnt === order.length;
        bar.innerHTML =
          '<div class="feedback ' + (allOk ? "ok" : "no") + '">' +
            (allOk
              ? "<b>完美！时间线正确 👏</b> 各事件对应时间已显示" + awardMsg
              : "<b>还差一点～</b> 各事件对应时间已显示，绿色已就位、红色需调整。") +
          "</div>" +
          '<button class="btn ghost" id="sortAnswer">查看正确顺序</button>' +
          '<button class="btn" id="sortAgain">换一个朝代</button>';
      }
      stage.appendChild(bar);

      if (!answered) {
        el("sortSubmit").onclick = grade;
        el("sortShuffle").onclick = function () {
          if (answered) return;
          order = shuffle(evs.map(function (e) { return e.index; }));
          draw();
        };
      } else {
        el("sortAnswer").onclick = function () {
          order = evs.map(function (e) { return e.index; });
          draw();
        };
        el("sortAgain").onclick = renderSort;
      }
    }

    function grade() {
      if (answered) return;
      answered = true;
      reveal = true;
      var correct = order.filter(function (idx, i) { return idx === i; }).length;
      var allOk = correct === order.length;
      if (allOk) {
        FunStore.addXp(25);
        FunUI.award("timeline");
        var res = (window.FunCampaign ? FunCampaign.award("drag", FunCampaign.CONFIG.DRAG_GAME_CARDS.sort, id) : { awarded: 0, cards: [] });
        var cardNames = res.cards.map(function (c) { return c.name; }).join("、");
        awardMsg = " · +25 经验" + (cardNames ? " · 获得卡牌 " + cardNames : " · 该玩法卡牌已达上限");
        FunUI.refreshHUD();
      }
      draw();
    }

    draw();
  }

  /* ---------------- 连连看（4 种题型 · 不重复出题） ---------------- */
  function renderLink() {
    var body = el("dragBody");
    var ts = linkTypes();
    if (!ts.length) { body.innerHTML = "<p>题库未加载，请刷新页面重试～</p>"; return; }
    loadLinkState();

    var tabs = '<button class="lt-btn' + (LINK_TYPE === "mix" ? " active" : "") + '" data-lt="mix">🎲 全部混合</button>' +
      ts.map(function (t) {
        return '<button class="lt-btn' + (LINK_TYPE === t.id ? " active" : "") + '" data-lt="' + t.id + '">' + t.name + "</button>";
      }).join("");

    body.innerHTML =
      '<div class="tl-intro">🔗 <b>玩法：</b>在两边各点一张，配对正确变绿、配错闪红，配完这一批即过关。' +
        '<b>同一批内不会出现重复题目或选项</b>；已经出过的题会先跳过，直到该题型全部轮完才重新开一轮。</div>' +
      '<div class="link-types" id="linkTypes">' + tabs + "</div>" +
      '<div class="tl-intro lk-intro" id="linkIntro"></div>' +
      '<div class="quiz-actions"><button class="btn" id="linkNew">换一批</button></div>' +
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
    var matched = 0, selL = null, selR = null;

    var intro = el("linkIntro");
    if (intro) intro.innerHTML = '📌 <b>本批题型：' + type.name + '</b>（' + type.left + ' ↔ ' + type.right + '）　' + type.intro;

    board.innerHTML =
      '<div class="lk-cols">' +
        '<div class="lk-col"><div class="lk-col-title">' + type.left + '</div><div id="lkL" class="lk-col-body"></div></div>' +
        '<div class="lk-col"><div class="lk-col-title">' + type.right + '</div><div id="lkR" class="lk-col-body"></div></div>' +
      "</div>" +
      '<div class="lk-progress" id="lkProg">已配对 0 / ' + total + "</div>";

    var lkL = board.querySelector("#lkL"), lkR = board.querySelector("#lkR");

    shuffle(pick.slice()).forEach(function (pp) { makeCard(pp.l, "d", pp.id, lkL); });
    shuffle(pick.slice()).forEach(function (pp) { makeCard(pp.r, "c", pp.id, lkR); });

    function makeCard(text, kind, pid, col) {
      var div = document.createElement("div");
      div.className = "lk-card";
      div.textContent = text;
      div.onclick = function () { onPick(div, kind, pid); };
      col.appendChild(div);
    }

    function clearPick(sel) { if (sel) { sel.elm.classList.remove("pick"); } return null; }

    function onPick(elm, kind, pid) {
      if (elm.classList.contains("matched")) return;
      if (kind === "d") {
        if (selL && selL.elm === elm) { selL = clearPick(selL); return; }
        selL = clearPick(selL); selL = { elm: elm, pid: pid }; elm.classList.add("pick");
      } else {
        if (selR && selR.elm === elm) { selR = clearPick(selR); return; }
        selR = clearPick(selR); selR = { elm: elm, pid: pid }; elm.classList.add("pick");
      }
      if (selL && selR) {
        if (selL.pid === selR.pid) {
          selL.elm.classList.remove("pick"); selL.elm.classList.add("matched", "flash-ok");
          selR.elm.classList.remove("pick"); selR.elm.classList.add("matched", "flash-ok");
          matched++;
          selL = selR = null;
          el("lkProg").textContent = "已配对 " + matched + " / " + total;
          if (matched === total) winLink(pick);
        } else {
          var a = selL.elm, b = selR.elm;
          a.classList.remove("pick"); b.classList.remove("pick");
          a.classList.add("flash-no"); b.classList.add("flash-no");
          setTimeout(function () { a.classList.remove("flash-no"); b.classList.remove("flash-no"); }, 480);
          selL = selR = null;
        }
      }
    }

    function winLink(p) {
      FunStore.addXp(25);
      FunUI.award("matcher");
      var res = (window.FunCampaign ? FunCampaign.award("drag", FunCampaign.CONFIG.DRAG_GAME_CARDS.link, p[0].d) : { awarded: 0, cards: [] });
      var cardNames = res.cards.map(function (c) { return c.name; }).join("、");
      var msg = document.createElement("div");
      msg.className = "feedback ok";
      msg.innerHTML = "<b>全部配对成功 🔗</b> +25 经验" + (cardNames ? " · 获得卡牌 " + cardNames : " · 该玩法卡牌已达上限") +
        '<div class="quiz-actions"><button class="btn" id="linkNext">换一批（下一组）→</button></div>';
      board.appendChild(msg);
      el("linkNext").onclick = playLink;
      FunUI.refreshHUD();
    }
  }

  window.FunDrag = { open: open };
})();
