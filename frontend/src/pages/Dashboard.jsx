import "./Dashboard.css";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  XAxis,
  YAxis
} from "recharts";

const COLORS = [
  "#6366F1",
  "#22C55E",
  "#F59E0B",
  "#EF4444",
  "#3B82F6",
  "#8B5CF6",
  "#10B981",
  "#14B8A6",
  "#F97316"
];

const SHIFT_ORDER = ["E", "L", "N"];

const SHIFT_COLORS = {
  E: "#6366F1",
  L: "#22C55E",
  N: "#F59E0B"
};

const normalizeShift = (value) => {
  const shift = String(value || "").trim().toUpperCase();

  if (shift.includes("E")) return "E";
  if (shift.includes("L")) return "L";
  if (shift.includes("N")) return "N";

  return shift || "Unknown";
};

const getFailureLabel = (item) => {
  if (item.label) return item.label;

  const machine = item.machine || "N/A";
  const shift = item.shift ? normalizeShift(item.shift) : "";

  return shift ? `Machine ${machine} - Shift ${shift}` : `Machine ${machine}`;
};

const getSelectionLabel = (selectedValues, options, allLabel, singularLabel) => {
  const active = selectedValues.length > 0 ? selectedValues : options;

  if (active.length === 0 || active.length === options.length) {
    return allLabel;
  }

  if (active.length <= 2) {
    return active.map((item) => `Shift ${item}`).join(", ");
  }

  return `${active.length} ${singularLabel} Selected`;
};

const getEffectiveShiftSelection = (selectedValues, options) =>
  selectedValues.length > 0 ? selectedValues : options;

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const point = payload[0].payload;

    return (
      <div style={{
        background: "#fff",
        padding: "10px",
        border: "1px solid #ccc",
        borderRadius: "8px"
      }}>
        <p><b>Hour:</b> {label}</p>

        {payload.map((entry, i) => (
          <p key={i} style={{ color: entry.color }}>
            <b>{entry.name}:</b> {entry.value?.toFixed(2)}
          </p>
        ))}

        {/* ✅ SAFE MACHINE DISPLAY */}
        <p>
          <b>Machines:</b>{" "}
          {Array.isArray(point?.machines) && point.machines.length > 0
            ? point.machines.join(", ")
            : "N/A"}
        </p>
      </div>
    );
  }
  return null;
};
const HealthTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const entry = payload[0]; // current bar
    const point = entry.payload;

    return (
      <div style={{
        background: "#fff",
        padding: "10px",
        border: "1px solid #ccc",
        borderRadius: "8px"
      }}>
        {/* ✅ MACHINE */}
        <p><b>Machine:</b> {point.machine}</p>

        {/* ✅ SHIFT (from bar name) */}
        <p><b>Shift:</b> {entry.name.replace("Shift ", "")}</p>

        {/* ✅ VALUE (IMPORTANT FIX) */}
        <p><b>Health Score:</b> {Number(entry.value).toFixed(2)}</p>
      </div>
    );
  }
  return null;
};
// ✅ FAILURE TOOLTIP
const FailureTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const point = payload[0].payload;

    return (
      <div style={{
        background: "#fff",
        padding: "10px",
        border: "1px solid #ccc",
        borderRadius: "8px"
      }}>
        <p><b>Machine:</b> {point.machine}</p>
        <p><b>Shift:</b> {point.shift}</p>
        <p><b>Failure Score:</b> {Number(point.failure_score).toFixed(2)}</p>
        <p><b>Class:</b> {point.failure_class}</p>
      </div>
    );
  }
  return null;
};

const excelSerialToDate = (serial) => {
  const num = Number(serial);
  if (Number.isNaN(num)) return null;

  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const milliseconds = num * 24 * 60 * 60 * 1000;

  return new Date(excelEpoch.getTime() + milliseconds);
};

