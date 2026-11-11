// Netlify Function: /api/leaderboard
// 列出所有已通关账号，按通关用时升序 TOP 50。数据来自同一 Netlify Blobs store。

import { getStore } from "@netlify/blobs";

const STORE_NAME = "history-fun";
const PREFIX = "player:";

export default async function () {
  const s = getStore({ name: STORE_NAME, consistency: "strong" });
  const listing = await s.list();
  const keys = (listing && listing.blobs ? listing.blobs : [])
    .filter(function (b) { return b.key && b.key.indexOf(PREFIX) === 0; })
    .slice(0, 1000);

  const rows = await Promise.all(keys.map(async function (b) {
    try { return await s.get(b.key, { type: "json", consistency: "strong" }); }
    catch (e) { return null; }
  }));

  const list = rows
    .filter(function (p) { return p && p.completed; })
    .sort(function (a, b) {
      const av = a.completedMs == null ? 1e15 : Number(a.completedMs);
      const bv = b.completedMs == null ? 1e15 : Number(b.completedMs);
      return av - bv;
    })
    .slice(0, 50)
    .map(function (p) {
      return {
        account: p.account,
        nick: p.nick || p.account,
        completedMs: p.completedMs,
        playedMs: p.playedMs || 0,
        fragments: p.fragments || 0,
        cards: Array.isArray(p.cards) ? p.cards.length : 0
      };
    });

  return new Response(JSON.stringify({ ok: true, list: list }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
