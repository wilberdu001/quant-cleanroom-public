# Public showcase 1.0.0

Repository: https://github.com/wilberdu001/quant-cleanroom-public

Demo: https://wilberdu001.github.io/quant-cleanroom-public/

## Included

- Shared Python/pandas OHLCV cleaning with detailed Chinese comments.
- Synthetic, seeded contamination experiments and browser-local CSV input.
- Record-level raw, intermediate, final and quarantine inspection.
- Matplotlib price-quality and data-ready return-distribution figures.
- Self-contained Jupyter Notebook, VS Code script and project ZIP downloads.
- Public-release boundary checks, causal invariance tests and executable Notebook CI.

## Verified

The local Python research script, five unittest cases and complete Notebook execution passed. GitHub Actions research checks and GitHub Pages deployment passed. Browser verification at the public URL confirmed Python 3.13.2 / Pyodide 0.28.2 execution, one matplotlib SVG, the expected default sample counts, and an actual Notebook download.

The default seed 72641 yields 241 raw records, 17 quarantined records, 16 missing minutes and 16 data-ready observations. These are data-quality outcomes on synthetic input, not strategy returns.

No private market data, user/account records, credentials, deployment identity or private Git history are included. The complete private project's visibility and private website are unchanged.

## Hosting

GitHub Pages publishes the static `docs/` directory from `main`. Python and scientific packages load from the Pyodide CDN on the visitor's computer; initial loading requires internet and can take tens of seconds. After installation, the downloaded research files run locally without network access.
