// src/main.tsx
import "@ant-design/v5-patch-for-react-19";
import React from "react";
import ReactDOM from "react-dom/client";
import AppRouter from "@/app/router/AppRouter";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import "@/styles/index.css";
import "@/styles/App.css";
import "@/styles/theme-dark.css";
import { persistor, store } from "@/app/store";
import { MessageProvider } from "@/app/providers";
import { NotificationProvider } from "@/app/providers";
import { ThemeProvider } from "@/app/providers";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <ThemeProvider>
          <NotificationProvider>
            <MessageProvider>
              <AppRouter />
            </MessageProvider>
          </NotificationProvider>
        </ThemeProvider>
      </PersistGate>
    </Provider>
  </React.StrictMode>
);
