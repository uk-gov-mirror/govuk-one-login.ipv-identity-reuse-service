import { URL } from "node:url";
import logger from "../utilities/logger.js";
import { getOauthInternalApiUrl, getSessionTimeout } from "../configuration/configuration.js";
import { IdentityVectorOfTrust } from "@govuk-one-login/data-vocab/credentials.js";
import { DeleteSessionError, GetSessionError, SessionInvalidError } from "../utilities/errors.js";

export type SessionResult = {
  session_id: string;
  state: string;
  redirect_uri: string;
};

type AuthorizationResult = {
  authorizationCode?: string;
  redirect_uri: string;
  state: string;
  message?: string;
  code?: "access_denied" | (string & {});
};

type AuthorizationSuccessResponse = {
  redirectionURI: string;
  authorizationCode: { value: string };
  state: { value: string };
};

type AuthorizationErrorResponse = {
  redirectionUri: string;
  state: string;
  message: string;
  code: string;
};

type SessionSuccessResponse = {
  session_id: string;
  state: string;
  redirect_uri: string;
};

export type GetSessionSuccessResponse = {
  vtr?: IdentityVectorOfTrust[];
  storageAccessToken?: string;
  clientSessionId: string;
  persistentSessionId?: string;
  subject: string;
  context?: string;
  sessionData?: SessionData;
};

export type SessionData = {
  vot: IdentityVectorOfTrust;
  storedIdentitySha256: string;
};

export const CreateSessionError = createErrorClass("CreateSessionError");
export const CreateAuthorizationCodeError = createErrorClass("CreateAuthorizationCodeError");

export async function createAuthCode(sessionId: string) {
  const oauthInternalApiUrl = process.env.OAUTH_INTERNAL_API_URL;

  const responseFromCreateAuthCode = await fetch(`${oauthInternalApiUrl}/api/create-auth-code`, {
    method: "POST",
    headers: {
      "session-id": sessionId,
    },
  });

  if (responseFromCreateAuthCode.status !== 201) {
    logger.error(`Session handler returned non-201 status: ${responseFromCreateAuthCode.status}`);
    throw new CreateAuthorizationCodeError("Create auth code endpoint returned an error response");
  }
}

export async function callSessionApi(clientId: string, request: string): Promise<SessionResult> {
  const oauthInternalApiUrl = getOauthInternalApiUrl();
  const url = `${oauthInternalApiUrl}/api/session`;

  const body = JSON.stringify({
    client_id: clientId,
    request,
  });

  const responseFromSessionEndpoint = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    signal: AbortSignal.timeout(getSessionTimeout()),
  });

  if (responseFromSessionEndpoint.status === 201) {
    const sessionData = await responseFromSessionEndpoint.json();
    if (!isValidSessionSuccessResponse(sessionData)) {
      throw new CreateSessionError("Invalid response properties received from session endpoint");
    }
    return {
      session_id: sessionData.session_id,
      state: sessionData.state,
      redirect_uri: sessionData.redirect_uri,
    };
  } else {
    logger.error(`Session handler returned non-201 status: ${responseFromSessionEndpoint.status}`);
    throw new CreateSessionError("Session endpoint returned an error response");
  }
}

export async function getAuthorizationCode(sessionId: string): Promise<AuthorizationResult> {
  const oauthInternalApiUrl = getOauthInternalApiUrl();

  const responseFromAuthorizeEndpoint = await fetch(`${oauthInternalApiUrl}/api/authorization`, {
    method: "GET",
    headers: {
      "session-id": sessionId,
    },
    signal: AbortSignal.timeout(getSessionTimeout()),
  });

  switch (responseFromAuthorizeEndpoint.status) {
    case 200: {
      const authorizationData = await responseFromAuthorizeEndpoint.json();
      if (!isValidAuthorizationSuccessResponse(authorizationData)) {
        throw new Error("Invalid response properties received from authorization endpoint");
      }

      const orchestrationRedirectUrl = new URL(decodeURIComponent(authorizationData.redirectionURI));
      return {
        authorizationCode: authorizationData.authorizationCode.value,
        redirect_uri: orchestrationRedirectUrl.href,
        state: authorizationData.state.value,
      };
    }
    case 403: {
      const errorData = await responseFromAuthorizeEndpoint.json();
      if (!isValidAuthorizationErrorResponse(errorData)) {
        throw new Error("Invalid response properties received from authorization error response");
      }
      const orchestrationRedirectUrl = new URL(errorData.redirectionUri);
      return {
        redirect_uri: orchestrationRedirectUrl.href,
        state: errorData.state,
        message: errorData.message,
        code: errorData.code,
      };
    }
    case 400: {
      throw new SessionInvalidError("Session not found for given session id");
    }
    default: {
      logger.error(`${responseFromAuthorizeEndpoint.status} response code returned from the authorization endpoint`);
      throw new Error("Authorize endpoint returned an error response");
    }
  }
}

