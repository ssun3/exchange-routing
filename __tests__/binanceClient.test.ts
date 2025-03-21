import { createBinanceClient } from "../src/binanceClient";
import { createRedisMock } from "./mocks/redisMock"; // Adjust path if needed

describe("binanceClient caching", () => {
    let redisClient: ReturnType<typeof createRedisMock>;
    let fetchMock: jest.Mock;

    beforeEach(() => {
        // Create a fresh mock Redis client
        redisClient = createRedisMock();

        // Mock fetch
        fetchMock = jest.fn();
        global.fetch = fetchMock;

        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("fetches from API and caches on first call", async () => {
        // Mock Binance API response
        const mockOrderBook = {
            lastUpdateId: 123,
            bids: [["10000", "1"]],
            asks: [["10001", "2"]],
        };
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => mockOrderBook,
            status: 200,
            headers: new Headers(),
        });

        const client = createBinanceClient(redisClient);
        const result = await client.getOrderBook("BTC", "USD");

        // Assertions
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=100",
            expect.objectContaining({ signal: expect.anything() }), // Match any signal
        );
        expect(result).toEqual({
            bids: [["10000", "1"]],
            asks: [["10001", "2"]],
        });

        // Check cache was set
        const cached = await redisClient.get("orderbook:BTCUSDT:100");
        expect(cached).toEqual(JSON.stringify({
            bids: [["10000", "1"]],
            asks: [["10001", "2"]],
        }));
    });

    it("returns cached result on second call", async () => {
        // Pre-populate cache
        const cachedData = {
            bids: [["10000", "1"]],
            asks: [["10001", "2"]],
        };
        await redisClient.set(
            "orderbook:BTCUSDT:100",
            JSON.stringify(cachedData),
            "EX",
            10,
        );

        const client = createBinanceClient(redisClient);
        const result = await client.getOrderBook("BTC", "USD");

        // Assertions
        expect(fetchMock).not.toHaveBeenCalled(); // No API call
        expect(result).toEqual(cachedData);
    });

    it("fetches from API after cache expires", async () => {
        // Pre-populate cache with short TTL
        const cachedData = {
            bids: [["10000", "1"]],
            asks: [["10001", "2"]],
        };
        await redisClient.set(
            "orderbook:BTCUSDT:100",
            JSON.stringify(cachedData),
            "EX",
            1,
        );

        // Mock Binance API response for after expiration
        const newOrderBook = {
            lastUpdateId: 124,
            bids: [["10002", "3"]],
            asks: [["10003", "4"]],
        };
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => newOrderBook,
            status: 200,
            headers: new Headers(),
        });

        const client = createBinanceClient(redisClient);

        // First call: should hit cache
        const firstResult = await client.getOrderBook("BTC", "USD");
        expect(fetchMock).not.toHaveBeenCalled();
        expect(firstResult).toEqual(cachedData);

        // Wait for cache to expire (1 second)
        await new Promise((resolve) => setTimeout(resolve, 1100)); // 1.1s > 1s TTL

        // Second call: should hit API
        const secondResult = await client.getOrderBook("BTC", "USD");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(secondResult).toEqual({
            bids: [["10002", "3"]],
            asks: [["10003", "4"]],
        });
    });
});
