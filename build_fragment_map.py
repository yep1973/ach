# -*- coding: utf-8 -*-
"""
生成「历史游乐园」终极目标所需的 34 片省级行政区地图碎片。

数据来源：国内公开的中国省级行政区划边界数据（阿里云 DataV.GeoAtlas
areas_v3 / 100000_full.json），已下载到 _map_src/china_provinces.geo.json。
数据完整包含 34 个省级行政区（23 省 / 5 自治区 / 4 直辖市 / 2 特别行政区）
以及南海十段线（100000_JD），台湾省、香港特别行政区、澳门特别行政区
均作为中国领土的一部分参与拼图。未使用任何境外地图瓦片或底图服务。

投影：Albers 等积圆锥投影（标准纬线 25°N / 47°N，中央经线 105°E），
这是中国地图常用投影，能保持区域形状真实。

产出：
  fun/maps/china-provinces.svg  完整设色中国地图（含十段线、省名、来源注记）
  fun/js/fragment-data.js       34 片真实轮廓 path + 名称 + 类别 + 中心点 + 配色
"""
import json
import math
import os
from collections import Counter

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "_map_src", "china_provinces.geo.json")
OUT_SVG = os.path.join(ROOT, "fun", "maps", "china-provinces.svg")
OUT_JS = os.path.join(ROOT, "fun", "js", "fragment-data.js")

# 34 个省级行政区的官方规范全称与类别（顺序按国家行政区划代码）
META = [
    ("110000", "北京市", "直辖市"),
    ("120000", "天津市", "直辖市"),
    ("130000", "河北省", "省"),
    ("140000", "山西省", "省"),
    ("150000", "内蒙古自治区", "自治区"),
    ("210000", "辽宁省", "省"),
    ("220000", "吉林省", "省"),
    ("230000", "黑龙江省", "省"),
    ("310000", "上海市", "直辖市"),
    ("320000", "江苏省", "省"),
    ("330000", "浙江省", "省"),
    ("340000", "安徽省", "省"),
    ("350000", "福建省", "省"),
    ("360000", "江西省", "省"),
    ("370000", "山东省", "省"),
    ("410000", "河南省", "省"),
    ("420000", "湖北省", "省"),
    ("430000", "湖南省", "省"),
    ("440000", "广东省", "省"),
    ("450000", "广西壮族自治区", "自治区"),
    ("460000", "海南省", "省"),
    ("500000", "重庆市", "直辖市"),
    ("510000", "四川省", "省"),
    ("520000", "贵州省", "省"),
    ("530000", "云南省", "省"),
    ("540000", "西藏自治区", "自治区"),
    ("610000", "陕西省", "省"),
    ("620000", "甘肃省", "省"),
    ("630000", "青海省", "省"),
    ("640000", "宁夏回族自治区", "自治区"),
    ("650000", "新疆维吾尔自治区", "自治区"),
    ("710000", "台湾省", "省"),
    ("810000", "香港特别行政区", "特别行政区"),
    ("820000", "澳门特别行政区", "特别行政区"),
]
SHORT = {
    "内蒙古自治区": "内蒙古", "广西壮族自治区": "广西",
    "宁夏回族自治区": "宁夏", "新疆维吾尔自治区": "新疆",
    "西藏自治区": "西藏", "香港特别行政区": "香港",
    "澳门特别行政区": "澳门",
}

# 面积过小、在整图上难以看清的省级行政区：给出标签偏移（引线）
LABEL_OFFSET = {
    "北京市": (26, -16), "天津市": (34, 8), "上海市": (40, 4),
    "香港特别行政区": (46, 22), "澳门特别行政区": (-20, 40),
    "宁夏回族自治区": (6, -14), "海南省": (30, 16), "台湾省": (44, 6),
}

# Albers 参数
PHI1, PHI2, PHI0, LAM0 = 25.0, 47.0, 35.0, 105.0


def rad(d):
    return d * math.pi / 180.0


N_ALB = (math.sin(rad(PHI1)) + math.sin(rad(PHI2))) / 2.0
C_ALB = math.cos(rad(PHI1)) ** 2 + 2 * N_ALB * math.sin(rad(PHI1))
RHO0 = math.sqrt(C_ALB - 2 * N_ALB * math.sin(rad(PHI0))) / N_ALB


def project(lon, lat):
    theta = N_ALB * rad(lon - LAM0)
    rho = math.sqrt(max(C_ALB - 2 * N_ALB * math.sin(rad(lat)), 1e-9)) / N_ALB
    # SVG 的 y 轴向下：纬度越高 rho 越小，故取负使「北在上、南在下」
    return rho * math.sin(theta), rho * math.cos(theta) - RHO0


def rings_of(geom):
    """统一返回 [ring, ...]，ring = [(lon,lat), ...]"""
    t, c = geom["type"], geom["coordinates"]
    if t == "Polygon":
        return c
    out = []
    for poly in c:
        out.extend(poly)
    return out


