# Public release boundary

This repository is an independently curated research-engineering showcase with its own Git history. It includes reviewed generic OHLCV cleaning methods, deterministic synthetic fixtures, educational notebooks, and a static, client-side demonstration.

## Data and execution

The committed input contains synthetic one-minute bars only. Visitors may choose a local CSV, but the demo has no upload endpoint: input and calculations remain in browser memory. Experiment logs use a separate local-storage namespace on the visitor's device. CDNs provide the Python runtime, scientific packages, and fonts; the application does not send its input records to those providers.

## Excluded material

Production market pools and snapshots, scheduled collection and write endpoints, user/account records, credentials, backups, deployment identifiers, and the private project's Git history are excluded. The complete version retains its existing access controls.

## Research assumptions

The example assumes one instrument in a continuously traded, one-minute market. Gaps are measured only within the supplied window. The current observation does not participate in its own anomaly reference or historical risk estimate. Unusual prices are flagged without being clipped, repaired, or declared invalid solely by a statistical test.

The `tradable` field is a data-readiness gate, not a statement about liquidity, executable prices, prediction quality, or profitability. Equity calendars, versioned corporate-action adjustments, publication-time joins, survivorship bias, out-of-sample evaluation, latency, spreads, slippage, and fees require additional modeling.

## Language and maintenance

Public documentation, UI text, code comments, notebook explanations, sample provenance, screenshots, and release notes use English. Automated checks reject CJK text in tracked textual deliverables and confirm the public demo remains disconnected from private service routes. User-supplied local data is not translated or published.
