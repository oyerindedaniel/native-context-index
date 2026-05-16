# SQLite save_package A/B

Branch: `experiment/sqlite-save-profiling` (not merged).  
Environment: Windows, `cargo run --release -p nci-engine --example storage_save_bench`, `--repeat 3 --fresh-db`, warmup when repeat > 1.  
Isolated bench = crawl once per invocation, time **only** `save_package`.

## Scenario matrix

| ID  | save mode          | mmap    | FK in save txn | Notes                  |
| --- | ------------------ | ------- | -------------- | ---------------------- |
| S0  | baseline           | off (0) | on             | Control                |
| S1  | junction-batch 100 | off     | on             | Primary hypothesis     |
| S2  | junction-batch 200 | off     | on             | Chunk sweep            |
| S3  | baseline           | 128MB   | on             | mmap on RW             |
| S4  | junction-batch 100 | 128MB   | on             | S1 + mmap              |
| S5  | junction-batch 100 | off     | off            | Bench upper bound only |

## Raw isolated `save_package` medians (ms)

| Workload       | symbols |          S0 |    S1 |    S2 |    S3 |    S4 |    S5 | S0 pulumi rerun |
| -------------- | ------: | ----------: | ----: | ----: | ----: | ----: | ----: | --------------: |
| synthetic-3000 |   3,000 |        20.9 |  19.9 |  20.0 |  19.8 |  19.3 |  17.9 |               — |
| effect         | 107,917 |        8963 |  6337 | 11123 |  7925 |  9368 |  6652 |               — |
| expo-camera    |  14,481 |        1868 |  1005 |  1131 |  1248 | 523\* |  1036 |               — |
| @pulumi/aws    | 207,551 | **89846\*** | 23900 | 24475 | 25945 | 23811 | 23340 |       **15954** |

\* expo-camera S4 median 523 ms: one run was very fast (522 ms); other runs ~1.0–1.1 s — treat as high variance, not a stable 72% win.  
\*\* @pulumi/aws first S0 run (89846 ms) = cold/OS-cache outlier; **rerun S0** (same day): runs 12056, 15954, 31641 → **median 15954 ms**.

### effect stability (5× fresh, extra pass)

| Scenario | Runs (ms)                         | Median |
| -------- | --------------------------------- | -----: |
| S0       | 8887, 15234, 35075, 24126, 15730  |  15730 |
| S1       | 12195, 11448, 22483, 20129, 12900 |  12900 |

S1 still ~18% below S0 on median; spread is large (disk/cache noise on ~108k symbols).

## Full demo index (3 packages, cold `--fresh-db`, parallel)

Packages: `effect`, `expo-camera`, `@pulumi/aws` (nci-core manifest scope).  
**Index wall** (`Built 3 graphs — …`), 3 runs each — crawl+graph+save; save is a minority of wall time.

| Scenario |  Run 1 |  Run 2 |  Run 3 |     Median |
| -------- | -----: | -----: | -----: | ---------: |
| S0       | 34.05s | 36.57s | 43.74s | **36.57s** |
| S1       | 36.00s | 37.16s | 30.47s | **36.00s** |
| S4       | 36.85s | 33.55s | 41.74s | **36.85s** |

No meaningful end-to-end separation: crawl/build dominate (~25s expo crawl alone in parallel run).

## Confident conclusions

### 1. Junction batching (chunk 100) — **ship as default save path**

- **effect** (~108k symbols): S1 beats S0 by **~20–30%** on isolated save (3-run and 5-run). S2 (chunk 200) is **worse** than baseline — do not use 200.
- **expo-camera** (~15k symbols, heavier junctions per symbol): S1 ~**46%** vs S0 (3-run); stable enough to trust directionally.
- **@pulumi/aws** (~208k symbols): First S0 sample was a **90s outlier**; fair S0 rerun **~16s** median. S1 ~24s in the earlier session — **no clear win on the largest graph**; variance and session differences matter. S1 is not worse enough to block shipping; benefit is workload-dependent.
- **Synthetic 3k** (almost no junction rows): **no signal** (~5% noise) — expected.

Mechanism matches theory: junction tables were one `execute` per row; multi-value `INSERT` chunks reduce round-trips. Main `symbols` row stays a prepared loop (28 columns — correct call).

**Recommendation:** Set production default to `SavePackageMode::JunctionBatch { chunk_size: 100 }`. Keep baseline in code for tests/A/B.

### 2. `mmap_size` 128MB on RW save — **do not ship from this experiment**

- effect: S3 (7925) vs S0 (8963) ~12% on one 3-run slice — within noise given 5-run spread.
- expo: S3 slightly **slower** than S0.
- pulumi: S3 slowest of the fair cluster (~26s).
- Demo wall times: no benefit.

mmap may still help **read-only cache probes** — that was not isolated here; run a separate RO A/B if desired.

### 3. `foreign_keys=OFF` during save (S5) — **bench only, do not ship**

