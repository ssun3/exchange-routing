import { OrderBook } from "./types";
import { createBinanceClient } from "./binanceClient";
import { RedisClient } from "../__tests__/mocks/redisMock";

export interface ExchangeClient {
    name: string; // e.g., 'binance', 'coinbase'
    getOrderBook(
        receiveAsset: string,
        payAsset: string,
        limit?: number,
    ): Promise<OrderBook>;
}

export type ExchangeRegistry = Record<string, ExchangeClient>;

export const createExchangeRegistry = (
    redisClient: RedisClient,
): ExchangeRegistry => {
    return {
        binance: {
            ...createBinanceClient(redisClient),
            name: "binance",
        },
    };
};

// Singleton registry (now requires explicit initialization)
let exchangeRegistry: ExchangeRegistry | undefined;

export const initializeExchangeRegistry = (redisClient: RedisClient) => {
    if (!exchangeRegistry) {
        exchangeRegistry = createExchangeRegistry(redisClient);
    }
    return exchangeRegistry;
};

export const getExchangeRegistry = () => {
    if (!exchangeRegistry) {
        throw new Error(
            "Exchange registry not initialized. Call initializeExchangeRegistry first.",
        );
    }
    return exchangeRegistry;
};
