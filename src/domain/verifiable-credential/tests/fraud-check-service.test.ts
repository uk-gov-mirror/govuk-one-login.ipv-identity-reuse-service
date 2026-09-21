import { getFraudVc, hasFraudCheckExpired } from "../fraud-check-service.js";
import {
  FraudCheckType,
  IdentityCheckClass,
  IdentityCheckCredentialJWTClass,
  RiskAssessmentCredentialJWTClass,
  SecurityCheckCredentialJWTClass,
} from "@govuk-one-login/data-vocab/credentials.js";
import * as configuration from "../../../commons/configuration.js";
import { Configuration } from "../../../commons/configuration.js";
import { vi, describe, it, beforeEach, expect } from "vitest";

const mockSuccessfulEvidence: IdentityCheckClass = {
  checkDetails: [
    {
      checkMethod: "data",
    },
  ],
};

const VALIDITY_PERIOD = 180;
const FRAUD_ISSUERS = ["fraudCRI"];

vi.mock("../../../commons/logger");

describe("hasFraudCheckExpired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(configuration, "getConfiguration").mockResolvedValue({
      fraudIssuer: ["fraudCRI"],
      fraudValidityPeriod: 180,
    } as Configuration);
  });

  it.each([
    [false, "2025-02-25T15:35:58.000Z", "2025-08-23T15:35:58.000Z"],
    [true, "2025-02-25T15:35:58.000Z", "2025-08-25T15:35:58.000Z"],
    [true, "2025-02-25T14:35:58.000Z", "2025-08-24T15:35:57.000Z"],
    [true, "2025-02-25T16:35:58.000Z", "2025-08-24T15:35:57.000Z"],
    [false, "2025-02-25T15:35:58.000Z", "2025-08-23T23:00:00.000+01:00"],
    [false, "2025-02-25T15:35:58.000Z", "2025-08-23T11:59:59.000Z"],
    [true, "2025-02-25T15:35:58.000Z", "2025-08-24T12:00:00.000Z"],
  ])(
    "should return %s with fraud check nbf of %s, validity period of 180 days, and current dateTime of %s",
    async (expiryResult: boolean, fraudNbfDate: string, mockSystemDate: string) => {
      const vcBundle = [
        createValidFraudVC(fraudNbfDate),
        createIdentityCheckCredentialJWT("2025-07-25T15:35:58.000Z", "passportCRI", mockSuccessfulEvidence),
      ];

      fakeSystemTime(new Date(mockSystemDate));
      const fraudCheckExpired = hasFraudCheckExpired(getFraudVc(vcBundle, FRAUD_ISSUERS), VALIDITY_PERIOD);
      expect(fraudCheckExpired).toEqual(expiryResult);
    }
  );

  it("should return true if no fraud VC exists in bundle", async () => {
    const vcBundle = [
      createIdentityCheckCredentialJWT("2025-08-25T15:35:58.000Z", "passportCRI", mockSuccessfulEvidence),
    ];
    fakeSystemTime(new Date("2025-09-10T15:35:58.000Z"));
    const fraudCheckExpired = hasFraudCheckExpired(getFraudVc(vcBundle, FRAUD_ISSUERS), VALIDITY_PERIOD);
    expect(fraudCheckExpired).toEqual(true);
  });

  it("should use fraud credential with latest nbf if multiple exist in a bundle", async () => {
    const vcBundle = [createValidFraudVC("2025-01-25T15:35:58.000Z"), createValidFraudVC("2025-07-26T15:35:58.000Z")];
    fakeSystemTime(new Date("2025-08-24T15:35:58.000Z"));
    const fraudCheckExpired = hasFraudCheckExpired(getFraudVc(vcBundle, FRAUD_ISSUERS), VALIDITY_PERIOD);
    expect(fraudCheckExpired).toEqual(false);

    const fraudCheckExpiredReversed = hasFraudCheckExpired(getFraudVc(vcBundle, FRAUD_ISSUERS), VALIDITY_PERIOD);
    expect(fraudCheckExpiredReversed).toEqual(false);
  });

  it("should return true when the fraud credential has failedCheckDetails with fraudCheckType applicable_authoritative_source and the nbf is more than 6 months before the current time", async () => {
    const nbfDateExpired = "2025-01-25T15:35:58.000Z";
    const vcBundle = [
      createInvalidFraudVC(nbfDateExpired, "applicable_authoritative_source"),
      createSecurityCheckCredentialJWT(),
      createRiskAssessmentCredentialJWT(),
    ];
    const fraudCheckExpired = hasFraudCheckExpired(getFraudVc(vcBundle, FRAUD_ISSUERS), VALIDITY_PERIOD);
    expect(fraudCheckExpired).toEqual(true);
  });

  it("should return false when the fraud credential has failedCheckDetails with fraudCheckType applicable_authoritative_source and the nbf is less than 6 months before the current time", async () => {
    const nbfDateNotExpired = "2025-08-25T15:35:58.000Z";
    const vcBundle = [
      createInvalidFraudVC(nbfDateNotExpired, "applicable_authoritative_source"),
      createSecurityCheckCredentialJWT(),
      createRiskAssessmentCredentialJWT(),
    ];
    const fraudCheckExpired = hasFraudCheckExpired(getFraudVc(vcBundle, FRAUD_ISSUERS), VALIDITY_PERIOD);
    expect(fraudCheckExpired).toEqual(false);
  });

  it("should return true when the fraud credential has failedCheckDetails with fraudCheckType available_authoritative_source and the nbf is less than 6 months before the current time", async () => {
    const nbfDateNotExpired = "2025-08-25T15:35:58.000Z";
    const vcBundle = [
      createInvalidFraudVC(nbfDateNotExpired, "available_authoritative_source"),
      createSecurityCheckCredentialJWT(),
      createRiskAssessmentCredentialJWT(),
    ];
    const fraudCheckExpired = hasFraudCheckExpired(getFraudVc(vcBundle, FRAUD_ISSUERS), VALIDITY_PERIOD);
    expect(fraudCheckExpired).toEqual(true);
  });

  it("should return true when the fraud credential has failedCheckDetails with fraudCheckType available_authoritative_source and the nbf is more than 6 months before the current time", async () => {
    const nbfDateExpired = "2025-01-25T15:35:58.000Z";
    const vcBundle = [
      createInvalidFraudVC(nbfDateExpired, "available_authoritative_source"),
      createSecurityCheckCredentialJWT(),
      createRiskAssessmentCredentialJWT(),
    ];
    const fraudCheckExpired = hasFraudCheckExpired(getFraudVc(vcBundle, FRAUD_ISSUERS), VALIDITY_PERIOD);
    expect(fraudCheckExpired).toEqual(true);
  });
});

