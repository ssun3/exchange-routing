import { z } from "zod";
import { OrderRequest } from "./types";

export const cryptoAssets = [
    "BTC",
    "ETH",
    "ETH_ARBITRUM",
    "ETH_BASE",
    "ETH_POLYGON",
    "USDC",
    "USDC_SOL",
    "USDC_POLYGON",
    "USDC_ARBITRUM",
    "USDT",
    "USDT_TRX",
    "USDT_SOL",
    "USDT_BSC",
    "SOL",
    "ADA",
    "XRP",
    "DOGE",
    "SHIB",
    "DAI",
    "BNB_BSC",
    "TON",
] as const;

export const fiatAssets = [
    "AUD",
    "BGN",
    "BRL",
    "CAD",
    "CHF",
    "COP",
    "CZK",
    "DKK",
    "DOP",
    "EGP",
    "EUR",
    "GBP",
    "HKD",
    "IDR",
    "ILS",
    "JOD",
    "KES",
    "KWD",
    "LKR",
    "MXN",
    "NGN",
    "NOK",
    "NZD",
    "OMR",
    "PEN",
    "PLN",
    "RON",
    "SEK",
    "THB",
    "TRY",
    "TWD",
    "USD",
    "VND",
    "ZAR",
] as const;

export const CryptoAssetSchema = z.enum(cryptoAssets);
export const FiatAssetSchema = z.enum(fiatAssets);

export const BuyOrderSchema = z.object({
    kind: z.literal("buy"),
    receiveAsset: CryptoAssetSchema,
    payAsset: FiatAssetSchema,
    volume: z.string().transform(Number).pipe(z.number().positive()),
});

export const SellOrderSchema = z.object({
    kind: z.literal("sell"),
    receiveAsset: FiatAssetSchema,
    payAsset: CryptoAssetSchema,
    volume: z.string().transform(Number).pipe(z.number().positive()),
});

export const SwapOrderSchema = z.object({
    kind: z.literal("swap"),
    receiveAsset: CryptoAssetSchema,
    payAsset: CryptoAssetSchema,
    volume: z.string().transform(Number).pipe(z.number().positive()),
});

export const ExternalOrderSchema = z.discriminatedUnion("kind", [
    BuyOrderSchema,
    SellOrderSchema,
    SwapOrderSchema,
]);

export type ExternalOrder = z.infer<typeof ExternalOrderSchema>;

export const toOrderRequest = (
    data: z.infer<typeof ExternalOrderSchema>,
): OrderRequest => {
    switch (data.kind) {
        case "buy":
            return {
                kind: "buy",
                assets: {
                    receiveAsset: data.receiveAsset,
                    payAsset: data.payAsset,
                },
                receiveVolume: data.volume,
            };
        case "sell":
            return {
                kind: "sell",
                assets: {
                    receiveAsset: data.receiveAsset,
                    payAsset: data.payAsset,
                },
                receiveVolume: data.volume,
            };
        case "swap":
            return {
                kind: "swap",
                assets: {
                    receiveAsset: data.receiveAsset,
                    payAsset: data.payAsset,
                },
                payVolume: data.volume,
            };
    }
};
