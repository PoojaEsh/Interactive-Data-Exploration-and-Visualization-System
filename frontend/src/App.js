import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import DatasetDetail from "./pages/DatasetDetail";

import ChartsDashboard from "./pages/ChartsDashboard"; // ✅ ADD THIS

function App() {
  return (
    <Router>
      <Routes>

        <Route
          path="/"
          element={<Login />}
        />

        <Route
          path="/dashboard"
          element={<Dashboard />}
        />

        <Route
          path="/dataset/:id"
          element={<DatasetDetail />}
        />

        {/* ✅ NEW ROUTE */}

        <Route
          path="/charts-dashboard"
          element={<ChartsDashboard />}
        />

      </Routes>
    </Router>
  );
}

export default App;