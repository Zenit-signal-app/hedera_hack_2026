const MyDeposits = () => {
	return (
		<div className="box-border bg-dark-glass flex flex-col items-start p-3 gap-3 rounded-3xl border border-dark-gray-700">
			<h1 
				className="font-quickSan text-subtitle-2 font-bold text-white"
				style={{ textShadow: '0px 4px 4px rgba(0, 0, 0, 0.25)' }}
			>
				My deposits
			</h1>

			<div className="bg-dark-glass flex flex-row items-center p-3 px-4 gap-2 w-full rounded-lg">
				<div className="flex flex-col justify-center items-start flex-1">
					<div className="font-quickSan text-body-3 font-medium text-dark-gray-200 mb-0">
						Values
					</div>
					<div className="font-quickSan text-subtitle-2 font-bold text-white">
						$0.00
					</div>
				</div>
				<div className="flex flex-col justify-center items-start flex-1">
					<div className="font-quickSan text-body-3 font-medium text-dark-gray-200 mb-0">
						Shared
					</div>
					<div className="font-quickSan text-subtitle-2 font-bold text-white">
						0%
					</div>
				</div>
			</div>

			<div className="flex flex-row items-center gap-3 w-full">
				<button className="flex flex-row justify-center items-center py-2 px-3 gap-2 h-10 flex-1 bg-primary-700 rounded-lg font-museomoderno text-label-3 font-semibold text-white cursor-pointer hover:-translate-y-0.5 active:translate-y-0 transition-transform duration-200">
					Deposit
				</button>
				<button className="box-border flex flex-row justify-center items-center py-2 px-3 gap-2 h-10 flex-1 bg-dark-gray-950 border border-primary-600 rounded-lg font-museomoderno text-label-3 font-medium text-white cursor-pointer hover:-translate-y-0.5 active:translate-y-0 transition-transform duration-200">
					Redeem
				</button>
			</div>
		</div>
	);
};

export default MyDeposits;

