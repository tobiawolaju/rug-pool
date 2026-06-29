require('dotenv').config();
const { createPublicClient, createWalletClient, http, defineChain } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const fs = require('fs');
const path = require('path');

const MONAD_TESTNET = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_TESTNET_RPC] } },
});

const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const publicClient = createPublicClient({ chain: MONAD_TESTNET, transport: http() });
const walletClient = createWalletClient({ chain: MONAD_TESTNET, transport: http(), account });

async function main() {
  const dep = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'deployments.json'), 'utf8'
  ));
  const vrfAbi = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'abis', 'VRFConsumer.json'), 'utf8'
  ));

  const VRF = dep.contracts.VRFConsumer;
  const SEQUENCE = 0n; // sequence number from the triggerFlip tx — update this
  const MANUAL_SEED = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

  console.log(`Calling manualFulfill on ${VRF}`);
  console.log(`Sequence: ${SEQUENCE}, Seed: ${MANUAL_SEED}`);

  const h = await walletClient.writeContract({
    address: VRF,
    abi: vrfAbi,
    functionName: 'manualFulfill',
    args: [SEQUENCE, MANUAL_SEED]
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: h });
  console.log(`manualFulfill tx: ${h}`);
  console.log(`Status: ${receipt.status}`);
}

main().catch(console.error);
