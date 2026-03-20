#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

from eth_utils.crypto import keccak
from lib.balance import get_native_balance, get_token_balance_with_assoc
from lib.config import get_operator_private_key, get_rpc_url
from lib.erc20 import approve, check_allowance, get_token_info, mint, transfer
from lib.eth import get_web3
from lib.hts import is_hts_token
from lib.ss58 import (
    chain_id_to_network,
    prefix_to_network,
    ss58_decode_to_h160,
    ss58_encode_h160,
)
from lib.utils import format_units, parse_token_amounts, to_checksum
from tabulate import tabulate
from web3 import Web3

NETWORK_CHOICES = ["hedera_local", "hedera_testnet", "hedera_mainnet", "custom"]

RED = "\033[0;31m"
GREEN = "\033[0;32m"
YELLOW = "\033[1;33m"
BLUE = "\033[0;34m"
BOLD = "\033[1m"
NC = "\033[0m"


def info(msg: str) -> None:
    print(f"{BLUE}[INFO]{NC}  {msg}")


def ok(msg: str) -> None:
    print(f"{GREEN}[OK]{NC}    {msg}")


def error(msg: str) -> None:
    print(f"{RED}[ERROR]{NC} {msg}")


def warn(msg: str) -> None:
    print(f"{YELLOW}[WARN]{NC}  {msg}")


def decode_error(selector: str, abi):
    try:
        for item in abi:
            if item.get("type") == "error":
                signature = f"{item['name']}({','.join(i['type'] for i in item['inputs'])})"
                sig_hash = keccak(text=signature)[:4].hex()
                if selector.lower() == "0x" + sig_hash:
                    return signature
    except Exception:
        pass
    return "Unknown error"


def log_tx_error(result, abi):
    err = result.get("error", "")
    if "0x" in err:
        selector = "0x" + err.split("0x")[1][:8]
        decoded = decode_error(selector, abi)
        error(f"Decoded error: {decoded}")
    error(f"Raw error: {err}")
    error(f"tx_hash: {result.get('tx_hash', '')}")


def send_tx(w3: Web3, contract, func_name: str, args: list, private_key: str):
    """Send a transaction with proper gas estimation and EIP-1559"""
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

    except Exception as e:
        return {"status": 0, "tx_hash": "", "error": str(e)}


def call_contract(w3: Web3, contract, func_name: str, args: list | None = None) -> any:
    """Make a view/pure call"""
    func = getattr(contract.functions, func_name)
    if args:
        return func(*args).call()
    return func().call()


def format_balance(wei: int) -> str:
    hbar = wei / 1e18
    return f"{hbar:.6f} HBAR (18 decimals)"


def add_network_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--network",
        default="hedera_testnet",
        choices=NETWORK_CHOICES,
        help="Network name from .env mapping",
    )
    parser.add_argument("--rpc-url", help="Optional RPC URL override")


def _load_network_tokens(network: str) -> dict[str, str]:
    cfg_path = Path(__file__).resolve().parents[1] / "config" / "vaultConfig.json"
    if not cfg_path.exists():
        raise FileNotFoundError(f"Missing config file: {cfg_path}")

    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    if network not in cfg:
        raise ValueError(f"Network '{network}' not found in config")

    tokens = cfg[network]
    if "token1" not in tokens or "token2" not in tokens:
        raise ValueError(f"Network '{network}' is missing token1/token2 in config")
    return tokens


def cmd_ss58_encode(args: argparse.Namespace) -> None:
    ss58 = ss58_encode_h160(args.address, args.prefix)
    print(
        json.dumps(
            {
                "h160": args.address,
                "ss58": ss58,
                "prefix": args.prefix,
                "network": prefix_to_network(args.prefix),
            }
        )
    )


def cmd_ss58_decode(args: argparse.Namespace) -> None:
    prefix, public_key_hex, h160 = ss58_decode_to_h160(args.address)
    print(
        json.dumps(
            {
                "ss58": args.address,
                "prefix": prefix,
                "network": prefix_to_network(prefix),
                "publicKeyHex": public_key_hex,
                "h160": h160,
            }
        )
    )


def cmd_show_address(args: argparse.Namespace) -> None:
    priv_key = get_operator_private_key(args.private_key)
    # Use Web3.eth.account directly to avoid needing a connected RPC provider
    from eth_account import Account

    account = Account.from_key(priv_key)
    print(
        json.dumps(
            {
                "address": account.address,
                "private_key_used": priv_key[:6] + "..." + priv_key[-4:] if priv_key else "None",
            },
            indent=2,
        )
    )


