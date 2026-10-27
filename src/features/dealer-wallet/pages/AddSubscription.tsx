import { useState } from "react";

const plans = [
  { name: "1 Month", reward: 400 },
  { name: "6 Months", reward: 2200 },
  { name: "12 Months", reward: 5000 },
];

const AddSubscription = () => {
  const [customerName, setCustomerName] = useState("");
  const [mobile, setMobile] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(plans[0]);

  const handleSubmit = () => {
    console.log({
      customerName,
      mobile,
      plan: selectedPlan.name,
      reward: selectedPlan.reward,
    });

    // TODO:
    // Save Subscription
    // Update Wallet
    // Create Wallet Transaction
  };

  return (
    <div className="p-6">
      <div className="bg-white rounded-xl shadow p-6 max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold mb-6">
          Add Subscription
        </h2>

        <div className="space-y-4">
          <div>
            <label className="font-medium">
              Customer Name
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) =>
                setCustomerName(e.target.value)
              }
              className="w-full border rounded-lg p-3 mt-1"
            />
          </div>

          <div>
            <label className="font-medium">
              Mobile Number
            </label>
            <input
              type="text"
              value={mobile}
              onChange={(e) =>
                setMobile(e.target.value)
              }
              className="w-full border rounded-lg p-3 mt-1"
            />
          </div>

          <div>
            <label className="font-medium">
              Subscription Plan
            </label>

            <select
              className="w-full border rounded-lg p-3 mt-1"
              onChange={(e) =>
                setSelectedPlan(
                  plans.find(
                    (p) =>
                      p.name === e.target.value
                  )!
                )
              }
            >
              {plans.map((plan) => (
                <option
                  key={plan.name}
                  value={plan.name}
                >
                  {plan.name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-gray-600">
              Reward Points
            </p>

            <h3 className="text-3xl font-bold text-green-700">
              +₹{selectedPlan.reward}
            </h3>
          </div>

          <button
            onClick={handleSubmit}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold"
          >
            Create Subscription
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddSubscription;