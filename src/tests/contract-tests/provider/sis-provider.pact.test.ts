import { SendMessageCommandOutput } from "@aws-sdk/client-sqs";
import { Verifier, type VerifierOptions } from "@pact-foundation/pact";
import type { Server } from "http";
import path from "node:path";
import { getDefaultJwtHeader, sign } from "../../../../shared-test/jwt-utils";
import * as AuditModule from "../../../commons/audit";
import type { Configuration } from "../../../commons/configuration";
import * as ConfigurationModule from "../../../commons/configuration";
import { CredentialStoreErrorResponse } from "../../../credential-store/credential-store-error-response";
import type { CredentialStoreIdentityResponse } from "../../../credential-store/credential-store-identity-response";
import { StoredIdentityJWT } from "../../../handlers/user-identity/stored-identity-jwt";
import * as FraudCheckService from "../../../identity-reuse/fraud-check-service";
import type { VerifiableCredentialJWT } from "../../../identity-reuse/verifiable-credential-jwt";
import { createServer as createProviderServer } from "./sis-provider-app";

const PORT = 8080;

jest.setTimeout(10000);

const validateEnvironment = () => {
  const environmentType = (process.env.PACT_TYPE || "file").toLowerCase();
  switch (environmentType) {
    case "server":
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
    case "file":
      // Nothing required
      break;
    default:
      throw new Error(`Environment variable PACT_TYPE can only be 'file' or 'server'`);
  }
};

const mockEVCSResponse = (
  response: CredentialStoreIdentityResponse | CredentialStoreErrorResponse,
  status: number = 200
) => {
  jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify(response), {
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
    jest.spyOn(ConfigurationModule, "getConfiguration").mockResolvedValue({
      evcsApiUrl: "https://evcs.gov.uk",
      controllerAllowList: ["did:web:api.identity.dev.account.gov.uk"],
    } as Configuration);
    jest.spyOn(ConfigurationModule, "getServiceApiKey").mockResolvedValue("an-api-key");
    jest.spyOn(FraudCheckService, "hasFraudCheckExpired").mockReturnValue(false);
    jest.spyOn(AuditModule, "sendAuditMessage").mockImplementation(async () => ({}) as SendMessageCommandOutput);
  });

  afterAll(() => {
    server?.close();
  });

  it("validates expectations of Stored Identity Service", async () => {
    const environmentType = (process.env.PACT_TYPE || "file").toLowerCase();

    let mockEVCSData: CredentialStoreIdentityResponse;

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

    await new Verifier(options).verifyProvider();
  });
});

const createCredentialStoreIdentityResponse = async (
  verifiableCredentialStates: { vc: VerifiableCredentialJWT; state: string }[] = []
): Promise<CredentialStoreIdentityResponse> => {
  const storedIdentity: StoredIdentityJWT = {
    sub: "user-sub",
    vot: "P2",
    iss: "http://api.example.com",
    vtm: "https://oidc.account.gov.uk/trustmark",
    credentials: [],
  };

  const defaultStoredIdentityHeader = getDefaultJwtHeader();

  return {
    si: {
      state: "CURRENT",
      vc: await sign(defaultStoredIdentityHeader, storedIdentity),
      metadata: null,
      unsignedVot: storedIdentity.max_vot || storedIdentity.vot,
    },
    vcs: await Promise.all(
      verifiableCredentialStates.map(async (vcState) => {
        return { state: vcState.state, vc: await sign(defaultStoredIdentityHeader, vcState.vc), metadata: null };
      })
    ),
  };
};
