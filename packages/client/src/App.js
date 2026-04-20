import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./hooks/useAuth";
import AuthPage from "./pages/AuthPage";
import Home from "./pages/Home";
import Meet from "./pages/Meet";
import Join from "./pages/Join";
import ScheduleLanding from "./pages/ScheduleLanding";
import SchedulePage from "./pages/SchedulePage";
const App = () => {
    useAuth();
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Home, {}) }), _jsx(Route, { path: "/auth", element: _jsx(AuthPage, {}) }), _jsx(Route, { path: "/meet/:meetingId", element: _jsx(ProtectedRoute, { children: _jsx(Meet, {}) }) }), _jsx(Route, { path: "/meeting/:meetingId", element: _jsx(ProtectedRoute, { children: _jsx(Meet, {}) }) }), _jsx(Route, { path: "/join/:meetingId", element: _jsx(Join, {}) }), _jsx(Route, { path: "/schedule", element: _jsx(ProtectedRoute, { children: _jsx(SchedulePage, {}) }) }), _jsx(Route, { path: "/s/:shareToken", element: _jsx(ScheduleLanding, {}) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }));
};
export default App;
