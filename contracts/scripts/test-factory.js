require('dotenv').config();
const { createPublicClient, createWalletClient, http, parseEventLogs } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { defineChain } = require('viem');
const fs = require('fs');
const path = require('path');

const MONAD_TESTNET = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_TESTNET_RPC] } },
});

const ACCOUNT = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const DEPLOYER = process.env.DEPLOYER_ADDRESS;

const publicClient = createPublicClient({
  chain: MONAD_TESTNET,
  transport: http(),
});

const walletClient = createWalletClient({
  chain: MONAD_TESTNET,
  transport: http(),
  account: ACCOUNT,
});

const FACTORY = '0x11feec514473b7eb08a3f8ad08f6a0589cdbab6b';
const RUG_POOL = '0x4fae7fe950beed86deb347ec49b5928c3f4efd24';

const factoryAbi = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'abis', 'CoinFactory.json'), 'utf8'));
const rugPoolAbi = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'abis', 'RugPool.json'), 'utf8'));

let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`  ✅ PASS — ${name}`);
  passed++;
}

function fail(name, msg) {
  console.log(`  ❌ FAIL — ${name}: ${msg}`);
  failed++;
}

async function main() {
  console.log('=== CoinFactory Tests ===\n');
  console.log(`CoinFactory: ${FACTORY}`);
  console.log(`RugPool:    ${RUG_POOL}`);
  console.log(`Deployer:   ${DEPLOYER}\n`);

  // TEST 1
  console.log('TEST 1 — Check totalCoins before launch');
  const totalBefore = await publicClient.readContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: 'totalCoins',
  });
  if (totalBefore === 0n) {
    pass(`totalCoins is ${totalBefore}`);
  } else {
    fail('totalCoins is 0', `expected 0, got ${totalBefore}`);
  }

  // TEST 2
  console.log('\nTEST 2 — Launch a coin with no badge (value=0)');
  let tokenAddress;
  try {
    const hash = await walletClient.writeContract({
      address: FACTORY,
      abi: factoryAbi,
      functionName: 'launchCoin',
      args: [
        'Test Coin',
        'TEST',
        'A test coin for Rug Pool',
        'https://test.com/image.png',
        1000000000000n,          // 1e12 wei
        1000000000000000000000000000n, // 1e27
        33,
        false,
      ],
      value: 0n,
    });
    console.log(`  Tx: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'success') {
      const logs = parseEventLogs({ abi: factoryAbi, logs: receipt.logs });
      const event = logs.find(l => l.eventName === 'CoinLaunched');
      tokenAddress = event?.args?.tokenAddress;
      console.log(`  Token address: ${tokenAddress}`);
      pass('launchCoin succeeded');
    } else {
      fail('launchCoin succeeded', `tx status: ${receipt.status}`);
    }
  } catch (err) {
    fail('launchCoin succeeded', err.shortMessage || err.message);
  }

  // TEST 3
  console.log('\nTEST 3 — Check totalCoins after launch');
  const totalAfter = await publicClient.readContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: 'totalCoins',
  });
  if (totalAfter === 1n) {
    pass(`totalCoins is ${totalAfter}`);
  } else {
    fail('totalCoins is 1', `expected 1, got ${totalAfter}`);
  }

  // TEST 4
  console.log('\nTEST 4 — Check getCoin returns correct data');
  const coin = await publicClient.readContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: 'getCoin',
    args: [tokenAddress],
  });
  if (coin.name === 'Test Coin' && coin.ticker === 'TEST' && coin.flipConfig === 33) {
    pass(`name="${coin.name}", ticker="${coin.ticker}", flipConfig=${coin.flipConfig}`);
  } else {
    fail('getCoin returns correct data', `name=${coin.name}, ticker=${coin.ticker}, flipConfig=${coin.flipConfig}`);
  }

  // TEST 5
  console.log('\nTEST 5 — Check getAllCoins includes new coin');
  const allCoins = await publicClient.readContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: 'getAllCoins',
  });
  if (allCoins.includes(tokenAddress)) {
    pass('getAllCoins includes tokenAddress');
  } else {
    fail('getAllCoins includes tokenAddress', 'not found');
  }

  // TEST 6
  console.log('\nTEST 6 — Check getCreatorCoins includes new coin');
  const creatorCoins = await publicClient.readContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: 'getCreatorCoins',
    args: [DEPLOYER],
  });
  if (creatorCoins.includes(tokenAddress)) {
    pass('getCreatorCoins includes tokenAddress');
  } else {
    fail('getCreatorCoins includes tokenAddress', 'not found');
  }

  // Read verified badge fee
  const verifiedFee = await publicClient.readContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: 'verifiedBadgeFee',
  });
  console.log(`\nVerified badge fee: ${verifiedFee} wei (${Number(verifiedFee) / 1e18} MON)`);

  // TEST 7
  console.log('\nTEST 7 — Launch verified coin with badge fee');
  let verifiedTokenAddress;
  try {
    const hash = await walletClient.writeContract({
      address: FACTORY,
      abi: factoryAbi,
      functionName: 'launchCoin',
      args: [
        'Verified Coin',
        'VER',
        'A verified test coin',
        'https://test.com/image2.png',
        1000000000000n,
        1000000000000000000000000000n,
        50,
        true,
      ],
      value: verifiedFee,
    });
    console.log(`  Tx: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'success') {
      const logs = parseEventLogs({ abi: factoryAbi, logs: receipt.logs });
      const event = logs.find(l => l.eventName === 'CoinLaunched');
      verifiedTokenAddress = event?.args?.tokenAddress;
      console.log(`  Token address: ${verifiedTokenAddress}`);
      pass('launchCoin (verified) succeeded');
    } else {
      fail('launchCoin (verified) succeeded', `tx status: ${receipt.status}`);
    }
  } catch (err) {
    fail('launchCoin (verified) succeeded', err.shortMessage || err.message);
  }

  // TEST 8
  console.log('\nTEST 8 — Check verified coin has isVerified = true');
  const verifiedCoin = await publicClient.readContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: 'getCoin',
    args: [verifiedTokenAddress],
  });
  if (verifiedCoin.isVerified === true) {
    pass(`isVerified = ${verifiedCoin.isVerified}`);
  } else {
    fail('isVerified is true', `got ${verifiedCoin.isVerified}`);
  }

  // TEST 9
  console.log('\nTEST 9 — Try launching with invalid flipConfig (expect revert)');
  try {
    const hash = await walletClient.writeContract({
      address: FACTORY,
      abi: factoryAbi,
      functionName: 'launchCoin',
      args: [
        'Bad Coin',
        'BAD',
        '',
        '',
        1000000000000n,
        1000000000000000000000000000n,
        99,
        false,
      ],
      value: 0n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'reverted') {
      pass('invalid flipConfig reverted');
    } else {
      fail('invalid flipConfig reverted', `tx status: ${receipt.status}`);
    }
  } catch (err) {
    pass('invalid flipConfig reverted');
  }

  // TEST 10
  console.log('\nTEST 10 — Check coin is registered in RugPool');
  const coinState = await publicClient.readContract({
    address: RUG_POOL,
    abi: rugPoolAbi,
    functionName: 'getCoinState',
    args: [tokenAddress],
  });
  if (coinState.active === true && coinState.exitProbability === 33) {
    pass(`active=${coinState.active}, exitProbability=${coinState.exitProbability}`);
  } else {
    fail('coin registered in RugPool', `active=${coinState.active}, exitProb=${coinState.exitProbability}`);
  }

  // Save test state
  const statePath = path.join(__dirname, 'test-state.json');
  fs.writeFileSync(statePath, JSON.stringify({
    testCoinAddress: tokenAddress,
    verifiedCoinAddress: verifiedTokenAddress,
  }, null, 2));
  console.log(`\nSaved test state to ${statePath}`);

  console.log(`\n=== CoinFactory Tests: ${passed}/${passed + failed} passed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
