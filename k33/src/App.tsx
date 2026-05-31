import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import SimulatorPage from "@/pages/SimulatorPage";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<SimulatorPage />} />
      </Routes>
    </Router>
  );
}
