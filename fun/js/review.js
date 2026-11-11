/* ============================================================
   趣味历史乐园 · 间隔复习（错题本）
   集中查看各玩法答错的题目、展开正确答案、标记「已掌握」清除，
   或按遗忘曲线推迟复习。清除动作通过 reviewRemoved 墓碑跨设备同步。
   ============================================================ */
(function () {
  "use strict";
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var FILTER = "all";       // all | due
  var expanded = {};        // 展开答案的题干

  function sourceLabel(s) {
    return s || "闯关答题";
  }
  function dateLabel(ts) {
    if (!ts) return "";
    var d = new Date(Number(ts));
    if (isNaN(d.getTime())) return "";
    return (d.getMonth() + 1) + " 月 " + d.getDate() + " 日";
  }

  function open() {
    var root = el("view-review");
    if (!root) return;
    var all = FunStore.allReviews();
    var dueQ = {};
    FunStore.dueReviews().forEach(function (r) { dueQ[r.q] = 1; });
    var list = (FILTER === "due") ? all.filter(function (r) { return dueQ[r.q]; }) : all;
    var todayDue = Object.keys(dueQ).length;

    var body = list.length
      ? list.map(function (r, i) {
          var open = !!expanded[r.q];
          return '<div class="rv-item' + (dueQ[r.q] ? " rv-due" : "") + '">' +
            '<div class="rv-meta">' +
              '<span class="rv-src">' + esc(sourceLabel(r.source)) + "</span>" +
              '<span class="rv-wrong">答错 ' + (Number(r.wrong) || 1) + " 次</span>" +
              (dueQ[r.q] ? '<span class="rv-flag">今日待巩固</span>' : '<span class="rv-flag rv-later">已安排复习</span>') +
              (r.lastWrongAt ? '<span class="rv-date">' + dateLabel(r.lastWrongAt) + "</span>" : "") +
            "</div>" +
            '<div class="rv-q">' + (i + 1) + ". " + esc(r.q) + "</div>" +
            '<div class="rv-ans' + (open ? "" : " hidden") + '" data-ans="' + i + '">' +
              "✅ <b>正确答案：</b>" + esc(r.a || "（见题目解析）") +
              (r.note ? '<div class="rv-note">💡 ' + esc(r.note) + "</div>" : "") +
            "</div>" +
            '<div class="rv-actions">' +
              '<button class="btn small ghost" data-show="' + i + '">' + (open ? "隐藏答案" : "显示答案") + "</button>" +
              '<button class="btn small" data-master="' + i + '">已掌握 ✓ 清除</button>' +
              '<button class="btn small ghost" data-later="' + i + '">还没记住</button>' +
            "</div>" +
          "</div>";
        }).join("")
      : '<div class="rv-empty">' +
          (all.length ? "🎉 今天没有待巩固的题目，稍后再来复习吧！" : "🎉 错题本是空的！答错的题目会自动收进这里，随时可以回来集中巩固。") +
        "</div>";

    root.innerHTML =
      '<div class="back-link" data-go="home">← 返回主页</div>' +
      '<div class="panel">' +
        '<div class="section-title">📅 间隔复习 · 错题本</div>' +
        '<div class="section-sub">闯关答题、时间轴排序、连连看和线索推理中<b>答错的题目</b>都会自动收进这里。' +
          '点击「显示答案」对照正确答案，确认记牢后点「已掌握」即可清除；暂时没记住的会按遗忘曲线推迟到 2 天后再提醒。</div>' +
        '<div class="rv-summary">' +
          '<div class="rv-stat"><b>' + all.length + "</b><span>错题总数</span></div>" +
          '<div class="rv-stat"><b>' + todayDue + "</b><span>今日待巩固</span></div>" +
          '<div class="rv-stat"><b>' + (all.length - todayDue) + "</b><span>已安排复习</span></div>" +
        "</div>" +
        '<div class="rv-bar">' +
          '<button class="lt-btn' + (FILTER === "all" ? " active" : "") + '" data-f="all">全部错题</button>' +
          '<button class="lt-btn' + (FILTER === "due" ? " active" : "") + '" data-f="due">今日待巩固</button>' +
          '<button class="lt-btn" id="rvExpand">' + (Object.keys(expanded).length ? "收起答案" : "展开全部答案") + "</button>" +
          (all.length ? '<button class="lt-btn" id="rvClear">清空全部</button>' : "") +
        "</div>" +
        '<div id="rvList">' + body + "</div>" +
      "</div>";

    root.querySelector('[data-go="home"]').onclick = function () { FunUI.go("home"); };
    root.querySelectorAll("[data-f]").forEach(function (b) {
      b.onclick = function () { FILTER = b.getAttribute("data-f"); open(); };
    });
    root.querySelectorAll("[data-show]").forEach(function (b) {
      b.onclick = function () {
        var r = list[parseInt(b.getAttribute("data-show"), 10)];
        if (!r) return;
        if (expanded[r.q]) delete expanded[r.q]; else expanded[r.q] = 1;
        open();
      };
    });
    root.querySelectorAll("[data-master]").forEach(function (b) {
      b.onclick = function () {
        var r = list[parseInt(b.getAttribute("data-master"), 10)];
        if (!r) return;
        FunStore.masterReview(r.q);
        delete expanded[r.q];
        if (window.FunUI) FunUI.toast("✅", "已掌握", "这道错题已从复习清单清除");
        open();
      };
    });
    root.querySelectorAll("[data-later]").forEach(function (b) {
      b.onclick = function () {
        var r = list[parseInt(b.getAttribute("data-later"), 10)];
        if (!r) return;
        FunStore.reviewDone(r.q);
        if (window.FunUI) FunUI.toast("📅", "已安排复习", "2 天后会再次提醒你巩固这道题");
        open();
      };
    });
    var ex = el("rvExpand");
    if (ex) ex.onclick = function () {
      if (Object.keys(expanded).length) expanded = {};
      else list.forEach(function (r) { expanded[r.q] = 1; });
      open();
    };
    var cl = el("rvClear");
    if (cl) cl.onclick = function () {
      if (confirm("确定清空全部错题吗？清除后不会再出现在复习清单里。")) {
        FunStore.clearAllReviews();
        expanded = {};
        open();
      }
    };
  }

  window.FunReview = { open: open };
})();
