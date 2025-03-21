// jest.config.ts
import type { Config } from "jest";

const config: Config = {
    // Test environment
    testEnvironment: "node",

    // File patterns to find tests (adjusted for src and __tests__)
    testMatch: ["**/__tests__/**/*.test.ts"],

    // Transform TypeScript files using @swc/jest
    transform: {
        "^.+\\.ts$": [
            "@swc/jest",
            {
                jsc: {
                    parser: {
                        syntax: "typescript",
                    },
                    target: "es2020", // Matches your tsconfig "target"
                },
                module: {
                    type: "commonjs", // Default since module isn’t specified in tsconfig
                },
            },
        ],
    },

    // Module file extensions
    moduleFileExtensions: ["ts", "js", "json"],

    // Map module paths to match tsconfig’s "include": ["src"]
    roots: ["<rootDir>/src", "<rootDir>/__tests__"],

    // Optional: Verbose output and coverage
    verbose: true,
    collectCoverage: false,
    coverageDirectory: "coverage",
    coverageReporters: ["text", "lcov"],
    testTimeout: 10000,
};

export default config;
