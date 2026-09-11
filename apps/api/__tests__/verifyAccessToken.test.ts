import { describe, it, expect, vi } from 'vitest';
import * as jose from 'jose';
import { verifyAccessToken } from '../src/auth/verifyAccessToken';

describe('verifyAccessToken', () => {
  let privateKey: jose.KeyLike;
  let publicKey: jose.KeyLike;

  beforeAll(async () => {
    // Generate a keypair for testing
    const { privateKey: genPrivateKey, publicKey: genPublicKey } =
      await jose.generateKeyPair('RS256');
    privateKey = genPrivateKey;
    publicKey = genPublicKey;
  });

  it('verifies a valid token and returns payload', async () => {
    const validTokenData = {
      sub: 'user_123',
      sid: 'sess_123',
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const validToken = await new jose.SignJWT(validTokenData)
      .setProtectedHeader({ alg: 'RS256' })
      .sign(privateKey);

    const jwtKey = JSON.stringify(await jose.exportJWK(publicKey));

    const payload = await verifyAccessToken(validToken, jwtKey);
    expect(payload.sub).toBe('user_123');
    expect(payload.sid).toBe('sess_123');
  });

  it('rejects an expired token', async () => {
    const expiredTokenData = {
      sub: 'user_123',
      sid: 'sess_123',
      iat: Math.floor(Date.now() / 1000) - 7200,
      nbf: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600,
    };

    const expiredToken = await new jose.SignJWT(expiredTokenData)
      .setProtectedHeader({ alg: 'RS256' })
      .sign(privateKey);

    const jwtKey = JSON.stringify(await jose.exportJWK(publicKey));

    await expect(verifyAccessToken(expiredToken, jwtKey)).rejects.toThrow();
  });

  it('rejects a malformed token', async () => {
    const jwtKey = JSON.stringify(await jose.exportJWK(publicKey));

    await expect(verifyAccessToken('invalid.token.here', jwtKey)).rejects.toThrow();
  });

  it('rejects a token signed with wrong key', async () => {
    // Generate a different keypair
    const { privateKey: wrongPrivateKey, publicKey: wrongPublicKey } =
      await jose.generateKeyPair('RS256');

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

    const jwtKey = JSON.stringify(await jose.exportJWK(publicKey));

    await expect(verifyAccessToken(wrongKeyToken, jwtKey)).rejects.toThrow();
  });
});
