import { withBinanceRateLimit } from "../src/withBinanceRateLimit";
import { FetchFn, FetchInput } from "../src/types";

class MockHeaders implements Headers {
    private headers: Record<string, string> = {};
    append(name: string, value: string) {
        this.headers[name.toLowerCase()] = value;
    }
    delete(name: string) {
        delete this.headers[name.toLowerCase()];
    }
    get(name: string) {
        return this.headers[name.toLowerCase()] || null;
    }
    has(name: string) {
        return !!this.headers[name.toLowerCase()];
    }
    set(name: string, value: string) {
        this.headers[name.toLowerCase()] = value;
    }
    getSetCookie(): string[] {
        return this.headers["set-cookie"]?.split(", ").map((c) => c.trim()) ||
            [];
    }
    forEach(callback: (value: string, key: string, parent: Headers) => void) {
        Object.entries(this.headers).forEach(([key, value]) =>
            callback(value, key, this)
        );
    }
    entries() {
        return Object.entries(this.headers)[Symbol.iterator]();
    }
    keys() {
        return Object.keys(this.headers)[Symbol.iterator]();
    }
    values() {
        return Object.values(this.headers)[Symbol.iterator]();
    }
    [Symbol.iterator]() {
        return this.entries();
    }
}

class MockResponse implements Response {
    headers: Headers;
    ok = true;
    status = 200;
    statusText = "OK";
    type = "basic" as const;
    url = "";
    redirected = false;
    body: ReadableStream<Uint8Array> | null = null;
    bodyUsed = false;

    constructor(headers?: Record<string, string>) {
        this.headers = new MockHeaders();
        if (headers) {
            Object.entries(headers).forEach(([k, v]) => this.headers.set(k, v));
        }
    }

    clone(): Response {
        return new MockResponse();
    }
    arrayBuffer(): Promise<ArrayBuffer> {
        return Promise.resolve(new ArrayBuffer(0));
    }
    blob(): Promise<Blob> {
        return Promise.resolve(new Blob());
    }
    formData(): Promise<FormData> {
        return Promise.resolve(new FormData());
    }
    json(): Promise<any> {
        return Promise.resolve({});
    }
    text(): Promise<string> {
        return Promise.resolve("");
    }
    bytes(): Promise<Uint8Array> {
        return Promise.resolve(new Uint8Array(0));
    }
}

