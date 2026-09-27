import dns from 'dns';
if (dns.setDefaultResultOrder) {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch {}
}

import { createApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { prisma } from './config/prisma';
import './config/redis';

async function main() {
  const app = createApp();

  await prisma.$connect();
  logger.info('✅ PostgreSQL connected');

  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`🚀 Backend listening on http://0.0.0.0:${env.PORT}`);
  });

  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
