import { SendMessageCommandOutput } from "@aws-sdk/client-sqs";
import { Verifier, type VerifierOptions } from "@pact-foundation/pact";
import type { Server } from "node:http";
import path from "node:path";
import { getDefaultJwtHeader, sign } from "../../../../shared-test/jwt-utilities.js";
import * as AuditModule from "../../../commons/audit.js";
import type { Configuration } from "../../../commons/configuration.js";
import * as ConfigurationModule from "../../../commons/configuration.js";
import { StoredIdentityJWT } from "../../../domain/stored-identity/stored-identity-types.js";
import * as FraudCheckService from "../../../domain/verifiable-credential/fraud-check-service.js";
import type { VerifiableCredentialJWT } from "../../../domain/verifiable-credential/verifiable-credential-jwt.js";
import { createServer as createProviderServer } from "./sis-provider-app.js";
import { vi, describe, it, beforeAll, beforeEach, afterAll, expect } from "vitest";
import { EVCSErrorResponse, EVCSIdentityResponse } from "../../../api/evcs-api.js";

vi.mock("../../../commons/audit");

const PORT = 8080;

const validateEnvironment = () => {
  const environmentType = (process.env.PACT_TYPE || "file").toLowerCase();
  switch (environmentType) {
    case "server": {
      if (!process.env.PACT_URL) {
        throw new Error("Environment variable PACT_URL must be defined for server");
      }
      if (!process.env.PACT_USER) {
        throw new Error("Environment variable PACT_USER must be defined for server");
      }
      if (!process.env.PACT_PASSWORD) {
        throw new Error("Environment variable PACT_PASSWORD must be defined for server");
      }
      if (!process.env.PACT_BROKER_SOURCE_SECRET) {
        throw new Error("Environment variable PACT_BROKER_SOURCE_SECRET must be defined for server");
      }
      break;
    }
    case "file": {
      // Nothing required
      break;
    }
    default: {
      throw new Error(`Environment variable PACT_TYPE can only be 'file' or 'server'`);
    }
  }
};

const mockEVCSResponse = (response: EVCSIdentityResponse | EVCSErrorResponse, status: number = 200) => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(response, {
      status,
      headers: { "content-type": "application/json" },
    })
  );
};

describe("Sis Pact Verification", () => {
  let server: Server;

  beforeAll(() => {
    validateEnvironment();
    server = createProviderServer(PORT);
  });

  beforeEach(() => {
    vi.spyOn(ConfigurationModule, "getConfiguration").mockResolvedValue({
      evcsApiUrl: "https://evcs.gov.uk",
      controllerAllowList: ["did:web:api.identity.dev.account.gov.uk"],
    } as Configuration);
    vi.spyOn(ConfigurationModule, "getServiceApiKey").mockResolvedValue("an-api-key");
    vi.spyOn(FraudCheckService, "hasFraudCheckExpired").mockReturnValue(false);
    vi.spyOn(AuditModule, "sendAuditMessage").mockImplementation(async () => ({}) as SendMessageCommandOutput);
  });

  afterAll(() => {
    server?.close();
  });

  it("validates expectations of Stored Identity Service", async () => {
    const environmentType = (process.env.PACT_TYPE || "file").toLowerCase();

    let mockEVCSData: EVCSIdentityResponse;

    const options: VerifierOptions = {
      provider: "SisProvider",
      providerBaseUrl: `http://127.0.0.1:${PORT}`,
      ...(environmentType === "server" && {
        pactBrokerUrl: `${process.env.PACT_URL}?testSource=${process.env.PACT_BROKER_SOURCE_SECRET}`,
        pactBrokerUsername: process.env.PACT_USER,
        pactBrokerPassword: process.env.PACT_PASSWORD,
      }),
      ...(environmentType === "file" && {
        pactUrls: [path.resolve(process.cwd(), "pacts", "SisConsumerTests-StoredIdentityService.json")],
      }),
      consumerVersionSelectors: [{ mainBranch: true }, { deployedOrReleased: true }, { latest: true }],
      publishVerificationResult: process.env.PUBLISH_RESULT?.toLowerCase() === "true",
      logLevel: "info",
      providerVersion: process.env.PROVIDER_APP_VERSION || "1.0.0",
      providerVersionBranch: process.env.GIT_BRANCH || "none",
      beforeEach: async (): Promise<unknown> => {
        mockEVCSData = await createCredentialStoreIdentityResponse();
        mockEVCSResponse(mockEVCSData);

        return {};
      },
      stateHandlers: {
        "stored identity does not exist": async () => {
          mockEVCSResponse({ message: "not found" }, 404);
        },
        "[P1, P2] and test-gov-journey-id are valid but record was not found": async () => {
          mockEVCSResponse({ message: "not found" }, 404);
        },
        "[P1, P2] and test-gov-journey-id are valid": async () => {},
        "A request returns 500": async () => {
          mockEVCSResponse({ message: "internal server error" }, 500);
        },
        "A request returns at least P2 vot": async () => {
          // Do nothing, already returns P2 vot
        },
        "Malformed response is missing vtr": async () => {
          // Do nothing, the response never has vtr
        },
        "Request is missing mandatory field vtr": async () => {
          // Do nothing, schema validator should handle it
        },
        "test-expired-access-token is expired bearer token": async () => {
          mockEVCSResponse({ message: "unauthorized" }, 403);
        },
        "test-invalid-access-token is invalid bearer token": async () => {
          return {
            authorization: "test-invalid-access-token",
          };
        },
      },
    };

    await expect(new Verifier(options).verifyProvider()).resolves.toBeDefined();
  });
}, 10_000);

const createCredentialStoreIdentityResponse = async (
  verifiableCredentialStates: { vc: VerifiableCredentialJWT; state: string }[] = []
): Promise<EVCSIdentityResponse> => {
  const storedIdentity: StoredIdentityJWT = {
    sub: "user-sub",
    vot: "P2",
    iss: "http://api.example.com",
    vtm: "https://oidc.account.gov.uk/trustmark",
    credentials: [],
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
  };

  const defaultStoredIdentityHeader = getDefaultJwtHeader();

  return {
    si: {
      vc: await sign(defaultStoredIdentityHeader, storedIdentity),
      metadata: undefined,
      unsignedVot: storedIdentity.max_vot || storedIdentity.vot,
    },
    vcs: await Promise.all(
      verifiableCredentialStates.map(async (vcState) => {
        return { state: vcState.state, vc: await sign(defaultStoredIdentityHeader, vcState.vc), metadata: undefined };
      })
    ),
  };
};
