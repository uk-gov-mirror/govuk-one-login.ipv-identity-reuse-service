import { afterEach, beforeEach, describe, expect, it, vitest } from "vitest";
import { DeleteSessionError, GetSessionError, SessionInvalidError } from "../../utilities/errors.js";
import {
  callSessionApi,
  createAuthCode,
  CreateAuthorizationCodeError,
  deleteSession,
  getAuthorizationCode,
  getSessionDetails,
  updateSessionData,
} from "../oauth-internal-api.js";

const { mockError } = vitest.hoisted(() => {
  return {
    mockError: vitest.fn(),
  };
});

vitest.mock("@aws-lambda-powertools/logger", () => {
  return {
    Logger: class {
      error = mockError;
      constructor() {}
    },
  };
});

beforeEach(() => {
  vitest.clearAllMocks();
  vitest.stubEnv("OAUTH_INTERNAL_API_URL", "https://test.com");
  vitest.stubEnv("SESSION_TIMEOUT_MS", "5000");
});

afterEach(() => {
  vitest.restoreAllMocks();
  vitest.unstubAllEnvs();
  vitest.unstubAllGlobals();
});

describe("createAuthCode", () => {
  it("should create a successful request to create an auth code", async () => {
    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(Response.json({}, { status: 201 })));

    await createAuthCode("session-id");

    expect(globalThis.fetch).toHaveBeenCalledExactlyOnceWith("https://test.com/api/create-auth-code", {
      method: "POST",
      headers: {
        "session-id": "session-id",
      },
    });
  });

  it("should throw an exception if the error code is invalid", async () => {
    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(Response.json({}, { status: 400 })));

    await expect(createAuthCode("session-id")).rejects.toThrow(
      new CreateAuthorizationCodeError("Create auth code endpoint returned an error response")
    );

    expect(globalThis.fetch).toHaveBeenCalledExactlyOnceWith("https://test.com/api/create-auth-code", {
      method: "POST",
      headers: {
        "session-id": "session-id",
      },
    });
  });
});

describe("callSessionApi", () => {
  it("should call the /api/session fetch and return the SessionResult response", async () => {
    const mockResponse = Response.json(
      { state: "test-state", redirect_uri: "https://test-uri.com", session_id: "test-session-id" },
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );

    const jsonSpy = vitest.spyOn(mockResponse, "json");

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    const response = await callSessionApi("test-client-id", "test-request");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://test.com/api/session",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "test-client-id",
          request: "test-request",
        }),
        signal: expect.any(AbortSignal),
      })
    );

    expect(jsonSpy).toHaveBeenCalledTimes(1);
    expect(response.state).toEqual("test-state");
    expect(response.redirect_uri).toEqual("https://test-uri.com");
    expect(response.session_id).toEqual("test-session-id");
  });

  it("should throw an error if the /api/session fetch returns a 403 status code", async () => {
    const mockResponse = Response.json({}, { status: 403 });
    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(callSessionApi("test-client-id", "test-request")).rejects.toThrow(
      "Session endpoint returned an error response"
    );
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining("Session handler returned non-201 status: 403"));
  });

  it("should throw an error if the session endpoint returns a missing session id", async () => {
    const mockResponse = Response.json(
      {
        state: "test-state",
        redirect_uri: "https://api.example.com",
      },
      { status: 201 }
    );

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(callSessionApi("test-client-id", "test-request")).rejects.toThrow(
      "Invalid response properties received from session endpoint"
    );
  });

  it("should throw an error if the session endpoint returns a missing state", async () => {
    const mockResponse = Response.json(
      {
        session_id: "test-session-id",
        redirect_uri: "https://api.example.com",
      },
      { status: 201 }
    );

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(callSessionApi("test-client-id", "test-request")).rejects.toThrow(
      "Invalid response properties received from session endpoint"
    );
  });

  it("should throw an error if the session endpoint returns a missing redirect URI", async () => {
    const mockResponse = Response.json(
      {
        state: "test-state",
        session_id: "test-session-id",
      },
      { status: 201 }
    );

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(callSessionApi("test-client-id", "test-request")).rejects.toThrow(
      "Invalid response properties received from session endpoint"
    );
  });
});

