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

// Extend Express Request type using core module augmentation
declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
  }
}

export const app = express();

/* ------------------------------------------------------------------ */
/* Trust Proxy                                                        */
/* ------------------------------------------------------------------ */
if (config.trustProxy) {
  app.set('trust proxy', 1);
}

/* ------------------------------------------------------------------ */
/* Liveness Probe                                                     */
/* ------------------------------------------------------------------ */
app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));

/* ------------------------------------------------------------------ */
/* Security Headers                                                   */
/* ------------------------------------------------------------------ */
app.use(helmet());

/* ------------------------------------------------------------------ */
/* CORS Configuration                                                 */
/* ------------------------------------------------------------------ */
const allowedOrigins = config.corsOrigin;

app.use(
  cors({
    origin(origin, callback) {
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
/* Rate Limiting                                                      */
/* ------------------------------------------------------------------ */
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.rateLimit?.max ?? 100,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

/* ------------------------------------------------------------------ */
/* Body Parsing & Cookies                                             */
/* ------------------------------------------------------------------ */
app.use(json({ limit: config.jsonBodyLimit }));
app.use(hpp());

// Signed Cookie Parser - Fixes the signed cookie 500 error
app.use(cookieParser(config.cookieSecret));

/* ------------------------------------------------------------------ */
/* Performance                                                        */
/* ------------------------------------------------------------------ */
app.use(compression());

/* ------------------------------------------------------------------ */
/* Request Tracing & Structured Logging                               */
/* ------------------------------------------------------------------ */
app.use((req, res, next) => {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
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
/* Routes & Error Handlers                                            */
/* ------------------------------------------------------------------ */
app.use('/api/v1', router);
app.use(notFoundHandler);
app.use(errorHandler);
