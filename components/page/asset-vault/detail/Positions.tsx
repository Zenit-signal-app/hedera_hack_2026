import { VaultInfo, Position } from "@/types/vault";
import { useState, useEffect } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import GrowUpIcon from "@/components/icon/Icon_GrowUp";
import TrendDownIcon from "@/components/icon/Icon_TrendDown";
import { vaultApi } from "@/services/vaultServices";

interface PositionsProps {
	data: VaultInfo;
}

interface PositionRowProps {
	position: Position;
	index: number;
	status: "open" | "closed"; // Used for display context (Live vs Closed badge)
}

interface PaginationProps {
	currentPage: number;
	totalPages: number;
	itemsPerPage: number;
	totalItems: number;
	onPageChange: (page: number) => void;
}

const Positions = ({ data }: PositionsProps) => {
	const [openPositions, setOpenPositions] = useState<Position[]>([]);
	const [closedPositions, setClosedPositions] = useState<Position[]>([]);
	const [openSearch, setOpenSearch] = useState("");
	const [closedSearch, setClosedSearch] = useState("");
	const [openPage, setOpenPage] = useState(1);
	const [closedPage, setClosedPage] = useState(1);
	const [isLoadingOpen, setIsLoadingOpen] = useState(false);
	const [isLoadingClosed, setIsLoadingClosed] = useState(false);
	const [openError, setOpenError] = useState<string | null>(null);
	const [closedError, setClosedError] = useState<string | null>(null);
	const itemsPerPage = 10;

	useEffect(() => {
		const fetchOpenPositions = async () => {
			setIsLoadingOpen(true);
			setOpenError(null);
			try {
				const response = await vaultApi.getVaultPositions(data.id, {
					status: "open",
					page: openPage,
					limit: itemsPerPage,
				});
				setOpenPositions(response.positions);
			} catch (error) {
				console.error("Error fetching open positions:", error);
				setOpenError("Failed to load open positions");
				setOpenPositions([]);
			} finally {
				setIsLoadingOpen(false);
			}
		};

		if (data.id) {
			fetchOpenPositions();
		}
	}, [data.id, openPage]);

	useEffect(() => {
		const fetchClosedPositions = async () => {
			setIsLoadingClosed(true);
			setClosedError(null);
			try {
				const response = await vaultApi.getVaultPositions(data.id, {
					status: "closed",
					page: closedPage,
					limit: itemsPerPage,
				});
				setClosedPositions(response.positions);
			} catch (error) {
				console.error("Error fetching closed positions:", error);
				setClosedError("Failed to load closed positions");
				setClosedPositions([]);
			} finally {
				setIsLoadingClosed(false);
			}
		};

		if (data.id) {
			fetchClosedPositions();
		}
	}, [data.id, closedPage]);

	const filteredOpenPositions = openPositions.filter((pos) =>
		pos.pair.toLowerCase().includes(openSearch.toLowerCase())
	);

	const filteredClosedPositions = closedPositions.filter((pos) =>
		pos.pair.toLowerCase().includes(closedSearch.toLowerCase())
	);

	const totalOpenPages = Math.ceil(
		filteredOpenPositions.length / itemsPerPage
	);
	const totalClosedPages = Math.ceil(
		filteredClosedPositions.length / itemsPerPage
	);

	const paginatedOpenPositions = filteredOpenPositions.slice(
		(openPage - 1) * itemsPerPage,
		openPage * itemsPerPage
	);

	const paginatedClosedPositions = filteredClosedPositions.slice(
		(closedPage - 1) * itemsPerPage,
		closedPage * itemsPerPage
	);

	return (
		<div className="flex flex-col gap-6">
			{/* Open Positions */}
			<div className="positions-container">
				{/* Title and Search */}
				<div className="positions-header">
					<h3 className="positions-title">
						Open positions ({filteredOpenPositions.length})
					</h3>
					<div className="positions-search-wrapper">
						<div className="flex flex-col items-start gap-1 w-full">
							<div className="positions-search-input-container">
								<div className="flex flex-row items-center gap-2 flex-1">
									<Search className="w-5 h-5 text-[#B2B3BD]" />
									<input
										type="text"
										placeholder="Search..."
										value={openSearch}
										onChange={(e) =>
											setOpenSearch(e.target.value)
										}
										className="positions-search-input"
									/>
								</div>
							</div>
						</div>
					</div>
				</div>

				{isLoadingOpen && (
					<div className="text-center py-10 text-gray-400">
						Loading open positions...
					</div>
				)}

				{openError && (
					<div className="text-center py-10 text-red-500">
						{openError}
					</div>
				)}

				{!isLoadingOpen &&
					!openError &&
					filteredOpenPositions.length === 0 && (
						<div className="text-center py-10 text-gray-400">
							No open positions found
						</div>
					)}

				{!isLoadingOpen &&
					!openError &&
					paginatedOpenPositions.length > 0 && (
						<div className="positions-table">
							<div className="positions-table-header-row">
								<div
									className="positions-header-cell-left"
									style={{ width: "30%" }}
								>
									<span className="positions-header-cell">
										Pair
									</span>
								</div>
								<div
									className="positions-header-cell-center"
									style={{ width: "16%" }}
								>
									<span className="positions-header-cell">
										Spend
									</span>
								</div>
								<div
									className="positions-header-cell-right"
									style={{ width: "10%" }}
								>
									<span className="positions-header-cell">
										Profit
									</span>
								</div>
								<div
									className="positions-header-cell-right"
									style={{ width: "14%" }}
								>
									<span className="positions-header-cell">
										Value
									</span>
								</div>
								<div
									className="positions-header-cell-right-end"
									style={{ width: "30%" }}
								>
									<span className="positions-header-cell">
										Opened
									</span>
								</div>
							</div>

							{/* Data Rows */}
							{paginatedOpenPositions.map((position, index) => (
								<PositionRow
									key={index}
									position={position}
									index={index}
									status="open"
								/>
							))}
						</div>
					)}
				{!isLoadingOpen && !openError && totalOpenPages > 1 && (
					<Pagination
						currentPage={openPage}
						totalPages={totalOpenPages}
						itemsPerPage={itemsPerPage}
						totalItems={filteredOpenPositions.length}
						onPageChange={setOpenPage}
					/>
				)}
			</div>

			<div className="positions-container">
				<div className="positions-header">
					<h3 className="positions-title">
						Closed positions ({filteredClosedPositions.length})
					</h3>
					<div className="positions-search-wrapper">
						<div className="flex flex-col items-start gap-1 w-full">
							<div className="positions-search-input-container">
								<div className="flex flex-row items-center gap-2 flex-1">
									<Search className="w-5 h-5 text-[#B2B3BD]" />
									<input
										type="text"
										placeholder="Search..."
										value={closedSearch}
										onChange={(e) =>
											setClosedSearch(e.target.value)
										}
										className="positions-search-input"
									/>
								</div>
							</div>
						</div>
					</div>
				</div>

				{isLoadingClosed && (
					<div className="text-center py-10 text-gray-400">
						Loading closed positions...
					</div>
				)}

				{closedError && (
					<div className="text-center py-10 text-red-500">
						{closedError}
					</div>
				)}

				{!isLoadingClosed &&
					!closedError &&
					filteredClosedPositions.length === 0 && (
						<div className="text-center py-10 text-gray-400">
							No closed positions found
						</div>
					)}

				{!isLoadingClosed &&
					!closedError &&
					paginatedClosedPositions.length > 0 && (
						<div className="positions-table">
							<div className="positions-table-header-row">
								<div
									className="positions-header-cell-left"
									style={{ width: "30%" }}
								>
									<span className="positions-header-cell">
										Pair
									</span>
								</div>
								<div
									className="positions-header-cell-center"
									style={{ width: "16%" }}
								>
									<span className="positions-header-cell">
										Spend
									</span>
								</div>
								<div
									className="positions-header-cell-right"
									style={{ width: "10%" }}
								>
									<span className="positions-header-cell">
										Profit
									</span>
								</div>
								<div
									className="positions-header-cell-right"
									style={{ width: "14%" }}
								>
									<span className="positions-header-cell">
										Value
									</span>
								</div>
								<div
									className="positions-header-cell-right-end"
									style={{ width: "30%" }}
								>
									<span className="positions-header-cell">
										Closed
									</span>
								</div>
							</div>

							{/* Data Rows */}
							{paginatedClosedPositions.map((position, index) => (
								<PositionRow
									key={index}
									position={position}
									index={index}
									status="closed"
								/>
							))}
						</div>
					)}

				{/* Pagination */}
				{!isLoadingClosed && !closedError && totalClosedPages > 1 && (
					<Pagination
						currentPage={closedPage}
						totalPages={totalClosedPages}
						itemsPerPage={itemsPerPage}
						totalItems={filteredClosedPositions.length}
						onPageChange={setClosedPage}
					/>
				)}
			</div>
		</div>
	);
};

