import { combineSignals, isNonEmpty, withTimeout } from "../src/withTimeout";
import { FetchFn, FetchInit, FetchInput } from "../src/types";

class MockResponse implements Response {
    ok = true;
    status = 200;
    statusText = "OK";
    headers = new Headers();
    body = null;
    bodyUsed = false;
    type = "basic" as const;
    url = "";
    redirected = false;
    json = async () => ({});
    text = async () => "";
    blob = async () => new Blob();
    formData = async () => new FormData();
    arrayBuffer = async () => new ArrayBuffer(0);
    bytes = async () => new Uint8Array(0);
    clone = () => new MockResponse();
}

describe("withTimeout", () => {
    let mockFetch: jest.MockedFunction<FetchFn>;

    beforeEach(() => {
        jest.useFakeTimers();
        mockFetch = jest.fn((input: FetchInput, init?: FetchInit) => {
            return new Promise((resolve, reject) => {
                // Check if signal is already aborted
                if (init?.signal?.aborted) {
                    reject(
                        new DOMException(
                            "The operation was aborted",
                            "AbortError",
                        ),
                    );
                    return;
                }
                // Listen for abort events
                const onAbort = () => {
                    reject(
                        new DOMException(
                            "The operation was aborted",
                            "AbortError",
                        ),
                    );
                    init?.signal?.removeEventListener("abort", onAbort);
                };
                init?.signal?.addEventListener("abort", onAbort);
                // Simulate a long-running fetch (longer than timeout)
                setTimeout(() => resolve(new MockResponse()), 5000);
            });
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    describe("isNonEmpty", () => {
        it("returns true for non-null/undefined values", () => {
            expect(isNonEmpty(0)).toBe(true);
            expect(isNonEmpty("")).toBe(true);
            expect(isNonEmpty({})).toBe(true);
            expect(isNonEmpty(new AbortController().signal)).toBe(true);
        });

        it("returns false for null or undefined", () => {
            expect(isNonEmpty(null)).toBe(false);
            expect(isNonEmpty(undefined)).toBe(false);
        });
    });

    describe("combineSignals", () => {
        it("returns a new signal when no signals are provided", () => {
            const signal = combineSignals();
            expect(signal).toBeInstanceOf(AbortSignal);
            expect(signal.aborted).toBe(false);
        });

        it("aborts when any signal aborts", () => {
            const controller1 = new AbortController();
            const controller2 = new AbortController();
            const combined = combineSignals(
                controller1.signal,
                controller2.signal,
            );

            expect(combined.aborted).toBe(false);
            controller1.abort();
            expect(combined.aborted).toBe(true);
        });

        it("is aborted if any input signal is already aborted", () => {
            const controller1 = new AbortController();
            const controller2 = new AbortController();
            controller2.abort();
            const combined = combineSignals(
                controller1.signal,
                controller2.signal,
            );

            expect(combined.aborted).toBe(true);
        });

        it("handles multiple signals and aborts on first abort", () => {
            const controller1 = new AbortController();
            const controller2 = new AbortController();
            const controller3 = new AbortController();
            const combined = combineSignals(
                controller1.signal,
                controller2.signal,
                controller3.signal,
            );

            expect(combined.aborted).toBe(false);
            controller2.abort();
            expect(combined.aborted).toBe(true);
            expect(controller1.signal.aborted).toBe(false);
            expect(controller3.signal.aborted).toBe(false);
        });
    });

    describe("withTimeout decorator", () => {
        it("succeeds before timeout and clears timeout", async () => {
            // Override for instant success
            mockFetch.mockImplementation((input, init) => {
                if (init?.signal?.aborted) {
                    return Promise.reject(
                        new DOMException(
                            "The operation was aborted",
                            "AbortError",
                        ),
                    );
                }
                return Promise.resolve(new MockResponse());
            });
            const fetchWithTimeout = withTimeout(1000)(mockFetch);

            const result = await fetchWithTimeout("https://example.com");
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockFetch).toHaveBeenCalledWith(
                "https://example.com",
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            );
            expect(result.status).toBe(200);

            jest.advanceTimersByTime(1000);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it("aborts fetch if timeout is exceeded", async () => {
            const fetchWithTimeout = withTimeout(1000)(mockFetch);

            const promise = fetchWithTimeout("https://example.com");
            expect(mockFetch).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(1000);
            await expect(promise).rejects.toThrow("The operation was aborted");
            expect(mockFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
        });

        it("respects existing init.signal abort", async () => {
            const controller = new AbortController();
            const fetchWithTimeout = withTimeout(1000)(mockFetch);

            const promise = fetchWithTimeout("https://example.com", {
                signal: controller.signal,
            });
            expect(mockFetch).toHaveBeenCalledTimes(1);

            controller.abort();
            await expect(promise).rejects.toThrow("The operation was aborted");
            expect(mockFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);

            jest.advanceTimersByTime(1000);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it("respects Request.signal abort", async () => {
            const controller = new AbortController();
            const request = new Request("https://example.com", {
                signal: controller.signal,
            });
            const fetchWithTimeout = withTimeout(1000)(mockFetch);

            const promise = fetchWithTimeout(request);
            expect(mockFetch).toHaveBeenCalledTimes(1);

            controller.abort();
            await expect(promise).rejects.toThrow("The operation was aborted");
            expect(mockFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);

            jest.advanceTimersByTime(1000);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it("combines multiple signals and aborts on any signal", async () => {
            const initController = new AbortController();
            const requestController = new AbortController();
            const request = new Request("https://example.com", {
                signal: requestController.signal,
            });
            const fetchWithTimeout = withTimeout(1000)(mockFetch);

            const promise = fetchWithTimeout(request, {
                signal: initController.signal,
            });
            expect(mockFetch).toHaveBeenCalledTimes(1);

            initController.abort();
            await expect(promise).rejects.toThrow("The operation was aborted");
            expect(mockFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);

            jest.advanceTimersByTime(1000);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });

        it("clears timeout on fetch failure", async () => {
            mockFetch.mockRejectedValue(new Error("Network Error"));
            const fetchWithTimeout = withTimeout(1000)(mockFetch);

            await expect(fetchWithTimeout("https://example.com")).rejects
                .toThrow("Network Error");
            expect(mockFetch).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(1000);
            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });
});
