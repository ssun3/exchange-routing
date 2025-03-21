import { withBinanceRetries } from "../src/withBinanceRetries";
import { FetchFn } from "../src/types";

class MockResponse implements Response {
    headers: Headers;
    ok: boolean;
    status: number;
    statusText = "";
    constructor(status: number, headers?: Record<string, string>) {
        this.status = status;
        this.ok = status >= 200 && status < 300;
        this.headers = new Headers(headers);
    }
    json = async () => ({});
    text = async () => "";
    blob = async () => new Blob();
    formData = async () => new FormData();
    arrayBuffer = async () => new ArrayBuffer(0);
    bytes = async () => new Uint8Array(0);
    body = null;
    bodyUsed = false;
    type = "basic" as const;
    url = "";
    redirected = false;
    clone = () => new MockResponse(this.status);
}

describe("withBinanceRetries", () => {
    let mockFetch: jest.MockedFunction<FetchFn>;
    let fetchWithRetries: ReturnType<typeof withBinanceRetries>;

    beforeEach(() => {
        mockFetch = jest.fn();
        // For testing, reduce delays by overriding getBinanceRetryDelay
        fetchWithRetries = withBinanceRetries(mockFetch);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("succeeds on first attempt without retries", async () => {
        mockFetch.mockResolvedValue(new MockResponse(200));
        const result = await fetchWithRetries("https://api.binance.com/test");

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
            "https://api.binance.com/test",
            undefined,
        );
        expect(result.status).toBe(200);
    });

    it("retries HTTP 429 with Retry-After and succeeds", async () => {
        const error = Object.assign(new Error("Rate Limit"), {
            status: 429,
            headers: new Headers({ "Retry-After": "2" }), // 2000ms
        });
        mockFetch
            .mockRejectedValueOnce(error)
            .mockResolvedValueOnce(new MockResponse(200));

        const result = await fetchWithRetries("https://api.binance.com/test");

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(result.status).toBe(200);
    }, 3000); // Timeout > 2000ms

    it(
        "retries HTTP 418 with Retry-After and fails after max retries",
        async () => {
            const error = Object.assign(new Error("IP Ban"), {
                status: 418,
                headers: new Headers({ "Retry-After": "1" }), // 1000ms
            });
            mockFetch.mockRejectedValue(error);

            await expect(fetchWithRetries("https://api.binance.com/test"))
                .rejects.toMatchObject({ message: "IP Ban" });
            expect(mockFetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
        },
        4000,
    ); // Timeout > 3000ms (3 * 1000ms)

    it("retries HTTP 500 with exponential backoff and succeeds", async () => {
        const error = Object.assign(new Error("Server Error"), { status: 500 });
        mockFetch
            .mockRejectedValueOnce(error) // 200ms
            .mockRejectedValueOnce(error) // 400ms
            .mockResolvedValueOnce(new MockResponse(200));

        const result = await fetchWithRetries("https://api.binance.com/test");

        expect(mockFetch).toHaveBeenCalledTimes(3);
        expect(result.status).toBe(200);
    }, 1000); // Timeout > 600ms (200 + 400)

    it("does not retry HTTP 400 and fails immediately", async () => {
        const error = Object.assign(new Error("Bad Request"), { status: 400 });
        mockFetch.mockRejectedValue(error);

        await expect(fetchWithRetries("https://api.binance.com/test")).rejects
            .toMatchObject({ message: "Bad Request" });
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("retries ETIMEDOUT network error and succeeds", async () => {
        const error = Object.assign(new Error("ETIMEDOUT"), {
            code: "ETIMEDOUT",
        });
        mockFetch
            .mockRejectedValueOnce(error) // 200ms
            .mockResolvedValueOnce(new MockResponse(200));

        const result = await fetchWithRetries("https://api.binance.com/test");

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(result.status).toBe(200);
    }, 500); // Timeout > 200ms

    it("fails after max retries on persistent 429", async () => {
        const error = Object.assign(new Error("Rate Limit"), {
            status: 429,
            headers: new Headers({ "Retry-After": "1" }), // 1000ms
        });
        mockFetch.mockRejectedValue(error);

        await expect(fetchWithRetries("https://api.binance.com/test")).rejects
            .toMatchObject({ message: "Rate Limit" });
        expect(mockFetch).toHaveBeenCalledTimes(4);
    }, 4000); // Timeout > 3000ms

    it("caps retry delay at maxDelay", async () => {
        const error = Object.assign(new Error("Server Error"), { status: 500 });
        mockFetch.mockRejectedValue(error);

        await expect(fetchWithRetries("https://api.binance.com/test")).rejects
            .toMatchObject({ message: "Server Error" });
        expect(mockFetch).toHaveBeenCalledTimes(4);

        const largeDelay = 200 * Math.pow(2, 9); // 102400ms
        expect(Math.min(largeDelay, 60 * 1000)).toBe(60 * 1000);
    }, 2000); // Timeout > 1400ms (200 + 400 + 800)
});
