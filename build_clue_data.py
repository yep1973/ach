# -*- coding: utf-8 -*-
"""
生成 历史游乐园「线索推理」题库 -> fun/js/clue-data.js
------------------------------------------------------------------
数据来自主系统 js/data.js 的 notables（人物），自动抽取 N 条互不重复的线索，
按「难(3) → 中(2) → 易(1)」分级，供玩法每次抽 3 条依次给出。

严格校验（任一不满足即报错、不生成文件）：
  1. 每条提示文本全局唯一（去标点空白后比较），跨人物也不重复
  2. 提示中不得出现该人物的姓名 / 括号别名 / 名字后半段（避免直接送答案）
  3. 每人至少 6 条线索，且难 / 中 / 易三级齐全
  4. 人名唯一；别名不与其他人物姓名冲突
  5. dyn / card 必须能在主系统 js/data.js 中找到（用于发放该人物卡牌）
  6. 单条提示长度 6~48 字，过短 / 过长直接丢弃

要调整线索文字，改下方的 EXCLUDE_DYN / EXTRA_ALIAS / 模板即可重跑。
"""
import json
import os
import re
import sys
import collections

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "fun", "js", "clue-data.js")

# ---------- 读取主系统数据 ----------
src = open(os.path.join(ROOT, "js", "data.js"), encoding="utf-8").read()
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
DYNASTIES = json.loads(src[s:i + 1])
VALID_DYN = {d["id"]: d["name"] for d in DYNASTIES}

# 古人类化石 / 考古文化名不是「可猜的历史人物」，整段排除
EXCLUDE_DYN = {"paleo", "neolithic"}

