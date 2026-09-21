import { APIGatewayProxyEvent, Context } from "aws-lambda";
import { handler } from "../post-phase2-user-identity-handler.js";
import { HttpCodesEnum } from "../../../commons/constants.js";
import * as configuration from "../../../commons/configuration.js";
import { Configuration } from "../../../commons/configuration.js";
import { UserIdentityResponse } from "../post-phase2-user-identity-response.js";
import { UserIdentityRequest } from "../post-phase2-user-identity-request.js";
import * as identityExpiryService from "../../../domain/verifiable-credential/identity-expiry-service.js";

import * as AuditModule from "../../../commons/audit.js";
import * as ValidateStoredIdentity from "../../../domain/stored-identity/stored-identity-validator.js";
import { getDefaultJwtHeader, sign } from "../../../../shared-test/jwt-utilities.js";
import logger from "../../../commons/logger.js";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";
import {
  createCredentialStoreIdentityResponse,
  createCredentialStoreIdentityResponseWithStates,
  createSignedIdentityCheckCredentialJWT,
} from "../../../../shared-test/evcs-api-utilities.js";
import { EVCSError, TokenValidationError } from "../../../commons/errors.js";
import { EVCSIdentityResponse } from "../../../api/evcs-api.js";

vi.mock("../../../commons/logger");
vi.mock("../../../commons/audit");
vi.mock("../../../domain/stored-identity/stored-identity-validator", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getUserIdFromJwt: vi.fn(),
  handleGetIdentityFromCredentialStore: vi.fn(),
  validateStoredIdentity: vi.fn(),
}));

const CURRENT = "CURRENT";
const HISTORIC = "HISTORIC";
const TEST_USER = "urn:fdc:gov.uk:2022:TEST_USER-S7jcrHLGBj-2kgB-8-cYhVrMdo3CV0LlD7An";
const FRAUD_ISSUER = "fraudCRI";
const PASSPORT_ISSUER = "passportCRI";

const TEST_FRAUD_VALIDITY_DAYS: number = 180; // ~6 months

const event = () => {
  return {
    headers: {
      accept: "*/*",
      Host: "stack-name.token-generator.dev.account.gov.uk",
      "X-Amzn-Trace-Id": "Root=1-666bf197-43c06e88748f092a5cc812a9",
      "x-api-key": "a-pretend-api-key-value",
      "X-Forwarded-For": "123.123.123.123",
      "X-Forwarded-Port": "443",
      "X-Forwarded-Proto": "https",
      Authorization:
        "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiIsImtpZCI6ImVjS2lkMTIzIn0.eyJzdWIiOiJ1cm46ZmRjOmdvdi51azoyMDIyOlRFU1RfVVNFUi1TN2pjckhMR0JqLTJrZ0ItOC1jWWhWck1kbzNDVjBMbEQ3QW4iLCJleHAiOjE3NTczMjQyMTcsImlhdCI6MTc1NzMyMzkxNywiaXNzIjoiaHR0cHM6Ly9tb2NrLmNyZWRlbnRpYWwtc3RvcmUuYnVpbGQuYWNjb3VudC5nb3YudWsvb3JjaGVzdHJhdGlvbiIsImF1ZCI6Imh0dHBzOi8vY3JlZGVudGlhbC1zdG9yZS5idWlsZC5hY2NvdW50Lmdvdi51ayIsInNjb3BlIjoicHJvdmluZyJ9.Sj-2jA6mLdfkU1ryoBCNHxpBCT49o9qfqpKPMLkKwY1D6V6SvVIERGbC0X-fh8SYk2z-strc9vahvacvkrNDUQ",
    },
    body: JSON.stringify({
      vtr: ["P2"],
      govukSigninJourneyId: "govuk_signin_journey_id",
    } satisfies UserIdentityRequest),
  } as unknown as APIGatewayProxyEvent;
};

