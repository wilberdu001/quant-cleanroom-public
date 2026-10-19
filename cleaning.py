# %% [markdown]
# # Quant Cleanroom：分钟 OHLCV 研究准备
# 同一份 Python 代码用于网页、Jupyter Notebook 和 VS Code。
# 数据字段 timestamp 是开盘时间；所有截止时刻均使用 UTC 毫秒。
# %%
import io
import json
import sys
# Windows 终端可能默认使用西文编码；支持时明确采用 UTF-8 输出中文。
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')  # 使用无窗口后端：浏览器、服务器、Notebook 均可保存图表。
import matplotlib.pyplot as plt
from matplotlib.dates import DateFormatter

# STEP 1
def normalize(raw):
    """标准化 schema；保留缺失，不把空值当作零。"""
    df = pd.DataFrame(raw).copy(deep=True)
    # 必需字段即使整列缺失也建立，后续质量规则将隔离这些记录。
    for col in ['timestamp', 'symbol', 'open', 'high', 'low', 'close', 'volume']:
        if col not in df:
            df[col] = np.nan
    if 'id' not in df:
        df['id'] = np.arange(1, len(df) + 1)
    # 数字时间戳按数量级判断秒/毫秒；带时区 ISO 字符串统一为 UTC。
    numeric = pd.to_numeric(df['timestamp'], errors='coerce')
    timestamps = numeric.where(numeric.abs() >= 1e11, numeric * 1000).astype(float)
    is_text = numeric.isna() & df['timestamp'].notna()
    if is_text.any():
        parsed = pd.to_datetime(df.loc[is_text, 'timestamp'], utc=True, errors='coerce', format='mixed')
        timestamps.loc[is_text] = [t.timestamp() * 1000 if pd.notna(t) else np.nan for t in parsed]
    df['timestamp'] = timestamps
    # errors='coerce' 将空串、非数字转换为 NaN，而不是填成可交易价格。
    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    df['symbol'] = df['symbol'].fillna('').astype(str).str.strip().str.upper()
    df['flags'] = [[] for _ in range(len(df))]  # 每行独立列表，避免共享可变对象。
    if 'closed' not in df:
        df['closed'] = True
    return df.reset_index(drop=True)

# STEP 2
def deduplicate(df, options):
    """过滤尚不可观测的 K 线；按最先到达版本去重。"""
    x = df.copy(deep=True)
    # 开盘时间 + 1 分钟必须不晚于采集截止时间，防止未收盘数据进入研究。
    unfinished = x['closed'].eq(False) | ((x['timestamp'] + 60_000) > options['asOf'])
    rejected_open = x.loc[unfinished].assign(reason='未收盘 / 尚不可用')
    eligible = x.loc[~unfinished].copy()
    # 在排序之前去重，保留原始到达顺序中的第一条，而不是事后最佳版本。
    duplicate = eligible.duplicated(['symbol', 'timestamp'], keep='first')
    rejected_dup = eligible.loc[duplicate].assign(reason='重复主键：保留首条到达记录')
    kept = eligible.loc[~duplicate].sort_values(['symbol', 'timestamp'], kind='stable')
    rejected = pd.concat([rejected_open, rejected_dup], ignore_index=True)
    return kept.reset_index(drop=True), rejected

# STEP 3
def validate(df):
    """执行硬约束；记录首个失败原因，隔离后等待上游核验。"""
    x = df.copy(deep=True)
    reason = pd.Series('', index=x.index, dtype='object')
    values = x[['open', 'high', 'low', 'close', 'volume']]
    # 时间戳必须有限、按分钟对齐；标的不能为空。
    schema_bad = x['symbol'].eq('') | ~np.isfinite(x['timestamp']) | x['timestamp'].mod(60_000).ne(0)
    finite_bad = ~np.isfinite(values).all(axis=1)
    sign_bad = x[['open', 'high', 'low', 'close']].min(axis=1).le(0) | x['volume'].lt(0)
    # High 必须包住所有价格，Low 必须低于其余价格。
    ohlc_bad = x['high'].lt(x[['open', 'close', 'low']].max(axis=1)) | x['low'].gt(x[['open', 'close', 'high']].min(axis=1))
    for mask, text in [(schema_bad, '无效 symbol / 时间戳未对齐分钟'),
                       (finite_bad, '缺失值 / 非有限数值'),
                       (sign_bad, '价格必须为正；成交量不能为负'),
                       (ohlc_bad, 'OHLC 约束冲突')]:
        reason.loc[mask & reason.eq('')] = text  # 固定规则优先级，结果可复现。
    rejected = x.loc[reason.ne('')].assign(reason=reason[reason.ne('')])
    return x.loc[reason.eq('')].reset_index(drop=True), rejected.reset_index(drop=True)

