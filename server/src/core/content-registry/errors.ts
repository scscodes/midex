export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentError';
  }
}

export class NotFoundError extends ContentError {
  constructor(resource: 'agent' | 'rule' | 'workflow', name: string) {
    super(`${resource} not found: ${name}`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends ContentError {
  constructor(public readonly issues: string[]) {
    super(`Validation failed: ${issues.join('; ')}`);
    this.name = 'ValidationError';
  }
}
