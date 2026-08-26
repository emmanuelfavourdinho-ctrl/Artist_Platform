import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { json } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import { randomUUID } from 'node:crypto';
import { config } from './config/index.js';
import { router } from './routes/index.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

/* ------------------------------------------------------------------ */
/* Trust proxy                                                          */
/* ------------------------------------------------------------------ */
// Required behind a load balancer / reverse proxy (ALB, Nginx, Cloudflare)
// so req.ip, req.secure, and rate limiting see the real client IP instead
// of the proxy's. `1` trusts exactly one hop — adjust to your topology.
if (config.trustProxy) {
  app.set('trust proxy', 1);
}

/* ------------------------------------------------------------------ */
/* Liveness probe                                                       */
/* ------------------------------------------------------------------ */
// Mounted before body parsing / rate limiting / auth so orchestrator
// health checks (k8s, ECS) stay cheap and never get rate-limited or
// blocked by a downstream outage unrelated to process liveness.
app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));

/* ------------------------------------------------------------------ */
/* Security headers                                                     */
/* ------------------------------------------------------------------ */
app.use(helmet());

/* ------------------------------------------------------------------ */
/* CORS                                                                 */
/* ------------------------------------------------------------------ */
// `credentials: true` combined with a wildcard origin is both invalid
// per the CORS spec (browsers reject it) and a security foot-gun. Support
// config.corsOrigin as a single origin OR an allow-list array, and
// validate each request's Origin against it explicitly.
const allowedOrigins = config.corsOrigin;

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser requests (curl, server-to-server, same-origin)
      // that don't send an Origin header at all.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS policy`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  }),
);

/* ------------------------------------------------------------------ */
/* Rate limiting                                                        */
/* ------------------------------------------------------------------ */
// Coarse global limit as a baseline DoS/brute-force defense. Layer
// tighter, route-specific limiters (e.g. on /auth/login) in the router.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.rateLimit.max,
    standardHeaders: true, // RateLimit-* headers
    legacyHeaders: false, // disable deprecated X-RateLimit-* headers
  }),
);

/* ------------------------------------------------------------------ */
/* Body parsing                                                         */
/* ------------------------------------------------------------------ */
// Explicit size limit guards against large-payload memory exhaustion;
// express's default is 100kb but pinning it here keeps intent visible
// and configurable per-environment.
app.use(json({ limit: config.jsonBodyLimit }));

// Protects against HTTP Parameter Pollution (?id=1&id=2 overriding
// expected types in req.query / req.body).
app.use(hpp());

// Reads any cookies sent with the request (like our admin session
// cookie) into req.cookies, so requireAdmin.ts can actually access it.
// Pass a secret so tampered cookies are rejected via req.signedCookies
// rather than silently trusted as req.cookies.
app.use(cookieParser(config.cookieSecret));

/* ------------------------------------------------------------------ */
/* Performance                                                          */
/* ------------------------------------------------------------------ */
app.use(compression());

/* ------------------------------------------------------------------ */
/* Request logging / tracing                                            */
/* ------------------------------------------------------------------ */
// Structured, per-request JSON log line with a correlation ID, so a
// single request can be traced across services and grepped in log
// aggregators. Attach req.id before anything downstream needs it.
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id']?.toString() || randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'request',
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
        ts: new Date().toISOString(),
      }),
    );
  });

  next();
});

/* ------------------------------------------------------------------ */
/* Routes                                                               */
/* ------------------------------------------------------------------ */
app.use('/api/v1', router);
app.use(notFoundHandler);

// errorHandler must be last and must also catch body-parser's
// SyntaxError on malformed JSON (thrown synchronously by `json()`
// above) and CORS rejection errors from the origin callback — both
// land here rather than crashing the process.
app.use(errorHandler);

export { app };
