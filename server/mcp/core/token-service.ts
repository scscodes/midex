import { randomBytes } from 'crypto';
import type { TokenPayload, TokenValidation } from '../types/index.js';
import { TokenPayloadSchema } from '../types/index.js';

export class TokenService {
  private readonly TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 hours

  generateToken(executionId: string, stepName: string): string {
    if (!executionId || typeof executionId !== 'string' || executionId.trim().length === 0) {
      throw new Error('execution_id must be a non-empty string');
    }
    if (!stepName || typeof stepName !== 'string' || stepName.trim().length === 0) {
      throw new Error('step_name must be a non-empty string');
    }

    const payload: TokenPayload = {
      execution_id: executionId,
      step_name: stepName,
      issued_at: new Date().toISOString(),
      nonce: randomBytes(16).toString('hex'),
    };

    const json = JSON.stringify(payload);
    const base64 = Buffer.from(json, 'utf-8').toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  validateToken(token: string): TokenValidation {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return { valid: false, error: 'Token must be a non-empty string' };
    }

    try {
      let base64 = token.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4 !== 0) base64 += '=';

      const json = Buffer.from(base64, 'base64').toString('utf-8');
      const result = TokenPayloadSchema.safeParse(JSON.parse(json));

      if (!result.success) {
        return { valid: false, error: `Invalid token payload: ${result.error.message}` };
      }

      const issuedAt = new Date(result.data.issued_at);
      const age = Date.now() - issuedAt.getTime();

      if (age > this.TOKEN_LIFETIME_MS) {
        return { valid: false, error: `Token expired (issued ${Math.floor(age / 1000 / 60)} minutes ago)` };
      }
      if (age < 0) {
        return { valid: false, error: 'Token issued in the future' };
      }

      return { valid: true, payload: result.data };
    } catch (error) {
      return { valid: false, error: `Token decode failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
