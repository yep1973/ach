# -*- coding: utf-8 -*-
"""
生成 历史游乐园「连连看」题库 -> fun/js/link-data.js
------------------------------------------------------------------
四类题型：
  capital 朝代 ↔ 都城
  figure  朝代 ↔ 人物
  deed    人物 ↔ 事迹 / 典故
  event   朝代 ↔ 事迹

严格校验（不满足则报错、不生成文件）：
  1. 同一题型内：左项文本唯一、右项文本唯一
  2. 全局：所有条目的「右项」文本唯一（避免跨题型出现同名词造成误配）
  3. 右项不得包含左项文本（避免直接送答案）
  4. 长度限制，保证卡片显示不溢出
  5. dyn（朝代 id）必须存在于主系统 js/data.js

每条数据格式： (左项, 右项, 主系统朝代 id)
要扩充题目，直接在下面的列表里加行，再运行本脚本即可。
"""
import json
import os
import sys
import collections

ROOT = os.path.dirname(os.path.abspath(__file__))

# ---- 主系统合法朝代 id ----
src = open(os.path.join(ROOT, "js/data.js"), encoding="utf-8").read()
a = src.index("const DYNASTIES")
s = src.index("[", a)
i, dep, ins, esc = s, 0, False, False
while i < len(src):
    c = src[i]
    if ins:
        if esc:
            esc = False
        elif c == "\\":
            esc = True
        elif c == '"':
            ins = False
    else:
        if c == '"':
            ins = True
        elif c == "[":
            dep += 1
        elif c == "]":
            dep -= 1
            if dep == 0:
                break
    i += 1
VALID_DYN = {d["id"] for d in json.loads(src[s:i + 1])}

