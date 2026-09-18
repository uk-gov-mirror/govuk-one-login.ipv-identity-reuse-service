import { StoredIdentityJWT } from "../../domain/stored-identity/stored-identity-types.js";
import { validateStoredIdentityCredentials } from "../stored-identity-validator.js";
import { vi, describe, it, expect } from "vitest";

vi.mock("../../commons/logger");

describe("validateStoredIdentityCredentials", () => {
  it("should return true when signatures in stored identity match credentials", () => {
    const storedIdentityRecord: StoredIdentityJWT = createStoredIdentityRecord("ererwefg", "giukgmas");

    const encodedCredentialJwts = ["someheader.somebody.ererwefg", "someheader.somebody.giukgmas"];
    const encodedCredentialJwtsReversed = ["someheader.somebody.giukgmas", "someheader.somebody.ererwefg"];

    expect(validateStoredIdentityCredentials(storedIdentityRecord, encodedCredentialJwts)).toBe(true);
    expect(validateStoredIdentityCredentials(storedIdentityRecord, encodedCredentialJwtsReversed)).toBe(true);
  });

  it("should return false when signatures in stored identity differ to credentials", () => {
    const storedIdentityRecord: StoredIdentityJWT = createStoredIdentityRecord("ererwefg", "giukgmas");
    const encodedCredentialJwts = ["someheader.somebody.ererwefg", "someheader.somebody.baqlvsff"];

    expect(validateStoredIdentityCredentials(storedIdentityRecord, encodedCredentialJwts)).toBe(false);
  });

  it("should return false when stored identity has extra signature", () => {
    const storedIdentityRecord: StoredIdentityJWT = createStoredIdentityRecord("ererwefg", "baqlvsff", "giukgmas");
    const encodedCredentialJwts = ["someheader.somebody.ererwefg", "someheader.somebody.baqlvsff"];

    expect(validateStoredIdentityCredentials(storedIdentityRecord, encodedCredentialJwts)).toBe(false);
  });

  it("should return false when stored identity has missing signature", () => {
    const storedIdentityRecord: StoredIdentityJWT = createStoredIdentityRecord("ererwefg", "baqlvsff");
    const encodedCredentialJwts = [
      "someheader.somebody.ererwefg",
      "someheader.somebody.baqlvsff",
      "someheader.somebody.giukgmas",
    ];

    expect(validateStoredIdentityCredentials(storedIdentityRecord, encodedCredentialJwts)).toBe(false);
  });

  it("should return false when stored identity has zero signatures and there are no credentials", () => {
    const storedIdentityRecord: StoredIdentityJWT = createStoredIdentityRecord();
    const encodedCredentialJwts: string[] = [];

    expect(validateStoredIdentityCredentials(storedIdentityRecord, encodedCredentialJwts)).toBe(false);
  });
});

const createStoredIdentityRecord = (...signatures: string[]): StoredIdentityJWT => {
  return {
    sub: "userId",
    credentials: signatures,
    vot: "P2",
    vtm: "",
    claims: {
      "https://vocab.account.gov.uk/v1/coreIdentity": {},
      "https://vocab.account.gov.uk/v1/address": [],
    },
  };
};
