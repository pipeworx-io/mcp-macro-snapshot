interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * macro-snapshot MCP — the state of the economy in one call.
 *
 * A META pack composing FRED (Federal Reserve economic data) + crypto. Agents
 * constantly ask "what's the economy doing right now" — this answers it in a
 * single tool call instead of ten: rates, the yield curve, inflation, jobs,
 * growth, equity/vol/USD markets, and BTC, plus human-readable callouts.
 *
 * FRED requires a key, injected by the gateway as args._apiKey via
 * platformKeyEnv: 'PLATFORM_FRED_KEY'. Crypto (coinpaprika) is keyless.
 */


const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const PAPRIKA_BTC = 'https://api.coinpaprika.com/v1/tickers/btc-bitcoin';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

type Obs = { date: string; value: string };

// ── Helpers ────────────────────────────────────────────────────────────────

/** Parse a FRED value string. Returns null for "." (missing) and empties. */
function num(v: unknown): number | null {
  if (typeof v !== 'string') return typeof v === 'number' ? v : null;
  const t = v.trim();
  if (t === '' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Most recent real observation (skips ".") from a desc-sorted array. */
function latestValue(obs: Obs[]): { date: string; value: number } | null {
  for (const o of obs) {
    const n = num(o.value);
    if (n !== null) return { date: o.date, value: n };
  }
  return null;
}

/**
 * Year-over-year % from a desc-sorted monthly series. Needs ≥13 monthly obs:
 * the latest real value vs the value ~12 months prior. Returns null if either
 * endpoint is missing.
 */
function yoy(obs: Obs[]): { date: string; pct: number } | null {
  const latest = latestValue(obs);
  if (!latest) return null;
  const idx = obs.findIndex((o) => o.date === latest.date);
  if (idx < 0) return null;
  const prior = obs.slice(idx + 12); // 12 months back from the latest real obs
  const priorVal = latestValue(prior);
  if (!priorVal || priorVal.value === 0) return null;
  return { date: latest.date, pct: ((latest.value - priorVal.value) / priorVal.value) * 100 };
}

function r2(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Fetch a FRED series' observations, most-recent-first. */
async function fredGet(seriesId: string, apiKey: string, limit: number): Promise<Obs[]> {
  const url =
    `${FRED_BASE}?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(apiKey)}` +
    `&file_type=json&sort_order=desc&limit=${limit}`;
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status} ${(await res.text()).slice(0, 160)}`);
  const data = (await res.json()) as { observations?: Obs[] };
  return Array.isArray(data.observations) ? data.observations : [];
}

async function btcGet(): Promise<{ price: number | null; change24h: number | null }> {
  const res = await fetch(PAPRIKA_BTC, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`coinpaprika: ${res.status}`);
  const data = (await res.json()) as { quotes?: { USD?: { price?: number; percent_change_24h?: number } } };
  const usd = data.quotes?.USD ?? {};
  return {
    price: typeof usd.price === 'number' ? usd.price : null,
    change24h: typeof usd.percent_change_24h === 'number' ? usd.percent_change_24h : null,
  };
}

// ── Tools ──────────────────────────────────────────────────────────────────

const tools: McpToolExport['tools'] = [
  {
    name: 'macro_snapshot',
    description:
      "Get the current state of the US/global economy in ONE call — Fed funds rate, the full Treasury yield curve (3mo/2y/10y + 10y-2y and 10y-3m spreads with inversion flag), CPI & core CPI year-over-year, unemployment, nonfarm payrolls (+1mo change), real GDP growth, S&P 500, VIX, the broad USD index, and BTC. Composes 16 FRED series (Federal Reserve economic data) with live crypto, runs them in parallel, and returns a structured dashboard plus human-readable callouts (curve inversion, inflation vs the Fed's 2% target, elevated VIX). Use this instead of fetching ten indicators separately. No arguments.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'indicator',
    description:
      'Read recent history for a single FRED (Federal Reserve economic data) series — drill into anything in the macro_snapshot or any other FRED series id. Common ids: UNRATE (unemployment), DFF (Fed funds), DGS10/DGS2/DGS3MO (Treasury yields), CPIAUCSL (CPI index), CPILFESL (core CPI index), PAYEMS (nonfarm payrolls), VIXCLS (VIX), SP500, MORTGAGE30US (30y mortgage rate), WALCL (Fed balance sheet), DTWEXBGS (broad USD index), T10Y2Y/T10Y3M (curve spreads). Returns observations most-recent-first plus the latest value.',
    inputSchema: {
      type: 'object',
      properties: {
        series_id: {
          type: 'string',
          description: 'Any FRED series id, e.g. "UNRATE", "DGS10", "MORTGAGE30US", "WALCL".',
        },
        limit: {
          type: 'number',
          description: 'How many recent observations to return (default 12, max 60).',
        },
      },
      required: ['series_id'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'macro_snapshot':
        return macroSnapshot(args);
      case 'indicator':
        return indicator(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function macroSnapshot(args: Record<string, unknown>): Promise<unknown> {
  const apiKey = typeof args._apiKey === 'string' ? args._apiKey.trim() : '';
  if (!apiKey) return { error: 'FRED key not configured for this pack' };

  // Series we fetch and how many obs each needs.
  // YoY series need 13 monthly obs; payrolls needs 2 for the 1-month change;
  // single-latest series only need a few (to skip "." gaps).
  const settled = await Promise.allSettled([
    fredGet('DFF', apiKey, 5), // 0  fed funds
    fredGet('DGS10', apiKey, 5), // 1  10y
    fredGet('DGS2', apiKey, 5), // 2  2y
    fredGet('DGS3MO', apiKey, 5), // 3  3mo
    fredGet('T10Y2Y', apiKey, 5), // 4  10y-2y spread
    fredGet('T10Y3M', apiKey, 5), // 5  10y-3m spread
    fredGet('CPIAUCSL', apiKey, 13), // 6  CPI
    fredGet('CPILFESL', apiKey, 13), // 7  core CPI
    fredGet('UNRATE', apiKey, 3), // 8  unemployment
    fredGet('PAYEMS', apiKey, 3), // 9  payrolls
    fredGet('A191RL1Q225SBEA', apiKey, 3), // 10 real GDP growth
    fredGet('SP500', apiKey, 5), // 11 S&P 500
    fredGet('VIXCLS', apiKey, 5), // 12 VIX
    fredGet('DTWEXBGS', apiKey, 5), // 13 broad USD
    btcGet(), // 14 BTC
  ]);

  const fredObs = (i: number): Obs[] =>
    settled[i].status === 'fulfilled' ? ((settled[i] as PromiseFulfilledResult<Obs[]>).value as Obs[]) : [];

  const fedFunds = latestValue(fredObs(0));
  const t10 = latestValue(fredObs(1));
  const t2 = latestValue(fredObs(2));
  const t3m = latestValue(fredObs(3));
  const curve102 = latestValue(fredObs(4));
  const curve103m = latestValue(fredObs(5));
  const cpi = yoy(fredObs(6));
  const coreCpi = yoy(fredObs(7));
  const unrate = latestValue(fredObs(8));

  const payObs = fredObs(9);
  const payLatest = latestValue(payObs);
  let payChange: number | null = null;
  if (payLatest) {
    const idx = payObs.findIndex((o) => o.date === payLatest.date);
    const prior = latestValue(payObs.slice(idx + 1));
    if (prior) payChange = payLatest.value - prior.value;
  }

  const gdp = latestValue(fredObs(10));
  const sp500 = latestValue(fredObs(11));
  const vix = latestValue(fredObs(12));
  const usd = latestValue(fredObs(13));
  const btc =
    settled[14].status === 'fulfilled'
      ? (settled[14] as PromiseFulfilledResult<{ price: number | null; change24h: number | null }>).value
      : { price: null, change24h: null };

  // as_of = most recent date across the daily-cadence series (no Date.now()).
  const dailyDates = [fedFunds, t10, t2, t3m, curve102, curve103m, sp500, vix, usd]
    .map((x) => x?.date)
    .filter((d): d is string => typeof d === 'string');
  const asOf = dailyDates.length ? dailyDates.sort().slice(-1)[0] : null;

  const curveInverted =
    (curve102 !== null && curve102.value < 0) || (curve103m !== null && curve103m.value < 0);

  // Notes via simple threshold logic.
  const notes: string[] = [];
  if (curve103m && curve103m.value < 0) {
    notes.push(
      `Yield curve inverted (10y−3m = ${r2(curve103m.value)}pp) — historically a recession signal.`,
    );
  } else if (curve102 && curve102.value < 0) {
    notes.push(
      `Yield curve inverted (10y−2y = ${r2(curve102.value)}pp) — historically a recession signal.`,
    );
  } else if (curve102 && curve103m && curve102.value >= 0 && curve103m.value >= 0) {
    notes.push('Yield curve positively sloped (not inverted).');
  }
  if (coreCpi) {
    if (coreCpi.pct > 2) {
      notes.push(`Core CPI ${r2(coreCpi.pct)}% YoY still above the Fed's 2% target.`);
    } else {
      notes.push(`Core CPI ${r2(coreCpi.pct)}% YoY at or below the Fed's 2% target.`);
    }
  }
  if (unrate) {
    if (unrate.value >= 5) {
      notes.push(`Unemployment elevated at ${r2(unrate.value)}%.`);
    } else if (unrate.value < 4) {
      notes.push(`Unemployment low at ${r2(unrate.value)}% — a tight labor market.`);
    }
  }
  if (vix) {
    if (vix.value > 30) {
      notes.push(`VIX ${r2(vix.value)} — high market stress.`);
    } else if (vix.value > 20) {
      notes.push(`VIX ${r2(vix.value)} elevated — above the calm-market ~20 threshold.`);
    }
  }

  return {
    as_of: asOf,
    rates: {
      fed_funds_pct: r2(fedFunds?.value ?? null),
      treasury_10y_pct: r2(t10?.value ?? null),
      treasury_2y_pct: r2(t2?.value ?? null),
      treasury_3m_pct: r2(t3m?.value ?? null),
      yield_curve_10y_2y_pp: r2(curve102?.value ?? null),
      yield_curve_10y_3m_pp: r2(curve103m?.value ?? null),
      curve_inverted: curveInverted,
      as_of: {
        fed_funds: fedFunds?.date ?? null,
        treasury_10y: t10?.date ?? null,
        treasury_2y: t2?.date ?? null,
        treasury_3m: t3m?.date ?? null,
        curve_10y_2y: curve102?.date ?? null,
        curve_10y_3m: curve103m?.date ?? null,
      },
    },
    inflation: {
      cpi_yoy_pct: r2(cpi?.pct ?? null),
      core_cpi_yoy_pct: r2(coreCpi?.pct ?? null),
      as_of: { cpi: cpi?.date ?? null, core_cpi: coreCpi?.date ?? null },
    },
    jobs: {
      unemployment_pct: r2(unrate?.value ?? null),
      nonfarm_payrolls_k: payLatest ? Math.round(payLatest.value) : null,
      payrolls_1m_change_k: payChange !== null ? Math.round(payChange) : null,
      as_of: { unemployment: unrate?.date ?? null, payrolls: payLatest?.date ?? null },
    },
    growth: {
      real_gdp_growth_pct: r2(gdp?.value ?? null),
      as_of: { real_gdp_growth: gdp?.date ?? null },
    },
    markets: {
      sp500: sp500 ? Math.round(sp500.value * 100) / 100 : null,
      vix: r2(vix?.value ?? null),
      usd_broad_index: usd ? Math.round(usd.value * 100) / 100 : null,
      as_of: { sp500: sp500?.date ?? null, vix: vix?.date ?? null, usd_broad_index: usd?.date ?? null },
    },
    crypto: {
      btc_usd: btc.price !== null ? Math.round(btc.price * 100) / 100 : null,
      btc_24h_change_pct: btc.change24h !== null ? Math.round(btc.change24h * 100) / 100 : null,
    },
    notes,
  };
}

async function indicator(args: Record<string, unknown>): Promise<unknown> {
  const apiKey = typeof args._apiKey === 'string' ? args._apiKey.trim() : '';
  if (!apiKey) return { error: 'FRED key not configured for this pack' };

  const seriesId = typeof args.series_id === 'string' ? args.series_id.trim() : '';
  if (!seriesId) return { error: 'provide a series_id', series_id: args.series_id ?? null };

  let limit = typeof args.limit === 'number' ? Math.floor(args.limit) : 12;
  if (!Number.isFinite(limit) || limit < 1) limit = 12;
  if (limit > 60) limit = 60;

  const obs = await fredGet(seriesId, apiKey, limit);
  const cleaned = obs
    .map((o) => ({ date: o.date, value: num(o.value) }))
    .filter((o): o is { date: string; value: number } => o.value !== null);

  return {
    series_id: seriesId,
    count: cleaned.length,
    observations: cleaned, // most recent first (FRED sort_order=desc)
    latest: cleaned.length ? cleaned[0] : null,
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
