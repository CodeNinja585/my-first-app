import * as jose from 'jose';

/**
 * Verifies a Clerk access token using the JWT public key
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
    let publicKey: jose.KeyLike;

    // Check if the key is a JWK string or a PEM string
    if (jwtKey.startsWith('{') || jwtKey.startsWith('[')) {
      // It's a JWK string - parse and import
      const jwk = JSON.parse(jwtKey);
      publicKey = (await jose.importJWK(jwk, 'RS256')) as jose.KeyLike;
    } else {
      // It's a PEM string - import as SPKI
      publicKey = (await jose.importSPKI(jwtKey, 'RS256')) as jose.KeyLike;
    }

    // Verify the token
    const { payload } = await jose.jwtVerify(token, publicKey, {
      clockTolerance: 0,
    });

    return {
      sub: payload.sub as string,
      sid: payload.sid as string,
      exp: payload.exp as number,
    };
  } catch (error) {
    throw new Error(`Invalid token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
