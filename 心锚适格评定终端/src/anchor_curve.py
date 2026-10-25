"""心锚等级曲线：把「非 1 级」心锚的界面显示值折算回 1 级等价值。

数据来源
--------
游戏二进制 ``ExpConfigSource.bin`` 的 ``UpgradeAttrRatio``（L1 = 0，满级 = 100000）。
心锚通过 ``AccessorySource.ExpConfigID`` 引用它：11 → 上限 10 级、12 → 20、13 → 30。
三张表都是「前 N-2 级等差 + 最后两级各补半步」，等差步长 = floor(100000/(N-2))：

    N=10  12000 × 7  + 8000  + 8000
    N=20   5555/5556 × 17 + 2778 + 2778
    N=30   3571/3572 × 27 + 1786 + 1787

为什么不是 (L-1)/(N-1)
----------------------
均匀插值会让 L29 = 100000×28/29 = 96552，实测 L29 = 98214（比它高 1.7%）。
用 2026-10-25 的 32 张「度假指南 1→30 级」截图逐级对拍可定位到唯一解：
只有上面这张整数表能同时解释 30 组预览增益（含「+7 级护甲显示 19 而不是 20」——
因为真实 1 级值是 34.2 而非档位表里的 34，79.8×0.25 = 19.95 → 19）。

显示取整
--------
整数词条（点）向下取整；百分比词条四舍五入到两位小数。所以同一个心锚的
「卡片值」与「+N 级预览增益」并不是严格相加关系（真实值各自取整），
两者相差 1 个最低位属正常，不影响档位判定。

满级值随 N 变化（关键）
----------------------
凤凰表 ``词条数值`` 只有「1级 / 30级」两列，也就是说它给的满级值是 **N=30** 的。
但满级值本身是跟可强化上限走的。用 ``心锚词条数据库.xlsx / 淬炼档位精确值``
的 2472 行统计「满级 / 1级」倍数，规律非常干净：

    N=10（普通）→ 2.0        N=20（优秀）→ 2.5        N=30（稀有）→ 10/3

所以非 30 上限的心锚，满级端点要按 ``GROWTH[N] / (10/3)`` 等比缩放
（N=10 → ×0.6，N=20 → ×0.75），否则会系统性高估端点、把档位判高。
"""
import math
from decimal import Decimal, ROUND_HALF_UP

# 精确比例表（1 级 = 0，满级 = 100000），下标 = 等级 - 1
RATIO = {
    10: [0, 12000, 24000, 36000, 48000, 60000, 72000, 84000, 92000, 100000],
    20: [0, 5555, 11111, 16666, 22222, 27777, 33333, 38888, 44444, 50000,
         55555, 61111, 66666, 72222, 77777, 83333, 88888, 94444, 97222, 100000],
    30: [0, 3571, 7142, 10714, 14285, 17857, 21428, 25000, 28571, 32142,
         35714, 39285, 42857, 46428, 50000, 53571, 57142, 60714, 64285, 67857,
         71428, 75000, 78571, 82142, 85714, 89285, 92857, 96428, 98214, 100000],
}