def cmd_chain_info(args: argparse.Namespace) -> None:
    rpc_url = get_rpc_url(args.network, args.rpc_url)
    w3 = get_web3(rpc_url)
    chain_id = int(w3.eth.chain_id)
    block_number = int(w3.eth.block_number)
    net_version = str(w3.net.version)

    print(
        json.dumps(
            {
                "rpcUrl": rpc_url,
                "chainId": chain_id,
                "chainIdHex": hex(chain_id),
                "networkVersion": net_version,
                "latestBlock": block_number,
                "networkName": chain_id_to_network(chain_id),
            }
        )
    )


def cmd_check_balance(args: argparse.Namespace) -> None:
    wallet = to_checksum(args.wallet)
    rpc_url = get_rpc_url(args.network, args.rpc_url)
    w3 = get_web3(rpc_url)
    chain_id = int(w3.eth.chain_id)

    native_raw = get_native_balance(w3, wallet)
    native_fmt = Web3.from_wei(native_raw, "ether")

    tokens = _load_network_tokens(args.network)

    rows = [["NATIVE", "HBAR", "-", "-", str(native_fmt), "-"]]
    for key in ["token1", "token2"]:
        token = to_checksum(tokens[key])
        if token == "0x0000000000000000000000000000000000000000":
            continue

        hts_flag = is_hts_token(w3, token, args.network)

        try:
            info = get_token_info(w3, token, args.network)
            bal_raw, is_associated = get_token_balance_with_assoc(w3, token, wallet, args.network)
            bal_fmt = format_units(int(bal_raw), int(info["decimals"]))
            supply_fmt = format_units(int(info["total_supply"]), int(info["decimals"]))

            symbol = str(info["symbol"])
            if hts_flag and not is_associated:
                symbol += " (unassociated)"

            rows.append(
                [
                    token,
                    symbol,
                    str(info["name"]),
                    str(info["decimals"]),
                    bal_fmt,
                    supply_fmt,
                ]
            )
        except Exception:
            rows.append([token, "?", "?", "?", "?", "?"])

    threshold = int(args.min_threshold_wei) if args.min_threshold_wei is not None else 0
    sufficient = native_raw >= threshold

    if args.json:
        print(
            json.dumps(
                {
                    "address": wallet,
                    "balanceWei": str(native_raw),
                    "thresholdWei": str(threshold),
                    "sufficient": sufficient,
                    "balanceFormatted": format_balance(native_raw),
                    "thresholdFormatted": format_balance(threshold),
                }
            )
        )
        if args.min_threshold_wei is not None and not sufficient:
            raise SystemExit(2)
        return

    print(f"Wallet: {wallet}")
    print(f"Network: {args.network} | RPC: {rpc_url} | Chain ID: {chain_id}")
    print(
        tabulate(
            rows,
            headers=[
                "Token/Contract",
                "Symbol",
                "Name",
                "Decimals",
                "Balance",
                "Total Supply",
            ],
            tablefmt="github",
            disable_numparse=True,
        )
    )

    if args.min_threshold_wei is not None:
        print(
            json.dumps(
                {
                    "address": wallet,
                    "balanceWei": str(native_raw),
                    "thresholdWei": str(threshold),
                    "sufficient": sufficient,
                    "balanceFormatted": format_balance(native_raw),
                    "thresholdFormatted": format_balance(threshold),
                }
            )
        )
        if not sufficient:
            raise SystemExit(2)

    if args.verbose:
        print("\nConfigured tokens from config/vaultConfig.json:")
        for k, v in tokens.items():
            print(f"- {k}: {v}")


