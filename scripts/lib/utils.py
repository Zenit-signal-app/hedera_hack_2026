from web3 import Web3


def to_checksum(address: str) -> str:
    if not Web3.is_address(address):
        raise ValueError(f"Invalid address: {address}")
    return Web3.to_checksum_address(address)


def format_units(value: int, decimals: int) -> str:
    if decimals == 0:
        return str(value)

    scale = 10**decimals
    whole = value // scale
    frac = value % scale

    if frac == 0:
        return str(whole)

    frac_str = f"{frac:0{decimals}d}".rstrip("0")
    return f"{whole}.{frac_str}"


def parse_token_amounts(spec: str) -> list[tuple[str, int]]:
    pairs: list[tuple[str, int]] = []
    if not spec.strip():
        raise ValueError("--tokens cannot be empty")

    for item in spec.split(","):
        part = item.strip()
        if not part:
            continue
        if "#" not in part:
            raise ValueError(
                f"Invalid token spec '{part}'. Expected format: <address>#<amount>"
            )
        addr, amt = part.split("#", 1)
        addr = to_checksum(addr.strip())
        amt_str = amt.strip()
        if not amt_str.isdigit():
            raise ValueError(f"Amount must be integer base units, got: {amt_str}")
        amount = int(amt_str)
        if amount <= 0:
            raise ValueError(f"Amount must be > 0, got: {amount}")
        pairs.append((addr, amount))

    if not pairs:
        raise ValueError("No valid token entries found in --tokens")

    return pairs
