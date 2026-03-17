from web3 import Web3

from .erc20 import get_token_contract


def get_native_balance(w3: Web3, wallet: str) -> int:
    return w3.eth.get_balance(Web3.to_checksum_address(wallet))


def get_token_balance(w3: Web3, token: str, wallet: str) -> int:
    c = get_token_contract(w3, token)
    return c.functions.balanceOf(Web3.to_checksum_address(wallet)).call()
