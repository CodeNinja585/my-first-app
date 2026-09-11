import fastify, { FastifyInstance } from 'fastify';
import { env } from './config/env';

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: false,
  });

  // Health check endpoint
  app.get('/v1/health', async (request, reply) => {
    return {
      status: 'ok',
      version: '1.0.0',
    };
  });

  return app;
}
