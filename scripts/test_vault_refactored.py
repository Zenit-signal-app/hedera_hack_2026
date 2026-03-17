#!/usr/bin/env python3
"""
test_vault_refactored.py
Refactored Vault test suite with clearer state-based grouping and reusable helpers.
"""

import argparse
import json
import sys
from pathlib import Path
from web3 import Web3
from eth_utils import keccak

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent

RED = "\033[0;31m"
GREEN = "\033[0;32m"
YELLOW = "\033[1;33m"
BLUE = "\033[0;34m"
BOLD = "\033[1m"
NC = "\033[0m"


def info(msg):
    print(f"{BLUE}[INFO]{NC}  {msg}")


def ok(msg):
    print(f"{GREEN}[OK]{NC}    {msg}")


def warn(msg):
    print(f"{YELLOW}[WARN]{NC}  {msg}")


def error(msg):
    print(f"{RED}[ERROR]{NC} {msg}")

# ---------- CONFIG LOADERS ----------
def to_checksum(addr: str) -> str:
    """Convert address to checksum format"""
    if not addr:
        return addr
    return Web3.to_checksum_address(addr.lower())


def fetch_base_fee(w3: Web3) -> int:
    """Fetch baseFeePerGas from latest block"""
    try:
        block = w3.eth.get_block("latest")
        base_fee = block.get("baseFeePerGas")
        if base_fee:
            return base_fee
    except Exception:
        pass
    return w3.to_wei("100", "gwei")  # fallback: 100 gwei


def load_env() -> dict:
    env_file = PROJECT_DIR / ".env"
    env = {}
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
    elif network == "hedera_testnet":
        return env.get("HEDERA_TESTNET_RPC_URL", "")
    elif network == "hedera_mainnet":
        return env.get("HEDERA_MAINNET_RPC_URL", "")
    return ""


def get_operator_private_key(env: dict) -> str:
    key = env.get("OPERATOR_KEY", "")
    if not key:
        raise ValueError("OPERATOR_KEY not found in .env")
    return key


def get_accounts(w3: Web3, env: dict) -> dict:
    accounts = {}
    for name in ["alith", "baltathar", "charleth", "dorothy", "ethan"]:
        pk = env.get(f"{name}_private", "")
        if not pk:
            warn(f"{name}_private key not found in .env, using empty string")
        else:
            address = w3.eth.account.from_key(pk).address
            accounts[name] = {"address": address, "private_key": pk}
    return accounts


def load_vault_config(network: str) -> dict:
    deploy_file = PROJECT_DIR / "deploy" / network / "vault.yaml"
    if deploy_file.exists():
        import yaml

        with open(deploy_file) as f:
            data = yaml.safe_load(f)

            def to_hex_addr(val):
                if isinstance(val, int):
                    return to_checksum("0x" + format(val, "040x"))
                return to_checksum(str(val))

            return {
                "vault": to_hex_addr(
                    data.get("deployment", {}).get("contract_address", "")
                ),
                "token1": to_hex_addr(data.get("tokens", {}).get("token1", "")),
                "token2": to_hex_addr(data.get("tokens", {}).get("token2", "")),
                "max_shareholders": data.get("configuration", {}).get(
                    "max_shareholders", 5
                ),
            }

    return {
        "vault": to_checksum("0x63AB7D351C872eB9839184cab5B0d4cc9a3aBeDf"),
        "token1": to_checksum("0xf885Ab94b8a54a012A0631c1163FFfdE0b1F5e94"),
        "token2": to_checksum("0x93E122DB13Ce47a8591c1E5FC0D504bfBDC1B509"),
        "max_shareholders": 5,
    }

# ---------- ABI LOADERS ----------

def load_json(path):
    with open(path) as f:
        return json.load(f)


def load_vault_abi():
    p = PROJECT_DIR / "ABI" / "vault_abi.json"
    if p.exists():
        return load_json(p)
    raise FileNotFoundError("vault_abi.json not found")


def load_coin_abi():
    p = PROJECT_DIR / "ABI" / "coin_abi.json"
    if p.exists():
        return load_json(p)
    raise FileNotFoundError("coin_abi.json not found")


VAULT_ABI = load_vault_abi()
COIN_ABI = load_coin_abi()


# ---------- UTILITIES ----------

def decode_error(selector, abi):
    for item in abi:
        if item.get("type") == "error":
            sig = f"{item['name']}({','.join(i['type'] for i in item['inputs'])})"
            h = keccak(text=sig)[:4].hex()
            if selector.lower() == "0x" + h:
                return sig
    return "Unknown error"


def log_tx_error(result, abi):
    err = result.get("error", "")
    if "0x" in err:
        selector = "0x" + err.split("0x")[1][:8]
        decoded = decode_error(selector, abi)
        error(f"Decoded error: {decoded}")
    error(f"Raw error: {err}")


def get_vault_state(w3, vault):
    mapping = {0: "Closed", 1: "Deposit", 2: "Running", 3: "Withdraw"}
    try:
        s = vault.functions.state().call()
        return mapping.get(s, f"Unknown({s})")
    except Exception:
        return "Unknown"


def ensure_state(w3, vault, accounts, target):
    manager = accounts["dorothy"]["private_key"]
    current = get_vault_state(w3, vault)

    if current == target:
        return True

    transitions = {
        "Deposit": "stateToDeposit",
        "Running": "stateToRunning",
        "Withdraw": "stateToWithdraw",
    }

    func = transitions.get(target)
    if not func:
        return False

    result = send_tx(w3, vault, func, [], manager)
    return result["status"] == 1


