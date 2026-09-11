import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as jose from 'jose';

// Generate a keypair for testing
let testPrivateKey: jose.KeyLike;
let testPublicKeyJwk: string;

describe('Auth', () => {
  let app: any;

  beforeAll(async () => {
    // Generate a keypair for testing
    const { privateKey, publicKey } = await jose.generateKeyPair('RS256');
    testPrivateKey = privateKey;
    testPublicKeyJwk = JSON.stringify(await jose.exportJWK(publicKey));
  });

  it('returns 200 with userId for valid token', async () => {
    // Mock the env module before importing buildApp
    vi.mock(
      '../src/config/env',
      () => ({
        env: {
          CLERK_SECRET_KEY: 'sk_test_mock',
          CLERK_JWT_KEY: testPublicKeyJwk,
          PORT: 3000,
          NODE_ENV: 'test',
        },
      }),
      { virtual: true }
    );

    const { buildApp } = await import('../src/buildApp');

    const app = buildApp();
    await app.ready();

    // Create valid token (expires in 1 hour)
    const validTokenData = {
      sub: 'user_123',
      sid: 'sess_123',
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const validToken = await new jose.SignJWT(validTokenData)
      .setProtectedHeader({ alg: 'RS256' })
      .sign(testPrivateKey);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: {
        authorization: `Bearer ${validToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.userId).toBe('user_123');

    await app.close();
  });

  it('returns 401 when missing authorization header', async () => {
    vi.mock(
      '../src/config/env',
      () => ({
        env: {
          CLERK_SECRET_KEY: 'sk_test_mock',
          CLERK_JWT_KEY: testPublicKeyJwk,
          PORT: 3000,
          NODE_ENV: 'test',
        },
      }),
      { virtual: true }
    );

    const { buildApp } = await import('../src/buildApp');

    const app = buildApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('unauthorized');

    await app.close();
  });

  it('returns 401 when token is expired', async () => {
    vi.mock(
      '../src/config/env',
      () => ({
        env: {
          CLERK_SECRET_KEY: 'sk_test_mock',
          CLERK_JWT_KEY: testPublicKeyJwk,
          PORT: 3000,
          NODE_ENV: 'test',
        },
      }),
      { virtual: true }
    );

    const { buildApp } = await import('../src/buildApp');

    const app = buildApp();
    await app.ready();

    const expiredTokenData = {
      sub: 'user_123',
      sid: 'sess_123',
      iat: Math.floor(Date.now() / 1000) - 7200,
      nbf: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600,
    };

    const expiredToken = await new jose.SignJWT(expiredTokenData)
      .setProtectedHeader({ alg: 'RS256' })
      .sign(testPrivateKey);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: {
        authorization: `Bearer ${expiredToken}`,
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('invalid_token');

    await app.close();
  });

  it('returns 401 when token is malformed', async () => {
    vi.mock(
      '../src/config/env',
      () => ({
        env: {
          CLERK_SECRET_KEY: 'sk_test_mock',
          CLERK_JWT_KEY: testPublicKeyJwk,
          PORT: 3000,
          NODE_ENV: 'test',
        },
      }),
      { virtual: true }
    );

    const { buildApp } = await import('../src/buildApp');

    const app = buildApp();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: {
        authorization: 'Bearer invalid.token.here',
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('invalid_token');

    await app.close();
  });

  it('returns 401 when token is signed with wrong key', async () => {
    vi.mock(
      '../src/config/env',
      () => ({
        env: {
          CLERK_SECRET_KEY: 'sk_test_mock',
          CLERK_JWT_KEY: testPublicKeyJwk,
          PORT: 3000,
          NODE_ENV: 'test',
        },
      }),
      { virtual: true }
    );

    const { buildApp } = await import('../src/buildApp');

    const app = buildApp();
    await app.ready();

    // Generate a different keypair
    const { privateKey: wrongPrivateKey } = await jose.generateKeyPair('RS256');

    // Sign with wrong key
    const wrongKeyToken = await new jose.SignJWT({
      sub: 'user_123',
      sid: 'sess_123',
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
      .setProtectedHeader({ alg: 'RS256' })
      .sign(wrongPrivateKey);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: {
        authorization: `Bearer ${wrongKeyToken}`,
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('invalid_token');

    await app.close();
  });
});