# 每个心锚的可强化上限 N（AccessorySource.ExpConfigID → 11:10 / 12:20 / 13:30）。
# 凤凰表的心锚百科没有这一列，只能随程序内置；表外的新心锚会退回按 30 级试算。
LEVELS = {
    '仿制塑像':10,'占星图解':10,'嚎哭人像':10,'地下仓库钥匙':10,'城市贴画':10,'士兵棋子':10,'实习生密钥':10,'封尘相册':10,'幼狮木雕':10,
    '探员私人钥匙':10,'攻略大图鉴':10,'爆炸头雕':10,'爱伦的一天':10,'狼犬木雕':10,'看守日记':10,'秘典残页':10,'红宝石钥匙':10,'绿宝石钥匙':10,
    '蓝宝石钥匙':10,'血色钥匙':10,'陈旧宝藏钥匙':10,'雀姬奇物':10,'雏鹰木雕':10,'雕刻石怪':10,'魔术入门':10,'占星探究':20,'孤狼石雕':20,
    '掷弹兵棋子':20,'朱红宝石钥匙':20,'深蓝宝石钥匙':20,'爱伦的家庭':20,'狮子石雕':20,'猎鹰石雕':20,'秘典印本':20,'翠绿宝石钥匙':20,
    '院生密钥':20,'魔术大全':20,'一万个问题':30,'主管密钥':30,'乐园宣传册':30,'伊甸印记':30,'伊甸塑像':30,'优秀员工奖':30,'冰雕王座':30,
    '剑石之钥':30,'占星起源':30,'天文馆钥匙':30,'天枰庇护之钥':30,'头狼金雕':30,'奥秘之眼':30,'始源之书':30,'宝藏挂坠':30,'寒霜王冠':30,
    '山野之美':30,'度假指南':30,'指挥官棋子':30,'无眠舞者':30,'月龙勺':30,'海神文录':30,'灵渡伴侣':30,'灾祸指针':30,'爱伦的葬礼':30,
    '狮王金雕':30,'猫咪日记':30,'界外之钥':30,'禁闭公寓钥匙':30,'秘典原本':30,'秘境之钥':30,'精雕红钻钥匙':30,'精雕绿钻钥匙':30,
    '精雕蓝钻钥匙':30,'终极魔术':30,'美味佳肴':30,'翠玉包菜':30,'老鹰金雕':30,'苍炎狼徽':30,'谎言人偶':30,'贤人手迹':30,'金牛塑像':30,
    '鎏金奖杯':30,'钟楼卫兵':30,'隐秘花园钥匙':30,'魔王组曲':30,'齿轮密钥':30,
}

# 这些获取途径的心锚词条固定、数值直接给到满值，遇到不跑曲线，直接记满分。
FIXED_ORIGINS = ('活动商店','往期活动复刻商店','限时累充回馈')
FIXED_LABEL = '活动 / 限时累充心锚'


# 满级 / 1级 倍数。统计自 心锚词条数据库.xlsx / 淬炼档位精确值（2472 行）。
GROWTH = {10: 2.0, 20: 2.5, 30: 10.0 / 3.0}
GROWTH_BASE = GROWTH[30]      # 表内 values30 对应的倍数


def levels_of(name):
    """该心锚的可强化上限 N；不在表内返回 None。"""
    return LEVELS.get(name)


def is_fixed_anchor(origin):
    """活动商店 / 往期活动复刻 / 限时累充回馈：数值固定为满值，无需计算。"""
    text = origin or ''
    return any(key in text for key in FIXED_ORIGINS)


def ratio_of(n, level):
    """等级 → 0~1 的成长比例。超出表长时按端点处理。"""
    table = RATIO.get(int(n)) or RATIO[30]
    index = max(1, min(int(level), len(table))) - 1
    return table[index] / 100000.0


def predict(v1, vn, level, n):
    """由 1 级值 / 满级值推当前等级的（未取整）数值。"""
    return v1 + (vn - v1) * ratio_of(n, level)


