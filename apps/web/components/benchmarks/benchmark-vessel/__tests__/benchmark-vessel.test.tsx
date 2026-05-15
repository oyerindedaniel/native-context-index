import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BenchmarkVessel } from "../benchmark-vessel";

vi.mock("motion/react", async () => {
  const actual =
    await vi.importActual<typeof import("motion/react")>("motion/react");
  return {
    ...actual,
    useInView: () => true,
    useReducedMotion: () => true,
  };
});

describe("BenchmarkVessel", () => {
  it("exposes meter semantics and numeric readout", () => {
    render(
      <BenchmarkVessel
        value={980}
        max={1200}
        suffix="ms"
        aria-label="NCI first latency"
      />,
    );

    const meter = screen.getByRole("meter", { name: "NCI first latency" });
    expect(meter.getAttribute("aria-valuenow")).toBe("980");
    expect(meter.getAttribute("aria-valuemax")).toBe("1200");
  });
});
