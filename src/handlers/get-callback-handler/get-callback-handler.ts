import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { deleteSession, getAuthorizationCode } from "../../api/oauth-internal-api.js";
import { redirectToClient, redirectToErrorPage, redirectToSessionExpiredPage } from "../../api/sis-api.js";
import { getCookieValues } from "../../utilities/cookie-utilities.js";
import { SessionInvalidError } from "../../utilities/errors.js";
import logger from "../../utilities/logger.js";

export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  logger.addContext(context);

  const sessionId = getCookieValues(event)?.get("identity_reuse_service_session");
  if (!sessionId) {
    return redirectToSessionExpiredPage();
  }

  try {
    const {
      redirect_uri: redirectUri,
      state,
      authorizationCode,
      message,
      code,
    } = await getAuthorizationCode(sessionId);

    if (code === "access_denied") {
      try {
        await deleteSession(sessionId);
      } catch (error) {
        logger.error("Error occurred whilst deleting user session", {
          sessionId,
          ...(error instanceof Error && { error: error.name, errorMessage: error.message }),
        });
      }
    }

    return redirectToClient(redirectUri, state, authorizationCode, message, code);
  } catch (error) {
    logger.error(`Error in OAuth Callback handler event: ${error}`);
    if (error instanceof SessionInvalidError) {
      return redirectToSessionExpiredPage();
    }
    return redirectToErrorPage();
  }
};
