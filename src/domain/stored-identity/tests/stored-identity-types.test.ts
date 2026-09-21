import { describe, it, expect } from "vitest";
import { isStoredIdentityRecord } from "../stored-identity-types.js";

const validJwt = () => ({
  sub: "user-sub",
  credentials: ["sig1", "sig2"],
  vot: "P2",
  vtm: "https://oidc.account.gov.uk/trustmark",
  claims: {
    "https://vocab.account.gov.uk/v1/coreIdentity": {
      name: [{ nameParts: [{ type: "GivenName", value: "Jane" }] }],
      birthDate: [{ value: "1990-01-15" }],
    },
    "https://vocab.account.gov.uk/v1/address": [{ streetName: "Downing Street", postalCode: "SW1A 2AA" }],
  },
});

describe("isStoredIdentityRecord", () => {
  it("should return true for a valid StoredIdentityRecord", () => {
    expect(isStoredIdentityRecord(validJwt())).toBe(true);
  });

  it("should return false when sub is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { sub, ...jwt } = validJwt();
    expect(isStoredIdentityRecord(jwt)).toBe(false);
  });

  it("should return false when credentials is not an array", () => {
    expect(isStoredIdentityRecord({ ...validJwt(), credentials: "not-an-array" })).toBe(false);
  });

  it("should return false when vot is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { vot, ...jwt } = validJwt();
    expect(isStoredIdentityRecord(jwt)).toBe(false);
  });

  it("should return false when vtm is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { vtm, ...jwt } = validJwt();
    expect(isStoredIdentityRecord(jwt)).toBe(false);
  });

  it("should return false when claims is missing", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { claims, ...jwt } = validJwt();
    expect(isStoredIdentityRecord(jwt)).toBe(false);
  });

  it("should return false when claims is null", () => {
    expect(isStoredIdentityRecord({ ...validJwt(), claims: undefined })).toBe(false);
  });

  it("should return false when coreIdentity is missing", () => {
    const jwt = validJwt();
    jwt.claims = {
      "https://vocab.account.gov.uk/v1/coreIdentity": undefined as never,
      "https://vocab.account.gov.uk/v1/address": jwt.claims["https://vocab.account.gov.uk/v1/address"],
    };
    expect(isStoredIdentityRecord(jwt)).toBe(false);
  });

  it("should return false when name is missing", () => {
    const jwt = validJwt();
    jwt.claims["https://vocab.account.gov.uk/v1/coreIdentity"] = {
      birthDate: [{ value: "1990-01-15" }],
    } as never;
    expect(isStoredIdentityRecord(jwt)).toBe(false);
  });

  it("should return false when name is empty", () => {
    const jwt = validJwt();
    jwt.claims["https://vocab.account.gov.uk/v1/coreIdentity"] = {
      name: [],
      birthDate: [{ value: "1990-01-15" }],
    };
    expect(isStoredIdentityRecord(jwt)).toBe(false);
  });

  it("should return false when birthDate is missing", () => {
    const jwt = validJwt();
    jwt.claims["https://vocab.account.gov.uk/v1/coreIdentity"] = {
      name: [{ nameParts: [{ type: "GivenName", value: "Jane" }] }],
    } as never;
    expect(isStoredIdentityRecord(jwt)).toBe(false);
  });

  it("should return false when birthDate is empty", () => {
    const jwt = validJwt();
    jwt.claims["https://vocab.account.gov.uk/v1/coreIdentity"] = {
      name: [{ nameParts: [{ type: "GivenName", value: "Jane" }] }],
      birthDate: [],
    };
    expect(isStoredIdentityRecord(jwt)).toBe(false);
  });

  it("should return false when address is missing", () => {
    const jwt = validJwt();
    jwt.claims = {
      "https://vocab.account.gov.uk/v1/coreIdentity": jwt.claims["https://vocab.account.gov.uk/v1/coreIdentity"],
    } as never;
    expect(isStoredIdentityRecord(jwt)).toBe(false);
  });

  it("should return false for empty stored identity JWT", () => {
    expect(isStoredIdentityRecord({})).toBe(false);
  });

  it("should return false for a string stored identity JWT", () => {
    expect(isStoredIdentityRecord("not-an-object")).toBe(false);
  });
});