TYPES = [
    dict(
        id="capital", name="朝代 ↔ 都城", left="朝代", right="都城 / 中心",
        intro="左边是朝代，右边是它当年的都城或统治中心。在两边各点一张：同一朝代的搭配配对成功（绿），配错会闪红。配完这一批即过关。",
        pairs=[
            ("夏", "斟鄩（二里头）", "xia"),
            ("商", "殷（今安阳）", "shang"),
            ("西周", "镐京（宗周）", "westzhou"),
            ("春秋", "洛邑", "spring"),
            ("战国·齐", "临淄", "warring"),
            ("战国·楚", "郢都", "warring"),
            ("秦", "咸阳", "qin"),
            ("西楚", "彭城", "chuhan"),
            ("西汉", "长安", "westhan"),
            ("新朝", "常安", "xin"),
            ("东汉", "洛阳", "easthan"),
            ("蜀汉", "成都", "sanguo"),
            ("东吴", "建业", "sanguo"),
            ("东晋", "建康", "eastjin"),
            ("北魏", "平城（今大同）", "nanbei"),
            ("隋", "大兴城", "sui"),
            ("北宋", "汴京（开封）", "beisong"),
            ("南宋", "临安（今杭州）", "nansong"),
            ("辽", "上京临潢府", "liao"),
            ("西夏", "兴庆府", "xixia"),
            ("金", "中都（燕京）", "jin"),
            ("元", "大都", "yuan"),
            ("明", "应天府（南京）", "ming"),
            ("清", "北京（京师）", "qing"),
        ],
    ),
    dict(
        id="figure", name="朝代 ↔ 人物", left="朝代", right="历史人物",
        intro="左边是朝代，右边是活跃于该朝代的代表人物。请把每位人物送回他所属的朝代。",
        pairs=[
            ("三皇五帝", "仓颉", "sanhuan"),
            ("夏", "伯益", "xia"),
            ("商", "妇好", "shang"),
            ("西周", "姜太公", "westzhou"),
            ("春秋", "孔子", "spring"),
            ("战国", "屈原", "warring"),
            ("秦", "李斯", "qin"),
            ("楚汉", "范增", "chuhan"),
            ("西汉", "张骞", "westhan"),
            ("新朝", "王莽", "xin"),
            ("东汉", "蔡伦", "easthan"),
            ("三国", "诸葛亮", "sanguo"),
            ("西晋", "司马炎", "westjin"),
            ("东晋", "谢安", "eastjin"),
            ("南北朝", "祖冲之", "nanbei"),
            ("隋", "李春", "sui"),
            ("唐", "李白", "tang"),
            ("五代十国", "李煜", "wudai"),
            ("北宋", "苏轼", "beisong"),
            ("辽", "耶律阿保机", "liao"),
            ("西夏", "野利仁荣", "xixia"),
            ("金", "完颜宗翰", "jin"),
            ("南宋", "岳飞", "nansong"),
            ("元", "关汉卿", "yuan"),
            ("明", "郑和", "ming"),
            ("清", "曹雪芹", "qing"),
        ],
    ),
    dict(
        id="deed", name="人物 ↔ 事迹·典故", left="历史人物", right="事迹 / 典故",
        intro="左边是历史人物，右边是他/她的事迹或典故（例如「韩信 ↔ 明修栈道，暗度陈仓」）。把典故与它的主人公连起来。",
        pairs=[
            # 先秦
            ("仓颉", "观鸟兽造字", "sanhuan"),
            ("妇好", "统兵征羌方", "shang"),
            ("伊尹", "辅汤灭夏", "shang"),
            ("比干", "剖心死谏", "shang"),
            ("周公旦", "制礼作乐", "westzhou"),
            ("姜太公", "渭水直钩垂钓", "westzhou"),
            ("管仲", "尊王攘夷", "spring"),
            ("孔子", "韦编三绝", "spring"),
            ("老子", "著《道德经》", "spring"),
            ("孙武", "吴宫教战", "spring"),
            ("勾践", "卧薪尝胆", "spring"),
            ("范蠡", "泛舟五湖", "spring"),
            ("商鞅", "徙木立信", "warring"),
            ("孙膑", "围魏救赵", "warring"),
            ("苏秦", "佩六国相印", "warring"),
            ("张仪", "连横破合纵", "warring"),
            ("白起", "长平坑赵卒", "warring"),
            ("吕不韦", "奇货可居", "warring"),
            ("屈原", "怀沙沉汨罗", "warring"),
            ("廉颇", "负荆请罪", "warring"),
            ("蔺相如", "完璧归赵", "warring"),
            ("赵括", "纸上谈兵", "warring"),
            ("庄子", "庄周梦蝶", "warring"),
            # 秦汉
            ("李斯", "上《谏逐客书》", "qin"),
            ("蒙恬", "北筑长城", "qin"),
            ("赵高", "指鹿为马", "qin"),
            ("陈胜", "揭竿而起", "qin"),
            ("项羽", "破釜沉舟", "qin"),
            ("刘邦", "约法三章", "qin"),
            ("韩信", "明修栈道，暗度陈仓", "chuhan"),
            ("张良", "圯上受书", "chuhan"),
            ("萧何", "萧规曹随", "chuhan"),
            ("司马迁", "忍辱著《史记》", "westhan"),
            ("张骞", "凿空西域", "westhan"),
            ("霍去病", "封狼居胥", "westhan"),
            ("董仲舒", "独尊儒术", "westhan"),
            ("苏武", "北海牧羊十九年", "westhan"),
            ("王莽", "托古改制", "xin"),
            ("刘秀", "昆阳之战", "easthan"),
            ("班超", "不入虎穴，焉得虎子", "easthan"),
            ("蔡伦", "改进造纸术", "easthan"),
            ("张衡", "创制地动仪", "easthan"),
            ("曹操", "望梅止渴", "easthan"),
            # 魏晋南北朝
            ("诸葛亮", "隆中对策", "sanguo"),
            ("刘备", "三顾茅庐", "sanguo"),
            ("关羽", "单刀赴会", "sanguo"),
            ("周瑜", "火烧赤壁", "sanguo"),
            ("陆逊", "夷陵火烧连营", "sanguo"),
            ("司马懿", "高平陵之变", "sanguo"),
            ("祖逖", "闻鸡起舞", "eastjin"),
            ("王导", "王与马，共天下", "eastjin"),
            ("谢安", "东山再起", "eastjin"),
            ("王羲之", "兰亭集序", "eastjin"),
            ("陶渊明", "不为五斗米折腰", "eastjin"),
            ("祖冲之", "圆周率精算七位", "nanbei"),
            ("郦道元", "注《水经》", "nanbei"),
            ("贾思勰", "撰《齐民要术》", "nanbei"),
            ("北魏孝文帝", "迁都改汉俗", "nanbei"),
            ("李春", "营建赵州桥", "sui"),
            ("宇文恺", "规划大兴城", "sui"),
            # 唐宋
            ("魏徵", "犯颜直谏", "tang"),
            ("李白", "斗酒诗百篇", "tang"),
            ("杜甫", "三吏三别", "tang"),
            ("玄奘", "西行取经", "tang"),
            ("韩愈", "倡导古文运动", "tang"),
            ("冯道", "历仕五朝", "wudai"),
            ("李煜", "问君能有几多愁", "wudai"),
            ("赵普", "半部《论语》治天下", "beisong"),
            ("寇准", "力主澶州亲征", "beisong"),
            ("范仲淹", "先天下之忧而忧", "beisong"),
            ("王安石", "熙宁变法", "beisong"),
            ("司马光", "主编《资治通鉴》", "beisong"),
            ("沈括", "撰《梦溪笔谈》", "beisong"),
            ("苏轼", "赤壁怀古", "beisong"),
            ("欧阳修", "醉翁亭记", "beisong"),
            ("野利仁荣", "创制蕃字", "xixia"),
            ("完颜宗翰", "灭辽破宋", "jin"),
            ("岳飞", "精忠报国", "nansong"),
            ("秦桧", "莫须有", "nansong"),
            ("文天祥", "留取丹心照汗青", "nansong"),
            ("陆秀夫", "崖山负帝蹈海", "nansong"),
            # 元明清
            ("耶律楚材", "劝止屠城", "yuan"),
            ("郭守敬", "编《授时历》", "yuan"),
            ("关汉卿", "作《窦娥冤》", "yuan"),
            ("马可·波罗", "口述《东方见闻录》", "yuan"),
            ("郑和", "七下西洋", "ming"),
            ("于谦", "京师保卫战", "ming"),
            ("戚继光", "鸳鸯阵抗倭", "ming"),
            ("张居正", "推行一条鞭法", "ming"),
            ("王阳明", "龙场悟道", "ming"),
            ("李时珍", "撰《本草纲目》", "ming"),
            ("宋应星", "著《天工开物》", "ming"),
            ("徐霞客", "踏遍山河写游记", "ming"),
            ("林则徐", "虎门销烟", "qing"),
            ("曾国藩", "组建湘军", "qing"),
            ("李鸿章", "兴办洋务", "qing"),
            ("曹雪芹", "著《红楼梦》", "qing"),
            ("蒲松龄", "撰《聊斋志异》", "qing"),
            ("吴敬梓", "写《儒林外史》", "qing"),
            ("纪昀", "总纂《四库全书》", "qing"),
            ("郑燮", "难得糊涂", "qing"),
            ("龚自珍", "我劝天公重抖擞", "qing"),
            ("胡雪岩", "红顶商人", "qing"),
            ("张謇", "状元实业救国", "qing"),
            ("盛宣怀", "创办轮船招商局", "qing"),
        ],
    ),
    dict(
        id="event", name="朝代 ↔ 事迹", left="朝代", right="历史事件 / 典故",
        intro="左边是朝代，右边是发生在该朝代的标志性事件或治世。请把事件送回它所属的朝代。",
        pairs=[
            ("旧石器", "用火与打制石器", "paleo"),
            ("三皇五帝", "尧舜禅让", "sanhuan"),
            ("新石器", "稻粟农业起源", "neolithic"),
            ("夏", "启承禹位·家天下", "xia"),
            ("商", "盘庚迁殷", "shang"),
            ("西周", "国人暴动", "westzhou"),
            ("春秋", "葵丘会盟", "spring"),
            ("战国", "商鞅变法", "warring"),
            ("秦", "书同文·车同轨", "qin"),
            ("楚汉", "鸿门宴", "chuhan"),
            ("西汉", "文景之治", "westhan"),
            ("新朝", "王莽改制", "xin"),
            ("东汉", "光武中兴", "easthan"),
            ("三国", "诸葛亮北伐", "sanguo"),
            ("西晋", "八王之乱", "westjin"),
            ("东晋", "淝水之战", "eastjin"),
            ("南北朝", "北魏统一北方", "nanbei"),
            ("隋", "开通大运河", "sui"),
            ("唐", "贞观之治", "tang"),
            ("五代十国", "朱温代唐建梁", "wudai"),
            ("北宋", "杯酒释兵权", "beisong"),
            ("辽", "澶渊之盟", "liao"),
            ("西夏", "夏宋庆历和议", "xixia"),
            ("金", "靖康之变", "jin"),
            ("南宋", "绍兴和议", "nansong"),
            ("元", "创立行省制度", "yuan"),
            ("明", "土木堡之变", "ming"),
            ("清", "康乾盛世", "qing"),
        ],
    ),
]

