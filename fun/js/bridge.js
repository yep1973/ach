/* ============================================================
   趣味学习系统 · 数据桥
   复用现有 js/data.js（window.DYNASTIES），归一化出供趣味模块使用的结构。
   未来两系统结合时，只需把这里的数据来源换掉，玩法代码不动。
   ============================================================ */
(function () {
  "use strict";

  var D = (window.DYNASTIES || []).slice();

  // 现有 maps/ 目录下 28 张 SVG 地图的基础名（与朝代 id 基本对应）
  var MAP_IDS = [
    "sanhuan", "neolithic", "paleo", "xia", "shang", "westzhou", "spring",
    "warring", "qin", "chuhan", "westhan", "eastjin", "westjin", "jin",
    "nanbei", "sui", "tang", "wudai", "beisong", "nansong", "liao", "xixia",
    "yuan", "ming", "qing", "easthan", "sanguo", "xin"
  ];

  var mapSet = {};
  MAP_IDS.forEach(function (m) { mapSet[m] = true; });

  function dynastyById(id) {
    for (var i = 0; i < D.length; i++) if (D[i].id === id) return D[i];
    return null;
  }

  // 朝代列表（用于导航/选择）
  var dynasties = D.map(function (d) {
    return {
      id: d.id,
      name: d.name,
      short: d.short || d.name,
      color: d.color || "#888",
      capital: d.capital || "",
      period: d.period || "",
      summary: d.summary || ""
    };
  });

  // ---- 年份归一：把事件 time 的混乱文本（年份 / 世纪 / 时期）统一成可比较的数值年份 ----
  // 公元前记为负数；仅用于「时间轴排序」的展示与比较，正确性仍以数组顺序(index)为准。
  function parseYearFromTime(t) {
    if (!t) return null;
    var cen = t.match(/(\d+)\s*世纪/);
    if (cen) {
      var n = parseInt(cen[1], 10);
      return (/前/.test(t) ? -1 : 1) * (n * 100 - 50); // 取世纪中点
    }
    var re = /(前|公元前)?\s*(\d{1,4})\s*年?/g, m, years = [];
    while ((m = re.exec(t)) !== null) {
      if (m[2]) { var v = parseInt(m[2], 10); if (m[1]) v = -v; years.push(v); }
    }
    return years.length ? years[0] : null;
  }

  function parsePeriodRange(period) {
    if (!period) return null;
    var re = /(前|公元前)?\s*(\d{1,4})/g, m, nums = [];
    while ((m = re.exec(period)) !== null) {
      var v = parseInt(m[2], 10); if (m[1]) v = -v; nums.push(v);
    }
    if (nums.length < 2) return nums.length === 1 ? [nums[0], nums[0]] : null;
    return nums[0] <= nums[1] ? [nums[0], nums[1]] : [nums[1], nums[0]];
  }

  function isCleanYear(t) {
    if (!t) return false;
    if (/约|世纪|[–—\-－]/.test(t)) return false;
    return /^前?\d{1,4}年$/.test(t.trim()) || /^前?\d{1,4}$/.test(t.trim());
  }

  function yearLabelOf(y, approx) {
    var s = (y < 0 ? "前" + (-y) : String(y)) + "年";
    return (approx ? "约" : "") + s;
  }

  // 计算某朝代全部事件的展示年份：数值化、单调递增、年份标注
  function computeEventYears(events, period) {
    var n = events.length;
    if (!n) return [];
    var rng = parsePeriodRange(period) || [-2200, 1912];
    var a = rng[0], b = rng[1];
    var out = [];
    for (var i = 0; i < n; i++) {
      var frac = n > 1 ? i / (n - 1) : 0;
      var y = Math.round(a + (b - a) * frac);
      var py = parseYearFromTime(events[i].time);
      if (py != null && py >= (i > 0 ? out[i - 1] + 1 : -Infinity) && py <= b) {
        y = py; // 能精确解析且不与顺序冲突时，优先用真实年份
      }
      if (i > 0 && y <= out[i - 1]) y = out[i - 1] + 1; // 强制单调递增，保证排序可比较
      out.push(y);
    }
    return out;
  }

  // 某朝代事件（按原数组顺序 = 时间顺序；附带 year / yearLabel 供时间轴排序）
  function eventsOf(id) {
    var d = dynastyById(id);
    if (!d || !d.events) return [];
    var evs = d.events;
    var period = d.period || (d.basic && d.basic.time) || "";
    var years = computeEventYears(evs, period);
    return evs.map(function (e, i) {
      var y = years[i];
      var approx = !isCleanYear(e.time);
      return {
        index: i,
        title: e.title,
        time: e.time || "",
        year: y,
        yearLabel: yearLabelOf(y, approx),
        type: e.type || "",
        desc: e.desc || ""
      };
    });
  }

  // 某朝代人物
  function notablesOf(id) {
    var d = dynastyById(id);
    if (!d || !d.notables) return [];
    return d.notables.map(function (n, i) {
      return {
        index: i,
        id: id + ":" + i,
        name: n.name,
        role: n.role || "",
        deed: n.deed || "",
        dynasty: d.name,
        dynastyId: id
      };
    });
  }

  // 某朝代题库
  function quizOf(id) {
    var d = dynastyById(id);
    if (!d || !d.quiz) return [];
    return d.quiz.map(function (q, i) {
      return Object.assign({ dynastyId: id, dynasty: d.name, qid: id + ":" + i }, q);
    });
  }

  // 所有人物（用于卡牌收集）
  function allNotables() {
    var out = [];
    dynasties.forEach(function (d) {
      notablesOf(d.id).forEach(function (n) { out.push(n); });
    });
    return out;
  }

  // 该朝代是否有地图（穿越剧场场景图复用）
  function mapOf(id) {
    return mapSet[id] ? "maps/" + id + ".svg" : null;
  }

  window.FunData = {
    dynasties: dynasties,
    eventsOf: eventsOf,
    notablesOf: notablesOf,
    quizOf: quizOf,
    allNotables: allNotables,
    mapOf: mapOf,
    dynastyById: dynastyById
  };
})();
