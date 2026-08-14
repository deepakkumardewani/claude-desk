import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  type RouteObject,
} from "react-router-dom";
import { ThemeProvider } from "./lib/theme";
import { ScopeProvider } from "./lib/scope";
import { LAST_ROUTE_KEY, USER_ROUTE_PREFIX } from "./lib/workspaceState";
import { Backups } from "./routes/Backups";
import { File } from "./routes/File";
import { Layout } from "./routes/Layout";
import { List } from "./routes/List";
import { Mcp } from "./routes/Mcp";
import { Settings } from "./routes/Settings";
import { Usage } from "./routes/Usage";
import { Workspace } from "./routes/Workspace";
import { bootstrapToken } from "./lib/sessionApi";
import { MissingToken } from "./components/MissingToken";
import "./index.css";

const sessionToken = bootstrapToken();

function RedirectIndex() {
  const last = sessionStorage.getItem(LAST_ROUTE_KEY) ?? localStorage.getItem(LAST_ROUTE_KEY);
  const target = !last || last === "/" ? USER_ROUTE_PREFIX : last;
  return <Navigate to={target} replace />;
}

function AppShell() {
  return (
    <ScopeProvider>
      <Layout />
    </ScopeProvider>
  );
}

const scopedPages: RouteObject[] = [
  { index: true, element: <List /> },
  { path: "mcp", element: <Mcp /> },
  { path: "settings", element: <Settings /> },
];

const filePages: RouteObject[] = [
  { path: ":segment/*", element: <File /> },
  { path: ":segment", element: <File /> },
];

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <RedirectIndex /> },
      { path: "backups", element: <Backups /> },
      { path: "usage", element: <Usage /> },
      { path: "workspace", element: <Workspace /> },
      {
        path: "user",
        element: <Outlet />,
        children: [...scopedPages, ...filePages],
      },
      {
        path: "project/:projectId",
        element: <Outlet />,
        children: [...scopedPages, ...filePages],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      {sessionToken === null ? <MissingToken /> : <RouterProvider router={router} />}
    </ThemeProvider>
  </StrictMode>,
);
