require('dotenv').config();
const { createPublicClient, createWalletClient, http, parseEventLogs } = require('viem');
const { privateKeyToAccount, generatePrivateKey } = require('viem/accounts');
const { defineChain } = require('viem');
const fs = require('fs');
const path = require('path');

const MONAD_TESTNET = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_TESTNET_RPC] } },
});

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const ACCOUNT = privateKeyToAccount(DEPLOYER_KEY);
const DEPLOYER = process.env.DEPLOYER_ADDRESS;

const publicClient = createPublicClient({ chain: MONAD_TESTNET, transport: http() });
const walletClient = createWalletClient({ chain: MONAD_TESTNET, transport: http(), account: ACCOUNT });

const MEMBER_REGISTRY = '0x079c4457ced137841e90bd13cfa059a904380aa2';
const TREASURY = '0xeb1ad588ccadca76564e2e387f71e48ec13244bd';
const VRF_CONSUMER = '0x8b3b4b2747e6bae2da2bc706e1e53459974bf9cd';
const COIN_FACTORY = '0x11feec514473b7eb08a3f8ad08f6a0589cdbab6b';
const OLD_RUG_POOL = '0x4fae7fe950beed86deb347ec49b5928c3f4efd24';

const registryAbi = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'abis', 'MemberRegistry.json'), 'utf8'));
const factoryAbi = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'abis', 'CoinFactory.json'), 'utf8'));
const rugPoolAbi = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'abis', 'RugPool.json'), 'utf8'));
const treasuryAbi = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'abis', 'Treasury.json'), 'utf8'));
const vrfAbi = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'abis', 'VRFConsumer.json'), 'utf8'));

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadArtifact(name) {
  const p = path.join(__dirname, '..', 'out', `${name}.sol`, `${name}.json`);
  const a = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { abi: a.abi, bytecode: a.bytecode.object };
}

