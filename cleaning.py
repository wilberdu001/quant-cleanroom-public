# %% [markdown]
# # Quant Cleanroom: one-minute OHLCV research preparation
# One Python implementation powers the browser, Jupyter Notebook, and VS Code.
# timestamp is the bar opening time; all observation cutoffs use UTC milliseconds.
# %%
import io
import json
import sys
# Use UTF-8 output when the terminal supports reconfiguration.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')  # Use a headless backend so the browser, scripts, and notebooks can export figures.
import matplotlib.pyplot as plt
from matplotlib.dates import DateFormatter

# STEP 1
def normalize(raw):
    """Normalize the schema; preserve missing values instead of converting blanks to zero."""
    df = pd.DataFrame(raw).copy(deep=True)
    # Create missing required columns so later validation can quarantine those rows.
    for col in ['timestamp', 'symbol', 'open', 'high', 'low', 'close', 'volume']:
        if col not in df:
            df[col] = np.nan
    if 'id' not in df:
        df['id'] = np.arange(1, len(df) + 1)
    # Infer seconds versus milliseconds by magnitude; parse timezone-aware ISO dates as UTC.
    numeric = pd.to_numeric(df['timestamp'], errors='coerce')
    timestamps = numeric.where(numeric.abs() >= 1e11, numeric * 1000).astype(float)
    is_text = numeric.isna() & df['timestamp'].notna()
    if is_text.any():
        parsed = pd.to_datetime(df.loc[is_text, 'timestamp'], utc=True, errors='coerce', format='mixed')
        timestamps.loc[is_text] = [t.timestamp() * 1000 if pd.notna(t) else np.nan for t in parsed]
    df['timestamp'] = timestamps
    # errors='coerce' maps blanks and nonnumeric values to NaN, never to a fabricated price.
    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    df['symbol'] = df['symbol'].fillna('').astype(str).str.strip().str.upper()
    df['flags'] = [[] for _ in range(len(df))]  # Use a separate list per row to avoid shared mutable state.
    if 'closed' not in df:
        df['closed'] = True
    return df.reset_index(drop=True)

# STEP 2
def deduplicate(df, options):
    """Filter unfinished bars and retain the first received duplicate version."""
    x = df.copy(deep=True)
    # The bar must close by the observation cutoff; unfinished bars are not available for research.
    unfinished = x['closed'].eq(False) | ((x['timestamp'] + 60_000) > options['asOf'])
    rejected_open = x.loc[unfinished].assign(reason='Unfinished bar / not yet available')
    eligible = x.loc[~unfinished].copy()
    # Deduplicate before sorting: keep the first arrival rather than the best later revision.
    duplicate = eligible.duplicated(['symbol', 'timestamp'], keep='first')
    rejected_dup = eligible.loc[duplicate].assign(reason='Duplicate key: retained the first received record')
    kept = eligible.loc[~duplicate].sort_values(['symbol', 'timestamp'], kind='stable')
    rejected = pd.concat([rejected_open, rejected_dup], ignore_index=True)
    return kept.reset_index(drop=True), rejected

# STEP 3
def validate(df):
    """Apply hard constraints; record the first failure and quarantine for upstream review."""
    x = df.copy(deep=True)
    reason = pd.Series('', index=x.index, dtype='object')
    values = x[['open', 'high', 'low', 'close', 'volume']]
    # Require a finite minute-aligned timestamp and a nonempty instrument symbol.
    schema_bad = x['symbol'].eq('') | ~np.isfinite(x['timestamp']) | x['timestamp'].mod(60_000).ne(0)
    finite_bad = ~np.isfinite(values).all(axis=1)
    sign_bad = x[['open', 'high', 'low', 'close']].min(axis=1).le(0) | x['volume'].lt(0)
    # High must bound all prices above, and Low must bound all prices below.
    ohlc_bad = x['high'].lt(x[['open', 'close', 'low']].max(axis=1)) | x['low'].gt(x[['open', 'close', 'high']].min(axis=1))
    for mask, text in [(schema_bad, 'Invalid symbol / timestamp not aligned to a minute'),
                       (finite_bad, 'Missing or nonfinite numeric value'),
                       (sign_bad, 'Prices must be positive; volume must be nonnegative'),
                       (ohlc_bad, 'Inconsistent OHLC bounds')]:
        reason.loc[mask & reason.eq('')] = text  # Keep a fixed rule priority for reproducible failure reasons.
    rejected = x.loc[reason.ne('')].assign(reason=reason[reason.ne('')])
    return x.loc[reason.eq('')].reset_index(drop=True), rejected.reset_index(drop=True)

