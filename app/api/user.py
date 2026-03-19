from enum import Enum
from typing import List, Optional
import time
from datetime import datetime

from fastapi import Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.router_decorated import APIRouter
from app.db.session import get_db, get_tables
from app.models.tokens import Token
from app.models.vault import SwapTransaction, UserEarning, Vault, VaultLog
from app.schemas.my_base_model import Message
from app.schemas.user import (
    VaultEarning,
    VaultEarningsResponse,
    SwapToken,
    TokenInfo,
    UserSwap,
    UserSwapListResponse,
    UserSwapCreateRequest,
    VaultTransaction,
    VaultTransactionListResponse,
    VaultTransactionCreateRequest,
)

TABLES = get_tables(settings.SCHEMA_1)
COIN_PRICES_5M = TABLES.get("p5m", "coin_prices_5m")
PRICE_WINDOW_SECONDS = 3600


router = APIRouter()
group_tags: List[str | Enum] = ["User"]


def _normalize_symbol(symbol: str) -> str:
    cleaned = (symbol or "").strip().upper()
    return cleaned.replace("'", "''")


def _get_latest_price(db: Session, symbol: str) -> Optional[float]:
    normalized = _normalize_symbol(symbol)
    if not normalized:
        return None
    cutoff = int(datetime.now().timestamp()) - PRICE_WINDOW_SECONDS
    price_query = text(
        f"""
        SELECT close
        FROM {COIN_PRICES_5M}
        WHERE symbol = '{normalized}'
            AND open_time > {cutoff}
        ORDER BY open_time DESC
        LIMIT 1
        """
    )
    try:
        result = db.execute(price_query).fetchone()
        if result and getattr(result, "close", None) is not None:
            return float(result.close)
    except Exception as exc:
        print(f"Failed to fetch price for {symbol}: {exc}")
    return None