# 常见字号 / 尊称 / 异写：仅用于判分时放宽输入，不参与提示文本生成
EXTRA_ALIAS = {
    "孔子": ["孔丘", "仲尼", "孔夫子", "至圣先师"],
    "老子": ["李耳", "老聃", "太上老君"],
    "孙武": ["孙子", "孙长卿", "兵圣"],
    "范蠡": ["陶朱公", "少伯"],
    "管仲": ["管夷吾", "仲父"],
    "屈原": ["屈平", "灵均"],
    "商鞅": ["卫鞅", "公孙鞅", "商君"],
    "孙膑": ["孙伯灵"],
    "墨子": ["墨翟"],
    "韩非": ["韩非子"],
    "孟子": ["孟轲", "亚圣"],
    "荀子": ["荀况", "孙卿"],
    "庄子": ["庄周"],
    "李斯": ["李通古"],
    "赵高": ["赵公子"],
    "项羽": ["项籍", "西楚霸王"],
    "刘邦": ["刘季", "汉高祖", "汉高帝"],
    "韩信": ["淮阴侯", "兵仙", "国士无双"],
    "张良": ["张子房", "子房", "留侯"],
    "萧何": ["酂侯", "萧相国"],
    "范增": ["亚父"],
    "张骞": ["博望侯"],
    "司马迁": ["太史公", "司马子长"],
    "董仲舒": ["董子"],
    "刘秀": ["汉光武帝", "光武帝", "刘文叔"],
    "蔡伦": ["蔡敬仲"],
    "张衡": ["张平子"],
    "曹操": ["曹孟德", "孟德", "魏武帝"],
    "诸葛亮": ["诸葛孔明", "孔明", "卧龙", "武侯"],
    "关羽": ["关云长", "云长", "关公"],
    "张飞": ["张翼德", "翼德"],
    "周瑜": ["周公瑾", "公瑾"],
    "司马懿": ["司马仲达", "仲达"],
    "祖逖": ["祖士稚"],
    "王导": ["王茂弘"],
    "谢安": ["谢安石", "安石"],
    "刘裕": ["宋武帝", "刘寄奴"],
    "北魏孝文帝": ["拓跋宏", "元宏"],
    "祖冲之": ["祖文远"],
    "郦道元": ["郦善长"],
    "李煜": ["李后主", "南唐后主", "李重光"],
    "杨坚": ["隋文帝"],
    "杨广": ["隋炀帝"],
    "魏徵": ["魏征", "魏玄成"],
    "李白": ["李太白", "太白", "青莲居士", "诗仙"],
    "杜甫": ["杜子美", "子美", "少陵野老", "诗圣"],
    "玄奘": ["唐僧", "唐三藏", "玄奘法师"],
    "韩愈": ["韩退之", "退之", "韩昌黎"],
    "柳宗元": ["柳子厚", "子厚", "柳河东"],
    "赵普": ["赵则平"],
    "寇准": ["寇平仲"],
    "范仲淹": ["范希文", "范文正"],
    "王安石": ["王介甫", "介甫", "半山", "王荆公"],
    "司马光": ["司马君实", "君实", "司马温公"],
    "沈括": ["沈存中", "梦溪丈人"],
    "苏轼": ["苏东坡", "东坡居士", "苏子瞻", "子瞻"],
    "欧阳修": ["欧阳永叔", "永叔", "醉翁", "六一居士"],
    "苏洵": ["苏老泉", "老泉"],
    "苏辙": ["苏子由", "子由"],
    "曾巩": ["曾子固", "子固"],
    "岳飞": ["岳鹏举", "鹏举", "岳武穆"],
    "秦桧": ["秦会之"],
    "文天祥": ["文宋瑞", "文山"],
    "朱熹": ["朱元晦", "晦庵", "朱子"],
    "陆游": ["陆务观", "务观", "放翁"],
    "辛弃疾": ["辛幼安", "幼安", "稼轩"],
    "关汉卿": ["关已斋", "已斋叟"],
    "郭守敬": ["郭若思"],
    "耶律楚材": ["耶律晋卿"],
    "马可·波罗": ["马可波罗", "马可孛罗"],
    "郑和": ["三宝太监", "三保太监", "郑三保"],
    "张居正": ["张叔大", "张太岳"],
    "王阳明": ["王守仁", "阳明先生", "王伯安"],
    "于谦": ["于廷益", "于少保"],
    "戚继光": ["戚元敬", "戚少保"],
    "李时珍": ["李东璧"],
    "徐霞客": ["徐弘祖", "徐振之"],
    "宋应星": ["宋长庚"],
    "林则徐": ["林少穆", "林文忠"],
    "曾国藩": ["曾涤生", "曾文正"],
    "李鸿章": ["李少荃", "李文忠"],
    "慈禧": ["慈禧太后", "西太后", "叶赫那拉氏"],
    "曹雪芹": ["曹霑", "曹梦阮"],
    "蒲松龄": ["蒲留仙", "聊斋先生"],
    "吴敬梓": ["吴敏轩"],
    "纳兰性德": ["纳兰容若", "容若"],
    "纪昀": ["纪晓岚", "纪文达"],
    "袁枚": ["袁子才", "随园主人"],
    "郑燮": ["郑板桥", "板桥"],
    "龚自珍": ["龚定庵"],
    "胡雪岩": ["胡光墉"],
    "张謇": ["张季直"],
    "盛宣怀": ["盛杏荪"],
    "姜太公": ["吕尚", "姜子牙", "太公望", "姜尚"],
    "伯益": ["益", "大费"],
    "皋陶": ["咎繇"],
    "周公旦": ["周公", "姬旦", "叔旦"],
    "召公奭": ["召公", "姬奭"],
    "妇好": [],
    "比干": ["王子比干"],
    "箕子": ["胥余"],
    "傅说": ["傅岩"],
    "伊尹": ["伊挚", "阿衡"],
    "仓颉": ["苍颉"],
    "伶伦": ["泠伦"],
    "百里奚": ["百里傒"],
    "子产": ["公孙侨"],
    "吕不韦": ["吕子"],
    "李悝": ["李克"],
    "吴起": ["吴子"],
    "苏秦": ["苏季子"],
    "张仪": ["张子"],
    "白起": ["公孙起"],
    "蒙恬": ["蒙公"],
    "王翦": ["王频阳"],
    "陈胜": ["陈涉"],
    "吴广": ["吴叔"],
    "扶苏": ["公子扶苏"],
    "英布": ["黥布"],
    "彭越": ["彭仲"],
    "卫青": ["卫仲卿"],
    "霍去病": ["霍票姚", "冠军侯"],
    "班超": ["班仲升"],
    "张角": ["张天师"],
    "陆逊": ["陆伯言", "伯言"],
    "羊祜": ["羊叔子", "叔子"],
    "杜预": ["杜元凯", "元凯"],
    "石崇": ["石季伦", "季伦"],
    "刘渊": ["刘元海"],
    "桓温": ["桓元子"],
    "陈庆之": ["陈子云"],
    "宇文泰": ["宇文黑獭"],
    "宇文恺": ["宇文安乐"],
    "高颎": ["高昭玄"],
    "冯道": ["冯可道", "长乐老"],
    "野利仁荣": [],
    "陆秀夫": ["陆君实"],
}

