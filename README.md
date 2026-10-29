# mcp-macro-snapshot

macro-snapshot MCP — the state of the economy in one call.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1856+ live data sources. This is an independent, unofficial integration — not affiliated with, endorsed by, or published by the upstream provider.

## Tools

| Tool | Description |
|------|-------------|
| `macro_snapshot` | Get the current state of the US/global economy in ONE call — Fed funds rate, the full Treasury yield curve (3mo/2y/10y + 10y-2y and 10y-3m spreads with inversion flag), CPI & core CPI year-over-year, unemployment, nonfarm payrolls (+1mo change), real GDP growth, S&P 500, VIX, the broad USD index, and BTC. Composes 16 FRED series (Federal Reserve economic data) with live crypto, runs them in parallel, and returns a structured dashboard plus human-readable callouts (curve inversion, inflation vs the Fed's 2% target, elevated VIX). Use this instead of fetching ten indicators separately. No arguments. THE COMPONENTS DO NOT SHARE A DATE — daily series (rates, markets) sit beside quarterly GDP that can be 100+ days older; each group carries its own `as_of` map and `freshness` states the full span and oldest component — read those before comparing fields against the top-level `as_of`, which is only the newest daily series. |
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

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/macro-snapshot/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1856+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/macro_snapshot \
  -H 'Content-Type: application/json' \
  -d '{}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/macro_snapshot`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

## Run it from npm

`@pipeworx/mcp-macro-snapshot` is a local stdio bridge to the Pipeworx gateway: your MCP client
starts it with `npx`, and it forwards every call to the same
`https://gateway.pipeworx.io/macro-snapshot/mcp` endpoint shown above. It needs network access;
there is no offline mode.

```json
{
  "mcpServers": {
    "macro-snapshot": {
      "command": "npx",
      "args": ["-y", "@pipeworx/mcp-macro-snapshot"]
    }
  }
}
```

Without a key it calls anonymously, capped at 50 calls a day. A free account
raises that to 200 a day: get a key at https://pipeworx.io/signup and add
`"env": { "PIPEWORX_API_KEY": "<your key>" }` to the server entry.
The key is sent as a Bearer token, the same way a hosted connection sends it,
so calls are metered and billed exactly as they are there.

It lists **only** this pack's tools by default. Set `PIPEWORX_META_TOOLS=1` to
also list `ask_pipeworx` and the other gateway-wide tools.

Behind an HTTPS proxy: Node's built-in `fetch` does not read `HTTPS_PROXY` by
default. Newer Node releases honour it when `NODE_USE_ENV_PROXY=1` is set; check
your Node version's documentation.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Macro Snapshot data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
