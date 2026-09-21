import { HttpCodesEnum } from "./constants.js";

export class PolicyGenerationError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "PolicyGenerationError";
  }
}

export class TokenValidationError extends Error {
  constructor(public readonly statusCode: HttpCodesEnum) {
    super("Token validation failed");
    this.name = "TokenValidationError";
  }
}

export class EVCSError extends Error {
  constructor(
    public readonly statusCode: HttpCodesEnum,
    public readonly userId: string,
    public readonly journeyId?: string
  ) {
    super("EVCS request failed");
    this.name = "EVCSError";
  }
}

export class StoredIdentityValidationError extends Error {
  constructor() {
    super("Stored identity JWT does not match expected format");
    this.name = "StoredIdentityValidationError";
  }
}
