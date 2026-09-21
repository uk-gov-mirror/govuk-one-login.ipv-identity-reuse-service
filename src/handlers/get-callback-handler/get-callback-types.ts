export interface AuthorizationQueryStringParameters {
  redirect_uri: string;
  state: string;
  client_id: string;
}

export function isValidQueryParameters(object: unknown): object is AuthorizationQueryStringParameters {
  if (!object || typeof object !== "object") return false;
  return (
    "redirect_uri" in object &&
    typeof object.redirect_uri === "string" &&
    object.redirect_uri.trim().length > 0 &&
    "state" in object &&
    typeof object.state === "string" &&
    object.state.trim().length > 0 &&
    "client_id" in object &&
    typeof object.client_id === "string" &&
    object.client_id.trim().length > 0
  );
}
