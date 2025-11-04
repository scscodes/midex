export class DiscoveryError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'DiscoveryError';
  }
}

export class PathNotFoundError extends DiscoveryError {
  constructor(path: string) {
    super(`Path does not exist: ${path}`, 'PATH_NOT_FOUND');
    this.name = 'PathNotFoundError';
  }
}

export class InvalidPathError extends DiscoveryError {
  constructor(path: string, reason: string) {
    super(`Invalid path: ${path} - ${reason}`, 'INVALID_PATH');
    this.name = 'InvalidPathError';
  }
}