def rdp(points, eps):
    """Ramer-Douglas-Peucker 折线简化"""
    if len(points) < 3:
        return points
    ax, ay = points[0]
    bx, by = points[-1]
    dx, dy = bx - ax, by - ay
    den = math.hypot(dx, dy)
    best, idx = -1.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        if den < 1e-12:
            d = math.hypot(px - ax, py - ay)
        else:
            d = abs(dy * px - dx * py + bx * ay - by * ax) / den
        if d > best:
            best, idx = d, i
    if best <= eps:
        return [points[0], points[-1]]
    return rdp(points[:idx + 1], eps)[:-1] + rdp(points[idx:], eps)


def fmt(v):
    s = "%.1f" % v
    if s.endswith(".0"):
        s = s[:-2]
    return s


def path_of(rings, pts_cache):
    """投影后的 ring 列表 → SVG path d"""
    segs = []
    for ring in rings:
        pts = ring if isinstance(ring[0], (list, tuple)) else pts_cache[ring]
        if len(pts) < 3:
            continue
        segs.append("M" + " L".join(fmt(x) + "," + fmt(y) for x, y in pts) + " Z")
    return " ".join(segs)


# 中国风设色板：相邻省份错开取色，拼合后是一幅协调又分明的行政区划图
PALETTE = [
    "#c8604f", "#d99a57", "#c9b25f", "#9fbc78", "#79ad96", "#6fa2ab",
    "#8299bd", "#a58ab6", "#cf8b9d", "#bb8d6c", "#8db88b", "#c79a8a",
    "#9dadaf", "#d0a860", "#b07f9e", "#87a9c4", "#c48d63",
]


def color_of(index):
    return PALETTE[(index * 7) % len(PALETTE)]


