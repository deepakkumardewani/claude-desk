import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ThemeProvider } from "./lib/theme";
import { ScopeProvider } from "./lib/scope";
import { Backups } from "./routes/Backups";
import { File } from "./routes/File";
import { Layout } from "./routes/Layout";
import { List } from "./routes/List";
import { Mcp } from "./routes/Mcp";
import { Settings } from "./routes/Settings";
import { Usage } from "./routes/Usage";
import { Workspace } from "./routes/Workspace";
import "./index.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <List /> },
      { path: "backups", element: <Backups /> },
      { path: "mcp", element: <Mcp /> },
      { path: "settings", element: <Settings /> },
      { path: "usage", element: <Usage /> },
      { path: "workspace", element: <Workspace /> },
      { path: ":segment/*", element: <File /> },
      { path: ":segment", element: <File /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ScopeProvider>
        <RouterProvider router={router} />
      </ScopeProvider>
    </ThemeProvider>
  </StrictMode>,
);
