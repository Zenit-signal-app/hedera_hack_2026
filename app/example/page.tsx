/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import React, { useState, useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { TableWrapper } from "@/components/common/table";

interface User {
	id: number;
	name: string;
	email: string;
	role: "Admin" | "User" | "Guest";
	createdAt: string;
}

// Dữ liệu giả lập
const mockData: User[] = [
	{
		id: 1,
		name: "Alice Johnson",
		email: "alice@example.com",
		role: "Admin",
		createdAt: "2024-10-01",
	},
	{
		id: 2,
		name: "Bob Smith",
		email: "bob@example.com",
		role: "User",
		createdAt: "2024-10-05",
	},
	{
		id: 3,
		name: "Charlie Brown",
		email: "charlie@example.com",
		role: "Guest",
		createdAt: "2024-10-10",
	},
	{
		id: 4,
		name: "David Lee",
		email: "david@example.com",
		role: "User",
		createdAt: "2024-10-15",
	},
	{
		id: 5,
		name: "Eva Mendes",
		email: "eva@example.com",
		role: "Admin",
		createdAt: "2024-10-20",
	},
];

export function UserTable() {
	// 2. State quản lý phân trang (giả định)
	const [pagination, setPagination] = useState({
		pageIndex: 0,
		pageSize: 5,
		totalPages: 2, // Giả định có 10 bản ghi, mỗi trang 5
		totalRecords: 10,
	});

	const [isLoading, setIsLoading] = useState(false);
	const [variant, setVariant] = useState<"default" | "minimal">("default");

	const setPageIndex = (page: number) => {
		setPagination((prev) => ({ ...prev, pageIndex: page }));
	};
	const setPageSize = (size: number) => {
		setPagination((prev) => ({ ...prev, pageSize: size }));
	};

	// 3. Định nghĩa mảng columns (ColumnDef<TData, any>[])
	const columns = useMemo<ColumnDef<User, any>[]>(
		() => [
			{
				accessorKey: "id",
				header: () => <div className="text-left">ID</div>,
				cell: ({ row }) => <div className="font-medium">{row.original.id}</div>,
				enableSorting: false,
				enableColumnFilter: false,
			},
			{
				accessorKey: "name",
				header: "Tên người dùng",
				cell: (info) => info.getValue(),
			},
			{
				accessorKey: "email",
				header: "Email",
				cell: (info) => info.getValue(),
			},
			{
				accessorKey: "role",
				header: "Vai trò",
				cell: ({ row }) => {
					const role = row.original.role;
					// Ví dụ: Render cell dựa trên giá trị (tô màu vai trò)
					const colorClass =
						role === "Admin" ? "text-red-500 font-bold" : "text-green-500";
					return <span className={colorClass}>{role}</span>;
				},
			},
			{
				accessorKey: "createdAt",
				header: "Ngày tạo",
				cell: (info) => info.getValue(),
			},
			{
				id: "actions",
				header: "Hành động",
				cell: () => (
					<button className="text-blue-500 hover:underline text-sm">
						Xem chi tiết
					</button>
				),
				enableSorting: false,
				enableColumnFilter: false,
			},
		],
		[]
	);

	return (
		<div className="space-y-4 p-6 bg-dark-gray-950">
			<div className="flex gap-4">
				<button
					onClick={() => setVariant("default")}
					className={`px-4 py-2 rounded ${
						variant === "default"
							? "bg-blue-600 text-white"
							: "bg-gray-200 text-gray-800"
					}`}>
					Default Table (Có Filter)
				</button>
				<button
					onClick={() => setVariant("minimal")}
					className={`px-4 py-2 rounded ${
						variant === "minimal"
							? "bg-blue-600 text-white"
							: "bg-gray-200 text-gray-800"
					}`}>
					Minimal Table (Tối giản)
				</button>
			</div>

			<TableWrapper<User>
				columns={columns}
				data={mockData.slice(0, pagination.pageSize)} // Chỉ lấy dữ liệu cho trang hiện tại
				isLoading={isLoading}
				pagination={pagination}
				setPageIndex={setPageIndex}
				setPageSize={setPageSize}
				variant={variant} // Truyền variant đã chọn
			/>
		</div>
	);
}

export default UserTable;