describe("getAuthorizationCode", () => {
  it("should call the /api/authorisation fetch and return the AuthorizationResult response, reading the JSON only once", async () => {
    const mockResponse = Response.json(
      {
        redirectionURI: "https://api.example.com",
        authorizationCode: { value: "test-auth-code" },
        state: { value: "test-state" },
      },
      { status: 200 }
    );

    const jsonSpy = vitest.spyOn(mockResponse, "json");
    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    const response = await getAuthorizationCode("test-session-id");

    expect(jsonSpy).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://test.com/api/authorization", {
      method: "GET",
      headers: { "session-id": "test-session-id" },
      signal: expect.any(AbortSignal),
    });

    expect(response.redirect_uri).toEqual("https://api.example.com/");
    expect(response.authorizationCode).toEqual("test-auth-code");
    expect(response.state).toEqual("test-state");
  });

  it("should return redirect_uri and state without authorizationCode when the /api/authorization API call returns 403", async () => {
    const mockResponse = Response.json(
      {
        message: "record_unavailable",
        code: "access_denied",
        errorSummary: "access_denied: record_unavailable",
        redirectionUri: "https://test-uri.com",
        state: "test-state",
      },
      { status: 403 }
    );
    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    const response = await getAuthorizationCode("test-session-id");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://test.com/api/authorization", {
      method: "GET",
      headers: { "session-id": "test-session-id" },
      signal: expect.any(AbortSignal),
    });
    expect(response.redirect_uri).toEqual("https://test-uri.com/");
    expect(response.state).toEqual("test-state");
    expect(response.authorizationCode).toBeUndefined();
    expect(response.message).toEqual("record_unavailable");
    expect(response.code).toEqual("access_denied");
  });

  it("should throw an error when the /api/authorization returns 403 with missing required fields", async () => {
    const mockResponse = Response.json(
      {
        message: "record_unavailable",
      },
      { status: 403 }
    );

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(getAuthorizationCode("test-session-id")).rejects.toThrow(
      "Invalid response properties received from authorization error response"
    );
  });

  it("should throw an error when the call to the /api/authorization returns an empty state object", async () => {
    const mockResponse = Response.json(
      {
        redirectionURI: "https://api.example.com",
        authorizationCode: { value: "test-auth-code" },
        state: {},
      },
      { status: 200 }
    );

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(getAuthorizationCode("test-session-id")).rejects.toThrow(
      "Invalid response properties received from authorization endpoint"
    );
  });

  it("should throw a SessionInvalidError when the /api/authorization API call returns 400", async () => {
    const mockResponse = Response.json(
      {
        redirectionURI: "https://api.example.com",
        authorizationCode: { value: "test-auth-code" },
        state: {},
      },
      { status: 400 }
    );

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(getAuthorizationCode("test-session-id")).rejects.toThrow(
      new SessionInvalidError("Session not found for given session id")
    );
  });

  it("should throw an error when the /api/authorization API call returns 500", async () => {
    const mockResponse = Response.json(
      {
        redirectionURI: "https://api.example.com",
        authorizationCode: { value: "test-auth-code" },
        state: {},
      },
      { status: 500 }
    );

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(getAuthorizationCode("test-session-id")).rejects.toThrow(
      "Authorize endpoint returned an error response"
    );
  });

  it("should throw an error if the authorization endpoint returns a missing redirection URI", async () => {
    const mockResponse = Response.json(
      {
        authorizationCode: { value: "test-auth-code" },
        state: { value: "test-state" },
      },
      { status: 200 }
    );

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(getAuthorizationCode("test-session-id")).rejects.toThrow(
      "Invalid response properties received from authorization endpoint"
    );
  });

  it("should throw an error if the authorization endpoint returns a missing auth code", async () => {
    const mockResponse = Response.json(
      {
        redirectionURI: "https://api.example.com",
        state: { value: "test-state" },
      },
      { status: 200 }
    );

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(getAuthorizationCode("test-session-id")).rejects.toThrow(
      "Invalid response properties received from authorization endpoint"
    );
  });

  it("should throw an error if the authorization endpoint returns a missing state", async () => {
    const mockResponse = Response.json(
      {
        redirectionURI: "https://api.example.com",
        authorizationCode: { value: "test-auth-code" },
      },
      { status: 200 }
    );

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(getAuthorizationCode("test-session-id")).rejects.toThrow(
      "Invalid response properties received from authorization endpoint"
    );
  });
});

