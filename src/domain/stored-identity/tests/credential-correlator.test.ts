import { StoredIdentityRecord } from "../stored-identity-types.js";
import { correlateCredentials } from "../credential-correlator.js";
import { vi, describe, it, expect } from "vitest";

vi.mock("../../commons/logger");

describe("correlateCredentials", () => {
  it("should return true when signatures in stored identity match credentials", () => {
    const storedIdentityRecord: StoredIdentityRecord = createStoredIdentityRecord("ererwefg", "giukgmas");

    const encodedCredentialJwts = ["someheader.somebody.ererwefg", "someheader.somebody.giukgmas"];
    const encodedCredentialJwtsReversed = ["someheader.somebody.giukgmas", "someheader.somebody.ererwefg"];

    expect(correlateCredentials(storedIdentityRecord, encodedCredentialJwts)).toBe(true);
    expect(correlateCredentials(storedIdentityRecord, encodedCredentialJwtsReversed)).toBe(true);
  });

  it("should return false when signatures in stored identity differ to credentials", () => {
    const storedIdentityRecord: StoredIdentityRecord = createStoredIdentityRecord("ererwefg", "giukgmas");
    const encodedCredentialJwts = ["someheader.somebody.ererwefg", "someheader.somebody.baqlvsff"];

    expect(correlateCredentials(storedIdentityRecord, encodedCredentialJwts)).toBe(false);
  });

  it("should return false when stored identity has extra signature", () => {
    const storedIdentityRecord: StoredIdentityRecord = createStoredIdentityRecord("ererwefg", "baqlvsff", "giukgmas");
    const encodedCredentialJwts = ["someheader.somebody.ererwefg", "someheader.somebody.baqlvsff"];

    expect(correlateCredentials(storedIdentityRecord, encodedCredentialJwts)).toBe(false);
  });

  it("should return false when stored identity has missing signature", () => {
    const storedIdentityRecord: StoredIdentityRecord = createStoredIdentityRecord("ererwefg", "baqlvsff");
    const encodedCredentialJwts = [
      "someheader.somebody.ererwefg",
      "someheader.somebody.baqlvsff",
      "someheader.somebody.giukgmas",
    ];

    expect(correlateCredentials(storedIdentityRecord, encodedCredentialJwts)).toBe(false);
  });

  it("should return false when stored identity has zero signatures and there are no credentials", () => {
    const storedIdentityRecord: StoredIdentityRecord = createStoredIdentityRecord();
    const encodedCredentialJwts: string[] = [];

    expect(correlateCredentials(storedIdentityRecord, encodedCredentialJwts)).toBe(false);
  });
});

const createStoredIdentityRecord = (...signatures: string[]): StoredIdentityRecord => {
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
