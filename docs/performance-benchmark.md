# Performance Benchmark Guide

This benchmark provides a repeatable baseline for diagnostics and formatting.

## Prerequisites

- `npm run compile`

## Run

```bash
node tests/perf/run-performance-benchmark.js --structs 120 --fields 30 --iterations 10
```

Arguments:

- `--structs`: number of structs generated (default: 120)
- `--fields`: number of fields per struct (default: 30)
- `--iterations`: runs per scenario (default: 10)

## Output

The script prints average/min/max timings for:

- Diagnostics (full)
- Diagnostics (incremental)
- Formatting (full)
- Formatting (incremental)

## Notes

- The benchmark uses a synthetic document to avoid file system noise.
- Incremental diagnostics uses two dirty ranges within the same document.
- Incremental formatting uses a single dirty range and minimal patch output.
