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

const TREASURY = '0xeb1ad588ccadca76564e2e387f71e48ec13244bd';
const RUG_POOL = '0x4fae7fe950beed86deb347ec49b5928c3f4efd24';

const abi = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'abis', 'Treasury.json'), 'utf8'));

let passed = 0;
let failed = 0;

function pass(name) { console.log(`  ✅ PASS — ${name}`); passed++; }
function fail(name, msg) { console.log(`  ❌ FAIL — ${name}: ${msg}`); failed++; }

async function main() {
  console.log('=== Treasury Tests ===\n');
  console.log(`Treasury: ${TREASURY}`);
  console.log(`RugPool:  ${RUG_POOL}`);
  console.log(`Deployer: ${DEPLOYER}\n`);

  // TEST 1
  console.log('TEST 1 — Check devWallet is set correctly');
  const dw = await publicClient.readContract({ address: TREASURY, abi, functionName: 'devWallet' });
  if (dw.toLowerCase() === DEPLOYER.toLowerCase()) {
    pass(`devWallet = ${dw}`);
  } else {
    fail('devWallet matches', `expected ${DEPLOYER}, got ${dw}`);
  }

  // TEST 2
  console.log('\nTEST 2 — Check rugPool is wired correctly');
  const rp = await publicClient.readContract({ address: TREASURY, abi, functionName: 'rugPool' });
  if (rp.toLowerCase() === RUG_POOL.toLowerCase()) {
    pass(`rugPool = ${rp}`);
  } else {
    fail('rugPool matches', `expected ${RUG_POOL}, got ${rp}`);
  }

  // TEST 3
  console.log('\nTEST 3 — Check currentPeriod is 1');
  const cp = await publicClient.readContract({ address: TREASURY, abi, functionName: 'currentPeriod' });
  if (cp === 1n) {
    pass(`currentPeriod = ${cp}`);
  } else {
    fail('currentPeriod is 1', `got ${cp}`);
  }

  // TEST 4
  console.log('\nTEST 4 — Check getPendingFees starts at 0');
  const pf = await publicClient.readContract({ address: TREASURY, abi, functionName: 'getPendingFees' });
  if (pf === 0n) {
    pass('getPendingFees = 0');
  } else {
    fail('getPendingFees = 0', `got ${pf}`);
  }

  // TEST 5
  console.log('\nTEST 5 — Check getCurrentTopLoser starts empty');
  const tl = await publicClient.readContract({ address: TREASURY, abi, functionName: 'getCurrentTopLoser' });
  const zeroAddr = '0x0000000000000000000000000000000000000000';
  const tlWallet = tl[0];
  const tlAmount = tl[1];
  if (tlWallet.toLowerCase() === zeroAddr && tlAmount === 0n) {
    pass(`topLoser = ${tlWallet}, amount = ${tlAmount}`);
  } else {
    fail('topLoser empty', `got wallet=${tlWallet}, amount=${tlAmount}`);
  }

  // TEST 6
  console.log('\nTEST 6 — Check getPeriod(1) returns correct structure');
  const p1 = await publicClient.readContract({ address: TREASURY, abi, functionName: 'getPeriod', args: [1] });
  const thirtyDays = 30n * 86400n;
  console.log(`  startTime: ${p1.startTime}`);
  console.log(`  endTime:   ${p1.endTime}`);
  console.log(`  expected endTime: startTime + 30 days = ${p1.startTime + thirtyDays}`);
  if (p1.startTime > 0n && p1.endTime === p1.startTime + thirtyDays && p1.totalAccumulated === 0n && p1.settled === false) {
    pass('period(1) structure correct');
  } else {
    fail('period(1) structure', `start=${p1.startTime}, end=${p1.endTime}, accumulated=${p1.totalAccumulated}, settled=${p1.settled}`);
  }

  // TEST 7
  console.log('\nTEST 7 — Check receiveProtocolFee reverts from non-rugPool caller');
  try {
    const hash = await walletClient.writeContract({
      address: TREASURY, abi, functionName: 'receiveProtocolFee', args: [], value: 1000000000000000000n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'reverted') {
      pass('receiveProtocolFee reverted for non-rugPool');
    } else {
      fail('receiveProtocolFee reverted for non-rugPool', 'tx succeeded');
    }
  } catch {
    pass('receiveProtocolFee reverted for non-rugPool');
  }

  // TEST 8
  console.log('\nTEST 8 — Check recordLoss reverts from non-rugPool caller');
  try {
    const hash = await walletClient.writeContract({
      address: TREASURY, abi, functionName: 'recordLoss', args: [DEPLOYER, 1000000n],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'reverted') {
      pass('recordLoss reverted for non-rugPool');
    } else {
      fail('recordLoss reverted for non-rugPool', 'tx succeeded');
    }
  } catch {
    pass('recordLoss reverted for non-rugPool');
  }

  // TEST 9
  console.log('\nTEST 9 — Check settleMonth reverts before period ends');
  try {
    const hash = await walletClient.writeContract({
      address: TREASURY, abi, functionName: 'settleMonth', args: [],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'reverted') {
      pass('settleMonth reverted before period ends');
    } else {
      fail('settleMonth reverted before period ends', 'tx succeeded');
    }
  } catch {
    pass('settleMonth reverted before period ends');
  }

  // TEST 10
  console.log('\nTEST 10 — Check getUserLoss returns 0 for deployer');
  const ul = await publicClient.readContract({ address: TREASURY, abi, functionName: 'getUserLoss', args: [DEPLOYER] });
  if (ul === 0n) {
    pass('getUserLoss = 0');
  } else {
    fail('getUserLoss = 0', `got ${ul}`);
  }

  // TEST 11
  console.log('\nTEST 11 — Check setDevWallet reverts for non-owner');
  try {
    const randomKey = generatePrivateKey();
    const randomAccount = privateKeyToAccount(randomKey);
    await publicClient.simulateContract({
      address: TREASURY, abi, functionName: 'setDevWallet', args: [DEPLOYER],
      account: randomAccount.address,
    });
    fail('non-owner setDevWallet reverted', 'simulation succeeded');
  } catch {
    pass('non-owner setDevWallet reverted');
  }

  // TEST 12
  console.log('\nTEST 12 — Check setRugPool reverts for non-owner');
  try {
    const randomKey = generatePrivateKey();
    const randomAccount = privateKeyToAccount(randomKey);
    await publicClient.simulateContract({
      address: TREASURY, abi, functionName: 'setRugPool', args: [RUG_POOL],
      account: randomAccount.address,
    });
    fail('non-owner setRugPool reverted', 'simulation succeeded');
  } catch {
    pass('non-owner setRugPool reverted');
  }

  console.log(`\n=== Treasury Tests: ${passed}/${passed + failed} passed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
