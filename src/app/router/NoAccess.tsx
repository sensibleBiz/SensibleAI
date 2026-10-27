import { ROUTES_PATHS } from "@/shared/lib/constants";
import { Result, Button } from "antd";
import { Link, useLocation } from "react-router-dom";

interface AccessDeniedState {
  accessDeniedReason?: string;
}

export default function NoAccess() {
  const location = useLocation();
  const state = location.state as AccessDeniedState | null;

  return (
    <Result
      status="403"
      title="403"
      subTitle={
        state?.accessDeniedReason ??
        "You do not have permission to access this page in the selected outlet."
      }
      extra={
        <Button type="primary">
          <Link to={ROUTES_PATHS.DASHBOARD}>Go to dashboard</Link>
        </Button>
      }
    />
  );
}
