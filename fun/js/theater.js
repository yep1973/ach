/* ============================================================
   趣味历史乐园 · 穿越剧场（重叙事 · 角色扮演 · 多结局 · 两级选择）
   先选朝代，再选剧本；剧本内容贴合现有 data.js 史料，复用朝代与人物数据。
   剧本数据来自 theater-data*.js 中挂载的 window.__SCENARIOS__ 与 FunTheaterData。
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

  /* ---------------- 剧本数据（外部挂载） ---------------- */
  var SCENARIOS = window.__SCENARIOS__ || [];
  var DYNASTY_INFO = (window.FunTheaterData && window.FunTheaterData.DYNASTY_INFO) || [];
  function byDynasty(id) {
    return SCENARIOS.filter(function (s) { return s.dynastyId === id; });
  }

  /* ---------------- 运行状态 ---------------- */
  var cur = null; // { scn, node, meters:{} }

  function findScn(id) {
    for (var i = 0; i < SCENARIOS.length; i++) if (SCENARIOS[i].id === id) return SCENARIOS[i];
    return null;
  }

  /* ---------------- 渲染：全部剧本（已随机打乱，跨朝代） ---------------- */
  function open() {
    var root = el("view-theater");
    var list = shuffle(SCENARIOS.slice());
    var cards = list.map(function (scn) {
      var dInfo = FunData.dynastyById(scn.dynastyId);
      var dName = dInfo ? dInfo.name : '';
      var best = FunStore.theaterBest(scn.id);
      var badge = best ? '<span class="th-best">最佳：' + best + '</span>' : '<span class="th-best dim">未通关</span>';
      return '<div class="th-scn-card" data-id="' + scn.id + '">' +
        '<div class="th-scn-ico">' + scn.icon + '</div>' +
        '<div class="th-scn-head"><h3>' + scn.title + '</h3><span class="th-diff">' + scn.diff + '</span></div>' +
        '<div class="th-scn-era">📍 ' + dName + ' · ' + scn.era + ' · ' + scn.role + '</div>' +
        '<p class="th-scn-blurb">' + scn.blurb + '</p>' +
        '<div class="th-scn-foot">' + badge + '<span class="th-enter">进入 →</span></div>' +
      '</div>';
    }).join("");

    root.innerHTML =
      '<div class="back-link" data-go="home">← 返回主页</div>' +
      '<div class="panel">' +
        '<div class="section-title">🎭 穿越剧场</div>' +
        '<div class="section-sub">所有朝代的剧本已随机打乱，点击任意剧本即可穿越。每个剧本都是真实的历史现场，你的抉择会左右结局与评级（S / A / B / C），卡片上已标注该剧本所属的朝代。</div>' +
        '<div class="th-grid">' + cards + '</div>' +
      '</div>';

    root.querySelector('[data-go="home"]').onclick = function () { FunUI.go("home"); };
    root.querySelectorAll(".th-scn-card").forEach(function (c) {
      c.onclick = function () { startScenario(c.getAttribute("data-id")); };
    });
  }

  /* ---------------- 渲染：二级 · 选剧本 ---------------- */
  function openDynasty(id) {
    var root = el("view-theater");
    var d = null;
    DYNASTY_INFO.forEach(function (x) { if (x.id === id) d = x; });
    var list = byDynasty(id);
    var cards = list.map(function (scn) {
      var best = FunStore.theaterBest(scn.id);
      var badge = best ? '<span class="th-best">最佳：' + best + '</span>' : '<span class="th-best dim">未通关</span>';
      return '<div class="th-scn-card" data-id="' + scn.id + '">' +
        '<div class="th-scn-ico">' + scn.icon + '</div>' +
        '<div class="th-scn-head"><h3>' + scn.title + '</h3><span class="th-diff">' + scn.diff + '</span></div>' +
        '<div class="th-scn-era">' + scn.era + ' · ' + scn.role + '</div>' +
        '<p class="th-scn-blurb">' + scn.blurb + '</p>' +
        '<div class="th-scn-foot">' + badge + '<span class="th-enter">进入 →</span></div>' +
      '</div>';
    }).join("");

    root.innerHTML =
      '<div class="back-link" data-go="dyn">← 返回选朝代</div>' +
      '<div class="panel">' +
        '<div class="section-title">' + (d ? d.icon : '🎭') + ' ' + (d ? d.name : '') + ' · 穿越剧场</div>' +
        '<div class="section-sub">' + (d ? d.blurb : '') + '</div>' +
        '<div class="th-grid">' + cards + '</div>' +
      '</div>';

    root.querySelector('[data-go="dyn"]').onclick = open;
    root.querySelectorAll(".th-scn-card").forEach(function (c) {
      c.onclick = function () { startScenario(c.getAttribute("data-id")); };
    });
  }

  /* ---------------- 开始剧本 ---------------- */
  function startScenario(id) {
    var scn = findScn(id);
    if (!scn) return;
    var meters = {};
    scn.meters.forEach(function (m) { meters[m.key] = scn.startVal; });
    cur = { scn: scn, node: scn.start, meters: meters };
    renderScene();
  }

  function meterHtml() {
    var scn = cur.scn;
    return '<div class="th-meters">' + scn.meters.map(function (m) {
      var v = Math.max(0, Math.min(100, cur.meters[m.key]));
      return '<div class="th-meter">' +
        '<div class="th-meter-top"><span>' + m.icon + " " + m.key + '</span><span class="th-meter-num">' + v + '</span></div>' +
        '<div class="th-meter-track"><div class="th-meter-fill" style="width:' + v + "%;background:" + m.color + ';"></div></div>' +
      '</div>';
    }).join("") + "</div>";
  }

  /* ---------------- 渲染：某一幕 ---------------- */
  function renderScene() {
    var root = el("view-theater");
    var scn = cur.scn;
    var node = scn.nodes[cur.node];

    if (node.ending) { renderEnding(node.ending); return; }

    var map = FunData.mapOf(scn.dynastyId);
    var bg = map ? ' style="background-image:url(../' + map + ');"' : "";
    var dInfo = FunData.dynastyById(scn.dynastyId);
    var dName = dInfo ? dInfo.name : '';

    root.innerHTML =
      '<div class="back-link" data-go="dyn">← 换个剧本</div>' +
      '<div class="panel th-stage"' + bg + '>' +
        '<div class="th-stage-head">' +
          '<div><span class="th-stage-title">' + scn.icon + " " + scn.title + '</span>' +
          '<span class="th-stage-era">📍 ' + dName + " · " + scn.era + " · 你扮演：" + scn.role + "</span></div>" +
        "</div>" +
        meterHtml() +
        '<div class="th-scene">' + node.scene + '</div>' +
        (node.hint ? '<div class="th-hint">💡 史实小贴士：' + node.hint + "</div>" : "") +
        '<div class="th-choices" id="thChoices"></div>' +
      '</div>';

    root.querySelector('[data-go="dyn"]').onclick = function () { open(); };

    var box = root.querySelector("#thChoices");
    node.choices.forEach(function (ch, i) {
      var b = document.createElement("button");
      b.className = "th-choice";
      b.innerHTML = '<span class="th-choice-idx">' + "ABCD".charAt(i) + '</span><span>' + ch.t + '</span>';
      b.onclick = function () { choose(ch, b, box); };
      box.appendChild(b);
    });
  }

  /* ---------------- 抉择：即时反馈 + 继续 ---------------- */
  function choose(ch, btn, box) {
    box.querySelectorAll(".th-choice").forEach(function (b) { b.disabled = true; });
    btn.classList.add("picked");

    if (ch.fx) {
      for (var k in ch.fx) {
        if (cur.meters.hasOwnProperty(k)) cur.meters[k] = Math.max(0, Math.min(100, cur.meters[k] + ch.fx[k]));
      }
    }

    var fb = document.createElement("div");
    fb.className = "th-feedback";
    fb.innerHTML = '<div class="th-fb-text">' + ch.fb + '</div>' +
      '<button class="btn" id="thNext">继续 →</button>';
    box.parentNode.appendChild(fb);

    document.getElementById("thNext").onclick = function () {
      cur.node = ch.to;
      renderScene();
    };
  }

  /* ---------------- 渲染：结局 ---------------- */
  function renderEnding(end) {
    var root = el("view-theater");
    var scn = cur.scn;

    var res = FunStore.theaterClear(scn.id, end.grade);
    var levelUp = FunStore.addXp(end.xp);
    // 主角卡优先掉落
    var heroId = null;
    var list = FunData.notablesOf(scn.dynastyId);
    for (var hi = 0; hi < list.length; hi++) { if (list[hi].name.indexOf(scn.hero) >= 0) { heroId = list[hi].id; break; } }
    var cnt = (window.FunCampaign ? (FunCampaign.CONFIG.THEATER_GRADE_CARDS[end.grade] || 2) : 2);
    var aw = (window.FunCampaign ? FunCampaign.award("theater", cnt, scn.dynastyId, { preferId: heroId }) : { awarded: 0, cards: [] });
    var cardNew = aw.cards.some(function (c) { return c.id === heroId; });
    var cardNames = aw.cards.map(function (c) { return c.name; }).join("、");

    var gradeClass = { S: "g-s", A: "g-a", B: "g-b", C: "g-c" }[end.grade];

    root.innerHTML =
      '<div class="back-link" data-go="dyn">← 换个剧本</div>' +
      '<div class="panel result">' +
        '<div class="big-emoji">' + ({ S: "🏆", A: "🌟", B: "🎖️", C: "📜" }[end.grade]) + '</div>' +
        '<h2>结局 · ' + end.title + '</h2>' +
        '<div class="th-grade ' + gradeClass + '">评级 ' + end.grade + '</div>' +
        '<p class="th-end-desc">' + end.desc + '</p>' +
        '<div class="score-line">获得经验 <span class="xp-gain">+' + end.xp + '</span></div>' +
        (levelUp ? '<div class="score-line">🎉 升级啦！</div>' : '') +
        (cardNames ? '<div class="score-line">🃏 获得人物卡：' + cardNames + '</div>' : '<div class="score-line">🃏 该玩法卡牌已达上限</div>') +
        (res.badge ? '<div class="score-line">🎭 解锁徽章：剧情大师</div>' : '') +
        (res.best && res.best !== end.grade ? '<div class="score-line th-old">历史最佳：' + res.best + '</div>' : '') +
        '<div class="actions">' +
          '<button class="btn" id="thReplay">再玩一次 ↻</button>' +
          '<button class="btn ghost" id="thList">换个剧本</button>' +
          '<button class="btn ghost" id="thHome">返回主页</button>' +
        '</div>' +
      '</div>';

    var back = function () { open(); };
    root.querySelector('[data-go="dyn"]').onclick = back;
    root.querySelector("#thReplay").onclick = function () { startScenario(scn.id); };
    root.querySelector("#thList").onclick = back;
    root.querySelector("#thHome").onclick = function () { FunUI.go("home"); };

    FunUI.refreshHUD();
  }

  window.FunTheater = { open: open };
})();