const getDateSeconds = (date: Date): number => {
  return date.getTime() / 1000;
};

const fakeSystemTime = (date: Date): void => {
  vi.useFakeTimers();
  vi.setSystemTime(date);
};

const createValidFraudVC = (nbfDate: string): IdentityCheckCredentialJWTClass =>
  createIdentityCheckCredentialJWT(nbfDate, "fraudCRI", mockSuccessfulEvidence);

const createInvalidFraudVC = (nbfDate: string, fraudCheckType: FraudCheckType): IdentityCheckCredentialJWTClass =>
  createIdentityCheckCredentialJWT(nbfDate, "fraudCRI", {
    failedCheckDetails: [
      {
        fraudCheck: fraudCheckType,
      },
    ],
  });

const createIdentityCheckCredentialJWT = (
  nbfDate: string,
  issuer: string,
  evidence: IdentityCheckClass
): IdentityCheckCredentialJWTClass => {
  const nbfSeconds = getDateSeconds(new Date(nbfDate));
  return {
    iss: issuer,
    nbf: nbfSeconds,
    sub: "sdf",
    vc: {
      evidence: [evidence],
      type: ["VerifiableCredential", "IdentityCheckCredential"],
    },
  };
};

const createSecurityCheckCredentialJWT = (): SecurityCheckCredentialJWTClass => {
  return {
    iss: "cimit",
    nbf: getDateSeconds(new Date("2025-01-25T15:35:58.000Z")),
    vc: {
      evidence: [{}],
      type: ["VerifiableCredential", "SecurityCheckCredential"],
    },
  };
};

const createRiskAssessmentCredentialJWT = (): RiskAssessmentCredentialJWTClass => {
  return {
    iss: "ticfCRI",
    nbf: getDateSeconds(new Date("2025-01-25T15:35:58.000Z")),
    vc: {
      evidence: [{}],
      type: ["VerifiableCredential", "RiskAssessmentCredential"],
    },
  };
};
