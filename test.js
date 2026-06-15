import http from 'k6/http';

export const options = {
  scenarios: {
    breakpoint: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 300,
      maxVUs: 3000,
      stages: [
        { duration: '20s', target: 100 },
        { duration: '30s', target: 300 },
        { duration: '30s', target: 600 },
        { duration: '30s', target: 1000 },
        { duration: '30s', target: 1500 },
        { duration: '30s', target: 2500 },
      ],
    },
  },
  thresholds: {
    // Stop once the service is clearly broken (>25% failures for 15s).
    http_req_failed: [{ threshold: 'rate<0.25', abortOnFail: true, delayAbortEval: '15s' }],
  },
};

export default function () {
  http.get('http://localhost:8080', {
    timeout: '10s',
    headers: { 'Accept-Encoding': 'gzip' }, // make nginx spend CPU compressing
  });
}