def cmd_transfer(args: argparse.Namespace) -> None:
    recipient = to_checksum(args.to)
    token_amounts = parse_token_amounts(args.tokens)

    rpc_url = get_rpc_url(args.network, args.rpc_url)
    w3 = get_web3(rpc_url)
    priv_key = get_operator_private_key(args.private_key)
    sender = w3.eth.account.from_key(priv_key).address

    print(f"Sender: {sender}")
    print(f"Recipient: {recipient}")
    print(f"Network: {args.network} | RPC: {rpc_url} | Chain ID: {w3.eth.chain_id}")
    print(f"Mode: {'DRY-RUN' if args.dry_run else 'LIVE'}")

    for token, amount in token_amounts:
        info = get_token_info(w3, token, args.network)
        balance = get_token_balance_with_assoc(w3, token, sender, args.network)[0]
        if balance < amount:
            raise ValueError(f"Insufficient {info['symbol']} balance for {token}: have {balance}, need {amount}")

        allowance = check_allowance(w3, token, sender, recipient)
        print(
            f"- token={token} symbol={info['symbol']} amount={amount} "
            f"balance={balance} allowance(sender->recipient)={allowance}"
        )

        if allowance < amount:
            print("  allowance too low: approve required")
            if not args.dry_run:
                approve_tx = approve(
                    w3=w3,
                    token=token,
                    owner_private_key=priv_key,
                    spender=recipient,
                    amount=amount,
                    verbose=args.verbose,
                )
                print(f"  approve tx: {approve_tx}")
                allowance_after = check_allowance(w3, token, sender, recipient)
                print(f"  allowance after approval: {allowance_after}")
                if allowance_after < amount:
                    raise ValueError(f"allowance still too low after approval: {allowance_after} < {amount}")
            else:
                print("  [dry-run] skip approve broadcast")

        if not args.dry_run:
            transfer_tx = transfer(
                w3=w3,
                token=token,
                owner_private_key=priv_key,
                to=recipient,
                amount=amount,
                verbose=args.verbose,
            )
            print(f"  transfer tx: {transfer_tx}")
        else:
            print("  [dry-run] skip transfer broadcast")


def cmd_extract_abi(args: argparse.Namespace) -> None:
    out_path = Path(__file__).resolve().parents[1] / "out" / "Vault.sol" / "Vault.json"
    if not out_path.exists():
        raise FileNotFoundError(f"Compiled artifact not found: {out_path}")

    artifact = json.loads(out_path.read_text(encoding="utf-8"))
    if "abi" not in artifact:
        raise ValueError("No 'abi' field found in artifact")

    output_path = Path(__file__).resolve().parents[1] / "ABI" / "vault_abi.json"
    output_path.write_text(json.dumps(artifact["abi"], indent=2), encoding="utf-8")
    print(f"ABI extracted to {output_path}")