# ---------------- 校验 ----------------
errors = []
all_right = collections.defaultdict(list)

for t in TYPES:
    lefts = collections.defaultdict(list)
    rights = collections.defaultdict(list)
    for idx, (l, r, dyn) in enumerate(t["pairs"]):
        tag = "%s[%d] %s↔%s" % (t["id"], idx, l, r)
        lefts[l].append(idx)
        rights[r].append(idx)
        all_right[r].append(t["id"])
        if not l or not r:
            errors.append(tag + " 空文本")
        if l in r:
            errors.append(tag + " 右项包含左项（送答案）")
        if len(l) > 8:
            errors.append(tag + " 左项过长(%d)" % len(l))
        if len(r) > 16:
            errors.append(tag + " 右项过长(%d)" % len(r))
        if dyn not in VALID_DYN:
            errors.append(tag + " 非法朝代 id: " + dyn)
    for l, idxs in lefts.items():
        if len(idxs) > 1:
            errors.append("%s 左项重复: %s -> %s" % (t["id"], l, idxs))
    for r, idxs in rights.items():
        if len(idxs) > 1:
            errors.append("%s 右项重复: %s -> %s" % (t["id"], r, idxs))

for r, owners in all_right.items():
    if len(owners) > 1:
        errors.append("全局右项重复: %s -> %s" % (r, owners))

