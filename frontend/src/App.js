import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import DatasetDetail from "./pages/DatasetDetail";   // ✅ NEW IMPORT

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dataset/:id" element={<DatasetDetail />} />  {/* ✅ NEW ROUTE */}
      </Routes>
    </Router>
  );
}

export default App;