import { withConcurrencyLimit } from "../src/withConcurrencyLimit"; // Adjusted path
import { FetchFn, FetchInit, FetchInput } from "../src/types";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createMockFetch = (responseTime: number = 100): FetchFn => {
    return async (input: FetchInput, init?: FetchInit): Promise<Response> => {
        await delay(responseTime);

        const mockResponse = {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({ data: `Response from ${input}` }),
            text: async () => `Response from ${input}`,
            headers: new Headers(),
            clone: () => ({ ...mockResponse }) as Response,
            url: typeof input === "string"
                ? input
                : input instanceof Request
                ? input.url
                : "",
        } as Response;

        if (init?.signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }

        return mockResponse;
    };
};

describe("withConcurrencyLimit", () => {
    it("limits concurrent requests to the specified maximum", async () => {
        const responseTime = 100; // 100ms per request
        const maxConcurrent = 2;
        const totalRequests = 5;
        const mockFetch = createMockFetch(responseTime);
        const limitedFetch = withConcurrencyLimit(maxConcurrent)(mockFetch);

        const startTime = Date.now();
        const requests = Array(totalRequests)
            .fill(null)
            .map((_, i) => limitedFetch(`https://example.com/api/${i}`));

        await Promise.all(requests);
        const duration = Date.now() - startTime;

        const expectedMinDuration = Math.ceil(totalRequests / maxConcurrent) *
            responseTime;
        expect(duration).toBeGreaterThanOrEqual(expectedMinDuration - 10);
        expect(duration).toBeLessThan(expectedMinDuration + 50);
    });

    it("processes a single request immediately", async () => {
        const mockFetch = createMockFetch(50);
        const limitedFetch = withConcurrencyLimit(2)(mockFetch);

        const startTime = Date.now();
        const response = await limitedFetch("https://example.com/api/1");
        const duration = Date.now() - startTime;

        expect(response.ok).toBe(true);
        expect(duration).toBeGreaterThanOrEqual(50);
        expect(duration).toBeLessThan(100);
    });

    it("respects abort signals in queued requests", async () => {
        const mockFetch = createMockFetch(100);
        const limitedFetch = withConcurrencyLimit(1)(mockFetch);
        const controller = new AbortController();

        const request1 = limitedFetch("https://example.com/api/1");
        const request2 = limitedFetch("https://example.com/api/2", {
            signal: controller.signal,
        });

        controller.abort();

        await expect(request1).resolves.toHaveProperty("ok", true);
        await expect(request2).rejects.toThrow("Aborted");
    });
});
