import Stripe from 'stripe';
import { config } from '../config/index.js';

export const stripe = new Stripe(config.stripeSecretKey, {
  apiVersion: '2026-08-26.dahlia',
});
