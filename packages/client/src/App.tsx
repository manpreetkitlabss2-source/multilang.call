import { Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Meet from "./pages/Meet";
import Join from "./pages/Join";

const App = () => (
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/meet/:meetingId" element={<Meet />} />
    <Route path="/join/:meetingId" element={<Join />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default App;
