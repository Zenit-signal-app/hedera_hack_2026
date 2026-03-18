#!/usr/bin/env node

/**
 * Deploy Vault contract with auto-association
 *
 * Uses Hedera SDK ContractCreateFlow to deploy with auto-association in one step.
 *
 * Usage:
 *   node scripts/deploy-vault.js --network hedera_testnet
 *   node scripts/deploy-vault.js --network hedera_testnet --gas 3000000
 *
 * Required environment variables (in .env):
 *   OPERATOR_ID: Hedera account ID (e.g., 0.0.123456)
 *   OPERATOR_KEY: Private key
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { parseArgs } = require('util');
const dotenv = require('dotenv');
const { getAddress } = require('ethers');
const { Client, ContractCreateFlow, ContractFunctionParameters, PrivateKey } = require('@hashgraph/sdk');

const HELP = `
Deploy Vault contract with auto-association

Usage:
  node scripts/deploy-vault.js [options]

Options:
  --network <name>         Network: hedera_local, hedera_testnet, hedera_mainnet (required)
  --manager <address>       Manager address (default: derived from OPERATOR_KEY)
  --gas <amount>            Gas limit (default: 2000000)
  --dry-run                 Show config without deploying
  --skip-build              Skip forge build
  --help                    Show this help
`;

const projectDir = path.dirname(path.dirname(__filename));
const configFile = path.join(projectDir, 'config', 'vaultConfig.json');
const configGenScript = path.join(projectDir, 'config', 'genConfig.js');
const artifactPath = path.join(projectDir, 'out', 'Vault.sol', 'Vault.json');

dotenv.config({ path: path.join(projectDir, '.env') });

function loadConfig(network) {
  if (!fs.existsSync(configFile)) return null;
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  return config[network] || null;
}

function parsePrivateKey(keyStr) {
  try {
    return PrivateKey.fromStringECDSA(keyStr);
  } catch {
    try {
      return PrivateKey.fromStringED25519(keyStr);
    } catch {
      throw new Error('Invalid private key format');
    }
  }
}

function toChecksumAddress(addrStr) {
  if (!addrStr) return null;
  let hex = addrStr;
  if (addrStr.includes('.')) {
    const parts = addrStr.split('.');
    if (parts.length === 3) {
      hex = '0x' + BigInt(parts[2]).toString(16).padStart(40, '0');
    }
  } else if (!addrStr.startsWith('0x')) {
    hex = '0x' + addrStr;
  }
  try {
    return getAddress(hex);
  } catch {
    return hex;
  }
}

function getClient(network, operatorId, operatorKey) {
  let client;
  switch (network) {
    case 'hedera_testnet':
      client = Client.forTestnet();
      break;
    case 'hedera_mainnet':
      client = Client.forMainnet();
      break;
    case 'hedera_local':
      client = Client.forLocalNode();
      break;
    default:
      throw new Error(`Unknown network: ${network}`);
  }
  client.setOperator(operatorId, operatorKey);
  return client;
}

function runCommand(cmd, desc) {
  console.log(`  ${desc}...`);
  try {
    execSync(cmd, { cwd: projectDir, stdio: 'pipe' });
    return true;
  } catch (e) {
    console.error(`  Failed: ${e.stderr?.toString() || e.message}`);
    return false;
  }
}

function saveDeployment(network, deployment, config) {
  const deployDir = path.join(projectDir, 'deploy', network);
  if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir, { recursive: true });

  const content = `# Vault deployment - ${network}
# Generated: ${new Date().toISOString()}

deployment:
  contract_id: ${deployment.contractId}
  contract_address: ${deployment.contractAddress}
  transaction_id: "${deployment.transactionId}"
  status: success
  max_automatic_token_associations: -1

config:
  token1: ${config.token1}
  token2: ${config.token2}
  max_shareholders: ${config.maxShareholders}
`;

  const filePath = path.join(deployDir, 'vault.yaml');
  fs.writeFileSync(filePath, content);
  return filePath;
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }

  const { values } = parseArgs({
    options: {
      network: { type: 'string' },
      manager: { type: 'string' },
      gas: { type: 'string', default: '2000000' },
      'dry-run': { type: 'boolean', default: false },
      'skip-build': { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  if (!values.network) {
    console.error('Error: --network is required');
    process.exit(1);
  }

  const network = values.network;
  const config = loadConfig(network);
  if (!config) {
    console.error(`Error: No config found for network "${network}"`);
    process.exit(1);
  }

  const token1 = toChecksumAddress(config.token1);
  const token2 = toChecksumAddress(config.token2);
  const maxShareholders = config.maxShareholders || 5;
  const gas = parseInt(values.gas, 10);

  if (!token1 || token1 === '0x0000000000000000000000000000000000000000') {
    console.error('Error: token1 not configured');
    process.exit(1);
  }
  if (!token2 || token2 === '0x0000000000000000000000000000000000000000') {
    console.error('Error: token2 not configured');
    process.exit(1);
  }

  const operatorId = process.env.OPERATOR_ID;
  const operatorKeyStr = process.env.OPERATOR_KEY;
  if (!operatorId || !operatorKeyStr) {
    console.error('Error: OPERATOR_ID and OPERATOR_KEY required in .env');
    process.exit(1);
  }
  const operatorKey = parsePrivateKey(operatorKeyStr);

  console.log('\n' + '='.repeat(50));
  console.log('  Vault Deployment with Auto-Association');
  console.log('='.repeat(50) + '\n');
  console.log(`Network:          ${network}`);
  console.log(`Token1:           ${token1}`);
  console.log(`Token2:           ${token2}`);
  console.log(`Max Shareholders: ${maxShareholders}`);
  console.log(`Gas:              ${gas}`);
  console.log(`Dry Run:          ${values['dry-run']}\n`);

  if (values['dry-run']) {
    console.log('Dry run - exiting');
    process.exit(0);
  }

  // Step 1: Generate config
  console.log('Step 1: Generate VaultConfig.sol');
  if (!runCommand(`node config/genConfig.js ${network}`, 'Generating config')) {
    process.exit(1);
  }

  // Step 2: Build
  if (!values['skip-build']) {
    console.log('\nStep 2: Build contract');
    if (!runCommand('forge build', 'Building')) {
      process.exit(1);
    }
  }

  // Step 3: Deploy via SDK
  console.log('\nStep 3: Deploy via Hedera SDK');
  if (!fs.existsSync(artifactPath)) {
    console.error(`  Artifact not found: ${artifactPath}`);
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const bytecode = artifact.bytecode?.object || artifact.bytecode;
  if (!bytecode) {
    console.error('  No bytecode in artifact');
    process.exit(1);
  }

  const client = getClient(network, operatorId, operatorKey);

  // Use provided manager address or derive from operator's private key
  const managerAddress = values.manager || '0x' + operatorKey.publicKey.toEvmAddress();

  // Build constructor parameters: (address _token1, address _token2, uint256 _maxShareholders, address _manager)
  const constructorParams = new ContractFunctionParameters()
    .addAddress(token1)
    .addAddress(token2)
    .addUint256(maxShareholders)
    .addAddress(managerAddress);

  console.log('  Deploying with auto-association...');
  console.log(`  Manager:          ${managerAddress}`);
  const tx = new ContractCreateFlow()
    .setBytecode(bytecode)
    .setGas(gas)
    .setConstructorParameters(constructorParams)
    .setMaxAutomaticTokenAssociations(-1)
    .setAdminKey(operatorKey);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  if (receipt.status.toString() !== 'SUCCESS') {
    console.error(`  Deploy failed: ${receipt.status}`);
    client.close();
    process.exit(1);
  }

  const contractId = receipt.contractId.toString();
  const contractAddress = toChecksumAddress(contractId);

  console.log(`  Contract ID:      ${contractId}`);
  console.log(`  Contract Address: ${contractAddress}`);

  client.close();

  // Step 4: Save deployment
  console.log('\nStep 4: Save deployment info');
  const deployFile = saveDeployment(network, {
    contractId,
    contractAddress,
    transactionId: response.transactionId.toString(),
  }, { token1, token2, maxShareholders });

  console.log('\n' + '='.repeat(50));
  console.log('  Deployment successful!');
  console.log('='.repeat(50));
  console.log(`\nDeployment file: ${deployFile}`);
}

main().catch(e => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
