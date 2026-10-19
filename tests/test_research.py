"""Quality, causality, and plotting regression tests for the public synthetic study."""
import io
import json
import sys
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from cleaning import run_pipeline, flag_outliers, features, plot_quality


class ResearchChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / 'dataset.json').read_text(encoding='utf-8'))
        cls.options = {'asOf': cls.data['asOf'], 'threshold': 8}
        cls.result = run_pipeline(cls.data['rows'], cls.options)

    def test_synthetic_scope_and_conservation(self):
        self.assertTrue(self.data['synthetic'])
        self.assertEqual(self.data['seed'], 72641)
        self.assertEqual(len(self.result), 7)
        self.assertEqual([s['affected'] for s in self.result], [0, 241, 8, 9, 16, 4, 16])
        self.assertEqual(len(self.result[-1]['rows']) + len(self.result[2]['rejected']) + len(self.result[3]['rejected']), len(self.data['rows']))

    def test_unique_valid_output_and_quality_gates(self):
        frame = pd.DataFrame(self.result[-1]['rows'])
        self.assertFalse(frame.duplicated(['symbol', 'timestamp']).any())
        self.assertTrue(frame['high'].ge(frame['close']).all())
        self.assertTrue(frame['low'].le(frame['close']).all())
        self.assertTrue(frame['volume'].ge(0).all())
        gaps = frame['gapMinutes'].gt(0)
        self.assertTrue(frame.loc[gaps, 'ret'].isna().all())
        bad = frame['flags'].map(lambda f: 'Unusual return' in f)
        self.assertFalse(frame.loc[bad | gaps, 'tradable'].any())

    def test_future_data_cannot_change_past_features(self):
        frame = pd.DataFrame(self.result[4]['rows'])
        for stop in (40, 100, 170):
            past = features(flag_outliers(frame.iloc[:stop].copy(), self.options))
            complete = features(flag_outliers(frame.copy(), self.options)).iloc[:stop]
            pd.testing.assert_frame_equal(past, complete)

    def test_bad_timestamp_and_missing_price_are_isolated(self):
        rows = [dict(self.data['rows'][0], timestamp='invalid', id=9000),
                dict(self.data['rows'][1], close='', id=9001)]
        result = run_pipeline(rows, self.options)
        self.assertFalse(result[-1]['rows'])
        self.assertEqual(len(result[3]['rejected']), 2)

    def test_matplotlib_figure_is_exportable(self):
        fig = plot_quality(self.data['rows'], self.result[-1]['rows'])
        image = io.BytesIO()
        fig.savefig(image, format='png')
        self.assertTrue(image.getvalue().startswith(b'\x89PNG'))
        self.assertGreater(len(image.getvalue()), 1000)
        import matplotlib.pyplot as plt
        plt.close(fig)


if __name__ == '__main__':
    unittest.main()