describe("getSessionDetails", () => {
  it("should call GET /api/session and return storageAccessToken and subject", async () => {
    const mockResponse = Response.json(
      {
        clientSessionId: "test-client-session-id",
        subject: "test-subject",
        storageAccessToken: "test-storage-token",
      },
      { status: 200 }
    );

    const jsonSpy = vitest.spyOn(mockResponse, "json");
    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    const response = await getSessionDetails("test-session-id");

    expect(jsonSpy).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://test.com/api/session", {
      method: "GET",
      headers: { "session-id": "test-session-id" },
      signal: expect.any(AbortSignal),
    });

    expect(response.storageAccessToken).toEqual("test-storage-token");
    expect(response.subject).toEqual("test-subject");
  });

  it("should return undefined storageAccessToken when not present in GET /api/session response", async () => {
    const mockResponse = Response.json(
      {
        clientSessionId: "test-client-session-id",
        subject: "test-subject",
      },
      { status: 200 }
    );

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    const response = await getSessionDetails("test-session-id");

    expect(response.storageAccessToken).toBeUndefined();
    expect(response.subject).toEqual("test-subject");
  });

  it("should throw a SessionInvalidError if GET /api/session returns a 400 status code", async () => {
    const mockResponse = Response.json({}, { status: 400 });
    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(getSessionDetails("test-session-id")).rejects.toThrow(
      expect.objectContaining({
        name: "SessionInvalidError",
        message: "No session found for the given sessionId",
      })
    );
  });

  it("should throw a GetSessionError if GET /api/session returns a 404", async () => {
    const mockResponse = Response.json({}, { status: 404 });
    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(getSessionDetails("test-session-id")).rejects.toBeInstanceOf(GetSessionError);
  });

  it("should throw an error if GET /api/session response is missing subject", async () => {
    const mockResponse = Response.json(
      {
        clientSessionId: "test-client-session-id",
        storageAccessToken: "test-storage-token",
      },
      { status: 200 }
    );

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(getSessionDetails("test-session-id")).rejects.toThrow(
      "Invalid response properties received from GET session endpoint"
    );
  });

  it("should throw an error if GET /api/session response is missing clientSessionId", async () => {
    const mockResponse = Response.json(
      {
        subject: "test-subject",
        storageAccessToken: "test-storage-token",
      },
      { status: 200 }
    );

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(getSessionDetails("test-session-id")).rejects.toThrow(
      "Invalid response properties received from GET session endpoint"
    );
  });

  it("should throw an error if GET /api/session response has empty subject", async () => {
    const mockResponse = Response.json(
      {
        clientSessionId: "test-client-session-id",
        subject: "   ",
        storageAccessToken: "test-storage-token",
      },
      { status: 200 }
    );

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(getSessionDetails("test-session-id")).rejects.toThrow(
      "Invalid response properties received from GET session endpoint"
    );
  });

  it("should throw an error if GET /api/session response is null", async () => {
    // eslint-disable-next-line unicorn/no-null
    const mockResponse = Response.json(null, { status: 200 });

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(getSessionDetails("test-session-id")).rejects.toThrow(
      "Invalid response properties received from GET session endpoint"
    );
  });
});

describe("updateSessionData", () => {
  it("should create a request with the correct values", async () => {
    // eslint-disable-next-line unicorn/no-null
    const mockResponse = Response.json(null, { status: 200 });

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await updateSessionData("session-1234", { foo: "bar" });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://test.com/api/session/data",
      expect.objectContaining({
        method: "PATCH",
        headers: {
          "session-id": "session-1234",
        },
        body: '{"foo":"bar"}',
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("should throw an Error if the endpoint fails", async () => {
    // eslint-disable-next-line unicorn/no-null
    const mockResponse = Response.json(null, { status: 403 });

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(updateSessionData("session-1234", { foo: "bar" })).rejects.toThrow(
      "PATCH session/data endpoint returned an error response"
    );

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://test.com/api/session/data",
      expect.objectContaining({
        method: "PATCH",
        headers: {
          "session-id": "session-1234",
        },
        body: '{"foo":"bar"}',
        signal: expect.any(AbortSignal),
      })
    );
  });
});

describe("deleteSession", () => {
  it("should call the API with the correct parameters", async () => {
    // eslint-disable-next-line unicorn/no-null
    const mockResponse = Response.json(null, { status: 200 });

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await deleteSession("session-1234");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://test.com/api/session",
      expect.objectContaining({
        method: "DELETE",
        headers: {
          "session-id": "session-1234",
        },
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("should throw an exception if the error code is invalid", async () => {
    // eslint-disable-next-line unicorn/no-null
    const mockResponse = Response.json(null, { status: 403 });

    vitest.stubGlobal("fetch", vitest.fn().mockResolvedValueOnce(mockResponse));

    await expect(deleteSession("session-1234")).rejects.toThrow(DeleteSessionError);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://test.com/api/session",
      expect.objectContaining({
        method: "DELETE",
        headers: {
          "session-id": "session-1234",
        },
        signal: expect.any(AbortSignal),
      })
    );
  });
});
