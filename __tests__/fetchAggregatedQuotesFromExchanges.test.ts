import { fetchAggregatedQuotesFromExchanges } from "../src/computeExchangeRoutes";
import { initializeExchangeRegistry } from "../src/exchangeUtils";
import { BuyOrderRequest, OrderBook } from "../src/types";
import { createRedisMock } from "./mocks/redisMock";

const mockRedisClient = createRedisMock(); // Use your existing mock
const mockBinanceClient = {
    name: "binance",
    getOrderBook: jest.fn(),
};

// Mock the exchangeClients module globally
jest.mock("../src/exchangeUtils", () => ({
    createExchangeRegistry: () => ({ binance: mockBinanceClient }),
    initializeExchangeRegistry: jest.fn(() => ({ binance: mockBinanceClient })),
    getExchangeRegistry: () => ({ binance: mockBinanceClient }),
}));

describe("fetchAggregatedQuotesFromExchanges", () => {
    beforeEach(() => {
        // Clear mocks
        mockBinanceClient.getOrderBook.mockClear();
        mockRedisClient.mockClear?.();

        // Reset modules to ensure fresh state
        jest.resetModules();

        // Re-import and initialize after reset
        const { initializeExchangeRegistry } = require("../src/exchangeUtils");
        initializeExchangeRegistry(mockRedisClient);
    });

    afterEach(() => {
        jest.resetModules(); // Ensure clean state between tests
    });

    it("aggregates quotes from Binance", async () => {
        const mockOrderBook: OrderBook = {
            bids: [["9999", "2"]],
            asks: [["10000", "1"]],
        };
        mockBinanceClient.getOrderBook.mockResolvedValue(mockOrderBook);

        const buyOrder: BuyOrderRequest = {
            kind: "buy",
            assets: { receiveAsset: "BTC", payAsset: "USD" },
            receiveVolume: 3,
        };

        const quotes = await fetchAggregatedQuotesFromExchanges(buyOrder);

        expect(mockBinanceClient.getOrderBook).toHaveBeenCalledWith(
            "BTC",
            "USD",
        );
        expect(quotes).toEqual({
            context: "buy",
            bids: [],
            asks: [
                {
                    type: "ask",
                    asset: "BTC",
                    priceAsset: "USD",
                    price: 10000,
                    volume: 1,
                    exchange: "binance",
                },
            ],
        });
    });
});