# 少数人物的自动候选偏少，这里手工补足（同样要求不出现答案名、全局唯一）
MANUAL_CLUES = {
    "孙膑": [
        (3, "早年与庞涓同门学兵法，后遭同门嫉害"),
        (3, "被处以膑刑去膝，故以此刑名见称于世"),
        (3, "装疯避祸，后被齐国使者秘密载归"),
        (2, "指挥田忌赛马，以上驷对中驷之策取胜"),
        (2, "桂陵、马陵两役设伏，围魏救赵"),
        (2, "撰兵法十三篇，竹简于银雀山汉墓重见天日"),
        (1, "代表事迹：围魏救赵、减灶诱敌、马陵伏击"),
        (1, "身份／官职为 齐国军师"),
    ],
    # 以下人物自动生成的「易」级线索只有 1 条，补足第 2 条
    "庄子": [
        (1, "代表事迹：著《逍遥游》《齐物论》，与惠施濠梁之辩"),
        (1, "寓言庖丁解牛、庄周梦蝶皆出其书"),
    ],
    "韩非": [
        (1, "代表事迹：法家集大成，主张法术势合一"),
        (1, "著《五蠹》《说难》，秦王读其书而叹"),
    ],
    "蔡伦": [
        (1, "代表事迹：改进造纸术，制成蔡侯纸"),
        (1, "以树皮、麻头、破布、渔网为原料造纸"),
    ],
    "黄巢": [
        (1, "代表事迹：唐末起兵攻入长安，建国号大齐"),
        (1, "咏菊名句『满城尽带黄金甲』相传出其手"),
    ],
    "张居正": [
        (1, "代表事迹：推行一条鞭法与考成法"),
        (1, "万历初年任首辅，主持十年新政"),
    ],
    "徐霞客": [
        (1, "代表事迹：三十余年游历，逐日记述山川地貌"),
        (1, "考察岩溶地貌，辨明长江正源为金沙江"),
    ],
}

# ---------- 文本工具 ----------
NUM_HEAD = re.compile(r"^\s*(?:[0-9]+[.、．)）]\s*|[①②③④⑤⑥⑦⑧⑨⑩]\s*)")
LABEL = re.compile(r"^\s*([^：:]{1,12})[：:]\s*(.+)$")
PUNCT = re.compile(r"[\s，,。．\.、；;：:！!？?\"'“”‘’「」『』《》〈〉（）()【】\[\]{}—\-–~～｜|·/\\]")


def norm(t):
    return PUNCT.sub("", t or "")


def strip_label(line):
    """返回 (标签, 正文)；没有标签时返回 ('', 原文)"""
    t = NUM_HEAD.sub("", (line or "").strip())
    m = LABEL.match(t)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return "", t.strip()


def clean_text(t):
    t = NUM_HEAD.sub("", (t or "").strip())
    t = t.replace("\n", "").replace("\r", "")
    t = re.sub(r"\s+", "", t)
    t = t.strip("。；;，,、 ")
    t = t.replace("此人此人", "此人")
    return t


def ok_length(t):
    return 6 <= len(t) <= 48


# ---------- 姓名与别名 ----------
def split_name(raw):
    """'姜太公（吕尚）' -> 主名 '姜太公', 额外别名 ['吕尚', 全名]"""
    raw = raw.strip()
    m = re.match(r"^(.+?)[（(](.+?)[）)]$", raw)
    if m:
        main, inside = m.group(1).strip(), m.group(2).strip()
        extra = [raw, main, inside]
        for part in re.split(r"[·、,，/]", inside):
            if part.strip():
                extra.append(part.strip())
        return main, extra
    return raw, [raw]


def forbid_terms(main, raw_aliases):
    """提示里不允许出现的词：全名、括号别名、以及三字以上人名的后半段"""
    out = set()
    for x in raw_aliases:
        if len(norm(x)) >= 2:
            out.add(norm(x))
    if len(main) >= 3:
        tail = norm(main[1:])
        if len(tail) >= 2:
            out.add(tail)
        if len(main) >= 4:
            tail2 = norm(main[2:])
            if len(tail2) >= 2:
                out.add(tail2)
    return out


# ---------- 从单个人物生成候选线索 ----------
LEVEL3 = ("出生", "家世", "少年", "出仕", "转折", "从军", "早年", "少年", "晚年", "结局")
LEVEL1 = ("代表", "身份", "事迹")


def level_of(label, default):
    if not label:
        return default
    if any(k in label for k in LEVEL3):
        return 3
    if "影响" in label or "评价" in label:
        return 1
    if "功绩" in label or "贡献" in label or "职官" in label:
        return 2
    return default


