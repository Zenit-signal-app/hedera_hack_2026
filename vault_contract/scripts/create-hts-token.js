#!/usr/bin/env node

/**
 * Create HTS (Hedera Token Service) fungible tokens using @hashgraph/sdk
 * 
 * Usage:
 *   node scripts/create-hts-token.js --network hedera_testnet --name "My Token" --symbol MTK
 *   node scripts/create-hts-token.js --network hedera_local --name "Test Token" --symbol TT --decimals 6 --initial-supply 1000000
 *   node scripts/create-hts-token.js --network custom --rpc-url http://localhost:7546 --name "Custom Token" --symbol CTK
 * 
 * Required environment variables (in .env):
 *   OPERATOR_ID: Hedera account ID (e.g., 0.0.123456)
 *   OPERATOR_KEY: Private key (with 0x prefix)
 *   HEDERA_LOCAL_RPC_URL: RPC URL for local network (default: http://localhost:7546)
 *   HEDERA_TESTNET_RPC_URL: RPC URL for testnet
 *   HEDERA_MAINNET_RPC_URL: RPC URL for mainnet
 *   CUSTOM_RPC_URL: RPC URL for custom network
 */

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');
const dotenv = require('dotenv');

const HELP = `
Create HTS (Hedera Token Service) fungible tokens

Usage:
  node scripts/create-hts-token.js [options]

Options:
  --network <name>       Network: hedera_local, hedera_testnet, hedera_mainnet, custom (default: hedera_local)
  --rpc-url <url>       Custom RPC URL (required for custom network)
  --name <name>         Token name (required)
  --symbol <symbol>     Token symbol (required)
  --decimals <num>      Token decimals (default: 8)
  --initial-supply <n>  Initial supply in base units (default: 0)
  --max-supply <n>      Max supply (0 = infinite, default: 0)
  --enable-minting      Enable minting
  --enable-burning      Enable burning
  --admin-key <key>     Admin key (hex string)
  --supply-key <key>   Supply key (hex string)
  --freeze-key <key>   Freeze key (hex string)
  --wipe-key <key>     Wipe key (hex string)
  --save-keys          Save private keys to deployment file (DANGEROUS)
  --help               Show this help

Examples:
  node scripts/create-hts-token.js --network hedera_testnet --name "My Token" --symbol MTK
  node scripts/create-hts-token.js --network hedera_local --name "Test Token" --symbol TT --decimals 6 --initial-supply 1000000
  node scripts/create-hts-token.js --network custom --rpc-url http://localhost:7546 --name "Custom Token" --symbol CTK --enable-minting

Environment variables (in .env):
  OPERATOR_ID            Hedera account ID (e.g., 0.0.123456)
  OPERATOR_KEY           Private key (with 0x prefix)
  HEDERA_LOCAL_RPC_URL  RPC URL for local network
  HEDERA_TESTNET_RPC_URL RPC URL for testnet
  HEDERA_MAINNET_RPC_URL RPC URL for mainnet
  CUSTOM_RPC_URL         RPC URL for custom network
`;

const scriptDir = path.dirname(__filename);
const projectDir = path.dirname(scriptDir);
const envFile = path.join(projectDir, '.env');

dotenv.config({ path: envFile });

const {
  Client,
  PrivateKey,
  AccountId,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
} = require('@hashgraph/sdk');

