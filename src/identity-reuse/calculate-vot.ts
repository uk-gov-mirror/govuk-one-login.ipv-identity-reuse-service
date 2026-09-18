import { IdentityVectorOfTrust } from "@govuk-one-login/data-vocab/credentials.js";
import { StoredIdentityJWT } from "../domain/stored-identity/stored-identity-types.js";
import logger from "../commons/logger.js";
import { StoredIdentityVectorOfTrust } from "../handlers/post-phase2-user-identity-handler/post-phase2-user-identity-response.js";

export const calculateVot = (
  content: StoredIdentityJWT,
  unsignedVot: IdentityVectorOfTrust,
  vtr: IdentityVectorOfTrust[]
): StoredIdentityVectorOfTrust => {
  let vot = content.max_vot;
  if (!vot) {
    logger.warn("Max VOT not in VC. Using unsigned VOT");
    vot = unsignedVot;
  }

  const foundVot: IdentityVectorOfTrust | undefined = vtr
    .map((s) => s.trim())
    // eslint-disable-next-line unicorn/no-array-sort -- toSorted not supported by current configuration
    .sort((a, b) => (a < b ? 1 : -1))
    .find((s): s is IdentityVectorOfTrust => s <= vot);

  return foundVot || "P0";
};
