#!/usr/bin/env node

/**
 * Deploy Vault contract using @hashgraph/sdk with auto-association
 * 
 * Usage:
 *   node scripts/deploy-vault.js --network hedera_testnet --token1 0.0.8271323 --token2 0.0.8271324
 *   node scripts/deploy-vault.js --network hedera_local --token1 0.0.123 --token2 0.0.456 --max-shareholders 10
 *   node scripts/deploy-vault.js --network custom --rpc-url http://localhost:7546 --token1 0x... --token2 0x...
 * 
 * Required environment variables (in .env):
 *   OPERATOR_ID: Hedera account ID (e.g., 0.0.123456)
 *   OPERATOR_KEY: Private key (with 0x prefix)
 */

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');
const dotenv = require('dotenv');

const HELP = `
Deploy Vault contract with auto-association

Usage:
  node scripts/deploy-vault.js [options]

Options:
  --network <name>          Network: hedera_local, hedera_testnet, hedera_mainnet, custom (required)
  --rpc-url <url>          Custom RPC URL (required for custom network)
  --token1 <token-id>      Token1 address (required, e.g., 0.0.8271323 or 0x...)
  --token2 <token-id>      Token2 address (required)
  --max-shareholders <n>  Max shareholders (default: 5)
  --manager <address>     Manager address (default: OPERATOR_ID)
  --gas <n>               Gas limit (default: 3000000)
  --save-keys              Save private keys to deployment file (DANGEROUS)
  --help                   Show this help

Environment variables (in .env):
  OPERATOR_ID              Hedera account ID (e.g., 0.0.123456)
  OPERATOR_KEY             Private key (with 0x prefix)
  HEDERA_LOCAL_RPC_URL   RPC URL for local network
  HEDERA_TESTNET_RPC_URL RPC URL for testnet
  HEDERA_MAINNET_RPC_URL RPC URL for mainnet
  CUSTOM_RPC_URL          RPC URL for custom network
`;

const scriptDir = path.dirname(__filename);
const projectDir = path.dirname(scriptDir);
const envFile = path.join(projectDir, '.env');

dotenv.config({ path: envFile });

const {
  Client,
  PrivateKey,
  AccountId,
  ContractCreateFlow,
  ContractFunctionParams,
} = require('@hashgraph/sdk');

function parsePrivateKey(keyStr) {
  try {
    return PrivateKey.fromStringECDSA(keyStr);
  } catch (e) {
    try {
      return PrivateKey.fromStringED25519(keyStr);
    } catch (e2) {
      throw new Error(`Invalid private key format: ${keyStr}`);
    }
  }
}

function parseAddress(addrStr) {
  if (!addrStr) return null;
  
  // If it's already in hex format (0x...), use as-is
  if (addrStr.startsWith('0x')) {
    return addrStr;
  }
  
  // If it's in Hedera format (0.0.xxxxx), convert to hex
  if (addrStr.includes('.')) {
    const parts = addrStr.split('.');
    if (parts.length === 3) {
      const num = BigInt(parts[2]);
      return '0x' + num.toString(16).padStart(40, '0');
    }
  }
  
  // Treat as raw hex string
  return addrStr.startsWith('0x') ? addrStr : '0x' + addrStr;
}

const NETWORKS = {
  hedera_local: {
    rpcUrl: process.env.HEDERA_LOCAL_RPC_URL || 'http://localhost:7546',
    chainId: 298,
    name: 'Hedera Local',
  },
  hedera_testnet: {
    rpcUrl: process.env.HEDERA_TESTNET_RPC_URL || 'https://testnet.hashio.io/api',
    chainId: 296,
    name: 'Hedera Testnet',
  },
  hedera_mainnet: {
    rpcUrl: process.env.HEDERA_MAINNET_RPC_URL || 'https://mainnet.hashio.io/api',
    chainId: 295,
    name: 'Hedera Mainnet',
  },
};