LIFE_TPL = {
    "生卒": ("生卒年约为 {x}", 3),
    "出生地": ("出生于 {x}", 3),
    "时代": ("主要活动于 {x}", 2),
    "期间君主": ("当时在位的君主是 {x}", 2),
}


def candidates(n, main, forbids):
    out = []  # (level, text)

    def add(level, text):
        t = clean_text(text)
        if not ok_length(t):
            return
        if "此人" in t or "？？" in t or "未详" in t:
            return
        nt = norm(t)
        if not nt or len(nt) < 6:
            return
        if any(f in nt for f in forbids):
            return
        out.append((level, t))

    # 1) 生平五段：出生/少年/转折 = 难，功绩 = 中，影响 = 易
    for line in (n.get("bio") or "").split("\n"):
        label, text = strip_label(line)
        if not text:
            continue
        add(level_of(label, 2), text)

    # 2) 生卒 / 籍贯 / 时代 / 在位君主：带标签用模板，纯分隔符按位置推断
    life = n.get("bioLife") or ""
    for idx, part in enumerate(re.split(r"[｜|]", life)):
        label, text = strip_label(part)
        if not text:
            continue
        if label in LIFE_TPL:
            tpl, lv = LIFE_TPL[label]
            add(lv, tpl.format(x=text))
        else:
            if idx == 0 and re.search(r"\d", text):
                add(3, "生卒年为 " + text)
            elif idx == 1:
                add(3, "籍贯为 " + text)
            else:
                add(2, "主要活动于 " + text)

    # 3) 重要贡献（每条一行）= 中
    for line in (n.get("bioContribution") or "").split("\n"):
        label, text = strip_label(line)
        if text:
            add(2, text)

    # 4) 事迹 / 身份 = 易（最容易锁定人物）
    deed = clean_text(n.get("deed") or "")
    if deed and ok_length(deed) and not any(f in norm(deed) for f in forbids):
        out.append((1, "代表事迹：" + deed))
    role = clean_text(n.get("role") or "")
    if role and 2 <= len(role) <= 30 and not any(f in norm(role) for f in forbids):
        out.append((1, "身份／官职为 " + role))

    # 5) 手工补充（对自动候选偏少的知名人物）
    for lv, text in MANUAL_CLUES.get(main, []):
        add(lv, text)
    return out


