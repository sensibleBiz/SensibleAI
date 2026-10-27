// Dealer wallet balance card

type WalletCardProps = {
  walletBalance: number;
  totalEarned: number;
  totalUsed: number;
};

const WalletCard = ({
  walletBalance,
  totalEarned,
  totalUsed,
}: WalletCardProps) => {
  return (
    <div className="bg-white rounded-2xl shadow border p-5">
      <h2 className="text-lg font-bold text-green-700">My Wallet</h2>

      <div className="mt-6">
        <p className="text-gray-600">Current Balance</p>
        <h3 className="text-4xl font-bold text-green-700">
          ₹ {walletBalance.toLocaleString("en-IN")}
        </h3>
        <p className="text-sm text-gray-500 mt-1">(1 Point = ₹1)</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-6 text-center">
        <div className="bg-green-50 rounded-xl p-3">
          <p className="text-xs text-gray-500">Total Earned</p>
          <h4 className="font-bold text-green-700">
            ₹{totalEarned.toLocaleString("en-IN")}
          </h4>
        </div>

        <div className="bg-red-50 rounded-xl p-3">
          <p className="text-xs text-gray-500">Total Used</p>
          <h4 className="font-bold text-red-600">
            ₹{totalUsed.toLocaleString("en-IN")}
          </h4>
        </div>

        <div className="bg-blue-50 rounded-xl p-3">
          <p className="text-xs text-gray-500">Available</p>
          <h4 className="font-bold text-blue-700">
            ₹{walletBalance.toLocaleString("en-IN")}
          </h4>
        </div>
      </div>

      <button className="w-full mt-6 border border-green-600 text-green-700 rounded-xl py-3 font-bold hover:bg-green-50">
        View Transactions
      </button>
    </div>
  );
};

export default WalletCard;