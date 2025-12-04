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
	variant?: TableVariant;
	className?: string;
	rowClassName?: string | ((row: TData, index: number) => string);
	showHeaderBorder?: boolean;
	showPagination?: boolean;
};

export function TableWrapper<TData>({
	columns,
	data,
	isLoading,
	pagination,
	setPageIndex,
	setPageSize,
	className,
	rowClassName,
	showHeaderBorder = true, // Mặc định hiển thị border
	variant = "default",
	showPagination = true, // Giá trị mặc định là "default"
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
		? "rounded-lg  shadow-lg w-full"
		: "w-full";
	const tableHeaderClass = isDefaultVariant
		? `bg-dark-gray-950 text-white border-r border-dark-gray-700 ${
				showHeaderBorder ? "border-b" : ""
		  }`
		: `bg-transparent ${
				showHeaderBorder ? "[&_tr]:border-b" : "[&_tr]:!border-none"
		  }`;
	const tableRowClass = isDefaultVariant
		? "border-b border-dark-gray-700 transition-colors hover:bg-muted/50"
		: "!border-none hover:bg-gray-100/50";
	const tableCellClass = isDefaultVariant
		? "py-3 border-r border-dark-gray-700 border-b"
		: "py-3 !border-none first:rounded-l-lg last:rounded-r-lg";
	const tableHeadClass = isDefaultVariant
		? "text-white/80 border-r border-dark-gray-700"
		: "border-none";

	const colSpan = columns.length;

	return (
		<div className={cn(tableClass, "font-quicksand", className)}>
			<div className="relative w-full overflow-auto">
				<Table>
					<TableHeader className={tableHeaderClass}>
						{table.getHeaderGroups().map((headerGroup) => (
							<React.Fragment key={headerGroup.id}>
								{/* Hàng Header chính */}
								<TableRow>
									{headerGroup.headers.map((header) => {
										return (
											<TableHead
												key={header.id}
												className={tableHeadClass}
											>
												{header.isPlaceholder
													? null
													: flexRender(
															header.column
																.columnDef
																.header,
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
							Array.from({ length: emptyRows }).map(
								(_, rowIndex) => (
									<TableRow
										key={rowIndex}
										className={
											isDefaultVariant
												? "border-b"
												: "border-none"
										}
									>
										{Array.from({ length: colSpan }).map(
											(_, colIndex) => (
												<TableCell
													key={colIndex}
													className={tableCellClass}
												>
													<div className="h-6 w-full" />
												</TableCell>
											)
										)}
									</TableRow>
								)
							)
						) : table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row, index) => {
								const customRowClass =
									typeof rowClassName === "function"
										? rowClassName(row.original, index)
										: rowClassName || "";

								return (
									<TableRow
										key={row.id}
										data-state={
											row.getIsSelected() && "selected"
										}
										className={cn(
											tableRowClass,
											index % 2 === 0 &&
												variant === "minimal"
												? "bg-dark-gray-900"
												: "bg-transparent",
											customRowClass
										)}
									>
										{row.getVisibleCells().map((cell) => (
											<TableCell
												key={cell.id}
												className={tableCellClass}
											>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext()
												)}
											</TableCell>
										))}
									</TableRow>
								);
							})
						) : (
							<TableRow>
								<TableCell
									colSpan={colSpan}
									className="h-24 text-center text-muted-foreground border-none"
								>
									Không có dữ liệu nào.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{showPagination ? (
				<ServerPagination
					pageIndex={pageIndex}
					pageSize={pageSize}
					totalPages={totalPages}
					totalRecords={totalRecords}
					setPageIndex={setPageIndex}
					setPageSize={setPageSize}
				/>
			) : null}
		</div>
	);
}
