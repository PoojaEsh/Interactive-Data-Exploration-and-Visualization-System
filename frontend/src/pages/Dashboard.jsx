import "./Dashboard.css";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell
} from "recharts";

function Dashboard() {

  const [selectedFile, setSelectedFile] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [previewData, setPreviewData] = useState([]);
  const [currentFileId, setCurrentFileId] = useState(null);

  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");

  const [columns, setColumns] = useState([]);
  const [chartType, setChartType] = useState("");
  const [xAxis, setXAxis] = useState("");
  const [yAxis, setYAxis] = useState("");

  const [uploading, setUploading] = useState(false);

  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const COLORS = [
    "#6366F1",
    "#22C55E",
    "#F59E0B",
    "#EF4444",
    "#3B82F6",
    "#8B5CF6",
    "#10B981"
  ];

  /* ================= AUTH CHECK ================= */

  useEffect(() => {
    if (!token) navigate("/");
  }, [token, navigate]);

  /* ================= FETCH DATASETS ================= */

  const fetchDatasets = useCallback(async () => {
    try {

      const res = await fetch("http://localhost:8000/datasets/", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        setDatasets([]);
        return;
      }

      const data = await res.json();
      setDatasets(Array.isArray(data) ? data : []);

    } catch {
      setDatasets([]);
    }
  }, [token]);

  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  /* ================= FILE UPLOAD ================= */

  const handleUpload = async () => {

  if (!selectedFile) {
    alert("Select file first");
    return;
  }

  if (uploading) return;   // ⭐ prevents duplicate calls

  setUploading(true);

  try {

    const formData = new FormData();
    formData.append("file", selectedFile);

    const res = await fetch("http://localhost:8000/datasets/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    if (!res.ok) {
      alert("Upload failed");
      setUploading(false);
      return;
    }

    alert("Upload successful");

    setSelectedFile(null);
    document.querySelector("input[type=file]").value = "";

    fetchDatasets();

  } catch {
    alert("Upload error");
  }

  setUploading(false);

};

  /* ================= FETCH SHEETS ================= */

  const fetchSheets = async (datasetId) => {

    const res = await fetch(
      `http://localhost:8000/datasets/${datasetId}/sheets`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const data = await res.json();

    const sheetList = data.sheets || [];

    setSheets(sheetList);

    if (sheetList.length > 0) {
      setSelectedSheet(sheetList[0]);
      fetchSheetData(datasetId, sheetList[0]);
    }

  };

  /* ================= FETCH SHEET DATA ================= */

  const fetchSheetData = async (datasetId, sheetName) => {

    const res = await fetch(
      `http://localhost:8000/datasets/${datasetId}/data?sheet_name=${sheetName}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const data = await res.json();
    const rows = data.data || [];

    setPreviewData(rows);

    if (rows.length > 0) {
      const cols = Object.keys(rows[0]);
      setColumns(cols);
      setXAxis(cols[0]);
      setYAxis(cols[1] || cols[0]);
    }

  };

 /* ================= PREVIEW ================= */

const handlePreview = (id) => {

  setCurrentFileId(id);
  setPreviewData([]);
  setColumns([]);
  setChartType("");
  setSelectedSheet("");

  const token = localStorage.getItem("token");

  fetch(`http://127.0.0.1:8000/files/${id}/preview`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
    .then((res) => res.json())
    .then((data) => {

      setSheets(data.sheets || []);
      setPreviewData(data.data || []);

      if (data.data && data.data.length > 0) {
        setColumns(Object.keys(data.data[0]));
      }

      if (data.sheets && data.sheets.length > 0) {
        setSelectedSheet(data.sheets[0]);
      }

    })
    .catch((err) => console.error("Preview error:", err));

};



/* ================= SHEET CHANGE ================= */

const handleSheetChange = (e) => {

  const sheet = e.target.value;
  setSelectedSheet(sheet);

  if (!currentFileId) return;

  const token = localStorage.getItem("token");

  fetch(`http://127.0.0.1:8000/files/${currentFileId}/preview?sheet=${encodeURIComponent(sheet)}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
    .then((res) => res.json())
    .then((data) => {

      setPreviewData(data.data || []);

      if (data.data && data.data.length > 0) {
        setColumns(Object.keys(data.data[0]));
      }

    })
    .catch((err) => console.error("Sheet error:", err));

};

  /* ================= DELETE ================= */

  const handleDelete = async (id) => {

    if (!window.confirm("Delete this dataset?")) return;

    const res = await fetch(
      `http://localhost:8000/datasets/${id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (res.ok) {
      alert("Dataset deleted");
      fetchDatasets();
      setPreviewData([]);
    } else {
      alert("Delete failed");
    }

  };

  /* ================= LOGOUT ================= */

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };

  /* ================= GRAPH ANALYSIS ================= */

  const numericValues = previewData
    .map((row) => Number(row[yAxis]))
    .filter((val) => !isNaN(val));

  let minValue = null;
  let maxValue = null;
  let avgValue = null;
  let minItem = null;
  let maxItem = null;

  if (numericValues.length > 0) {

    minValue = Math.min(...numericValues);
    maxValue = Math.max(...numericValues);

    avgValue = (
      numericValues.reduce((a, b) => a + b, 0) /
      numericValues.length
    ).toFixed(3);

    minItem = previewData.find((r) => Number(r[yAxis]) === minValue);
    maxItem = previewData.find((r) => Number(r[yAxis]) === maxValue);

  }

  return (

    <div className="dashboard-container">

      {/* SIDEBAR */}

      <div className="sidebar">
        <h2 className="logo">DataDash</h2>

        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>

      {/* MAIN */}

      <div className="main-content">

        <h1 className="page-title">Your Datasets</h1>

        {/* UPLOAD */}

<div className="upload-section">

  <input
    type="file"
    className="file-input"
    onChange={(e) => setSelectedFile(e.target.files[0])}
  />

  <button
    className="upload-btn"
    onClick={handleUpload}
    disabled={uploading}
  >
    {uploading ? "Uploading..." : "Upload Dataset"}
  </button>

</div>

        {/* DATASET TABLE */}

        <table className="dataset-table">

          <thead>
            <tr>
              <th>Dataset Name</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>

            {datasets.map((file) => (

              <tr key={file.id}>

                <td>{file.filename}</td>

                <td className="action-buttons">

                  <button
                    className="preview-btn"
                    onClick={() => handlePreview(file.id)}
                  >
                    Preview
                  </button>

                  <button
                    className="delete-btn"
                    onClick={() => handleDelete(file.id)}
                  >
                    Delete
                  </button>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

        {/* VISUALIZATION */}

        {previewData.length > 0 && (

          <div className="result-box">

            <h3>Dataset Visualization</h3>

            <div className="controls">

              {sheets.length > 0 && (

                <select value={selectedSheet} onChange={handleSheetChange}>
                  {sheets.map((sheet, index) => (
                    <option key={index} value={sheet}>
                      {sheet}
                    </option>
                  ))}
                </select>

              )}

              <select value={chartType} onChange={(e) => setChartType(e.target.value)}>
                <option value="">Select Chart</option>
                <option value="bar">Bar Chart</option>
                <option value="line">Line Chart</option>
                <option value="pie">Pie Chart</option>
                <option value="scatter">Scatter Plot</option>
              </select>

              <select value={xAxis} onChange={(e) => setXAxis(e.target.value)}>
                {columns.map((col) => (
                  <option key={col}>{col}</option>
                ))}
              </select>

              <select value={yAxis} onChange={(e) => setYAxis(e.target.value)}>
                {columns.map((col) => (
                  <option key={col}>{col}</option>
                ))}
              </select>

            </div>

            {/* CHART */}

            <div className="chart-area">

              {chartType === "bar" && (

                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={previewData}>
                    <CartesianGrid strokeDasharray="3 3"/>
                    <XAxis dataKey={xAxis}/>
                    <YAxis/>
                    <Tooltip/>
                    <Bar dataKey={yAxis}>
                      {previewData.map((entry,index)=>(
                        <Cell key={index} fill={COLORS[index % COLORS.length]}/>
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

              )}

              {chartType === "line" && (

                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={previewData}>
                    <CartesianGrid strokeDasharray="3 3"/>
                    <XAxis dataKey={xAxis}/>
                    <YAxis/>
                    <Tooltip/>
                    <Line dataKey={yAxis} stroke="#6366F1"/>
                  </LineChart>
                </ResponsiveContainer>

              )}

              {chartType === "pie" && (

                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={previewData}
                      dataKey={yAxis}
                      nameKey={xAxis}
                      outerRadius={120}
                    >
                      {previewData.map((entry,index)=>(
                        <Cell key={index} fill={COLORS[index % COLORS.length]}/>
                      ))}
                    </Pie>
                    <Tooltip/>
                  </PieChart>
                </ResponsiveContainer>

              )}

              {chartType === "scatter" && (

                <ResponsiveContainer width="100%" height={350}>
                  <ScatterChart>
                    <CartesianGrid/>
                    <XAxis dataKey={xAxis}/>
                    <YAxis dataKey={yAxis}/>
                    <Tooltip/>
                    <Scatter data={previewData} fill="#6366F1"/>
                  </ScatterChart>
                </ResponsiveContainer>

              )}

            </div>

            {/* GRAPH ANALYSIS */}

            {numericValues.length > 0 && (

              <div className="metadata-box">

                <h4>Graph Analysis</h4>

                <p>
                  This chart compares <b>{yAxis}</b> values across
                  <b> {xAxis}</b> samples.
                </p>

                <p>
                  The values range between <b>{minValue}</b> and
                  <b> {maxValue}</b> with an average of <b>{avgValue}</b>.
                </p>

                <p>
                  The highest value occurs for
                  <b> {maxItem?.[xAxis]}</b>, while
                  <b> {minItem?.[xAxis]}</b> shows the lowest measurement.
                </p>

              </div>

            )}

          </div>

        )}

      </div>

    </div>

  );

}

export default Dashboard;