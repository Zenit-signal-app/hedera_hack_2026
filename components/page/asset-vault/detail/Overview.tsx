import CommonLineChart, {
	ChartDataPoint,
	TimeFilterOption,
} from "@/components/common/chart/Line";
import GrowDownIcon from "@/components/icon/Icon_GrowDown";

const Overview = () => {
	const mockData: ChartDataPoint[] = [
		{ date: "Aug 1", value: 100 },
		{ date: "Aug 8", value: 95 },
		{ date: "Aug 15", value: 98 },
		{ date: "Aug 22", value: 90 },
		{ date: "Sep 8", value: 85 },
		{ date: "Sep 15", value: 80 },
		{ date: "Sep 22", value: 82 },
		{ date: "Oct 8", value: 78 },
		{ date: "Oct 15", value: 75 },
		{ date: "Oct 22", value: 72 },
		{ date: "Nov 1", value: 70 },
		{ date: "Nov 8", value: 75 },
		{ date: "Nov 15", value: 68 },
		{ date: "Nov 22", value: 85 },
	];

	const filterOptions: TimeFilterOption[] = [
		{ key: "1W", label: "1W" },
		{ key: "1M", label: "1M" },
		{ key: "3M", label: "3M" },
		{ key: "MAX", label: "Max" }, 
	];
	return (
		<div className="rounded-b-xl">
			<CommonLineChart
				data={mockData}
				lineColor="#EC4B6B"
				dataKeyX="date"
				dataKeyY="value"
				timeFilters={filterOptions}
				headerTitle={
					<div className="flex items-center text-dark-gray-200">
						<div className="text-red-500 py-0.5 px-3 bg-red-500/10 rounded-md">
							<GrowDownIcon size={16} /> 9.6%
						</div>
						past 90 days 
					</div>
				}
				height={300}
			/>

			<div>
				<div>
					<div><p>Annual return</p></div>
				</div>
			</div>
		</div>
	);
};

export default Overview;