if errors:
    print("校验失败，共 %d 项：" % len(errors))
    for e in errors:
        print("  - " + e)
    sys.exit(1)

# ---------------- 生成 ----------------
out_types = []
for t in TYPES:
    pairs = [
        {"id": "%s:%d" % (t["id"], i), "l": l, "r": r, "d": dyn}
        for i, (l, r, dyn) in enumerate(t["pairs"])
    ]
    out_types.append({
        "id": t["id"], "name": t["name"], "left": t["left"],
        "right": t["right"], "intro": t["intro"], "pairs": pairs,
    })

total = sum(len(t["pairs"]) for t in out_types)
header = (
    "/* ============================================================\n"
    "   趣味历史乐园 · 连连看题库（由 build_link_data.py 生成，请勿手改）\n"
    "   四类题型：朝代↔都城 / 朝代↔人物 / 人物↔事迹·典故 / 朝代↔事迹\n"
    "   已校验：同题型内左右文本唯一、全局右项唯一、右项不含左项、朝代 id 合法。\n"
    "   要扩充题目：编辑 build_link_data.py 的 TYPES 列表后重新运行。\n"
    "   共 %d 对，字段：l=左项  r=右项  d=主系统朝代 id（用于发放卡牌）\n"
    "   ============================================================ */\n" % total
)
body = "window.FunLinkData = " + json.dumps(
    {"types": out_types}, ensure_ascii=False, indent=2
) + ";\n"

dest = os.path.join(ROOT, "fun/js/link-data.js")
open(dest, "w", encoding="utf-8").write(header + body)
print("生成成功: %s" % dest)
for t in out_types:
    print("  %-9s %-16s %2d 对" % (t["id"], t["name"], len(t["pairs"])))
print("合计 %d 对，全部校验通过" % total)
