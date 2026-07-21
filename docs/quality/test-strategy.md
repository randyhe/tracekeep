# Test Strategy

Tracekeep uses layered unit, contract, integration, browser, security, and recovery testing. Real conversations remain local and never enter repository fixtures or CI artifacts.

Release blockers include sensitive-data leakage, hidden paid network calls, silent concurrency overwrite, unrecoverable committed data, or unsupported claims about source coverage.
