/* ============================================================
   趣味历史乐园 · 线索推理（猜人物）
   规则：系统从题库里选一位历史人物，抽出 3 条「难 → 中 → 易」的线索，
        每次只给一条。玩家输入人物名，答对即按已用线索数发卡：
        1 条 → 3 张，2 条 → 2 张，3 条 → 1 张。
        答错可选择「再要一条线索」，三条用完仍未猜中则揭晓答案（0 张）。
   去重：已出过的线索 id 存进账号档案（并同步云端），本轮不再出现；
        人物可以重复出，但同一人物再次出现时一定换一批全新线索；
        全部线索轮完后开启新一轮，并跳过上一题刚用过的 3 条。
   ============================================================ */
(function () {
  "use strict";

  var PEOPLE = (window.FunClueData && FunClueData.people) || [];
  var LEVEL_LABEL = { 3: "难", 2: "中", 1: "易" };
  var Q = null;      // 当前题目（模块内暂存，切换视图回来可续答）

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
  // 判分归一化：忽略空格与常见标点，兼容「苏轼 / 苏东坡」「魏徵 / 魏征」
  function norm(s) {
    return String(s == null ? "" : s)
      .replace(/[\s，,。．\.、；;：:！!？?\"'“”‘’「」『』《》〈〉（）()【】\[\]—\-–~～·\/\\]/g, "")
      .toLowerCase();
  }
  function reward(n) {
    var r = (window.FunCampaign && FunCampaign.CONFIG && FunCampaign.CONFIG.CLUE_REWARDS) || null;
    return (r && r[n]) || (4 - n);
  }
  function profile() { return window.FunStore ? FunStore.get() : null; }

  /* ---------------- 已用线索（写进账号档案，跨设备同步） ---------------- */
  function usedMap() {
    var p = profile(), m = {};
    if (p && Array.isArray(p.clueUsed)) p.clueUsed.forEach(function (id) { m[id] = 1; });
    return m;
  }
  function commitUsed(ids, reset) {
    var p = profile();
    if (!p) return;
    if (reset) p.clueUsed = ids.slice(0, 2000);
    else {
      var seen = {};
      (p.clueUsed || []).concat(ids).forEach(function (id) { if (id) seen[id] = 1; });
      p.clueUsed = Object.keys(seen).slice(0, 2000);
    }
    if (window.FunStore) { FunStore.save(); FunStore.flush(); } // 立即同步，另一端不会再抽到这些线索
  }

  /* ---------------- 出题 ---------------- */
  function poolWith(used) {
    return PEOPLE.filter(function (p) {
      var left = 0;
      for (var i = 0; i < p.clues.length; i++) if (!used[p.clues[i].id]) left++;
      return left >= 3;
    });
  }

  function pickQuestion() {
    var p = profile();
    if (!p || !PEOPLE.length) return null;
    var used = usedMap();
    var pool = poolWith(used);
    var reset = false;

    if (!pool.length) {
      // 一轮全部用完：重开新一轮，但保留上一题刚用过的 3 条，避免紧接着重复
      reset = true;
      used = {};
      if (Q && Q.clues) Q.clues.forEach(function (c) { used[c.id] = 1; });
      pool = poolWith(used);
    }
    if (!pool.length) return null;

    var person = pool[Math.floor(Math.random() * pool.length)];
    var avail = person.clues.filter(function (c) { return !used[c.id]; });
    var picked = [];
    // 难 / 中 / 易 各取一条，保证顺序严格由难到易
    [3, 2, 1].forEach(function (lv) {
      var g = shuffle(avail.filter(function (c) { return c.level === lv && picked.indexOf(c) < 0; }));
      if (g.length) picked.push(g[0]);
    });
    // 极端兜底：某级线索已被用尽时，用其余未用线索补齐 3 条
    shuffle(avail).forEach(function (c) {
      if (picked.length < 3 && picked.indexOf(c) < 0) picked.push(c);
    });
    picked.sort(function (a, b) { return b.level - a.level; });
    if (picked.length < 3) return null;

    picked.forEach(function (c) { used[c.id] = 1; });
    if (!p.clueStats) p.clueStats = { asked: 0, solved: 0, firstTry: 0 };
    p.clueStats.asked = (p.clueStats.asked || 0) + 1;
    commitUsed(Object.keys(used), reset);

    return {
      account: p.account,
      person: person,
      clues: picked,
      shown: 1,
      wrong: 0,
      finished: false,
      result: "",        // win | giveup | fail
      gained: 0,
      cardNames: "",
      capHit: false
    };
  }

  /* ---------------- 判分与发卡 ---------------- */
  function isCorrect(input, person) {
    var n = norm(input);
    if (!n) return false;
    if (n === norm(person.name)) return true;
    return (person.aliases || []).some(function (a) { return n === norm(a); });
  }

  function settle(win, forcedResult) {
    Q.finished = true;
    Q.result = forcedResult || (win ? "win" : "fail");
    var p = profile();
    if (p) {
      if (!p.clueStats) p.clueStats = { asked: 0, solved: 0, firstTry: 0 };
      if (win) {
        p.clueStats.solved = (p.clueStats.solved || 0) + 1;
        if (Q.shown === 1) p.clueStats.firstTry = (p.clueStats.firstTry || 0) + 1;
      }
      if (window.FunStore) FunStore.save();
    }
    if (!win) { render(); return; }

    var n = reward(Q.shown);
    Q.gained = n;
    var res = (window.FunCampaign && FunCampaign.award)
      ? FunCampaign.award("clue", n, Q.person.dyn, { preferId: Q.person.card })
      : { awarded: 0, cards: [] };
    Q.gained = res.awarded != null ? res.awarded : n;
    Q.capHit = res.awarded === 0;
    Q.cardNames = (res.cards || []).map(function (c) { return c.name; }).join("、");
    if (window.FunStore) FunStore.addXp(10 + 5 * (4 - Q.shown));
    if (Q.shown === 1 && window.FunUI) FunUI.award("deduce");
    if (window.FunUI) FunUI.refreshHUD();
    render();
  }

  function submit() {
    if (!Q || Q.finished) return;
    var input = el("clueInput");
    if (!input) return;
    var v = input.value.trim();
    if (!v) { Q.notice = "请先输入你猜的人物名字～"; render(); return; }
    Q.notice = "";
    if (isCorrect(v, Q.person)) { settle(true); return; }

    Q.wrong++;
    if (Q.shown >= 3) { settle(false); return; }  // 三条线索用完仍未猜中 → 揭晓
    Q.notice = "答错了～可以再要一条线索（奖励会少一张卡），或者就着当前线索再猜一次。";
    render();
  }

  function moreClue() {
    if (!Q || Q.finished || Q.shown >= 3) return;
    Q.shown++;
    Q.wrong = 0;   // 每多要一条线索，需再答错一次才能继续解锁下一条
    Q.notice = "已给出第 " + Q.shown + " 条线索，现在答对可得 " + reward(Q.shown) + " 张卡牌。" +
      (Q.shown < 3 ? "若还要下一条，请先再猜一次，答错后即可解锁。" : "");
    render();
  }

  function retry() { if (Q && !Q.finished) { Q.notice = ""; render(); } }
  function giveUp() { if (Q && !Q.finished) { Q.notice = ""; settle(false, "giveup"); } }
  function next() { Q = pickQuestion(); render(); }

  /* ---------------- 渲染 ---------------- */
  function open() {
    var root = el("view-clue");
    root.innerHTML =
      '<div class="back-link" data-go="home">← 返回主页</div>' +
      '<div class="panel clue-panel">' +
        '<div class="section-title">🕵️ 线索推理 · 猜人物</div>' +
        '<div class="section-sub">系统每次给一条线索，<b>由难到易</b>，共三条。输入你猜的历史人物名字：' +
          '用 <b>1 条</b>线索猜中得 <b>3 张</b>卡牌，<b>2 条</b>得 <b>2 张</b>，<b>3 条</b>得 <b>1 张</b>；' +
          '答错可以选择再多要一条线索。同一轮里<b>线索不会重复出现</b>，人物则可能再次登场。</div>' +
        '<div id="clueStage"></div>' +
      "</div>";
    root.querySelector('[data-go="home"]').onclick = function () { FunUI.go("home"); };
    var p = profile();
    if (Q && !Q.finished && p && Q.account === p.account) render();   // 同账号切回来，续答当前题
    else next();
  }

  function knowledge() {
    // 揭晓答案时补一条该人物的代表事迹，答完也能学到东西
    var d = window.FunData && FunData.dynastyById ? FunData.dynastyById(Q.person.dyn) : null;
    var idx = parseInt(String(Q.person.card).split(":")[1], 10);
    if (d && d.notables && d.notables[idx] && d.notables[idx].deed) return d.notables[idx].deed;
    var easy = Q.person.clues.filter(function (c) { return c.level === 1; })[0];
    return easy ? easy.text : "";
  }

  function render() {
    var stage = el("clueStage");
    if (!stage) return;
    if (!Q) {
      stage.innerHTML = '<div class="feedback no">题库暂未加载，请刷新页面重试；若仍不可用，请先登录游戏账号。</div>';
      return;
    }
    var p = profile();
    var st = (p && p.clueStats) || { asked: 0, solved: 0, firstTry: 0 };

    var items = "";
    Q.clues.forEach(function (c, i) {
      var shown = i < Q.shown;
      items += '<div class="clue-item ' + (shown ? "lv-" + c.level : "locked") + '">' +
        '<div class="clue-item-head"><span class="clue-no">线索 ' + (i + 1) + " / 3</span>" +
        '<span class="clue-lv">' + (shown ? "难度 · " + LEVEL_LABEL[c.level] : "尚未解锁") + "</span></div>" +
        '<div class="clue-text">' + (shown ? esc(c.text) : "🔒 答错后再给下一条线索") + "</div>" +
      "</div>";
    });

    var ladder = "";
    [1, 2, 3].forEach(function (n) {
      ladder += '<span class="clue-step' + (n === Q.shown && !Q.finished ? " on" : "") + '">' +
        n + " 条 → " + reward(n) + " 张</span>";
    });

    var html =
      '<div class="clue-head">' +
        '<span class="clue-round">🗂️ 已推理 ' + (st.asked || 0) + " 题 · 猜中 " + (st.solved || 0) +
          " 题 · 一击即中 " + (st.firstTry || 0) + " 次</span>" +
        '<span class="clue-reward">🃏 ' + (Q.finished ? "本题结束" : "当前答对可得 <b>" + reward(Q.shown) + " 张</b>卡牌") + "</span>" +
      "</div>" +
      '<div class="clue-ladder">' + ladder + "</div>" +
      '<div class="clue-list">' + items + "</div>";

    if (!Q.finished) {
      html +=
        '<div class="clue-input-row">' +
          '<input id="clueInput" class="clue-input" type="text" maxlength="24" autocomplete="off" ' +
            'placeholder="输入历史人物姓名，如：韩信 / 苏东坡 / 魏征" />' +
          '<button class="btn" id="clueSubmit">提交答案</button>' +
        "</div>" +
        '<div class="clue-actions" id="clueActions">' +
          (Q.wrong > 0 && Q.shown < 3 ? '<button class="btn" id="clueMore">🔍 再要一条线索（奖励 -1 张）</button>' : "") +
          (Q.wrong > 0 ? '<button class="btn ghost" id="clueRetry">我再猜一次</button>' : "") +
          '<button class="btn ghost" id="clueGiveUp">直接看答案</button>' +
        "</div>";
    } else {
      var win = Q.result === "win";
      var title = win ? "🎉 答对了！" : (Q.result === "giveup" ? "🔎 已揭晓答案" : "💡 三条线索用完啦");
      var body = win
        ? "用了 <b>" + Q.shown + " 条</b>线索 · 获得 <b>" + Q.gained + " 张</b>卡牌" +
          (Q.cardNames ? "（" + esc(Q.cardNames) + "）" : "") +
          (Q.capHit ? " · 该玩法卡牌已达上限" : "")
        : "本题未获得卡牌，下一题继续加油～";
      html +=
        '<div class="feedback ' + (win ? "ok" : "no") + ' clue-result">' +
          "<b>" + title + "</b> 答案是「<b>" + esc(Q.person.name) + "</b>」（" + esc(Q.person.dynName) + "）。" +
          "<div>" + body + "</div>" +
          '<div class="clue-know">📖 小知识：' + esc(knowledge()) + "</div>" +
        "</div>" +
        '<div class="clue-actions"><button class="btn" id="clueNext">下一题 →</button></div>';
    }

    if (Q.notice) html += '<div class="clue-notice">' + esc(Q.notice) + "</div>";
    stage.innerHTML = html;

    var input = el("clueInput");
    if (input) {
      input.onkeydown = function (e) { if (e.key === "Enter") submit(); };
      input.focus();
    }
    var bind = function (id, fn) { var b = el(id); if (b) b.onclick = fn; };
    bind("clueSubmit", submit);
    bind("clueMore", moreClue);
    bind("clueRetry", retry);
    bind("clueGiveUp", giveUp);
    bind("clueNext", next);
  }

  window.FunClue = { open: open, people: PEOPLE };
})();
