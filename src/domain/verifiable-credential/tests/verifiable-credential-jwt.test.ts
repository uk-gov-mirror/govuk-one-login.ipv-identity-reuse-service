import { isIdentityCheckCredential } from "../verifiable-credential-jwt.js";
import { IdentityCheckCredentialJWTClass } from "@govuk-one-login/data-vocab/credentials.js";
import { describe, it, expect } from "vitest";

describe("isIdentityCheckCredential", () => {
  it("should return true when vc.type includes IdentityCheckCredential", () => {
    const vc = {
      vc: {
        type: ["VerifiableCredential", "IdentityCheckCredential"],
        evidence: [],
      },
    } as unknown as IdentityCheckCredentialJWTClass;

    expect(isIdentityCheckCredential(vc)).toBe(true);
  });

  it("should return false when vc.type does not include IdentityCheckCredential", () => {
    const vc = {
      vc: {
        type: ["VerifiableCredential", "SomeOtherCredential"],
        evidence: [],
      },
    } as unknown as IdentityCheckCredentialJWTClass;

    expect(isIdentityCheckCredential(vc)).toBe(false);
  });

  it("should return false when vc.type is not an array", () => {
    const vc = {
      vc: {
        type: "IdentityCheckCredential",
        evidence: [],
      },
    } as unknown as IdentityCheckCredentialJWTClass;

    expect(isIdentityCheckCredential(vc)).toBe(false);
  });

  it("should return false when vc.type is undefined", () => {
    const vc = {
      vc: {
        evidence: [],
      },
    } as unknown as IdentityCheckCredentialJWTClass;

    expect(isIdentityCheckCredential(vc)).toBe(false);
  });

  it("should return false when vc is undefined", () => {
    const vc = {} as unknown as IdentityCheckCredentialJWTClass;

    expect(isIdentityCheckCredential(vc)).toBe(false);
  });
});
