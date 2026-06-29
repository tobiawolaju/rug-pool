require('dotenv').config();
const { createPublicClient, createWalletClient, http } = require('viem');
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

const REGISTRY = '0x079c4457ced137841e90bd13cfa059a904380aa2';

const abi = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'abis', 'MemberRegistry.json'), 'utf8')
);

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
  console.log('=== MemberRegistry Tests ===\n');
  console.log(`Contract: ${REGISTRY}`);
  console.log(`Deployer: ${DEPLOYER}\n`);

  // Read registration fee
  const fee = await publicClient.readContract({
    address: REGISTRY,
    abi,
    functionName: 'registrationFee',
  });
  console.log(`Registration fee: ${fee} wei (${Number(fee) / 1e18} MON)\n`);

  // TEST 1
  console.log('TEST 1 — Check registration status before registering');
  const before = await publicClient.readContract({
    address: REGISTRY,
    abi,
    functionName: 'isRegistered',
    args: [DEPLOYER],
  });
  if (before === false) {
    pass('isRegistered returns false before registering');
  } else {
    fail('isRegistered returns false before registering', `expected false, got ${before}`);
  }

  // TEST 2
  console.log('\nTEST 2 — Register with correct fee');
  try {
    const hash = await walletClient.writeContract({
      address: REGISTRY,
      abi,
      functionName: 'register',
      args: [],
      value: fee,
    });
    console.log(`  Tx: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'success') {
      pass('register() succeeded');
    } else {
      fail('register() succeeded', `tx status: ${receipt.status}`);
    }
  } catch (err) {
    fail('register() succeeded', err.shortMessage || err.message);
  }

  // TEST 3
  console.log('\nTEST 3 — Check registration status after registering');
  const after = await publicClient.readContract({
    address: REGISTRY,
    abi,
    functionName: 'isRegistered',
    args: [DEPLOYER],
  });
  if (after === true) {
    pass('isRegistered returns true after registering');
  } else {
    fail('isRegistered returns true after registering', `expected true, got ${after}`);
  }

  // TEST 4
  console.log('\nTEST 4 — Check getMemberSince returns timestamp');
  const ts = await publicClient.readContract({
    address: REGISTRY,
    abi,
    functionName: 'getMemberSince',
    args: [DEPLOYER],
  });
  if (ts > 0n) {
    console.log(`  Timestamp: ${ts}`);
    pass('getMemberSince returns non-zero timestamp');
  } else {
    fail('getMemberSince returns non-zero timestamp', `got ${ts}`);
  }

  // TEST 5
  console.log('\nTEST 5 — Check totalMembers incremented');
  const total = await publicClient.readContract({
    address: REGISTRY,
    abi,
    functionName: 'totalMembers',
  });
  if (total === 1n) {
    pass(`totalMembers is ${total}`);
  } else {
    fail('totalMembers is 1', `expected 1, got ${total}`);
  }

  // TEST 6
  console.log('\nTEST 6 — Try registering again (expect revert)');
  try {
    const hash = await walletClient.writeContract({
      address: REGISTRY,
      abi,
      functionName: 'register',
      args: [],
      value: fee,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'reverted') {
      pass('duplicate register reverted');
    } else {
      fail('duplicate register reverted', `tx status: ${receipt.status}`);
    }
  } catch (err) {
    pass('duplicate register reverted');
  }

  // TEST 7
  console.log('\nTEST 7 — Try registering with wrong fee (expect revert)');
  try {
    const hash = await walletClient.writeContract({
      address: REGISTRY,
      abi,
      functionName: 'register',
      args: [],
      value: 1n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'reverted') {
      pass('wrong fee register reverted');
    } else {
      fail('wrong fee register reverted', `tx status: ${receipt.status}`);
    }
  } catch (err) {
    pass('wrong fee register reverted');
  }

  console.log(`\n=== MemberRegistry Tests: ${passed}/${passed + failed} passed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