function parsePrivateKey(keyStr) {
  // Try to parse as ECDSA first (more common for Hedera accounts), then ED25519
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

const NETWORKS = {
  hedera_local: {
    rpcUrl: process.env.HEDERA_LOCAL_RPC_URL || 'http://localhost:7546',
    chainId: 298,
  },
  hedera_testnet: {
    rpcUrl: process.env.HEDERA_TESTNET_RPC_URL || 'https://testnet.hashio.io/api',
    chainId: 296,
  },
  hedera_mainnet: {
    rpcUrl: process.env.HEDERA_MAINNET_RPC_URL || 'https://mainnet.hashio.io/api',
    chainId: 295,
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
  
  // Attach operator key to client for easy access
  client._operatorKey = operatorKey;
  
  return client;
}

async function createToken(args, client, operatorId, operatorKey) {
  const tx = new TokenCreateTransaction();

  tx.setTokenName(args.name);
  tx.setTokenSymbol(args.symbol);
  tx.setDecimals(args.decimals);
  tx.setInitialSupply(args.initialSupply);
  tx.setTreasuryAccountId(operatorId);
  tx.setTokenType(TokenType.FungibleCommon);

  if (args.maxSupply > 0) {
    tx.setSupplyType(TokenSupplyType.Finite);
    tx.setMaxSupply(args.maxSupply);
  } else {
    tx.setSupplyType(TokenSupplyType.Infinite);
  }

  // Use operator key as admin key if not provided
  let adminKey = args.adminKey ? parsePrivateKey(args.adminKey) : operatorKey;
  tx.setAdminKey(adminKey);

  let supplyKey = null;
  if (args.enableMinting || args.enableBurning) {
    supplyKey = args.supplyKey ? parsePrivateKey(args.supplyKey) : operatorKey;
    tx.setSupplyKey(supplyKey);
  }

  if (args.freezeKey) {
    tx.setFreezeKey(parsePrivateKey(args.freezeKey));
  }

  if (args.wipeKey) {
    tx.setWipeKey(parsePrivateKey(args.wipeKey));
  }

  const frozenTx = await tx.freezeWith(client);

  // Sign with operator key
  await frozenTx.sign(operatorKey);
  
  // Sign with admin key if different from operator
  if (adminKey && adminKey.toString() !== operatorKey.toString()) {
    await frozenTx.sign(adminKey);
  }
  
  // Sign with supply key if different from operator and admin
  if (supplyKey && supplyKey.toString() !== operatorKey.toString() && supplyKey.toString() !== adminKey.toString()) {
    await frozenTx.sign(supplyKey);
  }

  const response = await frozenTx.execute(client);
  const receipt = await response.getReceipt(client);

  if (!receipt.tokenId) {
    throw new Error(`Token creation failed. Status: ${receipt.status}`);
  }

  return { tokenId: receipt.tokenId, adminKey, supplyKey };
}

function saveDeployment(network, rpcUrl, tokenId, args, adminKey, supplyKey) {
  const deployDir = path.join(projectDir, 'deploy', network);
  
  if (!fs.existsSync(deployDir)) {
    fs.mkdirSync(deployDir, { recursive: true });
  }

  const deployFile = path.join(deployDir, 'hts-token.json');

  const data = {
    network: {
      name: network,
      rpcUrl: rpcUrl,
    },
    token: {
      tokenId: tokenId.toString(),
      name: args.name,
      symbol: args.symbol,
      decimals: args.decimals,
      initialSupply: args.initialSupply,
      maxSupply: args.maxSupply,
      type: 'FUNGIBLE_COMMON',
      enableMinting: args.enableMinting,
      enableBurning: args.enableBurning,
    },
    keys: args.saveKeys ? {
      adminKey: adminKey ? adminKey.toString() : null,
      supplyKey: supplyKey ? supplyKey.toString() : null,
    } : {
      adminKey: '[REDACTED]',
      supplyKey: '[REDACTED]',
    },
  };

  fs.writeFileSync(deployFile, JSON.stringify(data, null, 2));

  return deployFile;
}

async function main() {
  // Check for --help first
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }

  const options = {
    network: {
      type: 'string',
      default: 'hedera_local',
    },
    'rpc-url': {
      type: 'string',
    },
    name: {
      type: 'string',
    },
    symbol: {
      type: 'string',
    },
    decimals: {
      type: 'string',
      default: '8',
    },
    'initial-supply': {
      type: 'string',
      default: '0',
    },
    'max-supply': {
      type: 'string',
      default: '0',
    },
    'enable-minting': {
      type: 'boolean',
      default: false,
    },
    'enable-burning': {
      type: 'boolean',
      default: false,
    },
    'admin-key': {
      type: 'string',
    },
    'supply-key': {
      type: 'string',
    },
    'freeze-key': {
      type: 'string',
    },
    'wipe-key': {
      type: 'string',
    },
    'save-keys': {
      type: 'boolean',
      default: false,
    },
  };

  const { values } = parseArgs({ options, allowPositionals: false });

  if (!values.name || !values.symbol) {
    console.error('Error: --name and --symbol are required');
    console.error('Usage: node scripts/create-hts-token.js --network <network> --name <name> --symbol <symbol>');
    console.error('Run with --help for more options');
    process.exit(1);
  }

  const args = {
    network: values.network,
    rpcUrl: values['rpc-url'],
    name: values.name,
    symbol: values.symbol,
    decimals: parseInt(values.decimals, 10),
    initialSupply: parseInt(values['initial-supply'], 10),
    maxSupply: parseInt(values['max-supply'], 10),
    enableMinting: values['enable-minting'],
    enableBurning: values['enable-burning'],
    adminKey: values['admin-key'],
    supplyKey: values['supply-key'],
    freezeKey: values['freeze-key'],
    wipeKey: values['wipe-key'],
    saveKeys: values['save-keys'],
  };

  console.log('');
  console.log('='.repeat(50));
  console.log('  HTS Token Creation');
  console.log('='.repeat(50));
  console.log('');

  let env;
  try {
    env = loadEnv(args.network, args.rpcUrl);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }

  console.log(`Network:     ${args.network}`);
  console.log(`RPC URL:     ${env.rpcUrl}`);
  console.log(`Token Name:  ${args.name}`);
  console.log(`Symbol:      ${args.symbol}`);
  console.log(`Decimals:    ${args.decimals}`);
  console.log(`Initial:     ${args.initialSupply}`);
  console.log(`Max Supply:  ${args.maxSupply === 0 ? 'Infinite' : args.maxSupply}`);
  console.log(`Minting:     ${args.enableMinting}`);
  console.log(`Burning:     ${args.enableBurning}`);
  console.log('');

  let client;
  let operatorKey;
  try {
    client = createClient(args.network, env.rpcUrl, env.operatorIdStr, env.operatorKeyStr);
    const operatorId = client.operatorAccountId;
    operatorKey = client._operatorKey;

    const result = await createToken(args, client, operatorId, operatorKey);

    console.log(`Token ID:    ${result.tokenId}`);
    console.log('');

    const deployFile = saveDeployment(
      args.network,
      env.rpcUrl,
      result.tokenId,
      args,
      result.adminKey,
      result.supplyKey
    );

    console.log(`Deployment saved: ${deployFile}`);
    console.log('');
    console.log('='.repeat(50));
    console.log('  Success!');
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