# STEP 4
def detect_gaps(df):
    """Detect missing minutes inside the input window without forward-filling price or volume."""
    x = df.copy(deep=True)
    previous = x.groupby('symbol', sort=False)['timestamp'].shift(1)
    missing = ((x['timestamp'] - previous) / 60_000 - 1).clip(lower=0).fillna(0).astype(int)
    x['gapMinutes'] = missing
    x['flags'] = [list(flags) + (['Time gap'] if n else []) for flags, n in zip(x['flags'], missing)]
    gaps = []
    for idx in x.index[missing.gt(0)]:
        gaps.append({'symbol': x.at[idx, 'symbol'], 'after': float(previous.at[idx]),
                     'before': float(x.at[idx, 'timestamp']), 'missing': int(missing.at[idx])})
    # Do not infer missing bars outside the window or apply an equity calendar to crypto.
    return x, gaps

# STEP 5
def flag_outliers(df, options):
    """Calibrate MAD with past returns; flag unusual observations without changing prices."""
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
                continue  # Do not compute a one-minute return across a gap.
            # Score first, then append the current return; the reference cannot see current or future values.
            if len(history) >= 20:
                past = np.asarray(history[-60:])
                median = np.median(past)
                mad = np.median(np.abs(past - median))
                score = abs(current - median) / max(1.4826 * mad, 1e-8)
                x.at[idx, 'robustZ'] = score
                if score > options['threshold']:
                    x.at[idx, 'flags'] = x.at[idx, 'flags'] + ['Unusual return']
            history.append(float(current))
            history = history[-60:]
    return x

# STEP 6
def features(df):
    """Lagged signal and a risk estimate from the previous 20 consecutive valid returns."""
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
                history = []  # Restart warm-up after a gap; never splice the risk window across missing bars.
            current_bad = 'Unusual return' in row['flags']
            previous_bad = previous is not None and 'Unusual return' in previous['flags']
            if contiguous and not current_bad and not previous_bad:
                x.at[idx, 'signalLag1'] = previous['ret']
                # Estimate historical volatility before appending the current return; ddof=1 uses sample variance.
                if len(history) >= 20:
                    x.at[idx, 'vol20'] = np.std(history[-20:], ddof=1)
                x.at[idx, 'tradable'] = pd.notna(x.at[idx, 'signalLag1']) and pd.notna(x.at[idx, 'vol20'])
            if pd.notna(row['ret']) and not current_bad:
                history.append(float(row['ret']))
                history = history[-20:]
            else:
                history = []  # Reset after an anomaly as well so a spike cannot silently contaminate the risk window.
            previous = row
    # tradable is a data-readiness gate; execution still needs latency, spreads, slippage, and fees.
    return x

# PIPELINE
def records(df):
    """Convert a DataFrame to JSON records; map NaN to null and retain 15 decimal digits."""
    return json.loads(df.to_json(orient='records', double_precision=15))

def run_pipeline(raw, options):
    """Keep an independent snapshot at every stage for audit, comparison, and reproduction."""
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
    add(x, affected=x['flags'].map(lambda f: 'Unusual return' in f).sum())
    x = features(x)
    add(x, affected=x['tradable'].sum())
    return stages

# PLOT
def plot_quality(raw, clean):
    """Plot accepted prices, unusual returns, and the return distribution; break the line at gaps."""
    before = normalize(raw).sort_values('timestamp')
    after = pd.DataFrame(clean).copy()
    fig, axes = plt.subplots(2, 1, figsize=(11, 5), gridspec_kw={'height_ratios': [2, 1]}, constrained_layout=True)
    ax, hist = axes
    raw_time = pd.to_datetime(before['timestamp'], unit='ms', utc=True, errors='coerce')
    ax.plot(raw_time, before['close'], color='#bdc8c3', lw=1, label='Raw input')
    if not after.empty:
        after['time'] = pd.to_datetime(after['timestamp'], unit='ms', utc=True)
        bad = after['flags'].map(lambda f: 'Unusual return' in f)
        # Insert one NaN at each gap boundary; do not allocate a minute index spanning years.
        # These plotting-only NaNs never enter the research dataset or represent imputed prices.
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
    """Return an in-memory SVG for the browser; local scripts can save PNG without uploading data."""
    fig = plot_quality(raw, clean)
    buffer = io.StringIO()
    fig.savefig(buffer, format='svg', metadata={'Date': None})
    plt.close(fig)
    return buffer.getvalue()
