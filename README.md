# Quant Cleanroom

**Auditable market-data cleaning for quantitative research, built with Python, pandas, and matplotlib.**

[![Research checks](https://github.com/wilberdu001/quant-cleanroom-public/actions/workflows/checks.yml/badge.svg)](https://github.com/wilberdu001/quant-cleanroom-public/actions/workflows/checks.yml)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-3776AB)](requirements.txt)
[![Data: synthetic](https://img.shields.io/badge/Data-synthetic-087d66)](dataset.json)

### [Open the live demo](https://wilberdu001.github.io/quant-cleanroom-public/) · [Explore the notebook](research.ipynb) · [Read the cleaning engine](cleaning.py)

Turn contaminated one-minute OHLCV records into a traceable research dataset. Inspect the input, the exact Python code, intermediate snapshots, quarantine reasons, and the effect of each decision on downstream features.

This is a reproducible research-engineering showcase using **clearly labeled synthetic data**. It does not report trading performance or claim that a cleaned signal is profitable.

## What you can explore

- **Real Python in the browser.** Pyodide executes the same pandas functions used by the downloadable notebook and VS Code script.
- **Record-level auditability.** Switch between raw input, the current stage, final output, and quarantined rows; retain original row IDs and failure reasons.
- **Controlled data defects.** Vary the seed, instrument, and contamination level to reproduce duplicates, missing values, timestamp-unit errors, invalid OHLCV, missing bars, and price spikes.
- **Matplotlib diagnostics.** Compare raw and accepted prices, break the displayed line at gaps or flagged observations, and inspect the return distribution of data-ready rows.
- **Portable experiments.** Download the selected input, parameters, annotated Python, Jupyter Notebook, VS Code script, or a complete research ZIP.
- **Local CSV processing.** Imported files are processed in browser memory, without a project backend or upload endpoint.

First use downloads the Python runtime and scientific packages from a CDN and can take tens of seconds. Progress and errors are visible. Downloaded research files run offline after their dependencies are installed.

## Cleaning methodology

The pipeline targets a **single instrument in a continuously traded, one-minute market**. `timestamp` is the bar's opening time; `asOf` is the observation cutoff in UTC milliseconds.

| Stage | Implementation | Research rationale |
| --- | --- | --- |
| 1. Normalize schema | Parse numeric fields, normalize seconds/milliseconds and timezone-aware dates, standardize symbols, preserve missing values. | Blank prices must not silently become zero; mixed time units must not corrupt ordering. |
| 2. Enforce availability and deduplicate | Exclude unfinished bars using `timestamp + 60s <= asOf`; retain the first received `(symbol, timestamp)` before sorting. | Avoid unstable, unfinished inputs and silent replacement by a later duplicate. Full point-in-time reconstruction still requires arrival timestamps and revision history. |
| 3. Validate OHLCV | Require minute alignment, finite values, positive prices, nonnegative volume, and consistent high/low bounds; quarantine failures. | Preserve evidence of upstream defects rather than guessing a repair. |
| 4. Detect missing bars | Identify internal timestamp discontinuities; retain explicit gap counts without filling prices or volume. | Forward-filled bars can manufacture zero returns and apparent liquidity. No inference is made outside the input window. |
| 5. Flag unusual returns | Compute log returns only across adjacent minutes. Score against the previous 20-60 available returns using median/MAD; retain the price unchanged. | Keep the current and future observation out of its own reference distribution. A flagged move may be genuine and needs independent verification. |
| 6. Build causal features | Use the previous minute's return and the sample standard deviation of 20 prior consecutive valid returns. Reset the risk window after gaps or anomalies. | Make information availability explicit and prevent contaminated or discontinuous histories from quietly entering risk estimates. |

**Important distinction:** `tradable` is the existing field name for a data-readiness gate. It is not an execution guarantee, an order instruction, or evidence of alpha. Signals formed at a close require a later executable observation in a backtest.

### Reproducible reference experiment

The committed sample uses seed **72641**, contamination **0.55**, and a synthetic 240-minute window. Skipped and duplicated bars mean the input row count is not necessarily 240.

| Outcome | Reference result |
| --- | ---: |
| Raw records | 241 |
| Quarantined records | 17 |
| Accepted records | 224 |
| Missing minutes inside the window | 16 |
| Flagged return observations | 4 |
| Data-ready observations | 16 |

These are data-quality outcomes on one seeded sample, not investment returns. Changing the threshold or the input can change the results.

## Run the research locally

Python **3.11+** is required. The notebook and script embed the sample and parameters, so no API key, account, or live-data connection is needed.

**Windows / PowerShell**

```powershell
git clone https://github.com/wilberdu001/quant-cleanroom-public.git
cd quant-cleanroom-public
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe research.py
.\.venv\Scripts\python.exe -m jupyterlab research.ipynb
```

**macOS / Linux**

```bash
git clone https://github.com/wilberdu001/quant-cleanroom-public.git
cd quant-cleanroom-public
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python research.py
.venv/bin/python -m jupyterlab research.ipynb
```

In VS Code, select the same virtual environment. Open `research.ipynb` and choose **Run All**, or use the `# %%` cells in `research.py`. If dependencies are already installed, skip the notebook's installation cell.

The script writes `cleaned.csv`, `quarantine.csv`, `stages.json`, and `quality_audit.png` to `results/` beside the script. The notebook writes its results relative to its working directory.

## Run the web demo locally

Node.js **18+** is sufficient; no npm packages are required.

```bash
node scripts/build-demo.mjs
node scripts/preview.mjs
```

Open [the local preview](http://127.0.0.1:4174/quant-cleanroom-public/). GitHub Pages serves the same static `docs/` directory from `main`.

## Scope and limitations

This public repository contains generic cleaning methods, synthetic fixtures, educational notebooks, and a static demo. It excludes production snapshots, account records, credentials, scheduled collectors, private deployment identifiers, and private Git history. See [the public-release boundary](PUBLIC-BOUNDARY.md).

Equity trading calendars, corporate actions, versioned adjustments, fundamental publication times, survivorship bias, liquidity constraints, latency, spreads, slippage, and fees need separate modeling before these ideas become a realistic backtest.
