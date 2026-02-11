import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
/**
 * Component Pagination (Phân trang) cho TanStack Table.
 * @param {object} props
 * @param {number} pageIndex - Chỉ số trang hiện tại (0-based).
 * @param {number} pageSize - Số lượng bản ghi mỗi trang.
 * @param {number} totalPages - Tổng số trang (từ server).
 * @param {number} totalRecords - Tổng số bản ghi (từ server).
 * @param {function} setPageIndex - Hàm để thay đổi chỉ số trang.
 * @param {function} setPageSize - Hàm để thay đổi số lượng bản ghi mỗi trang.
 */

type TProps = {
	pageIndex: number;
	pageSize: number;
	totalPages: number;
	totalRecords: number;
	setPageIndex: (page: number) => void;
	setPageSize: (page: number) => void;
};
export function ServerPagination({
	pageIndex,
	pageSize,
	totalPages,
	totalRecords,
	setPageIndex,
	setPageSize,
}: TProps) {
	// Defensive normalization to avoid NaN and runtime errors
	const totalNum = Math.max(0, Number(totalPages) || 0);
	const pageIdx = Number.isFinite(Number(pageIndex)) ? Math.max(0, Math.floor(Number(pageIndex))) : 0;
	const current = totalNum === 0 ? 0 : Math.min(Math.max(1, pageIdx + 1), totalNum);

	const buildPages = (): Array<number | string> => {
		const total = totalNum;
		if (total === 0) return [];
		if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

		// If current is 0 for some reason, fall back to showing first and last
		if (current === 0) return [1, "...", total];

		if (current <= 4) {
			return [1, 2, 3, 4, "...", total];
		}

		if (current >= total - 3) {
			return [1, "...", total - 3, total - 2, total - 1, total];
		}

		return [1, "...", current - 1, current, current + 1, "...", total];
	};

	const pages = buildPages();

	const canPrev = pageIdx > 0;
	const canNext = pageIdx < Math.max(0, totalNum - 1);

	return (
		<div className="flex items-center justify-end px-2 py-3 bg-card rounded-b-lg">
			<div className="flex items-center space-x-2">
				<Button
					variant="default"
					className="h-8 w-8 p-0"
					onClick={() => setPageIndex(0)}
					disabled={!canPrev}
				>
					<span className="sr-only">Go to first page</span>
					<ChevronsLeft className="h-4 w-4" />
				</Button>
				<Button
					variant="default"
					className="h-8 w-8 p-0"
					onClick={() => setPageIndex(Math.max(0, pageIdx - 1))}
					disabled={!canPrev}
				>
					<span className="sr-only">Go to previous page</span>
					<ChevronLeft className="h-4 w-4" />
				</Button>

				<div className="hidden sm:flex items-center space-x-1">
					{pages.map((p, idx) =>
						typeof p === "string" ? (
							<span key={`e-${idx}`} className="px-2 text-sm text-dark-gray-200">
								{p}
							</span>
						) : (
							<Button
								key={`p-${idx}`}
								variant={p === current ? "secondary" : "ghost"}
								className={`h-8 min-w-[36px] px-2 ${p === current ? "bg-primary-700 text-white" : "text-white"}`}
								onClick={() => setPageIndex(p - 1)}
							>
								{p}
							</Button>
						)
					)}
				</div>

				<Button
					variant="default"
					className="h-8 w-8 p-0"
					onClick={() => setPageIndex(Math.min(Math.max(0, totalNum - 1), pageIdx + 1))}
					disabled={!canNext}
				>
					<span className="sr-only">Go to next page</span>
					<ChevronRight className="h-4 w-4" />
				</Button>
				<Button
					variant="default"
					className="h-8 w-8 p-0"
					onClick={() => setPageIndex(Math.max(0, totalNum - 1))}
					disabled={!canNext}
				>
					<span className="sr-only">Go to last page</span>
					<ChevronsRight className="h-4 w-4" />
				</Button>
			</div>

			<div className="ml-3 text-sm text-dark-gray-200">
				Page {current} of {totalNum}
			</div>
		</div>
	);
}