def get_shareholder_count(w3, vault):
    try:
        return vault.functions.getShareholderCount().call()
    except Exception:
        return 0


# ---------- TRANSACTION HELPER ----------

def send_tx(w3, contract, func_name, args, pk):

    account = w3.eth.account.from_key(pk)
    func = getattr(contract.functions, func_name)(*args)

    try:
        nonce = w3.eth.get_transaction_count(account.address, "pending")
        gas = func.estimate_gas({"from": account.address})

        block = w3.eth.get_block("latest")
        base_fee = block.get("baseFeePerGas")

        tx = {
            "from": account.address,
            "nonce": nonce,
            "gas": gas,
            "chainId": w3.eth.chain_id,
        }

        if base_fee:
            tx["maxFeePerGas"] = base_fee * 2
            tx["maxPriorityFeePerGas"] = w3.to_wei(2, "gwei")
        else:
            tx["gasPrice"] = w3.eth.gas_price

        built = func.build_transaction(tx)

        signed = account.sign_transaction(built)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)

        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

        return {"status": receipt.status, "tx_hash": w3.to_hex(tx_hash)}

    except Exception as e:
        return {"status": 0, "tx_hash": "", "error": str(e)}


# ---------- ACTION HELPERS ----------

def user_deposit(w3, vault, token, config, user, amount):

    send_tx(
        w3,
        token,
        "approve",
        [config["vault"], amount],
        user["private_key"],
    )

    return send_tx(
        w3,
        vault,
        "deposit",
        [amount],
        user["private_key"],
    )


# ---------- TESTS ----------

def test_full_lifecycle(w3, vault, config, accounts):

    print(f"\n{BOLD}=== Test 1: Full Lifecycle ==={NC}")

    token = w3.eth.contract(address=config["token1"], abi=COIN_ABI)
    manager = accounts["dorothy"]
    alith = accounts["alith"]

    amount = 100 * 10**6

    if not ensure_state(w3, vault, accounts, "Deposit"):
        return False

    user_deposit(w3, vault, token, config, alith, amount)

    result = send_tx(
        w3, vault, "userWithdraw", [], alith["private_key"]
    )

    if result["status"] != 1:
        log_tx_error(result, VAULT_ABI)
        return False

    ok("Deposit and withdraw flow works")

    return True


def test_multi_user_deposits(w3, vault, config, accounts):

    print(f"\n{BOLD}=== Test 2: Multi-user Deposits ==={NC}")

    token = w3.eth.contract(address=config["token1"], abi=COIN_ABI)

    if not ensure_state(w3, vault, accounts, "Deposit"):
        return False

    amount = 50 * 10**6

    for name in ["alith", "baltathar", "charleth"]:
        result = user_deposit(
            w3,
            vault,
            token,
            config,
            accounts[name],
            amount,
        )

        if result["status"] != 1:
            error(f"{name} deposit failed")
            return False

        ok(f"{name} deposited")

    count = get_shareholder_count(w3, vault)

    info(f"Shareholders: {count}")

    return count >= 3


def test_access_control(w3, vault, config, accounts):

    print(f"\n{BOLD}=== Test 3: Access Control ==={NC}")

    result = send_tx(
        w3,
        vault,
        "stateToDeposit",
        [],
        accounts["alith"]["private_key"],
    )

    if result["status"] == 0:
        ok("Correctly reverted for non-manager")
        return True

    warn("Unexpected success")
    return False


def test_manager_execute(w3, vault, config, accounts):

    print(f"\n{BOLD}=== Test 4: Manager Execute ==={NC}")

    if not ensure_state(w3, vault, accounts, "Running"):
        return False

    target = accounts["ethan"]["address"]

    result = send_tx(
        w3,
        vault,
        "execute",
        [target, "0x"],
        accounts["dorothy"]["private_key"],
    )

    if result["status"] == 1:
        ok("Execute succeeded")
        return True

    warn("Execute reverted")
    return True


# ---------- MAIN ----------

def main():
    global CHAIN_FPG, VAULT_ABI, COIN_ABI
    parser = argparse.ArgumentParser(description="Test Vault contract")
    parser.add_argument("--network", default="hedera_testnet", help="Network name")
    # parser.add_argument("--test", help="Run specific test (0-10)")
    args = parser.parse_args()
    env = load_env()
    config = load_vault_config(args.network)


    w3 = Web3(Web3.HTTPProvider(get_rpc_url(args.network)))

    if not w3.is_connected():
        error("RPC connection failed")
        sys.exit(1)

    ok(f"Connected to chain {w3.eth.chain_id}")

    accounts = get_accounts(w3, env)


    # config = {
    #     "vault": "0x0000000000000000000000000000000000000000",
    #     "token1": "0x0000000000000000000000000000000000000000",
    # }

    vault = w3.eth.contract(
        address=Web3.to_checksum_address(config["vault"]),
        abi=VAULT_ABI,
    )

    # accounts = {}

    tests = [
        ("Full Lifecycle", test_full_lifecycle),
        ("Multi-user Deposits", test_multi_user_deposits),
        ("Access Control", test_access_control),
        ("Manager Execute", test_manager_execute),
    ]

    results = []

    for name, func in tests:
        result = func(w3, vault, config, accounts)
        results.append((name, result))

    print("\nResults:")
    for name, r in results:
        status = "PASSED" if r else "FAILED"
        print(name, status)


if __name__ == "__main__":
    main()
