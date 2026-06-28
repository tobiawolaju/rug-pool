# Rug Pool 🟣
### A Provably Fair Memecoin Game on Monad

> *The rug is guaranteed. The question is whether it hits you.*

---

## What is Rug Pool?

Rug Pool is a memecoin launchpad on Monad where no one can sell early — not even the dev. Onchain randomness decides who exits at 24 hours per cycle. Losers fund the winners. The worst loser of the month wins a prize.

- **Heads** — your position auto-sells at current market value
- **Tails** — you stay locked for another cycle

Every coin has one global countdown timer. When it hits zero, every holder flips at the same time — no exceptions. Buy early or buy late, the flip hits everyone simultaneously. That shared moment is what makes Rug Pool different from every other launchpad.

You never know which side you're on until it happens. Nobody does. Not even the dev.

---

## The Problems Rug Pool Solves

### 1. Memecoin launches are rigged
In every standard memecoin launch, insiders buy early, dump on retail at the peak, and retail holders are left holding bags with no recourse. Everyone knows it. Nobody can stop it.

Rug Pool removes this entirely. The 24-hour lock applies to everyone equally — no whitelist exits, no dev sells, no early liquidity pulls. The playing field is flat from the moment a coin launches.

### 2. Losing in crypto has no upside
You hold. You get rugged. You leave with nothing but a loss and a lesson. There is no mechanism in any existing memecoin platform that rewards the downside.

Rug Pool flips this. At the end of each month, one single wallet across the entire protocol — the wallet with the largest verified loss across all coins and all cycles — wins 10% of all protocol fees accumulated that month. Losing big is a legitimate strategy. The worst outcome becomes a competition.

### 3. Bots and sybils destroy fair launches
Free-to-join platforms are immediately flooded with bots, sybil wallets, and fake volume. This distorts price discovery and kills the experience for real users.

Rug Pool requires a one-time $1 non-refundable founding member fee to access the platform. This is not a revenue mechanism — it is proof of human. No bot farm can economically justify mass registration at $1 per wallet. Real players only.

### 4. Monad's meme community has no native game
Monad has 10,000 TPS and 0.8s finality — performance that makes real-time game economies possible onchain. No existing memecoin platform is built specifically to take advantage of this or serve the Monad community natively.

Rug Pool is built from the ground up on Monad, for the Monad meme community.

---

## How It Works

```
1. Pay $1 once → become a founding member
2. Launch or buy into a coin → locked until the coin's next global flip
3. At T+24 → onchain VRF flips for every holder simultaneously
4. Heads → auto-sell at current market value (80% to holder, 20% to protocol)
5. Tails → full current position value sacrificed to pool, tokens remain as ghost position, locked another cycle
5b. Ghost positions recover naturally as new buyers enter the next cycle via bonding curve
6. Protocol treasury accumulates across all coins and all cycles
7. Monthly: 10% of treasury → dev, 10% → single protocol-wide top loser
8. Re-enter anytime → you join the current cycle and flip at the next global T+24
```

---

## Token Economics

| Flow | Allocation |
|------|-----------|
| Auto-sell exit value | 80% to holder, 20% to protocol treasury |
| Protocol treasury (monthly) | 10% dev wallet, 10% to single protocol-wide top loser (one winner per month) prize |
| Founding member fee | $1 per user, non-refundable, one-time |
| Verified project badge | $10 per coin launch, priority feed placement |

---

## Cycle Mechanic

A cycle is one 24-hour lock period. Every coin starts at Cycle 1. When the global flip happens, Tails holders immediately enter Cycle 2 — another 24 hours starts for everyone simultaneously. A coin can run infinite cycles. The cycle number on each coin shows how many flips it has survived.

There is no per-wallet timer. There is no individual countdown. One coin. One clock. One flip. Everyone goes together.

---

## Badge System

| Badge | Cost | Meaning |
|-------|------|---------|
| 🔵 Blue checkmark | $1 | Verified human. Paid the founding member fee. |
| 🟡 Yellow checkmark | $10 | Verified project. Reviewed and priority listed on feed. |

---

## Tech Stack

- **Blockchain** — Monad (EVM-compatible, 10,000 TPS, 0.8s finality)
- **Randomness** — Pyth Entropy VRF (provably fair, manipulation-proof)
- **Smart Contracts** — Solidity (Foundry)
- **Frontend** — Svelte 5 + Vite
- **Wallet Auth** — Privy embedded wallets
- **Backend** — Node.js + Express + viem
- **Real-time** — WebSocket for live coin feed and chat

---

## Core Features

- Live coin feed with global per-coin countdown timers
- Cycle tracker — current round, time left, holders locked
- Per-coin chat and community
- Portfolio dashboard — active positions, P&L, flip history
- Top loser leaderboard (monthly reset)
- Founding member badge (onchain, first 1000 wallets)
- Verified project badge ($10, priority placement)
- $1 one-time platform entry fee

---

## Why Monad

Monad's speed and finality make the simultaneous 24-hour flip mechanic viable onchain at scale. Hundreds of wallets flipping in the same block, resolved in under a second, with verifiable randomness — that's only possible on infrastructure built for performance. Everything else is too slow or too expensive.

---

## Contract Architecture

| Contract | Purpose |
|----------|---------|
| `MemberRegistry.sol` | $1 founding member fee + badge issuance |
| `CoinFactory.sol` | Coin launch, bonding curve, token creation |
| `RugPool.sol` | Game lifecycle, global timer, lock and flip logic |
| `VRFConsumer.sol` | Pyth Entropy integration, one seed per coin per cycle |
| `Treasury.sol` | Protocol pool accumulation, monthly dev + top loser payout |

---

## Roadmap

- [x] Concept and architecture
- [x] FAQ and documentation
- [x] Frontend scaffold — Svelte 5, 7 pages, 17 components
- [ ] `MemberRegistry.sol` — $1 fee + badge
- [ ] `CoinFactory.sol` — coin launch logic
- [ ] `RugPool.sol` — global timer + flip mechanic
- [ ] `VRFConsumer.sol` — Pyth Entropy integration
- [ ] `Treasury.sol` — pool split + monthly payout
- [ ] JS test scripts per contract
- [ ] Chain simulation script — full game cycle
- [ ] Backend indexer — viem event listener
- [ ] WebSocket server — live feed and chat
- [ ] API layer — expose contract functions
- [ ] Frontend — connect to API, remove mock data
- [ ] Testnet deploy — 1000 user target
- [ ] Mainnet launch

---

## Building in Public

This project is being built live as a 72-hour public challenge on X (Twitter).

Follow the build: [@tobiawolaju](https://x.com/tobiawolaju)

Built on: [@monad](https://x.com/monad) 🟣

Supported by: [@DeltaV_xyz](https://x.com/DeltaV_xyz)

---

## License

MIT
