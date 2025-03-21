import { RedisClient } from "../__tests__/mocks/redisMock";
import { pipe } from "./helpers";
import { OrderBook } from "./types";
import { withBinanceRateLimit } from "./withBinanceRateLimit";
import { HttpError, withBinanceRetries } from "./withBinanceRetries";
import { withTimeout } from "./withTimeout";
import { z } from "zod";

const BinanceOrderBookSchema = z.object({
    lastUpdateId: z.number(),
    bids: z.array(z.tuple([z.string(), z.string()])),
    asks: z.array(z.tuple([z.string(), z.string()])),
});

export type BinanceOrderBook = z.infer<typeof BinanceOrderBookSchema>;

export interface BinanceClient {
    getOrderBook: (symbol: string, limit?: number) => Promise<OrderBook>;
}

const normalizeBinanceSymbol = (
    receiveAsset: string,
    payAsset: string,
): string => {
    const rawSymbol = `${receiveAsset}${payAsset}`;

    if (rawSymbol === "BTCUSD") return "BTCUSDT";
    if (rawSymbol === "ETHBTC") return "ETHBTC"; // Already correct
    if (rawSymbol === "BTCETH") return "ETHBTC"; // Swap for Binance
    return rawSymbol;
};

export const createBinanceClient = (redisClient: RedisClient) => {
    const binanceFetch = pipe(
        withTimeout(5000),
        withBinanceRateLimit,
        withBinanceRetries,
    )(fetch);

    const baseUrl = "https://api.binance.com";

    const getOrderBook = async (
        symbol: string,
        limit: number = 100,
    ): Promise<OrderBook> => {
        const cacheKey = `orderbook:${symbol}:${limit}`;

        const cached = await redisClient.get(cacheKey);
        if (cached) {
            console.log(`Cache hit for ${cacheKey}`);
            return JSON.parse(cached);
        }
        console.log(`Cache miss for ${cacheKey}, fetching from API`);
        const url = `${baseUrl}/api/v3/depth?symbol=${symbol}&limit=${limit}`;
        const response = await binanceFetch(url);

        if (!response.ok) {
            const error = new Error(`HTTP ${response.status}`) as HttpError;
            error.status = response.status;
            error.headers = response.headers;
            throw error;
        }

        const rawData = await response.json();
        const binanceOrderBook = BinanceOrderBookSchema.parse(rawData);

        const orderBook: OrderBook = {
            bids: binanceOrderBook.bids.map(([price, volume]) =>
                [price, volume] as [string, string]
            ),
            asks: binanceOrderBook.asks.map(([price, volume]) =>
                [price, volume] as [string, string]
            ),
        };
        await redisClient.set(cacheKey, JSON.stringify(orderBook), "EX", 10);
        return orderBook;
    };

    return {
        getOrderBook: (
            receiveAsset: string,
            payAsset: string,
            limit: number = 100,
        ) => getOrderBook(
            normalizeBinanceSymbol(receiveAsset, payAsset),
            limit,
        ),
    };
};
