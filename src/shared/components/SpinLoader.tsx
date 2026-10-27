import { Spin } from "antd";

interface SpinLoaderProps {
  loading?: boolean;
  height?: string | number;
}

const SpinLoader: React.FC<SpinLoaderProps> = ({
  loading = true,
  height = "90vh",
}) => {
  if (!loading) return null;

  return (
    <div
      style={{
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Spin size="large" />
    </div>
  );
};

export default SpinLoader;
