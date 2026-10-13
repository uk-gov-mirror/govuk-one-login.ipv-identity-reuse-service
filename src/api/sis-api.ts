import { URL } from "node:url";
import { Response } from "express";
import { getRequiredEnvironment } from "../configuration/get-required-environment.js";

type RedirectOptions = {
  location: string;
  body: string;
  cookie?: string;
};

export function redirectToErrorPage() {
  const domainName = getRequiredEnvironment("DOMAIN_NAME");
  return redirect({ location: `https://${domainName}/error/unrecoverable`, body: "" });
}

export function redirectToSessionExpiredPage() {
  const domainName = getRequiredEnvironment("DOMAIN_NAME");
  return redirect({ location: `https://${domainName}/error/session-expired`, body: "" });
}

export function redirectToBadRequest() {
  const domainName = getRequiredEnvironment("DOMAIN_NAME");
  return redirect({ location: `https://${domainName}/error/bad-request`, body: "" });
}

export function redirectToConfirmDetails(cookie?: string) {
  const domainName = getRequiredEnvironment("DOMAIN_NAME");
  return redirect({ location: `https://${domainName}/confirm-details`, body: "", cookie: cookie });
}

export function redirectToOauthCallBack() {
  return redirect({ location: `https://${process.env.PUBLIC_API}/oauth2/callback`, body: "" });
}

export function redirectToErrorPageExpress(response: Response) {
  const domainName = getRequiredEnvironment("DOMAIN_NAME");
  response.redirect(`https://${domainName}/error/unrecoverable`);
}

export function redirectToSessionExpiredPageExpress(response: Response) {
  const domainName = getRequiredEnvironment("DOMAIN_NAME");
  response.redirect(`https://${domainName}/error/session-expired`);
}

export function redirectToBadRequestExpress(response: Response) {
  const domainName = getRequiredEnvironment("DOMAIN_NAME");
  response.redirect(`https://${domainName}/error/bad-request`);
}

export function redirectToOauthCallBackExpress(response: Response) {
  response.redirect(`https://${process.env.PUBLIC_API}/oauth2/callback`);
}

export function redirectToConfirmDetailsExpress<ResourceBody, Locals extends Record<string, unknown>>(
  response: Response<ResourceBody, Locals>,
  sessionId: string
) {
  const domainName = getRequiredEnvironment("DOMAIN_NAME");
  response
    .cookie("identity_reuse_service_session", sessionId, { secure: true, httpOnly: true, sameSite: "lax", path: "/" })
    .redirect(`https://${domainName}/confirm-details`);
}

export function redirectToClient(
  redirectUri: string,
  state: string,
  authorizationCode?: string,
  errorDescription?: string,
  error?: string
) {
  const orchestrationRedirectUrl = new URL(redirectUri);

  if (authorizationCode) {
    orchestrationRedirectUrl.searchParams.append("code", authorizationCode);
  } else {
    orchestrationRedirectUrl.searchParams.append("error", error!);
    orchestrationRedirectUrl.searchParams.append("error_description", errorDescription!);
  }
  orchestrationRedirectUrl.searchParams.append("state", state);

  return redirect({ location: orchestrationRedirectUrl.href, body: "" });
}

export function redirect({ location, body, cookie }: RedirectOptions) {
  return {
    statusCode: 302,
    headers: {
      Location: location,
      ...(cookie && { "Set-Cookie": cookie }),
    },
    body: body,
  };
}
