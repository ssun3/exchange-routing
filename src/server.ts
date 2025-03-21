// src/server.ts
import express, { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { computeExchangeRoutes } from "./computeExchangeRoutes";
import { initializeAppDependencies } from "./config";
import { ExternalOrderSchema, toOrderRequest } from "./schema";
initializeAppDependencies();

const app = express();
const port = 3000;

app.use(express.json());

const errorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    if (err instanceof z.ZodError) {
        return res.status(400).json({
            error: "Invalid request data",
            details: err.errors,
        });
    }
    if (err instanceof Error && err.message === "InsufficientLiquidity") {
        return res.status(422).json({
            error: "Insufficient liquidity to fulfill order",
        });
    }
    console.error("Unexpected error:", err);
    res.status(500).json({ error: "Internal server error" });
};

app.get("/api/route", async (req: Request, res: Response) => {
    try {
        const externalData = ExternalOrderSchema.parse({
            kind: req.query.kind,
            receiveAsset: req.query.receiveAsset,
            payAsset: req.query.payAsset,
            volume: req.query.volume,
        });

        const orderRequest = toOrderRequest(externalData);

        const routeOutcome = await computeExchangeRoutes(orderRequest);

        // Handle route outcome
        if (routeOutcome.success === false) {
            throw new Error(routeOutcome.error);
        }

        // Success response
        res.status(200).json({
            success: true,
            result: routeOutcome.result,
        });
    } catch (err) {
        errorHandler(err, req, res, () => {});
    }
});

const server = app.listen(port, () => {
    console.log(`App listening on port ${port}`);
});

const shutdown = async () => {
    console.log("Shutting down server...");
    server.close(() => {
        console.log("Server closed");
        process.exit(0);
    });
};

process.once("SIGTERM", async () => {
    console.log("Received SIGTERM");
    await shutdown();
});

process.once("SIGINT", async () => {
    console.log("Received SIGINT");
    await shutdown();
});
