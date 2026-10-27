# Cross-language benchmark measurement contract

This protocol compares the shipped JavaScript, Go and Rust implementations on
identical static input HTML. Run the comparison harness from the repository root;
the generated report is authoritative for its exact seed, repetitions, build
hashes, runtime versions and hardware. Do not combine measurements from different
report files into one speed ratio.

## Workload and correctness

Use all 130 `vendor/mozilla/test/test-pages/*/source.html` documents for the
corpus workload, with the same URL (`https://example.com/test/page.html`) and
engine options for each implementation. Measure Chromium and Mozilla separately.
The locked corpus totals 25,719,900 bytes, with source sizes from 195 to
1,630,750 bytes. Corpus identity must be established with file SHA-256 hashes.

For focused measurements, sort by byte size, then fixture ID; select index
`floor((count - 1) * q)` for q = 0.1, 0.5, 0.9. The current selections are:

- `rtl-4`: 1,214 bytes, sorted index 12.
- `ehow-2`: 107,092 bytes, sorted index 64.
- `schema-org-context-object`: 459,526 bytes, sorted index 116.

These are size representatives, not a claim that three inputs represent all
HTML structures. Full-corpus results are needed alongside their detailed data.
Do not replace valid empty results with errors or remove slow inputs. All 260
upstream public-API baseline cases currently return articles.

Use public extraction with default sanitization and semantic cleanup. Include
HTML parsing, extraction, final HTML serialization and article JSON
serialization in the resident timed region. Load fixtures and decode the worker
request before timing. Output checksums and report serialization belong outside
the timed region. Each measured call must parse fresh HTML; do not reuse an
already modified document tree. The JavaScript worker yields one event-loop turn
between calls, outside the timed region, so queued jsdom teardown can complete;
GC is never explicitly forced. Native objects are released normally by their
runtimes. Without that turn, a synchronous synthetic loop can accumulate pending
DOM lifecycle tasks and measure their backlog rather than normal resident use.

JSON serialization follows each runtime's normal API: JavaScript produces a
UTF-16 string with `JSON.stringify`, while Go/Rust produce UTF-8 JSON bytes.
The JavaScript worker calculates its UTF-8 byte count outside the timer. These
are application-pipeline costs, not equal-work UTF-8 transport serialization
microbenchmarks. CLI measurements include the actual output encoding/write.
The JavaScript event-loop yield and any cleanup it runs are outside individual
call timers but inside resident worker wall time and peak RSS. Thus summed
extraction-call times do not represent sustained throughput including all
between-call lifecycle work.

Check outputs independently of speed. Compare article fields semantically after
JSON parsing, and retain strict content HTML/text comparisons. Text checksums
alone cannot establish full output compatibility. Run the complete strict
extraction and readerability gates before measurement. A report must show
matching and differing outputs with the timing results. When a candidate has
compatibility differences, its time describes its current behavior and cannot
establish a speedup for an equivalent replacement. Rust and Go now pass the
locked corpus; earlier incompatible Rust results remain historical evidence.

## Timing

Compile native release binaries and build the JavaScript distribution before
measurement. Do not use `go run`, `cargo run`, debug Rust, or build/install work in
the timed region. Record all versions, relevant runtime environment variables,
build commands and binary/bundle hashes. Run one benchmark worker at a time;
parallel builds and tests must finish first.

Use monotonic timers inside resident processes. Warmup precedes recorded
samples; record warmup count rather than silently dropping chosen outliers.
Rotate implementation order in balanced rounds, using a recorded deterministic
seed for fixture order. Preserve every raw sample. Record case and process order
so thermal drift and runtime warmup can be inspected.

Report corpus totals as the sum of one extraction estimate per document, with
all 130 documents weighted once. Distinguish the sum of per-case medians from the
median of complete sweep totals; they answer different questions. Per-case
medians and tail percentiles describe repeated work on that case, not a
production request distribution. Do not present a three-sample maximum as a
reliable p95. Report sample counts with percentiles and use median/range for
small sample sets.

Measure CLI cold start with the actual installed entry points: Node plus the
built JavaScript CLI and the built Go/Rust CLI binaries. Pass the same source file with the same URL, engine and JSON output mode. Include process creation,
runtime/module initialization, input reading, extraction and complete output
writing. Redirect stdout to a temporary file consistently for all CLIs; validate the returned article.
CLI elapsed time is not startup alone. OS executable and filesystem caches stay
warm, so describe this as a fresh process, not a cold disk-cache measurement.

## Recorded sampling plan

- Full corpus: three independent resident processes per implementation and
  engine. Each process performs two warmups then three measured calls per case
  (nine measurements per page across processes). Shuffle cases deterministically
  per replicate and share that order across implementations. Rotate language
  order over the three replicates. Report sum of per-case medians and label
  percentiles across documents as the page mix, not repeated-request tails.
- Focused quantile fixtures: three independent worker processes, two warmups
  then ten measurements each, giving 30 observations per fixture, implementation
  and engine. Report p50 and p95 with the nearest-rank definition
  `sorted[ceil(p * count) - 1]`.
- Fresh CLI: nine independent processes per fixture, implementation and engine,
  with balanced seeded run order. Report median and range with all samples.
- Startup baseline: nine bare `--version` processes per implementation,
  independent of engine. This is an observable CLI startup baseline; subtracting
  it from extraction time does not isolate parsing or extraction reliably.
- Memory: collect peak RSS for the full-corpus workers, focused workers and
  each CLI child. Keep these scopes separate in the report.

## Memory

Use Python `os.wait4` child resource usage (`ru_maxrss`) for all three
implementations. macOS reports bytes; Linux reports KiB, which must be multiplied
by 1024. Report unsupported platforms explicitly; never replace missing RSS with
zero. Record raw samples and the chosen aggregate. This measures the exact child
process rather than the parent harness.

CLI peak RSS covers the entire child process: runtime, dependencies, input,
parsing, sanitizer, output, allocator retention and GC behavior. It is not
allocated bytes, heap size, per-document incremental memory, or a leak measure.
Do not subtract a separate process's peak RSS as an allocation estimate: maxima
can occur at different times. Resident-worker peak RSS also includes its input
batch, protocol decoding and warmups. Identify that scope separately if measured.
Node `heapUsed`, Go `MemStats` and Rust allocator counters are different metrics
and must not be compared as a common memory result.

Measure CLI elapsed time with Python `perf_counter_ns` from immediately before
process creation through child exit and collect RSS using the same child
`wait4` result. Input file reads and JSON output file writes are included;
post-exit output validation is excluded. No external time-wrapper subprocess is
included. RSS instrumentation and diagnostic profilers must not silently change
the workload or only instrument one implementation.

## Interpretation and reproducibility

Keep runtime defaults unless an explicit experiment varies them. Do not force
GC in only one implementation. Record CPU, architecture, OS release, thread and
GC environment, runtime versions, sample counts, seed and input/build hashes.
Keep the machine idle and plugged in; document that CPU scheduling, turbo,
thermal state, page cache and background processes are not controlled fully.

Ratios apply to the measured machine, inputs, engine and implementation revision.
A local benchmark is not a concurrent throughput test, service latency SLO,
memory limit recommendation, or proof that one language is inherently faster.
Retain raw JSON and an exact reproduction command with the human-readable
report. Regeneration may differ numerically; it must reproduce workload,
measurement scope, correctness classification and aggregation.
