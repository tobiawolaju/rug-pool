<script lang="ts">
  import { navigate } from '$lib/router.svelte';
  import PriceChart from '$components/coin/PriceChart.svelte';
  import CycleTracker from '$components/coin/CycleTracker.svelte';
  import BuyPanel from '$components/coin/BuyPanel.svelte';
  import HolderList from '$components/coin/HolderList.svelte';
  import CountdownTimer from '$components/shared/CountdownTimer.svelte';
  import Badge from '$components/shared/Badge.svelte';
  import rawCoins from '$lib/mockCoins.json';

  let { id }: { id: string } = $props();

  const raw = rawCoins.find((c: any) => c.id === id);

  const coin = raw
    ? {
        ...raw,
        marketCap: raw.price * raw.maxSupply,
        cycleEnd: Date.now() + raw.cycleEndOffset,
        cycleEndOffset: undefined,
        totalRounds: 5,
        flipsPending: Math.floor(raw.holders * 0.25),
        balance: +(raw.price * (raw.holders * 0.1)).toFixed(3),
      }
    : null;

  const prices = Array.from({ length: 50 }, (_, i) => ({
    time: Date.now() - (50 - i) * 1800000,
    price: coin ? coin.price * (0.85 + Math.random() * 0.3) : 0.000035 + Math.random() * 0.00002,
  }));

  const holders = [
    { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f3bDc9', amount: 12500, value: 52500 },
    { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', amount: 8400, value: 35280 },
    { address: '0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec', amount: 6200, value: 26040 },
    { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', amount: 4100, value: 17220 },
    { address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', amount: 2800, value: 11760 },
    { address: '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', amount: 1900, value: 7980 },
  ];

  let priceStr = $derived(coin ? '$' + coin.price.toFixed(6) : '—');
  let changeClass = $derived(coin ? (coin.priceChange24h >= 0 ? 'positive' : 'negative') : '');
  let changeStr = $derived(coin ? (coin.priceChange24h >= 0 ? '+' : '') + coin.priceChange24h.toFixed(2) + '%' : '');
  let poolStr = $derived(coin ? '$' + coin.poolSize.toLocaleString() : '—');
  let mcapStr = $derived(coin ? '$' + coin.marketCap.toLocaleString() : '—');
  let supplyStr = $derived(coin && coin.maxSupply ? coin.maxSupply.toLocaleString() : '—');
</script>

{#if coin}
<div class="detail-page">
  <div class="coin-hero">
    <div class="hero-left">
      <div class="coin-id">
        {#if coin.image}
          <img src={coin.image} alt={coin.name} class="coin-icon" />
        {:else}
          <div class="icon-placeholder">{coin.symbol[0]}</div>
        {/if}
        <div>
          <div class="coin-title">
            {coin.name}
            {#if coin.isFoundingProject}
              <Badge variant="project" />
            {:else if coin.isFoundingMember}
              <Badge />
            {/if}
          </div>
          <span class="coin-symbol">{coin.symbol}</span>
        </div>
      </div>
    </div>
    <div class="hero-right">
      <div class="big-price">{priceStr}</div>
      <div class="change {changeClass}">{changeStr}</div>
    </div>
  </div>

  <div class="main-grid">
    <div class="left-col">
      {#if coin.description}
        <div class="desc-card">
          <p class="desc-text">{coin.description}</p>
          <div class="social-links">
            {#if coin.twitter}
              <a href={coin.twitter} target="_blank" rel="noopener noreferrer" class="social-link">X</a>
            {/if}
            {#if coin.telegram}
              <a href={coin.telegram} target="_blank" rel="noopener noreferrer" class="social-link">Telegram</a>
            {/if}
            {#if coin.website}
              <a href={coin.website} target="_blank" rel="noopener noreferrer" class="social-link">Website</a>
            {/if}
          </div>
        </div>
      {/if}
      <div class="chart-section">
        <PriceChart data={prices} pair="{coin.symbol}/MON" />
      </div>
      <div class="tracker-section">
        <CycleTracker
          round={coin.round}
          cycleEnd={coin.cycleEnd}
          totalRounds={coin.totalRounds}
          flipsPending={coin.flipsPending}
        />
      </div>
      <div class="tweet-actions">
        <a href="https://x.com/search?q=%24{coin.symbol}" target="_blank" rel="noopener noreferrer" class="tweet-btn secondary">Pump ${coin.symbol} on 𝕏</a>
        <a href="https://x.com/intent/tweet?text=just+bought+%24{coin.symbol}+on+%40rugpool%2C+locked+for+24hrs%2C+pray+for+me+%F0%9F%92%80+rug-pool.vercel.app" target="_blank" rel="noopener noreferrer" class="tweet-btn primary">Shill ${coin.symbol} 𝕏</a>
      </div>
    </div>
    <div class="right-col">
      <BuyPanel coinId={coin.symbol} balance={coin.balance} />
      <div class="stats-card">
        <div class="stat-row">
          <span class="label">Market Cap</span>
          <span class="mono">{mcapStr}</span>
        </div>
        <div class="stat-row">
          <span class="label">Pool Size</span>
          <span class="mono">{poolStr}</span>
        </div>
        <div class="stat-row">
          <span class="label">Max Supply</span>
          <span class="mono">{supplyStr}</span>
        </div>
        <div class="stat-row">
          <span class="label">Next Flip</span>
          <CountdownTimer target={coin.cycleEnd} pulse={true} />
        </div>
      </div>
      <HolderList holders={holders} />
    </div>
  </div>
</div>
{:else}
<div class="detail-page">
  <div class="not-found">
    <h2>Coin not found</h2>
    <p>No coin with id "{id}" exists.</p>
    <button class="back-btn" onclick={() => navigate('/')}>Back to feed</button>
  </div>
</div>
{/if}

<style>
  .detail-page {
    padding-bottom: 3rem;
    max-width: 100%;
    overflow-x: hidden;
  }

  .back-row {
    margin-bottom: 1.5rem;
  }

  .back-btn {
    background: transparent;
    color: var(--text-secondary);
    padding: 0.25rem;
    border-radius: 6px;
    display: flex;
    align-items: center;
    transition: color 0.15s, background 0.15s;
  }
  .back-btn:hover {
    color: var(--text-primary);
    background: var(--gray-700);
  }

  .coin-hero {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .hero-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .coin-id {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .icon-placeholder {
    width: 48px;
    height: 48px;
    border-radius: 4px;
    flex-shrink: 0;
    background: var(--purple-800);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 1.25rem;
    color: var(--accent);
  }

  .coin-icon {
    width: 48px;
    height: 48px;
    border-radius: 4px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .coin-title {
    font-size: 1.5rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .coin-symbol {
    color: var(--text-secondary);
    font-size: 0.9375rem;
  }

  .hero-right {
    text-align: right;
  }

  .big-price {
    font-size: 1.75rem;
    font-weight: 800;
    font-family: 'JetBrains Mono', monospace;
  }

  .change {
    font-size: 1rem;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
    margin-top: 0.25rem;
  }

  .positive { color: var(--success); }
  .negative { color: var(--danger); }

  .desc-card {
    background: var(--bg-card);
    border: 1px solid var(--gray-700);
    border-radius: 10px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .desc-text {
    color: var(--text-secondary);
    font-size: 0.9375rem;
    line-height: 1.6;
  }

  .social-links {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .social-link {
    font-size: 0.8125rem;
    color: var(--accent);
    text-decoration: none;
    padding: 0.25rem 0.625rem;
    border: 1px solid var(--purple-700);
    border-radius: 6px;
    transition: background 0.15s;
  }
  .social-link:hover {
    background: var(--purple-800);
  }

  .main-grid {
    display: grid;
    grid-template-columns: 1fr 360px;
    gap: 1.25rem;
    align-items: start;
  }

  .left-col {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .chart-section {
    background: var(--bg-card);
    border: 1px solid var(--gray-700);
    border-radius: 10px;
    padding: 1rem;
  }

  .tracker-section {
  }

  .tweet-actions {
    display: flex;
    gap: 0.75rem;
  }

  .tweet-btn {
    flex: 1;
    padding: 0.75rem 1rem;
    border-radius: 10px;
    font-size: 0.875rem;
    font-weight: 600;
    text-align: center;
    text-decoration: none;
    transition: background 0.15s, color 0.15s;
  }

  .tweet-btn.primary {
    background: var(--accent);
    color: white;
  }
  .tweet-btn.primary:hover {
    background: var(--accent-hover);
  }

  .tweet-btn.secondary {
    background: transparent;
    color: var(--text-primary);
    border: 1px solid var(--gray-600);
  }
  .tweet-btn.secondary:hover {
    border-color: var(--gray-500);
  }

  .right-col {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .stats-card {
    background: var(--bg-card);
    border: 1px solid var(--gray-700);
    border-radius: 10px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.875rem;
  }
  .stat-row .label {
    color: var(--text-secondary);
  }
  .stat-row .mono {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
  }

  @media (max-width: 768px) {
    .main-grid {
      grid-template-columns: 1fr;
    }

    .left-col,
    .right-col {
      min-width: 0;
    }

    .coin-hero {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .hero-right {
      text-align: left;
      width: 100%;
    }

    .big-price {
      font-size: 1.375rem;
    }

    .coin-title {
      font-size: 1.25rem;
    }

    .stat-row {
      font-size: 0.8125rem;
    }

    .stat-row .mono {
      max-width: 50%;
      text-align: right;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
</style>
