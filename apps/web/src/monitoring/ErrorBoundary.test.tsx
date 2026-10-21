// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";
import { installGlobalErrorHandlers, type ErrorReporter } from "./errorReporter";

afterEach(cleanup);

function Bomb(): never {
  throw new Error("render failed");
}

describe("ErrorBoundary (T-906)", () => {
  it("renders its children when nothing is wrong", () => {
    const reporter: ErrorReporter = { report: vi.fn() };
    render(
      <ErrorBoundary reporter={reporter}>
        <p>all fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("all fine")).toBeTruthy();
    expect(reporter.report).not.toHaveBeenCalled();
  });

  it("replaces a crashed screen with a plain explanation, reports it once, and offers a way out", () => {
    const report = vi.fn();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <ErrorBoundary reporter={{ report }}>
        <Bomb />
      </ErrorBoundary>,
    );
    quiet.mockRestore();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Something went wrong");
    expect(alert.textContent).toContain("Your progress is saved on this device");
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to today" })).toBeTruthy();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]?.[1]).toBe("react");
    expect((report.mock.calls[0]?.[0] as Error).message).toBe("render failed");
  });
});

describe("global error handlers", () => {
  it("report errors and promise rejections that nothing caught, and stop when asked", () => {
    const report = vi.fn();
    const stop = installGlobalErrorHandlers({ report });

    window.dispatchEvent(
      new ErrorEvent("error", { error: new Error("uncaught"), message: "uncaught" }),
    );
    const rejection = new Event("unhandledrejection") as Event & { reason: unknown };
    rejection.reason = new Error("rejected");
    window.dispatchEvent(rejection);

    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls[0]?.[1]).toBe("error");
    expect(report.mock.calls[1]?.[1]).toBe("unhandledrejection");

    stop();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("after"), message: "after" }));
    expect(report).toHaveBeenCalledTimes(2);
  });
});
