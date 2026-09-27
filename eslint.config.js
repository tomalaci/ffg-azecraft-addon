// Lint config (dev only): mainly catches undefined and unused names before they reach Foundry.
import js from "@eslint/js";
import globals from "globals";

/** Globals provided by the Foundry VTT V13 client and the starwarsffg system at runtime. */
const foundryGlobals = Object.fromEntries([
    "game", "foundry", "Hooks", "ui", "canvas", "CONFIG", "CONST",
    "Actor", "Item", "JournalEntry", "JournalEntryPage", "Folder", "User", "Scene", "Roll", "ChatMessage",
    "TextEditor", "Handlebars", "loadTemplates", "renderTemplate", "fromUuid", "fromUuidSync"
].map(name => [name, "readonly"]));

export default [
    { ignores: ["node_modules/", ".memory/", ".playwright-mcp/", "dist/"] },
    js.configs.recommended,
    {
        files: ["main.js", "scripts/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: { ...globals.browser, ...foundryGlobals }
        }
    },
    {
        files: ["tests/**/*.js", "eslint.config.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: { ...globals.node }
        }
    },
    {
        rules: {
            "no-unused-vars": ["error", { args: "none", caughtErrors: "none", ignoreRestSiblings: true }]
        }
    }
];
