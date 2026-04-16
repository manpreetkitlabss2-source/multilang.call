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

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path="/meet/:meetingId"
        element={
          <ProtectedRoute>
            <Meet />
          </ProtectedRoute>
        }
      />
      <Route path="/join/:meetingId" element={<Join />} />
      <Route
        path="/schedule"
        element={
          <ProtectedRoute>
            <SchedulePage />
          </ProtectedRoute>
        }
      />
      <Route path="/s/:shareToken" element={<ScheduleLanding />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
