import { createRedisMock } from "../__tests__/mocks/redisMock";
import { initializeExchangeRegistry } from "./exchangeUtils";

export const initializeAppDependencies = () => {
    const redisClient = createRedisMock(); // Replace with real Redis in production
    initializeExchangeRegistry(redisClient);
    return { redisClient };
};
