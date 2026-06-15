# k6 Breakpoint Test Demo

A small, self-contained demo that showcases [k6](https://k6.io/)'s load-testing
capabilities. It spins up a deliberately CPU-constrained web service and ramps
traffic against it until the service breaks — a classic **breakpoint test** used
to discover the point at which a system stops coping with load.

## What's in here

| File                  | Purpose                                                          |
| --------------------- | --------------------------------------------------------------- |
| `test.js`             | The k6 test script (the breakpoint scenario + thresholds).      |
| `docker-compose.yaml` | A throwaway nginx target, CPU-capped so it can be pushed to 100%.|

## The target under test

`docker-compose.yaml` runs a single `nginx:alpine` container that is intentionally
made easy to overwhelm:

- **Hard CPU cap of `1.0` core** and `128m` memory limit, so the service can
  realistically be driven to 100% utilization.
- **gzip at compression level 9** over a ~256 KB, barely-compressible random
  payload. Static serving is almost free, so gzip becomes the CPU-cost "knob"
  that lets the capped nginx saturate and start dropping connections.
- **Small accept backlog (`backlog=64`)** so that, once nginx is saturated,
  overflowing connections are dropped rather than queued — producing the
  failures the test is looking for.
- A `/healthz` endpoint (gzip off) used for the container healthcheck.

The vhost config and payload are generated at container startup, so nothing
extra needs to live on disk.

## The test script

`test.js` defines a single scenario using the **`ramping-arrival-rate`**
executor, which drives a target *request rate* (open model) rather than a fixed
number of virtual users:

- Starts at **50 requests/s** and ramps the arrival rate upward in stages:
  `100 → 300 → 600 → 1000 → 1500 → 2500` requests/s over ~2m50s total.
- Pre-allocates 300 VUs and is allowed to scale up to 3000 VUs to sustain the
  requested rate as responses slow down.
- Each iteration issues a single `GET http://localhost:8080` with a 10s timeout
  and an `Accept-Encoding: gzip` header (forcing nginx to spend CPU compressing).

A **threshold with `abortOnFail`** stops the test early once the service is
clearly broken — defined here as a request failure rate above **25% sustained
for 15s**. The arrival rate at which this happens is the system's breakpoint.

## Running it

```sh
# 1. Start the target service
docker compose up -d

# 2. Run the load test (requires k6 installed locally)
k6 run test.js

# Optional: watch the container saturate its CPU cap
docker stats webtest

# 3. Tear down
docker compose down
```

Watch k6's live metrics: as the arrival rate climbs, `http_req_duration` rises
and `http_req_failed` increases. When failures cross the threshold, k6 aborts —
that's the breakpoint.
