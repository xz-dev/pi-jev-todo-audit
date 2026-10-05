# Historical engine comparisons

These three files preserve the old transport/cache/capacity/rolling algorithms for historical assertions. They are **not the audit runtime**, a fake public review service, or proof of shared-service acceptance. The package's `files` allowlist excludes this directory (and all tests).

The nine existing engine-comparison test files import here explicitly. Business request construction and retained-source helpers still come from the production modules, so their source assertions remain useful; their old request counts, cache objects and HTTP backoff assertions characterize this historical engine only.

Actual owner evidence is listed in `openspec/changes/use-shared-judgment-service/regression-map.md` and runs in the opt-in `shared-service-*.integration.test.ts` files with explicit `PI_JUDGMENT_SOURCE` and `PI_CLASSIFIER_SOURCE`. Those files must never import this directory. Ordinary index/ledger tests use the public review port, not this engine.

The standalone `compare-workloads.ts --baseline` command instead reads the committed core and corpus from Git without a checkout. Its default path uses the actual service/Pi adapter. Neither historical run is live-provider or installed-rollout acceptance.
