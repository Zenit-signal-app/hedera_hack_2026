#!/usr/bin/env node

/**
 * Deploy Vault contract with auto-association
 * 
 * This script:
 * 1. Generates VaultConfig.sol from config/vaultConfig.json
 * 2. Builds the contract with Forge
 * 3. Deploys via Foundry (forge script)
 * 4. Updates contract with auto-association via JS SDK
 * 
 * Usage:
 *   node scripts/deploy-vault.js --network hedera_testnet
 *   node scripts/deploy-vault.js --network hedera_local --max-shareholders 10
 *   node scripts/deploy-vault.js --network hedera_testnet --token1 0.0.8271323 --token2 0.0.8271324
 * 
 * Required environment variables (in .env):
 *   OPERATOR_ID: Hedera account ID (e.g., 0.0.123456)
 *   OPERATOR_KEY: Private key (with 0x prefix)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { parseArgs } = require('util');
const dotenv = require('dotenv');

const HELP = `
Deploy Vault contract with auto-association

Usage:
  node scripts/deploy-vault.js [options]

Options:
  --network <name>          Network: hedera_local, hedera_testnet, hedera_mainnet, custom (required)
  --rpc-url <url>          Custom RPC URL (required for custom network)
  --token1 <token-id>      Token1 address (auto-loaded from config/vaultConfig.json)
  --token2 <token-id>      Token2 address (auto-loaded from config/vaultConfig.json)
  --max-shareholders <n>  Max shareholders (auto-loaded from config, default: 5)
  --manager <address>     Manager address (default: OPERATOR_ID)
  --dry-run               Simulate deployment without broadcasting
  --skip-build            Skip forge build
  --help                   Show this help

Configuration:
  Token addresses and max shareholders are loaded from config/vaultConfig.json
  CLI arguments override config values when provided.
`;

const scriptDir = path.dirname(__filename);
const projectDir = path.dirname(scriptDir);
const envFile = path.join(projectDir, '.env');
const configFile = path.join(projectDir, 'config', 'vaultConfig.json');
const configGenScript = path.join(projectDir, 'config', 'genConfig.js');

dotenv.config({ path: envFile });

function loadConfig(network) {
  if (!fs.existsSync(configFile)) {
    return null;
  }
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  return config[network] || null;
}

function parsePrivateKey(keyStr) {
  try {
    return require('@hashgraph/sdk').PrivateKey.fromStringECDSA(keyStr);
  } catch (e) {
    try {
      return require('@hashgraph/sdk').PrivateKey.fromStringED25519(keyStr);
    } catch (e2) {
      throw new Error(`Invalid private key format: ${keyStr}`);
    }
  }
}

function parseAddress(addrStr) {
  if (!addrStr) return null;
  
  if (addrStr.startsWith('0x')) {
    return addrStr;
  }
  
  if (addrStr.includes('.')) {
    const parts = addrStr.split('.');
    if (parts.length === 3) {
      const num = BigInt(parts[2]);
      return '0x' + num.toString(16).padStart(40, '0');
    }
  }
  
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
    throw new Error('OPERATOR_ID not set in .env');
  }
  if (!operatorKeyStr) {
    throw new Error('OPERATOR_KEY not set in .env');
  }

  if (network === 'custom') {
    if (!rpcUrl) {
      throw new Error('Custom network requires --rpc-url argument');
    }
    return { operatorIdStr, operatorKeyStr, rpcUrl };
  }

  const netConfig = NETWORKS[network];
  if (!netConfig) {
    throw new Error(`Unknown network: ${network}`);
  }

  return { operatorIdStr, operatorKeyStr, rpcUrl: netConfig.rpcUrl };
}

function runCommand(cmd, description) {
  console.log(`  Running: ${description}...`);
  try {
    execSync(cmd, { cwd: projectDir, stdio: 'pipe' });
    return true;
  } catch (e) {
    console.error(`    Command failed: ${e.message}`);
    if (e.stdout) console.error(e.stdout.toString());
    if (e.stderr) console.error(e.stderr.toString());
    return false;
  }
}

function parseVaultYaml(yamlPath) {
  if (!fs.existsSync(yamlPath)) {
    throw new Error(`Deployment file not found: ${yamlPath}`);
  }
  
  const content = fs.readFileSync(yamlPath, 'utf8');
  const result = {
    contractAddress: null,
    transactionHash: null,
    status: null,
  };
  
  const addressMatch = content.match(/contract_address:\s*(0x[a-fA-F0-9]+)/);
  if (addressMatch) {
    result.contractAddress = addressMatch[1];
  }
  
  const txMatch = content.match(/transaction_hash:\s*"?(0x[a-fA-F0-9]+)"?/);
  if (txMatch) {
    result.transactionHash = txMatch[1];
  }
  
  const statusMatch = content.match(/status:\s*(\w+)/);
  if (statusMatch) {
    result.status = statusMatch[1];
  }
  
  return result;
}

async function updateAutoAssociation(network, rpcUrl, contractAddress, operatorIdStr, operatorKeyStr) {
  const { Client, PrivateKey, AccountId, ContractUpdateTransaction } = require('@hashgraph/sdk');
  
  const operatorId = AccountId.fromString(operatorIdStr);
  const operatorKey = parsePrivateKey(operatorKeyStr);

  let client;
  if (network === 'custom') {
    client = Client.forNetwork({ [rpcUrl]: { chainId: 0 } });
  } else if (network === 'hedera_testnet') {
    client = Client.forTestnet();
  } else if (network === 'hedera_mainnet') {
    client = Client.forMainnet();
  } else {
    client = Client.forNetwork({ [rpcUrl]: { chainId: NETWORKS[network]?.chainId || 298 } });
  }

  client.setOperator(operatorId, operatorKey);

  console.log(`  Updating contract with auto-association (-1)...`);

  const tx = new ContractUpdateTransaction()
    .setContractId(contractAddress)
    .setMaxAutomaticTokenAssociations(-1);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  client.close();

  if (receipt.status.toString() !== 'SUCCESS') {
    throw new Error(`Update failed with status: ${receipt.status}`);
  }

  return {
    transactionHash: response.transactionHash?.toString(),
  };
}

function updateVaultYaml(network, rpcUrl, deployment, args) {
  const deployFile = path.join(projectDir, 'deploy', network, 'vault.yaml');
  
  if (!fs.existsSync(deployFile)) {
    return;
  }

  let content = fs.readFileSync(deployFile, 'utf8');
  
  // Update or add max_automatic_token_associations
  if (content.includes('max_automatic_token_associations:')) {
    content = content.replace(
      /max_automatic_token_associations:.*/,
      `max_automatic_token_associations: -1`
    );
  } else {
    content = content.replace(
      /deployment:/,
      `deployment:
  max_automatic_token_associations: -1`
    );
  }
  
  // Add update transaction hash if available
  if (deployment.updateTransactionHash) {
    content = content.replace(
      /timestamp:.*/,
      `timestamp: ${new Date().toISOString()}
  update_transaction_hash: "${deployment.updateTransactionHash}"`
    );
  }

  fs.writeFileSync(deployFile, content);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }

  const options = {
    network: { type: 'string' },
    'rpc-url': { type: 'string' },
    token1: { type: 'string' },
    token2: { type: 'string' },
    'max-shareholders': { type: 'string', default: '5' },
    manager: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'skip-build': { type: 'boolean', default: false },
  };

  const { values } = parseArgs({ options, allowPositionals: false });

  if (!values.network) {
    console.error('Error: --network is required');
    console.error('Run with --help for more options');
    process.exit(1);
  }

  const network = values.network;
  const config = loadConfig(network);

  const args = {
    network,
    rpcUrl: values['rpc-url'],
    token1: values.token1 || (config ? config.token1 : null),
    token2: values.token2 || (config ? config.token2 : null),
    maxShareholders: parseInt(values['max-shareholders'], 10) || (config ? config.maxShareholders : 5),
    manager: values.manager,
    dryRun: values['dry-run'],
    skipBuild: values['skip-build'],
  };

  if (!args.token1 || args.token1 === '0x0000000000000000000000000000000000000000') {
    console.error(`Error: --token1 is required for ${network}`);
    process.exit(1);
  }

  if (!args.token2 || args.token2 === '0x0000000000000000000000000000000000000000') {
    console.error(`Error: --token2 is required for ${network}`);
    process.exit(1);
  }

  console.log('');
  console.log('='.repeat(50));
  console.log('  Vault Deployment with Auto-Association');
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
  console.log(`Dry Run:              ${args.dryRun}`);
  console.log('');

  // Step 1: Generate VaultConfig.sol
  console.log('Step 1: Generate VaultConfig.sol');
  if (!fs.existsSync(configGenScript)) {
    console.error('Error: config/genConfig.js not found');
    process.exit(1);
  }
  
  if (!runCommand(`node config/genConfig.js ${args.network}`, 'Generate config')) {
    process.exit(1);
  }
  console.log('');

  // Step 2: Build with Forge
  if (!args.skipBuild) {
    console.log('Step 2: Build contract with Forge');
    if (!runCommand('forge build', 'Forge build')) {
      process.exit(1);
    }
    console.log('');
  }

  // Step 3: Deploy via Foundry
  console.log('Step 3: Deploy via Foundry');
  const forgeCmd = args.dryRun
    ? `forge script script/Vault.s.sol:VaultScript --rpc-url ${env.rpcUrl}`
    : `forge script script/Vault.s.sol:VaultScript --rpc-url ${env.rpcUrl} --broadcast`;
  
  if (!runCommand(forgeCmd, args.dryRun ? 'Forge dry-run' : 'Forge broadcast')) {
    process.exit(1);
  }
  console.log('');

  // Step 4: Parse deployment output
  console.log('Step 4: Parse deployment output');
  const vaultYamlPath = path.join(projectDir, 'deploy', args.network, 'vault.yaml');
  let deployment;
  try {
    deployment = parseVaultYaml(vaultYamlPath);
    console.log(`  Contract Address:   ${deployment.contractAddress}`);
    console.log(`  Transaction Hash:   ${deployment.transactionHash}`);
    console.log(`  Status:            ${deployment.status}`);
  } catch (e) {
    console.error(`  Error parsing deployment: ${e.message}`);
    process.exit(1);
  }
  
  if (deployment.status !== 'success') {
    console.error('  Deployment failed!');
    process.exit(1);
  }
  
  if (!deployment.contractAddress) {
    console.error('  Could not find contract address in deployment');
    process.exit(1);
  }
  console.log('');

  if (args.dryRun) {
    console.log('Dry run complete - skipping auto-association update');
    console.log('');
    console.log('='.repeat(50));
    console.log('  Success! (dry-run)');
    console.log('='.repeat(50));
    process.exit(0);
  }

  // Step 5: Update with auto-association
  console.log('Step 5: Update contract with auto-association');
  try {
    const updateResult = await updateAutoAssociation(
      args.network,
      env.rpcUrl,
      deployment.contractAddress,
      env.operatorIdStr,
      env.operatorKeyStr
    );
    
    deployment.updateTransactionHash = updateResult.transactionHash;
    console.log(`  Update Tx Hash:     ${updateResult.transactionHash}`);
  } catch (e) {
    console.error(`  Warning: Could not update auto-association: ${e.message}`);
    console.error('  You can update manually later with:');
    console.error(`    node scripts/update-vault-auto-association.js --network ${args.network} --contract ${deployment.contractAddress}`);
  }
  console.log('');

  // Update vault.yaml with auto-association info
  updateVaultYaml(args.network, env.rpcUrl, deployment, args);

  console.log('='.repeat(50));
  console.log('  Success! Vault deployed with auto-association');
  console.log('='.repeat(50));
  console.log('');
  console.log(`Deployment file: ${vaultYamlPath}`);
}

main().catch(e => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
