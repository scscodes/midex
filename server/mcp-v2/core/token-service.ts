/**
 * Token Service
 *
 * Manages token generation and validation for step-by-step workflow execution.
 * Tokens are base64url-encoded JSON payloads with:
 * - execution_id: Workflow execution identifier
 * - step_name: Current step name
 * - issued_at: ISO 8601 timestamp
 * - nonce: Random string for replay prevention
 *
 * Token lifetime: 24 hours
 * Format: base64url(JSON.stringify(payload))
 */

import { randomBytes } from 'crypto';
import type {
  TokenPayload,
  TokenValidation,
} from '../types/index.js';
import { TokenPayloadSchema } from '../types/index.js';

export class TokenService {
  private readonly TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Generate a new token for a workflow step
   */
  generateToken(executionId: string, stepName: string): string {
    const payload: TokenPayload = {
      execution_id: executionId,
      step_name: stepName,
      issued_at: new Date().toISOString(),
      nonce: this.generateNonce(),
    };

    // Encode as base64url
    const json = JSON.stringify(payload);
    const base64 = Buffer.from(json, 'utf-8').toString('base64');
    // Convert to base64url (RFC 4648)
    const base64url = base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return base64url;
  }

  /**
   * Validate a token and extract payload
   */
  validateToken(token: string): TokenValidation {
    try {
      // Decode base64url
      const base64 = this.base64urlToBase64(token);
      const json = Buffer.from(base64, 'base64').toString('utf-8');
      const payload = JSON.parse(json);

      // Validate schema
      const result = TokenPayloadSchema.safeParse(payload);
      if (!result.success) {
        return {
          valid: false,
          error: `Invalid token payload: ${result.error.message}`,
        };
      }

      const validPayload = result.data;

      // Check expiration
      const issuedAt = new Date(validPayload.issued_at);
      const now = new Date();
      const age = now.getTime() - issuedAt.getTime();

      if (age > this.TOKEN_LIFETIME_MS) {
        return {
          valid: false,
          error: `Token expired (issued ${Math.floor(age / 1000 / 60)} minutes ago)`,
        };
      }

      if (age < 0) {
        return {
          valid: false,
          error: 'Token issued in the future',
        };
      }

      return {
        valid: true,
        payload: validPayload,
      };
    } catch (error) {
      return {
        valid: false,
        error: `Token decode failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Generate a cryptographically random nonce
   */
  private generateNonce(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Convert base64url to base64
   */
  private base64urlToBase64(base64url: string): string {
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');

    // Add padding
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }

    return base64;
  }
}
