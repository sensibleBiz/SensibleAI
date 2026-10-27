import { Button } from "antd";
import { XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function EventPaymentFailedPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-sm">
        <XCircle className="mx-auto text-red-600" size={64} />
        <h1 className="mt-5 text-2xl font-semibold text-slate-950">Payment Failed</h1>
        <p className="text-slate-600">Please try again.</p>
        <Button type="primary" danger className="mt-4" onClick={() => navigate(-1)}>
          Retry Payment
        </Button>
      </div>
    </div>
  );
}
