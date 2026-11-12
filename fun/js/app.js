/* ============================================================
   趣味历史乐园 · 主控（路由 / 首页 / HUD / 徽章弹窗）
   ============================================================ */
(function () {
  "use strict";
  function el(id) { return document.getElementById(id); }

  /* ---------- HUD 与通用 UI ---------- */
  var FunUI = {
    refreshHUD: function () {
      var s = FunStore.get();
      if (!s) return;
      var lv = FunStore.getLevel();
      el("lvBadge").textContent = "Lv." + lv;
      var pct = Math.round((FunStore.xpInLevel() / FunStore.xpForLevel()) * 100);
      el("xpFill").style.width = pct + "%";
      el("xpText").textContent = FunStore.xpInLevel() + " / " + FunStore.xpForLevel();
      el("streakNum").textContent = s.streak;
      el("badgeNum").textContent = FunStore.badgeCount();
      el("cardNum").textContent = FunStore.totalCards();
    },
    toast: function (icon, title, desc) {
      var wrap = el("toastWrap");
      var t = document.createElement("div");
      t.className = "toast";
      t.innerHTML =
        '<div class="t-ico">' + icon + "</div>" +
        '<div><div class="t-title">' + title + "</div>" +
        '<div class="t-desc">' + desc + "</div></div>";
      wrap.appendChild(t);
      setTimeout(function () {
        t.style.transition = "opacity .4s, transform .4s";
        t.style.opacity = "0"; t.style.transform = "translateY(10px)";
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 400);
      }, 3200);
    },
    award: function (id) {
      if (FunStore.award(id)) {
        var b = FunStore.BADGES[id];
        FunUI.toast(b.icon, "解锁徽章：" + b.name, b.desc);
        FunUI.refreshHUD();
        return true;
      }
      return false;
    },
    go: function (view) {
      ["home", "quiz", "clue", "drag", "theater", "hall", "review"].forEach(function (v) {
        el("view-" + v).classList.toggle("hidden", v !== view);
      });
      el("mainnav").querySelectorAll(".nav-btn").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-view") === view);
      });
      if (view === "quiz") FunQuiz.open();
      else if (view === "clue") FunClue.open();
      else if (view === "drag") FunDrag.open();
      else if (view === "theater") FunTheater.open();
      else if (view === "hall") FunHall.open();
      else if (view === "review") FunReview.open();
      else if (view === "home") renderHome();
      window.scrollTo(0, 0);
      if (window.FunCampaign) FunCampaign.setView(view);
    },
    renderAccount: function () {
      var box = el("accountBox");
      if (!box) return;
      var p = FunStore.get();
      if (!p) { box.style.display = "none"; return; }
      box.style.display = "";
      el("accNick").textContent = p.nick;
      el("accLogout").onclick = function () {
        if (confirm("确定退出登录吗？当前游戏时间将暂停，可稍后再次登录续玩，或切换其他账号。")) {
          if (window.FunCampaign && FunCampaign.quitToLogin) FunCampaign.quitToLogin();
        }
      };
    }
  };
  window.FunUI = FunUI;

  /* ---------- 首页 ---------- */
  function renderHome() {
    var root = el("view-home");
    var cards = FunData.dynasties.length;
    var totalNotes = FunData.allNotables().length;

    var modules =
      '<div class="module-card mc-1" data-action="quiz">' +
        '<div class="mc-ico">⚔️</div><h3>闯关答题</h3>' +
        '<span class="mc-tag">积分 · 连击 · Boss</span>' +
        '<p>全朝代随机抽题、同考点不重复；每题不限时（全站统一计时），连线题提交后集中判分。生命值、连击加分、Boss 关，赢经验、徽章和人物卡牌。</p></div>' +
      '<div class="module-card mc-6" data-action="clue">' +
        '<div class="mc-ico">🕵️</div><h3>线索推理</h3>' +
        '<span class="mc-tag">猜人物 · 三条线索</span>' +
        '<p>三条线索由难到易依次给出，输入人物名字来猜。用 1 / 2 / 3 条线索答对，可得 3 / 2 / 1 张卡牌。</p></div>' +
      '<div class="module-card mc-2" data-action="drag">' +
        '<div class="mc-ico">🎮</div><h3>拖拽互动馆</h3>' +
        '<span class="mc-tag">排序 · 连连看</span>' +
        '<p>把事件排回时间线、把人物与典故和朝代连起来，动手又动脑。</p></div>' +
      '<div class="module-card mc-5" data-action="theater">' +
        '<div class="mc-ico">🎭</div><h3>穿越剧场</h3>' +
        '<span class="mc-tag">角色扮演 · 多结局</span>' +
        '<p>穿越到商鞅变法、贞观朝堂、赤壁战场……做出你的抉择，左右历史走向，赢取结局评级与奖励。</p></div>' +
      '<div class="module-card mc-3" data-action="hall">' +
        '<div class="mc-ico">🃏</div><h3>历史藏馆</h3>' +
        '<span class="mc-tag">卡牌收集</span>' +
        '<p>通关和闯关会掉落历史人物卡牌，集齐属于你的中华历史图鉴（共 ' + totalNotes + " 位可收）。</p></div>" +
      '<div class="module-card mc-4" data-action="review">' +
        '<div class="mc-ico">📅</div><h3>间隔复习</h3>' +
        '<span class="mc-tag">错题本 · 已掌握</span>' +
        '<p>答错的题自动收进错题本，可集中查看正确答案；记牢后点「已掌握」即可清除，没记住的按遗忘曲线再提醒。</p></div>';

    var review = renderReview();

    root.innerHTML =
      '<div class="home-hero">' +
        "<h2>玩着学历史，记得更牢 🎉</h2>" +
        "<p>覆盖从旧石器到明清的 " + cards + " 个历史阶段，把枯燥阅读变成好玩的互动。</p>" +
      "</div>" +
      '<div class="module-grid">' + modules + "</div>" +
      '<div class="home-tip">' +
        "💡 <b>小提示：</b>每玩一个模块都会获得经验和卡牌，连续每天来打卡还能解锁「持之以恒」徽章。" +
        "各玩法共享同一套成长数据，越玩越上头！" +
      "</div>" +
      review;

    root.querySelectorAll(".module-card").forEach(function (c) {
      c.onclick = function () { FunUI.go(c.getAttribute("data-action")); };
    });
  }

  /* ---------- 首页：间隔复习入口摘要（完整错题本在独立板块） ---------- */
  function renderReview() {
    var all = FunStore.allReviews();
    var due = FunStore.dueReviews().length;
    setTimeout(function () {
      var go = el("rvGo");
      if (go) go.onclick = function () { FunUI.go("review"); };
    }, 0);
    return '<div id="reviewBox" class="home-review">' +
      '<div class="section-title">📅 间隔复习 · 错题本</div>' +
      '<div class="section-sub">答错的题目会自动收进错题本：集中查看正确答案，确认记牢后点「已掌握」清除，没记住的按遗忘曲线 2 天后再提醒。</div>' +
      '<div class="hr-line">当前 <b>' + all.length + "</b> 道错题，其中 <b>" + due + "</b> 道今日待巩固。" +
        '<button class="btn small" id="rvGo">进入间隔复习 →</button></div>' +
      "</div>";
  }

  /* ---------- 启动 ---------- */
  function boot() {
    el("mainnav").querySelectorAll(".nav-btn").forEach(function (b) {
      b.onclick = function () { FunUI.go(b.getAttribute("data-view")); };
    });
    // 顶部“返回学习系统”：先暂停游戏（清空活动会话但保留账号与进度），再回到学习系统首页
    var backHome = el("backHomeBtn");
    if (backHome) backHome.onclick = function (e) {
      e.preventDefault();
      if (window.FunStore && FunStore.tempExit) FunStore.tempExit();
      window.location.href = "../index.html";
    };
    FunCampaign.init();

    // 被主系统 iframe 嵌入时，隐藏自有品牌避免与外层标题重复
    if (/[?&]embed=1/.test(location.search)) document.body.classList.add("embedded");

    // 右上角二维码：点击放大，微信扫码手机继续玩
    var qrCorner = el("qrCorner");
    if (qrCorner) qrCorner.onclick = function () {
      var m = el("qrModal"); if (m) m.classList.toggle("hidden");
    };
    var qrClose = el("qrModalClose");
    if (qrClose) qrClose.onclick = function () {
      var m = el("qrModal"); if (m) m.classList.add("hidden");
    };
    document.addEventListener("click", function (e) {
      var m = el("qrModal");
      if (!m || m.classList.contains("hidden")) return;
      if (e.target === m) m.classList.add("hidden");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})();
