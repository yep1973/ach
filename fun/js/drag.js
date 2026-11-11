/* ============================================================
   趣味历史乐园 · 拖拽互动馆
   1) 时间轴排序  2) 连连看（朝代↔都城）  3) 地图拼图（SVG 九宫格）
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

  var SUB = "sort"; // sort | link | puzzle

  function open() {
    var root = el("view-drag");
    root.innerHTML =
      '<div class="back-link" data-go="home">← 返回主页</div>' +
      '<div class="panel">' +
        '<div class="section-title">🎮 拖拽互动馆</div>' +
        '<div class="section-sub">动手又动脑：把事件排回时间线、把朝代和都城连起来、把历史地图拼回去！每个游戏都有规则说明，做完会立刻告诉你对错。</div>' +
        '<div class="subtabs">' +
          '<button class="subtab active" data-sub="sort">⏳ 时间轴排序</button>' +
          '<button class="subtab" data-sub="link">🔗 连连看</button>' +
          '<button class="subtab" data-sub="puzzle">🗺️ 地图拼图</button>' +
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
    else if (SUB === "link") renderLink();
    else renderPuzzle();
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

  /* ---------------- 连连看（朝代 ↔ 都城） ---------------- */
  function renderLink() {
    var body = el("dragBody");
    body.innerHTML =
      '<div class="tl-intro">🔗 <b>玩法：</b>系统会从全部朝代随机抽取若干个，左边是「朝代」，右边是「都城/中心」。在两边各点一张：若是同一朝代的搭配，就配对成功（绿）；若不对，会闪红提示。配完所有对子即过关。</div>' +
      '<div class="quiz-actions"><button class="btn" id="linkNew">换一批</button></div>' +
      '<div id="linkBoard" class="lk-board"></div>';
    el("linkNew").onclick = playLink;
    playLink();
  }

  function playLink() {
    var board = el("linkBoard");
    var cands = FunData.dynasties.filter(function (dd) {
      return dd.capital && dd.capital.indexOf("无") !== 0 && dd.capital.length < 14;
    });
    var pick = shuffle(cands).slice(0, 5);
    var total = pick.length;
    var matched = 0, selL = null, selR = null;

    board.innerHTML =
      '<div class="lk-cols">' +
        '<div class="lk-col"><div class="lk-col-title">朝代</div><div id="lkL" class="lk-col-body"></div></div>' +
        '<div class="lk-col"><div class="lk-col-title">都城 / 中心</div><div id="lkR" class="lk-col-body"></div></div>' +
      "</div>" +
      '<div class="lk-progress" id="lkProg">已配对 0 / ' + total + "</div>";

    var lkL = board.querySelector("#lkL"), lkR = board.querySelector("#lkR");

    shuffle(pick.slice()).forEach(function (dd) { makeCard(dd.short, "d", dd.id, lkL); });
    shuffle(pick.slice()).forEach(function (dd) { makeCard(dd.capital, "c", dd.id, lkR); });

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
      var res = (window.FunCampaign ? FunCampaign.award("drag", FunCampaign.CONFIG.DRAG_GAME_CARDS.link, p[0].id) : { awarded: 0, cards: [] });
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

  /* ---------------- 地图拼图 ---------------- */
  function renderPuzzle() {
    var body = el("dragBody");
    var ds = FunData.puzzleDynasties();
    body.innerHTML =
      '<div class="tl-intro">🗺️ <b>玩法：</b>系统会随机抽取一个朝代的历史地图，把它<b>拖回原位</b>，拼出和右图（目标图）一样的完整疆域图。点「检查拼图」可随时查看进度，全部就位即过关。点「再拼一张」可随机抽取下一关。</div>' +
      '<div id="pzStage"></div>';
    if (!ds.length) { el("pzStage").innerHTML = "<p>暂无地图，稍后再来～</p>"; return; }
    var pick = ds[Math.floor(Math.random() * ds.length)];
    playPuzzle(pick.id);
  }

  function playPuzzle(id) {
    var d = FunData.dynastyById(id);
    var src = FunData.mapOf(id);
    var stage = el("pzStage");
    var N = 3, cell = 120, size = N * cell;
    var arr = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]); // arr[slot] = 该格应放的碎片号
    var dragSlot = null, done = false, board = null;

    function tileBg(pos) {
      var r = Math.floor(pos / N), c = pos % N;
      return "url(../maps/" + id + ".svg) " + (-c * cell) + "px " + (-r * cell) + "px / " + size + "px " + size + "px no-repeat";
    }
    function correctCount() {
      var n = 0;
      for (var s = 0; s < N * N; s++) if (arr[s] === s) n++;
      return n;
    }
    function allCorrect() { return correctCount() === N * N; }

    function buildStage() {
      stage.innerHTML =
        '<div class="pz-dyn-label">📍 复原地图：<b>' + d.name + '</b></div>' +
        '<div class="pz-wrap">' +
          '<div class="pz-board" id="pzBoard"></div>' +
          '<div class="pz-side">' +
            "<h4>🎯 目标图（参考）</h4>" +
            '<img src="' + src + '" width="200" style="border-radius:12px;box-shadow:var(--shadow);background:#fff"/>' +
            '<p class="pz-hint">把左边九宫格的碎片拖到正确位置，拼出和右图一样的地图即可通关。</p>' +
            '<div class="pz-progress" id="pzProg"></div>' +
            '<div id="pzMsg"></div>' +
            '<div class="quiz-actions">' +
              '<button class="btn" id="pzCheck">检查拼图</button>' +
              '<button class="btn ghost" id="pzShuffle">打乱重来</button>' +
            "</div>" +
          "</div>" +
        "</div>";
      board = stage.querySelector("#pzBoard");
      el("pzCheck").onclick = function () {
        if (done) return;
        if (allCorrect()) { winPuzzle(); }
        else {
          el("pzMsg").innerHTML = '<div class="feedback no">还差 ' + (N * N - correctCount()) +
            " 块没拼对，继续加油！（绿框=已就位）</div>";
        }
      };
      el("pzShuffle").onclick = function () {
        if (done) return;
        arr = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
        el("pzMsg").innerHTML = "";
        draw(); updateProgress();
      };
    }

    function draw() {
      board.innerHTML = "";
      for (let s = 0; s < N * N; s++) {
        var slot = document.createElement("div");
        slot.className = "pz-slot";
        slot.setAttribute("data-s", s);
        var tp = arr[s];
        if (tp !== null) {
          var tile = document.createElement("div");
          tile.className = "pz-tile";
          tile.style.background = tileBg(tp);
          tile.draggable = true;
          tile.ondragstart = function (ev) {
            dragSlot = s; tile.classList.add("dragging");
            ev.dataTransfer.effectAllowed = "move";
            ev.dataTransfer.setData("text/plain", String(s));
          };
          tile.ondragend = function () { tile.classList.remove("dragging"); };
          slot.appendChild(tile);
        }
        slot.ondragover = function (ev) { ev.preventDefault(); slot.classList.add("over"); };
        slot.ondragleave = function () { slot.classList.remove("over"); };
        slot.ondrop = function (ev) {
          ev.preventDefault(); slot.classList.remove("over");
          if (dragSlot === null || dragSlot === s || done) return;
          var t = arr[dragSlot]; arr[dragSlot] = arr[s]; arr[s] = t;
          dragSlot = null;
          draw(); updateProgress();
        };
        if (arr[s] === s) slot.classList.add("placed");
        board.appendChild(slot);
      }
    }

    function updateProgress() {
      var c = correctCount();
      el("pzProg").textContent = "已就位 " + c + " / " + (N * N);
      if (c === N * N && !done) winPuzzle();
    }

    function winPuzzle() {
      done = true;
      FunStore.addXp(30);
      FunUI.award("puzzle");
      var res = (window.FunCampaign ? FunCampaign.award("drag", FunCampaign.CONFIG.DRAG_GAME_CARDS.puzzle, id) : { awarded: 0, cards: [] });
      var cardNames = res.cards.map(function (c) { return c.name; }).join("、");
      el("pzMsg").innerHTML =
        '<div class="feedback ok"><b>地图复原成功 🗺️</b> +30 经验' +
        (cardNames ? " · 获得卡牌 " + cardNames : " · 该玩法卡牌已达上限") +
        '<div class="quiz-actions"><button class="btn" id="pzNext">再拼一张 →</button></div></div>';
      FunUI.refreshHUD();
      var nx = el("pzNext");
      if (nx) nx.onclick = renderPuzzle;
    }

    buildStage();
    draw();
    updateProgress();
  }

  window.FunDrag = { open: open };
})();
