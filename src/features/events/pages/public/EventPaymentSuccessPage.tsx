import { Button } from "antd";
import { CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function EventPaymentSuccessPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto text-emerald-600" size={64} />
        <h1 className="mt-5 text-2xl font-semibold text-slate-950">Payment Successful</h1>
        <p className="text-slate-600">Your event registration is confirmed.</p>
        <Button type="primary" className="mt-4" onClick={() => navigate("/")}>
          Back to Home
        </Button>
      </div>
    </div>
  );
}