def cmd_vault_state(args: argparse.Namespace) -> None:
    import yaml

    rpc_url = get_rpc_url(args.network, args.rpc_url)
    w3 = get_web3(rpc_url)

    deploy_path = Path(__file__).resolve().parents[1] / "deploy" / args.network / "vault.yaml"
    if not deploy_path.exists():
        raise FileNotFoundError(f"Deployment file not found: {deploy_path}")

    with open(deploy_path) as f:
        deploy_data = yaml.safe_load(f)

    vault_addr_raw = deploy_data["deployment"]["contract_address"]
    if isinstance(vault_addr_raw, int):
        vault_addr = to_checksum("0x" + format(vault_addr_raw, "040x"))
    else:
        vault_addr = to_checksum(vault_addr_raw)

    token1_addr_raw = deploy_data["tokens"]["token1"]
    if isinstance(token1_addr_raw, int):
        token1_addr = to_checksum("0x" + format(token1_addr_raw, "040x"))
    else:
        token1_addr = to_checksum(token1_addr_raw)

    token2_addr_raw = deploy_data["tokens"]["token2"]
    if isinstance(token2_addr_raw, int):
        token2_addr = to_checksum("0x" + format(token2_addr_raw, "040x"))
    else:
        token2_addr = to_checksum(token2_addr_raw)

    vault_abi_path = Path(__file__).resolve().parents[1] / "ABI" / "vault_abi.json"
    if not vault_abi_path.exists():
        raise FileNotFoundError(f"Vault ABI not found: {vault_abi_path}")

    with open(vault_abi_path) as f:
        vault_abi = json.load(f)

    vault = w3.eth.contract(address=to_checksum(vault_addr), abi=vault_abi)

    state_enum = {0: "Closed", 1: "Deposit", 2: "Running", 3: "Withdraw"}

    token1 = vault.functions.token1().call()
    token2 = vault.functions.token2().call()
    max_shareholders = vault.functions.maxShareholders().call()
    withdrawal_snapshot_balance = vault.functions.withdrawalSnapshotBalance().call()
    withdrawal_snapshot_shares = vault.functions.withdrawalSnapshotShares().call()
    total_shares = vault.functions.totalShares().call()
    state = vault.functions.state().call()
    manager = vault.functions.manager().call()
    deposits_closed = vault.functions.depositsClosed().call()
    shareholder_count = vault.functions.getShareholderCount().call()
    shareholders = vault.functions.getShareholders().call()

    info1 = get_token_info(w3, token1_addr, args.network) if token1_addr != "0x" * 20 else None
    info2 = get_token_info(w3, token2_addr, args.network) if token2_addr != "0x" * 20 else None

    def fmt_token(addr: str, info: dict | None) -> str:
        if not info:
            return addr
        return f"{addr} ({info['symbol']})"

    result = {
        "vault": vault_addr,
        "network": args.network,
        "chainId": int(w3.eth.chain_id),
        "state": state_enum.get(state, str(state)),
        "stateRaw": state,
        "manager": manager,
        "depositsClosed": deposits_closed,
        "token1": fmt_token(token1_addr, info1),
        "token1Raw": token1_addr,
        "token2": fmt_token(token2_addr, info2),
        "token2Raw": token2_addr,
        "maxShareholders": max_shareholders,
        "totalShares": str(total_shares),
        "withdrawalSnapshotBalance": str(withdrawal_snapshot_balance),
        "withdrawalSnapshotShares": str(withdrawal_snapshot_shares),
        "shareholderCount": shareholder_count,
        "shareholders": shareholders,
    }

    if args.json:
        print(json.dumps(result, indent=2))
        return

    print(f"\nVault: {vault_addr}")
    print(f"Network: {args.network} | Chain ID: {w3.eth.chain_id}")
    print(f"\nState: {state_enum.get(state, str(state))} (raw: {state})")
    print(f"Manager: {manager}")
    print(f"Deposits Closed: {deposits_closed}")
    print(f"\nToken1: {fmt_token(token1_addr, info1)}")
    print(f"Token2: {fmt_token(token2_addr, info2)}")
    print(f"Max Shareholders: {max_shareholders}")
    print(f"\nTotal Shares: {total_shares}")
    print(f"Withdrawal Snapshot Balance: {withdrawal_snapshot_balance}")
    print(f"Withdrawal Snapshot Shares: {withdrawal_snapshot_shares}")
    print(f"\nShareholders ({shareholder_count}): {shareholders}")


def cmd_mint(args: argparse.Namespace) -> None:
    token = to_checksum(args.token)
    recipient = to_checksum(args.to)
    amount = int(args.amount)
    if amount <= 0:
        raise ValueError("--amount must be > 0")

    rpc_url = get_rpc_url(args.network, args.rpc_url)
    w3 = get_web3(rpc_url)
    priv_key = get_operator_private_key(args.private_key)
    sender = w3.eth.account.from_key(priv_key).address
    info = get_token_info(w3, token, args.network)

    print(f"Minter: {sender}")
    print(f"Recipient: {recipient}")
    print(f"Token: {token} ({info['symbol']})")
    print(f"Amount (raw): {amount}")
    print(f"Network: {args.network} | RPC: {rpc_url} | Chain ID: {w3.eth.chain_id}")
    print(f"Mode: {'DRY-RUN' if args.dry_run else 'LIVE'}")

    if args.dry_run:
        print("[dry-run] skip mint broadcast")
        return

    tx_hash = mint(
        w3=w3,
        token=token,
        owner_private_key=priv_key,
        to=recipient,
        amount=amount,
        verbose=args.verbose,
    )
    print(f"mint tx: {tx_hash}")


def _load_vault(w3: Web3, network: str):
    import yaml

    deploy_path = Path(__file__).resolve().parents[1] / "deploy" / network / "vault.yaml"
    if not deploy_path.exists():
        raise FileNotFoundError(f"Deployment file not found: {deploy_path}")

    with open(deploy_path) as f:
        deploy_data = yaml.safe_load(f)

    vault_addr_raw = deploy_data["deployment"]["contract_address"]
    if isinstance(vault_addr_raw, int):
        vault_addr = to_checksum("0x" + format(vault_addr_raw, "040x"))
    else:
        vault_addr = to_checksum(vault_addr_raw)

    vault_abi_path = Path(__file__).resolve().parents[1] / "ABI" / "vault_abi.json"
    if not vault_abi_path.exists():
        raise FileNotFoundError(f"Vault ABI not found: {vault_abi_path}")

    with open(vault_abi_path) as f:
        vault_abi = json.load(f)

    vault = w3.eth.contract(address=to_checksum(vault_addr), abi=vault_abi)
    return vault, vault_addr


