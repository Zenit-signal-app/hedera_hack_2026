from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.models.base import Base, SCHEMA


def _qualify_table(table_name: str) -> str:
    """Return fully qualified table name when schema is configured."""
    if SCHEMA:
        return f"{SCHEMA}.{table_name}"
    return table_name


def _table_args() -> dict:
    """Return table args dict with schema applied when available."""
    return {"schema": SCHEMA} if SCHEMA else {}


class Vault(Base):
    __tablename__ = "vault"
    __table_args__ = _table_args()

    name = Column(String(255), nullable=False)
    algorithm = Column(String(100), nullable=False)
    address = Column(String(255), nullable=False)
    chain_id = Column(Integer, nullable=False)
    token_id = Column(String(255), nullable=False)
    total_fund = Column(Numeric(20, 8), nullable=True, server_default=text("0"))
    start_time = Column(BigInteger, nullable=False)
    status = Column(
        String(50),
        nullable=True,
        server_default=text("'active'::character varying"),
    )
    description = Column(Text, nullable=True)
    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    logo_url = Column(String(255), nullable=True)
    summary = Column(String(255), nullable=True)
    manager_address = Column(String(255), nullable=True)
    max_users = Column(Integer, nullable=True, server_default=text("50"))
    post_money_val = Column(Numeric(20, 8), nullable=True, server_default=text("0"))
    contract = Column(
        String(225),
        nullable=True,
        server_default=text("'vault_v0_1'::character varying"),
    )


class VaultState(Base):
    __tablename__ = "vault_state"
    __table_args__ = _table_args()

    vault_id = Column(
        UUID(as_uuid=True),
        ForeignKey(_qualify_table("vault.id"), ondelete="CASCADE"),
        primary_key=True,
    )
    chain_id = Column(Integer, nullable=False)
    vault_address = Column(String(255), nullable=False)
    update_time = Column(
        BigInteger,
        nullable=False,
        server_default=text("EXTRACT(epoch FROM now())::bigint"),
    )
    state = Column(String(50), nullable=False)
    tvl_usd = Column(Float, nullable=True, server_default=text("0"))
    max_drawdown = Column(Float, nullable=True, server_default=text("0"))
    trade_start_time = Column(BigInteger, nullable=True)
    start_amount = Column(Float, nullable=True, server_default=text("0"))
    current_amount = Column(Float, nullable=True, server_default=text("0"))
    trade_end_time = Column(BigInteger, nullable=True)
    return_percent = Column(Float, nullable=True, server_default=text("0"))
    total_trades = Column(Integer, nullable=True, server_default=text("0"))
    winning_trades = Column(Integer, nullable=True, server_default=text("0"))
    losing_trades = Column(Integer, nullable=True, server_default=text("0"))
    win_rate = Column(Float, nullable=True, server_default=text("0"))
    avg_profit_per_winning_trade_pct = Column(
        Float, nullable=True, server_default=text("0")
    )
    avg_loss_per_losing_trade_pct = Column(
        Float, nullable=True, server_default=text("0")
    )
    trade_per_month = Column(Float, nullable=True, server_default=text("0"))
    total_fees_paid = Column(Float, nullable=True, server_default=text("0"))


class VaultBalanceSnapshot(Base):
    __tablename__ = "vault_balance_snapshots"
    __table_args__ = _table_args()

    vault_id = Column(
        UUID(as_uuid=True),
        ForeignKey(_qualify_table("vault.id"), ondelete="CASCADE"),
        primary_key=True,
    )
    chain_id = Column(Integer, nullable=False, primary_key=True)
    timestamp = Column(
        "timestamp",
        BigInteger,
        nullable=False,
        server_default=text("EXTRACT(epoch FROM now())::bigint"),
        primary_key=True,
    )
    asset = Column(JSONB, nullable=False)
    total_amount_in_native = Column(Float, nullable=False)
    total_amount_in_usd = Column(Float, nullable=False)


