import { extractCptFromNote, extractIcd10FromNote } from "../codes";

describe("extractCptFromNote", () => {
  it("takes a cued CPT code", () => {
    expect(extractCptFromNote("Requesting CPT 22633.")).toEqual(["22633"]);
    expect(extractCptFromNote("CPT: 22633")).toEqual(["22633"]);
    expect(extractCptFromNote("HCPCS J1885 administered")).toEqual(["J1885"]);
    expect(extractCptFromNote("procedure code 64483")).toEqual(["64483"]);
  });

  it("takes a comma-separated run under one cue", () => {
    expect(extractCptFromNote("CPT 22633, 22634, 22842")).toEqual([
      "22633",
      "22634",
      "22842",
    ]);
  });

  /**
   * The reason this module exists. The shared extractor treats the CPT cue as
   * optional, so on note prose every five-digit number becomes a CPT code.
   */
  it("ignores five-digit numbers with no cue", () => {
    expect(extractCptFromNote("Austin, TX 78701")).toEqual([]);
    expect(extractCptFromNote("Accession 88421")).toEqual([]);
    expect(extractCptFromNote("Total volume 12500 mL")).toEqual([]);
  });

  it("ignores a bare year", () => {
    expect(extractCptFromNote("CPT 20240")).toEqual([]);
  });

  it("returns an empty list for a note with no codes", () => {
    expect(extractCptFromNote("68F with low back pain, failed PT.")).toEqual(
      [],
    );
    expect(extractCptFromNote("")).toEqual([]);
  });

  it("deduplicates repeats", () => {
    expect(extractCptFromNote("CPT 22633 ... again CPT 22633")).toEqual([
      "22633",
    ]);
  });
});

describe("extractIcd10FromNote", () => {
  it("takes a decimal-bearing code with no cue", () => {
    expect(extractIcd10FromNote("Dx M48.06 confirmed.")).toEqual(["M48.06"]);
    expect(extractIcd10FromNote("M54.16 radiculopathy")).toEqual(["M54.16"]);
  });

  it("takes a cued code without a decimal", () => {
    expect(extractIcd10FromNote("ICD-10 M17 bilateral")).toEqual(["M17"]);
    expect(extractIcd10FromNote("diagnosis code G56")).toEqual(["G56"]);
  });

  /**
   * The collision this module was written for: spinal levels are letter+digits
   * and appear constantly in spine notes. Reading T12 as ICD-10 T12 would send
   * the screening after "unspecified injury" instead of the real diagnosis.
   */
  it.each(["C5", "C7", "T1", "T12", "L4", "L5", "S1"])(
    "never reads spinal level %s as a diagnosis code",
    (level) => {
      expect(extractIcd10FromNote(`${level} stenosis noted`)).toEqual([]);
    },
  );

  it("keeps the real code in a note that also names spinal levels", () => {
    expect(extractIcd10FromNote("L4-L5 and T12 stenosis. Dx M48.06.")).toEqual([
      "M48.06",
    ]);
  });

  it("ignores uncued letter+two-digit tokens", () => {
    expect(extractIcd10FromNote("Room B12 at the facility")).toEqual([]);
  });

  it("uppercases and deduplicates", () => {
    expect(extractIcd10FromNote("m48.06 then M48.06")).toEqual(["M48.06"]);
  });

  it("returns an empty list when there is nothing to find", () => {
    expect(extractIcd10FromNote("68F with low back pain")).toEqual([]);
    expect(extractIcd10FromNote("")).toEqual([]);
  });
});