- effect ~26% vs S0; expo ~45% vs S0 in 3-run medians — shows FK enforcement has a real cost, but integrity risk is unacceptable without a dedicated proof strategy.

### 4. `page_size` (P0) — **not run** in this pass; defer until fresh-DB migration story exists.

## Ship criteria (from plan) vs results

| Criterion                                 | Result                                                          |
| ----------------------------------------- | --------------------------------------------------------------- |
| Junction batch ≥10% on realistic packages | **Met** for effect and expo-camera; **unclear** for @pulumi/aws |
| mmap ≥3–5% full index                     | **Not met** / not visible in demo                               |
| No FK-off in prod                         | **Hold**                                                        |

## Suggested next steps (discussion)

1. **Merge to main (when ready):** default `JunctionBatch { chunk_size: 100 }` only; drop experiment `--save-scenario` from demo or keep it behind doc for devs. No mmap/FK/page_size changes.
2. **Optional follow-up:** RO connection `mmap_size` A/B during parallel cache probes (separate from save).
3. **Optional:** Re-benchmark @pulumi/aws with **one shared crawled graph** and only save repeated (removes crawl variance between scenarios) if you want a definitive large-graph number.
4. **No release yet:** safe to change defaults; add a line in changelog that first index after upgrade uses the same schema, faster saves on re-index.

## Raw log appendix

Detailed rows (timestamps):

| timestamp  | scenario | workload               | symbols | median_ms | save_mode                         |
| ---------- | -------- | ---------------------- | ------: | --------: | --------------------------------- |
| 1778866527 | S0       | synthetic-3000         |    3000 |      20.9 | Baseline                          |
| 1778866528 | S1       | synthetic-3000         |    3000 |      19.9 | JunctionBatch { chunk_size: 100 } |
| 1778866530 | S2       | synthetic-3000         |    3000 |      20.0 | JunctionBatch { chunk_size: 200 } |
| 1778866531 | S3       | synthetic-3000         |    3000 |      19.8 | Baseline                          |
| 1778866533 | S4       | synthetic-3000         |    3000 |      19.3 | JunctionBatch { chunk_size: 100 } |
| 1778866534 | S5       | synthetic-3000         |    3000 |      17.9 | JunctionBatch { chunk_size: 100 } |
| 1778866596 | S0       | effect-107917-sym      |  107917 |    8962.6 | Baseline                          |
| 1778866631 | S1       | effect-107917-sym      |  107917 |    6337.2 | JunctionBatch { chunk_size: 100 } |
| 1778866676 | S2       | effect-107917-sym      |  107917 |   11123.0 | JunctionBatch { chunk_size: 200 } |
| 1778866713 | S3       | effect-107917-sym      |  107917 |    7925.2 | Baseline                          |
| 1778866750 | S4       | effect-107917-sym      |  107917 |    9368.2 | JunctionBatch { chunk_size: 100 } |
| 1778866776 | S5       | effect-107917-sym      |  107917 |    6651.7 | JunctionBatch { chunk_size: 100 } |
| 1778866808 | S0       | expo-camera-14481-sym  |   14481 |    1868.1 | Baseline                          |
| 1778866846 | S1       | expo-camera-14481-sym  |   14481 |    1004.6 | JunctionBatch { chunk_size: 100 } |
| 1778866887 | S2       | expo-camera-14481-sym  |   14481 |    1130.6 | JunctionBatch { chunk_size: 200 } |
| 1778866926 | S3       | expo-camera-14481-sym  |   14481 |    1248.1 | Baseline                          |
| 1778866949 | S4       | expo-camera-14481-sym  |   14481 |     522.8 | JunctionBatch { chunk_size: 100 } |
| 1778866974 | S5       | expo-camera-14481-sym  |   14481 |    1035.8 | JunctionBatch { chunk_size: 100 } |
| 1778867348 | S0       | @pulumi/aws-207551-sym |  207551 |   89845.5 | Baseline (outlier)                |
| 1778867474 | S1       | @pulumi/aws-207551-sym |  207551 |   23899.9 | JunctionBatch { chunk_size: 100 } |
| 1778879052 | S2       | @pulumi/aws-207551-sym |  207551 |   24474.8 | JunctionBatch { chunk_size: 200 } |
| 1778879215 | S3       | @pulumi/aws-207551-sym |  207551 |   25944.6 | Baseline                          |
| 1778879334 | S4       | @pulumi/aws-207551-sym |  207551 |   23811.3 | JunctionBatch { chunk_size: 100 } |
| 1778879459 | S5       | @pulumi/aws-207551-sym |  207551 |   23340.1 | JunctionBatch { chunk_size: 100 } |
| 1778913941 | S0       | @pulumi/aws-207551-sym |  207551 |   15953.6 | Baseline (rerun)                  |

Demo log: `sqlite-save-demo-runs.log` (UTF-16 from PowerShell Tee-Object; see terminal capture for wall times).
