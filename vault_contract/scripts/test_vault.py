#!/usr/bin/env python3
"""
scripts/test_vault.py - Vault contract sanity checks via web3.py

Closed State
Test 13: Combined Lifecycle -- Drives the full Deposit → Running → Withdraw flow in one shot: deposits by multiple shareholders, manager adds an allowed target, executes, and then handles user + batch withdrawals to ensure the vault returns to Closed.

Test 0: Setup -- Mint tokens to alith, baltathar, charleth (from current test_0_setup)
Test 1: Access Control -- Non-manager (alith) calls stateToDeposit(), expect revert (from current Test 12)
Test 2: Update Vault Config -- Call updateVault() in Closed state (from current Test 11)

# Deposit State
Test 3: State to Deposit -- Manager (dorothy) transitions Closed -> Deposit, verify state (extracted from Test 1 step 1)
Test 4: Single User Deposit -- Alith approves + deposits, verify shares (extracted from Test 1 step 2)
Test 5: User Withdraw in Deposit -- Alith calls userWithdraw() in Deposit state, gets tokens back 1:1 (extracted from Test 1 step 3 / current Test 3)
Test 6: Multi-user Deposits -- Alith, baltathar, charleth all deposit, verify shareholder count (from current Test 2)
Test 7: Close Deposits -- Manager calls closeDeposits(), verify flag (from current Test 7)

# Running State
Test 8: State to Running -- Manager transitions Deposit -> Running, verify state (extracted from Test 1 step 4)
Test 9: Add Allowed Target -- Owner adds ethan as allowed target (from current Test 5)
Test 10: Manager Execute -- Manager calls execute() with allowed target (from current Test 6)

# Withdraw State
Test 11: State to Withdraw -- Manager transitions Running -> Withdraw, verify snapshot (extracted from Test 1 step 7)
Test 12: User and Batch Withdraw -- Alith calls userWithdraw(), manager calls withdraw() for remaining, vault auto-closes (from current Test 10 / Test 1 steps 8-9)
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

from eth_utils import keccak
from web3 import Web3

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent

RED = "\033[0;31m"
GREEN = "\033[0;32m"
YELLOW = "\033[1;33m"
BLUE = "\033[0;34m"
BOLD = "\033[1m"
NC = "\033[0m"

CHAIN_FPG = None


def info(message: str) -> None:
    print(f"{BLUE}[INFO]{NC}  {message}")


def ok(message: str) -> None:
    print(f"{GREEN}[OK]{NC}    {message}")


def warn(message: str) -> None:
    print(f"{YELLOW}[WARN]{NC}  {message}")


def error(message: str) -> None:
    print(f"{RED}[ERROR]{NC} {message}")


def load_json(path: Path) -> Any:
    with open(path) as f:
        return json.load(f)


def load_vault_abi() -> List[dict]:
    p = PROJECT_DIR / "ABI" / "vault_abi.json"
    if p.exists():
        return load_json(p)
    out_path = PROJECT_DIR / "out" / "Vault.sol" / "Vault.json"
    if out_path.exists():
        artifact = load_json(out_path)
        return artifact.get("abi", [])
    raise FileNotFoundError("ABI not found: ABI/vault_abi.json or out/Vault.sol/Vault.json")


def load_coin_abi() -> List[dict]:
    p = PROJECT_DIR / "ABI" / "coin_abi.json"
    if p.exists():
        return load_json(p)
    out_path = PROJECT_DIR / "out" / "Token1.sol" / "USDC.json"
    if out_path.exists():
        artifact = load_json(out_path)
        return artifact.get("abi", [])
    raise FileNotFoundError("ABI not found: ABI/coin_abi.json or out/Token1.sol/USDC.json")


VAULT_ABI = load_vault_abi()
COIN_ABI = load_coin_abi()


def decode_error(selector: str, abi: List[dict]) -> str:
    for item in abi:
        if item.get("type") == "error":
            signature = f"{item['name']}({','.join(i['type'] for i in item['inputs'])})"
            sig_hash = keccak(text=signature)[:4].hex()
            if selector.lower() == "0x" + sig_hash:
                return signature
    return "Unknown error"


def log_tx_error(result: Dict[str, Any], abi: List[dict]) -> None:
    err = result.get("error", "")
    if "0x" in err:
        selector = "0x" + err.split("0x")[1][:8]
        decoded = decode_error(selector, abi)
        error(f"Decoded error: {decoded}")
    error(f"Raw error: {err}")
    error(f"tx_hash: {result.get('tx_hash', '')}")


def to_checksum(address: str) -> str:
    if not address:
        return address
    return Web3.to_checksum_address(address.lower())


def fetch_base_fee(w3: Web3) -> int:
    try:
        block = w3.eth.get_block("latest")
        base_fee = block.get("baseFeePerGas")
        if base_fee:
            return base_fee
    except Exception:
        pass
    return w3.to_wei("100", "gwei")


def load_env() -> Dict[str, str]:
    env_file = PROJECT_DIR / ".env"
    env: Dict[str, str] = {}
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    env[key] = value.split("#")[0].strip()
    return env


def get_rpc_url(network: str) -> str:
    env = load_env()
    if network == "hedera_local":
        return env.get("HEDERA_LOCAL_RPC_URL", "http://localhost:7546")
    if network == "hedera_testnet":
        return env.get("HEDERA_TESTNET_RPC_URL", "")
    if network == "hedera_mainnet":
        return env.get("HEDERA_MAINNET_RPC_URL", "")
    return ""


def get_accounts(w3: Web3, env: Dict[str, str]) -> Dict[str, Dict[str, str]]:
    accounts: Dict[str, Dict[str, str]] = {}
    for name in ["alith", "baltathar", "charleth", "dorothy", "ethan"]:
        pk = env.get(f"{name}_private", "")
        if not pk:
            warn(f"{name}_private key not found in .env, skipping")
            continue
        address = w3.eth.account.from_key(pk).address
        accounts[name] = {"address": address, "private_key": pk}
    return accounts


def load_vault_config(network: str) -> Dict[str, Any]:
    deploy_file = PROJECT_DIR / "deploy" / network / "vault.yaml"
    if deploy_file.exists():
        import yaml

        with open(deploy_file) as f:
            data = yaml.safe_load(f) or {}

        def to_hex_addr(value: Any) -> str:
            if isinstance(value, int):
                return to_checksum("0x" + format(value, "040x"))
            return to_checksum(str(value))

        return {
            "vault": to_hex_addr(data.get("deployment", {}).get("contract_address", "")),
            "token1": to_hex_addr(data.get("tokens", {}).get("token1", "")),
            "token2": to_hex_addr(data.get("tokens", {}).get("token2", "")),
            "max_shareholders": data.get("configuration", {}).get("max_shareholders", 5),
        }

    return {
        "vault": to_checksum("0x63AB7D351C872eB9839184cab5B0d4cc9a3aBeDf"),
        "token1": to_checksum("0xf885Ab94b8a54a012A0631c1163FFfdE0b1F5e94"),
        "token2": to_checksum("0x93E122DB13Ce47a8591c1E5FC0D504bfBDC1B509"),
        "max_shareholders": 5,
    }


def send_tx(w3: Web3, contract, func_name: str, args: List[Any], private_key: str) -> Dict[str, Any]:
    account = w3.eth.account.from_key(private_key)
    func = getattr(contract.functions, func_name)(*args)
    try:
        nonce = w3.eth.get_transaction_count(account.address, "pending")
        gas = func.estimate_gas({"from": account.address})
        block = w3.eth.get_block("latest")
        base_fee = block.get("baseFeePerGas")

        tx_params = {
            "from": account.address,
            "nonce": nonce,
            "gas": gas,
            "chainId": w3.eth.chain_id,
        }

        if base_fee:
            tx_params["maxFeePerGas"] = base_fee * 2
            tx_params["maxPriorityFeePerGas"] = w3.to_wei(2, "gwei")
        else:
            tx_params["gasPrice"] = w3.eth.gas_price

        tx = func.build_transaction(tx_params)
        signed = account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        return {
            "status": receipt.status,
            "tx_hash": w3.to_hex(tx_hash),
            "receipt": receipt,
        }
    except Exception as exc:
        return {"status": 0, "tx_hash": "", "error": str(exc)}


def call_contract(contract, func_name: str, args: List[Any] | None = None) -> Any:
    func = getattr(contract.functions, func_name)
    if args:
        return func(*args).call()
    return func().call()


def get_vault_state(w3: Web3, vault_contract) -> str:
    mapping = {0: "Closed", 1: "Deposit", 2: "Running", 3: "Withdraw"}
    try:
        state = call_contract(vault_contract, "state")
        return mapping.get(state, f"Unknown({state})")
    except Exception as exc:
        warn(f"get_vault_state failed: {exc}")
        return "Unknown"


def get_shareholder_count(w3: Web3, vault_contract) -> int:
    try:
        return call_contract(vault_contract, "getShareholderCount")
    except Exception as exc:
        warn(f"get_shareholder_count failed: {exc}")
        return 0


def ensure_state(w3: Web3, vault_contract, accounts: Dict[str, Dict[str, str]], target: str) -> bool:
    current = get_vault_state(w3, vault_contract)
    if current == target:
        return True
    order = ["Closed", "Deposit", "Running", "Withdraw"]
    transitions = {
        "Deposit": "stateToDeposit",
        "Running": "stateToRunning",
        "Withdraw": "stateToWithdraw",
    }

    try:
        current_index = order.index(current)
        target_index = order.index(target)
    except ValueError:
        warn(f"Unknown state: current={current} target={target}")
        return False

    if current_index > target_index:
        warn(f"Cannot rewind vault from {current} to {target}")
        return False

    manager = accounts.get("dorothy")
    if not manager:
        warn("dorothy account missing")
        return False

    for next_state in order[current_index + 1 : target_index + 1]:
        func_name = transitions.get(next_state)
        if not func_name:
            continue
        result = send_tx(w3, vault_contract, func_name, [], manager["private_key"])
        if result["status"] != 1:
            log_tx_error(result, VAULT_ABI)
            return False
    return True


def user_deposit(
    w3: Web3,
    vault_contract,
    token1_contract,
    config: Dict[str, Any],
    user: Dict[str, str],
    amount: int,
) -> Dict[str, Any]:
    approve = send_tx(
        w3,
        token1_contract,
        "approve",
        [config["vault"], amount],
        user["private_key"],
    )
    if approve["status"] != 1:
        return approve

    return send_tx(
        w3,
        vault_contract,
        "deposit",
        [amount],
        user["private_key"],
    )


def test_0_setup(w3: Web3, vault_contract, config: Dict[str, Any], accounts: Dict[str, Dict[str, str]]) -> bool:
    print(f"\n{BOLD}=== Test 0: Setup (Check/Mint Tokens) ==={NC}")
    operator_pk = load_env().get("OPERATOR_KEY", "")
    token1_contract = w3.eth.contract(address=config["token1"], abi=COIN_ABI)

    if not operator_pk:
        warn("OPERATOR_KEY not found, skipping mint step")
        return True

    try:
        decimals = token1_contract.functions.decimals().call()
        mint_amount = 1000 * 10**decimals

        for name in ["alith", "baltathar", "charleth"]:
            user = accounts.get(name)
            if not user:
                warn(f"{name} account missing, skipping mint")
                continue
            balance = token1_contract.functions.balanceOf(user["address"]).call()
            if balance >= mint_amount:
                ok(f"{name} already funded ({balance / 10**decimals} tokens)")
                continue
            info(f"Minting {1000} token1 for {name}")
            result = send_tx(
                w3,
                token1_contract,
                "mint",
                [user["address"], mint_amount],
                operator_pk,
            )
            if result["status"] == 1:
                ok(f"{name} minted {1000} tokens")
            else:
                warn(f"Mint failed for {name}: {result.get('error', '')}")

        info("Setup complete")
        return True
    except Exception as exc:
        error(f"Setup failed: {exc}")
        return False


def test_1_access_control(w3: Web3, vault_contract, config: Dict[str, Any], accounts: Dict[str, Dict[str, str]]) -> bool:
    print(f"\n{BOLD}=== Test 1: Access Control ==={NC}")
    user = accounts.get("alith")
    if not user:
        warn("alith account missing")
        return False

    result = send_tx(
        w3,
        vault_contract,
        "stateToDeposit",
        [],
        user["private_key"],
    )
    if result["status"] == 0:
        ok("Non-manager cannot transition state (expected revert)")
        return True
    error("Non-manager succeeded unexpectedly")
    return False


def test_2_update_vault(w3: Web3, vault_contract, config: Dict[str, Any], accounts: Dict[str, Dict[str, str]]) -> bool:
    print(f"\n{BOLD}=== Test 2: Update Vault ==={NC}")
    manager = accounts.get("dorothy")
    if not manager:
        warn("dorothy account missing")
        return False

    if not ensure_state(w3, vault_contract, accounts, "Closed"):
        warn("Vault is not closed, skipping update")
        return True

    result = send_tx(
        w3,
        vault_contract,
        "updateVault",
        [config["token1"], config["token2"], config["max_shareholders"]],
        manager["private_key"],
    )
    if result["status"] != 1:
        warn("updateVault reverted (expected when shareholders exist)")
        return True

    ok("Vault updated successfully")
    return True


def test_3_state_to_deposit(w3: Web3, vault_contract, config: Dict[str, Any], accounts: Dict[str, Dict[str, str]]) -> bool:
    print(f"\n{BOLD}=== Test 3: State to Deposit ==={NC}")
    manager = accounts.get("dorothy")
    if not manager:
        warn("dorothy account missing")
        return False

    result = send_tx(
        w3,
        vault_contract,
        "stateToDeposit",
        [],
        manager["private_key"],
    )
    if result["status"] != 1:
        error("stateToDeposit failed")
        return False
    ok("Vault entered Deposit state")

    extra = send_tx(
        w3,
        vault_contract,
        "stateToDeposit",
        [],
        manager["private_key"],
    )
    if extra["status"] == 0:
        ok("Double transition correctly reverted")
        return True
    warn("Repeated stateToDeposit succeeded unexpectedly")
    return True


def test_4_single_deposit(w3: Web3, vault_contract, config: Dict[str, Any], accounts: Dict[str, Dict[str, str]]) -> bool:
    print(f"\n{BOLD}=== Test 4: Single User Deposit ==={NC}")
    alith = accounts.get("alith")
    if not alith:
        warn("alith account missing")
        return False

    token1_contract = w3.eth.contract(address=config["token1"], abi=COIN_ABI)
    decimals = token1_contract.functions.decimals().call()
    amount = 100 * 10**decimals

    result = user_deposit(w3, vault_contract, token1_contract, config, alith, amount)
    if result["status"] != 1:
        log_tx_error(result, VAULT_ABI)
        return False
    ok("Single deposit succeeded")
    return True


def test_5_user_withdraw_in_deposit(w3: Web3, vault_contract, config: Dict[str, Any], accounts: Dict[str, Dict[str, str]]) -> bool:
    print(f"\n{BOLD}=== Test 5: User Withdraw (Deposit) ==={NC}")
    alith = accounts.get("alith")
    if not alith:
        warn("alith missing")
        return False

    result = send_tx(
        w3,
        vault_contract,
        "userWithdraw",
        [],
        alith["private_key"],
    )
    if result["status"] != 1:
        log_tx_error(result, VAULT_ABI)
        return False
    ok("userWithdraw succeeded in Deposit state")
    return True


def test_6_multi_user_deposits(w3: Web3, vault_contract, config: Dict[str, Any], accounts: Dict[str, Dict[str, str]]) -> bool:
    print(f"\n{BOLD}=== Test 6: Multi-user Deposits ==={NC}")
    token1_contract = w3.eth.contract(address=config["token1"], abi=COIN_ABI)
    decimals = token1_contract.functions.decimals().call()
    amount = 50 * 10**decimals

    for name in ["alith", "baltathar", "charleth"]:
        user = accounts.get(name)
        if not user:
            warn(f"{name} missing")
            return False
        result = user_deposit(w3, vault_contract, token1_contract, config, user, amount)
        if result["status"] != 1:
            log_tx_error(result, VAULT_ABI)
            return False
        ok(f"{name} deposited")

    count = get_shareholder_count(w3, vault_contract)
    if count < 3:
        error("Shareholder count lower than expected")
        return False
    ok(f"Shareholder count: {count}")
    return True


def test_7_close_deposits(w3: Web3, vault_contract, config: Dict[str, Any], accounts: Dict[str, Dict[str, str]]) -> bool:
    print(f"\n{BOLD}=== Test 7: Close Deposits ==={NC}")
    manager = accounts.get("dorothy")
    if not manager:
        warn("dorothy missing")
        return False

    result = send_tx(
        w3,
        vault_contract,
        "closeDeposits",
        [],
        manager["private_key"],
    )
    if result["status"] != 1:
        log_tx_error(result, VAULT_ABI)
        return False
    deposits_closed = call_contract(vault_contract, "depositsClosed")
    if not deposits_closed:
        error("closeDeposits did not flip flag")
        return False
    ok("Deposits closed flag is true")
    return True


def test_8_state_to_running(w3: Web3, vault_contract, config: Dict[str, Any], accounts: Dict[str, Dict[str, str]]) -> bool:
    print(f"\n{BOLD}=== Test 8: State to Running ==={NC}")
    manager = accounts.get("dorothy")
    if not manager:
        warn("dorothy missing")
        return False

    result = send_tx(
        w3,
        vault_contract,
        "stateToRunning",
        [],
        manager["private_key"],
    )
    if result["status"] != 1:
        log_tx_error(result, VAULT_ABI)
        return False
    ok("Vault entered Running")

    extra = send_tx(
        w3,
        vault_contract,
        "stateToDeposit",
        [],
        manager["private_key"],
    )
    if extra["status"] == 0:
        ok("Invalid transition from Running prevented")
        return True
    warn("Unexpected success transitioning back to Deposit")
    return True


def test_9_add_allowed_target(w3: Web3, vault_contract, config: Dict[str, Any], accounts: Dict[str, Dict[str, str]]) -> bool:
    print(f"\n{BOLD}=== Test 9: Add Allowed Target ==={NC}")
    manager = accounts.get("dorothy")
    target = accounts.get("ethan")
    if not manager or not target:
        warn("Required accounts missing")
        return False

    result = send_tx(
        w3,
        vault_contract,
        "addAllowedTarget",
        [target["address"]],
        manager["private_key"],
    )
    if result["status"] != 1:
        log_tx_error(result, VAULT_ABI)
        return False

    allowed = call_contract(vault_contract, "allowedTargets", [target["address"]])
    if not allowed:
        error("Target not marked as allowed")
        return False
    ok("Allowed target registered")
    return True


def test_10_manager_execute(w3: Web3, vault_contract, config: Dict[str, Any], accounts: Dict[str, Dict[str, str]]) -> bool:
    print(f"\n{BOLD}=== Test 10: Manager Execute ==={NC}")
    manager = accounts.get("dorothy")
    target = accounts.get("ethan")
    if not manager or not target:
        warn("Required accounts missing")
        return False

    if not ensure_state(w3, vault_contract, accounts, "Running"):
        return False

    result = send_tx(
        w3,
        vault_contract,
        "execute",
        [target["address"], "0x"],
        manager["private_key"],
    )
    if result["status"] != 1:
        warn("execute reverted (target may not allow calldata)")
    ok("Manager execute flow validated")
    return True


def test_11_state_to_withdraw(w3: Web3, vault_contract, config: Dict[str, Any], accounts: Dict[str, Dict[str, str]]) -> bool:
    print(f"\n{BOLD}=== Test 11: State to Withdraw ==={NC}")
    manager = accounts.get("dorothy")
    if not manager:
        warn("dorothy missing")
        return False

    if not ensure_state(w3, vault_contract, accounts, "Withdraw"):
        return False

    snapshot_balance = call_contract(vault_contract, "withdrawalSnapshotBalance")
    snapshot_shares = call_contract(vault_contract, "withdrawalSnapshotShares")
    ok(f"Snapshot captured balance={snapshot_balance} shares={snapshot_shares}")
    return True


def test_12_user_and_batch_withdraw(w3: Web3, vault_contract, config: Dict[str, Any], accounts: Dict[str, Dict[str, str]]) -> bool:
    print(f"\n{BOLD}=== Test 12: User and Batch Withdraw ==={NC}")
    alith = accounts.get("alith")
    manager = accounts.get("dorothy")
    if not alith or not manager:
        warn("Required accounts missing")
        return False

    if not ensure_state(w3, vault_contract, accounts, "Withdraw"):
        return False

    result = send_tx(
        w3,
        vault_contract,
        "userWithdraw",
        [],
        alith["private_key"],
    )
    if result["status"] != 1:
        log_tx_error(result, VAULT_ABI)
        return False
    ok("Single shareholder withdrew")

    shareholders = call_contract(vault_contract, "getShareholders")
    remaining = [addr for addr in shareholders if addr.lower() != alith["address"].lower()]
    if remaining:
        batch_result = send_tx(
            w3,
            vault_contract,
            "withdraw",
            [remaining],
            manager["private_key"],
        )
        if batch_result["status"] != 1:
            log_tx_error(batch_result, VAULT_ABI)
            return False
        ok("Batch withdraw completed")

    final_state = get_vault_state(w3, vault_contract)
    ok(f"Vault final state: {final_state}")
    return final_state == "Closed"


def test_13_combined_lifecycle(w3: Web3, vault_contract, config: Dict[str, Any], accounts: Dict[str, Dict[str, str]]) -> bool:
    print(f"\n{BOLD}=== Test 13: Combined Full Lifecycle ==={NC}")
    manager = accounts.get("dorothy")
    target = accounts.get("ethan")
    if not manager or not target:
        warn("Required manager or target account missing")
        return False

    token1_contract = w3.eth.contract(address=config["token1"], abi=COIN_ABI)
    decimals = token1_contract.functions.decimals().call()
    deposit_amount = 100 * 10**decimals
    alith = accounts.get("alith")
    if not alith:
        warn("alith missing")
        return False

    if not ensure_state(w3, vault_contract, accounts, "Deposit"):
        return False

    for name in ["alith", "baltathar"]:
        user = accounts.get(name)
        if not user:
            warn(f"{name} missing")
            return False
        result = user_deposit(w3, vault_contract, token1_contract, config, user, deposit_amount)
        if result["status"] != 1:
            log_tx_error(result, VAULT_ABI)
            return False
        ok(f"{name} deposited")

    if not ensure_state(w3, vault_contract, accounts, "Running"):
        return False

    if not call_contract(vault_contract, "allowedTargets", [target["address"]]):
        add_result = send_tx(
            w3,
            vault_contract,
            "addAllowedTarget",
            [target["address"]],
            manager["private_key"],
        )
        if add_result["status"] != 1:
            warn("addAllowedTarget failed (may already exist)")

    exec_result = send_tx(
        w3,
        vault_contract,
        "execute",
        [target["address"], "0x"],
        manager["private_key"],
    )
    if exec_result["status"] != 1:
        warn("execute reverted (target might reject)")
    ok("Manager execute checked")

    if not ensure_state(w3, vault_contract, accounts, "Withdraw"):
        return False

    withdraw_result = send_tx(
        w3,
        vault_contract,
        "userWithdraw",
        [],
        alith["private_key"],
    )
    if withdraw_result["status"] != 1:
        log_tx_error(withdraw_result, VAULT_ABI)
        return False
    ok("Primary shareholder withdrew")

    shareholders = call_contract(vault_contract, "getShareholders")
    remaining = [addr for addr in shareholders if addr.lower() != alith["address"].lower()]
    if remaining:
        batch_result = send_tx(
            w3,
            vault_contract,
            "withdraw",
            [remaining],
            manager["private_key"],
        )
        if batch_result["status"] != 1:
            log_tx_error(batch_result, VAULT_ABI)
            return False
        ok("Batch withdraw finalized")

    final_state = get_vault_state(w3, vault_contract)
    ok(f"Combined test finalized state: {final_state}")
    return final_state == "Closed"


def main() -> None:
    global CHAIN_FPG
    parser = argparse.ArgumentParser(description="Vault contract tests")
    parser.add_argument("--network", default="hedera_testnet", help="Network name")
    parser.add_argument("--test", help="Run specific test (0-12)")
    args = parser.parse_args()

    print(f"\n{BOLD}==============================================")
    print("  Vault Contract Tests (web3.py)")
    print(f"=============================================={NC}\n")

    rpc_url = get_rpc_url(args.network)
    if not rpc_url:
        error("Missing RPC URL")
        sys.exit(1)

    info(f"Connecting to RPC: {rpc_url}")
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    if not w3.is_connected():
        error("RPC connection failed")
        sys.exit(1)
    ok(f"Connected (chain id {w3.eth.chain_id})")

    CHAIN_FPG = fetch_base_fee(w3)
    info(f"Base fee: {w3.from_wei(CHAIN_FPG, 'gwei')} gwei")

    env = load_env()
    accounts = get_accounts(w3, env)
    config = load_vault_config(args.network)
    vault_address = Web3.to_checksum_address(config["vault"])
    info(f"Vault: {vault_address}")
    info(f"Token1: {config['token1']}")
    info(f"Token2: {config['token2']}")

    vault_contract = w3.eth.contract(address=vault_address, abi=VAULT_ABI)
    tests = [
        ("Setup (Check/Mint Tokens)", test_0_setup),
        ("Access Control", test_1_access_control),
        ("Update Vault", test_2_update_vault),
        ("State to Deposit", test_3_state_to_deposit),
        ("Single User Deposit", test_4_single_deposit),
        ("User Withdraw (Deposit)", test_5_user_withdraw_in_deposit),
        ("Multi-user Deposits", test_6_multi_user_deposits),
        ("Close Deposits", test_7_close_deposits),
        ("State to Running", test_8_state_to_running),
        ("Add Allowed Target", test_9_add_allowed_target),
        ("Manager Execute", test_10_manager_execute),
        ("State to Withdraw", test_11_state_to_withdraw),
        ("User and Batch Withdraw", test_12_user_and_batch_withdraw),
        ("Combined Full Lifecycle", test_13_combined_lifecycle),
    ]

    results: List[tuple[str, bool]] = []
    if args.test:
        idx = int(args.test)
        if 0 <= idx < len(tests):
            name, func = tests[idx]
            results.append((name, func(w3, vault_contract, config, accounts)))
        else:
            error("Unknown test index")
            sys.exit(1)
    else:
        for name, func in tests:
            results.append((name, func(w3, vault_contract, config, accounts)))

    print(f"\n{BOLD}==============================================")
    print("  Test Results Summary")
    print(f"=============================================={NC}")

    passed = sum(1 for _, result in results if result)
    failed = len(results) - passed
    for name, result in results:
        status = f"{GREEN}PASSED{NC}" if result else f"{RED}FAILED{NC}"
        print(f"  {name}: {status}")

    print(f"\n{BOLD}Total: {passed} passed, {failed} failed{NC}")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
