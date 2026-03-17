import hashlib

import base58

SS58_PREFIX = b"SS58PRE"


def prefix_to_network(prefix: int) -> str:
    networks = {
        0: "Polkadot Mainnet",
        2: "Kusama",
        5: "Astar",
        7: "Edgeware",
        42: "Generic/Dev/Testnet (Substrate)",
    }
    return networks.get(prefix, f"Custom (prefix {prefix})")


def chain_id_to_network(chain_id: int) -> str:
    networks = {
        295: "Hedera Mainnet",
        296: "Hedera Testnet",
        298: "Hedera Local (Hiero)",
        31337: "Anvil (Local)",
    }
    return networks.get(chain_id, f"Custom Chain ({chain_id})")


def _prefix_bytes(prefix: int) -> bytes:
    if prefix < 0 or prefix > 16383:
        raise ValueError("SS58 prefix must be in range [0, 16383]")
    if prefix < 64:
        return bytes([prefix])

    first = ((prefix & 0b00111111) | 0b01000000) & 0xFF
    second = (prefix >> 6) & 0xFF
    return bytes([first, second])


def _decode_prefix(data: bytes) -> tuple[int, int]:
    first = data[0]
    if first < 64:
        return first, 1

    if len(data) < 2:
        raise ValueError("Invalid SS58 payload")
    second = data[1]
    prefix = (first & 0b00111111) | (second << 6)
    return prefix, 2


def _checksum(payload: bytes) -> bytes:
    return hashlib.blake2b(SS58_PREFIX + payload, digest_size=64).digest()[:2]


def ss58_encode_h160(h160_address: str, ss58_prefix: int = 42) -> str:
    if not h160_address.startswith("0x") or len(h160_address) != 42:
        raise ValueError("Invalid H160 address. Must be 0x-prefixed, 40 hex chars.")

    h160 = bytes.fromhex(h160_address[2:].lower())
    if len(h160) != 20:
        raise ValueError("Invalid H160 address length")

    padded_pubkey = h160 + (b"\x00" * 12)
    payload = _prefix_bytes(ss58_prefix) + padded_pubkey
    return base58.b58encode(payload + _checksum(payload)).decode("ascii")


def ss58_decode_to_h160(ss58_address: str) -> tuple[int, str, str]:
    decoded = base58.b58decode(ss58_address)
    if len(decoded) < 1 + 32 + 2:
        raise ValueError("Invalid SS58 address: too short")

    prefix, prefix_len = _decode_prefix(decoded)
    payload_end = len(decoded) - 2
    payload = decoded[:payload_end]
    check = decoded[payload_end:]

    expected = _checksum(payload)
    if check != expected:
        raise ValueError("Invalid SS58 checksum")

    public_key = decoded[prefix_len:payload_end]
    if len(public_key) != 32:
        raise ValueError("Invalid SS58 public key length")

    h160 = "0x" + public_key[:20].hex()
    public_key_hex = "0x" + public_key.hex()
    return prefix, public_key_hex, h160
