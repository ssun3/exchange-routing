import { cryptoAssets, fiatAssets } from "./schema";

export type FetchFn = typeof fetch;
export type FetchInput = Parameters<FetchFn>[0];
export type FetchInit = Parameters<FetchFn>[1];
export type FetchReturn = ReturnType<FetchFn>;
export type FetchDecorator = (fetchFn: FetchFn) => FetchFn;

export type CryptoCurrency = typeof cryptoAssets[number];
export type FiatCurrency = typeof fiatAssets[number];

export type Currency = FiatCurrency | CryptoCurrency;

export type OrderSide = "buy" | "sell";
export type OrderKind = OrderSide | "swap";

export type AssetPair<K extends OrderKind> = K extends "buy"
    ? { receiveAsset: CryptoCurrency; payAsset: FiatCurrency }
    : K extends "sell"
        ? { receiveAsset: FiatCurrency; payAsset: CryptoCurrency }
    : K extends "swap"
        ? { receiveAsset: CryptoCurrency; payAsset: CryptoCurrency }
    : never;

export interface BuyOrderRequest {
    kind: "buy";
    assets: AssetPair<"buy">;
    receiveVolume: number;
}

export interface SellOrderRequest {
    kind: "sell";
    assets: AssetPair<"sell">;
    receiveVolume: number;
}

export interface SwapOrderRequest {
    kind: "swap";
    assets: AssetPair<"swap">;
    payVolume: number;
}

export type OrderRequest =
    | BuyOrderRequest
    | SellOrderRequest
    | SwapOrderRequest;

export type ExchangeId = string & { readonly __brand: "ExchangeId" };
export const asExchangeId = (id: string): ExchangeId => id as ExchangeId;

export type QuoteType = "bid" | "ask";

export interface Quote<
    A extends Currency,
    P extends Currency,
    T extends QuoteType = QuoteType,
> {
    type: T;
    asset: A;
    priceAsset: P;
    price: number;
    volume: number;
    exchange: ExchangeId;
}

export type BidQuote<A extends Currency, P extends Currency> = Quote<
    A,
    P,
    "bid"
>;
export type AskQuote<A extends Currency, P extends Currency> = Quote<
    A,
    P,
    "ask"
>;

export type Quotes<K extends OrderKind> = K extends "buy" ? {
        context: "buy";
        bids: BidQuote<CryptoCurrency, FiatCurrency>[];
        asks: AskQuote<CryptoCurrency, FiatCurrency>[];
    }
    : K extends "sell" ? {
            context: "sell";
            bids: BidQuote<FiatCurrency, CryptoCurrency>[];
            asks: AskQuote<FiatCurrency, CryptoCurrency>[];
        }
    : K extends "swap" ? {
            context: "swap";
            bids: BidQuote<CryptoCurrency, CryptoCurrency>[];
            asks: AskQuote<CryptoCurrency, CryptoCurrency>[];
        }
    : never;

export interface Trade<Asset, Price> {
    exchange: ExchangeId;
    volume: number; // Volume of Asset
    price: number; // Price in Price per unit of Asset
    cost: number; // volume * price in Price
}

export interface BuyRouteResult {
    trades: Trade<CryptoCurrency, FiatCurrency>[];
    totalReceiveVolume: number; // Crypto received
    totalPayCost: number; // Fiat paid
    averagePrice: number;
}

export interface SellRouteResult {
    trades: Trade<FiatCurrency, CryptoCurrency>[];
    totalReceiveVolume: number; // Fiat received
    totalPayCost: number; // Crypto paid
    averagePrice: number;
}

export interface SwapRouteResult {
    trades: Trade<CryptoCurrency, CryptoCurrency>[];
    totalPayVolume: number; // Crypto paid
    totalReceiveVolume: number; // Crypto received
    averagePrice: number;
}

export type RouteOutcome<K extends OrderKind> = K extends "buy"
    ? { success: true; result: BuyRouteResult; kind: "buy" } | {
        success: false;
        error: "InsufficientLiquidity" | "InvalidOrder";
        kind: "buy";
    }
    : K extends "sell"
        ? { success: true; result: SellRouteResult; kind: "sell" } | {
            success: false;
            error: "InsufficientLiquidity" | "InvalidOrder";
            kind: "sell";
        }
    : K extends "swap"
        ? { success: true; result: SwapRouteResult; kind: "swap" } | {
            success: false;
            error: "InsufficientLiquidity" | "InvalidOrder";
            kind: "swap";
        }
    : never;

export interface OrderBook {
    bids: [string, string][];
    asks: [string, string][];
}

export type RouteHandler<K extends OrderKind> = (
    order: OrderRequest & { kind: K },
    quotes: Quotes<K>,
) => RouteOutcome<K>;