def _print_vault_state(w3: Web3, vault, vault_addr: str) -> None:
    state_enum = {0: "Closed", 1: "Deposit", 2: "Running", 3: "Withdraw"}

    state = vault.functions.state().call()
    manager = vault.functions.manager().call()
    deposits_closed = vault.functions.depositsClosed().call()
    total_shares = vault.functions.totalShares().call()
    shareholder_count = vault.functions.getShareholderCount().call()
    shareholders = vault.functions.getShareholders().call()

    print(f"\nVault: {vault_addr}")
    print(f"State: {state_enum.get(state, str(state))} (raw: {state})")
    print(f"Manager: {manager}")
    print(f"Deposits Closed: {deposits_closed}")
    print(f"Total Shares: {total_shares}")
    print(f"Shareholders ({shareholder_count}): {shareholders}")


def cmd_vault_state_transition(args: argparse.Namespace) -> None:
    rpc_url = get_rpc_url(args.network, args.rpc_url)
    w3 = get_web3(rpc_url)
    priv_key = get_operator_private_key(args.private_key)

    vault, vault_addr = _load_vault(w3, args.network)

    state_enum = {0: "Closed", 1: "Deposit", 2: "Running", 3: "Withdraw"}
    current_state = vault.functions.state().call()
    print(f"Current state: {state_enum.get(current_state, str(current_state))}")
    print(f"Target state: {args.state}")

    func_map = {
        "deposit": "stateToDeposit",
        "running": "stateToRunning",
        "withdraw": "stateToWithdraw",
        "close-deposits": "closeDeposits",
    }

    func_name = func_map[args.state]
    func = getattr(vault.functions, func_name)()

    if args.dry_run:
        print("[dry-run] Simulating transaction...")
        try:
            func.call({"from": w3.eth.account.from_key(priv_key).address})
            expected_state = current_state
            if args.state == "deposit":
                expected_state = 1
            elif args.state == "running":
                expected_state = 2
            elif args.state == "withdraw":
                expected_state = 3
            elif args.state == "close-deposits":
                expected_state = current_state
            print(
                f"Simulation succeeded. Expected state after transition: {state_enum.get(expected_state, str(expected_state))}"
            )
        except Exception as e:
            print(f"Simulation failed: {e}")
        return

    vault_abi_path = Path(__file__).resolve().parents[1] / "ABI" / "vault_abi.json"
    with open(vault_abi_path) as f:
        vault_abi = json.load(f)

    result = send_tx(w3, vault, func_name, [], priv_key)
    if result["status"] == 1:
        ok(f"State transition successful: {result['tx_hash']}")
        new_state = vault.functions.state().call()
        print(f"New state: {state_enum.get(new_state, str(new_state))}")
    else:
        error("State transition failed")
        log_tx_error(result, vault_abi)
        raise SystemExit(1)


def cmd_vault_reset(args: argparse.Namespace) -> None:
    token1 = to_checksum(args.token1)
    token2 = to_checksum(args.token2)
    max_shareholders = int(args.max_shareholders)

    rpc_url = get_rpc_url(args.network, args.rpc_url)
    w3 = get_web3(rpc_url)
    priv_key = get_operator_private_key(args.private_key)

    vault, vault_addr = _load_vault(w3, args.network)

    state_enum = {0: "Closed", 1: "Deposit", 2: "Running", 3: "Withdraw"}
    current_state = vault.functions.state().call()
    shareholder_count = vault.functions.getShareholderCount().call()

    print(f"Current state: {state_enum.get(current_state, str(current_state))}")
    print(f"Current shareholders: {shareholder_count}")
    print(f"New token1: {token1}")
    print(f"New token2: {token2}")
    print(f"New max shareholders: {max_shareholders}")

    func = vault.functions.updateVault(token1, token2, max_shareholders)

    if args.dry_run:
        print("[dry-run] Simulating transaction...")
        try:
            func.call({"from": w3.eth.account.from_key(priv_key).address})
            print("Simulation succeeded.")
            print("Expected state after reset: Closed")
            print("Expected shareholders: 0")
        except Exception as e:
            print(f"Simulation failed: {e}")
        return

    account = w3.eth.account.from_key(priv_key)
    nonce = w3.eth.get_transaction_count(account.address, "pending")

    block = w3.eth.get_block("latest")
    base_fee = block.get("baseFeePerGas", w3.to_wei(50, "gwei"))

    tx_params = {
        "from": account.address,
        "nonce": nonce,
        "gas": 100000000,
        "chainId": w3.eth.chain_id,
        "maxFeePerGas": base_fee * 2,
        "maxPriorityFeePerGas": w3.to_wei(2, "gwei"),
    }

    tx = func.build_transaction(tx_params)
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

    if receipt.status == 1:
        print(f"Transaction successful: {w3.to_hex(tx_hash)}")
        new_state = vault.functions.state().call()
        new_shareholders = vault.functions.getShareholderCount().call()
        print(f"New state: {state_enum.get(new_state, str(new_state))}")
        print(f"New shareholders: {new_shareholders}")
    else:
        print(f"Transaction failed: {w3.to_hex(tx_hash)}")
        raise SystemExit(1)


