import { prisma } from '../src/lib/prisma.js';
import { reconcileCheckoutIntents } from '../src/services/checkoutReconciliationService.js';

try {
  const result = await reconcileCheckoutIntents();
  console.log(JSON.stringify({ operation: 'checkout_intent_reconciliation', ...result }));
  if (result.failed > 0) process.exitCode = 1;
} catch (error) {
  console.error('Checkout intent reconciliation failed.', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