# STEP 4
def detect_gaps(df):
    """检测窗口内部缺失分钟；不前向填充价格与成交量。"""
    x = df.copy(deep=True)
    previous = x.groupby('symbol', sort=False)['timestamp'].shift(1)
    missing = ((x['timestamp'] - previous) / 60_000 - 1).clip(lower=0).fillna(0).astype(int)
    x['gapMinutes'] = missing
    x['flags'] = [list(flags) + (['时间缺口'] if n else []) for flags, n in zip(x['flags'], missing)]
    gaps = []
    for idx in x.index[missing.gt(0)]:
        gaps.append({'symbol': x.at[idx, 'symbol'], 'after': float(previous.at[idx]),
                     'before': float(x.at[idx, 'timestamp']), 'missing': int(missing.at[idx])})
    # 不推断输入窗口之外的缺失，不把股票午休/休市当作加密市场日历。
    return x, gaps

# STEP 5
def flag_outliers(df, options):
    """用过去的收益校准 MAD；异常仅标记，价格保持原样。"""
    x = df.copy(deep=True)
    previous_close = x.groupby('symbol', sort=False)['close'].shift(1)
    previous_time = x.groupby('symbol', sort=False)['timestamp'].shift(1)
    contiguous = x['timestamp'].sub(previous_time).eq(60_000)
    x['ret'] = np.log(x['close'] / previous_close).where(contiguous)
    x['robustZ'] = np.nan
    x['flags'] = x['flags'].map(list)
    for _, group in x.groupby('symbol', sort=False):
        history = []
        for idx in group.index:
            current = x.at[idx, 'ret']
            if pd.isna(current):
                continue  # 非连续分钟不计算跨缺口收益。
            # 先评分，再把当前收益加入窗口：当前值和未来值不能参与基准估计。
            if len(history) >= 20:
                past = np.asarray(history[-60:])
                median = np.median(past)
                mad = np.median(np.abs(past - median))
                score = abs(current - median) / max(1.4826 * mad, 1e-8)
                x.at[idx, 'robustZ'] = score
                if score > options['threshold']:
                    x.at[idx, 'flags'] = x.at[idx, 'flags'] + ['异常收益']
            history.append(float(current))
            history = history[-60:]
    return x

# STEP 6
def features(df):
    """滞后信号 + 过去 20 个连续有效收益的风险估计。"""
    x = df.copy(deep=True)
    x['signalLag1'] = np.nan
    x['vol20'] = np.nan
    x['tradable'] = False
    for _, group in x.groupby('symbol', sort=False):
        history, previous = [], None
        for idx in group.index:
            row = x.loc[idx]
            contiguous = previous is not None and row['timestamp'] - previous['timestamp'] == 60_000
            if not contiguous:
                history = []  # 缺口后重新暖机，不能跨缺口拼接风险窗口。
            current_bad = '异常收益' in row['flags']
            previous_bad = previous is not None and '异常收益' in previous['flags']
            if contiguous and not current_bad and not previous_bad:
                x.at[idx, 'signalLag1'] = previous['ret']
                # 先计算历史波动，再追加当前收益；ddof=1 是样本标准差。
                if len(history) >= 20:
                    x.at[idx, 'vol20'] = np.std(history[-20:], ddof=1)
                x.at[idx, 'tradable'] = pd.notna(x.at[idx, 'signalLag1']) and pd.notna(x.at[idx, 'vol20'])
            if pd.notna(row['ret']) and not current_bad:
                history.append(float(row['ret']))
                history = history[-20:]
            else:
                history = []  # 异常后也重置窗口，避免尖峰污染风险估计。
            previous = row
    # tradable 仅指数据门槛通过；真实成交还需要延迟、点差、滑点和费用模型。
    return x

