import path from "node:path";
import { PactV4, SpecificationVersion, MatchersV3 } from "@pact-foundation/pact";
import { UserIdentityErrorResponse } from "../../../handlers/post-phase2-user-identity-handler/post-phase2-user-identity-types.js";
import { describe, beforeEach, it, expect, beforeAll } from "vitest";

const { like } = MatchersV3;

const USER_IDENTITY_ENDPOINT = "/user-identity";

const executeTest = async (mockServer: MatchersV3.V3MockServer, govukSigninJourneyId: string): Promise<Response> => {
  return await fetch(`${mockServer.url}${USER_IDENTITY_ENDPOINT}`, {
    method: "POST",
    body: JSON.stringify({
      vtr: ["P2"],
      govukSigninJourneyId,
    }),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer test-access-token`,
    },
  });
};

describe("SIS Consumer", () => {
  let govukSigninJourneyId: string;
  let provider: PactV4;

  beforeAll(() => {
    provider = new PactV4({
      consumer: "SisConsumerTests",
      provider: "StoredIdentityService",
      logLevel: process.env.CI ? "debug" : "warn",
      dir: path.resolve(process.cwd(), "pacts"),
      spec: SpecificationVersion.SPECIFICATION_VERSION_V4,
      host: "127.0.0.1",
    });
  });

  beforeEach(() => {
    govukSigninJourneyId = "Test-" + Date.now();
  });

  it("should return 200 if the stored identity exists", async () => {
    await provider
      .addInteraction()
      .given("stored identity exists")
      .uponReceiving("A userId for a stored identity that exists")
      .withRequest("POST", USER_IDENTITY_ENDPOINT, (builder) => {
        builder.headers({
          Authorization: like(`Bearer test-access-token`),
        });
        builder.jsonBody({
          vtr: ["P2"],
          govukSigninJourneyId,
        });
      })
      .willRespondWith(200, (builder) => {
        builder.jsonBody(
          like({
            content: {
              sub: "user-sub",
              vot: "P2",
              iss: "http://api.example.com",
              vtm: "https://oidc.account.gov.uk/trustmark",
              credentials: [],
            },
            vot: "P2",
            isValid: false,
            expired: false,
            kidValid: true,
            signatureValid: true,
          })
        );
      })
      .executeTest(async (mockServer) => {
        const result = await executeTest(mockServer, govukSigninJourneyId);
        const body = await result.json();
        expect(body).toMatchObject({
          content: {
            sub: "user-sub",
            vot: "P2",
            iss: "http://api.example.com",
            vtm: "https://oidc.account.gov.uk/trustmark",
            credentials: [],
          },
          vot: "P2",
          isValid: false,
          expired: false,
          kidValid: true,
          signatureValid: true,
        });
      });
  });

  it("should return 404 when no record", async () => {
    await provider
      .addInteraction()
      .given("stored identity does not exist")
      .uponReceiving("A userId for a stored identity that does not exist")
      .withRequest("POST", USER_IDENTITY_ENDPOINT, (builder) => {
        builder.headers({
          Authorization: like(`Bearer test-access-token`),
        });
        builder.jsonBody({
          vtr: ["P2"],
          govukSigninJourneyId,
        });
      })
      .willRespondWith(404, (builder) => {
        builder.jsonBody(
          like<UserIdentityErrorResponse>({
            error: "no_record",
            error_description: "No Stored Identity exists for this user or Stored Identity has been invalidated",
          })
        );
      })
      .executeTest(async (mockServer) => {
        const result = await executeTest(mockServer, govukSigninJourneyId);
        const body = await result.json();
        expect(body).toMatchObject({
          error: "no_record",
          error_description: "No Stored Identity exists for this user or Stored Identity has been invalidated",
        });
      });
  });

  it("should return 401 when authentication token is missing", async () => {
    await provider
      .addInteraction()
      .given("test-invalid-access-token is invalid bearer token")
      .uponReceiving("A invalid access token was provided")
      .withRequest("POST", USER_IDENTITY_ENDPOINT, (builder) => {
        builder.headers({
          Authorization: like(`Bearer invalid.access.token`),
        });
        builder.jsonBody({
          vtr: ["P2"],
          govukSigninJourneyId,
        });
      })
      .willRespondWith(401, (builder) => {
        builder.jsonBody(
          like<UserIdentityErrorResponse>({
            error: "invalid_token",
            error_description: "Bearer token is missing or invalid",
          })
        );
      })
      .executeTest(async (mockServer) => {
        const result = await executeTest(mockServer, govukSigninJourneyId);
        const body = await result.json();
        expect(body).toMatchObject({
          error: "invalid_token",
          error_description: "Bearer token is missing or invalid",
        });
      });
  });

  it("should return 403 when forbidden", async () => {
    await provider
      .addInteraction()
      .given("test-expired-access-token is expired bearer token")
      .uponReceiving("A request where the bearer token has expired")
      .withRequest("POST", USER_IDENTITY_ENDPOINT, (builder) => {
        builder.headers({
          Authorization: like(`Bearer test-access-token`),
        });
        builder.jsonBody({
          vtr: ["P2"],
          govukSigninJourneyId,
        });
      })
      .willRespondWith(403, (builder) => {
        builder.jsonBody(
          like<UserIdentityErrorResponse>({
            error: "forbidden",
            error_description: "Access token expired or not permitted",
          })
        );
      })
      .executeTest(async (mockServer) => {
        const result = await executeTest(mockServer, govukSigninJourneyId);
        const body = await result.json();
        expect(body).toMatchObject({
          error: "forbidden",
          error_description: "Access token expired or not permitted",
        });
      });
  });

  it("should return 500 when there is failure", async () => {
    await provider
      .addInteraction()
      .given("A request returns 500")
      .uponReceiving("A request but the downstream endpoint returns an internal error")
      .withRequest("POST", USER_IDENTITY_ENDPOINT, (builder) => {
        builder.headers({
          Authorization: like(`Bearer test-access-token`),
        });
        builder.jsonBody({
          vtr: ["P2"],
          govukSigninJourneyId,
        });
      })
      .willRespondWith(500, (builder) => {
        builder.jsonBody(
          like<UserIdentityErrorResponse>({
            error: "server_error",
            error_description: "Unable to retrieve data",
          })
        );
      })
      .executeTest(async (mockServer) => {
        const result = await executeTest(mockServer, govukSigninJourneyId);
        const body = await result.json();
        expect(body).toMatchObject({
          error: "server_error",
          error_description: "Unable to retrieve data",
        });
      });
  });
});
