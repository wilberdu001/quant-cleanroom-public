# Public showcase 1.1.0

[Repository](https://github.com/wilberdu001/quant-cleanroom-public) · [Live demo](https://wilberdu001.github.io/quant-cleanroom-public/)

## English-first research presentation

- Reorganized the README around the live demo, quantitative data-cleaning decisions, reproducible setup, architecture, and test evidence.
- Translated the complete public UI, Python comments/docstrings, audit labels, sample provenance, notebook explanations, script exports, boundary documentation, and screenshots into English.
- Added a reproducible sample exporter and an English-only release check so generated files and future public changes follow the same policy.
- Preserved the private complete project's language, code, data access, and Git history.

## Numerical compatibility

Compared with public release 1.0.0, every stage count, row ID, numeric value, anomaly score, and feature-readiness flag is unchanged for seed 72641. Human-readable quarantine reasons and anomaly labels are translated; cleaning rules are unchanged.

The reference experiment still produces 241 raw records, 17 quarantined records, 224 accepted records, 16 missing minutes, 4 flagged returns, and 16 data-ready observations. These are synthetic-data quality outcomes, not strategy returns.

## Verification

Five Python regression tests and complete notebook execution pass locally. The suite covers row conservation, hard constraints, unique keys, gap/anomaly gating, future-prefix invariance, and matplotlib export. The static-public check verifies service separation, script syntax, and UI bindings. GitHub Actions runs these checks and verifies the built demo matches the committed source.

## Hosting

GitHub Pages publishes `main/docs`. Pyodide executes Python locally in the visitor's browser. First use requires network access to download the runtime and packages. Downloaded research files run offline after dependency installation.
