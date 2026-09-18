import { PostalAddressClass } from "@govuk-one-login/data-vocab/credentials.js";
import { StoredIdentityJWT } from "../../domain/stored-identity/stored-identity-types.js";
import { StoredIdentityValidationError } from "../../commons/errors.js";

export interface UserDetailsContent {
  name: string;
  dateOfBirth: string;
  addressDetailHtml: string;
}

export const extractUserDetails = (storedIdentityJwt: StoredIdentityJWT): UserDetailsContent => {
  const coreIdentity = storedIdentityJwt.claims["https://vocab.account.gov.uk/v1/coreIdentity"];
  const addressClaim = storedIdentityJwt.claims["https://vocab.account.gov.uk/v1/address"] ?? [];

  const name = buildFullName(coreIdentity?.name);
  const dateOfBirth = coreIdentity?.birthDate?.[0]?.value;

  if (!dateOfBirth) {
    throw new StoredIdentityValidationError();
  }
  const currentAddress = getCurrentAddress(addressClaim);
  if (!currentAddress) {
    throw new StoredIdentityValidationError();
  }
  const addressDetailHtml = formatAddress(currentAddress);

  return { name, dateOfBirth, addressDetailHtml };
};

const getCurrentAddress = (addresses: PostalAddressClass[]): PostalAddressClass | undefined => {
  if (addresses.length === 0) return undefined;

  let latest = addresses[0];
  for (const address of addresses) {
    if ((address.validFrom ?? "") > (latest.validFrom ?? "")) {
      latest = address;
    }
  }
  return latest;
};

const buildFullName = (names?: { nameParts: { type: string; value: string }[] }[]): string => {
  if (!names || names.length === 0 || !names[0].nameParts?.length) {
    throw new StoredIdentityValidationError();
  }

  return names[0].nameParts.map((part) => part.value).join(" ");
};

export const formatAddress = (address: PostalAddressClass): string => {
  const joinAddressValues = (...values: (string | undefined)[]) => values.filter(Boolean).join(", ");

  const buildingName = joinAddressValues(
    address.departmentName,
    address.organisationName,
    address.subBuildingName,
    address.buildingName
  );
  const streetName = joinAddressValues(address.buildingNumber, address.dependentStreetName, address.streetName);
  const locality = joinAddressValues(
    address.doubleDependentAddressLocality,
    address.dependentAddressLocality,
    address.addressLocality
  );

  return [buildingName, streetName, locality, address.addressRegion, address.postalCode].filter(Boolean).join("<br>");
};
