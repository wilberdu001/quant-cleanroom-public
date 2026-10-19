"""Execute the public notebook in an isolated temporary directory; skip its installation cell."""
import os
import subprocess
import sys
import tempfile
from pathlib import Path
import nbformat
from nbclient import NotebookClient

ROOT = Path(__file__).resolve().parents[1]
nb = nbformat.read(ROOT / 'research.ipynb', as_version=4)
nbformat.validate(nb)
nb.cells = [c for c in nb.cells if not (c.cell_type == 'code' and '%pip install' in c.source)]
with tempfile.TemporaryDirectory(prefix='cleanroom-public-') as directory:
    runtime = Path(directory)
    prefix = runtime / 'kernel'
    subprocess.run([sys.executable, '-m', 'ipykernel', 'install', '--prefix', str(prefix), '--name', 'cleanroom-public'], check=True, stdout=subprocess.DEVNULL)
    os.environ['JUPYTER_PATH'] = str(prefix / 'share/jupyter')
    NotebookClient(nb, timeout=180, kernel_name='cleanroom-public', resources={'metadata': {'path': directory}}).execute()
    assert (runtime / 'results/cleaned.csv').is_file()
    assert (runtime / 'results/quality_audit.png').stat().st_size > 1000
    assert all(output.output_type != 'error' for cell in nb.cells if cell.cell_type == 'code' for output in cell.outputs)
print('PASS: standalone public notebook Run All and matplotlib output')
