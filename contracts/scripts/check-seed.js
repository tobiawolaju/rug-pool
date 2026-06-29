require('dotenv').config();
const { createPublicClient, http, defineChain } = require('viem');
const fs = require('fs');
const path = require('path');

const MONAD_TESTNET = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_TESTNET_RPC] } },
});

const vrfAbi = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'abis', 'VRFConsumer.json'), 'utf8'
));

const client = createPublicClient({ chain: MONAD_TESTNET, transport: http() });

async function main() {
  const SIM_COIN = '0x0A56b9fC488e43AF60790FC2D45D9069FbfeA0B6';
  const VRF = '0x8b3b4b2747e6bae2da2bc706e1e53459974bf9cd';
  const seed = await client.readContract({
    address: VRF,
    abi: vrfAbi,
    functionName: 'getCycleSeed',
    args: [SIM_COIN, 1n]
  });
  const zero = '0x0000000000000000000000000000000000000000000000000000000000000000';
  if (seed === zero) {
    console.log('❌ VRF not fulfilled yet — seed is still zero');
  } else {
    console.log(`✅ VRF fulfilled — seed: ${seed}`);
  }
}

main().catch(console.error);
