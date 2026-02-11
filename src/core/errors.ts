export class MarvinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarvinError";
  }
}

export class ProjectNotFoundError extends MarvinError {
  constructor(searchedFrom: string) {
    super(
      `No .marvin/ directory found (searched from ${searchedFrom}). Run "marvin init" to create a project.`,
    );
    this.name = "ProjectNotFoundError";
  }
}

export class ConfigError extends MarvinError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class GitSyncError extends MarvinError {
  constructor(message: string) {
    super(message);
    this.name = "GitSyncError";
  }
}

export class ApiKeyMissingError extends MarvinError {
  constructor() {
    super(
      'No API key found. Set ANTHROPIC_API_KEY environment variable or run "marvin config api-key".',
    );
    this.name = "ApiKeyMissingError";
  }
}
