import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AAIndexBadge, aaIndexColor } from "@/components/AAIndexBadge";
import { UncertaintyScore } from "@/components/UncertaintyScore";
import { MetricCard } from "@/components/MetricCard";
import { BenchmarkSparkline } from "@/components/BenchmarkSparkline";

describe("AAIndexBadge color thresholds", () => {
  it("bands the value: ≥70 green, ≥50 amber, <50 red, null gray", () => {
    expect(aaIndexColor(85)).toBe("text-green-600");
    expect(aaIndexColor(60)).toBe("text-amber-600");
    expect(aaIndexColor(30)).toBe("text-red-500");
    expect(aaIndexColor(null)).toBe("text-gray-400");
  });

  it("renders null as an em-dash, never 0", () => {
    render(<AAIndexBadge value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("UncertaintyScore visibility gate", () => {
  it("renders nothing when score is at or below the low band", () => {
    const { container } = render(<UncertaintyScore score={40} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders when the score is elevated (>50)", () => {
    render(<UncertaintyScore score={60} />);
    expect(screen.getByText(/Uncertainty 60/)).toBeInTheDocument();
  });

  it("renders nothing for null", () => {
    const { container } = render(<UncertaintyScore score={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("MetricCard null handling", () => {
  it("shows an em-dash for a null metric value, never 0", () => {
    render(<MetricCard label="Coding" value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

describe("BenchmarkSparkline sparse history", () => {
  it("shows the not-enough-history fallback with fewer than 3 points", () => {
    render(<BenchmarkSparkline points={[{ date: "2026-06-01", value: 70 }]} />);
    expect(screen.getByText(/Not enough history/i)).toBeInTheDocument();
  });

  it("shows the same fallback for null points", () => {
    render(<BenchmarkSparkline points={null} />);
    expect(screen.getByText(/Not enough history/i)).toBeInTheDocument();
  });
});