export async function getSessionDetails(sessionId: string): Promise<GetSessionSuccessResponse> {
  const oauthInternalApiUrl = getOauthInternalApiUrl();
  const url = `${oauthInternalApiUrl}/api/session`;

  const responseFromSessionEndpoint = await fetch(url, {
    method: "GET",
    headers: {
      "session-id": sessionId,
    },
    signal: AbortSignal.timeout(getSessionTimeout()),
  });

  if (responseFromSessionEndpoint.status === 200) {
    const sessionData = await responseFromSessionEndpoint.json();
    if (!isValidGetSessionSuccessResponse(sessionData)) {
      throw new GetSessionError("Invalid response properties received from GET session endpoint");
    }
    return sessionData;
  } else if (responseFromSessionEndpoint.status === 400) {
    throw new SessionInvalidError("No session found for the given sessionId");
  } else {
    logger.error(`GET session handler returned non-200 status: ${responseFromSessionEndpoint.status}`);
    throw new GetSessionError("GET session endpoint returned an error response");
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  const oauthInternalApiUrl = getOauthInternalApiUrl();
  const url = `${oauthInternalApiUrl}/api/session`;

  const responseFromSessionEndpoint = await fetch(url, {
    method: "DELETE",
    headers: {
      "session-id": sessionId,
    },
    signal: AbortSignal.timeout(getSessionTimeout()),
  });

  if (responseFromSessionEndpoint.status !== 200) {
    throw new DeleteSessionError(`Unable to delete session with error code ${responseFromSessionEndpoint.status}`);
  }
}

export async function updateSessionData(sessionId: string, data: Record<string, string | null>): Promise<void> {
  const oauthInternalApiUrl = getOauthInternalApiUrl();
  const url = `${oauthInternalApiUrl}/api/session/data`;

  const responseFromSessionEndpoint = await fetch(url, {
    method: "PATCH",
    headers: {
      "session-id": sessionId,
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(getSessionTimeout()),
  });

  if (responseFromSessionEndpoint.status !== 200) {
    logger.error(`PATCH session/data endpoint returned non-200 status: ${responseFromSessionEndpoint.status}`);
    throw responseFromSessionEndpoint.status === 404
      ? new SessionInvalidError("No session found for the given sessionId")
      : new Error("PATCH session/data endpoint returned an error response");
  }
}

function createErrorClass(className: string) {
  return class extends Error {
    constructor(message: string) {
      super(message);
      this.name = className;
      Object.setPrototypeOf(this, new.target.prototype);
    }
  };
}

function isValidAuthorizationSuccessResponse(object: unknown): object is AuthorizationSuccessResponse {
  if (!object || typeof object !== "object") return false;
  return (
    hasNonEmptyString(object, "redirectionURI") &&
    hasObjectWithNonEmptyValue(object, "authorizationCode") &&
    hasObjectWithNonEmptyValue(object, "state")
  );
}

function isValidAuthorizationErrorResponse(object: unknown): object is AuthorizationErrorResponse {
  if (!object || typeof object !== "object") return false;
  return (
    hasNonEmptyString(object, "redirectionUri") &&
    hasNonEmptyString(object, "state") &&
    hasNonEmptyString(object, "code")
  );
}

function isValidSessionSuccessResponse(object: unknown): object is SessionSuccessResponse {
  if (!object || typeof object !== "object") return false;
  return (
    hasNonEmptyString(object, "redirect_uri") &&
    hasNonEmptyString(object, "session_id") &&
    hasNonEmptyString(object, "state")
  );
}

function isValidGetSessionSuccessResponse(object: unknown): object is GetSessionSuccessResponse {
  if (!object || typeof object !== "object") return false;
  return hasNonEmptyString(object, "clientSessionId") && hasNonEmptyString(object, "subject");
}

function hasNonEmptyString(object: object, key: string): boolean {
  return (
    key in object &&
    typeof (object as Record<string, unknown>)[key] === "string" &&
    ((object as Record<string, unknown>)[key] as string).trim().length > 0
  );
}

function hasObjectWithNonEmptyValue(object: object, key: string): boolean {
  return (
    key in object &&
    !!(object as Record<string, unknown>)[key] &&
    typeof (object as Record<string, unknown>)[key] === "object" &&
    hasNonEmptyString((object as Record<string, unknown>)[key] as object, "value")
  );
}
