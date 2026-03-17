import os
import re
from pathlib import Path

from dotenv import load_dotenv

NETWORK_ENV_MAP = {
    "hedera_local": "HEDERA_LOCAL_RPC_URL",
    "hedera_testnet": "HEDERA_TESTNET_RPC_URL",
    "hedera_mainnet": "HEDERA_MAINNET_RPC_URL",
    "custom": "CUSTOM_RPC_URL",
}


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_env() -> None:
    env_path = _repo_root() / ".env"
    load_dotenv(dotenv_path=env_path)


def get_rpc_url(network: str, override: str | None = None) -> str:
    if override and override.strip():
        return override.strip()
    load_env()
    if network not in NETWORK_ENV_MAP:
        raise ValueError(f"Unsupported network '{network}'.")
    env_key = NETWORK_ENV_MAP[network]
    rpc_url = os.getenv(env_key, "").strip()
    if not rpc_url:
        raise ValueError(f"Missing RPC URL in .env: {env_key}")
    return rpc_url


def get_operator_private_key(override: str | None = None) -> str:
    if override:
        return override
    load_env()
    key = os.getenv("OPERATOR_KEY", "").strip()
    if not key:
        raise ValueError("OPERATOR_KEY is not set in .env")
    return key


def get_vault_tokens() -> dict[str, str]:
    cfg_path = _repo_root() / "src" / "VaultConfig.sol"
    if not cfg_path.exists():
        raise FileNotFoundError(f"Missing config file: {cfg_path}")

    content = cfg_path.read_text(encoding="utf-8")
    token1_match = re.search(r"TOKEN1\s*=\s*address\((0x[a-fA-F0-9]{40})\)", content)
    token2_match = re.search(r"TOKEN2\s*=\s*address\((0x[a-fA-F0-9]{40})\)", content)

    if not token1_match or not token2_match:
        raise ValueError("Could not parse TOKEN1/TOKEN2 from src/VaultConfig.sol")

    return {
        "token1": token1_match.group(1),
        "token2": token2_match.group(1),
    }