describe("withBinanceRateLimit", () => {
    let mockFetch: jest.MockedFunction<FetchFn>;
    let rateLimitedFetch: ReturnType<typeof withBinanceRateLimit>;

    beforeEach(() => {
        jest.useFakeTimers();
        mockFetch = jest.fn(async (input: FetchInput) => new MockResponse());
        rateLimitedFetch = withBinanceRateLimit(mockFetch);
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    it("allows requests under the limit", async () => {
        const url =
            "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT";
        await rateLimitedFetch(url);
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(url, undefined);
    });

    it("delays requests when requestWeight limit is exceeded", async () => {
        mockFetch.mockImplementation(async () =>
            new MockResponse({ "x-mbx-used-weight-1m": "6000" })
        );
        const url =
            "https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=50"; // Cost: 5
        await rateLimitedFetch(url); // Updates state to 6000
        expect(mockFetch).toHaveBeenCalledTimes(1);

        mockFetch.mockImplementation(async () => new MockResponse());
        const promise = rateLimitedFetch(url); // 6000 + 5 = 6005 > 6000
        jest.advanceTimersByTime(1); // Small advance
        expect(mockFetch).toHaveBeenCalledTimes(1); // Should delay
        jest.advanceTimersByTime(60 * 1000 - 1); // Full 1m window
        await promise;
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("delays requests when orders10s limit would be exceeded", async () => {
        mockFetch.mockImplementation(async () =>
            new MockResponse({ "x-mbx-order-count-10s": "100" })
        );
        const url = "https://api.binance.com/api/v3/order?symbol=BTCUSDT"; // Cost: 1
        await rateLimitedFetch(url); // Updates state to 100
        expect(mockFetch).toHaveBeenCalledTimes(1);

        mockFetch.mockImplementation(async () => new MockResponse());
        const promise = rateLimitedFetch(url); // 100 + 1 = 101 > 100
        jest.advanceTimersByTime(1); // Small advance
        expect(mockFetch).toHaveBeenCalledTimes(1); // Should delay
        jest.advanceTimersByTime(10 * 1000 - 1); // Full 10s window
        await promise;
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("delays requests when orders1d limit would be exceeded", async () => {
        mockFetch.mockImplementation(async () =>
            new MockResponse({ "x-mbx-order-count-1d": "200000" })
        );
        const url = "https://api.binance.com/api/v3/order?symbol=BTCUSDT"; // Cost: 1
        await rateLimitedFetch(url); // Updates state to 200000
        expect(mockFetch).toHaveBeenCalledTimes(1);

        mockFetch.mockImplementation(async () => new MockResponse());
        const promise = rateLimitedFetch(url); // 200000 + 1 = 200001 > 200000
        jest.advanceTimersByTime(1); // Small advance
        expect(mockFetch).toHaveBeenCalledTimes(1); // Should delay
        jest.advanceTimersByTime(24 * 60 * 60 * 1000 - 1); // Full 1d window
        await promise;
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("increments and delays rawRequests manually", async () => {
        const url =
            "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"; // Cost: 1
        rateLimitedFetch = withBinanceRateLimit(mockFetch, {
            rawRequests: { limit: 5, intervalMs: 1000, type: "RAW_REQUESTS" },
        });

        for (let i = 0; i < 5; i++) {
            await rateLimitedFetch(url); // 5 requests
        }
        expect(mockFetch).toHaveBeenCalledTimes(5);

        const promise = rateLimitedFetch(url); // 5 + 1 = 6 > 5
        jest.advanceTimersByTime(1); // Small advance
        expect(mockFetch).toHaveBeenCalledTimes(5); // Should delay
        jest.advanceTimersByTime(1000 - 1); // Full 1s window
        await promise;
        expect(mockFetch).toHaveBeenCalledTimes(6);
    });

    it("resets windows after interval expires", async () => {
        mockFetch.mockImplementation(async () =>
            new MockResponse({ "x-mbx-used-weight-1m": "6000" })
        );
        const url =
            "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"; // Cost: 1
        await rateLimitedFetch(url); // Hits 6000
        expect(mockFetch).toHaveBeenCalledTimes(1);

        mockFetch.mockImplementation(async () => new MockResponse());
        const promise = rateLimitedFetch(url); // 6000 + 1 = 6001 > 6000
        jest.advanceTimersByTime(60 * 1000); // Full 1m window
        await promise;
        expect(mockFetch).toHaveBeenCalledTimes(2); // Allowed after reset
    });

    it("handles multiple headers with different intervals", async () => {
        mockFetch.mockImplementation(async () =>
            new MockResponse({
                "x-mbx-used-weight-1m": "5000",
                "x-mbx-used-weight-5m": "61000",
                "x-mbx-order-count-10s": "100",
            })
        );
        const url = "https://api.binance.com/api/v3/order?symbol=BTCUSDT"; // Cost: 1 order, 1 weight
        await rateLimitedFetch(url); // Orders to 100, weight to 5000
        expect(mockFetch).toHaveBeenCalledTimes(1);

        mockFetch.mockImplementation(async () => new MockResponse());
        const promise = rateLimitedFetch(url); // Orders to 101 > 100
        jest.advanceTimersByTime(1); // Small advance
        expect(mockFetch).toHaveBeenCalledTimes(1); // Should delay
        jest.advanceTimersByTime(10 * 1000 - 1); // Full 10s window
        await promise;
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("estimates higher cost for depth with limit > 100", async () => {
        mockFetch.mockImplementation(async () =>
            new MockResponse({ "x-mbx-used-weight-1m": "6000" })
        );
        const url =
            "https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=500"; // Cost: 25
        await rateLimitedFetch(url); // Takes it to 6000
        expect(mockFetch).toHaveBeenCalledTimes(1);

        mockFetch.mockImplementation(async () => new MockResponse());
        const promise = rateLimitedFetch(url); // 6000 + 25 = 6025 > 6000
        jest.advanceTimersByTime(1); // Small advance
        expect(mockFetch).toHaveBeenCalledTimes(1); // Should delay
        jest.advanceTimersByTime(60 * 1000 - 1); // Full 1m window
        await promise;
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });
});
