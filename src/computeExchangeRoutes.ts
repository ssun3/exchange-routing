import { getExchangeRegistry } from "./exchangeUtils";
import {
    asExchangeId,
    AskQuote,
    BidQuote,
    BuyOrderRequest,
    CryptoCurrency,
    Currency,
    FiatCurrency,
    OrderKind,
    OrderRequest,
    Quote,
    Quotes,
    RouteHandler,
    RouteOutcome,
    SellOrderRequest,
    SwapOrderRequest,
    Trade,
} from "./types";

export const fillTrades = <A extends Currency, P extends Currency>(
    quotes: AskQuote<A, P>[] | BidQuote<A, P>[],
    targetVolume: number,
    sortFn: (a: Quote<A, P>, b: Quote<A, P>) => number,
): { trades: Trade<A, P>[]; remaining: number } => {
    return quotes
        .sort(sortFn)
        .reduce(
            (acc, quote) => {
                if (acc.remaining <= 0) return acc;
                const volumeToTake = Math.min(acc.remaining, quote.volume);
                const cost = volumeToTake * quote.price;
                return {
                    trades: [...acc.trades, {
                        exchange: quote.exchange,
                        volume: volumeToTake,
                        price: quote.price,
                        cost,
                    }],
                    remaining: acc.remaining - volumeToTake,
                };
            },
            { trades: [] as Trade<A, P>[], remaining: targetVolume },
        );
};

export const computeTotals = <A, P>(
    trades: Trade<A, P>[],
    receiveIsVolume: boolean,
): { totalReceive: number; totalPay: number; averagePrice: number } => {
    const totalReceive = trades.reduce(
        (sum, t) => sum + (receiveIsVolume ? t.volume : t.cost),
        0,
    );
    const totalPay = trades.reduce(
        (sum, t) => sum + (receiveIsVolume ? t.cost : t.volume),
        0,
    );
    const averagePrice = totalReceive > 0 ? totalPay / totalReceive : 0;
    return { totalReceive, totalPay, averagePrice };
};

export const computeBuyRoute = (
    order: BuyOrderRequest,
    quotes: Quotes<"buy">,
): RouteOutcome<"buy"> => {
    const { trades, remaining } = fillTrades(
        quotes.asks,
        order.receiveVolume,
        (a, b) => a.price - b.price,
    );

    if (remaining > 0) {
        return { success: false, error: "InsufficientLiquidity", kind: "buy" };
    }

    const { totalReceive, totalPay, averagePrice } = computeTotals(
        trades,
        true,
    );
    return {
        success: true,
        kind: "buy",
        result: {
            trades,
            totalReceiveVolume: totalReceive,
            totalPayCost: totalPay,
            averagePrice,
        },
    };
};

export const computeSellRoute = (
    order: SellOrderRequest,
    quotes: Quotes<"sell">,
): RouteOutcome<"sell"> => {
    const { trades, remaining } = fillTrades(
        quotes.bids,
        order.receiveVolume,
        (a, b) => b.price - a.price,
    );

    if (remaining > 0) {
        return { success: false, error: "InsufficientLiquidity", kind: "sell" };
    }

    const { totalReceive, totalPay, averagePrice } = computeTotals(
        trades,
        true,
    );
    return {
        success: true,
        kind: "sell",
        result: {
            trades,
            totalReceiveVolume: totalReceive,
            totalPayCost: totalPay,
            averagePrice,
        },
    };
};

export const computeSwapRoute = (
    order: SwapOrderRequest,
    quotes: Quotes<"swap">,
): RouteOutcome<"swap"> => {
    const { trades, remaining } = fillTrades(
        quotes.asks,
        order.payVolume,
        (a, b) => a.price - b.price,
    );

    if (remaining > 0) {
        return { success: false, error: "InsufficientLiquidity", kind: "swap" };
    }

    const { totalReceive, totalPay, averagePrice } = computeTotals(
        trades,
        false,
    );
    return {
        success: true,
        kind: "swap",
        result: {
            trades,
            totalPayVolume: totalPay,
            totalReceiveVolume: totalReceive,
            averagePrice,
        },
    };
};

const routeHandlers: { [K in OrderKind]: RouteHandler<K> } = {
    buy: computeBuyRoute as RouteHandler<"buy">,
    sell: computeSellRoute as RouteHandler<"sell">,
    swap: computeSwapRoute as RouteHandler<"swap">,
};

export const fetchAggregatedQuotesFromExchanges = async <K extends OrderKind>(
    order: OrderRequest & { kind: K },
): Promise<Quotes<K>> => {
    const { receiveAsset, payAsset } = order.assets;

    const exchangeClients = Object.values(getExchangeRegistry());
    const books = await Promise.all(
        exchangeClients.map((client) =>
            client.getOrderBook(receiveAsset, payAsset)
        ),
    );

    const quotes = books.flatMap((book, i) => {
        const exchange = asExchangeId(exchangeClients[i].name);
        return {
            bids: book.bids.map(([price, volume]) => ({
                type: "bid" as const,
                asset: receiveAsset as CryptoCurrency | FiatCurrency,
                priceAsset: payAsset as CryptoCurrency | FiatCurrency,
                price: parseFloat(price),
                volume: parseFloat(volume),
                exchange,
            })),
            asks: book.asks.map(([price, volume]) => ({
                type: "ask" as const,
                asset: receiveAsset as CryptoCurrency | FiatCurrency,
                priceAsset: payAsset as CryptoCurrency | FiatCurrency,
                price: parseFloat(price),
                volume: parseFloat(volume),
                exchange,
            })),
        };
    });

    return {
        context: order.kind,
        bids: order.kind === "sell" ? quotes.flatMap((q) => q.bids) : [],
        asks: order.kind === "buy" || order.kind === "swap"
            ? quotes.flatMap((q) => q.asks)
            : [],
    } as Quotes<K>;
};

export const computeExchangeRoutes = async <K extends OrderKind>(
    order: OrderRequest & { kind: K },
): Promise<RouteOutcome<K>> => {
    const quotes = await fetchAggregatedQuotesFromExchanges(
        order as BuyOrderRequest & { kind: "buy" & K },
    );
    if (order.kind !== quotes.context) {
        return {
            success: false,
            error: "InvalidOrder",
            kind: order.kind,
        } as RouteOutcome<K>;
    }
    const handler = routeHandlers[order.kind];
    return handler(order, quotes);
};
