from typing import cast

from web3 import Web3
from web3.types import TxParams

ERC20_ABI = [
    {
        "inputs": [],
        "name": "name",
        "outputs": [{"internalType": "string", "name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "symbol",
        "outputs": [{"internalType": "string", "name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "decimals",
        "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "totalSupply",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "address", "name": "owner", "type": "address"},
            {"internalType": "address", "name": "spender", "type": "address"},
        ],
        "name": "allowance",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "address", "name": "spender", "type": "address"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"},
        ],
        "name": "approve",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "address", "name": "to", "type": "address"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"},
        ],
        "name": "transfer",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "address", "name": "to", "type": "address"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"},
        ],
        "name": "mint",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]


def get_token_contract(w3: Web3, token: str):
    return w3.eth.contract(address=Web3.to_checksum_address(token), abi=ERC20_ABI)


def get_token_info(w3: Web3, token: str) -> dict[str, int | str]:
    c = get_token_contract(w3, token)
    return {
        "name": c.functions.name().call(),
        "symbol": c.functions.symbol().call(),
        "decimals": c.functions.decimals().call(),
        "total_supply": c.functions.totalSupply().call(),
    }


def check_allowance(w3: Web3, token: str, owner: str, spender: str) -> int:
    c = get_token_contract(w3, token)
    return c.functions.allowance(owner, spender).call()


def _tx_params(w3: Web3, from_addr: str, nonce: int) -> TxParams:
    return cast(
        TxParams,
        {
            "from": from_addr,
            "nonce": nonce,
            "gasPrice": w3.eth.gas_price,
            "chainId": int(w3.eth.chain_id),
        },
    )


def approve(
    w3: Web3,
    token: str,
    owner_private_key: str,
    spender: str,
    amount: int,
    verbose: bool = False,
) -> str:
    account = w3.eth.account.from_key(owner_private_key)
    owner = account.address
    c = get_token_contract(w3, token)

    nonce = w3.eth.get_transaction_count(owner)
    tx = c.functions.approve(spender, amount).build_transaction(  # type: ignore[arg-type]
        _tx_params(w3, owner, nonce)
    )
    if "gas" not in tx:
        tx["gas"] = c.functions.approve(spender, amount).estimate_gas({"from": owner})

    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    if verbose:
        print(
            f"approve token={token} spender={spender} amount={amount} "
            f"tx={receipt['transactionHash'].hex()} gasUsed={receipt['gasUsed']}"
        )
    return receipt["transactionHash"].hex()


def transfer(
    w3: Web3,
    token: str,
    owner_private_key: str,
    to: str,
    amount: int,
    verbose: bool = False,
) -> str:
    account = w3.eth.account.from_key(owner_private_key)
    owner = account.address
    c = get_token_contract(w3, token)

    nonce = w3.eth.get_transaction_count(owner)
    tx = c.functions.transfer(to, amount).build_transaction(  # type: ignore[arg-type]
        _tx_params(w3, owner, nonce)
    )
    if "gas" not in tx:
        tx["gas"] = c.functions.transfer(to, amount).estimate_gas({"from": owner})

    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    if verbose:
        print(
            f"transfer token={token} to={to} amount={amount} "
            f"tx={receipt['transactionHash'].hex()} gasUsed={receipt['gasUsed']}"
        )
    return receipt["transactionHash"].hex()


def mint(
    w3: Web3,
    token: str,
    owner_private_key: str,
    to: str,
    amount: int,
    verbose: bool = False,
) -> str:
    account = w3.eth.account.from_key(owner_private_key)
    owner = account.address
    c = get_token_contract(w3, token)

    nonce = w3.eth.get_transaction_count(owner)
    tx = c.functions.mint(to, amount).build_transaction(  # type: ignore[arg-type]
        _tx_params(w3, owner, nonce)
    )
    if "gas" not in tx:
        tx["gas"] = c.functions.mint(to, amount).estimate_gas({"from": owner})

    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    if verbose:
        print(
            f"mint token={token} to={to} amount={amount} "
            f"tx={receipt['transactionHash'].hex()} gasUsed={receipt['gasUsed']}"
        )
    return receipt["transactionHash"].hex()