# PIPELINE
def records(df):
    """DataFrame 转 JSON 兼容记录；NaN -> null，保留 15 位数值精度。"""
    return json.loads(df.to_json(orient='records', double_precision=15))

def run_pipeline(raw, options):
    """保存每一步独立快照，便于审计、对比和复现。"""
    stages = [{'rows': raw, 'rejected': [], 'gaps': [], 'affected': 0}]
    def add(df, rejected=None, gaps=None, affected=0):
        stages.append({'rows': records(df), 'rejected': records(rejected) if rejected is not None else [],
                       'gaps': gaps or [], 'affected': int(affected)})
    x = normalize(raw)
    add(x, affected=len(x))
    x, rejected = deduplicate(x, options)
    add(x, rejected=rejected, affected=len(rejected))
    x, rejected = validate(x)
    add(x, rejected=rejected, affected=len(rejected))
    x, gaps = detect_gaps(x)
    add(x, gaps=gaps, affected=sum(g['missing'] for g in gaps))
    x = flag_outliers(x, options)
    add(x, affected=x['flags'].map(lambda f: '异常收益' in f).sum())
    x = features(x)
    add(x, affected=x['tradable'].sum())
    return stages

# PLOT
def plot_quality(raw, clean):
    """matplotlib 绘制有效轨迹、异常点和收益分布；显式断开缺口。"""
    before = normalize(raw).sort_values('timestamp')
    after = pd.DataFrame(clean).copy()
    fig, axes = plt.subplots(2, 1, figsize=(11, 5), gridspec_kw={'height_ratios': [2, 1]}, constrained_layout=True)
    ax, hist = axes
    raw_time = pd.to_datetime(before['timestamp'], unit='ms', utc=True, errors='coerce')
    ax.plot(raw_time, before['close'], color='#bdc8c3', lw=1, label='Raw input')
    if not after.empty:
        after['time'] = pd.to_datetime(after['timestamp'], unit='ms', utc=True)
        bad = after['flags'].map(lambda f: '异常收益' in f)
        # 只在缺口开始处插入一个 NaN，使线段断开；不创建跨数年的分钟索引。
        # 这些 NaN 只用于画图，不写回研究数据，也不代表补出的价格。
        line = after.set_index('time')['close'].copy()
        line.loc[after.loc[bad, 'time']] = np.nan
        previous_time = after['time'].shift(1)
        gap = after['time'].sub(previous_time).gt(pd.Timedelta(minutes=1))
        break_time = previous_time.loc[gap] + pd.Timedelta(minutes=1)
        line = pd.concat([line, pd.Series(np.nan, index=pd.DatetimeIndex(break_time))]).sort_index()
        ax.plot(line.index, line, color='#087d66', lw=1.3, label='Valid / unflagged')
        ax.scatter(after.loc[bad, 'time'], after.loc[bad, 'close'], c='#ce8b44', s=20, label='Flagged return', zorder=3)
        usable = after.loc[after['tradable'].eq(True), 'ret'].dropna()
        hist.hist(usable, bins=30, color='#5da88f', alpha=.85)
    ax.set(title='OHLCV quality audit (UTC)', ylabel='Close price')
    ax.xaxis.set_major_formatter(DateFormatter('%H:%M', tz=raw_time.dt.tz))
    ax.legend(loc='upper left', fontsize=8, frameon=False)
    hist.set(xlabel='Minute log return · data-ready rows only', ylabel='Count')
    for axis in axes:
        axis.grid(alpha=.15)
        axis.spines[['top', 'right']].set_visible(False)
    return fig

def plot_svg(raw, clean):
    """浏览器使用内存 SVG；离线脚本另存 PNG，无需上传本地数据。"""
    fig = plot_quality(raw, clean)
    buffer = io.StringIO()
    fig.savefig(buffer, format='svg', metadata={'Date': None})
    plt.close(fig)
    return buffer.getvalue()
