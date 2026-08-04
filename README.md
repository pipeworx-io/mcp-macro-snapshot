# mcp-macro-snapshot

macro-snapshot MCP — the state of the economy in one call.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `macro_snapshot` | Get the current state of the US/global economy in ONE call — Fed funds rate, the full Treasury yield curve (3mo/2y/10y + 10y-2y and 10y-3m spreads with inversion flag), CPI & core CPI year-over-year, unemployment, nonfarm payrolls (+1mo change), real GDP growth, S&P 500, VIX, the broad USD index, and BTC. Composes 16 FRED series (Federal Reserve economic data) with live crypto, runs them in parallel, and returns a structured dashboard plus human-readable callouts (curve inversion, inflation vs the Fed's 2% target, elevated VIX). Use this instead of fetching ten indicators separately. No arguments. |
| `indicator` | Read recent history for a single FRED (Federal Reserve economic data) series — drill into anything in the macro_snapshot or any other FRED series id. Common ids: UNRATE (unemployment), DFF (Fed funds), DGS10/DGS2/DGS3MO (Treasury yields), CPIAUCSL (CPI index), CPILFESL (core CPI index), PAYEMS (nonfarm payrolls), VIXCLS (VIX), SP500, MORTGAGE30US (30y mortgage rate), WALCL (Fed balance sheet), DTWEXBGS (broad USD index), T10Y2Y/T10Y3M (curve spreads). Returns observations most-recent-first plus the latest value. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "macro-snapshot": {
      "url": "https://gateway.pipeworx.io/macro-snapshot/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Macro Snapshot data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