function loadEnv(network, rpcUrl) {
  const operatorIdStr = process.env.OPERATOR_ID;
  const operatorKeyStr = process.env.OPERATOR_KEY;

  if (!operatorIdStr) {
    throw new Error('OPERATOR_ID not set. Add to .env file (e.g., OPERATOR_ID=0.0.123456)');
  }
  if (!operatorKeyStr) {
    throw new Error('OPERATOR_KEY not set. Add to .env file (e.g., OPERATOR_KEY=0x...)');
  }

  if (network === 'custom') {
    if (!rpcUrl) {
      throw new Error('Custom network requires --rpc-url argument');
    }
    return { operatorIdStr, operatorKeyStr, rpcUrl };
  }

  const netConfig = NETWORKS[network];
  if (!netConfig) {
    throw new Error(`Unknown network: ${network}. Use: ${Object.keys(NETWORKS).join(', ')}, custom`);
  }

  return { operatorIdStr, operatorKeyStr, rpcUrl: netConfig.rpcUrl };
}

function createClient(network, rpcUrl, operatorIdStr, operatorKeyStr) {
  const operatorId = AccountId.fromString(operatorIdStr);
  const operatorKey = parsePrivateKey(operatorKeyStr);

  let client;

  if (network === 'custom') {
    client = Client.forNetwork({ [rpcUrl]: { chainId: 0 } });
  } else if (network === 'hedera_local') {
    client = Client.forNetwork({ [rpcUrl]: { chainId: NETWORKS.hedera_local.chainId } });
  } else if (network === 'hedera_testnet') {
    client = Client.forTestnet();
  } else if (network === 'hedera_mainnet') {
    client = Client.forMainnet();
  }

  client.setOperator(operatorId, operatorKey);
  client._operatorKey = operatorKey;
  
  return client;
}

