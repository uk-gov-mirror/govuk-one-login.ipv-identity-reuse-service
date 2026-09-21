import { describe, it, expect } from "vitest";
import { extractUserDetails, formatAddress } from "../user-details-content.js";
import { StoredIdentityRecord, StoredIdentityClaims } from "../../../domain/stored-identity/stored-identity-types.js";
import { StoredIdentityValidationError } from "../../../commons/errors.js";

const buildStoredIdentityRecord = (claims: StoredIdentityClaims): StoredIdentityRecord => ({
  sub: "user-sub",
  credentials: [],
  vot: "P2",
  vtm: "https://oidc.account.gov.uk/trustmark",
  claims,
});

describe("extractUserDetails", () => {
  it("should extract name, dateOfBirth, and address from stored identity claims", () => {
    const storedIdentityRecord = buildStoredIdentityRecord({
      "https://vocab.account.gov.uk/v1/coreIdentity": {
        name: [
          {
            nameParts: [
              { type: "GivenName", value: "Jane" },
              { type: "FamilyName", value: "Doe" },
            ],
          },
        ],
        birthDate: [{ value: "1990-01-15" }],
      },
      "https://vocab.account.gov.uk/v1/address": [
        {
          buildingNumber: "10",
          streetName: "Downing Street",
          addressLocality: "London",
          postalCode: "SW1A 2AA",
          validFrom: "2020-01-01",
        },
      ],
    });

    const result = extractUserDetails(storedIdentityRecord);

    expect(result).toEqual({
      name: "Jane Doe",
      dateOfBirth: "1990-01-15",
      addressDetailHtml: "10, Downing Street<br>London<br>SW1A 2AA",
    });
  });

  it("should join multiple given names with spaces", () => {
    const storedIdentityRecord = buildStoredIdentityRecord({
      "https://vocab.account.gov.uk/v1/coreIdentity": {
        name: [
          {
            nameParts: [
              { type: "GivenName", value: "Mary" },
              { type: "GivenName", value: "Jane" },
              { type: "FamilyName", value: "Watson" },
            ],
          },
        ],
        birthDate: [{ value: "1985-03-20" }],
      },
      "https://vocab.account.gov.uk/v1/address": [{ streetName: "Test Street", postalCode: "TE1 1ST" }],
    });

    const result = extractUserDetails(storedIdentityRecord);

    expect(result.name).toBe("Mary Jane Watson");
  });

  it("should throw when no name is present", () => {
    const storedIdentityRecord = buildStoredIdentityRecord({
      "https://vocab.account.gov.uk/v1/coreIdentity": {
        birthDate: [{ value: "2000-06-01" }],
      },
      "https://vocab.account.gov.uk/v1/address": [{ streetName: "Test Street", postalCode: "TE1 1ST" }],
    });

    expect(() => extractUserDetails(storedIdentityRecord)).toThrow(StoredIdentityValidationError);
  });

  it("should throw when no birthDate is present", () => {
    const storedIdentityRecord = buildStoredIdentityRecord({
      "https://vocab.account.gov.uk/v1/coreIdentity": {
        name: [{ nameParts: [{ type: "GivenName", value: "Test" }] }],
      },
      "https://vocab.account.gov.uk/v1/address": [],
    });

    expect(() => extractUserDetails(storedIdentityRecord)).toThrow(StoredIdentityValidationError);
  });

  it("should throw when no addresses are present", () => {
    const storedIdentityRecord = buildStoredIdentityRecord({
      "https://vocab.account.gov.uk/v1/coreIdentity": {
        name: [
          {
            nameParts: [
              { type: "GivenName", value: "John" },
              { type: "FamilyName", value: "Smith" },
            ],
          },
        ],
        birthDate: [{ value: "1975-12-25" }],
      },
      "https://vocab.account.gov.uk/v1/address": [],
    });

    expect(() => extractUserDetails(storedIdentityRecord)).toThrow(StoredIdentityValidationError);
  });

  it("should return only the address with the latest validFrom when multiple addresses exist", () => {
    const storedIdentityRecord = buildStoredIdentityRecord({
      "https://vocab.account.gov.uk/v1/coreIdentity": {
        name: [{ nameParts: [{ type: "GivenName", value: "Jane" }] }],
        birthDate: [{ value: "1990-01-01" }],
      },
      "https://vocab.account.gov.uk/v1/address": [
        { buildingNumber: "2", streetName: "Old Street", postalCode: "EF3 4GH", validFrom: "2010-06-01" },
        { buildingNumber: "1", streetName: "New Street", postalCode: "AB1 2CD", validFrom: "2022-03-15" },
      ],
    });

    const result = extractUserDetails(storedIdentityRecord);

    expect(result.addressDetailHtml).toBe("1, New Street<br>AB1 2CD");
  });
});

describe("formatAddress", () => {
  it("should format an address with all fields", () => {
    const result = formatAddress({
      departmentName: "My department",
      organisationName: "My company",
      subBuildingName: "Room 5",
      buildingName: "my building",
      buildingNumber: "1",
      dependentStreetName: "My outer street",
      streetName: "my inner street",
      doubleDependentAddressLocality: "My double dependant town",
      dependentAddressLocality: "my dependant town",
      addressLocality: "my town",
      postalCode: "myCode",
      addressRegion: "myRegion",
    });

    expect(result).toBe(
      "My department, My company, Room 5, my building<br>1, My outer street, my inner street<br>My double dependant town, my dependant town, my town<br>myRegion<br>myCode"
    );
  });

  it("should format an address without street name fields", () => {
    const result = formatAddress({
      departmentName: "My department",
      organisationName: "My company",
      subBuildingName: "Room 5",
      buildingName: "my building",
      doubleDependentAddressLocality: "My double dependant town",
      dependentAddressLocality: "my dependant town",
      addressLocality: "my town",
      postalCode: "myCode",
      addressRegion: "myRegion",
    });

    expect(result).toBe(
      "My department, My company, Room 5, my building<br>My double dependant town, my dependant town, my town<br>myRegion<br>myCode"
    );
  });
});