def display(value, unit):
    """界面显示取整：整数向下取整，百分比保留两位（四舍五入）。"""
    if unit == 'percent':
        return float(Decimal(repr(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))
    return int(math.floor(value + 1e-9))


def tolerance(unit, value):
    """折算允许的显示误差。表内数值本身是取整后的显示值，整数误差更大。"""
    return 0.015 + 0.001 * abs(value) if unit == 'percent' else 0.5 + 0.012 * abs(value)


def _tiers(rule, n=30):
    """该规则每个档位的 (1级值, 该 N 下的满级值, 档位)。

    表内 ``values30`` 是「30 级满级值」，其它 N 按 满级/1级 倍数等比缩放：
    N=10 → ×0.6、N=20 → ×0.75（相对 10/3）。缺 30 级列时按不成长处理。
    """
    mature = {x['tier']: float(x['value']) for x in (rule.get('values30') or [])}
    scale = GROWTH.get(n, GROWTH_BASE) / GROWTH_BASE
    out = []
    for x in sorted(rule['values'], key=lambda v: v['tier']):
        v1 = float(x['value'])
        peak = mature.get(x['tier'])
        out.append((v1, v1 if peak is None else peak * scale, x['tier']))
    return out


def estimate_level1(rules, slot, pos, stat, unit, value, level, n_hint=None):
    """把「level 级的显示值」折算成「1 级等价值」。

    返回 None 表示无需或无法折算（等级 ≤ 1 / 数值为空 / 没有匹配规则 / 档位全不吻合）。
    否则返回 dict：
        value   折算出的 1 级等价值（字符串，沿用表内文本形式）；未吻合时为 None
        tier    命中的档位（1..6），未吻合时为 None
        variant 命中的规则列（同名词条可能有 1/2 两个变体）
        n       实际使用的可强化上限
        residual 预测显示值与实测显示值之差
        ties    同样吻合的其他档位（有值即表示档位存在歧义）
        level / observed  原始输入，便于界面回显
    """
    try:
        observed = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(observed) or observed <= 0:
        return None
    if level is None or int(level) <= 1:
        return None
    level = int(level)
    matched = [r for r in rules
               if (r['slot'], r['pos'], r['stat'], r['unit']) == (slot, pos, stat, unit)]
    if not matched:
        return None
    if pos == 4 and not any(r.get('values30') for r in matched):
        return None
    if not any(r.get('values30') for r in matched):
        # 没有 30 级列就没有满级端点，曲线退化成「不成长」——
        # 那等于把非 1 级的显示值当成 1 级值，会虚高，宁可不折算。
        return {'value': None, 'tier': None, 'variant': None, 'n': n_hint, 'residual': None,
                'ties': [], 'loose': False, 'reason': 'nocurve',
                'level': int(level), 'observed': observed, 'unit': unit}
    # 首选心锚自己的 N；表外心锚依次试 30/20/10，取吻合最好的那个。
    order = [n_hint] if n_hint in RATIO else []
    order += [n for n in (30, 20, 10) if n not in order]
    tol = tolerance(unit, observed)
    best = None
    for n in order:
        hits = []
        for rule in matched:
            for v1, vn, tier in _tiers(rule, n):
                predicted = display(predict(v1, vn, level, n), unit)
                hits.append((abs(predicted - observed), tier, rule['variant'], v1, predicted))
        hits.sort(key=lambda x: x[0])
        top = hits[0]
        if best is None or top[0] < best[0] - 1e-12:
            best = (top[0], top[1], top[2], top[3], n, hits)
        if top[0] <= tol:
            break
    residual, tier, variant, v1, n, hits = best
    ties = sorted({h[1] for h in hits if h[0] <= tol})
    loose = False
    if residual > tol:
        # 非 30 上限的满级值只能按倍数近似（±2~3%），残差可能略超容差；
        # 只要相对次优档位优势足够明显（≥3 倍），仍按命中处理，避免误报「对不上」。
        rival = next((h[0] for h in hits if h[1] != tier), None)
        if n != 30 and rival is not None and rival > max(residual * 3, tol):
            loose = True
        else:
            # 对不上任何档位：不猜，交给原有流程按「数值超范围」复核。
            return {'value': None, 'tier': None, 'variant': variant, 'n': n, 'residual': residual,
                    'ties': [], 'level': level, 'observed': observed, 'unit': unit}
    return {'value': _text(v1, unit), 'tier': tier, 'variant': variant, 'n': n,
            'residual': residual, 'ties': [t for t in ties if t != tier], 'loose': loose,
            'level': level, 'observed': observed, 'unit': unit}


def _text(value, unit):
    """沿用表格里的文本习惯：百分比去掉多余零，整数不带小数。"""
    if unit == 'percent':
        text = ('%.4f' % value).rstrip('0').rstrip('.')
        return text or '0'
    text = ('%.2f' % value).rstrip('0').rstrip('.')
    return text or '0'


def describe(level, n):
    """给界面用的一句话说明。"""
    return '按 %d 级上限曲线从 %d 级数值折算' % (n, level)