export default Positions;

const PositionRow = ({ position, index, status }: PositionRowProps) => {
	const isNegative = position.profit < 0;
	const isPositive = position.profit > 0;

	const formatCurrency = (value: number): string => {
		if (value >= 1_000_000) {
			return `$${(value / 1_000_000).toFixed(1)}M`;
		} else if (value >= 1_000) {
			return `$${(value / 1_000).toFixed(1)}K`;
		}
		return `$${value.toFixed(2)}`;
	};

	const formatDate = (timestamp: string): string => {
		try {
			const date = new Date(Number(timestamp) * 1000);
			return (
				date.toLocaleDateString("en-US", {
					year: "numeric",
					month: "2-digit",
					day: "2-digit",
				}) +
				", " +
				date.toLocaleTimeString("en-US", {
					hour: "2-digit",
					minute: "2-digit",
				})
			);
		} catch {
			return timestamp;
		}
	};

	return (
		<div
			className={`positions-table-data-row ${
				index % 2 === 0 ? "positions-table-data-row-even" : ""
			}`}
		>
			<div
				className="positions-data-cell-position"
				style={{ width: "30%" }}
			>
				<span className="positions-position-name">{position.pair}</span>
				<span className="positions-position-type">
					{status === "open" ? "Live" : "Closed"}
				</span>
			</div>

			<div
				className="positions-data-cell-remarks"
				style={{ width: "16%" }}
			>
				<span className="text-gray-300">
					{formatCurrency(position.spend)}
				</span>
			</div>

			<div
				className="positions-data-cell-profitability"
				style={{ width: "10%" }}
			>
				{isPositive && <GrowUpIcon size={16} color="#32BD65" />}
				{isNegative && <TrendDownIcon size={16} color="#F23645" />}
				<span
					className={
						isPositive
							? "positions-profitability-positive"
							: isNegative
							? "positions-profitability-negative"
							: "positions-profitability-neutral"
					}
				>
					{isPositive ? "+" : ""}
					{position.profit.toFixed(2)}%
				</span>
			</div>

			<div className="positions-data-cell-value" style={{ width: "14%" }}>
				<span className="positions-value-text">
					{formatCurrency(position.value)}
				</span>
			</div>

			<div
				className="positions-data-cell-opened"
				style={{ width: "30%" }}
			>
				<span className="positions-opened-text">
					{formatDate(position.open_time)}
				</span>
			</div>
		</div>
	);
};

