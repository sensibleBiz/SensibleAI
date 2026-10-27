import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from "node:fs"
import path from "node:path"
import tsconfigPaths from "vite-tsconfig-paths"
// https://vite.dev/config/
const certificatePath = path.resolve(".cert/localhost.pem")
const keyPath = path.resolve(".cert/localhost-key.pem")
const hasLocalCertificate = fs.existsSync(certificatePath) && fs.existsSync(keyPath)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const useLocalHttps = hasLocalCertificate && env.VITE_HTTPS === "true"
  const apiProxyTarget = (env.VITE_API_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "")

  return {
    plugins: [tailwindcss(), react(), tsconfigPaths()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      ...(useLocalHttps
        ? {
            https: {
              cert: fs.readFileSync(certificatePath),
              key: fs.readFileSync(keyPath),
            },
          }
        : {}),
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on("error", (_err, _req, res) => {
              if ("writeHead" in res && !res.headersSent) {
                res.writeHead(503, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    success: false,
                    message: `Backend API is offline at ${apiProxyTarget}. Please start the backend server with 'npm run dev:local'.`,
                    code: "BACKEND_UNAVAILABLE",
                  }),
                );
              }
            });
            proxy.on("proxyRes", (proxyResponse) => {
              const cookies = proxyResponse.headers["set-cookie"]
              if (!cookies) return
              proxyResponse.headers["set-cookie"] = cookies.map((cookie) =>
                cookie
                  .replace(/;\s*Secure/gi, "")
                  .replace(/SameSite=None/gi, "SameSite=Lax"),
              )
            })
          },
        },
      },
      watch: {
        ignored: [
          '**/payroll.zip',
          '**/node_modules/**',
        ],
      },
    },
    optimizeDeps: {
      include: ["@ant-design/v5-patch-for-react-19"],
    },
  }
})
