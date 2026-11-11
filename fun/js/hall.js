/* ============================================================
   趣味历史乐园 · 历史藏馆（卡牌收集）
   展示已收集的人物卡牌，并提示图鉴进度。
   ============================================================ */
(function () {
  "use strict";
  function el(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function open() {
    var root = el("view-hall");
    var p = FunStore.get();
    var cards = p ? FunStore.uniqueCards() : [];     // 去重后的图鉴
    var totalCards = p ? FunStore.totalCards() : 0;  // 含重复：驱动碎片的总卡数
    var fragTotal = (window.FunCampaign && window.FunCampaign.CONFIG) ? window.FunCampaign.CONFIG.FRAGMENTS_TOTAL : 34;
    var fragGot = p ? p.fragments : 0;
    var total = FunData.allNotables().length;

    var grid = cards.length
      ? cards.map(function (c) {
          return '<div class="hall-card">' +
            '<div class="hc-name">' + escapeHtml(c.name) + "</div>" +
            '<div class="hc-role">' + escapeHtml(c.role || "") + "</div>" +
            '<div class="hc-dyn">' + escapeHtml(c.dynasty || "") + "</div>" +
          "</div>";
        }).join("")
      : '<div class="hall-card empty"><div class="hc-name">？？？</div>' +
        '<div class="hc-role">还没收集到卡牌，去闯关或玩拖拽游戏赢取吧！</div></div>';

    root.innerHTML =
      '<div class="back-link" data-go="home">← 返回主页</div>' +
      '<div class="panel">' +
        '<div class="section-title">🃏 历史藏馆</div>' +
        '<div class="section-sub">已获得人物卡牌 <b>' + totalCards + '</b> 张（去重 ' + cards.length +
          ' 位 / 全图鉴 ' + total + ' 位）。每集满 <b>10 张</b> 自动合成 1 片省级地图碎片，当前已集齐 <b>' + fragGot + ' / ' + fragTotal + '</b> 片（共 34 个省级行政区）。</div>' +
        '<div class="hall-grid">' + grid + "</div>" +
        '<div class="quiz-actions">' +
          '<button class="btn" id="hallGo">去闯关收集 →</button>' +
          '<button class="btn ghost" id="hallFrag">查看地图碎片 🧩</button>' +
        "</div>" +
      "</div>";
    root.querySelector('[data-go="home"]').onclick = function () { FunUI.go("home"); };
    el("hallGo").onclick = function () { FunUI.go("quiz"); };
    var hf = el("hallFrag");
    if (hf) hf.onclick = function () { if (window.FunCampaign) FunCampaign.showFragments(); };
  }

  window.FunHall = { open: open };
})();