def cmd_vault_close(args: argparse.Namespace) -> None:
    rpc_url = get_rpc_url(args.network, args.rpc_url)
    w3 = get_web3(rpc_url)
    priv_key = get_operator_private_key(args.private_key)

    vault, vault_addr = _load_vault(w3, args.network)

    vault_abi_path = Path(__file__).resolve().parents[1] / "ABI" / "vault_abi.json"
    with open(vault_abi_path) as f:
        vault_abi = json.load(f)

    state_enum = {0: "Closed", 1: "Deposit", 2: "Running", 3: "Withdraw"}
    current_state = call_contract(w3, vault, "state")
    print(f"Current state: {state_enum.get(current_state, str(current_state))}")

    shareholders = call_contract(w3, vault, "getShareholders")
    print(f"Shareholders: {len(shareholders)}")

    if args.dry_run:
        print("\n[dry-run] Expected workflow:")
        if current_state == 1:
            print("  1. stateToRunning() - Deposit -> Running")
            print("  2. stateToWithdraw() - Running -> Withdraw (snapshot)")
        elif current_state == 2:
            print("  1. stateToWithdraw() - Running -> Withdraw (snapshot)")
        elif current_state == 3:
            print("  1. (already in Withdraw state)")
        print(f"  2. withdraw({len(shareholders)}) - distribute to shareholders")
        print("\n  Expected final state: Closed (0 shareholders)")
        return

    expected_state = current_state

    def do_step(step_name: str, func, expected_new_state=None):
        nonlocal expected_state
        result = send_tx(w3, vault, func.function_name, [], priv_key)
        if result["status"] == 1:
            ok(f"{step_name} succeeded: {result['tx_hash']}")
            if expected_new_state is not None:
                expected_state = expected_new_state
            return True
        error(f"{step_name} failed")
        log_tx_error(result, vault_abi)
        return False

    try:
        if current_state == 1:
            if not do_step("stateToRunning()", vault.functions.stateToRunning(), 2):
                return
        if current_state != 3:
            if not do_step("stateToWithdraw()", vault.functions.stateToWithdraw(), 3):
                return

        shareholders = call_contract(w3, vault, "getShareholders")
        if len(shareholders) > 0:
            if not do_step(
                f"withdraw({len(shareholders)} shareholders)",
                vault.functions.withdraw(shareholders),
                0,
            ):
                return
        else:
            info("No shareholders to withdraw")
            expected_state = 0

        print(f"\n{BOLD}Vault closed successfully{NC}")
        print(f"Final state: {state_enum.get(expected_state, str(expected_state))}")
        print("Final shareholders: 0")

    except Exception as e:
        error(f"Close failed: {e}")
        raise SystemExit(1)


