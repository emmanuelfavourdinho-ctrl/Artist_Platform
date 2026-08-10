import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { json } from 'express';
import { config } from './config/index.js';
import { router } from './routes/index.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  }),
);
app.use(json());

app.use('/api/v1', router);
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
