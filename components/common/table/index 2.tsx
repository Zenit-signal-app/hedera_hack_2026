/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo } from "react";
import {
	useReactTable,
	flexRender,
	getCoreRowModel,
	ColumnDef,
	getPaginationRowModel,
} from "@tanstack/react-table";

import { ServerPagination } from "../pagination";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/ultils";

type TableVariant = "default" | "minimal";

type TProps<TData> = {
	columns: ColumnDef<TData, any>[];
	data: TData[];
	isLoading: boolean;
	pagination: {
		pageIndex: number;
		pageSize: number;
		totalPages: number;
		totalRecords: number;
	};
	setPageIndex: (page: number) => void;
	setPageSize: (page: number) => void;
	variant?: TableVariant; // Thêm prop variant
};

export function TableWrapper<TData>({
	columns,
	data,
	isLoading,
	pagination,
	setPageIndex,
	setPageSize,
	variant = "default", // Giá trị mặc định là "default"
}: TProps<TData>) {
	const { pageIndex, pageSize, totalPages, totalRecords } = pagination;
	const tableData = useMemo(() => data || ([] as TData[]), [data]);
	const controlledState = useMemo(
		() => ({
			pagination: { pageIndex, pageSize },
		}),
		[pageIndex, pageSize]
	);

	const table = useReactTable({
		data: tableData,
		columns,
		getCoreRowModel: getCoreRowModel(),
		manualPagination: true,
		pageCount: totalPages,
		state: controlledState,
		getPaginationRowModel: getPaginationRowModel(),
	});

	// Số hàng trống cần hiển thị trong trạng thái loading
	const emptyRows = pageSize;

	// Xử lý các class CSS dựa trên variant
	const isDefaultVariant = variant === "default";
	const tableClass = isDefaultVariant
		? "rounded-lg border-dark-gray-700 border shadow-lg w-full"
		: "w-full";
	const tableHeaderClass = isDefaultVariant
		? "bg-dark-gray-950 border-b text-white border-r border-dark-gray-700"
		: "bg-transparent border-none";
	const tableRowClass = isDefaultVariant
		? "border-b border-dark-gray-700 transition-colors hover:bg-muted/50"
		: "border-none hover:bg-gray-100/50";
	const tableCellClass = isDefaultVariant
		? "py-3 border-r border-dark-gray-700 border-b"
		: "py-3 border-none";
	const tableHeadClass = isDefaultVariant
		? "text-white/80 border-r border-dark-gray-700"
		: "border-none";

	const colSpan = columns.length;

	return (
		<div className={cn(tableClass, "font-quicksand")}>
			<div className="relative w-full overflow-auto">
				<Table>
					<TableHeader className={tableHeaderClass}>
						{table.getHeaderGroups().map((headerGroup) => (
							<React.Fragment key={headerGroup.id}>
								{/* Hàng Header chính */}
								<TableRow>
									{headerGroup.headers.map((header) => {
										return (
											<TableHead key={header.id} className={tableHeadClass}>
												{header.isPlaceholder
													? null
													: flexRender(
															header.column.columnDef.header,
															header.getContext()
													  )}
											</TableHead>
										);
									})}
								</TableRow>
							</React.Fragment>
						))}
					</TableHeader>

					{/* Body Bảng */}
					<TableBody>
						{isLoading ? (
							Array.from({ length: emptyRows }).map((_, rowIndex) => (
								<TableRow
									key={rowIndex}
									className={isDefaultVariant ? "border-b" : "border-none"}>
									{Array.from({ length: colSpan }).map((_, colIndex) => (
										<TableCell key={colIndex} className={tableCellClass}>
											<div className="h-6 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row, index) => (
								<TableRow
									key={row.id}
									data-state={row.getIsSelected() && "selected"}
									className={cn(
										tableRowClass,
										index % 2 === 0 && variant === "minimal"
											? "bg-dark-gray-900"
											: "bg-transparent"
									)}>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id} className={tableCellClass}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext()
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							// Trạng thái Không có dữ liệu
							<TableRow>
								<TableCell
									colSpan={colSpan} // Sử dụng colSpan
									className="h-24 text-center text-muted-foreground border-none">
									Không có dữ liệu nào.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			<ServerPagination
				pageIndex={pageIndex}
				pageSize={pageSize}
				totalPages={totalPages}
				totalRecords={totalRecords}
				setPageIndex={setPageIndex}
				setPageSize={setPageSize}
			/>
		</div>
	);
}