function loadBytecode() {
  const artifactPath = path.join(projectDir, 'out', 'Vault.sol', 'Vault.json');
  
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Vault artifact not found at ${artifactPath}. Run 'forge build' first.`);
  }
  
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  
  if (!artifact.bytecode || !artifact.bytecode.object) {
    throw new Error('Invalid artifact: missing bytecode.object');
  }
  
  return '0x' + artifact.bytecode.object;
}

async function deployVault(client, args, operatorId, operatorKey) {
  const bytecode = loadBytecode();
  
  const token1Address = parseAddress(args.token1);
  const token2Address = parseAddress(args.token2);
  const managerAddress = args.manager ? parseAddress(args.manager) : parseAddress(operatorId.toString());
  
  const constructorParams = new ContractFunctionParams()
    .addAddress(token1Address)
    .addAddress(token2Address)
    .addUint256(args.maxShareholders)
    .addAddress(managerAddress);
  
  const contractCreateFlow = new ContractCreateFlow()
    .setBytecode(bytecode)
    .setGas(args.gas)
    .setMaxAutomaticTokenAssociations(-1)
    .setAdminKey(operatorKey)
    .setConstructorParameters(constructorParams);
  
  const response = await contractCreateFlow.execute(client);
  const receipt = await response.getReceipt(client);
  
  if (!receipt.contractId) {
    throw new Error(`Contract deployment failed. Status: ${receipt.status}`);
  }
  
  return {
    contractId: receipt.contractId,
    transactionId: response.transactionId,
    transactionHash: response.transactionHash?.toString(),
  };
}

function saveDeployment(network, rpcUrl, deployment, args, adminKey) {
  const deployDir = path.join(projectDir, 'deploy', network);
  
  if (!fs.existsSync(deployDir)) {
    fs.mkdirSync(deployDir, { recursive: true });
  }

  const deployFile = path.join(deployDir, 'vault.yaml');
  const timestamp = new Date().toISOString();
  
  const token1Hex = parseAddress(args.token1);
  const token2Hex = parseAddress(args.token2);
  const managerHex = args.manager ? parseAddress(args.manager) : parseAddress(deployment.operatorIdStr);
  
  const yamlContent = `# Vault Deployment Info
# Generated: ${timestamp}

network:
  name: ${network}
  chain_id: ${NETWORKS[network]?.chainId || 0}
  chain_name: ${NETWORKS[network]?.name || 'Custom Network'}

deployment:
  status: success
  exit_code: 0
  contract_address: ${deployment.contractAddress}
  transaction_hash: "${deployment.transactionHash}"
  timestamp: ${timestamp}
  max_automatic_token_associations: -1

manager:
  address: ${managerHex}

tokens:
  token1: ${token1Hex}
  token2: ${token2Hex}

configuration:
  max_shareholders: ${args.maxShareholders}
  constructor_args:
    token1: ${token1Hex}
    token2: ${token2Hex}
    max_shareholders: ${args.maxShareholders}
    manager: ${managerHex}

rpc:
  url: ${rpcUrl}

${args.saveKeys ? `keys:
  admin_key: ${adminKey.toString()}
` : `keys:
  admin_key: [REDACTED]
`}`;
  
  fs.writeFileSync(deployFile, yamlContent);

  return deployFile;
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }

  const options = {
    network: {
      type: 'string',
    },
    'rpc-url': {
      type: 'string',
    },
    token1: {
      type: 'string',
    },
    token2: {
      type: 'string',
    },
    'max-shareholders': {
      type: 'string',
      default: '5',
    },
    manager: {
      type: 'string',
    },
    gas: {
      type: 'string',
      default: '3000000',
    },
    'save-keys': {
      type: 'boolean',
      default: false,
    },
  };

  const { values } = parseArgs({ options, allowPositionals: false });

  if (!values.network) {
    console.error('Error: --network is required');
    console.error('Usage: node scripts/deploy-vault.js --network <network> --token1 <addr> --token2 <addr>');
    console.error('Run with --help for more options');
    process.exit(1);
  }

  if (!values.token1 || !values.token2) {
    console.error('Error: --token1 and --token2 are required');
    console.error('Usage: node scripts/deploy-vault.js --network <network> --token1 <addr> --token2 <addr>');
    console.error('Run with --help for more options');
    process.exit(1);
  }

  const args = {
    network: values.network,
    rpcUrl: values['rpc-url'],
    token1: values.token1,
    token2: values.token2,
    maxShareholders: parseInt(values['max-shareholders'], 10),
    manager: values.manager,
    gas: parseInt(values.gas, 10),
    saveKeys: values['save-keys'],
  };

  console.log('');
  console.log('='.repeat(50));
  console.log('  Vault Deployment (with Auto-Association)');
  console.log('='.repeat(50));
  console.log('');

  let env;
  try {
    env = loadEnv(args.network, args.rpcUrl);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }

  console.log(`Network:              ${args.network}`);
  console.log(`RPC URL:              ${env.rpcUrl}`);
  console.log(`Token1:               ${args.token1}`);
  console.log(`Token2:               ${args.token2}`);
  console.log(`Max Shareholders:     ${args.maxShareholders}`);
  console.log(`Manager:              ${args.manager || 'OPERATOR_ID (default)'} `);
  console.log(`Gas Limit:            ${args.gas}`);
  console.log(`Auto-Associations:    -1 (unlimited)`);
  console.log('');

  let client;
  let operatorKey;
  let operatorIdStr;
  try {
    client = createClient(args.network, env.rpcUrl, env.operatorIdStr, env.operatorKeyStr);
    operatorIdStr = env.operatorIdStr;
    operatorKey = client._operatorKey;

    console.log('Deploying Vault contract...');
    
    const deployment = await deployVault(client, args, client.operatorAccountId, operatorKey);
    
    const contractAddress = deployment.contractId.toAddress();
    
    console.log('');
    console.log(`Contract Address:    ${contractAddress}`);
    console.log(`Transaction Hash:    ${deployment.transactionHash}`);
    console.log('');

    const deployFile = saveDeployment(
      args.network,
      env.rpcUrl,
      {
        contractId: deployment.contractId,
        contractAddress: contractAddress,
        transactionHash: deployment.transactionHash,
        operatorIdStr: operatorIdStr,
      },
      args,
      operatorKey
    );

    console.log(`Deployment saved:    ${deployFile}`);
    console.log('');
    console.log('='.repeat(50));
    console.log('  Success! Vault deployed with auto-association');
    console.log('='.repeat(50));

    client.close();
  } catch (e) {
    console.error(`Error: ${e.message}`);
    if (e.stack) {
      console.error(e.stack);
    }
    process.exit(1);
  }
}

main();