def cmd_vault_deposit(args: argparse.Namespace) -> None:
    amount = int(args.amount)
    if amount <= 0:
        raise ValueError("--amount must be > 0")

    rpc_url = get_rpc_url(args.network, args.rpc_url)
    w3 = get_web3(rpc_url)
    priv_key = get_operator_private_key(args.private_key)
    sender = w3.eth.account.from_key(priv_key).address

    vault, vault_addr = _load_vault(w3, args.network)
    token1_addr = vault.functions.token1().call()

    allowance = check_allowance(w3, token1_addr, sender, vault_addr)
    if allowance < amount:
        print(f"Allowance too low ({allowance} < {amount}). Approving...")
        if not args.dry_run:
            approve(w3, token1_addr, priv_key, vault_addr, amount, args.verbose)

    print(f"Depositing {amount} to vault {vault_addr} from {sender}")
    func = vault.functions.deposit(amount)

    if args.dry_run:
        print("[dry-run] Simulating deposit...")
        try:
            func.call({"from": sender})
            print("Simulation succeeded.")
        except Exception as e:
            print(f"Simulation failed: {e}")
        return

    result = send_tx(w3, vault, "deposit", [amount], priv_key)
    if result["status"] == 1:
        ok(f"Deposit successful: {result['tx_hash']}")
    else:
        vault_abi_path = Path(__file__).resolve().parents[1] / "ABI" / "vault_abi.json"
        with open(vault_abi_path) as f:
            vault_abi = json.load(f)
        error("Deposit failed")
        log_tx_error(result, vault_abi)
        raise SystemExit(1)


