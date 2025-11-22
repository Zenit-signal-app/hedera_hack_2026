"use client";

import TabsWrapper from "@/components/common/tabs";
import ChevronLeftMiniIcon from "@/components/icon/ChevronLeftMiniICon";
import { mockStrategies } from "@/data/strategy";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import Overview from "./Overview";

const DetailPage = () => {
	const params = useParams();

	const assetId = params?.id;

	const tokenDetail = mockStrategies.find((item) => item.id === assetId);

	return (
		<div className="flex flex-col gap-y-5">
			<Link
				href={"/asset-vault"}
				className="text-white flex items-center gap-x-2 text-base font-bold font-exo">
				<div className="p-1 bg-dark-gray-900 w-max rounded-sm">
					<ChevronLeftMiniIcon size={24} />
				</div>{" "}
				Back
			</Link>

			<div className="bg-[url(/images/bg_box.png)] bg-center  bg-cover bg-no-repeat pt-6 px-4 rounded-4xl  border border-dark-gray-700">
				<div className="flex items-center w-full gap-x-4">
					<Image
						src="/images/eth.png"
						width={56}
						height={56}
						alt="Token Image"
						className="w-14 h-14 rounded-full"
					/>
					<div className="font-quicksand">
						<p className="text-xl  font-bold">{tokenDetail?.title}</p>
						<p className="text-base text-dark-gray-100">
							{tokenDetail?.description}
						</p>
					</div>
				</div>
				<TabsWrapper
					tabs={[
						{ value: "overview", label: "Overview" },
						{ value: "performance", label: "Performance" },
						{ value: "positions", label: "Positions" },
						{ value: "assets", label: "Assets" },
						{ value: "technical", label: "Technical" },
					]}
					variant="underline"
					defaultValue="overview"
				/>
			</div>

			<div className="grid lg:grid-cols-3 gap-x-4">
				<div className="col-span-2">
					<Overview />
				</div>
			</div>
		</div>
	);
};

export default DetailPage;
