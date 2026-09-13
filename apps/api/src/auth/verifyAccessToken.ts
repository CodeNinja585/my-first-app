import { verifyToken as clerkVerifyToken } from '@clerk/backend';
import { webcrypto } from 'node:crypto';

import { env } from '../config/env';

/**
 * Converts a JWK public key to PEM format for Clerk's verifyToken
 * Uses node:crypto WebCrypto API for the conversion
 * @param jwk The JWK public key object
 * @returns The PEM formatted public key string
 */
async function jwkToPem(jwk: { n: string; e: string; kty: string }): Promise<string> {
  // Use WebCrypto API to import the JWK and export as SPKI PEM
  const importedKey = await webcrypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true, // extractable
    ['verify']
  );

  const spkiDer = await webcrypto.subtle.exportKey('spki', importedKey);
  const base64 = Buffer.from(spkiDer).toString('base64');
  const lines = [];
  for (let i = 0; i < base64.length; i += 64) {
    lines.push(base64.substring(i, i + 64));
  }
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----\n`;
}

/**
 * Verifies a Clerk access token using the JWT public key
 * Uses @clerk/backend verifyToken in networkless mode
 * @param token The access token to verify
 * @param jwtKey The public key in JWK or PEM format
 * @returns The decoded token payload if valid
 * @throws Error if the token is invalid
 */
export async function verifyAccessToken(
  token: string,
  jwtKey: string
): Promise<{
  sub: string;
  sid: string;
  exp: number;
}> {
  try {
    // Clerk's verifyToken expects PEM format for jwtKey
    // If the input is JWK format (starts with { or [), convert it to PEM
    let keyToUse = jwtKey;

    if (jwtKey.startsWith('{') || jwtKey.startsWith('[')) {
      try {
        const jwk = JSON.parse(jwtKey);
        keyToUse = await jwkToPem(jwk);
      } catch {
        // If parsing fails, pass the original key - it might already be PEM format
      }
    }

    const result = await clerkVerifyToken(token, {
      jwtKey: keyToUse,
      // Networkless mode: no apiUrl or secretKey needed
    });

    // VerifyToken returns the JwtPayload directly or null/undefined on failure
    if (!result) {
      throw new Error('Invalid token: verification returned null');
    }

    return {
      sub: result.sub,
      sid: result.sid,
      exp: result.exp,
    };
  } catch (error) {
    throw new Error(`Invalid token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
