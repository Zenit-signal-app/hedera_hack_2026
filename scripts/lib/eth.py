from web3 import HTTPProvider, Web3


def get_web3(rpc_url: str) -> Web3:
    w3 = Web3(HTTPProvider(rpc_url))
    if not w3.is_connected():
        raise ConnectionError(f"Unable to connect to RPC: {rpc_url}")
    return w3
