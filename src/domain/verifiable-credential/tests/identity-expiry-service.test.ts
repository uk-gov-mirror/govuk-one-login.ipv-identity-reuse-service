import { hasIdentityExpired } from "../identity-expiry-service.js";
import { Configuration } from "../../../commons/configuration.js";
import * as fraudCheckService from "../fraud-check-service.js";
import * as drivingLicenceExpiryService from "../driving-licence-expiry-service.js";
import { VerifiableCredentialJWT } from "../verifiable-credential-jwt.js";
import { vi, describe, it, beforeEach, expect } from "vitest";

vi.mock("../../../commons/logger");

const FRAUD_ISSUER = ["fraudCRI"];
const DCMAW_ISSUER = ["https://www.review-b.dev.account.gov.uk"];

const BASE_CONFIGURATION: Configuration = {
  evcsApiUrl: "https://evcs.gov.uk",
  interventionCodesToInvalidate: [],
  fraudIssuer: FRAUD_ISSUER,
  fraudValidityPeriod: 180,
  controllerAllowList: [],
  dcmawIssuer: DCMAW_ISSUER,
  drivingLicenceValidityPeriod: 180,
};

const createMockVc = (issuer: string): VerifiableCredentialJWT =>
  ({
    iss: issuer,
    nbf: Math.floor(Date.now() / 1000),
    sub: "test-user",
    vc: { evidence: [], type: ["VerifiableCredential", "IdentityCheckCredential"] },
  }) as unknown as VerifiableCredentialJWT;

describe("identity-expiry-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should return false when neither fraud nor driving licence has expired", () => {
    vi.spyOn(fraudCheckService, "hasFraudCheckExpired").mockReturnValue(false);
    vi.spyOn(drivingLicenceExpiryService, "hasDrivingLicenceExpired").mockReturnValue(false);

    const result = hasIdentityExpired([createMockVc("fraudCRI")], BASE_CONFIGURATION);
    expect(result).toBe(false);
  });

  it("should return true when fraud check has expired", () => {
    vi.spyOn(fraudCheckService, "hasFraudCheckExpired").mockReturnValue(true);
    vi.spyOn(drivingLicenceExpiryService, "hasDrivingLicenceExpired").mockReturnValue(false);

    const result = hasIdentityExpired([createMockVc("fraudCRI")], BASE_CONFIGURATION);
    expect(result).toBe(true);
  });

  it("should return true when driving licence has expired", () => {
    vi.spyOn(fraudCheckService, "hasFraudCheckExpired").mockReturnValue(false);
    vi.spyOn(drivingLicenceExpiryService, "hasDrivingLicenceExpired").mockReturnValue(true);

    const result = hasIdentityExpired([createMockVc("fraudCRI")], BASE_CONFIGURATION);
    expect(result).toBe(true);
  });

  it("should return true when both fraud and driving licence have expired", () => {
    vi.spyOn(fraudCheckService, "hasFraudCheckExpired").mockReturnValue(true);
    vi.spyOn(drivingLicenceExpiryService, "hasDrivingLicenceExpired").mockReturnValue(true);

    const result = hasIdentityExpired([createMockVc("fraudCRI")], BASE_CONFIGURATION);
    expect(result).toBe(true);
  });

  it("should return false when driving licence expiry check returns null", () => {
    vi.spyOn(fraudCheckService, "hasFraudCheckExpired").mockReturnValue(false);
    vi.spyOn(drivingLicenceExpiryService, "hasDrivingLicenceExpired").mockImplementation(vi.fn());

    const result = hasIdentityExpired([createMockVc("fraudCRI")], BASE_CONFIGURATION);
    expect(result).toBe(false);
  });

  it("should not check driving licence expiry when dcmawIssuer is undefined", () => {
    vi.spyOn(fraudCheckService, "hasFraudCheckExpired").mockReturnValue(false);
    const mockDlCheck = vi.spyOn(drivingLicenceExpiryService, "hasDrivingLicenceExpired");

    const configuration = { ...BASE_CONFIGURATION, dcmawIssuer: undefined };
    const result = hasIdentityExpired([createMockVc("fraudCRI")], configuration);

    expect(result).toBe(false);
    expect(mockDlCheck).not.toHaveBeenCalled();
  });

  it("should not check driving licence expiry when drivingLicenceValidityPeriod is undefined", () => {
    vi.spyOn(fraudCheckService, "hasFraudCheckExpired").mockReturnValue(false);
    const mockDlCheck = vi.spyOn(drivingLicenceExpiryService, "hasDrivingLicenceExpired");

    const configuration = { ...BASE_CONFIGURATION, drivingLicenceValidityPeriod: undefined };
    const result = hasIdentityExpired([createMockVc("fraudCRI")], configuration);

    expect(result).toBe(false);
    expect(mockDlCheck).not.toHaveBeenCalled();
  });

  it("should pass correct arguments to hasDrivingLicenceExpired", () => {
    vi.spyOn(fraudCheckService, "hasFraudCheckExpired").mockReturnValue(false);
    const mockDlCheck = vi.spyOn(drivingLicenceExpiryService, "hasDrivingLicenceExpired").mockReturnValue(false);

    const vcs = [createMockVc("fraudCRI")];
    hasIdentityExpired(vcs, BASE_CONFIGURATION);

    expect(mockDlCheck).toHaveBeenCalledWith(vcs, DCMAW_ISSUER, 180);
  });
});
