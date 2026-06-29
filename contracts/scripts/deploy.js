require('dotenv').config();
const { createPublicClient, createWalletClient, http, getContract } = require('viem');
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

const publicClient = createPublicClient({
  chain: MONAD_TESTNET,
  transport: http(),
});

const walletClient = createWalletClient({
  chain: MONAD_TESTNET,
  transport: http(),
  account: ACCOUNT,
});

const PYTH_ENTROPY_ADDRESS = '0x825c0390f379c631f3cf11a82a37d20bddf93c07';
const PYTH_ENTROPY_PROVIDER = '0x6CC14824Ea2918f5De5C2f75A9Da968ad4BD6344';

function loadArtifact(name) {
  const artifactPath = path.join(__dirname, '..', 'out', `${name}.sol`, `${name}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return {
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function deployContract(name, args) {
  const { abi, bytecode } = loadArtifact(name);
  console.log(`\nDeploying ${name}...`);
  const hash = await walletClient.deployContract({
    abi,
    bytecode,
    args,
  });
  console.log(`  Tx sent: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const address = receipt.contractAddress;
  console.log(`  ${name} deployed at: ${address}`);
  return { address, abi };
}

async function writeContractCall(label, contractAddress, abi, functionName, args) {
  console.log(`  Calling ${functionName}...`);
  const hash = await walletClient.writeContract({
    address: contractAddress,
    abi,
    functionName,
    args,
    account: ACCOUNT,
    chain: MONAD_TESTNET,
  });
  console.log(`  Tx: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  ${functionName} confirmed in block ${receipt.blockNumber}`);
  return receipt;
}

async function main() {
  console.log('=== Rug Pool Deploy Script ===');
  console.log(`Network: Monad Testnet (${MONAD_TESTNET.id})`);
  console.log(`Deployer: ${ACCOUNT.address}`);
  console.log(`Balance: ${await publicClient.getBalance({ address: ACCOUNT.address })}`);
  console.log('');

  const memberRegistryArtifact = loadArtifact('MemberRegistry');
  const treasuryArtifact = loadArtifact('Treasury');
  const vrfConsumerArtifact = loadArtifact('VRFConsumer');
  const coinFactoryArtifact = loadArtifact('CoinFactory');
  const rugPoolArtifact = loadArtifact('RugPool');

  // 1. MemberRegistry — no constructor args
  console.log('--- Step 1: MemberRegistry ---');
  const { address: memberRegistryAddr } = await deployContract('MemberRegistry', []);
  const memberRegistry = memberRegistryAddr;

  // 2. Treasury — constructor args: [DEPLOYER_ADDRESS]
  console.log('\n--- Step 2: Treasury ---');
  const { address: treasuryAddr, abi: treasuryAbi } = await deployContract('Treasury', [ACCOUNT.address]);
  const treasury = treasuryAddr;

  // 3. VRFConsumer — constructor args: [PYTH_ENTROPY_ADDRESS, PYTH_ENTROPY_PROVIDER]
  console.log('\n--- Step 3: VRFConsumer ---');
  const { address: vrfConsumerAddr, abi: vrfConsumerAbi } = await deployContract('VRFConsumer', [PYTH_ENTROPY_ADDRESS, PYTH_ENTROPY_PROVIDER]);
  const vrfConsumer = vrfConsumerAddr;

  // 4. CoinFactory — constructor args: [MemberRegistry address]
  console.log('\n--- Step 4: CoinFactory ---');
  const { address: coinFactoryAddr, abi: coinFactoryAbi } = await deployContract('CoinFactory', [memberRegistry]);
  const coinFactory = coinFactoryAddr;

  // 5. RugPool — no constructor args
  console.log('\n--- Step 5: RugPool ---');
  const { address: rugPoolAddr, abi: rugPoolAbi } = await deployContract('RugPool', []);
  const rugPool = rugPoolAddr;

  // Wiring
  console.log('\n--- Wiring contracts ---');

  // rugPool.setMemberRegistry(memberRegistryAddress)
  console.log('\n[1/7] rugPool.setMemberRegistry');
  await writeContractCall('setMemberRegistry', rugPool, rugPoolAbi, 'setMemberRegistry', [memberRegistry]);

  // rugPool.setVRFConsumer(vrfConsumerAddress)
  console.log('\n[2/7] rugPool.setVRFConsumer');
  await writeContractCall('setVRFConsumer', rugPool, rugPoolAbi, 'setVRFConsumer', [vrfConsumer]);

  // rugPool.setTreasury(treasuryAddress)
  console.log('\n[3/7] rugPool.setTreasury');
  await writeContractCall('setTreasury', rugPool, rugPoolAbi, 'setTreasury', [treasury]);

  // rugPool.setCoinFactory(coinFactoryAddress)
  console.log('\n[4/7] rugPool.setCoinFactory');
  await writeContractCall('setCoinFactory', rugPool, rugPoolAbi, 'setCoinFactory', [coinFactory]);

  // treasury.setRugPool(rugPoolAddress)
  console.log('\n[5/7] treasury.setRugPool');
  await writeContractCall('setRugPool', treasury, treasuryAbi, 'setRugPool', [rugPool]);

  // vrfConsumer.setRugPool(rugPoolAddress)
  console.log('\n[6/7] vrfConsumer.setRugPool');
  await writeContractCall('setRugPool', vrfConsumer, vrfConsumerAbi, 'setRugPool', [rugPool]);

  // coinFactory.setRugPool(rugPoolAddress)
  console.log('\n[7/7] coinFactory.setRugPool');
  await writeContractCall('setRugPool', coinFactory, coinFactoryAbi, 'setRugPool', [rugPool]);

  // Save deployments.json
  const timestamp = new Date().toISOString();
  const deployments = {
    network: 'monad_testnet',
    deployedAt: timestamp,
    contracts: {
      MemberRegistry: memberRegistry,
      Treasury: treasury,
      VRFConsumer: vrfConsumer,
      CoinFactory: coinFactory,
      RugPool: rugPool,
    },
  };
  const deploymentsPath = path.join(__dirname, '..', 'deployments.json');
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log(`\nSaved deployments.json`);

  // Copy ABIs to contracts/abis/
  const abisDir = path.join(__dirname, '..', 'abis');
  if (!fs.existsSync(abisDir)) {
    fs.mkdirSync(abisDir);
  }
  const contractNames = ['MemberRegistry', 'Treasury', 'VRFConsumer', 'CoinFactory', 'RugPool'];
  for (const name of contractNames) {
    const { abi } = loadArtifact(name);
    fs.writeFileSync(path.join(abisDir, `${name}.json`), JSON.stringify(abi, null, 2));
  }
  console.log(`Copied ABIs to abis/`);

  console.log('\n=== All done ===');
}

main().catch((err) => {
  console.error('Deploy failed:', err);
  process.exit(1);
});
