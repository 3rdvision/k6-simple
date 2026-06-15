# k6 Breakpoint Test Demo

A small, self-contained demo of [k6](https://k6.io/)'s load-testing capabilities.
It spins up a deliberately CPU-constrained web service and ramps traffic against
it until the service breaks — a classic **breakpoint test** that finds the point
where a system stops coping with load.

## Requirements

| Tool               | Why                                  | Install                                                                                               |
| ------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Docker**         | Runs the nginx target container.     | [get-docker](https://docs.docker.com/get-docker/)                                                     |
| **Docker Compose** | Brings the target up/down.           | [install](https://docs.docker.com/compose/install/) (bundled with Docker Desktop)                     |
| **k6**             | Runs the load test.                  | [install-k6](https://grafana.com/docs/k6/latest/set-up/install-k6/)                                   |

Verify they're available:

```sh
docker --version
docker compose version   # older standalone binary: docker-compose --version
k6 version
```

## Running it

```sh
docker compose up -d     # 1. start the target service
k6 run test.js           # 2. run the load test
docker compose down      # 3. tear down when finished
```

Optionally watch the container saturate its CPU cap in another terminal:

```sh
docker stats webtest
```

As the arrival rate climbs, `http_req_duration` rises and `http_req_failed`
increases. When failures cross the threshold, k6 aborts — that's the breakpoint.

> Recent Docker ships Compose as the `docker compose` subcommand. With the older
> standalone binary, use `docker-compose` (hyphenated) instead.

## How it works

Two files make up the demo:

| File                  | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `docker-compose.yaml` | The nginx target, CPU-capped so it can be overwhelmed. |
| `test.js`             | The k6 breakpoint scenario and threshold.            |

### The target (`docker-compose.yaml`)

A single `nginx:alpine` container, made intentionally easy to overwhelm:

- **Hard cap of `1.0` CPU core** and `128m` memory, so it can realistically be
  driven to 100% utilization.
- **gzip level 9** over a ~256 KB, barely-compressible random payload. Static
  serving is nearly free, so gzip is the CPU-cost "knob" that lets the capped
  nginx saturate and start dropping connections.
- **Small accept backlog (`backlog=64`)** so overflow connections are dropped
  rather than queued once nginx saturates — producing the failures the test looks for.
- A `/healthz` endpoint (gzip off) for the container healthcheck.

The vhost config and payload are generated at container startup, so nothing
extra needs to live on disk.

### The test (`test.js`)

A single scenario using the **`ramping-arrival-rate`** executor, which drives a
target *request rate* rather than a fixed number of virtual users:

- Ramps the arrival rate in stages — `50 → 100 → 300 → 600 → 1000 → 1500 → 2500`
  requests/s over ~2m50s.
- Pre-allocates 300 VUs, scaling up to 3000 to sustain the rate as responses slow.
- Each iteration sends one `GET http://localhost:8080` with a 10s timeout and an
  `Accept-Encoding: gzip` header (forcing nginx to spend CPU compressing).
- A **threshold with `abortOnFail`** stops the test once failures exceed **25%
  for 15s**. The arrival rate at which that happens is the system's breakpoint.
