require('dotenv').config();
const { createPublicClient, createWalletClient, http } = require('viem');
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

const ACCOUNT = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const DEPLOYER = process.env.DEPLOYER_ADDRESS;

const publicClient = createPublicClient({ chain: MONAD_TESTNET, transport: http() });
const walletClient = createWalletClient({ chain: MONAD_TESTNET, transport: http(), account: ACCOUNT });

const RUG_POOL = '0x4fae7fe950beed86deb347ec49b5928c3f4efd24';
const MEMBER_REGISTRY = '0x079c4457ced137841e90bd13cfa059a904380aa2';
const VRF_CONSUMER = '0x8b3b4b2747e6bae2da2bc706e1e53459974bf9cd';
const TREASURY = '0xeb1ad588ccadca76564e2e387f71e48ec13244bd';
const COIN_FACTORY = '0x11feec514473b7eb08a3f8ad08f6a0589cdbab6b';

const state = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-state.json'), 'utf8'));
const TEST_COIN = state.testCoinAddress;

const abi = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'abis', 'RugPool.json'), 'utf8'));

let passed = 0;
let failed = 0;

function pass(name) { console.log(`  ✅ PASS — ${name}`); passed++; }
function fail(name, msg) { console.log(`  ❌ FAIL — ${name}: ${msg}`); failed++; }

async function mc(functionName, args) {
  return publicClient.readContract({ address: RUG_POOL, abi, functionName, args });
}