async function main() {
  console.log('=== Rug Pool Simulation ===\n');
  console.log(`Deployer: ${DEPLOYER}`);
  console.log(`Balance: ${await publicClient.getBalance({ address: DEPLOYER })}\n`);

  // --- Create Bob and Carol wallets ---
  console.log('--- Generating test wallets ---');
  const bobKey = generatePrivateKey();
  const carolKey = generatePrivateKey();
  const BOB = privateKeyToAccount(bobKey);
  const CAROL = privateKeyToAccount(carolKey);
  console.log(`Alice (deployer): ${DEPLOYER}`);
  console.log(`Bob:               ${BOB.address}`);
  console.log(`Carol:             ${CAROL.address}\n`);

  const bobClient = createWalletClient({ chain: MONAD_TESTNET, transport: http(), account: BOB });
  const carolClient = createWalletClient({ chain: MONAD_TESTNET, transport: http(), account: CAROL });

  // --- Fund Bob and Carol ---
  console.log('--- Funding Bob and Carol with 1 MON each ---');
  for (const addr of [BOB.address, CAROL.address]) {
    const bal = await publicClient.getBalance({ address: addr });
    if (bal < 1000000000000000n) {
      const h = await walletClient.sendTransaction({ to: addr, value: 1000000000000000000n });
      await publicClient.waitForTransactionReceipt({ hash: h });
      console.log(`  Funded ${addr}: tx ${h}`);
    } else {
      console.log(`  ${addr} already has ${bal} wei`);
    }
  }

  // --- Register Bob and Carol ---
  console.log('\n--- Registering wallets ---');
  const fee = await publicClient.readContract({ address: MEMBER_REGISTRY, abi: registryAbi, functionName: 'registrationFee' });
  console.log(`  Registration fee: ${Number(fee) / 1e18} MON`);
  for (const [name, client, addr] of [['Alice', walletClient, DEPLOYER], ['Bob', bobClient, BOB.address], ['Carol', carolClient, CAROL.address]]) {
    const reg = await publicClient.readContract({ address: MEMBER_REGISTRY, abi: registryAbi, functionName: 'isRegistered', args: [addr] });
    if (reg) { console.log(`  ${name} already registered, skipping`); continue; }
    const h = await client.writeContract({ address: MEMBER_REGISTRY, abi: registryAbi, functionName: 'register', args: [], value: fee });
    await publicClient.waitForTransactionReceipt({ hash: h });
    console.log(`  ${name} registered: tx ${h}`);
  }
  console.log('  All 3 wallets registered ✅');

  // --- Deploy new RugPool ---
  console.log('\n--- Deploying new RugPool (with setCycleDuration + payable triggerFlip) ---');
  const artifact = loadArtifact('RugPool');
  const hash = await walletClient.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args: [] });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const RUG_POOL = receipt.contractAddress;
  console.log(`  New RugPool deployed at: ${RUG_POOL}\n`);

  // --- Wire new RugPool ---
  console.log('--- Wiring new RugPool ---');
  const rugAbi = artifact.abi;
  const wiring = [
    ['setMemberRegistry', [MEMBER_REGISTRY]],
    ['setVRFConsumer', [VRF_CONSUMER]],
    ['setTreasury', [TREASURY]],
    ['setCoinFactory', [COIN_FACTORY]],
  ];
  for (const [fn, args] of wiring) {
    const h = await walletClient.writeContract({ address: RUG_POOL, abi: rugAbi, functionName: fn, args });
    await publicClient.waitForTransactionReceipt({ hash: h });
    console.log(`  rugPool.${fn}: tx ${h}`);
  }

  // Update existing contracts to point to new RugPool
  const rewires = [
    [COIN_FACTORY, factoryAbi, 'setRugPool', [RUG_POOL]],
    [TREASURY, treasuryAbi, 'setRugPool', [RUG_POOL]],
    [VRF_CONSUMER, vrfAbi, 'setRugPool', [RUG_POOL]],
  ];
  for (const [addr, abi, fn, args] of rewires) {
    const h = await walletClient.writeContract({ address: addr, abi, functionName: fn, args });
    await publicClient.waitForTransactionReceipt({ hash: h });
    console.log(`  ${addr.slice(0, 10)}...${addr.slice(-6)}.${fn}: tx ${h}`);
  }
  console.log('  Wiring complete ✅\n');

  // --- Launch SIM coin ---
  console.log('--- Launching SIM coin (Alice) ---');
  const launchHash = await walletClient.writeContract({
    address: COIN_FACTORY, abi: factoryAbi, functionName: 'launchCoin',
    args: ['Sim Coin', 'SIM', 'Simulation coin', 'https://sim.test/image.png', 1000000000000n, 1000000000000000000000000000n, 33, false],
    value: 0n,
  });
  const launchReceipt = await publicClient.waitForTransactionReceipt({ hash: launchHash });
  const logs = parseEventLogs({ abi: factoryAbi, logs: launchReceipt.logs });
  const simCoin = logs.find(l => l.eventName === 'CoinLaunched').args.tokenAddress;
  console.log(`  SIM coin at: ${simCoin}\n`);

  // --- Set cycle duration to 5 minutes ---
  console.log('--- Setting cycle duration to 300 seconds ---');
  const setDurHash = await walletClient.writeContract({
    address: RUG_POOL, abi: rugAbi, functionName:   'setCycleDuration', args: [simCoin, 60],
  });
  await publicClient.waitForTransactionReceipt({ hash: setDurHash });
  const cs = await publicClient.readContract({ address: RUG_POOL, abi: rugAbi, functionName: 'getCoinState', args: [simCoin] });
  console.log(`  cycleDuration now: ${cs.cycleDuration}s ✅\n`);

  // --- All 3 buy at staggered times ---
  console.log('--- Buying tokens ---');
  async function buy(client, name, amountMon) {
    const h = await client.writeContract({ address: RUG_POOL, abi: rugAbi, functionName: 'buy', args: [simCoin, 0n], value: amountMon });
    const r = await publicClient.waitForTransactionReceipt({ hash: h });
    const hi = await publicClient.readContract({ address: RUG_POOL, abi: rugAbi, functionName: 'getHolderInfo', args: [simCoin, client.account.address] });
    console.log(`  ${name} bought ${Number(hi.tokenBalance) / 1e18} SIM for ${Number(amountMon) / 1e18} MON (tx ${h})`);
  }

  await buy(walletClient, 'Alice', 500000000000000000n);
  console.log('  Waiting 5 seconds...');
  await sleep(5000);
  await buy(bobClient, 'Bob', 300000000000000000n);
  console.log('  Waiting 5 seconds...');
  await sleep(5000);
  await buy(carolClient, 'Carol', 200000000000000000n);
  console.log('  All buys confirmed ✅\n');

  // --- Wait for cycle to end ---
  console.log('--- Waiting for cycle to end (300s total) ---');
  const coinState = await publicClient.readContract({ address: RUG_POOL, abi: rugAbi, functionName: 'getCoinState', args: [simCoin] });
  const startTime = Number(coinState.cycleStartTime);
  const duration = Number(coinState.cycleDuration);
  const endTime = startTime + duration;
  console.log(`  Cycle started at block timestamp ${startTime}, ends at ${endTime} (${duration}s duration, ~${duration}s real-time wait)`);

  while (true) {
    const ready = await publicClient.readContract({ address: RUG_POOL, abi: rugAbi, functionName: 'isFlipReady', args: [simCoin] });
    if (ready) { console.log('  isFlipReady = true! Cycle ended ✅\n'); break; }
    console.log('  Still waiting... checking again in 30s');
    await sleep(30000);
  }

  // --- Trigger flip ---
  console.log('--- Triggering flip ---');
  const vrfFee = await publicClient.readContract({ address: VRF_CONSUMER, abi: vrfAbi, functionName: 'getRequestFee' });
  console.log(`  VRF fee: ${Number(vrfFee) / 1e18} MON`);
  const flipHash = await walletClient.writeContract({
    address: RUG_POOL, abi: rugAbi, functionName: 'triggerFlip', args: [simCoin], value: vrfFee,
  });
  const flipReceipt = await publicClient.waitForTransactionReceipt({ hash: flipHash });
  console.log(`  triggerFlip tx: ${flipHash} (block ${flipReceipt.blockNumber}) ✅\n`);

  // --- Wait for VRF fulfillment ---
  console.log('--- Waiting for VRF fulfillment ---');
  let vrfFulfilled = false;
  let attempts = 0;
  const maxAttempts = 30; // 5 min max
  while (attempts < maxAttempts) {
    const seed = await publicClient.readContract({ address: VRF_CONSUMER, abi: vrfAbi, functionName: 'getCycleSeed', args: [simCoin, 1] });
    const zero = '0x0000000000000000000000000000000000000000000000000000000000000000';
    if (seed !== zero) {
      console.log(`  Seed received: ${seed} ✅\n`);
      vrfFulfilled = true;
      break;
    }
    attempts++;
    console.log(`  Waiting for VRF... (${attempts * 10}s)`);
    await sleep(10000);
  }
  if (!vrfFulfilled) {
    console.log('  VRF fulfillment timed out (Pyth oracle may be slow). Skipping outcome verification.\n');
  }

  // --- Log final state ---
  console.log('--- Final State ---');
  const finalCoin = await publicClient.readContract({ address: RUG_POOL, abi: rugAbi, functionName: 'getCoinState', args: [simCoin] });
  console.log(`  Coin: active=${finalCoin.active}, cycle=${finalCoin.currentCycle}, holders=${finalCoin.totalHolders}, poolValue=${Number(finalCoin.poolValue) / 1e18} MON`);

  for (const [name, addr] of [['Alice', DEPLOYER], ['Bob', BOB.address], ['Carol', CAROL.address]]) {
    const hi = await publicClient.readContract({ address: RUG_POOL, abi: rugAbi, functionName: 'getHolderInfo', args: [simCoin, addr] });
    console.log(`  ${name}: balance=${Number(hi.tokenBalance) / 1e18} SIM, cycleJoined=${hi.cycleJoined}, active=${hi.isActive}`);
  }

  const pendingFees = await publicClient.readContract({ address: TREASURY, abi: treasuryAbi, functionName: 'getPendingFees' });
  const topLoser = await publicClient.readContract({ address: TREASURY, abi: treasuryAbi, functionName: 'getCurrentTopLoser' });
  console.log(`  Treasury pending fees: ${Number(pendingFees) / 1e18} MON`);
  console.log(`  Top loser: ${topLoser[0]} with ${Number(topLoser[1]) / 1e18} MON lost\n`);

  // --- Verify outcomes (only if VRF fulfilled) ---
  if (vrfFulfilled) {
    console.log('--- Outcomes ---');
    const aliceHi = await publicClient.readContract({ address: RUG_POOL, abi: rugAbi, functionName: 'getHolderInfo', args: [simCoin, DEPLOYER] });
    const bobHi = await publicClient.readContract({ address: RUG_POOL, abi: rugAbi, functionName: 'getHolderInfo', args: [simCoin, BOB.address] });
    const carolHi = await publicClient.readContract({ address: RUG_POOL, abi: rugAbi, functionName: 'getHolderInfo', args: [simCoin, CAROL.address] });

    for (const [name, hi] of [['Alice', aliceHi], ['Bob', bobHi], ['Carol', carolHi]]) {
      const outcome = hi.isActive ? 'Heads (exited via queue)' : 'Tails (sacrificed)';
      console.log(`  ${name}: ${outcome}`);
    }

    console.log(`\n=== Simulation Complete ===`);
    console.log(`Coin: SIM at ${simCoin}`);
    console.log(`Cycle: ${finalCoin.currentCycle - 1n} → ${finalCoin.currentCycle}`);
    console.log(`Alice: ${aliceHi.isActive ? 'Heads' : 'Tails'} — ${aliceHi.isActive ? 'exited' : 'sacrificed'}`);
    console.log(`Bob:   ${bobHi.isActive ? 'Heads' : 'Tails'} — ${bobHi.isActive ? 'exited' : 'sacrificed'}`);
    console.log(`Carol: ${carolHi.isActive ? 'Heads' : 'Tails'} — ${carolHi.isActive ? 'exited' : 'sacrificed'}`);
  } else {
    console.log('--- Outcomes (VRF pending, showing pre-flip state) ---');
    const aliceHi = await publicClient.readContract({ address: RUG_POOL, abi: rugAbi, functionName: 'getHolderInfo', args: [simCoin, DEPLOYER] });
    const bobHi = await publicClient.readContract({ address: RUG_POOL, abi: rugAbi, functionName: 'getHolderInfo', args: [simCoin, BOB.address] });
    const carolHi = await publicClient.readContract({ address: RUG_POOL, abi: rugAbi, functionName: 'getHolderInfo', args: [simCoin, CAROL.address] });
    console.log(`  Alice: ${aliceHi.isActive ? 'Active' : 'Inactive'} (${aliceHi.tokenBalance} tokens)`);
    console.log(`  Bob:   ${bobHi.isActive ? 'Active' : 'Inactive'} (${bobHi.tokenBalance} tokens)`);
    console.log(`  Carol: ${carolHi.isActive ? 'Active' : 'Inactive'} (${carolHi.tokenBalance} tokens)`);

    console.log(`\n=== Simulation Complete (VRF pending) ===`);
    console.log(`Coin: SIM at ${simCoin}`);
    console.log(`Cycle: triggerFlip called for cycle 1, awaiting VRF fulfillment`);
  }
  console.log(`Treasury received: ${Number(pendingFees) / 1e18} MON`);
  console.log(`Top loser: ${topLoser[0]} lost ${Number(topLoser[1]) / 1e18} MON`);
  console.log('===========================');

  process.exit(0);
}

main().catch((err) => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