# ---------- 组装题库 ----------
def main():
    grouped = collections.OrderedDict()
    for d in DYNASTIES:
        if d["id"] in EXCLUDE_DYN:
            continue
        for idx, n in enumerate(d.get("notables", [])):
            raw = n.get("name", "").strip()
            if not raw or "文化" in raw:
                continue
            person_name, raw_aliases = split_name(raw)
            # 字号 / 尊称（EXTRA_ALIAS）不参与过滤：它们是有价值的线索，且玩家
            # 用一条提示就猜中本来就是设计中的「最高奖励」情形。
            # 这里只严格排除人物真名、括号别名与三字人名的后半段。
            forbids = forbid_terms(person_name, raw_aliases)
            g = grouped.setdefault(person_name, {
                "name": person_name,
                "rawAliases": raw_aliases,
                "entries": [],
            })
            g["rawAliases"] = list(dict.fromkeys(g["rawAliases"] + raw_aliases))
            g["entries"].append({
                "dyn": d["id"], "card": d["id"] + ":" + str(idx),
                "cands": candidates(n, person_name, forbids),
            })

    all_names = {norm(k) for k in grouped}
    people = []
    used_text = {}
    errors = []
    skipped = []

    for pname, g in grouped.items():
        # 同名人物（如韩信同时见于楚汉 / 西汉）：合并全部候选，选候选最多的朝代作为发卡来源
        cands = []
        for e in g["entries"]:
            cands.extend(e["cands"])
        if not cands:
            skipped.append(pname)
            continue
        best = max(g["entries"], key=lambda e: len(e["cands"]))

        # 全局唯一：同一条文本只归第一个人物
        clues = []
        by_level = {3: [], 2: [], 1: []}
        for lv, text in cands:
            key = norm(text)
            if not key or key in used_text:
                continue
            if len(by_level[lv]) >= 2:   # 每级 2 条 → 每人 6 条，恰好可出 2 题不重样
                continue
            used_text[key] = pname
            by_level[lv].append(text)
        for lv in (3, 2, 1):
            for text in by_level[lv]:
                clues.append({"level": lv, "text": text})

        if len(clues) < 6 or not all(by_level[k] for k in (3, 2, 1)):
            # 线索不足的人物不进题库，避免玩到一半凑不出由难到易的三条
            for c in clues:
                used_text.pop(norm(c["text"]), None)
            skipped.append(pname)
            continue

        aliases = []
        for x in g["rawAliases"] + EXTRA_ALIAS.get(pname, []):
            x = x.strip()
            if not x or x in aliases:
                continue
            if norm(x) == norm(pname):
                continue
            if norm(x) in all_names and norm(x) != norm(pname):
                continue   # 别名撞了别的答案，判分时会歧义，丢弃
            aliases.append(x)

        pid = best["dyn"] + ":" + best["card"].split(":")[1] + ":" + str(len(people))
        item = {
            "id": pid,
            "name": pname,
            "aliases": aliases,
            "dyn": best["dyn"],
            "dynName": VALID_DYN[best["dyn"]],
            "card": best["card"],
            "clues": [],
        }
        for k, c in enumerate(clues):
            item["clues"].append({"id": pid + ":c" + str(k), "level": c["level"], "text": c["text"]})
        people.append(item)

    # ---------- 校验 ----------
    seen_clue_id, seen_text, seen_name = set(), {}, set()
    for p in people:
        if norm(p["name"]) in seen_name:
            errors.append("人名重复：" + p["name"])
        seen_name.add(norm(p["name"]))
        if p["dyn"] not in VALID_DYN:
            errors.append("朝代 id 非法：" + p["dyn"])
        dyn = next((d for d in DYNASTIES if d["id"] == p["dyn"]), None)
        cidx = int(p["card"].split(":")[1])
        if not dyn or cidx >= len(dyn.get("notables", [])):
            errors.append("卡牌 id 非法：" + p["card"])
        if len(p["clues"]) < 6:
            errors.append("线索不足 6 条：" + p["name"])
        levels = [c["level"] for c in p["clues"]]
        if not (3 in levels and 2 in levels and 1 in levels):
            errors.append("难度分级不全：" + p["name"])
        core = forbid_terms(p["name"], [p["name"]] + [x for x in p["aliases"] if x not in EXTRA_ALIAS.get(p["name"], [])])
        for c in p["clues"]:
            if c["id"] in seen_clue_id:
                errors.append("线索 id 重复：" + c["id"])
            seen_clue_id.add(c["id"])
            key = norm(c["text"])
            if key in seen_text:
                errors.append("提示文本重复：%s / %s :: %s" % (seen_text[key], p["name"], c["text"]))
            seen_text[key] = p["name"]
            if not (6 <= len(c["text"]) <= 52):
                errors.append("提示长度异常：" + c["text"])
            if any(f in key for f in core if len(f) >= 2):
                errors.append("提示泄露答案：%s :: %s" % (p["name"], c["text"]))

    if not people:
        errors.append("题库为空")
    if errors:
        print("校验失败（%d 项）：" % len(errors))
        for e in errors[:40]:
            print("  -", e)
        sys.exit(1)

    data = {
        "meta": {
            "people": len(people),
            "clues": len(seen_text),
            "source": "js/data.js notables（自动生成，勿手改）",
            "levels": {"3": "难", "2": "中", "1": "易"},
        },
        "people": people,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* ============================================================\n")
        f.write("   趣味历史乐园 · 线索推理题库（由 build_clue_data.py 生成，请勿手改）\n")
        f.write("   %d 位人物 / %d 条互不重复的线索，难度 3 难 → 2 中 → 1 易。\n" % (len(people), len(seen_text)))
        f.write("   每人至少 6 条，出题时从「未用过的线索」里按难度依次取 3 条。\n")
        f.write("   要调整线索：编辑 build_clue_data.py 后重新运行。\n")
        f.write("   ============================================================ */\n")
        f.write("window.FunClueData = ")
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write(";\n")

    dist = collections.Counter(c["level"] for p in people for c in p["clues"])
    print("生成成功：%d 位人物，%d 条线索（难 %d / 中 %d / 易 %d）" %
          (len(people), len(seen_text), dist[3], dist[2], dist[1]))
    print("跳过（线索不足）：%d 位：%s" % (len(skipped), "、".join(skipped[:20])))
    print("输出：%s（%.1f KB）" % (OUT, os.path.getsize(OUT) / 1024))
    print("\n抽样：")
    for p in people[:3]:
        print("【%s】%s" % (p["dynName"], p["name"]))
        for c in p["clues"][:4]:
            print("   %d | %s" % (c["level"], c["text"]))


if __name__ == "__main__":
    main()