def cmd_vault_withdraw(args: argparse.Namespace) -> None:
    rpc_url = get_rpc_url(args.network, args.rpc_url)
    w3 = get_web3(rpc_url)
    priv_key = get_operator_private_key(args.private_key)
    sender = w3.eth.account.from_key(priv_key).address

    vault, vault_addr = _load_vault(w3, args.network)

    print(f"Withdrawing from vault {vault_addr} for {sender}")
    func = vault.functions.userWithdraw()

    if args.dry_run:
        print("[dry-run] Simulating userWithdraw...")
        try:
            func.call({"from": sender})
            print("Simulation succeeded.")
        except Exception as e:
            print(f"Simulation failed: {e}")
        return

    result = send_tx(w3, vault, "userWithdraw", [], priv_key)
    if result["status"] == 1:
        ok(f"Withdrawal successful: {result['tx_hash']}")
    else:
        vault_abi_path = Path(__file__).resolve().parents[1] / "ABI" / "vault_abi.json"
        with open(vault_abi_path) as f:
            vault_abi = json.load(f)
        error("Withdrawal failed")
        log_tx_error(result, vault_abi)
        raise SystemExit(1)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Unified Hedera/EVM helper CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_ss58_encode = subparsers.add_parser("ss58-encode", help="Convert H160 to SS58")
    p_ss58_encode.add_argument("address", help="0x-prefixed H160 address")
    p_ss58_encode.add_argument("--prefix", type=int, default=42, help="SS58 prefix (default: 42)")
    p_ss58_encode.set_defaults(func=cmd_ss58_encode)

    p_ss58_decode = subparsers.add_parser("ss58-decode", help="Convert SS58 to H160")
    p_ss58_decode.add_argument("address", help="SS58 address")
    p_ss58_decode.set_defaults(func=cmd_ss58_decode)

    p_chain_info = subparsers.add_parser("chain-info", help="Query chain ID and latest block")
    add_network_args(p_chain_info)
    p_chain_info.set_defaults(func=cmd_chain_info)

    p_show_address = subparsers.add_parser("show-address", help="Show EVM address for a private key")
    p_show_address.add_argument("--private-key", help="Private key (defaults to OPERATOR_KEY in .env)")
    p_show_address.set_defaults(func=cmd_show_address)

    p_check_balance = subparsers.add_parser("check-balance", help="Check native and token balances")
    p_check_balance.add_argument("wallet", help="Wallet address to inspect")
    add_network_args(p_check_balance)
    p_check_balance.add_argument(
        "--min-threshold-wei",
        help="Optional native balance threshold in wei (exit code 2 if insufficient)",
    )
    p_check_balance.add_argument(
        "--json",
        action="store_true",
        help="Print machine-readable JSON summary only",
    )
    p_check_balance.add_argument("-v", "--verbose", action="store_true", help="Verbose output")
    p_check_balance.set_defaults(func=cmd_check_balance)

    p_transfer = subparsers.add_parser("transfer", help="Transfer one or more ERC20 tokens")
    add_network_args(p_transfer)
    p_transfer.add_argument("--to", required=True, help="Recipient address")
    p_transfer.add_argument(
        "--tokens",
        required=True,
        help="Comma list: <address>#<amount>,<address>#<amount> using raw base units",
    )
    p_transfer.add_argument("--private-key", help="Override sender private key (defaults to OPERATOR_KEY)")
    p_transfer.add_argument("--dry-run", action="store_true", help="Simulate without broadcasting")
    p_transfer.add_argument("-v", "--verbose", action="store_true", help="Verbose output")
    p_transfer.set_defaults(func=cmd_transfer)

    p_mint = subparsers.add_parser("mint", help="Mint ERC20 tokens via mint(address,uint256)")
    add_network_args(p_mint)
    p_mint.add_argument("--token", required=True, help="Token contract address")
    p_mint.add_argument("--to", required=True, help="Recipient address")
    p_mint.add_argument("--amount", required=True, help="Amount in raw base units")
    p_mint.add_argument("--private-key", help="Override minter private key (defaults to OPERATOR_KEY)")
    p_mint.add_argument("--dry-run", action="store_true", help="Simulate without broadcasting")
    p_mint.add_argument("-v", "--verbose", action="store_true", help="Verbose output")
    p_mint.set_defaults(func=cmd_mint)

    p_extract_abi = subparsers.add_parser("extract-abi", help="Extract ABI from compiled Vault.json to vault_abi.json")
    p_extract_abi.set_defaults(func=cmd_extract_abi)

    p_vault_state = subparsers.add_parser("vault-state", help="Read all vault state in one command")
    add_network_args(p_vault_state)
    p_vault_state.add_argument("--json", action="store_true", help="Output as JSON")
    p_vault_state.set_defaults(func=cmd_vault_state)

    p_vault_state_transition = subparsers.add_parser("vault-state-transition", help="Transition vault to a new state")
    add_network_args(p_vault_state_transition)
    p_vault_state_transition.add_argument(
        "--state",
        required=True,
        choices=["deposit", "running", "withdraw", "close-deposits"],
        help="Target state",
    )
    p_vault_state_transition.add_argument("--private-key", help="Override private key (defaults to OPERATOR_KEY)")
    p_vault_state_transition.add_argument("--dry-run", action="store_true", help="Simulate without broadcasting")
    p_vault_state_transition.set_defaults(func=cmd_vault_state_transition)

    p_vault_reset = subparsers.add_parser("vault-reset", help="Reset vault (updateVault)")
    add_network_args(p_vault_reset)
    p_vault_reset.add_argument("--token1", required=True, help="New token1 address")
    p_vault_reset.add_argument("--token2", required=True, help="New token2 address")
    p_vault_reset.add_argument("--max-shareholders", required=True, help="New max shareholders")
    p_vault_reset.add_argument("--private-key", help="Override private key (defaults to OPERATOR_KEY)")
    p_vault_reset.add_argument("--dry-run", action="store_true", help="Simulate without broadcasting")
    p_vault_reset.set_defaults(func=cmd_vault_reset)

    p_vault_close = subparsers.add_parser(
        "vault-close",
        help="Close vault (full workflow: Running -> Withdraw -> Withdraw all)",
    )
    add_network_args(p_vault_close)
    p_vault_close.add_argument("--private-key", help="Override private key (defaults to OPERATOR_KEY)")
    p_vault_close.add_argument("--dry-run", action="store_true", help="Simulate without broadcasting")
    p_vault_close.set_defaults(func=cmd_vault_close)

    p_vault_deposit = subparsers.add_parser("vault-deposit", help="Deposit token1 into the vault")
    add_network_args(p_vault_deposit)
    p_vault_deposit.add_argument("--amount", required=True, help="Amount to deposit in base units")
    p_vault_deposit.add_argument("--private-key", help="Override private key (defaults to OPERATOR_KEY)")
    p_vault_deposit.add_argument("--dry-run", action="store_true", help="Simulate without broadcasting")
    p_vault_deposit.add_argument("-v", "--verbose", action="store_true", help="Verbose output")
    p_vault_deposit.set_defaults(func=cmd_vault_deposit)

    p_vault_withdraw = subparsers.add_parser("vault-withdraw", help="Withdraw your share from the vault")
    add_network_args(p_vault_withdraw)
    p_vault_withdraw.add_argument("--private-key", help="Override private key (defaults to OPERATOR_KEY)")
    p_vault_withdraw.add_argument("--dry-run", action="store_true", help="Simulate without broadcasting")
    p_vault_withdraw.set_defaults(func=cmd_vault_withdraw)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
