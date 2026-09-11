import fastify, { FastifyInstance } from 'fastify';
import { env } from './config/env';
import { verifyAccessToken } from './auth/verifyAccessToken';

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: false,
  });

  // Health check endpoint (no auth required)
  app.get('/v1/health', async (request, reply) => {
    return {
      status: 'ok',
      version: '1.0.0',
    };
  });

  // Auth verification hook
  const verifyAuth = async (request: any, reply: any) => {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.code(401).send({
        error: {
          code: 'unauthorized',
          message: 'Missing or invalid authorization header',
          type: 'auth_error',
        },
      });
      return;
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    try {
      const payload = await verifyAccessToken(token, env.CLERK_JWT_KEY);
      request.user = payload;
    } catch (error) {
      reply.code(401).send({
        error: {
          code: 'invalid_token',
          message: 'Invalid or expired token',
          type: 'auth_error',
        },
      });
    }
  };

  // Protected routes
  app.get('/v1/me', { preHandler: [verifyAuth] }, async (request: any, reply) => {
    return {
      userId: request.user.sub,
    };
  });

  return app;
}
