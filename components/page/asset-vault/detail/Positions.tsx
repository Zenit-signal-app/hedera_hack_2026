import { StrategyCardData } from "@/data/strategy";
import { positionsData, Position } from "@/data/positions";
import { useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import GrowUpIcon from "@/components/icon/Icon_GrowUp";
import TrendDownIcon from "@/components/icon/Icon_TrendDown";
import { useIsMobile } from "@/src/components/hooks/useIsMobile";

// ============================================================================
// Interfaces
// ============================================================================

interface PositionsProps {
	data: StrategyCardData;
}

interface PositionRowProps {
	position: Position;
	index: number;
}

interface PositionCardProps {
	position: Position;
}

interface PaginationProps {
	currentPage: number;
	totalPages: number;
	itemsPerPage: number;
	totalItems: number;
	onPageChange: (page: number) => void;
	isMobile: boolean;
}

interface PositionsTableProps {
	positions: Position[];
	isMobile: boolean;
}

const Positions = ({ data }: PositionsProps) => {
	const [openSearch, setOpenSearch] = useState("");
	const [closedSearch, setClosedSearch] = useState("");
	const [openPage, setOpenPage] = useState(1);
	const [closedPage, setClosedPage] = useState(1);
	const itemsPerPage = 10;
	const isMobile = useIsMobile();

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

				{/* Table or Cards */}
				<PositionsTable
					positions={paginatedOpenPositions}
					isMobile={isMobile}
				/>

				{/* Pagination */}
				{totalOpenPages > 1 && (
					<Pagination
						currentPage={openPage}
						totalPages={totalOpenPages}
						itemsPerPage={itemsPerPage}
						totalItems={filteredOpenPositions.length}
						onPageChange={setOpenPage}
						isMobile={isMobile}
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

				{/* Table or Cards */}
				<PositionsTable
					positions={paginatedClosedPositions}
					isMobile={isMobile}
				/>

				{/* Pagination */}
				{totalClosedPages > 1 && (
					<Pagination
						currentPage={closedPage}
						totalPages={totalClosedPages}
						itemsPerPage={itemsPerPage}
						totalItems={filteredClosedPositions.length}
						onPageChange={setClosedPage}
						isMobile={isMobile}
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
 * PositionsTable Component
 * Renders either desktop table or mobile cards based on device type
 */
const PositionsTable = ({ positions, isMobile }: PositionsTableProps) => {
	if (isMobile) {
		return (
			<div className="flex flex-col gap-2">
				{positions.map((position, index) => (
					<PositionCard key={index} position={position} />
				))}
			</div>
		);
	}

	return (
		<div className="positions-table">
			{/* Header Row */}
			<div className="positions-table-header-row">
				<div
					className="positions-header-cell-left"
					style={{ width: "30%" }}
				>
					<span className="positions-header-cell">Position</span>
				</div>
				<div
					className="positions-header-cell-center"
					style={{ width: "16%" }}
				>
					<span className="positions-header-cell">Remarks</span>
				</div>
				<div
					className="positions-header-cell-right"
					style={{ width: "10%" }}
				>
					<span className="positions-header-cell">Profitability</span>
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
					<span className="positions-header-cell">Opened</span>
				</div>
			</div>

			{/* Data Rows */}
			{positions.map((position, index) => (
				<PositionRow key={index} position={position} index={index} />
			))}
		</div>
	);
};

/**
 * PositionCard Component (Mobile View)
 * Displays position data in a card format for mobile devices
 */
const PositionCard = ({ position }: PositionCardProps) => {
	const isNegative = position.profitability.startsWith("-");
	const isPositive = !isNegative && parseFloat(position.profitability) > 0;

	const profitabilityColorClass = isPositive
		? "text-[#32BD65]"
		: isNegative
		? "text-[#F23645]"
		: "text-white";

	return (
		<div className="flex flex-col w-full bg-[#19191B] rounded-xl">
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-1.5 gap-1 min-h-[36px] border-b border-dark-gray-700">
				<div className="text-[14px] leading-6 tracking-[0.1px] text-white">
					{position.position}{" "}
					<span className="text-white/40">{position.type}</span>
				</div>
			</div>

			{/* Grid Container */}
			<div className="flex flex-wrap w-full">
				{/* Remarks */}
				<div className="flex flex-col justify-center px-3 py-1 gap-0.5 w-1/2 min-h-[58px]">
					<div className="text-[14px] leading-6 tracking-[0.1px] text-[#797B86]">
						Remarks
					</div>
					<div className="px-2 py-0.5 w-[50px] text-[14px] font-normal bg-[#854D0E] rounded-md text-white">
						Issue
					</div>
				</div>

				{/* Profitability */}
				<div className="flex flex-col justify-center items-end px-3 py-1 gap-0.5 w-1/2 min-h-[58px]">
					<div className="text-[14px] leading-6 tracking-[0.1px] text-[#797B86] w-full text-right">
						Profitability
					</div>
					<div
						className={`flex items-center justify-end gap-1text-[14px] leading-6 tracking-[0.1px] w-full ${profitabilityColorClass}`}
					>
						{isPositive && <GrowUpIcon size={16} color="#32BD65" />}
						{isNegative && (
							<TrendDownIcon size={16} color="#F23645" />
						)}
						{position.profitability}
					</div>
				</div>

				{/* Value */}
				<div className="flex flex-col justify-center px-3 py-1 gap-0.5 w-1/2 min-h-[58px]">
					<div className="text-[14px] leading-6 tracking-[0.1px] text-[#797B86]">
						Value
					</div>
					<div className="text-[14px] leading-6 tracking-[0.1px] text-white">
						{position.value}
					</div>
				</div>

				{/* Opened */}
				<div className="flex flex-col justify-center items-end px-3 py-1 gap-0.5 w-1/2 min-h-[58px]">
					<div className="text-[14px] leading-6 tracking-[0.1px] text-[#797B86] w-full text-right">
						Opened
					</div>
					<div className="flex items-center justify-end gap-3 w-full">
						<div className="text-[14px] leading-6 tracking-[0.1px] text-white">
							{position.opened}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

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
	isMobile = false,
}: PaginationProps) => {
	const pages = getPageNumbers(currentPage, totalPages);
	const startItem = (currentPage - 1) * itemsPerPage + 1;
	const endItem = Math.min(currentPage * itemsPerPage, totalItems);

	return (
		<>
			{/* Divider */}
			<div className="positions-pagination-divider"></div>
			<div className="positions-pagination-container">
				{!isMobile && (
					<div className="positions-pagination-info">
						{startItem}-{endItem} items of {totalItems}
					</div>
				)}
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
					{!isMobile && (
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
					)}
				</div>
			</div>
		</>
	);
};
