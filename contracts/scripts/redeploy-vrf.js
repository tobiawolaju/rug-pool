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
  const artifact = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'out', 'VRFConsumer.sol', 'VRFConsumer.json'), 'utf8'
  ));

  console.log('Deploying new VRFConsumer...');
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [
      process.env.PYTH_ENTROPY_ADDRESS,
      process.env.PYTH_ENTROPY_PROVIDER
    ]
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const NEW_VRF = receipt.contractAddress;
  console.log(`New VRFConsumer: ${NEW_VRF}`);

  // Wire new VRF to existing RugPool
  const rugPoolAbi = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'abis', 'RugPool.json'), 'utf8'
  ));
  const NEW_RUG_POOL = '0x6e8f3f4fbb12756a1f0f75f7c3736ddfd843509b';

  let h = await walletClient.writeContract({
    address: NEW_RUG_POOL, abi: rugPoolAbi,
    functionName: 'setVRFConsumer', args: [NEW_VRF]
  });
  await publicClient.waitForTransactionReceipt({ hash: h });
  console.log(`rugPool.setVRFConsumer done`);

  const vrfAbi = artifact.abi;
  h = await walletClient.writeContract({
    address: NEW_VRF, abi: vrfAbi,
    functionName: 'setRugPool', args: [NEW_RUG_POOL]
  });
  await publicClient.waitForTransactionReceipt({ hash: h });
  console.log(`vrfConsumer.setRugPool done`);

  // Update deployments.json
  const depPath = path.join(__dirname, '..', 'deployments.json');
  const dep = JSON.parse(fs.readFileSync(depPath, 'utf8'));
  dep.contracts.VRFConsumer = NEW_VRF;
  fs.writeFileSync(depPath, JSON.stringify(dep, null, 2));
  console.log(`deployments.json updated`);

  // Update ABI
  fs.writeFileSync(
    path.join(__dirname, '..', 'abis', 'VRFConsumer.json'),
    JSON.stringify(artifact.abi, null, 2)
  );
  console.log(`ABI updated`);
  console.log(`\nNew VRFConsumer address: ${NEW_VRF}`);
}

main().catch(console.error);
