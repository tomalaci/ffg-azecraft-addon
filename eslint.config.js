// Lint config (dev only): mainly catches undefined and unused names before they reach Foundry.
import js from "@eslint/js";
import globals from "globals";
import importX from "eslint-plugin-import-x";

/** Globals provided by the Foundry VTT V13 client and the starwarsffg system at runtime. */
const foundryGlobals = Object.fromEntries([
    "game", "foundry", "Hooks", "ui", "canvas", "CONFIG", "CONST",
    "Actor", "ActiveEffect", "Item", "JournalEntry", "JournalEntryPage", "Folder", "User", "Scene", "Roll", "ChatMessage",
    "TextEditor", "Handlebars", "loadTemplates", "renderTemplate", "fromUuid", "fromUuidSync"
].map(name => [name, "readonly"]));

export default [
    { ignores: ["node_modules/", ".memory/", ".book_db/", ".playwright-mcp/", "dist/"] },
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
        // Imported names and files must exist (catches exports removed or renamed in a refactor).
        files: ["main.js", "scripts/**/*.js", "tests/**/*.js"],
        plugins: { "import-x": importX },
        rules: {
            "import-x/named": "error",
            "import-x/no-unresolved": "error",
            "import-x/export": "error"
        }
    },
    {
        rules: {
            "no-unused-vars": ["error", { args: "none", caughtErrors: "none", ignoreRestSiblings: true }]
        }
    }
];