def main():
    data = json.load(open(SRC, encoding="utf-8"))
    feats = {str(f["properties"].get("adcode")): f for f in data["features"]}
    jd = feats.get("100000_JD")
    assert jd, "缺少南海十段线数据（100000_JD）"

    # ---- 收集所有投影坐标，确定统一 viewBox ----
    all_pts = []
    projected = {}
    for code, name, kind in META:
        f = feats.get(code)
        assert f, "缺少省级行政区：" + name
        prings = []
        for ring in rings_of(f["geometry"]):
            pts = [project(lon, lat) for lon, lat in ring]
            prings.append(pts)
            all_pts.extend(pts)
        projected[code] = prings
    jd_rings = []
    for ring in rings_of(jd["geometry"]):
        pts = [project(lon, lat) for lon, lat in ring]
        jd_rings.append(pts)
        all_pts.extend(pts)

    xs = [p[0] for p in all_pts]
    ys = [p[1] for p in all_pts]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    print("投影原始范围 x=%.1f..%.1f  y=%.1f..%.1f" % (minx, maxx, miny, maxy))

    W = 1000.0
    pad = 34.0
    scale = (W - 2 * pad) / (maxx - minx)
    H = (maxy - miny) * scale + 2 * pad
    print("viewBox 0 0 %.0f %.0f  scale=%.4f" % (W, H, scale))

    def tx(p):
        return (round((p[0] - minx) * scale + pad, 1),
                round((p[1] - miny) * scale + pad, 1))

    # 简化（在最终像素坐标下做，容差 0.65px）
    def simplify_and_path(rings):
        out_rings = []
        for pts in rings:
            tp = [tx(p) for p in pts]
            simple = rdp(tp, 0.65)
            if len(simple) >= 3:
                out_rings.append(simple)
        d = path_of(out_rings, None)
        return d, out_rings

    # ---- 34 片碎片 ----
    regions = []
    for i, (code, name, kind) in enumerate(META):
        f = feats[code]
        d, out_rings = simplify_and_path(projected[code])
        assert d, "空路径：" + name
        center = f["properties"].get("centroid") or f["properties"].get("center")
        clon, clat = center
        cx, cy = tx(project(clon, clat))
        # 面积（用最大外环的 shoelace 估算，用于判断是否需要引线标签）
        area = 0.0
        for ring in out_rings:
            a = abs(sum(ring[j][0] * ring[(j + 1) % len(ring)][1] -
                        ring[(j + 1) % len(ring)][0] * ring[j][1]
                        for j in range(len(ring))) / 2.0)
            area = max(area, a)
        ox, oy = LABEL_OFFSET.get(name, (0, 0))
        all_ring_pts = [p for ring in out_rings for p in ring]
        bx0, by0 = min(p[0] for p in all_ring_pts), min(p[1] for p in all_ring_pts)
        bx1, by1 = max(p[0] for p in all_ring_pts), max(p[1] for p in all_ring_pts)
        # 单块碎片展示用的放大取景框（保证最小可视尺寸，避免港澳只剩 1 像素）
        bw, bh = bx1 - bx0, by1 - by0
        mw, mh = max(bw, 90.0), max(bh, 90.0)
        box = [round((bx0 + bx1) / 2 - mw / 2, 1), round((by0 + by1) / 2 - mh / 2, 1),
               round(mw, 1), round(mh, 1)]
        regions.append({
            "id": "r" + code,
            "adcode": code,
            "name": name,
            "short": SHORT.get(name, name.replace("省", "").replace("市", "")
                               .replace("自治区", "").replace("特别行政区", "")),
            "type": kind,
            "path": d,
            "cx": round(cx, 1),
            "cy": round(cy, 1),
            "lx": round(cx + ox, 1),
            "ly": round(cy + oy, 1),
            "labelOffset": [ox, oy],
            "box": box,
            "area": round(area, 1),
            "color": color_of(i),
            "index": i + 1,
        })

    jd_path, _ = simplify_and_path(jd_rings)

    # ---- 校验 ----
    kinds = Counter(r["type"] for r in regions)
    print("类别统计：", dict(kinds))
    assert len(regions) == 34, "碎片数不是 34"
    assert kinds == {"省": 23, "自治区": 5, "直辖市": 4, "特别行政区": 2}, "类别数量不符"
    assert all(r["path"].startswith("M") for r in regions)
    assert "台湾省" in [r["name"] for r in regions]
    assert "香港特别行政区" in [r["name"] for r in regions]
    assert "澳门特别行政区" in [r["name"] for r in regions]
    assert jd_path, "十段线路径为空"
    for key in ("name", "type", "path", "cx", "cy", "color"):
        assert all(r.get(key) for r in regions), "字段缺失：" + key

    # ---- 输出 fragment-data.js ----
    payload = {
        "viewBox": [0, 0, round(W), round(H)],
        "projection": "Albers 等积圆锥（25°N/47°N，中央经线 105°E）",
        "source": "国内公开中国省级行政区划边界数据（DataV.GeoAtlas areas_v3 / 100000_full.json）",
        "note": "台湾省、香港特别行政区、澳门特别行政区及南海诸岛均为中国领土不可分割的部分",
        "nineDash": jd_path,
        "regions": regions,
    }
    js = ("/* 34 片中国省级行政区地图碎片 · 由 build_fragment_map.py 生成，请勿手工编辑。\n"
          "   形状取自国内公开行政区划边界数据，Albers 投影，含南海十段线。 */\n"
          "window.FunFragmentMap = " +
          json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n")
    open(OUT_JS, "w", encoding="utf-8").write(js)
    print("已写出 %s (%.1f KB)" % (OUT_JS, len(js.encode("utf-8")) / 1024))

    # ---- 输出完整中国地图 SVG ----
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" role="img" aria-label="中国地图（34个省级行政区）">' % (
            round(W), round(H), round(W), round(H)),
        '<title>中华人民共和国地图 · 34 个省级行政区</title>',
        '<defs>',
        '  <linearGradient id="sea" x1="0" y1="0" x2="1" y2="1">',
        '    <stop offset="0" stop-color="#f7efe1"/><stop offset="1" stop-color="#efe1cd"/>',
        '  </linearGradient>',
        '  <filter id="soft"><feGaussianBlur stdDeviation="7"/></filter>',
        '</defs>',
        '<rect width="100%%" height="100%%" fill="url(#sea)"/>',
    ]
    # 阴影底：全部省份合并
    parts.append('<g filter="url(#soft)" opacity=".28" fill="#7a4a2e">' +
                 "".join('<path d="%s"/>' % r["path"] for r in regions) + "</g>")
    for r in regions:
        parts.append('<path d="%s" fill="%s" stroke="#8a3b2b" stroke-width="1.3" '
                     'stroke-linejoin="round" fill-rule="evenodd"/>'
                     % (r["path"], r["color"]))
    # 十段线（南海诸岛）
    parts.append('<path d="%s" fill="#8a3b2b" fill-rule="evenodd" opacity=".9"/>' % jd_path)
    # 名称标签
    parts.append('<g font-family="PingFang SC,Microsoft YaHei,sans-serif" font-size="11" '
                 'fill="#3c241c" text-anchor="middle" font-weight="600">')
    for r in regions:
        lx, ly = r["lx"], r["ly"]
        if r["labelOffset"] != [0, 0]:
            parts.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="#8a3b2b" '
                         'stroke-width="1"/>' % (r["cx"], r["cy"], lx, ly))
        parts.append('<text x="%s" y="%s">%s</text>' % (lx, ly + 4, r["short"]))
    parts.append("</g>")
    parts.append('<text x="14" y="%d" font-family="PingFang SC,Microsoft YaHei,sans-serif" '
                 'font-size="11" fill="#8a7062">中国地图 · 34 个省级行政区（含台湾省、南海诸岛）· 行政区划示意</text>'
                 % (round(H) - 12))
    parts.append("</svg>")
    svg = "\n".join(parts) + "\n"
    open(OUT_SVG, "w", encoding="utf-8").write(svg)
    print("已写出 %s (%.1f KB)" % (OUT_SVG, len(svg.encode("utf-8")) / 1024))
    print("校验通过：34 片 / 23 省 / 5 自治区 / 4 直辖市 / 2 特别行政区 / 十段线完整")


if __name__ == "__main__":
    main()
