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
	const pageOptions = [10, 20, 30, 50, 100];

	return (
		<div className="flex items-center justify-between px-2 py-3 bg-card rounded-b-lg border-t border-border">
			<div className="flex items-center justify-center text-sm font-medium">
				Page {pageIndex + 1}/ {totalPages}
				<span className="ml-2 text-muted-foreground">
					(Total: {totalRecords} bản ghi)
				</span>
			</div>

			{/* Các nút điều hướng */}
			<div className="flex items-center space-x-2">
				<Button
					variant="default"
					className="h-8 w-8 p-0"
					onClick={() => setPageIndex(0)}
					disabled={pageIndex === 0}>
					<span className="sr-only">Go to first page</span>
					<ChevronsLeft className="h-4 w-4" />
				</Button>
				<Button
					variant="default"
					className="h-8 w-8 p-0"
					onClick={() => setPageIndex(pageIndex - 1)}
					disabled={pageIndex === 0}>
					<span className="sr-only">Go to previous page</span>
					<ChevronLeft className="h-4 w-4" />
				</Button>
				<Button
					variant="default"
					className="h-8 w-8 p-0"
					onClick={() => setPageIndex(pageIndex + 1)}
					disabled={pageIndex >= totalPages - 1}>
					<span className="sr-only">Go to next page</span>
					<ChevronRight className="h-4 w-4" />
				</Button>
				<Button
					variant="default"
					className="h-8 w-8 p-0"
					onClick={() => setPageIndex(totalPages - 1)}
					disabled={pageIndex >= totalPages - 1}>
					<span className="sr-only">Go to last page</span>
					<ChevronsRight className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