const normalizeDateValue = (value) => {
  if (value === null || value === undefined || value === "") return "";

  const numeric = Number(value);

  if (!Number.isNaN(numeric) && numeric > 30000) {
    const date = excelSerialToDate(numeric);

    if (date && !Number.isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }

  const asString = String(value).trim();
  const parsed = new Date(asString);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return asString;
};


const getHourBucket = (logDate) => {
  if (!logDate) return null;

  const date = new Date(logDate);

  if (isNaN(date)) return null;

  const hour = date.getHours().toString().padStart(2, "0");

  return `${hour}:00`;   // ✅ IMPORTANT
};

const sortMixedValues = (values) =>
  [...values].sort((a, b) => {
    const aNum = Number(a);
    const bNum = Number(b);
    const aIsNum = !Number.isNaN(aNum);
    const bIsNum = !Number.isNaN(bNum);

    if (aIsNum && bIsNum) return aNum - bNum;

    return String(a).localeCompare(String(b));
  });

const detectMachineColumn = (cols) =>
  cols.find((col) => {
    const name = String(col).toLowerCase().trim();

    return (
      name === "mc" ||
      name === "mc no" ||
      name === "mc number" ||
      name === "machine" ||
      name === "machine no" ||
      name === "machine number" ||
      name.includes("mc no") ||
      name.includes("mc number") ||
      name.includes("machine no") ||
      name.includes("machine number")
    );
  }) || cols[0];

const detectCigaretteColumn = (cols) =>
  cols.find((col) => {
    const name = String(col).toLowerCase().trim();

    return (
      name === "cig code" ||
      name === "cigarette" ||
      name === "cigarette name" ||
      name.includes("cig code") ||
      name.includes("cigarette")
    );
  }) || "";

const detectBlendColumn = (cols) =>
  cols.find((col) => String(col).toLowerCase().trim().includes("blend")) || "";

const detectDateColumn = (cols) =>
  cols.find((col) => {
    const name = String(col).toLowerCase().trim();
    return name === "production date" || name === "date" || name.includes("date");
  }) || "";

const detectLogDateColumn = (cols) =>
  cols.find((col) => {
    const name = String(col).toLowerCase().trim();

    return (
      name === "log date" ||
      name === "logdate" ||
      name.includes("log date") ||
      name.includes("log time") ||
      name.includes("timestamp")
    );
  }) || "";

const detectDayColumn = (cols) =>
  cols.find((col) => String(col).toLowerCase().trim().includes("day")) || "";

const detectShiftColumn = (cols) =>
  cols.find((col) => String(col).toLowerCase().trim().includes("shift")) || "";

const detectCrewColumn = (cols) =>
  cols.find((col) => String(col).toLowerCase().trim().includes("crew")) || "";

const aggregateByMachine = (rows, machineKey, valueKey) => {
  if (!machineKey || !valueKey) return [];

  const grouped = rows.reduce((acc, row) => {
    const machine = String(row[machineKey] || "").trim();
    const value = Number(row[valueKey]);

    if (!machine || Number.isNaN(value)) return acc;

    if (!acc[machine]) {
      acc[machine] = { total: 0, count: 0 };
    }

    acc[machine].total += value;
    acc[machine].count += 1;

    return acc;
  }, {});

  return sortMixedValues(Object.keys(grouped)).map((machine) => ({
    [machineKey]: machine,
    [valueKey]: Number((grouped[machine].total / grouped[machine].count).toFixed(3))
  }));
};

const aggregateByShift = (rows, shiftKey, valueKey) => {
  if (!shiftKey || !valueKey) return [];

  const grouped = rows.reduce((acc, row) => {
    const shift = normalizeShift(row[shiftKey]);
    const value = Number(row[valueKey]);

    if (!shift || Number.isNaN(value)) return acc;

    if (!acc[shift]) {
      acc[shift] = { total: 0, count: 0 };
    }

    acc[shift].total += value;
    acc[shift].count += 1;

    return acc;
  }, {});

  return SHIFT_ORDER.filter((shift) => grouped[shift]).map((shift) => ({
    shift,
    [valueKey]: Number((grouped[shift].total / grouped[shift].count).toFixed(3))
  }));
};

const aggregateMachineShiftHourlySeries = (
  rows,
  shiftKey,
  machineKey,
  logDateKey,
  valueKey,
  selectedShiftKeys,
  selectedMachines
) => {
  const grouped = {};

  rows.forEach((row) => {
    const shift = normalizeShift(row[shiftKey]);
    const machine = String(row[machineKey] || "").trim();
    const hour = getHourBucket(row[logDateKey]);
    const value = Number(row[valueKey]);

    if (
      !selectedShiftKeys.includes(shift) ||
      !selectedMachines.includes(machine) ||
      !hour ||
      Number.isNaN(value)
    ) {
      return;
    }

    // ✅ SHIFT + HOUR SECTION
    const xLabel = `${shift}-${hour}`;

    // ✅ CREATE GROUP
    if (!grouped[xLabel]) {
      grouped[xLabel] = {
        label: xLabel,
        shift,
        hour
      };
    }

    // ✅ EACH MACHINE GETS ITS OWN LINE
    grouped[xLabel][machine] = value;
  });

  // ✅ SORT BY LABEL
  return Object.values(grouped).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
};

const transformHealthData = (data) => {
  if (!data || !Array.isArray(data.results)) return [];

  const grouped = {};

  data.results.forEach((item) => {
    const machine = String(item.machine || "").trim();
    const shift = normalizeShift(item.shift);
    const score = Number(item.score);

    if (!machine || Number.isNaN(score)) return;

    if (!grouped[machine]) {
      grouped[machine] = { machine };
    }

    grouped[machine][shift] = score;
  });

  return Object.values(grouped).sort((a, b) => {
    const aNum = Number(a.machine);
    const bNum = Number(b.machine);

    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
    return a.machine.localeCompare(b.machine);
  });
};

const getHealthSummaryForShiftSelection = (data, selectedShifts, availableShifts) => {
  if (!data || !Array.isArray(data.results)) {
    return {
      average_score: 0,
      best_machine: null,
      worst_machine: null
    };
  }

  const activeShifts = getEffectiveShiftSelection(selectedShifts, availableShifts);

  const rows = data.results.filter((item) => activeShifts.includes(normalizeShift(item.shift)));

  if (rows.length === 0) {
    return {
      average_score: 0,
      best_machine: null,
      worst_machine: null
    };
  }

  const average = rows.reduce((sum, item) => sum + Number(item.score || 0), 0) / rows.length;

  return {
    average_score: Number(average.toFixed(2)),
    best_machine: rows.reduce((best, item) =>
      Number(item.score) > Number(best.score) ? item : best
    ),
    worst_machine: rows.reduce((worst, item) =>
      Number(item.score) < Number(worst.score) ? item : worst
    )
  };
};

function Dashboard() {
  const navigate = useNavigate();

  const rawToken = localStorage.getItem("token");
  const token =
    rawToken && rawToken !== "null" && rawToken !== "undefined" ? rawToken : null;

  const [selectedFile, setSelectedFile] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [previewData, setPreviewData] = useState([]);
  const [currentDatasetId, setCurrentDatasetId] = useState(null);
  const [columns, setColumns] = useState([]);

  const [machineColumn, setMachineColumn] = useState("");
  const [cigaretteColumn, setCigaretteColumn] = useState("");
  const [blendColumn, setBlendColumn] = useState("");
  const [dateColumn, setDateColumn] = useState("");
  const [logDateColumn, setLogDateColumn] = useState("");
  const [dayColumn, setDayColumn] = useState("");
  const [shiftColumn, setShiftColumn] = useState("");
  const [crewColumn, setCrewColumn] = useState("");

  const [selectedDate, setSelectedDate] = useState([]);
  const [selectedDays, setSelectedDays] = useState([]);
  const [selectedShifts, setSelectedShifts] = useState([]);
  const [selectedCrews, setSelectedCrews] = useState([]);
  const [selectedMachines, setSelectedMachines] = useState([]);

  const [selectedHealthShifts, setSelectedHealthShifts] = useState([]);
  const [selectedFailureShifts, setSelectedFailureShifts] = useState([]);

  const [yAxis, setYAxis] = useState("");
  const [chartType, setChartType] = useState("bar");
  const [lineViewMode, setLineViewMode] = useState("shiftCompare");

  const [anomalyMap, setAnomalyMap] = useState({});
  const [anomalySummary, setAnomalySummary] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [failureData, setFailureData] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [chartSuggestion, setChartSuggestion] = useState(null);

  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  const [isDayDropdownOpen, setIsDayDropdownOpen] = useState(false);
  const [isShiftDropdownOpen, setIsShiftDropdownOpen] = useState(false);
  const [isCrewDropdownOpen, setIsCrewDropdownOpen] = useState(false);
  const [isMachineDropdownOpen, setIsMachineDropdownOpen] = useState(false);
  const [isHealthShiftDropdownOpen, setIsHealthShiftDropdownOpen] = useState(false);
  const [isFailureShiftDropdownOpen, setIsFailureShiftDropdownOpen] = useState(false);

  const fileInputRef = useRef(null);
  const uploadInProgressRef = useRef(false);

  const dateDropdownRef = useRef(null);
  const dayDropdownRef = useRef(null);
  const shiftDropdownRef = useRef(null);
  const crewDropdownRef = useRef(null);
  const machineDropdownRef = useRef(null);
  const healthShiftDropdownRef = useRef(null);
  const failureShiftDropdownRef = useRef(null);

  const mainChartRef = useRef(null);
  const healthChartRef = useRef(null);
  const failureChartRef = useRef(null);
  const forecastChartRef = useRef(null);

  const logoutAndRedirect = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("userEmail");
    setDatasets([]);
    setPreviewData([]);
    setCurrentDatasetId(null);
    navigate("/");
  }, [navigate]);

  useEffect(() => {
    if (!token) {
      localStorage.removeItem("token");
      localStorage.removeItem("userEmail");
      setDatasets([]);
      setPreviewData([]);
      setCurrentDatasetId(null);
      navigate("/");
    }
  }, [token, navigate]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(event.target)) {
        setIsDateDropdownOpen(false);
      }
      if (dayDropdownRef.current && !dayDropdownRef.current.contains(event.target)) {
        setIsDayDropdownOpen(false);
      }
      if (shiftDropdownRef.current && !shiftDropdownRef.current.contains(event.target)) {
        setIsShiftDropdownOpen(false);
      }
      if (crewDropdownRef.current && !crewDropdownRef.current.contains(event.target)) {
        setIsCrewDropdownOpen(false);
      }
      if (machineDropdownRef.current && !machineDropdownRef.current.contains(event.target)) {
        setIsMachineDropdownOpen(false);
      }
      if (healthShiftDropdownRef.current && !healthShiftDropdownRef.current.contains(event.target)) {
        setIsHealthShiftDropdownOpen(false);
      }
      if (failureShiftDropdownRef.current && !failureShiftDropdownRef.current.contains(event.target)) {
        setIsFailureShiftDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const clearInsights = () => {
    setAnomalyMap({});
    setAnomalySummary(null);
    setHealthData(null);
    setFailureData(null);
    setSummaryData(null);
    setForecastData(null);
    setChartSuggestion(null);
    setSelectedHealthShifts([]);
    setSelectedFailureShifts([]);
  };

  const resetFiltersAndSelections = () => {
    setMachineColumn("");
    setCigaretteColumn("");
    setBlendColumn("");
    setDateColumn("");
    setLogDateColumn("");
    setDayColumn("");
    setShiftColumn("");
    setCrewColumn("");
    setSelectedDate([]);
    setSelectedDays([]);
    setSelectedShifts([]);
    setSelectedCrews([]);
    setSelectedMachines([]);
    setSelectedHealthShifts([]);
    setSelectedFailureShifts([]);
    setYAxis("");
    setChartType("bar");
    setLineViewMode("shiftCompare");
  };

  const fetchApi = useCallback(
    async (url, fallbackMessage, stateSetter) => {
      if (!token) {
        logoutAndRedirect();
        throw new Error("Unauthorized");
      }

      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (res.status === 401) {
          alert("Session expired. Please login again.");
          logoutAndRedirect();
          throw new Error("Unauthorized");
        }

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.detail || fallbackMessage);
        }

        const data = await res.json();

        if (stateSetter) {
          stateSetter(data);
        }

        return data;
      } catch (error) {
        if (error.message !== "Unauthorized") {
          alert(error.message || fallbackMessage);
        }
        throw error;
      }
    },
    [token, logoutAndRedirect]
  );

  const fetchDatasets = useCallback(async () => {
    if (!token) {
      setDatasets([]);
      navigate("/");
      return;
    }

    try {
      const res = await fetch("http://localhost:8000/datasets/", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("userEmail");
        setDatasets([]);
        navigate("/");
        return;
      }

      if (!res.ok) {
        setDatasets([]);
        return;
      }

      const data = await res.json();
      setDatasets(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Dataset fetch error:", error);
      setDatasets([]);
    }
  }, [token, navigate]);

  useEffect(() => {
    if (!token) return;
    fetchDatasets();
  }, [fetchDatasets, token]);

  const handleUpload = async () => {
    if (!token) {
      alert("Please login again.");
      logoutAndRedirect();
      return;
    }

    if (!selectedFile || uploadInProgressRef.current) return;

    uploadInProgressRef.current = true;
    setIsUploading(true);

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

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        alert("Session expired. Please login again.");
        logoutAndRedirect();
        return;
      }

      if (res.ok) {
        alert("Upload successful");
        setSelectedFile(null);

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }

        await fetchDatasets();
      } else {
        alert(data.detail || "Upload failed");
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Upload failed");
    } finally {
      setIsUploading(false);
      uploadInProgressRef.current = false;
    }
  };

  const fetchSheetData = async (datasetId, sheetName) => {
    if (!token) {
      logoutAndRedirect();
      return;
    }

    try {
      const res = await fetch(
        `http://localhost:8000/datasets/${datasetId}/data?sheet_name=${encodeURIComponent(sheetName)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (res.status === 401) {
        alert("Session expired. Please login again.");
        logoutAndRedirect();
        return;
      }

      if (!res.ok) {
        setPreviewData([]);
        setColumns([]);
        resetFiltersAndSelections();
        clearInsights();
        return;
      }

      const data = await res.json();
      const rows = data.data || [];
      setPreviewData(rows);

      if (rows.length > 0) {
        const cols = Object.keys(rows[0]);

        const detectedMachine = detectMachineColumn(cols);
        const detectedCigarette = detectCigaretteColumn(cols);
        const detectedBlend = detectBlendColumn(cols);
        const detectedDate = detectDateColumn(cols);
        const detectedLogDate = detectLogDateColumn(cols);
        const detectedDay = detectDayColumn(cols);
        const detectedShift = detectShiftColumn(cols);
        const detectedCrew = detectCrewColumn(cols);

        setColumns(cols);
        setMachineColumn(detectedMachine);
        setCigaretteColumn(detectedCigarette);
        setBlendColumn(detectedBlend);
        setDateColumn(detectedDate);
        setLogDateColumn(detectedLogDate);
        setDayColumn(detectedDay);
        setShiftColumn(detectedShift);
        setCrewColumn(detectedCrew);

        const machineList = sortMixedValues(
          [...new Set(rows.map((row) => String(row[detectedMachine] || "").trim()))].filter(Boolean)
        );

        setSelectedMachines(machineList);

        const selectableColumns = cols.filter((col) => {
          if (col === detectedMachine || col === detectedDate || col === detectedLogDate) {
            return false;
          }

          return rows.some((row) => {
            const value = row[col];
            return value !== null && value !== undefined && value !== "" && !Number.isNaN(Number(value));
          });
        });

        setYAxis(selectableColumns[0] || "");
        setChartType("bar");
        setLineViewMode("shiftCompare");
        setSelectedDate([]);
        setSelectedDays([]);
        setSelectedShifts([]);
        setSelectedCrews([]);
      } else {
        setColumns([]);
        resetFiltersAndSelections();
      }

      clearInsights();
    } catch (error) {
      console.error("Sheet data fetch error:", error);
      setPreviewData([]);
      setColumns([]);
      resetFiltersAndSelections();
      clearInsights();
    }
  };

  const fetchSheets = async (datasetId) => {
    if (!token) {
      logoutAndRedirect();
      return;
    }

    try {
      const res = await fetch(`http://localhost:8000/datasets/${datasetId}/sheets`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (res.status === 401) {
        alert("Session expired. Please login again.");
        logoutAndRedirect();
        return;
      }

      if (!res.ok) return;

      const data = await res.json();
      const availableSheets = data.sheets || [];

      if (availableSheets.length > 0) {
        await fetchSheetData(datasetId, availableSheets[0]);
      }
    } catch (error) {
      console.error("Sheet fetch error:", error);
    }
  };

  const handlePreview = async (id) => {
    try {
      setCurrentDatasetId(id);
      await fetchSheets(id);
    } catch (error) {
      console.error("Preview error:", error);
      alert("Failed to load dataset preview");
    }
  };

  const handleDelete = async (id) => {
    if (!token) {
      logoutAndRedirect();
      return;
    }

    if (!window.confirm("Delete this dataset?")) return;

    try {
      const res = await fetch(`http://localhost:8000/datasets/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (res.status === 401) {
        alert("Session expired. Please login again.");
        logoutAndRedirect();
        return;
      }

      if (res.ok) {
        alert("Dataset deleted");
        await fetchDatasets();

        if (currentDatasetId === id) {
          setCurrentDatasetId(null);
          setPreviewData([]);
          setColumns([]);
          resetFiltersAndSelections();
          clearInsights();
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.detail || "Delete failed");
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("Delete failed");
    }
  };

  const handleLogout = () => {
    logoutAndRedirect();
  };

  const dateOptions = useMemo(() => {
    if (!dateColumn) return [];
    return sortMixedValues(
      [...new Set(previewData.map((row) => normalizeDateValue(row[dateColumn])))].filter(Boolean)
    );
  }, [previewData, dateColumn]);

  const dayOptions = useMemo(() => {
    if (!dayColumn) return [];
    return sortMixedValues(
      [...new Set(previewData.map((row) => String(row[dayColumn] || "").trim()))].filter(Boolean)
    );
  }, [previewData, dayColumn]);

  const shiftOptions = useMemo(() => {
    if (!shiftColumn) return [];
    return SHIFT_ORDER.filter((shift) =>
      previewData.some((row) => normalizeShift(row[shiftColumn]) === shift)
    );
  }, [previewData, shiftColumn]);

  const crewOptions = useMemo(() => {
    if (!crewColumn) return [];
    return sortMixedValues(
      [...new Set(previewData.map((row) => String(row[crewColumn] || "").trim()))].filter(Boolean)
    );
  }, [previewData, crewColumn]);

  const activeShiftKeys = useMemo(() => {
    if (!shiftColumn) return [];
    const source = selectedShifts.length > 0 ? selectedShifts : shiftOptions;
    return SHIFT_ORDER.filter((shift) => source.includes(shift));
  }, [shiftColumn, selectedShifts, shiftOptions]);

  const baseFilteredData = useMemo(() => {
    return previewData.filter((row) => {
      const rowDate = dateColumn ? normalizeDateValue(row[dateColumn]) : "";
      const rowDay = dayColumn ? String(row[dayColumn] || "").trim() : "";
      const rowShift = shiftColumn ? normalizeShift(row[shiftColumn]) : "";
      const rowCrew = crewColumn ? String(row[crewColumn] || "").trim() : "";

      const matchesDate = selectedDate.length === 0 || selectedDate.includes(rowDate);
      const matchesDay = selectedDays.length === 0 || selectedDays.includes(rowDay);
      const matchesShift = selectedShifts.length === 0 || selectedShifts.includes(rowShift);
      const matchesCrew = selectedCrews.length === 0 || selectedCrews.includes(rowCrew);

      return matchesDate && matchesDay && matchesShift && matchesCrew;
    });
  }, [
    previewData,
    dateColumn,
    dayColumn,
    shiftColumn,
    crewColumn,
    selectedDate,
    selectedDays,
    selectedShifts,
    selectedCrews
  ]);

  const machineOptions = useMemo(() => {
    if (!machineColumn) return [];

    return sortMixedValues(
      [...new Set(baseFilteredData.map((row) => String(row[machineColumn] || "").trim()))].filter(Boolean)
    );
  }, [baseFilteredData, machineColumn]);

  useEffect(() => {
    if (machineOptions.length > 0) {
      setSelectedMachines((prev) => {
        const validSelection = prev.filter((machine) => machineOptions.includes(machine));
        return validSelection.length > 0 ? validSelection : machineOptions;
      });
    } else {
      setSelectedMachines([]);
    }
  }, [machineOptions]);

  const filteredData = useMemo(() => {
    return baseFilteredData.filter((row) =>
      selectedMachines.includes(String(row[machineColumn] || "").trim())
    );
  }, [baseFilteredData, selectedMachines, machineColumn]);

  const yAxisOptions = useMemo(() => {
    return columns.filter((col) => {
      if (col === machineColumn || col === dateColumn || col === logDateColumn) return false;

      return previewData.some((row) => {
        const value = row[col];
        return value !== null && value !== undefined && value !== "" && !Number.isNaN(Number(value));
      });
    });
  }, [columns, machineColumn, dateColumn, logDateColumn, previewData]);

  const isYAxisNumeric =
    yAxis && filteredData.some((row) => row[yAxis] !== "" && !Number.isNaN(Number(row[yAxis])));

  const machineChartData = useMemo(() => {
    if (!isYAxisNumeric) return [];
    return aggregateByMachine(filteredData, machineColumn, yAxis);
  }, [filteredData, machineColumn, yAxis, isYAxisNumeric]);

  const shiftChartData = useMemo(() => {
    if (!isYAxisNumeric || !shiftColumn) return [];
    return aggregateByShift(filteredData, shiftColumn, yAxis);
  }, [filteredData, shiftColumn, yAxis, isYAxisNumeric]);

const combinedShiftLineData = useMemo(() => {
  if (
    !isYAxisNumeric ||
    !shiftColumn ||
    !machineColumn ||
    !logDateColumn ||
    chartType !== "line"
  ) {
    return [];
  }

  return aggregateMachineShiftHourlySeries(
    filteredData,
    shiftColumn,
    machineColumn,
    logDateColumn,
    yAxis,
    activeShiftKeys,
    selectedMachines
  );
}, [
  filteredData,
  shiftColumn,
  machineColumn,
  logDateColumn,
  yAxis,
  activeShiftKeys,
  selectedMachines,
  isYAxisNumeric,
  chartType
]);
const averageShiftLineData = useMemo(() => {
  const grouped = {};

  filteredData.forEach((row) => {
    const shift = normalizeShift(row[shiftColumn]);
    const machine = String(row[machineColumn] || "").trim();
    const hour = getHourBucket(row[logDateColumn]);
    const value = Number(row[yAxis]);

    if (
      !activeShiftKeys.includes(shift) ||
      !selectedMachines.includes(machine) ||
      !hour ||
      Number.isNaN(value)
    ) {
      return;
    }

    const key = `${shift}-${hour}`;

    if (!grouped[key]) {
      grouped[key] = {
        label: key,
        total: 0,
        count: 0,
        avg: 0
      };
    }

    grouped[key].total += value;
    grouped[key].count += 1;

    grouped[key].avg =
      grouped[key].total / grouped[key].count;
  });

  return Object.values(grouped).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
}, [
  filteredData,
  shiftColumn,
  machineColumn,
  logDateColumn,
  yAxis,
  activeShiftKeys,
  selectedMachines
]);

  const useCombinedShiftLineChart =
    chartType === "line" &&
    lineViewMode === "shiftCompare" &&
    Boolean(shiftColumn) &&
    Boolean(machineColumn) &&
    Boolean(logDateColumn) &&
    activeShiftKeys.length > 0 &&
    combinedShiftLineData.length > 0;

  const useShiftAxisChart =
    isYAxisNumeric &&
    shiftColumn &&
    chartType !== "pie" &&
    chartType !== "scatter" &&
    chartType !== "radar" &&
    chartType !== "line" &&
    lineViewMode === "shiftSummary";

  const numericValues = useMemo(() => {
    if (!isYAxisNumeric) return [];

    if (useCombinedShiftLineChart) {
      return combinedShiftLineData.flatMap((row) =>
        activeShiftKeys
          .map((shift) => Number(row[shift]))
          .filter((value) => !Number.isNaN(value) && value !== null)
      );
    }

    const source = useShiftAxisChart ? shiftChartData : machineChartData;
    return source.map((row) => Number(row[yAxis])).filter((value) => !Number.isNaN(value));
  }, [
    isYAxisNumeric,
    useCombinedShiftLineChart,
    combinedShiftLineData,
    activeShiftKeys,
    useShiftAxisChart,
    shiftChartData,
    machineChartData,
    yAxis
  ]);

  const minValue = numericValues.length > 0 ? Math.min(...numericValues) : null;
  const maxValue = numericValues.length > 0 ? Math.max(...numericValues) : null;
  const avgValue =
    numericValues.length > 0
      ? (numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length).toFixed(3)
      : null;

  const radarData = useMemo(() => {
    if (!(selectedMachines.length > 0 && yAxisOptions.length > 0)) return [];

    return yAxisOptions
      .filter((col) =>
        baseFilteredData.some((row) => row[col] !== "" && !Number.isNaN(Number(row[col])))
      )
      .slice(0, 6)
      .map((col) => {
        const selectedMachine = selectedMachines[0];
        const selectedRows = baseFilteredData.filter(
          (row) => String(row[machineColumn] || "").trim() === selectedMachine
        );

        const selectedValue =
          selectedRows.length > 0
            ? selectedRows.reduce((sum, row) => sum + (Number(row[col]) || 0), 0) / selectedRows.length
            : 0;

        const averageValue =
          baseFilteredData.reduce((sum, row) => sum + (Number(row[col]) || 0), 0) /
          Math.max(baseFilteredData.length, 1);

        return {
          parameter: col,
          selected: Number(selectedValue.toFixed(2)),
          average: Number(averageValue.toFixed(2))
        };
      });
  }, [selectedMachines, yAxisOptions, baseFilteredData, machineColumn]);

  const machineRunningMap = useMemo(() => {
    if (!(machineColumn && (cigaretteColumn || blendColumn))) return [];

    return Object.values(
      baseFilteredData.reduce((acc, row) => {
        const machine = String(row[machineColumn] || "").trim();
        const cigarette = cigaretteColumn ? String(row[cigaretteColumn] || "").trim() : "";
        const blend = blendColumn ? String(row[blendColumn] || "").trim() : "";

        if (!machine) return acc;

        if (!acc[machine]) {
          acc[machine] = { machine, cigarette, blend };
        }

        if (cigarette) acc[machine].cigarette = cigarette;
        if (blend) acc[machine].blend = blend;

        return acc;
      }, {})
    ).sort((a, b) => Number(a.machine) - Number(b.machine));
  }, [baseFilteredData, machineColumn, cigaretteColumn, blendColumn]);

  const healthShiftOptions = useMemo(() => {
    if (!healthData?.results?.length) return [];
    return SHIFT_ORDER.filter((shift) =>
      healthData.results.some((item) => normalizeShift(item.shift) === shift)
    );
  }, [healthData]);

  const activeHealthShifts = useMemo(
    () => getEffectiveShiftSelection(selectedHealthShifts, healthShiftOptions),
    [selectedHealthShifts, healthShiftOptions]
  );

  const healthChartData = useMemo(() => transformHealthData(healthData).slice(0, 12), [healthData]);

  const healthShiftSummary = useMemo(
    () => getHealthSummaryForShiftSelection(healthData, selectedHealthShifts, healthShiftOptions),
    [healthData, selectedHealthShifts, healthShiftOptions]
  );

  const failureShiftOptions = useMemo(() => {
    if (!failureData?.results?.length) return [];
    return SHIFT_ORDER.filter((shift) =>
      failureData.results.some((item) => normalizeShift(item.shift) === shift)
    );
  }, [failureData]);

  const activeFailureShifts = useMemo(
    () => getEffectiveShiftSelection(selectedFailureShifts, failureShiftOptions),
    [selectedFailureShifts, failureShiftOptions]
  );

  const filteredFailureResults = useMemo(() => {
    if (!failureData?.results?.length) return [];
    return failureData.results.filter((item) =>
      activeFailureShifts.includes(normalizeShift(item.shift))
    );
  }, [failureData, activeFailureShifts]);

  const failureSummary = useMemo(() => {
    if (filteredFailureResults.length === 0) {
      return { top_risk_machine: null };
    }

    const sorted = [...filteredFailureResults].sort(
      (a, b) => Number(b.failure_score) - Number(a.failure_score)
    );

    return { top_risk_machine: sorted[0] };
  }, [filteredFailureResults]);

  const failureTop = useMemo(() => {
    return filteredFailureResults.slice(0, 8).map((item) => ({
      ...item,
      label: getFailureLabel(item)
    }));
  }, [filteredFailureResults]);

  const handleMultiToggle = (value, setter) => {
    setter((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  const handleAllMultiToggle = (options, selectedValues, setter) => {
    if (selectedValues.length === options.length) {
      setter([]);
    } else {
      setter(options);
    }
  };

  const handleMachineToggle = (machine) => {
    setSelectedMachines((prev) =>
      prev.includes(machine)
        ? prev.filter((item) => item !== machine)
        : sortMixedValues([...prev, machine])
    );
  };

  const handleAllMachinesToggle = () => {
    if (selectedMachines.length === machineOptions.length) {
      setSelectedMachines([]);
    } else {
      setSelectedMachines(machineOptions);
    }
  };

  const allMachinesChecked =
    machineOptions.length > 0 && selectedMachines.length === machineOptions.length;

  const buildSelectionLabel = (selectedValues, allLabel, itemLabel) => {
    if (selectedValues.length === 0) return allLabel;
    if (selectedValues.length <= 2) return selectedValues.join(", ");
    return `${selectedValues.length} ${itemLabel} Selected`;
  };

  const selectedMachineLabel =
    selectedMachines.length === 0
      ? "Select Machines"
      : allMachinesChecked
        ? "All Machines"
        : selectedMachines.length <= 3
          ? selectedMachines.join(", ")
          : `${selectedMachines.length} Machines Selected`;


  const fetchHealthScores = async () => {
    if (!currentDatasetId) return;
    setIsLoadingInsights(true);

    try {
      await fetchApi(
        `http://localhost:8000/datasets/${currentDatasetId}/health-score`,
        "Failed to load health score",
        setHealthData
      );
    } finally {
      setIsLoadingInsights(false);
    }
  };

  const fetchFailureClassification = async () => {
    if (!currentDatasetId) return;
    setIsLoadingInsights(true);

    try {
      await fetchApi(
        `http://localhost:8000/datasets/${currentDatasetId}/failure-classification`,
        "Failed to load failure classification",
        setFailureData
      );
    } finally {
      setIsLoadingInsights(false);
    }
  };

  const fetchAiSummary = async () => {
    if (!currentDatasetId) return;
    setIsLoadingInsights(true);

    try {
      await fetchApi(
        `http://localhost:8000/datasets/${currentDatasetId}/summary?parameter=${encodeURIComponent(yAxis || "")}`,
        "Failed to load AI summary",
        setSummaryData
      );
    } finally {
      setIsLoadingInsights(false);
    }
  };

  const fetchForecast = async () => {
    if (!currentDatasetId || !yAxis || !isYAxisNumeric) {
      alert("Please select a numeric parameter for forecast");
      return;
    }

    setIsLoadingInsights(true);

    try {
      await fetchApi(
        `http://localhost:8000/datasets/${currentDatasetId}/forecast?parameter=${encodeURIComponent(yAxis)}`,
        "Failed to load forecast",
        setForecastData
      );
      console.log("Forecast Response:", forecastData);
    } finally {
      setIsLoadingInsights(false);
    }
  };

  const downloadChartFromRef = (ref, fileName) => {
    const wrapper = ref.current;
    if (!wrapper) {
      alert("No chart available to download");
      return;
    }

    const svg = wrapper.querySelector("svg");
    if (!svg) {
      alert("No chart available to download");
      return;
    }

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svg);

    if (!source.includes('xmlns="http://www.w3.org/2000/svg"')) {
      source = source.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    if (!source.includes('xmlns:xlink="http://www.w3.org/1999/xlink"')) {
      source = source.replace("<svg", '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }

    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${fileName}.svg`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

const getChartImageFromRef = async (ref) => {
  const wrapper = ref.current;

  if (!wrapper) return null;

  // IMPORTANT WAIT
  await new Promise((resolve) =>
    setTimeout(resolve, 1000)
  );

  const canvas = await html2canvas(wrapper, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false
  });

  return canvas.toDataURL("image/png");
};

  const addWrappedText = (pdf, text, x, y, maxWidth, lineHeight = 7) => {
    const lines = pdf.splitTextToSize(text, maxWidth);
    pdf.text(lines, x, y);
    return y + lines.length * lineHeight;
  };

  const ensurePageSpace = (pdf, y, neededHeight, margin) => {
    const pageHeight = pdf.internal.pageSize.getHeight();
    if (y + neededHeight > pageHeight - margin) {
      pdf.addPage();
      return margin;
    }
    return y;
  };

  const addSectionTitle = (pdf, title, y, margin) => {
    y = ensurePageSpace(pdf, y, 18, margin);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.text(title, margin, y);
    return y + 8;
  };

const addChartToPdf = (
  pdf,
  title,
  image,
  y,
  margin
) => {

  if (!image) return y;

  const pageWidth =
    pdf.internal.pageSize.getWidth();

  const contentWidth =
    pageWidth - margin * 2;

  y = ensurePageSpace(
    pdf,
    y,
    90,
    margin
  );

  pdf.setFont("helvetica", "bold");

  pdf.setFontSize(16);

  pdf.text(title, margin, y);

  y += 6;

  pdf.setDrawColor(220);

  pdf.roundedRect(
    margin - 2,
    y - 2,
    contentWidth + 4,
    78,
    4,
    4
  );

  pdf.addImage(
    image,
    "PNG",
    margin,
    y + 4,
    contentWidth,
    65
  );

  y += 86;

  return y;
};

  const downloadPdfReport = async () => {
    if (!previewData.length) {
      alert("No report available to download");
      return;
    }

    setIsDownloadingPdf(true);

    try {
      const pdf = new jsPDF("p", "mm", "a4");
      const margin = 15;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const contentWidth = pageWidth - margin * 2;
      const now = new Date();

      let y = margin;

      const mainChartImage = await getChartImageFromRef(mainChartRef);
      const healthChartImage = await getChartImageFromRef(healthChartRef);
      const failureChartImage = await getChartImageFromRef(failureChartRef);
      const forecastChartImage = await getChartImageFromRef(forecastChartRef);

pdf.setFillColor(17, 24, 39);

pdf.rect(0, 0, 210, 28, "F");

pdf.setTextColor(255, 255, 255);

pdf.setFont("helvetica", "bold");

pdf.setFontSize(24);

pdf.text(
  "Machine Analytics Report",
  margin,
  18
);

pdf.setTextColor(0, 0, 0);

y = 38;

      pdf.setDrawColor(180, 180, 180);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 10;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.text(`Generated on: ${now.toLocaleString()}`, margin, y);
      y += 7;

      pdf.text(`Dataset ID: ${currentDatasetId || "N/A"}`, margin, y);
      y += 7;

      pdf.text(`Selected Parameter: ${yAxis || "N/A"}`, margin, y);
      y += 12;
      pdf.setFillColor(243, 244, 246);

pdf.roundedRect(15, y, 40, 22, 3, 3, "F");
pdf.roundedRect(60, y, 40, 22, 3, 3, "F");
pdf.roundedRect(105, y, 40, 22, 3, 3, "F");
pdf.roundedRect(150, y, 40, 22, 3, 3, "F");

pdf.setFontSize(10);

pdf.text("Avg Health", 20, y + 8);
pdf.text(
  String(
    healthShiftSummary?.average_score || "N/A"
  ),
  20,
  y + 16
);

pdf.text("Machines", 65, y + 8);
pdf.text(
  String(selectedMachines?.length || 0),
  65,
  y + 16
);

pdf.text("Anomalies", 110, y + 8);
pdf.text(
  String(anomalySummary?.anomalies || 0),
  110,
  y + 16
);

pdf.text("Top Risk", 155, y + 8);
pdf.text(
  String(
    failureSummary?.top_risk_machine
      ?.machine || "N/A"
  ),
  155,
  y + 16
);

y += 32;

      y = addSectionTitle(pdf, "Report Overview", y, margin);
      y = addWrappedText(
        pdf,
        "This report summarizes the selected dataset visualization and analytical results generated from the dashboard.",
        margin,
        y,
        contentWidth
      );
      y += 6;

      if (isYAxisNumeric && numericValues.length > 0 && yAxis) {
        y = addSectionTitle(pdf, "Graph Analysis", y, margin);
        y = addWrappedText(
          pdf,
          `The selected parameter ${yAxis} ranges from ${minValue} to ${maxValue}, with an average value of ${avgValue}.`,
          margin,
          y,
          contentWidth
        );
        y += 6;
      }

      y = addChartToPdf(pdf, "Main Visualization", mainChartImage, y, margin);

      if (summaryData?.summary?.length > 0) {
        y = addSectionTitle(pdf, "AI Summary", y, margin);
        y = addWrappedText(pdf, summaryData.summary.join(" "), margin, y, contentWidth);
        y += 6;
      }

      if (anomalySummary) {
        y = addSectionTitle(pdf, "Anomaly Detection", y, margin);
        y = addWrappedText(
          pdf,
          `Detected ${anomalySummary.anomalies} anomalies out of ${anomalySummary.total} machine samples. Abnormal machines: ${
            anomalySummary.machines.length > 0 ? anomalySummary.machines.join(", ") : "None"
          }.`,
          margin,
          y,
          contentWidth
        );
        y += 6;
      }

      if (healthData?.results?.length > 0) {
        y = addSectionTitle(pdf, "Health Score Summary", y, margin);
        y = addWrappedText(
          pdf,
          `Average health score is ${healthShiftSummary.average_score}. Best machine: ${
            healthShiftSummary.best_machine
              ? `Machine ${healthShiftSummary.best_machine.machine} - Shift ${normalizeShift(
                  healthShiftSummary.best_machine.shift
                )}`
              : "N/A"
          }. Worst machine: ${
            healthShiftSummary.worst_machine
              ? `Machine ${healthShiftSummary.worst_machine.machine} - Shift ${normalizeShift(
                  healthShiftSummary.worst_machine.shift
                )}`
              : "N/A"
          }.`,
          margin,
          y,
          contentWidth
        );
        y += 6;

        y = addChartToPdf(pdf, "Health Score Chart", healthChartImage, y, margin);
      }

      if (failureSummary.top_risk_machine) {
        y = addSectionTitle(pdf, "Failure Classification", y, margin);
        y = addWrappedText(
          pdf,
          `Top risk: ${getFailureLabel(failureSummary.top_risk_machine)}. Failure score: ${
            failureSummary.top_risk_machine.failure_score
          }. Risk class: ${failureSummary.top_risk_machine.failure_class}.`,
          margin,
          y,
          contentWidth
        );
        y += 6;

        y = addChartToPdf(pdf, "Failure Classification Chart", failureChartImage, y, margin);
      }

      if (forecastData?.points?.length > 0) {
        y = addSectionTitle(pdf, "Forecast Analysis", y, margin);
        y = addWrappedText(
          pdf,
          `The predicted next value for ${yAxis} is ${
            forecastData.predicted_next?.toFixed?.(3) || forecastData.predicted_next
          } with a ${forecastData.trend} trend.`,
          margin,
          y,
          contentWidth
        );
        y += 6;

        y = addChartToPdf(pdf, "Forecast Chart", forecastChartImage, y, margin);
      }

      pdf.save("dashboard_report.pdf");
    } catch (error) {
      console.error("PDF download error:", error);
      alert("Failed to download PDF report");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  useEffect(() => {
    const fetchSuggestion = async () => {
      if (!currentDatasetId || !yAxis || !isYAxisNumeric) {
        setChartSuggestion(null);
        return;
      }

      try {
        const data = await fetchApi(
          `http://localhost:8000/datasets/${currentDatasetId}/chart-suggestion?parameter=${encodeURIComponent(yAxis || "")}`,
          "Failed to load chart suggestion"
        );
        setChartSuggestion(data);
      } catch {
        setChartSuggestion(null);
      }
    };

    fetchSuggestion();
  }, [currentDatasetId, yAxis, isYAxisNumeric, fetchApi]);

  return (
    <div className="dashboard-container">
      <div className="sidebar">
        <h2 className="logo">DataDash</h2>
        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>

      <div className="main-content">
        <h1>Your Datasets</h1>

        <div className="upload-section">
          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => setSelectedFile(e.target.files[0] || null)}
            disabled={isUploading}
          />
          <button
            className="upload-btn"
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
          >
            {isUploading ? "Uploading..." : "Upload"}
          </button>
        </div>

        <table className="dataset-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {datasets.map((file) => (
              <tr key={file.id}>
                <td>{file.filename}</td>
                <td className="action-buttons">
                  <button className="preview-btn" onClick={() => handlePreview(file.id)}>
                    Preview
                  </button>
                  <button className="delete-btn" onClick={() => handleDelete(file.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {previewData.length > 0 && (
          <div className="result-box">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap"
              }}
            >
              <h3>Dataset Visualization</h3>
              <button onClick={downloadPdfReport} disabled={isDownloadingPdf}>
                {isDownloadingPdf ? "Generating PDF..." : "Download Full PDF Report"}
              </button>
            </div>

            <div className="controls-panel">
              {dateColumn && (
                <div ref={dateDropdownRef} className="machine-dropdown">
                  <button
                    type="button"
                    className="machine-dropdown-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDateDropdownOpen((prev) => !prev);
                    }}
                  >
                    {buildSelectionLabel(selectedDate, "All Dates", "Dates")}
                  </button>

                  {isDateDropdownOpen && (
                    <div className="machine-dropdown-menu" onMouseDown={(e) => e.stopPropagation()}>
                      <label className="machine-option machine-option-all">
                        <input
                          type="checkbox"
                          checked={dateOptions.length > 0 && selectedDate.length === dateOptions.length}
                          onChange={() =>
                            handleAllMultiToggle(dateOptions, selectedDate, setSelectedDate)
                          }
                        />
                        All Dates
                      </label>

                      {dateOptions.map((date) => (
                        <label key={date} className="machine-option">
                          <input
                            type="checkbox"
                            checked={selectedDate.includes(date)}
                            onChange={() => handleMultiToggle(date, setSelectedDate)}
                          />
                          {date}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {dayColumn && (
                <div ref={dayDropdownRef} className="machine-dropdown">
                  <button
                    type="button"
                    className="machine-dropdown-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDayDropdownOpen((prev) => !prev);
                    }}
                  >
                    {buildSelectionLabel(selectedDays, "All Days", "Days")}
                  </button>

                  {isDayDropdownOpen && (
                    <div className="machine-dropdown-menu" onMouseDown={(e) => e.stopPropagation()}>
                      <label className="machine-option machine-option-all">
                        <input
                          type="checkbox"
                          checked={dayOptions.length > 0 && selectedDays.length === dayOptions.length}
                          onChange={() =>
                            handleAllMultiToggle(dayOptions, selectedDays, setSelectedDays)
                          }
                        />
                        All Days
                      </label>

                      {dayOptions.map((day) => (
                        <label key={day} className="machine-option">
                          <input
                            type="checkbox"
                            checked={selectedDays.includes(day)}
                            onChange={() => handleMultiToggle(day, setSelectedDays)}
                          />
                          {day}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {shiftColumn && (
                <div ref={shiftDropdownRef} className="machine-dropdown">
                  <button
                    type="button"
                    className="machine-dropdown-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsShiftDropdownOpen((prev) => !prev);
                    }}
                  >
                    {buildSelectionLabel(selectedShifts, "All Shifts", "Shifts")}
                  </button>

                  {isShiftDropdownOpen && (
                    <div className="machine-dropdown-menu" onMouseDown={(e) => e.stopPropagation()}>
                      <label className="machine-option machine-option-all">
                        <input
                          type="checkbox"
                          checked={shiftOptions.length > 0 && selectedShifts.length === shiftOptions.length}
                          onChange={() =>
                            handleAllMultiToggle(shiftOptions, selectedShifts, setSelectedShifts)
                          }
                        />
                        All Shifts
                      </label>

                      {shiftOptions.map((shift) => (
                        <label key={shift} className="machine-option">
                          <input
                            type="checkbox"
                            checked={selectedShifts.includes(shift)}
                            onChange={() => handleMultiToggle(shift, setSelectedShifts)}
                          />
                          {shift}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {crewColumn && (
                <div ref={crewDropdownRef} className="machine-dropdown">
                  <button
                    type="button"
                    className="machine-dropdown-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCrewDropdownOpen((prev) => !prev);
                    }}
                  >
                    {buildSelectionLabel(selectedCrews, "All Crews", "Crews")}
                  </button>

                  {isCrewDropdownOpen && (
                    <div className="machine-dropdown-menu" onMouseDown={(e) => e.stopPropagation()}>
                      <label className="machine-option machine-option-all">
                        <input
                          type="checkbox"
                          checked={crewOptions.length > 0 && selectedCrews.length === crewOptions.length}
                          onChange={() =>
                            handleAllMultiToggle(crewOptions, selectedCrews, setSelectedCrews)
                          }
                        />
                        All Crews
                      </label>

                      {crewOptions.map((crew) => (
                        <label key={crew} className="machine-option">
                          <input
                            type="checkbox"
                            checked={selectedCrews.includes(crew)}
                            onChange={() => handleMultiToggle(crew, setSelectedCrews)}
                          />
                          {crew}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div ref={machineDropdownRef} className="machine-dropdown">
                <button
                  type="button"
                  className="machine-dropdown-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMachineDropdownOpen((prev) => !prev);
                  }}
                >
                  {selectedMachineLabel}
                </button>

                {isMachineDropdownOpen && (
                  <div className="machine-dropdown-menu" onMouseDown={(e) => e.stopPropagation()}>
                    <label className="machine-option machine-option-all">
                      <input
                        type="checkbox"
                        checked={allMachinesChecked}
                        onChange={handleAllMachinesToggle}
                      />
                      All Machines
                    </label>

                    {machineOptions.map((machine) => (
                      <label key={machine} className="machine-option">
                        <input
                          type="checkbox"
                          checked={selectedMachines.includes(machine)}
                          onChange={() => handleMachineToggle(machine)}
                        />
                        {machine}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <select value={yAxis} onChange={(e) => setYAxis(e.target.value)}>
                <option value="">Select Parameter</option>
                {yAxisOptions.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>

              <select value={chartType} onChange={(e) => setChartType(e.target.value)}>
                <option value="bar">Bar</option>
                <option value="line">Line</option>
                <option value="pie">Pie</option>
                <option value="scatter">Scatter</option>
                <option value="area">Area</option>
                <option value="composed">Composed</option>
                <option value="radar">Radar</option>
              </select>

              {chartType === "line" && (
                <select value={lineViewMode} onChange={(e) => setLineViewMode(e.target.value)}>
                 <option value="shift_compare">
  Shift Time Compare
</option>

<option value="machine">
  Machine Wise
</option>


                </select>
              )}



              <button
                onClick={() =>
                  downloadChartFromRef(
                    mainChartRef,
                    `main_${chartType}_${yAxis ? yAxis.replace(/[^\w-]+/g, "_") : "chart"}`
                  )
                }
                disabled={!isYAxisNumeric || filteredData.length === 0 || !yAxis}
              >
                Download Main Graph
              </button>
            </div>

            {!isYAxisNumeric && yAxis && (
              <div className="metadata-box">
                <h4>Selected Column</h4>
                <p>
                  <b>{yAxis}</b> is a text/categorical column. Charts and analytics work only for
                  numeric columns.
                </p>
              </div>
            )}

            {chartSuggestion && (
              <div className="suggestion-box">
                <strong>Suggested Chart:</strong> {chartSuggestion.recommended_chart}
                <span> - {chartSuggestion.reason}</span>
              </div>
            )}

            <div className="ai-actions">
              <button onClick={fetchHealthScores} disabled={!currentDatasetId || isLoadingInsights}>
                Health Score
              </button>

              <button
                onClick={fetchFailureClassification}
                disabled={!currentDatasetId || isLoadingInsights}
              >
                Failure Classification
              </button>

              <button onClick={fetchAiSummary} disabled={!currentDatasetId || isLoadingInsights}>
                AI Summary
              </button>

              <button
                onClick={fetchForecast}
                disabled={!currentDatasetId || !yAxis || !isYAxisNumeric || isLoadingInsights}
              >
                Forecast
              </button>
             <button
  onClick={() =>
    navigate("/charts-dashboard", {
      state: {
        chartType,
        yAxis,
        machineColumn,
        machineChartData,
        shiftChartData,
        combinedShiftLineData,
        averageShiftLineData,
        radarData,
        selectedMachines,
        anomalyMap,
        useCombinedShiftLineChart,
        useShiftAxisChart,
        isYAxisNumeric,
        healthChartData,
        failureTop,
        forecastData
      }
    })
  }
>
  Open Full Dashboard
</button> 
            </div>

            {machineRunningMap.length > 0 && (
              <div className="metadata-box">
                <h4>Machine Running Details</h4>

                {machineRunningMap.map((item) => (
                  <p key={item.machine}>
                    Machine <b>{item.machine}</b> - Cig: <b>{item.cigarette || "N/A"}</b> | Blend:{" "}
                    <b>{item.blend || "N/A"}</b>
                  </p>
                ))}
              </div>
            )}

            <div className="chart-area" ref={mainChartRef}>
              {chartType === "bar" && isYAxisNumeric && useShiftAxisChart && shiftChartData.length > 0 && (
                <ResponsiveContainer width="99%" height={400}>
                  <BarChart data={shiftChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="shift" />
                    <YAxis />
                  
                    <Bar dataKey={yAxis} fill="#6366F1" />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {chartType === "bar" &&
                machineColumn &&
                yAxis &&
                isYAxisNumeric &&
                !useShiftAxisChart &&
                machineChartData.length > 0 && (
                  <ResponsiveContainer width="99%" height={400}>
                    <BarChart data={machineChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey={machineColumn} />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#999" }} />
                      <Bar dataKey={yAxis}>
                        {machineChartData.map((row, index) => {
                          const machine = String(row[machineColumn]).trim();
                          const isAnomaly = anomalyMap[machine];

                          return (
                            <Cell
                              key={index}
                              fill={isAnomaly ? "#EF4444" : COLORS[index % COLORS.length]}
                            />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}

{chartType === "line" && isYAxisNumeric && useCombinedShiftLineChart && (
  <>
    {/* ✅ MACHINE + SHIFT COMPARISON GRAPH */}
    <ResponsiveContainer width="99%" height={450}>
      <LineChart
        data={combinedShiftLineData}
        margin={{ top: 20, right: 20, left: 10, bottom: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" />

        {/* SHIFT DIVIDERS */}
        <ReferenceLine
          x="L-14:00"
          stroke="#999"
          strokeDasharray="3 3"
        />

        <ReferenceLine
          x="N-22:00"
          stroke="#999"
          strokeDasharray="3 3"
        />

        <XAxis
          dataKey="label"
          angle={-45}
          textAnchor="end"
          height={70}
        />

        <YAxis />

        <Tooltip content={<CustomTooltip />} />

        <Legend />

        {/* ✅ ONE LINE PER MACHINE */}
        {selectedMachines.map((machine, index) => (
          <Line
            key={machine}
            type="monotone"
            dataKey={machine}
            name={`Machine ${machine}`}
            stroke={COLORS[index % COLORS.length]}
            strokeWidth={2}
            connectNulls
            dot={false}
            activeDot={{ r: 6 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>

    {/* ✅ SECOND GRAPH = AVERAGE TREND */}
    <h3 style={{ marginTop: "40px" }}>
      Average Shift Trend
    </h3>

    <ResponsiveContainer width="99%" height={400}>
      <LineChart data={averageShiftLineData}>
        <CartesianGrid strokeDasharray="3 3" />
         {/* SHIFT AREAS */}

<ReferenceArea
  x1="E-06:00"
  x2="E-14:00"
  fill="#6366F1"
  fillOpacity={0.05}
/>

<ReferenceArea
  x1="L-14:00"
  x2="L-22:00"
  fill="#22C55E"
  fillOpacity={0.05}
/>

<ReferenceArea
  x1="N-22:00"
  x2="N-23:00"
  fill="#F59E0B"
  fillOpacity={0.05}
/>
        <XAxis
          dataKey="label"
          angle={-45}
          textAnchor="end"
          height={70}
        />

        <YAxis />

        <Tooltip />

        <Legend />

        <Line
          type="monotone"
          dataKey="avg"
          name="Average Value"
          stroke="#6366F1"
          strokeWidth={3}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  </>
)}

{/* ✅ MACHINE WISE NORMAL LINE GRAPH */}
{chartType === "line" &&
  machineColumn &&
  yAxis &&
  isYAxisNumeric &&
  !useCombinedShiftLineChart &&
  machineChartData.length > 0 && (
    <ResponsiveContainer width="99%" height={400}>
      <LineChart data={machineChartData}>
        <CartesianGrid strokeDasharray="3 3" />

        <XAxis dataKey={machineColumn} />

        <YAxis />

        <Tooltip
          content={<CustomTooltip />}
          cursor={{ stroke: "#999" }}
        />

        <Line
          type="monotone"
          dataKey={yAxis}
          stroke="#6366F1"
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
)}
              {chartType === "pie" &&
                machineColumn &&
                yAxis &&
                isYAxisNumeric &&
                machineChartData.length > 0 && (
                  <ResponsiveContainer width="99%" height={400}>
                    <PieChart>
                      <Pie
                        data={machineChartData}
                        dataKey={yAxis}
                        nameKey={machineColumn}
                        outerRadius={120}
                      >
                        {machineChartData.map((row, index) => {
                          const machine = String(row[machineColumn]).trim();
                          const isAnomaly = anomalyMap[machine];

                          return (
                            <Cell
                              key={index}
                              fill={isAnomaly ? "#EF4444" : COLORS[index % COLORS.length]}
                            />
                          );
                        })}
                      </Pie>

                      <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#999" }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}

              {chartType === "scatter" &&
                machineColumn &&
                yAxis &&
                isYAxisNumeric &&
                machineChartData.length > 0 && (
                  <ResponsiveContainer width="99%" height={400}>
                    <ScatterChart>
                      <CartesianGrid />
                      <XAxis dataKey={machineColumn} name={machineColumn} />
                      <YAxis dataKey={yAxis} name={yAxis} />
                      <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#999" }} />
                      <Scatter data={machineChartData} fill="#6366F1" />
                    </ScatterChart>
                  </ResponsiveContainer>
                )}

              {chartType === "area" &&
                machineColumn &&
                yAxis &&
                isYAxisNumeric &&
                machineChartData.length > 0 && (
                  <ResponsiveContainer width="99%" height={400}>
                    <AreaChart data={machineChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey={machineColumn} />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#999" }} />
                      <Area type="monotone" dataKey={yAxis} stroke="#0F766E" fill="#99F6E4" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}

              {chartType === "composed" &&
                machineColumn &&
                yAxis &&
                isYAxisNumeric &&
                machineChartData.length > 0 && (
                  <ResponsiveContainer width="99%" height={400}>
                    <ComposedChart data={machineChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey={machineColumn} />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#999" }} />
                      <Legend />
                      <Bar dataKey={yAxis} fill="#93C5FD" />
                      <Line type="monotone" dataKey={yAxis} stroke="#1D4ED8" strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}

              {chartType === "radar" && radarData.length > 0 && (
                <ResponsiveContainer width="99%" height={400}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="parameter" />
                    <PolarRadiusAxis />
                    <Radar
                      name={selectedMachines[0]}
                      dataKey="selected"
                      stroke="#6366F1"
                      fill="#6366F1"
                      fillOpacity={0.4}
                    />
                    <Radar
                      name="Average"
                      dataKey="average"
                      stroke="#22C55E"
                      fill="#22C55E"
                      fillOpacity={0.2}
                    />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="insight-grid">
              {summaryData?.summary?.length > 0 && (
                <div className="metadata-box">
                  <h4>AI Summary</h4>

                  {summaryData.summary.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              )}

              {anomalySummary && (
                <div className="metadata-box">
                  <h4>Anomaly Detection</h4>

                  <p>
                    Detected <b>{anomalySummary.anomalies}</b> anomalies out of{" "}
                    <b>{anomalySummary.total}</b> machine samples.
                  </p>

                  <p>
                    Abnormal machines:{" "}
                    <b>
                      {anomalySummary.machines.length > 0
                        ? anomalySummary.machines.join(", ")
                        : "None"}
                    </b>
                  </p>
                </div>
              )}

              {failureSummary.top_risk_machine && (
                <div className="metadata-box">
                  <h4>Failure Classification</h4>

                  <p>
                    Top risk: <b>{getFailureLabel(failureSummary.top_risk_machine)}</b>
                  </p>

                  <p>
                    Failure score: <b>{failureSummary.top_risk_machine.failure_score}</b>
                  </p>

                  <p>
                    Risk class: <b>{failureSummary.top_risk_machine.failure_class}</b>
                  </p>
                </div>
              )}

              {numericValues.length > 0 && yAxis && isYAxisNumeric && (
                <div className="metadata-box">
                  <h4>Graph Analysis</h4>

                  {useCombinedShiftLineChart ? (
                    <>
                      <p>
                        This chart compares <b>{yAxis}</b> using <b>machine number</b>, <b>shift</b>,
                        and <b>hourly time</b>.
                      </p>

                      <p>
                        The values range between <b>{minValue}</b> and <b>{maxValue}</b> with an
                        average of <b>{avgValue}</b>.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        This chart compares <b>{yAxis}</b> values across the selected view.
                      </p>

                      <p>
                        The values range between <b>{minValue}</b> and <b>{maxValue}</b> with an
                        average of <b>{avgValue}</b>.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {healthData?.results?.length > 0 && (
              <div className="analytics-section">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "center",
                    flexWrap: "wrap"
                  }}
                >
                  <h4>Machine Health Score</h4>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <div
                      ref={healthShiftDropdownRef}
                      className="machine-dropdown section-filter-dropdown"
                    >
                      <button
                        type="button"
                        className="machine-dropdown-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsHealthShiftDropdownOpen((prev) => !prev);
                        }}
                      >
                        {getSelectionLabel(
                          selectedHealthShifts,
                          healthShiftOptions,
                          "All Shifts",
                          "Shifts"
                        )}
                      </button>

                      {isHealthShiftDropdownOpen && (
                        <div className="machine-dropdown-menu" onMouseDown={(e) => e.stopPropagation()}>
                          <label className="machine-option machine-option-all">
                            <input
                              type="checkbox"
                              checked={
                                healthShiftOptions.length > 0 &&
                                selectedHealthShifts.length === healthShiftOptions.length
                              }
                              onChange={() =>
                                handleAllMultiToggle(
                                  healthShiftOptions,
                                  selectedHealthShifts,
                                  setSelectedHealthShifts
                                )
                              }
                            />
                            All Shifts
                          </label>

                          {healthShiftOptions.map((shift) => (
                            <label key={shift} className="machine-option">
                              <input
                                type="checkbox"
                                checked={selectedHealthShifts.includes(shift)}
                                onChange={() => handleMultiToggle(shift, setSelectedHealthShifts)}
                              />
                              Shift {shift}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => downloadChartFromRef(healthChartRef, "health_score_chart")}
                      disabled={healthChartData.length === 0}
                    >
                      Download Health Score Graph
                    </button>
                  </div>
                </div>

                <div className="stats-row">
                  <div className="stat-card">
                    <span>Average Score</span>
                    <strong>{healthShiftSummary.average_score}</strong>
                  </div>

                  <div className="stat-card">
                    <span>Best Machine</span>
                    <strong>
                      {healthShiftSummary.best_machine
                        ? `Machine ${healthShiftSummary.best_machine.machine} - Shift ${normalizeShift(
                            healthShiftSummary.best_machine.shift
                          )}`
                        : "N/A"}
                    </strong>
                  </div>

                  <div className="stat-card">
                    <span>Worst Machine</span>
                    <strong>
                      {healthShiftSummary.worst_machine
                        ? `Machine ${healthShiftSummary.worst_machine.machine} - Shift ${normalizeShift(
                            healthShiftSummary.worst_machine.shift
                          )}`
                        : "N/A"}
                    </strong>
                  </div>
                </div>

                <div className="chart-area" ref={healthChartRef}>
                  <ResponsiveContainer width="99%" height={400}>
                    <BarChart data={healthChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="machine" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip content={<HealthTooltip />} 
                       cursor={{ stroke: "#999" }}
                       style={{
                       background: "#fff",
                       padding: "20px",
                       minHeight: "450px"
                     }} 
                       />
                      <Legend />

                      {activeHealthShifts.includes("E") && (
                        <Bar dataKey="E" name="Shift E" fill={SHIFT_COLORS.E} />
                      )}
                      {activeHealthShifts.includes("L") && (
                        <Bar dataKey="L" name="Shift L" fill={SHIFT_COLORS.L} />
                      )}
                      {activeHealthShifts.includes("N") && (
                        <Bar dataKey="N" name="Shift N" fill={SHIFT_COLORS.N} />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {failureData?.results?.length > 0 && (
              <div className="analytics-section">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "center",
                    flexWrap: "wrap"
                  }}
                >
                  <h4>Failure Classification</h4>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <div
                      ref={failureShiftDropdownRef}
                      className="machine-dropdown section-filter-dropdown"
                    >
                      <button
                        type="button"
                        className="machine-dropdown-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsFailureShiftDropdownOpen((prev) => !prev);
                        }}
                      >
                        {getSelectionLabel(
                          selectedFailureShifts,
                          failureShiftOptions,
                          "All Shifts",
                          "Shifts"
                        )}
                      </button>

                      {isFailureShiftDropdownOpen && (
                        <div className="machine-dropdown-menu" onMouseDown={(e) => e.stopPropagation()}>
                          <label className="machine-option machine-option-all">
                            <input
                              type="checkbox"
                              checked={
                                failureShiftOptions.length > 0 &&
                                selectedFailureShifts.length === failureShiftOptions.length
                              }
                              onChange={() =>
                                handleAllMultiToggle(
                                  failureShiftOptions,
                                  selectedFailureShifts,
                                  setSelectedFailureShifts
                                )
                              }
                            />
                            All Shifts
                          </label>

                          {failureShiftOptions.map((shift) => (
                            <label key={shift} className="machine-option">
                              <input
                                type="checkbox"
                                checked={selectedFailureShifts.includes(shift)}
                                onChange={() => handleMultiToggle(shift, setSelectedFailureShifts)}
                              />
                              Shift {shift}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() =>
                        downloadChartFromRef(failureChartRef, "failure_classification_chart")
                      }
                      disabled={failureTop.length === 0}
                    >
                      Download Failure Graph
                    </button>
                  </div>
                </div>

                {failureSummary.top_risk_machine && (
                  <div className="stats-row">
                    <div className="stat-card">
                      <span>Top Risk Machine</span>
                      <strong>{getFailureLabel(failureSummary.top_risk_machine)}</strong>
                    </div>

                    <div className="stat-card">
                      <span>Failure Score</span>
                      <strong>{failureSummary.top_risk_machine.failure_score}</strong>
                    </div>

                    <div className="stat-card">
                      <span>Risk Class</span>
                      <strong>{failureSummary.top_risk_machine.failure_class}</strong>
                    </div>
                  </div>
                )}

                <div className="chart-area" ref={failureChartRef}>
                  <ResponsiveContainer width="99%" height={400}>
                    <BarChart data={failureTop}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip content={<FailureTooltip />}
                      style={{
                     background: "#fff",
                     padding: "20px",
                     minHeight: "450px"
                  }}
                       cursor={{ stroke: "#999" }} />
                      <Bar dataKey="failure_score" name="Failure Score">
                        {failureTop.map((row, index) => (
                          <Cell
                            key={index}
                            fill={
                              row.failure_class === "High"
                                ? "#DC2626"
                                : row.failure_class === "Medium"
                                  ? "#F59E0B"
                                  : "#22C55E"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {forecastData?.points?.length > 0 && (
              <div className="analytics-section">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "center",
                    flexWrap: "wrap"
                  }}
                >
                  <h4>Parameter Forecast</h4>

                  <button
                    onClick={() =>
                      downloadChartFromRef(
                        forecastChartRef,
                        `forecast_${yAxis ? yAxis.replace(/[^\w-]+/g, "_") : "chart"}`
                      )
                    }
                    disabled={!forecastData?.points?.length}
                  >
                    Download Forecast Graph
                  </button>
                </div>

                <p className="section-note">
                  Predicted next value:{" "}
                  <b>{forecastData.predicted_next?.toFixed?.(3) || forecastData.predicted_next}</b>{" "}
                  with a <b>{forecastData.trend}</b> trend.
                </p>

                <div className="chart-area" ref={forecastChartRef}>
                  <ResponsiveContainer width="99%" height={320}>
                    <ComposedChart data={forecastData.points}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} 
                      style={{
                     background: "#fff",
                     padding: "20px",
                     minHeight: "450px"
                   }}
                     cursor={{ stroke: "#999" }} />
                      <Legend />
                      <Bar dataKey="actual" fill="#93C5FD" name="Actual" />
                      <Line
                        dataKey="predicted"
                        stroke="#7C3AED"
                        strokeWidth={2}
                        name="Predicted"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
