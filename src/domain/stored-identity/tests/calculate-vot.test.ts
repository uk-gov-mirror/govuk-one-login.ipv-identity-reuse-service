import { IdentityVectorOfTrust } from "@govuk-one-login/data-vocab/credentials.js";
import { calculateVot } from "../calculate-vot.js";
import { StoredIdentityRecord, StoredIdentityVectorOfTrust } from "../stored-identity-types.js";
import logger from "../../../commons/logger.js";
import { vi, describe, it, afterEach, expect, Mocked } from "vitest";

vi.mock("../../../commons/logger");

const mockedLogger = logger as Mocked<typeof logger>;

describe("calculate-vot", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each<[StoredIdentityVectorOfTrust, IdentityVectorOfTrust[], IdentityVectorOfTrust]>([
    ["P1", ["P1"], "P2"],
    ["P2", ["P1", "P2"], "P2"],
    ["P2", ["P2", "P1"], "P2"],
    ["P1", ["P1", "P2"], "P1"],
    ["P2", ["P2"], "P3"],
    ["P2", ["P2", "P3"], "P2"],
    ["P2", ["P3", "P2"], "P2"],
    ["P2", ["P2"], "P3"],
    ["P3", ["P2", "P3"], "P3"],
    ["P3", ["P3", "P2"], "P3"],
    ["P2", ["P2", "P3"], "P2"],
    ["P2", ["P3", "P2"], "P2"],
    ["P0", ["P3"], "P2"],
  ])("should return %s, for vtr %s and unsigned vot %s when max_vot not present", (expected, vtr, unsignedVot) => {
    const jwt: StoredIdentityRecord = {} as StoredIdentityRecord;
    const returnedVot = calculateVot(jwt, unsignedVot, vtr);

    expect(mockedLogger.warn).toHaveBeenCalledWith("Max VOT not in VC. Using unsigned VOT");

    expect(returnedVot).toEqual(expected);
  });

  it.each<[StoredIdentityVectorOfTrust, IdentityVectorOfTrust[], IdentityVectorOfTrust, IdentityVectorOfTrust]>([
    ["P1", ["P1"], "P2", "P3"],
    ["P2", ["P1", "P2"], "P2", "P3"],
    ["P2", ["P2", "P1"], "P2", "P3"],
    ["P1", ["P1", "P2"], "P1", "P3"],
    ["P2", ["P2"], "P3", "P2"],
    ["P2", ["P2", "P3"], "P2", "P2"],
    ["P2", ["P3", "P2"], "P2", "P2"],
    ["P2", ["P2"], "P3", "P4"],
    ["P3", ["P2", "P3"], "P3", "P2"],
    ["P3", ["P3", "P2"], "P3", "P2"],
    ["P2", ["P2", "P3"], "P2", "P2"],
    ["P2", ["P3", "P2"], "P2", "P2"],
    ["P0", ["P3"], "P2", "P2"],
  ])(
    "should return %s, for vtr %s and unsigned vot %s when max_vot is present",
    (expected, vtr, signedVot, unsignedVot) => {
      const jwt: StoredIdentityRecord = {
        max_vot: signedVot,
      } as StoredIdentityRecord;

      const returnedVot = calculateVot(jwt, unsignedVot, vtr);
      expect(returnedVot).toEqual(expected);
    }
  );
});