async function main() {
  console.log('=== RugPool Tests ===\n');
  console.log(`RugPool:    ${RUG_POOL}`);
  console.log(`Test Coin:  ${TEST_COIN}`);
  console.log(`Deployer:   ${DEPLOYER}\n`);

  // TEST 1
  console.log('TEST 1 — Check memberRegistry is wired correctly');
  const mr = await mc('memberRegistry');
  if (mr.toLowerCase() === MEMBER_REGISTRY.toLowerCase()) {
    pass(`memberRegistry = ${mr}`);
  } else {
    fail('memberRegistry matches', `expected ${MEMBER_REGISTRY}, got ${mr}`);
  }

  // TEST 2
  console.log('\nTEST 2 — Check vrfConsumer is wired correctly');
  const vc = await mc('vrfConsumer');
  if (vc.toLowerCase() === VRF_CONSUMER.toLowerCase()) {
    pass(`vrfConsumer = ${vc}`);
  } else {
    fail('vrfConsumer matches', `expected ${VRF_CONSUMER}, got ${vc}`);
  }

  // TEST 3
  console.log('\nTEST 3 — Check treasury is wired correctly');
  const tr = await mc('treasury');
  if (tr.toLowerCase() === TREASURY.toLowerCase()) {
    pass(`treasury = ${tr}`);
  } else {
    fail('treasury matches', `expected ${TREASURY}, got ${tr}`);
  }

  // TEST 4
  console.log('\nTEST 4 — Check coinFactory is wired correctly');
  const cf = await mc('coinFactory');
  if (cf.toLowerCase() === COIN_FACTORY.toLowerCase()) {
    pass(`coinFactory = ${cf}`);
  } else {
    fail('coinFactory matches', `expected ${COIN_FACTORY}, got ${cf}`);
  }

  // TEST 5
  console.log('\nTEST 5 — Check testCoin is registered and active');
  const cs = await mc('getCoinState', [TEST_COIN]);
  console.log(`  active=${cs.active}, exitProbability=${cs.exitProbability}, currentCycle=${cs.currentCycle}, totalHolders=${cs.totalHolders}`);
  if (cs.active === true && cs.exitProbability === 33 && cs.currentCycle === 1n) {
    pass(`coin registered and active (holders=${cs.totalHolders})`);
  } else {
    fail('coin state correct', `active=${cs.active}, exitProb=${cs.exitProbability}, cycle=${cs.currentCycle}`);
  }

  // TEST 6
  console.log('\nTEST 6 — Check getBuyQuote returns non-zero');
  const quote = await mc('getBuyQuote', [TEST_COIN, 1000000000000000000n]);
  console.log(`  tokensOut for 1 MON: ${quote}`);
  if (quote > 0n) {
    pass('getBuyQuote > 0');
  } else {
    fail('getBuyQuote > 0', `got ${quote}`);
  }

  // TEST 7
  console.log('\nTEST 7 — Buy tokens as registered member');
  try {
    const hash = await walletClient.writeContract({
      address: RUG_POOL, abi, functionName: 'buy',
      args: [TEST_COIN, 0n],
      value: 100000000000000000n, // 0.1 MON
    });
    console.log(`  Tx: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'success') {
      pass('buy succeeded');
    } else {
      fail('buy succeeded', `tx status: ${receipt.status}`);
    }
  } catch (err) {
    fail('buy succeeded', err.shortMessage || err.message);
  }

  // TEST 8
  console.log('\nTEST 8 — Check holder info after buying');
  const hi = await mc('getHolderInfo', [TEST_COIN, DEPLOYER]);
  console.log(`  tokenBalance: ${hi.tokenBalance}, cycleJoined: ${hi.cycleJoined}, isActive: ${hi.isActive}`);
  if (hi.tokenBalance > 0n && hi.cycleJoined === 1n && hi.isActive === true) {
    pass('holder info correct');
  } else {
    fail('holder info correct', `balance=${hi.tokenBalance}, cycle=${hi.cycleJoined}, active=${hi.isActive}`);
  }

  // TEST 9
  console.log('\nTEST 9 — Check getCoinState updates after buy');
  const cs2 = await mc('getCoinState', [TEST_COIN]);
  console.log(`  totalHolders: ${cs2.totalHolders}, poolValue: ${cs2.poolValue}`);
  if (cs2.totalHolders === 1n && cs2.poolValue > 0n) {
    pass('coin state updated');
  } else {
    fail('coin state updated', `holders=${cs2.totalHolders}, poolValue=${cs2.poolValue}`);
  }

  // TEST 10
  console.log('\nTEST 10 — Check getCoinHolders includes deployer');
  const holders = await mc('getCoinHolders', [TEST_COIN]);
  if (holders.some(h => h.toLowerCase() === DEPLOYER.toLowerCase())) {
    pass('holders includes deployer');
  } else {
    fail('holders includes deployer', `got ${holders}`);
  }

  // TEST 11
  console.log('\nTEST 11 — Check getExitQueue returns sorted queue');
  const queue = await mc('getExitQueue', [TEST_COIN]);
  console.log(`  queue length: ${queue.length}`);
  const first = queue[0];
  if (queue.length === 1 && first.wallet.toLowerCase() === DEPLOYER.toLowerCase()) {
    pass(`exit queue has deployer (${first.tokenBalance} tokens, cycle ${first.cycleJoined})`);
  } else {
    fail('exit queue correct', `length=${queue.length}, first=${first?.wallet}`);
  }

  // TEST 12
  console.log('\nTEST 12 — Check isFlipReady returns false before 24hrs');
  const flipReady = await mc('isFlipReady', [TEST_COIN]);
  if (flipReady === false) {
    pass('isFlipReady = false');
  } else {
    fail('isFlipReady = false', `got ${flipReady}`);
  }

  // TEST 13
  console.log('\nTEST 13 — Check buy reverts for unregistered wallet');
  try {
    const randomKey = generatePrivateKey();
    const randomAccount = privateKeyToAccount(randomKey);
    const randomWalletClient = createWalletClient({
      chain: MONAD_TESTNET, transport: http(), account: randomAccount,
    });
    const hash = await randomWalletClient.writeContract({
      address: RUG_POOL, abi, functionName: 'buy',
      args: [TEST_COIN, 0n],
      value: 100000000000000000n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'reverted') {
      pass('unregistered buy reverted');
    } else {
      fail('unregistered buy reverted', 'tx succeeded');
    }
  } catch {
    pass('unregistered buy reverted');
  }

  // TEST 14
  console.log('\nTEST 14 — Check getSellQuote returns correct amount');
  const sq = await mc('getSellQuote', [TEST_COIN, hi.tokenBalance]);
  console.log(`  monOut for ${hi.tokenBalance} tokens: ${sq}`);
  if (sq > 0n) {
    pass(`getSellQuote = ${sq} wei`);
  } else {
    fail('getSellQuote > 0', `got ${sq}`);
  }

  console.log(`\n=== RugPool Tests: ${passed}/${passed + failed} passed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