class VaultLog(Base):
    __tablename__ = "vault_logs"
    __table_args__ = _table_args()

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    wallet_address = Column(String(255), nullable=False)
    chain_id = Column(Integer, nullable=False)
    action = Column(String(50), nullable=False)
    amount = Column(Numeric(20, 8), nullable=False, server_default=text("0"))
    token_id = Column(String(255), nullable=False)
    txn = Column(String(255), nullable=False)
    timestamp = Column(BigInteger, nullable=False)
    status = Column(
        String(50),
        nullable=True,
        server_default=text("'pending'::character varying"),
    )
    fee = Column(Numeric(20, 6), nullable=True, server_default=text("0"))
    metadata_json = Column("metadata", JSONB, nullable=True)
    vault_id = Column(
        UUID(as_uuid=True),
        ForeignKey(_qualify_table("vault.id"), ondelete="CASCADE"),
        nullable=False,
    )


class SwapTransaction(Base):
    __tablename__ = "swap_transactions"
    __table_args__ = _table_args()

    transaction_id = Column(String(255), primary_key=True)
    wallet_address = Column(String(255), nullable=False)
    chain_id = Column(Integer, nullable=False)
    from_token = Column(String(255), nullable=True)
    to_token = Column(String(255), nullable=True)
    from_amount = Column(Float, nullable=True, server_default=text("0"))
    to_amount = Column(Float, nullable=True, server_default=text("0"))
    volume_native = Column(Float, nullable=True, server_default=text("0"))
    timestamp = Column(
        BigInteger,
        nullable=True,
        server_default=text("EXTRACT(epoch FROM now())::bigint"),
    )
    status = Column(
        String(50),
        nullable=False,
        server_default=text("'pending'::character varying"),
    )
    metadata_json = Column("metadata", JSONB, nullable=True)
    fee = Column(Float, nullable=True, server_default=text("0"))


class VaultPosition(Base):
    __tablename__ = "vault_positions"
    __table_args__ = _table_args()

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    chain_id = Column(Integer, nullable=False)
    start_time = Column(
        BigInteger,
        nullable=False,
        server_default=text("EXTRACT(epoch FROM now())::bigint"),
    )
    update_time = Column(
        BigInteger,
        nullable=False,
        server_default=text("EXTRACT(epoch FROM now())::bigint"),
    )
    open_order_txn = Column(String(255), nullable=False)
    close_order_txn = Column(String(255), nullable=True)
    spend = Column(Float, nullable=False, server_default=text("0"))
    return_amount = Column(Float, nullable=True)
    vault_id = Column(
        UUID(as_uuid=True),
        ForeignKey(_qualify_table("vault.id"), ondelete="SET NULL"),
        nullable=True,
    )
    pair = Column(String(255), nullable=True)
    direction = Column(
        SmallInteger,
        nullable=True,
        server_default=text("1"),
    )
    quote_token_id = Column(String(255), nullable=True)
    base_token_id = Column(String(255), nullable=True)
    current_asset = Column(Text, nullable=True, server_default=text("'[]'::text"))


class VaultPosTxn(Base):
    __tablename__ = "vault_pos_txn"
    __table_args__ = _table_args()

    position_id = Column(
        UUID(as_uuid=True),
        ForeignKey(_qualify_table("vault_positions.id"), ondelete="CASCADE"),
        primary_key=True,
    )
    trade_id = Column(String(255), primary_key=True)
    chain_id = Column(Integer, nullable=False)
    base_quantity = Column(Float, nullable=False)
    quote_quantity = Column(Float, nullable=False)
    created_at = Column(
        BigInteger,
        nullable=False,
        server_default=text("EXTRACT(epoch FROM now())::bigint"),
    )


class UserEarning(Base):
    __tablename__ = "user_earnings"
    __table_args__ = _table_args()

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )
    wallet_address = Column(String(255), nullable=False)
    chain_id = Column(Integer, nullable=False)
    total_deposit = Column(Numeric(20, 8), nullable=False, server_default=text("0"))
    total_withdrawal = Column(
        Numeric(20, 8), nullable=False, server_default=text("0")
    )
    current_amount = Column(Numeric(20, 8), nullable=False, server_default=text("0"))
    last_updated_timestamp = Column(BigInteger, nullable=False)
    vault_id = Column(
        UUID(as_uuid=True),
        ForeignKey(_qualify_table("vault.id"), ondelete="CASCADE"),
        nullable=False,
    )
    is_redeemed = Column(Boolean, nullable=False, server_default=text("false"))
