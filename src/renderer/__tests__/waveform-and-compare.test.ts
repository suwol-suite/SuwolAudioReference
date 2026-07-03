import { describe, expect, it } from "vitest";
import { createRelatedCompareSelection } from "../compare-selection";
import { getSilenceMarkerPercents, getWaveformPeakMarkerPercent } from "../components/WaveformPreview";

describe("waveform markers and compare helpers", () => {
  it("formats silence and peak marker positions", () => {
    expect(getSilenceMarkerPercents(100, 250, 1000)).toEqual({ start: 10, end: 75 });
    expect(
      getWaveformPeakMarkerPercent([
        { min: -0.1, max: 0.1, peak: 0.1, rms: 0.05 },
        { min: -0.8, max: 0.8, peak: 0.8, rms: 0.4 },
        { min: -0.2, max: 0.2, peak: 0.2, rms: 0.1 },
      ]),
    ).toBeCloseTo(50);
  });

  it("creates an A/B compare selection from a related candidate", () => {
    expect(createRelatedCompareSelection("current", "candidate")).toEqual({
      selectedIds: ["current", "candidate"],
      comparePairStart: 0,
    });
    expect(createRelatedCompareSelection("current", "current")).toEqual({
      selectedIds: ["current"],
      comparePairStart: 0,
    });
  });
});
