import { StrategyCardData } from "@/data/strategy";
import { positionsData, Position } from "@/data/positions";
import { useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import GrowUpIcon from "@/components/icon/Icon_GrowUp";
import TrendDownIcon from "@/components/icon/Icon_TrendDown";

interface PositionsProps {
	data: StrategyCardData;
}

interface PositionRowProps {
	position: Position;
	index: number;
}

interface PaginationProps {
	currentPage: number;
	totalPages: number;
	itemsPerPage: number;
	totalItems: number;
	onPageChange: (page: number) => void;
}

const Positions = ({ data }: PositionsProps) => {
	const [openSearch, setOpenSearch] = useState("");
	const [closedSearch, setClosedSearch] = useState("");
	const [openPage, setOpenPage] = useState(1);
	const [closedPage, setClosedPage] = useState(1);
	const itemsPerPage = 10;

	const filteredOpenPositions = positionsData.open_positions.filter((pos) =>
		pos.position.toLowerCase().includes(openSearch.toLowerCase())
	);

	const filteredClosedPositions = positionsData.closed_positions.filter(
		(pos) => pos.position.toLowerCase().includes(closedSearch.toLowerCase())
	);

	// Pagination logic
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

				{/* Table */}
				<div className="positions-table">
					{/* Header Row */}
					<div className="positions-table-header-row">
						<div
							className="positions-header-cell-left"
							style={{ width: "30%" }}
						>
							<span className="positions-header-cell">
								Position
							</span>
						</div>
						<div
							className="positions-header-cell-center"
							style={{ width: "16%" }}
						>
							<span className="positions-header-cell">
								Remarks
							</span>
						</div>
						<div
							className="positions-header-cell-right"
							style={{ width: "10%" }}
						>
							<span className="positions-header-cell">
								Profitability
							</span>
						</div>
						<div
							className="positions-header-cell-right"
							style={{ width: "14%" }}
						>
							<span className="positions-header-cell">Value</span>
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
						/>
					))}
				</div>

				{/* Pagination */}
				{totalOpenPages > 1 && (
					<Pagination
						currentPage={openPage}
						totalPages={totalOpenPages}
						itemsPerPage={itemsPerPage}
						totalItems={filteredOpenPositions.length}
						onPageChange={setOpenPage}
					/>
				)}
			</div>

			{/* Closed Positions */}
			<div className="positions-container">
				{/* Title and Search */}
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

				{/* Table */}
				<div className="positions-table">
					{/* Header Row */}
					<div className="positions-table-header-row">
						<div
							className="positions-header-cell-left"
							style={{ width: "30%" }}
						>
							<span className="positions-header-cell">
								Position
							</span>
						</div>
						<div
							className="positions-header-cell-center"
							style={{ width: "16%" }}
						>
							<span className="positions-header-cell">
								Remarks
							</span>
						</div>
						<div
							className="positions-header-cell-right"
							style={{ width: "10%" }}
						>
							<span className="positions-header-cell">
								Profitability
							</span>
						</div>
						<div
							className="positions-header-cell-right"
							style={{ width: "14%" }}
						>
							<span className="positions-header-cell">Value</span>
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
					{paginatedClosedPositions.map((position, index) => (
						<PositionRow
							key={index}
							position={position}
							index={index}
						/>
					))}
				</div>

				{/* Pagination */}
				{totalClosedPages > 1 && (
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

// ============================================================================
// Child Components
// ============================================================================

/**
 * PositionRow Component
 * Renders a single position row in the table
 */
const PositionRow = ({ position, index }: PositionRowProps) => {
	const isNegative = position.profitability.startsWith("-");
	const isPositive = !isNegative && parseFloat(position.profitability) > 0;

	return (
		<div
			className={`positions-table-data-row ${
				index % 2 === 0 ? "positions-table-data-row-even" : ""
			}`}
		>
			{/* Position Cell - 30% */}
			<div
				className="positions-data-cell-position"
				style={{ width: "30%" }}
			>
				<span className="positions-position-name">
					{position.position}
				</span>
				<span className="positions-position-type">{position.type}</span>
			</div>

			{/* Remarks Cell - 16% */}
			<div
				className="positions-data-cell-remarks"
				style={{ width: "16%" }}
			>
				{position.remarks === "issue" && (
					<div className="positions-remarks-badge">Issue</div>
				)}
			</div>

			{/* Profitability Cell - 10% */}
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
					{position.profitability}
				</span>
			</div>

			{/* Value Cell - 14% */}
			<div className="positions-data-cell-value" style={{ width: "14%" }}>
				<span className="positions-value-text">{position.value}</span>
			</div>

			{/* Opened Cell - 30% */}
			<div
				className="positions-data-cell-opened"
				style={{ width: "30%" }}
			>
				<span className="positions-opened-text">{position.opened}</span>
				<button className="positions-details-button">Details</button>
			</div>
		</div>
	);
};

/**
 * Helper function to generate page numbers for pagination
 */
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

/**
 * Pagination Component
 * Renders pagination controls with page numbers and navigation buttons
 */
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
			{/* Divider */}
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
