import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "../../config/env.js";
import type { TokenPair } from "./auth.types.js";

type TokenType = "access" | "refresh";
export interface AuthTokenClaims extends JWTPayload {
  sub: string;
  tid: string;
  typ: TokenType;
  ver: number;
}

const getSecret = (type: TokenType) => {
  const value = type === "access" ? env.jwt.accessSecret : env.jwt.refreshSecret;
  if (!value || value.length < 32) throw new Error(`JWT_${type.toUpperCase()}_SECRET must be at least 32 characters`);
  return new TextEncoder().encode(value);
};

export class TokenService {
  private async sign(type: TokenType, userId: string, tenantId: string, version: number) {
    const ttl = type === "access" ? env.jwt.accessTtlSeconds : env.jwt.refreshTtlSeconds;
    return new SignJWT({ tid: tenantId, typ: type, ver: version })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer(env.jwt.issuer)
      .setAudience(env.jwt.audience)
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(getSecret(type));
  }

  async issue(userId: string, tenantId: string, version: number): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.sign("access", userId, tenantId, version),
      this.sign("refresh", userId, tenantId, version),
    ]);
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: env.jwt.accessTtlSeconds,
      refreshTokenExpiresIn: env.jwt.refreshTtlSeconds,
    };
  }

  async verify(token: string, expectedType: TokenType): Promise<AuthTokenClaims> {
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, getSecret(expectedType), {
        algorithms: ["HS256"],
        issuer: env.jwt.issuer,
        audience: env.jwt.audience,
      });
      payload = result.payload;
    } catch {
      // Unified error surface: signature failures (wrong-type token, tampered payload,
      // wrong key) and structural failures all produce the same message so callers
      // and tests do not need to distinguish jose error sub-types.
      throw new Error("Invalid token claims");
    }
    if (
      payload.typ !== expectedType || typeof payload.sub !== "string" ||
      typeof payload.tid !== "string" || typeof payload.ver !== "number"
    ) throw new Error("Invalid token claims");
    return payload as AuthTokenClaims;
  }
}
