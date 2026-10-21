# Research download dependency maintenance — 2026-10-21

Research requirements and notebook installation cells now explicitly require `pillow>=13.0.0,<14`. Pillow is a plotting dependency; a permissive transitive constraint previously allowed already-installed 12.x releases to remain in use. Pillow 13.0.0 requires Python 3.11+, matching this project's existing minimum.

The constraint is present in the committed research package and in newly generated browser downloads. A regression check calls the actual export generator and inspects both installation paths. Run it with `node scripts/check-dependencies.mjs`.

This is dependency maintenance, not a change to cleaning rules or research results. The project does not decode uploaded images or append to externally supplied PDFs. The browser's CDN-provided Pyodide packages are a separate runtime; this constraint applies to downloaded Python research environments, not to the packages embedded by that CDN. Shared system environments are not changed by the project.

Official package metadata: https://pypi.org/project/pillow/13.0.0/
Pillow 12.3.0 vulnerability metadata: https://pypi.org/pypi/pillow/12.3.0/json


## Validation on 2026-10-21

Pillow 13.0.0 was tested in a fresh, project-isolated Python 3.12 environment with numpy 2.5.4, pandas 3.0.6 and matplotlib 3.11.2. Five public Python tests and the full public notebook passed. Private parity, conservation, causal-prefix, bad-input quarantine, PNG/SVG export, standalone script and complete notebook execution also passed. The previously observed notebook readiness timeout did not reproduce in this clean environment; this does not establish its original root cause. Existing shared Python installations were not upgraded.

Generated input records, cleaning algorithms and parameters are unchanged. GitHub CI also checks the download dependency contract. The full JupyterLab graphical interface was not installed or tested; Notebook Run All was executed through nbclient/ipykernel.

For a fresh virtual environment, update its installer with `python -m pip install --upgrade pip` before installing requirements. The isolated validation environment used pip 26.2.2; the base runtime was left unchanged.
