# Quant Cleanroom · 公开量化研究实验室

Auditable OHLCV data cleaning with **Python, pandas and matplotlib**. 每一步展示中文解释、实际执行代码与记录级审计结果。

Repository: https://github.com/wilberdu001/quant-cleanroom-public

**[打开交互式公开 Demo](https://wilberdu001.github.io/quant-cleanroom-public/)**

## 交互体验

- 浏览器通过 Pyodide 执行真实的 Python / pandas 清洗，不以 JavaScript 仿真冒充 Python 结果。
- 六步代码快照、中文注释与研究含义、记录级原始/步骤/最终/隔离表格。
- matplotlib 价格质量图和就绪样本收益分布；缺口和异常处断开有效价格轨迹。
- 任意刷新合成样本；以种子、标的、污染强度重建输入。
- 本地 CSV 在浏览器内处理；可下载当前数据的 Notebook、VS Code 脚本或完整 ZIP。

首次打开需联网下载 Python、pandas、matplotlib，可能需要等待几十秒；加载状态会显示进度。下载文件可在本机安装依赖后离线运行。演示没有服务端采集或任何交易执行能力。

本地预览需要 Node.js 18+：

```bash
node scripts/build-demo.mjs
node scripts/preview.mjs
```

打开 http://127.0.0.1:4174/quant-cleanroom-public/ 。GitHub Pages 仅从 `main` 分支的 `docs/` 发布静态文件。

## 研究目标

用可复现的人工污染样本，展示量化研究的数据准备方法，而不是声称策略收益或实时交易能力：

1. 统一数值类型与 UTC 时间戳，保留缺失语义。
2. 以采集截止时刻过滤未收盘 K 线，并按主键去重。
3. 隔离违反 OHLCV 硬约束的记录。
4. 显式标记分钟缺口，不前向填充可交易价格。
5. 只用历史收益校准 rolling median/MAD 异常检测。
6. 构造滞后收益和连续历史风险窗口，报告研究数据门槛。

## 在 Jupyter / VS Code 中运行

Python 3.11+：

```bash
python -m venv .venv
# Windows: .venv\Scripts\python -m pip install -r requirements.txt
# macOS/Linux: .venv/bin/python -m pip install -r requirements.txt
python -m pip install -r requirements.txt
python research.py
python -m jupyterlab research.ipynb
```

上述最后三条命令应使用选定虚拟环境的 Python。VS Code 选择相同环境；`research.py` 支持 `# %%` 单元格，Notebook 可按顺序 Run All。

`dataset.json` 是固定种子 72641 的 240 分钟合成 OHLCV 样本，人工注入重复、空值、负成交量、时间单位混用、OHLC 冲突和尖峰。`research.ipynb` 与 `research.py` 内嵌同一快照及参数；安装依赖后无需联网即可运行。`results/` 由脚本生成，包含清洗 CSV、隔离 CSV、完整快照与 matplotlib 图表。

## 方法边界

`tradable` 只表示演示的数据质量门槛通过，不代表可以买卖或具有预测能力。异常只能标记待核验，不能单凭一个来源断言是错误报价。股票日历、企业行动、基本面 point-in-time 数据、成交延迟、点差与交易费用均不在此通用分钟清洗演示范围内。

本仓库不包含生产数据、用户记录、密钥、自动采集服务或私有部署配置。
