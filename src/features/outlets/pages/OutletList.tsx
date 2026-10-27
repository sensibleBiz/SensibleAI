import { OutletCard } from "@/features/outlets/components/outletList/outlet-card";
import type { Outlet } from "../types/types";
import { RootState } from "@/app/store";
import {
  ROUTES_PATHS,
} from "@/shared/lib/constants";
import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/app/store";
import { setOutletInfo, setTeamTreeData } from "@/app/store";
import { Navigate, useNavigate } from "react-router-dom";
import { useMessageApi } from "@/shared/hooks";
import { useOutletFeatureAccess } from "../hooks/useOutletFeatureAccess";
import dayjs from "dayjs";
import SpinLoader from "@/shared/components/SpinLoader";
import { OUTLET_FEATURE_KEYS } from "../../../shared/lib/sidebarMenuConfig";
import { outletApi } from "../api/outletApi";
import { teamTreeApi } from "@/features/team";
export default function OutletsPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const postgresAccess = useSelector((state: RootState) => state.auth.postgresAccess);
  const dispatch = useDispatch<AppDispatch>();
  const messageApi = useMessageApi();
  const navigate = useNavigate();
  const { hasOutletFeature } = useOutletFeatureAccess();
  const canManageFeatureAccess = Boolean(postgresAccess?.tenant.isTenantAdmin);
  const canAccessOutletMonitoring = Boolean(postgresAccess?.tenant.isTenantAdmin) || hasOutletFeature(OUTLET_FEATURE_KEYS.ALL_OUTLETS);

  // useEffect(() => {
  //   const fetchOutlets = async () => {
  //     try {
  //       if (!user?.outlets?.length) {
  //         setOutlets([]);
  //         setLoading(false);
  //         return;
  //       }

  //       // ✅ Firestore 'in' supports only up to 10 IDs
  //       const outletIds = user.outlets.slice(0, 10);

  //       const filters: FirestoreFilter[] = [
  //         { field: "id", operator: "in", value: outletIds },
  //       ];

  //       const { data, error } = await getCollectionData<Outlet>(
  //         COLLECTION_NAME.OUTLET,
  //         filters
  //       );

  //       if (error) console.error("Error fetching outlets:", error);
  //       // setOutlets(data ?? []);
  //       setOutlets(Array.isArray(data) ? data : data ? [data] : []);
  //     } catch (error) {
  //       console.error("Unexpected error:", error);
  //     } finally {
  //       setLoading(false);
  //     }
  //   };

  //   fetchOutlets();
  // }, [user?.outlets]);

  useEffect(() => {
    const loadOutlets = async () => {
      try {
        setLoading(true);

        if (!canAccessOutletMonitoring) {
          setOutlets([]);
          setLoading(false);
          return;
        }

        const result = await outletApi.list();
        setOutlets(result.items);
        setLoading(false);
      } catch (error) {
        console.error("Unexpected error in outlet subscription:", error);
        setLoading(false);
      }
    };

    void loadOutlets();
  }, [canAccessOutletMonitoring]);

  if (!canAccessOutletMonitoring) {
    return <Navigate to={ROUTES_PATHS.NO_ACCESS} replace />;
  }

  const filteredOutlets = outlets.filter((outlet) => {
    if (filter === "active") return outlet.active;
    if (filter === "inactive") return !outlet.active;
    return true;
  });

  // Calculate validity days
  const getValidityDays = (renewalDate: number) => {
    const today = new Date();
    const renewal = new Date(renewalDate);
    const diffTime = renewal.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleOutletSelect = async (outlet: Outlet) => {
    if (outlet) {
      if (!outlet?.active) {
        return messageApi.error(
          "Your Outlet is not Active. Contact Administrator."
        );
      }
      if (outlet.renewalDate && outlet.renewalDate / 1000 <= dayjs().unix()) {
        return messageApi.error(
          "Your Subscription has expired. Contact Administrator."
        );
      }
      dispatch(setOutletInfo(outlet)); // ✅ Redux logic stays here
      const result = await teamTreeApi.list(outlet.id, true);
      dispatch(setTeamTreeData(result.items));
      messageApi.success(`Selected Outlet is ${outlet?.name}`);
      navigate(ROUTES_PATHS.DASHBOARD);
    }
  };

  if (loading) {
    return <SpinLoader loading={loading} />;
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Outlet List</h1>
              <p className="text-gray-600 mt-1">
                Manage and monitor all your business outlets
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              {canManageFeatureAccess && (
                <button
                  type="button"
                  onClick={() => navigate(ROUTES_PATHS.OUTLET_FEATURE_ACCESS)}
                  className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  Feature Access
                </button>
              )}
              <p className="text-sm text-gray-600">
                Total Outlets:{" "}
                <span className="font-semibold">{outlets.length}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("active")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === "active"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setFilter("inactive")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === "inactive"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Inactive
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Loading outlets...</p>
            </div>
          </div>
        ) : filteredOutlets.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg">No outlets found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOutlets.map((outlet) => (
              <OutletCard
                key={outlet.id}
                outletInfo={outlet}
                name={outlet.name}
                branch={outlet.branch}
                dueDate={outlet.renewalDate}
                validity={getValidityDays(outlet.renewalDate)}
                active={outlet.active}
                address={outlet.address}
                city={outlet.city}
                onClick={handleOutletSelect} // ✅ pass callback
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
