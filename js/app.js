/* ============================================================
   中华历史脉络学习系统 · 交互逻辑
   ============================================================ */
(function () {
  "use strict";

  const DATA = window.DYNASTIES || [];

  /* 题型 / 难度 标签 */
  const TYPE_LABEL = {
    single: "单选",
    multiple: "多选",
    judge: "判断",
    order: "排序",
    match: "连线",
  };
  const TYPE_LEVEL = {
    single: "基础",
    judge: "基础",
    multiple: "进阶",
    order: "挑战",
    match: "挑战",
  };

  /* ---------- 视图切换 ---------- */
  const mainNav = document.getElementById("mainNav");
  const views = {
    timeline: document.getElementById("view-timeline"),
    detail: document.getElementById("view-detail"),
    quiz: document.getElementById("view-quiz"),
    playground: document.getElementById("view-playground"),
  };

  mainNav.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-btn");
    if (!btn) return;
    const target = btn.dataset.view;
    mainNav.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    Object.keys(views).forEach((k) => views[k].classList.toggle("hidden", k !== target));
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  /* ---------- 1. 时间轴 ---------- */
  const timelineEl = document.getElementById("timeline");

  function eraClass(d) {
    if (d.id === "neolithic") return "prehistoric";
    if (d.id === "xia" || d.id === "shang") return "xia";
    if (d.id === "westzhou" || d.id === "spring" || d.id === "warring") return "zhou";
    if (d.id === "qin") return "qin";
    return "legend-sanhuan";
  }
  function eraLabel(d) {
    if (d.id === "sanhuan") return "远古传说";
    if (d.id === "neolithic") return "史前文明";
    if (d.id === "xia" || d.id === "shang") return "王朝奠基";
    if (d.id === "westzhou" || d.id === "spring" || d.id === "warring") return "封建礼乐";
    if (d.id === "qin") return "帝国一统";
    if (d.id === "chuhan") return "楚汉相争";
    if (d.id === "westhan" || d.id === "xin" || d.id === "easthan") return "两汉";
    if (d.id === "sanguo" || d.id === "westjin" || d.id === "eastjin" || d.id === "nanbei") return "魏晋南北朝";
    if (d.id === "sui" || d.id === "tang") return "隋唐";
    if (d.id === "wudai") return "五代十国";
    if (d.id === "beisong" || d.id === "liao" || d.id === "xixia" || d.id === "jin" || d.id === "nansong") return "宋辽夏金";
    if (d.id === "yuan" || d.id === "ming" || d.id === "qing") return "元明清";
    return "";
  }

  function shortPeriod(p) {
    return p.replace("约", "").replace("公元前", "前").replace(" 年", "");
  }

  function switchView(v) {
    mainNav.querySelector(`[data-view="${v}"]`).click();
  }

  function renderTimeline() {
    timelineEl.innerHTML = "";
    DATA.forEach((d, idx) => {
      const node = document.createElement("div");
      node.className = "tl-node";
      const tagline = d.summary.split("，")[0] + "。";
      node.innerHTML = `
        <div class="tl-card">
          <div class="tl-era">${eraLabel(d)}</div>
          <div class="tl-idx">${String(idx + 1).padStart(2, "0")}</div>
          <div class="tl-name">${d.name}</div>
          <div class="tl-time">${shortPeriod(d.period)}</div>
          <div class="tl-tag">${tagline}</div>
        </div>
        <div class="tl-dot" style="border-color:${d.color}"></div>
      `;
      node.addEventListener("click", () => {
        switchView("detail");
        selectPeriod(d.id);
      });
      timelineEl.appendChild(node);
    });
  }

  /* ---------- 2. 朝代详解 ---------- */
  const periodTabs = document.getElementById("periodTabs");
  const overviewCard = document.getElementById("overviewCard");
  const panelEvents = document.getElementById("panelEvents");
  const panelFigures = document.getElementById("panelFigures");
  const panelFeatures = document.getElementById("panelFeatures");
  const panelSchools = document.getElementById("panelSchools");
  const btnSchools = document.getElementById("btnSchools");
  const panelGeo = document.getElementById("panelGeo");
  const btnGeo = document.getElementById("btnGeo");
  const subNav = document.getElementById("subNav");
  let currentId = DATA[0].id;

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderPeriodTabs() {
    periodTabs.innerHTML = "";
    DATA.forEach((d) => {
      const chip = document.createElement("button");
      chip.className = "period-chip";
      chip.innerHTML = `<span class="chip-idx">${DATA.indexOf(d) + 1}</span>${d.name}`;
      chip.dataset.id = d.id;
      chip.addEventListener("click", () => selectPeriod(d.id));
      periodTabs.appendChild(chip);
    });
  }

  function selectPeriod(id) {
    currentId = id;
    const d = DATA.find((x) => x.id === id);
    periodTabs.querySelectorAll(".period-chip").forEach((c) =>
      c.classList.toggle("active", c.dataset.id === id)
    );
    renderOverview(d);
    renderEvents(d);
    renderFigures(d);
    renderFeatures(d);
    renderSchools(d);
    renderGeography(d);
    // 思想·文化标签：该朝代有 schools 或 culture 数据时显示
    btnSchools.classList.toggle("hidden", !((d.schools && d.schools.length) || (d.culture && d.culture.length)));
    // 疆域·地缘：每朝均有数据，故始终显示
    btnGeo.classList.remove("hidden");
    showSub("events");
  }

  function renderOverview(d) {
    overviewCard.innerHTML = `
      <div class="ov-head">
        <h3>${d.name}</h3>
        <span class="ov-time">${d.period}</span>
      </div>
      <div class="ov-basic">
        <div><b>时间</b><span>${d.basic.time}</span></div>
        <div><b>都城</b><span>${d.basic.capital}</span></div>
        <div><b>奠基者</b><span>${d.basic.founder}</span></div>
      </div>
      <div class="ov-position"><b>历史定位</b><span>${d.basic.position}</span></div>
      ${d.founderStory ? `<div class="ov-founder"><b>开国来历</b><span>${d.founderStory}</span></div>` : ""}
      <div class="ov-summary">${d.summary}</div>
    `;
  }

  function renderEvents(d) {
    const items = d.events
      .map((ev) => {
        const tagCls =
          ev.type === "事件" ? "tag-event" : ev.type === "人物" ? "tag-figure" : "tag-turning";
        const extra = `
          ${ev.cause ? `<div class="event-line"><span class="el-label">起因</span><span class="el-text">${ev.cause}</span></div>` : ""}
          ${ev.figures ? `<div class="event-line"><span class="el-label">人物</span><span class="el-text">${ev.figures}</span></div>` : ""}
          ${ev.aftermath ? `<div class="event-line"><span class="el-label">后续</span><span class="el-text">${ev.aftermath}</span></div>` : ""}
        `;
        return `
        <div class="event-item">
          <span class="event-tag ${tagCls}">${ev.type}</span>
          <div class="event-main">
            <div class="event-head">
              <span class="event-title">${ev.title}</span>
              <span class="event-time">${ev.time}</span>
            </div>
            <div class="event-desc">${ev.desc}</div>
            ${extra ? `<div class="event-extra">${extra}</div>` : ""}
          </div>
        </div>`;
      })
      .join("");
    panelEvents.innerHTML = `<div class="event-list">${items}</div>`;
  }

  function renderSchools(d) {
    const hasS = d.schools && d.schools.length;
    const hasC = d.culture && d.culture.length;
    if (!hasS && !hasC) {
      panelSchools.innerHTML = "";
      return;
    }
    const cardHTML = (list) =>
      list
        .map(
          (s) => `
        <div class="school-card">
          <div class="school-head">
            <span class="school-name">${s.name}</span>
            <span class="school-founder">${s.founder}</span>
          </div>
          <div class="school-contrib"><b>核心贡献</b>${s.contribution}</div>
          ${s.works && s.works !== "—" ? `<div class="school-works"><b>代表著述</b>${s.works}</div>` : ""}
          ${s.note ? `<div class="school-note">${s.note}</div>` : ""}
        </div>`
        )
        .join("");
    let html = `<div class="schools-intro">该时期思想学术与文学艺术并举，以下为最具代表性的流派、人物与作品：</div>`;
    if (hasS) html += `<h4 class="culture-sub">思想 · 诸子百家</h4><div class="school-grid">${cardHTML(d.schools)}</div>`;
    if (hasC) html += `<h4 class="culture-sub">文学 · 艺术</h4><div class="school-grid">${cardHTML(d.culture)}</div>`;
    panelSchools.innerHTML = html;
  }

  /* 邻国关系分类元数据：敌 / 臣 / 盟 / 中立 */
  const REL_META = {
    "敌": { label: "敌国 · 敌对或征伐", cls: "enemy" },
    "臣": { label: "属国藩邦 · 臣服朝贡", cls: "vassal" },
    "盟": { label: "盟友 · 同盟友好", cls: "ally" },
    "中立": { label: "相持 · 中立往来", cls: "neutral" },
  };
  const REL_ORDER = ["敌", "臣", "盟", "中立"];
  const REL_COLOR = { "敌": "#9e2b25", "臣": "#b0883b", "盟": "#4f7d6e", "中立": "#7a8a99" };

  /* 根据名称 + 关系文本推断方位角（用于地图布点） */
  function dirAngle(text) {
    const order = [
      ["东南", 135], ["西南", 225], ["东北", 45], ["西北", 315],
      ["东", 90], ["南", 180], ["西", 270], ["北", 0],
    ];
    for (const [k, a] of order) if (text.startsWith(k)) return a;
    for (const [k, a] of order) if (text.includes(k)) return a;
    return null;
  }

  /* 疆域与政区图：每个时期的各政权 / 行政区（州·道·路·行省·诸侯国）分块着色 */
  function buildGeoMap(d) {
    const file = "maps/" + d.id + ".svg";
    const g = d.geography || {};
    const title = g.mapTitle || "疆域政区图 · 各政权 / 行政区管辖范围";
    const note = g.mapNote || "以真实地理为底图绘制（虚线为「今中国」轮廓，作定位参照，长江黄河为地标）。着色区块为该时期各政权 / 行政区的管辖范围——分裂时期标注诸侯国或并列政权（如战国七雄、三国、五代十国），统一王朝标注其行政区划（如西汉十三州、唐十道、元行省、清十八省），★ 标注都城。地图下方附完整政区图例。";
    return `
      <div class="geo-map-wrap">
        <h4>${title}</h4>
        <div class="geo-map">
          <img src="${file}" alt="${d.name}疆域政区图" class="geo-map-img" loading="lazy" />
        </div>
        <p class="geo-map-note">${note}</p>
      </div>`;
  }

  function renderGeography(d) {
    if (!d.geography) {
      panelGeo.innerHTML = "";
      return;
    }
    const g = d.geography;
    const territory = `
      <div class="geo-territory">
        <b>疆域范围</b>
        <p>${g.territory}</p>
      </div>`;

    const map = buildGeoMap(d);

    const bounds = g.bounds
      ? `<div class="geo-compass">
          <div class="gc gc-n"><span class="gc-dir">北</span><span class="gc-txt">${g.bounds.north || "—"}</span></div>
          <div class="gc gc-w"><span class="gc-dir">西</span><span class="gc-txt">${g.bounds.west || "—"}</span></div>
          <div class="gc gc-core"><span class="gc-dir">核心区</span><span class="gc-txt">${g.core || "—"}</span></div>
          <div class="gc gc-e"><span class="gc-dir">东</span><span class="gc-txt">${g.bounds.east || "—"}</span></div>
          <div class="gc gc-s"><span class="gc-dir">南</span><span class="gc-txt">${g.bounds.south || "—"}</span></div>
        </div>`
      : `<div class="geo-core-line"><b>核心区</b><span>${g.core || "—"}</span></div>`;
    const boundsBlock = `
      <div class="geo-bounds-block">
        <h4>疆域四至 · 核心区</h4>
        ${bounds}
      </div>`;

    // 邻国按 敌 / 臣 / 盟 / 中立 分组着色
    const groups = { "敌": [], "臣": [], "盟": [], "中立": [] };
    (g.neighbors || []).forEach((n) => { (groups[n.rel] || groups["中立"]).push(n); });
    let neighHtml = `
      <div class="geo-neighbors">
        <h4>周边邻国 · 政权（按 敌／臣／盟 分类）</h4>`;
    REL_ORDER.forEach((cat) => {
      const list = groups[cat];
      if (!list.length) return;
      const m = REL_META[cat];
      neighHtml += `
        <div class="rel-group rel-group-${m.cls}">
          <div class="rel-group-head">
            <span class="rel-dot rel-dot-${m.cls}"></span>${m.label}
            <span class="rel-count">${list.length}</span>
          </div>
          <div class="neighbor-grid">
            ${list
              .map(
                (n) => `
              <div class="neighbor-card rel-${m.cls}">
                <span class="neighbor-badge badge-${m.cls}">${cat}</span>
                <div class="neighbor-name">${n.name}</div>
                <div class="neighbor-rel">${n.relation}</div>
              </div>`
              )
              .join("")}
          </div>
        </div>`;
    });
    neighHtml += `</div>`;

    panelGeo.innerHTML = territory + map + boundsBlock + neighHtml;
  }

  const FEATURE_META = [
    { key: "politics", icon: "政", name: "政治" },
    { key: "economy", icon: "农", name: "经济" },
    { key: "culture", icon: "文", name: "文化" },
    { key: "commerce", icon: "商", name: "商业" },
    { key: "customs", icon: "俗", name: "民风民俗" },
    { key: "military", icon: "兵", name: "军事" },
    { key: "foreign", icon: "交", name: "对外关系" },
    { key: "society", icon: "民", name: "社会生活" },
  ];

  function renderFeatures(d) {
    const cards = FEATURE_META.map(
      (m) => `
      <div class="feature-card">
        <h4><span class="ic">${m.icon}</span>${m.name}</h4>
        <p>${d.features[m.key]}</p>
      </div>`
    ).join("");
    panelFeatures.innerHTML = `<div class="feature-grid">${cards}</div>`;
  }

  function renderFigures(d) {
    const r = d.rulers || { total: "—", note: "", list: [] };
    const rulerCards = (r.list || [])
      .map(
        (x) => `
        <div class="ruler-item">
          <span class="ruler-name">${x.name}</span>
          <span class="ruler-note">${x.note}</span>
          <button class="bio-toggle" type="button" aria-expanded="false">生平·事迹 ▾</button>
          <div class="bio-detail" hidden>
            <div class="bio-row"><span class="bio-k">在位</span><span>${esc(x.reign || "")}</span></div>
            <div class="bio-row"><span class="bio-k">承袭关系</span><span>${esc(x.predecessor || "")}</span></div>
            ${x.bio ? `<div class="bio-sec"><b>生平概述</b><p>${esc(x.bio)}</p></div>` : ""}
          </div>
        </div>`
      )
      .join("");

    const rulerSection = `
      <div class="figures-block">
        <h4 class="figures-title">君王谱系 <span class="figures-count">（共 ${r.total}）</span></h4>
        ${r.note ? `<p class="figures-note">${r.note}</p>` : ""}
        <div class="ruler-grid">${rulerCards || '<p class="figures-note">本阶段无统一君主。</p>'}</div>
      </div>`;

    const notableCards = (d.notables || [])
      .map(
        (n) => `
        <div class="notable-card">
          <div class="notable-head">
            <span class="notable-name">${n.name}</span>
            <span class="notable-role">${n.role}</span>
          </div>
          <div class="notable-deed">${n.deed}</div>
          <button class="bio-toggle" type="button" aria-expanded="false">生平·事迹 ▾</button>
          <div class="bio-detail" hidden>
            <div class="bio-sec"><b>生卒 · 国家 · 期间君主</b><p>${esc(n.bioLife || "")}</p></div>
            <div class="bio-sec"><b>人生经历</b><p>${esc(n.bio || "")}</p></div>
            <div class="bio-sec"><b>重要贡献</b><p>${esc(n.bioContribution || "")}</p></div>
          </div>
        </div>`
      )
      .join("");

    const notableSection = `
      <div class="figures-block">
        <h4 class="figures-title">重要人物 <span class="figures-count">（君王以外）</span></h4>
        <div class="notable-grid">${notableCards}</div>
      </div>`;

    panelFigures.innerHTML = rulerSection + notableSection;
  }

  subNav.addEventListener("click", (e) => {
    const btn = e.target.closest(".sub-btn");
    if (!btn) return;
    showSub(btn.dataset.sub);
  });

  // 人物「生平·事迹」折叠（事件委托，renderFigures 仅替换内部 innerHTML）
  panelFigures.addEventListener("click", (e) => {
    const btn = e.target.closest(".bio-toggle");
    if (!btn) return;
    const detail = btn.parentElement.querySelector(".bio-detail");
    if (!detail) return;
    const open = detail.hasAttribute("hidden");
    if (open) {
      detail.removeAttribute("hidden");
      btn.setAttribute("aria-expanded", "true");
      btn.classList.add("open");
      btn.textContent = "收起 ▴";
    } else {
      detail.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("open");
      btn.textContent = "生平·事迹 ▾";
    }
  });

  function showSub(sub) {
    subNav.querySelectorAll(".sub-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.sub === sub)
    );
    panelEvents.classList.toggle("hidden", sub !== "events");
    panelFigures.classList.toggle("hidden", sub !== "figures");
    panelFeatures.classList.toggle("hidden", sub !== "features");
    panelSchools.classList.toggle("hidden", sub !== "schools");
    panelGeo.classList.toggle("hidden", sub !== "geo");
  }

  /* ---------- 3. 知识测验 ---------- */
  const quizChips = document.getElementById("quizChips");
  const quizSelect = document.getElementById("quizSelect");
  const quizRun = document.getElementById("quizRun");
  const quizResult = document.getElementById("quizResult");
  const quizTitle = document.getElementById("quizTitle");
  const quizCounter = document.getElementById("quizCounter");
  const scoreFill = document.getElementById("scoreFill");
  const quizQuestion = document.getElementById("quizQuestion");
  const quizOptions = document.getElementById("quizOptions");
  const quizFeedback = document.getElementById("quizFeedback");
  const quizSubmit = document.getElementById("quizSubmit");
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");

  let quizState = null;

  function letter(i) {
    return String.fromCharCode(65 + i);
  }

  function renderQuizChips() {
    // 题型图例
    let legend = '<div class="quiz-legend">';
    Object.keys(TYPE_LABEL).forEach((t) => {
      legend += `<span class="ql-item"><i class="ql-badge ql-${t}">${TYPE_LABEL[t]}</i>${TYPE_LEVEL[t]}</span>`;
    });
    legend += "</div>";

    quizChips.innerHTML = "";
    DATA.forEach((d) => {
      const typesHere = [...new Set(d.quiz.map((q) => q.type))].length;
      const chip = document.createElement("button");
      chip.className = "quiz-chip";
      chip.innerHTML = `${d.name}<span class="qc-count">${d.quiz.length} 题 · ${typesHere} 类</span>`;
      chip.addEventListener("click", () => startQuiz(d));
      quizChips.appendChild(chip);
    });
    // 插入图例到标题后
    const h3 = quizSelect.querySelector("h3");
    if (h3 && !quizSelect.querySelector(".quiz-legend")) {
      h3.insertAdjacentHTML("afterend", legend);
    }
  }

  function startQuiz(d) {
    quizState = {
      dynasty: d,
      idx: 0,
      results: d.quiz.map(() => ({ graded: false, picked: null, correct: false })),
    };
    quizSelect.classList.add("hidden");
    quizResult.classList.add("hidden");
    quizRun.classList.remove("hidden");
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderQuestion() {
    const d = quizState.dynasty;
    const q = d.quiz[quizState.idx];
    const res = quizState.results[quizState.idx];

    quizTitle.innerHTML = `${d.name} <span class="qd-chip">知识测验</span>`;
    quizCounter.textContent = `第 ${quizState.idx + 1} / ${d.quiz.length} 题`;

    const done = quizState.results.filter((r) => r.graded).length;
    scoreFill.style.width = (done / d.quiz.length) * 100 + "%";

    quizQuestion.innerHTML =
      `<span class="q-type q-${q.type}">${TYPE_LABEL[q.type]}</span>` +
      `<span class="q-level">${TYPE_LEVEL[q.type]}</span>` +
      `<span class="q-text">${q.q}</span>`;

    quizOptions.innerHTML = "";
    quizSubmit.classList.add("hidden");
    quizSubmit.onclick = null;

    switch (q.type) {
      case "single": renderSingle(q, res); break;
      case "judge": renderJudge(q, res); break;
      case "multiple": renderMultiple(q, res); break;
      case "order": renderOrder(q, res); break;
      case "match": renderMatch(q, res); break;
    }

    if (res.graded) {
      showFeedback(q, res);
    } else {
      quizFeedback.classList.add("hidden");
    }

    btnPrev.disabled = quizState.idx === 0;
    btnNext.textContent = quizState.idx === d.quiz.length - 1 ? "查看成绩" : "下一题";
  }

  /* —— 单选题 —— */
  function renderSingle(q, res) {
    q.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.innerHTML = `<span class="opt-key">${letter(i)}</span><span>${opt}</span>`;
      if (res.graded) {
        if (i === q.answer) btn.classList.add("correct");
        if (res.picked === i && i !== q.answer) btn.classList.add("wrong");
        btn.disabled = true;
      } else {
        btn.addEventListener("click", () => {
          commit(res, i, i === q.answer);
        });
      }
      quizOptions.appendChild(btn);
    });
  }

  /* —— 判断题 —— */
  function renderJudge(q, res) {
    const opts = ["陈述正确", "陈述错误"];
    opts.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "option-btn judge-btn";
      btn.innerHTML = `<span class="opt-key">${i === 0 ? "✓" : "✗"}</span><span>${opt}</span>`;
      if (res.graded) {
        const rightIdx = q.answer ? 0 : 1;
        if (i === rightIdx) btn.classList.add("correct");
        if (res.picked === i && i !== rightIdx) btn.classList.add("wrong");
        btn.disabled = true;
      } else {
        btn.addEventListener("click", () => {
          const correct = (i === 0) === q.answer;
          commit(res, i, correct);
        });
      }
      quizOptions.appendChild(btn);
    });
  }

  /* —— 多选题 —— */
  function renderMultiple(q, res) {
    if (res.graded) {
      q.options.forEach((opt, i) => {
        const btn = document.createElement("button");
        btn.className = "option-btn";
        const isAns = q.answer.includes(i);
        const isPick = res.picked.includes(i);
        if (isAns) btn.classList.add("correct");
        if (isPick && !isAns) btn.classList.add("wrong");
        btn.innerHTML = `<span class="opt-key">${letter(i)}</span><span>${opt}</span>`;
        btn.disabled = true;
        quizOptions.appendChild(btn);
      });
      return;
    }
    const selected = new Set();
    q.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.innerHTML = `<span class="opt-key">${letter(i)}</span><span>${opt}</span>`;
      btn.addEventListener("click", () => {
        if (selected.has(i)) { selected.delete(i); btn.classList.remove("picked"); }
        else { selected.add(i); btn.classList.add("picked"); }
        quizSubmit.disabled = selected.size === 0;
      });
      quizOptions.appendChild(btn);
    });
    quizSubmit.classList.remove("hidden");
    quizSubmit.disabled = true;
    quizSubmit.textContent = "提交答案";
    quizSubmit.onclick = () => {
      const arr = [...selected].sort((a, b) => a - b);
      const ans = [...q.answer].sort((a, b) => a - b);
      const correct =
        arr.length === ans.length && arr.every((v, k) => v === ans[k]);
      commit(res, arr, correct);
    };
  }

  /* —— 排序题 —— */
  function renderOrder(q, res) {
    if (!res._disp) {
      const idxs = q.items.map((_, i) => i);
      for (let i = idxs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
      }
      res._disp = idxs;
    }
    const seq = res.picked || [];

    const hint = document.createElement("p");
    hint.className = "order-hint";
    hint.textContent = "点击下方条目，按你认为的先后顺序排列（最早→最晚）。排满后自动判分。";
    quizOptions.appendChild(hint);

    const seqBox = document.createElement("div");
    seqBox.className = "order-seq";
    seqBox.id = "orderSeq";
    quizOptions.appendChild(seqBox);

    const wrap = document.createElement("div");
    wrap.className = "option-grid";
    res._disp.forEach((origIdx) => {
      const btn = document.createElement("button");
      btn.className = "option-btn order-btn";
      btn.textContent = q.items[origIdx];
      if (seq.includes(origIdx)) btn.classList.add("chosen");
      if (res.graded) btn.disabled = true;
      btn.addEventListener("click", () => {
        if (res.graded) return;
        if (seq.includes(origIdx)) return;
        seq.push(origIdx);
        res.picked = seq.slice();
        renderQuestion();
        if (seq.length === q.items.length) {
          const correct = seq.every((v, k) => v === q.answer[k]);
          commit(res, seq.slice(), correct);
        }
      });
      wrap.appendChild(btn);
    });
    quizOptions.appendChild(wrap);

    // 显示当前序列
    const sb = document.getElementById("orderSeq");
    if (seq.length) {
      sb.innerHTML = seq
        .map(
          (v, k) =>
            `<span class="seq-item ${res.graded ? (q.answer[k] === v ? "ok" : "bad") : ""}">${k + 1}. ${q.items[v]}</span>`
        )
        .join("");
    } else {
      sb.innerHTML = '<span class="seq-empty">尚未选择</span>';
    }

    if (!res.graded && seq.length > 0 && seq.length < q.items.length) {
      const reset = document.createElement("button");
      reset.className = "order-reset";
      reset.textContent = "重置顺序";
      reset.addEventListener("click", () => {
        res.picked = [];
        renderQuestion();
      });
      quizOptions.appendChild(reset);
    }
  }

  /* —— 连线题 —— */
  function renderMatch(q, res) {
    if (!res._right) {
      const idxs = q.pairs.map((_, i) => i);
      for (let i = idxs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
      }
      res._right = idxs;
    }
    const pairs = res.picked || {}; // leftIdx -> rightDisplayIdx
    const usedRight = new Set(Object.values(pairs));

    const wrap = document.createElement("div");
    wrap.className = "match-wrap";

    // 左列
    const leftCol = document.createElement("div");
    leftCol.className = "match-col";
    q.pairs.forEach((p, li) => {
      const el = document.createElement("div");
      el.className = "match-item match-left";
      el.textContent = p.l;
      el.dataset.left = li;
      if (li in pairs) el.classList.add("paired");
      if (res.graded) el.classList.add("locked");
      el.addEventListener("click", () => {
        if (res.graded) return;
        wrap.querySelectorAll(".match-left").forEach((x) => x.classList.remove("active"));
        el.classList.add("active");
      });
      leftCol.appendChild(el);
    });

    // 右列（乱序）
    const rightCol = document.createElement("div");
    rightCol.className = "match-col";
    res._right.forEach((origIdx) => {
      const p = q.pairs[origIdx];
      const el = document.createElement("div");
      el.className = "match-item match-right";
      el.textContent = p.r;
      if (usedRight.has(origIdx)) el.classList.add("paired");
      if (res.graded) el.classList.add("locked");
      el.addEventListener("click", () => {
        if (res.graded) return;
        if (usedRight.has(origIdx)) return;
        const activeLeft = leftCol.querySelector(".match-left.active");
        if (!activeLeft) return;
        const li = +activeLeft.dataset.left;
        pairs[li] = origIdx;
        activeLeft.classList.remove("active");
        res.picked = Object.assign({}, pairs);
        if (Object.keys(pairs).length === q.pairs.length) {
          const correct = q.pairs.every((p, i) => pairs[i] === i);
          commit(res, Object.assign({}, pairs), correct);
        } else {
          renderQuestion();
        }
      });
      rightCol.appendChild(el);
    });

    wrap.appendChild(leftCol);
    wrap.appendChild(rightCol);
    quizOptions.appendChild(wrap);

    if (res.graded) {
      // 标注对错
      quizOptions.querySelectorAll(".match-left").forEach((el) => {
        const li = +el.dataset.left;
        const ri = pairs[li];
        if (ri === li) el.classList.add("ok");
        else el.classList.add("bad");
      });
    }
  }

  /* —— 提交/计分 —— */
  function commit(res, picked, correct) {
    res.graded = true;
    res.picked = picked;
    res.correct = correct;
    renderQuestion();
  }

  function showFeedback(q, res) {
    const isRight = res.correct;
    quizFeedback.className = "quiz-feedback " + (isRight ? "ok" : "no");
    let body = isRight
      ? `<b class="fb-title">✓ 回答正确！</b>`
      : `<b class="fb-title">✗ 回答错误。</b>`;

    if (q.type === "single" || q.type === "judge") {
      let pickText, rightText;
      if (q.type === "single") {
        pickText = res.picked >= 0 ? `${letter(res.picked)}. ${q.options[res.picked]}` : "未作答";
        rightText = `${letter(q.answer)}. ${q.options[q.answer]}`;
      } else {
        const rightIdx = q.answer ? 0 : 1;
        pickText = res.picked >= 0 ? (res.picked === 0 ? "判断为正确" : "判断为错误") : "未作答";
        rightText = q.answer ? "陈述正确" : "陈述错误";
      }
      if (!isRight) body += `<br>你的选择：${pickText}<br>`;
      body += `<br>正确答案：<b>${rightText}</b>`;
    } else if (q.type === "multiple") {
      const fmt = (arr) =>
        arr.length ? arr.map((i) => letter(i)).join("、") : "（无）";
      body += `<br>你的选择：${fmt(res.picked)}<br>正确答案：<b>${fmt(q.answer)}</b>`;
    } else if (q.type === "order") {
      const fmt = (arr) =>
        arr.map((v, k) => `${k + 1}.${q.items[v]}`).join("　");
      body += `<br>你的排序：${fmt(res.picked || [])}<br>正确顺序：<b>${fmt(q.answer)}</b>`;
    } else if (q.type === "match") {
      const lines = q.pairs
        .map((p, i) => {
          const ri = res.picked ? res.picked[i] : undefined;
          const mine = ri !== undefined ? q.pairs[ri].r : "未连";
          const ok = ri === i;
          return `<div class="${ok ? "m-ok" : "m-bad"}">${p.l} → 你的：${mine}${ok ? " ✓" : ` ✗（应：${p.r}）`}</div>`;
        })
        .join("");
      body += `<br>${lines}`;
    }

    body += `<br><br><b>解析：</b>${q.explanation}`;
    quizFeedback.innerHTML = body;
    quizFeedback.classList.remove("hidden");
  }

  btnPrev.addEventListener("click", () => {
    if (quizState.idx > 0) {
      quizState.idx--;
      renderQuestion();
    }
  });

  btnNext.addEventListener("click", () => {
    const d = quizState.dynasty;
    if (quizState.idx < d.quiz.length - 1) {
      quizState.idx++;
      renderQuestion();
    } else {
      finishQuiz();
    }
  });

  function finishQuiz() {
    const d = quizState.dynasty;
    const total = d.quiz.length;
    const answeredCount = quizState.results.filter((r) => r.graded).length;
    const correctCount = quizState.results.filter((r) => r.correct).length;
    const pct = Math.round((correctCount / total) * 100);

    let msg, grade;
    if (pct === 100) { msg = "完美！你对这一朝代的掌握炉火纯青。"; grade = "通晓"; }
    else if (pct >= 80) { msg = "非常扎实，仅有少量疏漏，再巩固一下即可。"; grade = "娴熟"; }
    else if (pct >= 60) { msg = "基本掌握，但还有提升空间，建议重做错题。"; grade = "入门"; }
    else { msg = "仍需加把劲，回到「朝代详解」复习后再来挑战。"; grade = "初学"; }

    const wrongs = quizState.results
      .map((r, i) => ({ ...r, i }))
      .filter((r) => r.graded && !r.correct);

    let reviewHtml = "";
    if (wrongs.length) {
      reviewHtml =
        `<div class="result-review"><h4>错题回顾（${wrongs.length} 题）</h4>` +
        wrongs
          .map((w) => {
            const q = d.quiz[w.i];
            let yourAns = "", rightAns = "";
            if (q.type === "single") {
              yourAns = w.picked >= 0 ? `${letter(w.picked)}. ${q.options[w.picked]}` : "未作答";
              rightAns = `${letter(q.answer)}. ${q.options[q.answer]}`;
            } else if (q.type === "judge") {
              yourAns = w.picked >= 0 ? (w.picked === 0 ? "判断为正确" : "判断为错误") : "未作答";
              rightAns = q.answer ? "陈述正确" : "陈述错误";
            } else if (q.type === "multiple") {
              const fmt = (a) => (a && a.length ? a.map((i) => letter(i)).join("、") : "（无）");
              yourAns = fmt(w.picked); rightAns = fmt(q.answer);
            } else if (q.type === "order") {
              const fmt = (a) => (a ? a.map((v, k) => `${k + 1}.${q.items[v]}`).join(" ") : "未作答");
              yourAns = fmt(w.picked); rightAns = fmt(q.answer);
            } else if (q.type === "match") {
              const fmt = (p) => q.pairs.map((pp, i) => `${pp.l}→${p && p[i] !== undefined ? q.pairs[p[i]].r : "?"}`).join("；");
              yourAns = fmt(w.picked);
              rightAns = q.pairs.map((pp) => `${pp.l}→${pp.r}`).join("；");
            }
            return `
            <div class="review-item">
              <div class="rq"><span class="rq-type q-${q.type}">${TYPE_LABEL[q.type]}</span>${w.i + 1}. ${q.q}</div>
              <div class="ra"><span class="mine">你的答案：${yourAns}</span><br><span class="right">正确答案：${rightAns}</span></div>
              <div class="re">解析：${q.explanation}</div>
            </div>`;
          })
          .join("") +
        `</div>`;
    } else if (answeredCount < total) {
      reviewHtml = `<div class="result-review"><h4>提示</h4><p>有 ${total - answeredCount} 题未作答，已按错误计入。建议重做以完整巩固。</p></div>`;
    }

    quizRun.classList.add("hidden");
    quizResult.classList.remove("hidden");
    quizResult.innerHTML = `
      <div class="result-emoji">${pct >= 80 ? "🏆" : pct >= 60 ? "📜" : "💡"}</div>
      <h3>${d.name} · 测验成绩</h3>
      <div class="result-score">${pct}<small> 分</small></div>
      <div class="result-grade">评定：${grade}</div>
      <div class="result-msg">答对 ${correctCount} / ${total} 题　·　${msg}</div>
      ${reviewHtml}
      <button class="btn-restart" id="btnRestart">重新测试本朝代</button>
      <button class="btn-restart btn-gold" id="btnBackToSelect">返回选朝代</button>
    `;
    document.getElementById("btnRestart").addEventListener("click", () => startQuiz(d));
    document.getElementById("btnBackToSelect").addEventListener("click", backToSelect);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function backToSelect() {
    quizRun.classList.add("hidden");
    quizResult.classList.add("hidden");
    quizSelect.classList.remove("hidden");
  }

  /* ---------- 概览统计 ---------- */
  function renderQuickStats() {
    const el = document.getElementById("quickStats");
    if (!el) return;
    let qtotal = 0;
    const types = new Set();
    DATA.forEach((d) => d.quiz.forEach((q) => { qtotal++; types.add(q.type); }));
    const stats = [
      { n: DATA.length, label: "历史阶段" },
      { n: qtotal, label: "测验题目" },
      { n: types.size, label: "题型种类" },
      { n: "5", label: "特点维度" },
    ];
    el.innerHTML = stats
      .map((s) => `<div class="stat-item"><span class="stat-n">${s.n}</span><span class="stat-l">${s.label}</span></div>`)
      .join("");
  }

  /* ---------- 初始化 ---------- */
  renderTimeline();
  renderPeriodTabs();
  renderQuizChips();
  renderQuickStats();
  selectPeriod(DATA[0].id);
})();