const mockEVCSResponse = (response: EVCSIdentityResponse) => {
  (globalThis.fetch as Mock) = vi.fn().mockResolvedValue(
    Response.json(response, {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
};

let newEvent: APIGatewayProxyEvent;
let mockLoggerAppendKeys: Mock;

beforeEach(() => {
  vi.useFakeTimers({ now: 1_759_240_815_925 });
  vi.clearAllMocks();
  newEvent = event();
  vi.spyOn(configuration, "getConfiguration").mockResolvedValue({
    evcsApiUrl: "https://evcs.gov.uk",
    controllerAllowList: ["api.identity.dev.account.gov.uk"],
    fraudIssuer: [FRAUD_ISSUER],
    fraudValidityPeriod: TEST_FRAUD_VALIDITY_DAYS,
  } as Configuration);
  vi.spyOn(identityExpiryService, "hasIdentityExpired").mockReturnValue(false);
  (ValidateStoredIdentity.getUserIdFromJwt as Mock).mockReturnValue(TEST_USER);
  (ValidateStoredIdentity.validateStoredIdentity as Mock).mockResolvedValue({
    kidValid: true,
    signatureValid: true,
    isValid: true,
  });
  mockLoggerAppendKeys = vi.spyOn(logger, "appendKeys").mockImplementation(vi.fn());
});

describe("user-identity-handler authorization", () => {
  it("should return Success, given a valid bearer token", async () => {
    const { mockEVCSData, credentialSignatures } = await createCredentialStoreIdentityResponse([
      await createSignedIdentityCheckCredentialJWT(PASSPORT_ISSUER),
      await createSignedIdentityCheckCredentialJWT(FRAUD_ISSUER),
    ]);
    mockEVCSResponse(mockEVCSData);
    (ValidateStoredIdentity.handleGetIdentityFromCredentialStore as Mock).mockResolvedValue(mockEVCSData);

    const auditIdentityRecordReadSpy = vi.spyOn(AuditModule, "auditIdentityRecordRead");
    const auditIdentityRecordReturnedSpy = vi.spyOn(AuditModule, "auditIdentityRecordReturned");

    const result = await handler(newEvent, {} as Context);

    expect(result.statusCode).toBe(HttpCodesEnum.OK);
    const body = JSON.parse(result.body) as UserIdentityResponse;
    expect(body).toStrictEqual({
      vot: "P3",
      content: {
        sub: "user-sub",
        vot: "P2",
        vtm: "https://oidc.account.gov.uk/trustmark",
        credentials: credentialSignatures,
        claims: {
          "https://vocab.account.gov.uk/v1/coreIdentity": {
            name: [
              {
                nameParts: [
                  { type: "GivenName", value: "Test" },
                  { type: "FamilyName", value: "User" },
                ],
              },
            ],
            birthDate: [{ value: "1990-01-01" }],
          },
          "https://vocab.account.gov.uk/v1/address": [{ streetName: "Test Street", postalCode: "TE1 1ST" }],
        },
      },
      expired: false,
      isValid: true,
      kidValid: true,
      signatureValid: true,
    });
    expect(ValidateStoredIdentity.handleGetIdentityFromCredentialStore).toHaveBeenCalledWith(
      "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiIsImtpZCI6ImVjS2lkMTIzIn0.eyJzdWIiOiJ1cm46ZmRjOmdvdi51azoyMDIyOlRFU1RfVVNFUi1TN2pjckhMR0JqLTJrZ0ItOC1jWWhWck1kbzNDVjBMbEQ3QW4iLCJleHAiOjE3NTczMjQyMTcsImlhdCI6MTc1NzMyMzkxNywiaXNzIjoiaHR0cHM6Ly9tb2NrLmNyZWRlbnRpYWwtc3RvcmUuYnVpbGQuYWNjb3VudC5nb3YudWsvb3JjaGVzdHJhdGlvbiIsImF1ZCI6Imh0dHBzOi8vY3JlZGVudGlhbC1zdG9yZS5idWlsZC5hY2NvdW50Lmdvdi51ayIsInNjb3BlIjoicHJvdmluZyJ9.Sj-2jA6mLdfkU1ryoBCNHxpBCT49o9qfqpKPMLkKwY1D6V6SvVIERGbC0X-fh8SYk2z-strc9vahvacvkrNDUQ",
      TEST_USER,
      "govuk_signin_journey_id"
    );
    expect(ValidateStoredIdentity.validateStoredIdentity).toHaveBeenCalledWith(mockEVCSData);
    expect(auditIdentityRecordReadSpy).toHaveBeenCalledWith(
      {
        max_vot: "P3",
        retrieval_outcome: "success",
        timestamp_fraud_check_nbf: 1_759_240_815,
      },
      {
        stored_identity_jwt: mockEVCSData.si.vc,
      },
      TEST_USER,
      "govuk_signin_journey_id"
    );
    expect(auditIdentityRecordReturnedSpy).toHaveBeenCalledWith(
      {
        response_outcome: "returned",
        is_valid: true,
        expired: false,
        vot: "P2",
      },
      {
        response_body: JSON.stringify(body),
      },
      TEST_USER,
      "govuk_signin_journey_id"
    );
  });

  it("should append govuk_signin_journey_id to logger, given a valid request", async () => {
    const { mockEVCSData } = await createCredentialStoreIdentityResponse([
      await createSignedIdentityCheckCredentialJWT(PASSPORT_ISSUER),
      await createSignedIdentityCheckCredentialJWT(FRAUD_ISSUER),
    ]);
    mockEVCSResponse(mockEVCSData);
    (ValidateStoredIdentity.handleGetIdentityFromCredentialStore as Mock).mockResolvedValue(mockEVCSData);

    await handler(newEvent, {} as Context);

    expect(mockLoggerAppendKeys).toHaveBeenCalledWith({
      govuk_signin_journey_id: "govuk_signin_journey_id",
    });
  });

  it("kidValid and signatureValid are passed through from validateIdentityRecords", async () => {
    const { mockEVCSData } = await createCredentialStoreIdentityResponse([], getDefaultJwtHeader());
    (ValidateStoredIdentity.handleGetIdentityFromCredentialStore as Mock).mockResolvedValue(mockEVCSData);
    (ValidateStoredIdentity.validateStoredIdentity as Mock).mockResolvedValue({
      kidValid: true,
      signatureValid: false,
      isValid: true,
    });

    const result = await handler(newEvent, {} as Context);

    expect(result.statusCode).toBe(HttpCodesEnum.OK);
    const body = JSON.parse(result.body) as UserIdentityResponse;
    expect(body).toStrictEqual({
      vot: "P3",
      content: {
        sub: "user-sub",
        vot: "P2",
        vtm: "https://oidc.account.gov.uk/trustmark",
        claims: {
          "https://vocab.account.gov.uk/v1/coreIdentity": {
            name: [
              {
                nameParts: [
                  { type: "GivenName", value: "Test" },
                  { type: "FamilyName", value: "User" },
                ],
              },
            ],
            birthDate: [{ value: "1990-01-01" }],
          },
          "https://vocab.account.gov.uk/v1/address": [{ streetName: "Test Street", postalCode: "TE1 1ST" }],
        },
      },
      expired: false,
      isValid: true,
      kidValid: true,
      signatureValid: false,
    });
  });

  it("should return Bad Request, given an invalid body", async () => {
    newEvent.body = undefined as never as string;
    const result = handler(newEvent, {} as Context);
    await expect(result).resolves.toEqual({
      statusCode: HttpCodesEnum.BAD_REQUEST,
      body: JSON.stringify({ error: "bad_request", error_description: "Bad request from client" }),
    });
    expect(mockLoggerAppendKeys).not.toHaveBeenCalled();
  });

  it("should return Unauthorised given no Bearer token", async () => {
    (ValidateStoredIdentity.getUserIdFromJwt as Mock).mockImplementation(() => {
      throw new TokenValidationError(HttpCodesEnum.UNAUTHORIZED);
    });
    newEvent.headers["Authorization"] = "";
    const result = handler(newEvent, {} as Context);
    await expect(result).resolves.toEqual({
      statusCode: HttpCodesEnum.UNAUTHORIZED,
      body: JSON.stringify({ error: "invalid_token", error_description: "Bearer token is missing or invalid" }),
    });
  });

  it("should return Unauthorised given the Bearer token is malformed", async () => {
    (ValidateStoredIdentity.getUserIdFromJwt as Mock).mockImplementation(() => {
      throw new TokenValidationError(HttpCodesEnum.UNAUTHORIZED);
    });
    newEvent.headers["Authorization"] = "Bearer bad.bearer.token";
    const result = handler(newEvent, {} as Context);
    await expect(result).resolves.toEqual({
      statusCode: HttpCodesEnum.UNAUTHORIZED,
      body: JSON.stringify({ error: "invalid_token", error_description: "Bearer token is missing or invalid" }),
    });
  });

  it("should return 403 given EVCS API responded with Forbidden", async () => {
    const auditIdentityRecordReadSpy = vi.spyOn(AuditModule, "auditIdentityRecordRead");
    const auditIdentityRecordReturnedSpy = vi.spyOn(AuditModule, "auditIdentityRecordReturned");

    (ValidateStoredIdentity.handleGetIdentityFromCredentialStore as Mock).mockRejectedValue(
      new EVCSError(HttpCodesEnum.FORBIDDEN, TEST_USER, "govuk_signin_journey_id")
    );

    const result = handler(newEvent, {} as Context);
    await expect(result).resolves.toEqual({
      statusCode: HttpCodesEnum.FORBIDDEN,
      body: JSON.stringify({ error: "forbidden", error_description: "Access token expired or not permitted" }),
    });
    expect(auditIdentityRecordReadSpy).toHaveBeenCalledWith(
      {
        retrieval_outcome: "service_error",
      },
      {
        stored_identity_jwt: undefined,
      },
      TEST_USER,
      "govuk_signin_journey_id"
    );
    expect(auditIdentityRecordReturnedSpy).toHaveBeenCalledWith(
      {
        response_outcome: "error",
        error_code: "forbidden",
      },
      {
        response_body: '{"error":"forbidden","error_description":"Access token expired or not permitted"}',
      },
      TEST_USER,
      "govuk_signin_journey_id"
    );
  });

  it("should return 401 given EVCS API responded with Unauthorized", async () => {
    const auditIdentityRecordReadSpy = vi.spyOn(AuditModule, "auditIdentityRecordRead");
    const auditIdentityRecordReturnedSpy = vi.spyOn(AuditModule, "auditIdentityRecordReturned");
    (ValidateStoredIdentity.handleGetIdentityFromCredentialStore as Mock).mockRejectedValue(
      new EVCSError(HttpCodesEnum.UNAUTHORIZED, TEST_USER, "govuk_signin_journey_id")
    );
    const result = handler(newEvent, {} as Context);
    await expect(result).resolves.toEqual({
      statusCode: HttpCodesEnum.UNAUTHORIZED,
      body: JSON.stringify({ error: "invalid_token", error_description: "Bearer token is missing or invalid" }),
    });
    expect(auditIdentityRecordReadSpy).toHaveBeenCalledWith(
      {
        retrieval_outcome: "service_error",
      },
      {
        stored_identity_jwt: undefined,
      },
      TEST_USER,
      "govuk_signin_journey_id"
    );
    expect(auditIdentityRecordReturnedSpy).toHaveBeenCalledWith(
      {
        response_outcome: "error",
        error_code: "authentication_failure",
      },
      {
        response_body: '{"error":"invalid_token","error_description":"Bearer token is missing or invalid"}',
      },
      TEST_USER,
      "govuk_signin_journey_id"
    );
  });

  it("should return 500 given EVCS API responded with Internal Server Error", async () => {
    const auditIdentityRecordReadSpy = vi.spyOn(AuditModule, "auditIdentityRecordRead");
    const auditIdentityRecordReturnedSpy = vi.spyOn(AuditModule, "auditIdentityRecordReturned");
    (ValidateStoredIdentity.handleGetIdentityFromCredentialStore as Mock).mockRejectedValue(
      new EVCSError(HttpCodesEnum.INTERNAL_SERVER_ERROR, TEST_USER, "govuk_signin_journey_id")
    );
    const result = handler(newEvent, {} as Context);
    await expect(result).resolves.toEqual({
      statusCode: HttpCodesEnum.INTERNAL_SERVER_ERROR,
      body: JSON.stringify({ error: "server_error", error_description: "Unable to retrieve data" }),
    });
    expect(auditIdentityRecordReadSpy).toHaveBeenCalledWith(
      {
        retrieval_outcome: "service_error",
      },
      {
        stored_identity_jwt: undefined,
      },
      TEST_USER,
      "govuk_signin_journey_id"
    );
    expect(auditIdentityRecordReturnedSpy).toHaveBeenCalledWith(
      {
        response_outcome: "error",
        error_code: "service_error",
      },
      {
        response_body: '{"error":"server_error","error_description":"Unable to retrieve data"}',
      },
      TEST_USER,
      "govuk_signin_journey_id"
    );
  });

  it("should return 404 given EVCS API responded with Not Found", async () => {
    const auditIdentityRecordReadSpy = vi.spyOn(AuditModule, "auditIdentityRecordRead");
    const auditIdentityRecordReturnedSpy = vi.spyOn(AuditModule, "auditIdentityRecordReturned");
    (ValidateStoredIdentity.handleGetIdentityFromCredentialStore as Mock).mockRejectedValue(
      new EVCSError(HttpCodesEnum.NOT_FOUND, TEST_USER, "govuk_signin_journey_id")
    );
    const result = handler(newEvent, {} as Context);
    await expect(result).resolves.toEqual({
      statusCode: HttpCodesEnum.NOT_FOUND,
      body: JSON.stringify({
        error: "not_found",
        error_description: "No Stored Identity exists for this user or Stored Identity has been invalidated",
      }),
    });
    expect(auditIdentityRecordReadSpy).toHaveBeenCalledWith(
      {
        retrieval_outcome: "no_record",
      },
      {
        stored_identity_jwt: undefined,
      },
      TEST_USER,
      "govuk_signin_journey_id"
    );
    expect(auditIdentityRecordReturnedSpy).toHaveBeenCalledWith(
      {
        response_outcome: "error",
        error_code: "no_record",
      },
      {
        response_body:
          '{"error":"not_found","error_description":"No Stored Identity exists for this user or Stored Identity has been invalidated"}',
      },
      TEST_USER,
      "govuk_signin_journey_id"
    );
  });
});

describe("user-identity-handler expired", () => {
  const NOW: string = "2025-08-24T15:35:58.000Z";
  const NOT_EXPIRED_NBF: string = "2025-02-26T16:30:04.000Z";
  const EXPIRED_NBF: string = "2025-01-12T10:02:54.000Z";
  const RANDOM_NBF: string = "2023-04-25T15:01:36.000Z";

  beforeEach(() => {
    vi.spyOn(identityExpiryService, "hasIdentityExpired").mockRestore();
    vi.setSystemTime(new Date(NOW));
  });

  it.each([
    { fraudCheckInputs: [{ nbf: NOT_EXPIRED_NBF, state: CURRENT }], expectedExpired: false },
    { fraudCheckInputs: [{ nbf: EXPIRED_NBF, state: CURRENT }], expectedExpired: true },
    {
      fraudCheckInputs: [
        { nbf: NOT_EXPIRED_NBF, state: CURRENT },
        { nbf: EXPIRED_NBF, state: HISTORIC },
      ],
      expectedExpired: false,
    },
    {
      fraudCheckInputs: [
        { nbf: EXPIRED_NBF, state: CURRENT },
        { nbf: NOT_EXPIRED_NBF, state: HISTORIC },
      ],
      expectedExpired: true,
    },
  ])(`should set expired value based on NBF of CURRENT fraud check`, async ({ fraudCheckInputs, expectedExpired }) => {
    const fraudChecks = await Promise.all(
      fraudCheckInputs.map(async (input) => {
        return { signedVc: await createSignedIdentityCheckCredentialJWT(FRAUD_ISSUER, input.nbf), state: input.state };
      })
    );
    const passportCheck = await createSignedIdentityCheckCredentialJWT(PASSPORT_ISSUER, RANDOM_NBF);

    const { mockEVCSData, credentialSignatures } = await createCredentialStoreIdentityResponseWithStates([
      ...fraudChecks,
      { signedVc: passportCheck, state: CURRENT },
    ]);
    (ValidateStoredIdentity.handleGetIdentityFromCredentialStore as Mock).mockResolvedValue(mockEVCSData);

    const result = await handler(newEvent, {} as Context);

    expect(result.statusCode).toBe(HttpCodesEnum.OK);
    const body = JSON.parse(result.body) as UserIdentityResponse;
    expect(body).toStrictEqual({
      vot: "P3",
      content: {
        sub: "user-sub",
        vot: "P2",
        vtm: "https://oidc.account.gov.uk/trustmark",
        credentials: credentialSignatures,
        claims: {
          "https://vocab.account.gov.uk/v1/coreIdentity": {
            name: [
              {
                nameParts: [
                  { type: "GivenName", value: "Test" },
                  { type: "FamilyName", value: "User" },
                ],
              },
            ],
            birthDate: [{ value: "1990-01-01" }],
          },
          "https://vocab.account.gov.uk/v1/address": [{ streetName: "Test Street", postalCode: "TE1 1ST" }],
        },
      },
      expired: expectedExpired,
      isValid: true,
      kidValid: true,
      signatureValid: true,
    });
  });
});

describe("user-identity-handler expired field", () => {
  it("should set expired to true when hasIdentityExpired returns true", async () => {
    vi.spyOn(identityExpiryService, "hasIdentityExpired").mockReturnValue(true);

    const { mockEVCSData } = await createCredentialStoreIdentityResponse([
      await createSignedIdentityCheckCredentialJWT(PASSPORT_ISSUER),
      await createSignedIdentityCheckCredentialJWT(FRAUD_ISSUER),
    ]);
    (ValidateStoredIdentity.handleGetIdentityFromCredentialStore as Mock).mockResolvedValue(mockEVCSData);

    const result = await handler(newEvent, {} as Context);

    expect(result.statusCode).toBe(HttpCodesEnum.OK);
    const body = JSON.parse(result.body) as UserIdentityResponse;
    expect(body.expired).toBe(true);
  });

  it("should set expired to false when hasIdentityExpired returns false", async () => {
    vi.spyOn(identityExpiryService, "hasIdentityExpired").mockReturnValue(false);

    const { mockEVCSData } = await createCredentialStoreIdentityResponse([
      await createSignedIdentityCheckCredentialJWT(PASSPORT_ISSUER),
      await createSignedIdentityCheckCredentialJWT(FRAUD_ISSUER),
    ]);
    (ValidateStoredIdentity.handleGetIdentityFromCredentialStore as Mock).mockResolvedValue(mockEVCSData);

    const result = await handler(newEvent, {} as Context);

    expect(result.statusCode).toBe(HttpCodesEnum.OK);
    const body = JSON.parse(result.body) as UserIdentityResponse;
    expect(body.expired).toBe(false);
  });
});

describe("user-identity-handler max_vot", () => {
  it("should set $.vot from unsignedVot if max_vot property not present in stored identity JWT", async () => {
    const storedIdentityRecordJwt = await sign(getDefaultJwtHeader(), {
      sub: "user-sub",
      vot: "P2",
      vtm: "https://oidc.account.gov.uk/trustmark",
      credentials: [],
    });

    const mockEVCSData: EVCSIdentityResponse = {
      si: {
        vc: storedIdentityRecordJwt,
        metadata: undefined,
        unsignedVot: "P3",
      },
      vcs: [],
    };

    (ValidateStoredIdentity.handleGetIdentityFromCredentialStore as Mock).mockResolvedValue(mockEVCSData);

    const result = await handler(newEvent, {} as Context);
    expect(result.statusCode).toBe(HttpCodesEnum.OK);
    const body = JSON.parse(result.body) as UserIdentityResponse;
    expect(body.vot).toEqual("P3");
  });

  it("should set $.vot from max_vot property in stored identity JWT if present", async () => {
    const storedIdentityRecordJwt = await sign(getDefaultJwtHeader(), {
      sub: "user-sub",
      vot: "P2",
      max_vot: "P3",
      vtm: "https://oidc.account.gov.uk/trustmark",
      credentials: [],
    });

    const mockEVCSData: EVCSIdentityResponse = {
      si: {
        vc: storedIdentityRecordJwt,
        metadata: undefined,
        unsignedVot: "P4", //setting this to something different to maxVot to test it gets the right value
      },
      vcs: [],
    };

    (ValidateStoredIdentity.handleGetIdentityFromCredentialStore as Mock).mockResolvedValue(mockEVCSData);

    const result = await handler(newEvent, {} as Context);
    expect(result.statusCode).toBe(HttpCodesEnum.OK);
    const body = JSON.parse(result.body) as UserIdentityResponse;
    expect(body.vot).toEqual("P3");
  });
});
