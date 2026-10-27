import { useEffect, useState } from "react";
import {
  GoogleMap,
  Marker,
  InfoWindow,
  useLoadScript,
  DirectionsRenderer,
} from "@react-google-maps/api";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import { useMessageApi } from "@/shared/hooks";
import { APP_MESSAGES } from "@/shared/lib/constants";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";
import SpinLoader from "@/shared/components/SpinLoader";
import { Button } from "antd";
import { userTrackingApi, type UserTrackingPoint } from "../api/userTrackingApi";
interface Props {
  userID: string;
  date: string;
}

// Brand palette — kept consistent with the other CRM report pages
const BRAND_NAVY = "#0a3750";
const BRAND_RED = "#ff3228";

const containerStyle = {
  width: "100%",
  height: "90vh",
};

const chunkRoutePoints = <T,>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length - 1; i += size - 1) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const buildRoute = async (points: UserTrackingPoint[]) => {
  if (points.length < 2) return { directions: [], totalKm: 0 };

  const directionsService = new google.maps.DirectionsService();
  const chunks = chunkRoutePoints(points, 25);
  let totalMeters = 0;
  const directions: google.maps.DirectionsResult[] = [];

  for (const chunk of chunks) {
    if (chunk.length < 2) continue;
    const result = await new Promise<google.maps.DirectionsResult | null>(
      (resolve) => {
        directionsService.route(
          {
            origin: { lat: chunk[0].latitude, lng: chunk[0].longitude },
            destination: {
              lat: chunk[chunk.length - 1].latitude,
              lng: chunk[chunk.length - 1].longitude,
            },
            waypoints: chunk.slice(1, -1).map((point) => ({
              location: { lat: point.latitude, lng: point.longitude },
              stopover: true,
            })),
            travelMode: google.maps.TravelMode.DRIVING,
          },
          (response, status) =>
            resolve(status === "OK" && response ? response : null),
        );
      },
    );
    if (!result) continue;
    directions.push(result);
    result.routes[0]?.legs.forEach((leg) => {
      totalMeters += leg.distance?.value ?? 0;
    });
  }

  return {
    directions,
    totalKm: Number((totalMeters / 1_000).toFixed(2)),
  };
};

export default function TrackingMap({ userID, date }: Props) {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: "AIzaSyDFp96VcVzE6-vKUabjbu7XI3YddD6L2O4",
  });

  const [locations, setLocations] = useState<UserTrackingPoint[]>([]);
  const [selected, setSelected] = useState<UserTrackingPoint | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult[]>([]);
  const [totalKm, setTotalKm] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const outletId = useSelector(
    (state: RootState) => state?.appState?.outletInfo?.id
  );

  const messageApi = useMessageApi();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLocations([]);
    setSelected(null);
    setNextCursor(null);
    if (!outletId || !userID || !date) {
      setLoading(false);
      return () => controller.abort();
    }

    const loadHistory = async () => {
      try {
        const page = await userTrackingApi.listHistory(
          { outletId, userId: userID, date, limit: 250 },
          controller.signal,
        );
        setLocations([...page.items].sort((a, b) => a.timestamp - b.timestamp));
        setNextCursor(page.nextCursor);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.log(error);
        messageApi.error(
          error instanceof Error ? error.message : APP_MESSAGES.ERROR_FETCH,
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void loadHistory();
    return () => controller.abort();
  }, [outletId, userID, date, messageApi]);

  useEffect(() => {
    let cancelled = false;
    if (!isLoaded) return undefined;
    void buildRoute(locations).then((route) => {
      if (cancelled) return;
      setDirections(route.directions);
      setTotalKm(route.totalKm);
    });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, locations]);

  const handleLoadEarlier = async () => {
    if (!outletId || !nextCursor || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const page = await userTrackingApi.listHistory({
        outletId,
        userId: userID,
        date,
        limit: 250,
        cursor: nextCursor,
      });
      setLocations((current) => {
        const byId = new Map(current.map((point) => [point.id, point]));
        page.items.forEach((point) => byId.set(point.id, point));
        return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
      });
      setNextCursor(page.nextCursor);
    } catch (error) {
      console.error(error);
      messageApi.error(
        error instanceof Error ? error.message : APP_MESSAGES.ERROR_FETCH,
      );
    } finally {
      setLoadingEarlier(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-slate-500">
        Loading map…
      </div>
    );
  }

  if (loading) {
    return <SpinLoader loading={loading} />;
  }

  if (locations.length === 0) {
    return (
      <div className="flex h-[40vh] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
        No location history found.
      </div>
    );
  }

  const firstLocation = {
    lat: Number(locations[0]?.latitude),
    lng: Number(locations[0]?.longitude),
  };

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={firstLocation}
      zoom={14}
    >
      {/* Start Point */}
      <Marker
        position={{
          lat: Number(locations[0].latitude),
          lng: Number(locations[0].longitude),
        }}
        icon={{
          url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png",
        }}
        label={{
          text: "Start",
          color: BRAND_NAVY,
          fontSize: "18px",
          fontWeight: "bold",
        }}
      />

      {/* End Point */}
      <Marker
        position={{
          lat: Number(locations[locations.length - 1].latitude),
          lng: Number(locations[locations.length - 1].longitude),
        }}
        icon={{
          url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
        }}
        label={{
          text: "End",
          color: BRAND_NAVY,
          fontSize: "18px",
          fontWeight: "bold",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          background: "#fff",
          padding: "10px 14px",
          borderRadius: 8,
          borderLeft: `4px solid ${BRAND_NAVY}`,
          boxShadow: "0 2px 10px rgba(10,55,80,0.18)",
          zIndex: 999,
        }}
      >
        <strong style={{ color: BRAND_NAVY }}>
          {formatEmployeeName(locations[0]?.name, "-")}
        </strong>
        <div style={{ color: "#475569", fontSize: 13, marginTop: 2 }}>
          {nextCursor ? "Loaded Travel" : "Total Travel"}:{" "}
          <span style={{ color: BRAND_RED, fontWeight: 600 }}>{totalKm} km</span>
        </div>
      </div>

      {nextCursor && (
        <div style={{ position: "absolute", top: 10, right: 10, zIndex: 999 }}>
          <Button loading={loadingEarlier} onClick={() => void handleLoadEarlier()}>
            Load earlier locations
          </Button>
        </div>
      )}

      {locations.map((loc, index) => (
        <Marker
          key={index}
          position={{
            lat: Number(loc.latitude),
            lng: Number(loc.longitude),
          }}
          label={(index + 1).toString()}
          onClick={() => setSelected(loc)}
        />
      ))}
      {Array.isArray(directions) &&
        directions.map((dir, i) => (
          <DirectionsRenderer
            key={i}
            directions={dir}
            options={{
              suppressMarkers: true,
              polylineOptions: {
                strokeColor: BRAND_NAVY,
                strokeWeight: 5,
              },
            }}
          />
        ))}

      {selected && (
        <InfoWindow
          position={{ lat: selected?.latitude, lng: selected?.longitude }}
          onCloseClick={() => setSelected(null)}
        >
          <div style={{ maxWidth: "200px" }}>
            <strong style={{ color: BRAND_NAVY }}>Name</strong>
            <div>{formatEmployeeName(selected?.name, "-")}</div>
            <br />
            <strong style={{ color: BRAND_NAVY }}>Address</strong>
            <div>{selected?.address}</div>
            <br />

            <strong style={{ color: BRAND_NAVY }}>Time</strong>
            <div>
              {new Date(selected.timestamp).toLocaleString()}
            </div>
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