def _get_user_vault_earning(
    db: Session,
    wallet_address: str,
    chain_id: int,
    vault_id: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[List[VaultEarning], int]:
    """
    Core function to get user vault earnings.

    Args:
        db: Database session
        wallet_address: User's wallet address
        vault_id: Optional vault ID to filter by
        limit: Maximum number of results
        offset: Pagination offset

    Returns:
        Tuple of (list of VaultEarning, total count)
    """
    wallet_address = wallet_address.strip().lower()

    base_query = (
        db.query(UserEarning, Vault)
        .join(Vault, UserEarning.vault_id == Vault.id)
        .filter(
            UserEarning.wallet_address == wallet_address,
            UserEarning.chain_id == chain_id,
            Vault.chain_id == chain_id,
        )
    )
    if vault_id:
        vault_id = vault_id.strip().lower()
        base_query = base_query.filter(UserEarning.vault_id == vault_id)

    total = base_query.count()
    earnings_data = (
        base_query.order_by(UserEarning.current_amount.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )

    # Convert to earnings format
    earnings = []

    for earning, vault in earnings_data:
        # Calculate ROI (Return on Investment)
        # ROI = ((current_amount + total_withdrawal - total_deposit) / total_deposit) * 100
        total_deposit = float(earning.total_deposit or 0)
        total_withdrawal = float(earning.total_withdrawal or 0)
        current_amount = float(earning.current_amount or 0)

        # ROI calculation: (current_amount - net_deposit) / net_deposit * 100
        # Or: (current_amount + total_withdrawal - total_deposit) / total_deposit * 100
        if total_deposit > 0:
            roi = (
                (current_amount + total_withdrawal - total_deposit) / total_deposit
            ) * 100
        else:
            roi = 0.0

        is_redeemed = (
            bool(earning.is_redeemed) if earning.is_redeemed is not None else False
        )

        earnings.append(
            VaultEarning(
                vault_id=str(earning.vault_id),
                vault_name=str(vault.name) if vault.name else "",
                vault_address=str(vault.address) if vault.address else "",
                pool_id=str(vault.pool_id) if getattr(vault, "pool_id", None) else "",
                total_deposit=round(total_deposit, 2),
                current_amount=round(current_amount, 2),
                roi=round(roi, 2),
                is_redeemed=is_redeemed,
            )
        )

    return earnings, total


@router.get(
    "/vaults/earnings",
    tags=group_tags,
    response_model=VaultEarningsResponse,
    status_code=status.HTTP_200_OK,
)
def get_vault_earnings(
    wallet_address: str = Query(
        ..., description="Wallet address of the user (required)"
    ),
    chain_id: int = Query(
        ...,
        ge=1,
        description="Chain ID to scope the vault earnings.",
    ),
    limit: int = Query(
        default=20, ge=1, le=100, description="Maximum number of earnings to return"
    ),
    offset: int = Query(
        default=0, ge=0, description="Number of earnings to skip for pagination"
    ),
    db: Session = Depends(get_db),
) -> VaultEarningsResponse:
    """
    Get vault earnings for a user (from vault positions).

    Query Parameters:
    - wallet_address: Wallet address of the user (required)
    - chain_id: Chain ID to scope the vault earnings.
    - limit: Maximum number of earnings to return (default: 20, max: 100)
    - offset: Number of earnings to skip for pagination (default: 0)

    Returns:
    - earnings: List of vault earnings (vault_id, vault_name, vault_address, pool_id, total_deposit, current_amount, roi, is_redeemed)
    - total, page, limit: Pagination

    *Sample wallet address:* addr1vyrq3xwa5gs593ftfpy2lzjjwzksdt0fkjjwge4ww6p53dqy4w5wm
    """
    earnings, total = _get_user_vault_earning(
        db=db,
        wallet_address=wallet_address,
        chain_id=chain_id,
        vault_id=None,
        limit=limit,
        offset=offset,
    )

    return VaultEarningsResponse(
        earnings=earnings,
        total=total,
        page=(offset // limit) + 1,
        limit=limit,
    )


@router.get(
    "/swaps",
    tags=group_tags,
    response_model=UserSwapListResponse,
    status_code=status.HTTP_200_OK,
)
def get_user_swaps(
    wallet_address: str = Query(
        ..., description="Wallet address of the user (required)"
    ),
    chain_id: int = Query(
        ...,
        ge=1,
        description="Chain ID filters the swap history.",
    ),
    page: int = Query(default=1, ge=1, description="Page number (default: 1)"),
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
        description="Number of records per page (default: 20, max: 100)",
    ),
    db: Session = Depends(get_db),
) -> UserSwapListResponse:
    """
    Get user swap transactions.

    Query Parameters:
    - wallet_address: Wallet address of the user (required)
    - chain_id: Chain ID to scope the swap history.
    - page: Page number (default: 1)
    - limit: Number of records per page (default: 20, max: 100)

    Returns:
    - List of swap transactions with token information

    Query Parameters:
    - chain_id: Chain ID to scope the swap history.

    *Sample wallet address:* addr1vyrq3xwa5gs593ftfpy2lzjjwzksdt0fkjjwge4ww6p53dqy4w5wm
    """
    wallet_address = wallet_address.strip().lower()
    # Validate and adjust pagination parameters
    page = max(1, page)
    limit = max(1, min(100, limit))
    offset = (page - 1) * limit

    base_query = db.query(SwapTransaction).filter(
        SwapTransaction.status == "completed",
        SwapTransaction.wallet_address == wallet_address,
        SwapTransaction.chain_id == chain_id,
    )
    total = base_query.count()
    swaps = (
        base_query.order_by(SwapTransaction.timestamp.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )

    # Get unique token symbols
    token_symbols = set()
    for swap in swaps:
        token_symbols.add(str(swap.from_token))
        token_symbols.add(str(swap.to_token))

    # Fetch token information
    token_info_map = {}
    if token_symbols:
        tokens = db.query(Token).filter(Token.symbol.in_(token_symbols)).all()
        for token in tokens:
            token_info_map[token.symbol] = TokenInfo(
                symbol=token.symbol or "",
                name=token.name or "",
                decimals=token.decimals or 0,
                address=token.id or "",
                logo_url=token.logo_url,
            )

    # Convert to response format
    swap_data = []
    for swap in swaps:
        from_token_symbol = str(swap.from_token)
        to_token_symbol = str(swap.to_token)

        # Get token info or create default
        from_token_info = token_info_map.get(
            from_token_symbol,
            TokenInfo(symbol=from_token_symbol, name="", decimals=0, address=""),
        )
        to_token_info = token_info_map.get(
            to_token_symbol,
            TokenInfo(symbol=to_token_symbol, name="", decimals=0, address=""),
        )

        swap_data.append(
            UserSwap(
                fromToken=SwapToken(
                    tokenInfo=from_token_info,
                    amount=str(swap.from_amount)
                    if swap.from_amount is not None
                    else "0",
                ),
                toToken=SwapToken(
                    tokenInfo=to_token_info,
                    amount=str(swap.to_amount) if swap.to_amount is not None else "0",
                ),
                txn=str(swap.transaction_id),
                timestamp=int(swap.timestamp) if swap.timestamp is not None else 0,
                volume_native=float(swap.volume_native) if swap.volume_native else 0.0,
            )
        )

    return UserSwapListResponse(data=swap_data, total=total, page=page)


@router.post(
    "/swaps",
    tags=group_tags,
    response_model=Message,
    status_code=status.HTTP_200_OK,
)
def create_user_swap(
    payload: UserSwapCreateRequest,
    db: Session = Depends(get_db),
) -> Message:
    """
    Save a user swap transaction.

    Payload:
    - transaction_id, wallet_address, chain_id
    - from_token, to_token, from_amount, to_amount
    """
    timestamp = int(time.time())
    price = _get_latest_price(db, payload.from_token)
    from_amount = float(payload.from_amount)
    volume_native = from_amount * price if price and from_amount else 0.0
    new_swap = SwapTransaction(
        transaction_id=payload.transaction_id,
        wallet_address=payload.wallet_address,
        chain_id=payload.chain_id,
        from_token=payload.from_token,
        to_token=payload.to_token,
        from_amount=payload.from_amount,
        to_amount=payload.to_amount,
        timestamp=timestamp,
        volume_native=volume_native,
    )
    try:
        db.add(new_swap)
        db.commit()
    except Exception as e:
        print(f"Error saving swap: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save swap")
    return Message(message="success")


@router.get(
    "/vaults/transactions",
    tags=group_tags,
    response_model=VaultTransactionListResponse,
    status_code=status.HTTP_200_OK,
)
def get_vault_transactions(
    wallet_address: str = Query(
        ..., description="Wallet address of the user (required)"
    ),
    vault_id: Optional[str] = Query(
        default=None, description="Filter by vault ID (optional)"
    ),
    chain_id: int = Query(
        ...,
        ge=1,
        description="Chain ID that owns the vault history.",
    ),
    page: int = Query(default=1, ge=1, description="Page number (default: 1)"),
    limit: int = Query(
        default=20,
        ge=1,
        le=100,
        description="Number of records per page (default: 20, max: 100)",
    ),
    db: Session = Depends(get_db),
) -> VaultTransactionListResponse:
    """
    Get user vault transaction history.

    Query Parameters:
    - wallet_address: Wallet address of the user (required)
    - vault_id: Filter by vault ID (optional)
    - chain_id: Chain ID that owns the vault logs.
    - page: Page number (default: 1)
    - limit: Number of records per page (default: 20, max: 100)

    Returns:
    - List of vault transactions (deposit, withdrawal)

    *Sample wallet address:* addr1vyrq3xwa5gs593ftfpy2lzjjwzksdt0fkjjwge4ww6p53dqy4w5wm
    """
    wallet_address = wallet_address.strip().lower()
    # Validate and adjust pagination parameters
    page = max(1, page)
    limit = max(1, min(100, limit))
    offset = (page - 1) * limit

    base_query = (
        db.query(VaultLog, Vault)
        .outerjoin(Vault, VaultLog.vault_id == Vault.id)
        .filter(
            VaultLog.wallet_address == wallet_address,
            VaultLog.chain_id == chain_id,
            Vault.chain_id == chain_id,
        )
    )
    if vault_id is not None:
        base_query = base_query.filter(VaultLog.vault_id == vault_id)

    total = base_query.count()
    transactions = (
        base_query.order_by(VaultLog.timestamp.desc()).limit(limit).offset(offset).all()
    )

    # Get unique token IDs
    token_ids = set()
    for log, _vault in transactions:
        if log.token_id:
            token_ids.add(str(log.token_id))

    # Fetch token information
    token_info_map = {}
    if token_ids:
        tokens = db.query(Token).filter(Token.id.in_(token_ids)).all()
        for token in tokens:
            token_info_map[token.id] = token.symbol or ""

    # Convert to response format
    transaction_data = []
    for log, vault in transactions:
        token_symbol = (
            token_info_map.get(str(log.token_id), None) if log.token_id else None
        )

        transaction_data.append(
            VaultTransaction(
                id=str(log.id),
                vault_id=str(log.vault_id),
                vault_name=vault.name if vault else None,
                wallet_address=str(log.wallet_address),
                action=str(log.action),
                amount=float(log.amount) if log.amount is not None else 0.0,
                token_id=str(log.token_id) if log.token_id else "",
                token_symbol=token_symbol,
                txn=str(log.txn) if log.txn else "",
                timestamp=int(log.timestamp) if log.timestamp is not None else 0,
                status=str(log.status) if log.status else "pending",
                fee=float(log.fee) if log.fee is not None else 0.0,
            )
        )

    return VaultTransactionListResponse(
        transactions=transaction_data, total=total, page=page, limit=limit
    )


@router.post(
    "/vaults/transactions",
    tags=group_tags,
    response_model=Message,
    status_code=status.HTTP_200_OK,
)
def create_vault_transaction(
    payload: VaultTransactionCreateRequest,
    db: Session = Depends(get_db),
) -> Message:
    """
    Save a user vault transaction (deposit / withdraw).

    Payload:
    - wallet_address, chain_id, vault_id, action, amount, token_id, txn
    - Optional: timestamp, status, fee, metadata
    """
    timestamp = payload.timestamp if payload.timestamp is not None else int(time.time())
    new_log = VaultLog(
        wallet_address=payload.wallet_address,
        chain_id=payload.chain_id,
        action=payload.action,
        amount=payload.amount,
        token_id=payload.token_id,
        txn=payload.txn,
        timestamp=timestamp,
        status=payload.status,
        fee=payload.fee,
        metadata_json=payload.metadata,
        vault_id=payload.vault_id,
    )
    try:
        db.add(new_log)
        db.commit()
    except Exception as e:
        print(f"Error saving vault transaction: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save vault transaction")

    try:
        earning = (
            db.query(UserEarning)
            .filter(
                UserEarning.wallet_address == payload.wallet_address,
                UserEarning.vault_id == payload.vault_id,
                UserEarning.chain_id == payload.chain_id,
            )
            .first()
        )

        action = payload.action.lower()
        if not earning:
            initial_current = payload.amount if action == "deposit" else 0
            earning = UserEarning(
                wallet_address=payload.wallet_address,
                chain_id=payload.chain_id,
                vault_id=payload.vault_id,
                total_deposit=payload.amount if action == "deposit" else 0,
                total_withdrawal=payload.amount if action == "withdraw" else 0,
                current_amount=initial_current,
                last_updated_timestamp=timestamp,
                is_redeemed=False if action == "deposit" else payload.amount <= 0,
            )
            db.add(earning)
        else:
            if action == "deposit":
                if earning.is_redeemed or False:
                    earning.is_redeemed = False
                earning.total_deposit = (earning.total_deposit or 0) + payload.amount
                earning.current_amount = (earning.current_amount or 0) + payload.amount
            elif action == "withdraw":
                earning.total_withdrawal = (
                    earning.total_withdrawal or 0
                ) + payload.amount
                earning.current_amount = (earning.current_amount or 0) - payload.amount
                if earning.current_amount <= 0:
                    earning.is_redeemed = True
                    earning.current_amount = 0

            earning.last_updated_timestamp = timestamp
        db.commit()
    except Exception as e:
        print(f"Error updating user earnings: {e}")
        db.rollback()

    return Message(message="success")