const getPageNumbers = (currentPage: number, totalPages: number) => {
	const pages: (number | string)[] = [];
	if (totalPages <= 7) {
		for (let i = 1; i <= totalPages; i++) {
			pages.push(i);
		}
	} else {
		if (currentPage <= 3) {
			pages.push(1, 2, 3, "...", totalPages);
		} else if (currentPage >= totalPages - 2) {
			pages.push(1, "...", totalPages - 2, totalPages - 1, totalPages);
		} else {
			pages.push(1, "...", currentPage, "...", totalPages);
		}
	}
	return pages;
};

const Pagination = ({
	currentPage,
	totalPages,
	itemsPerPage,
	totalItems,
	onPageChange,
}: PaginationProps) => {
	const pages = getPageNumbers(currentPage, totalPages);
	const startItem = (currentPage - 1) * itemsPerPage + 1;
	const endItem = Math.min(currentPage * itemsPerPage, totalItems);

	return (
		<>
			<div className="positions-pagination-divider"></div>
			<div className="positions-pagination-container">
				<div className="positions-pagination-info">
					{startItem}-{endItem} items of {totalItems}
				</div>
				<div className="positions-pagination-controls">
					<button
						onClick={() =>
							onPageChange(Math.max(1, currentPage - 1))
						}
						disabled={currentPage === 1}
						className="positions-pagination-button"
					>
						<ChevronLeft className="w-4 h-4 text-white" />
					</button>
					{pages.map((page, idx) =>
						typeof page === "number" ? (
							<button
								key={idx}
								onClick={() => onPageChange(page)}
								className={
									currentPage === page
										? "positions-pagination-page-button-active"
										: "positions-pagination-page-button"
								}
							>
								{page}
							</button>
						) : (
							<span
								key={idx}
								className="positions-pagination-ellipsis"
							>
								{page}
							</span>
						)
					)}
					<button
						onClick={() =>
							onPageChange(Math.min(totalPages, currentPage + 1))
						}
						disabled={currentPage === totalPages}
						className="positions-pagination-button"
					>
						<ChevronRight className="w-4 h-4 text-white" />
					</button>
					<div className="positions-pagination-page-input-container">
						<span className="positions-pagination-page-label">
							Page
						</span>
						<input
							type="number"
							min="1"
							max={totalPages}
							value={currentPage}
							onChange={(e) => {
								const page = parseInt(e.target.value);
								if (page >= 1 && page <= totalPages) {
									onPageChange(page);
								}
							}}
							className="positions-pagination-page-input"
						/>
					</div>
				</div>
			</div>
		</>
	);
};
