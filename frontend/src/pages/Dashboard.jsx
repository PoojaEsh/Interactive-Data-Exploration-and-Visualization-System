import "./Dashboard.css";
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
  XAxis,
  YAxis
} from "recharts";

function Dashboard() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [previewData, setPreviewData] = useState([]);
  const [currentDatasetId, setCurrentDatasetId] = useState(null);

  const [columns, setColumns] = useState([]);
  const [machineColumn, setMachineColumn] = useState("");
  const [selectedMachines, setSelectedMachines] = useState([]);
  const [yAxis, setYAxis] = useState("");
  const [chartType, setChartType] = useState("bar");

  const [anomalyMap, setAnomalyMap] = useState({});
  const [anomalySummary, setAnomalySummary] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [failureData, setFailureData] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [chartSuggestion, setChartSuggestion] = useState(null);

  const [isDetectingAnomalies, setIsDetectingAnomalies] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isMachineDropdownOpen, setIsMachineDropdownOpen] = useState(false);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const fileInputRef = useRef(null);
  const uploadInProgressRef = useRef(false);
  const machineDropdownRef = useRef(null);

  const mainChartRef = useRef(null);
  const healthChartRef = useRef(null);
  const failureChartRef = useRef(null);
  const forecastChartRef = useRef(null);

  const navigate = useNavigate();
  const token = localStorage.getItem("token");

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

  useEffect(() => {
    if (!token) {
      navigate("/");
    }
  }, [token, navigate]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        machineDropdownRef.current &&
        !machineDropdownRef.current.contains(event.target)
      ) {
        setIsMachineDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const detectMachineColumn = (cols) => {
    return (
      cols.find((col) => {
        const name = col.toLowerCase().trim();
        return (
          name === "mc" ||
          name === "machine" ||
          name.includes("machine no") ||
          name.includes("machine number") ||
          name.includes("mc no") ||
          name.includes("mc number")
        );
      }) || cols[0]
    );
  };

  const clearInsights = () => {
    setAnomalyMap({});
    setAnomalySummary(null);
    setHealthData(null);
    setFailureData(null);
    setSummaryData(null);
    setForecastData(null);
    setChartSuggestion(null);
  };

  const fetchDatasets = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:8000/datasets/", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

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
  }, [token]);

  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  const fetchApi = useCallback(
    async (url, fallbackMessage, stateSetter) => {
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

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
        alert(error.message || fallbackMessage);
        throw error;
      }
    },
    [token]
  );

  const handleUpload = async () => {
    if (!selectedFile || uploadInProgressRef.current) {
      return;
    }

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

      if (res.ok) {
        alert("Upload successful");
        setSelectedFile(null);

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }

        await fetchDatasets();
      } else {
        alert("Upload failed");
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
    try {
      const res = await fetch(
        `http://localhost:8000/datasets/${datasetId}/data?sheet_name=${encodeURIComponent(
          sheetName
        )}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!res.ok) {
        setPreviewData([]);
        setColumns([]);
        setMachineColumn("");
        setSelectedMachines([]);
        setYAxis("");
        setChartType("bar");
        clearInsights();
        return;
      }

      const data = await res.json();
      const rows = data.data || [];
      setPreviewData(rows);

      if (rows.length > 0) {
        const cols = Object.keys(rows[0]);
        const detectedMachine = detectMachineColumn(cols);

        setColumns(cols);
        setMachineColumn(detectedMachine);

        const machineList = [
          ...new Set(rows.map((row) => String(row[detectedMachine]).trim()))
        ]
          .filter(Boolean)
          .sort((a, b) => Number(a) - Number(b));

        setSelectedMachines(machineList);

        const numericColumns = cols.filter(
          (col) =>
            col !== detectedMachine &&
            rows.some((row) => row[col] !== "" && !isNaN(Number(row[col])))
        );

        setYAxis(numericColumns[0] || "");
        setChartType("bar");
      } else {
        setColumns([]);
        setMachineColumn("");
        setSelectedMachines([]);
        setYAxis("");
        setChartType("bar");
      }

      clearInsights();
    } catch (error) {
      console.error("Sheet data fetch error:", error);
      setPreviewData([]);
      setColumns([]);
      setMachineColumn("");
      setSelectedMachines([]);
      setYAxis("");
      setChartType("bar");
      clearInsights();
    }
  };

  const fetchSheets = async (datasetId) => {
    try {
      const res = await fetch(`http://localhost:8000/datasets/${datasetId}/sheets`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        return;
      }

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
    if (!window.confirm("Delete this dataset?")) return;

    try {
      const res = await fetch(`http://localhost:8000/datasets/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (res.ok) {
        alert("Dataset deleted");
        await fetchDatasets();

        if (currentDatasetId === id) {
          setCurrentDatasetId(null);
          setPreviewData([]);
          setColumns([]);
          setMachineColumn("");
          setSelectedMachines([]);
          setYAxis("");
          setChartType("bar");
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
    localStorage.removeItem("token");
    navigate("/");
  };

  const fetchAnomalies = async () => {
    if (!currentDatasetId || !yAxis) {
      return;
    }

    setIsDetectingAnomalies(true);

    try {
      const data = await fetchApi(
        `http://localhost:8000/datasets/${currentDatasetId}/anomaly?parameter=${encodeURIComponent(
          yAxis
        )}`,
        "Failed to detect anomalies"
      );

      const nextMap = {};
      data.results.forEach((item) => {
        nextMap[String(item.machine).trim()] = Boolean(item.is_anomaly);
      });

      setAnomalyMap(nextMap);
      setAnomalySummary(data.summary);
    } catch (error) {
      setAnomalyMap({});
      setAnomalySummary(null);
    } finally {
      setIsDetectingAnomalies(false);
    }
  };

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
        `http://localhost:8000/datasets/${currentDatasetId}/summary?parameter=${encodeURIComponent(
          yAxis || ""
        )}`,
        "Failed to load AI summary",
        setSummaryData
      );
    } finally {
      setIsLoadingInsights(false);
    }
  };

  const fetchForecast = async () => {
    if (!currentDatasetId || !yAxis) return;
    setIsLoadingInsights(true);
    try {
      await fetchApi(
        `http://localhost:8000/datasets/${currentDatasetId}/forecast?parameter=${encodeURIComponent(
          yAxis
        )}`,
        "Failed to load forecast",
        setForecastData
      );
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

    const blob = new Blob([source], {
      type: "image/svg+xml;charset=utf-8"
    });

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

    const svg = wrapper.querySelector("svg");
    if (!svg) return null;

    const svgBounds = svg.getBoundingClientRect();
    const wrapperBounds = wrapper.getBoundingClientRect();

    const width = Math.max(
      Math.round(svgBounds.width || wrapperBounds.width || 900),
      600
    );
    const height = Math.max(
      Math.round(svgBounds.height || wrapperBounds.height || 360),
      280
    );

    const clonedSvg = svg.cloneNode(true);
    clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clonedSvg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    clonedSvg.setAttribute("width", width);
    clonedSvg.setAttribute("height", height);

    if (!clonedSvg.getAttribute("viewBox")) {
      clonedSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(clonedSvg);
    const svgBlob = new Blob([source], {
      type: "image/svg+xml;charset=utf-8"
    });

    const url = URL.createObjectURL(svgBlob);

    return new Promise((resolve) => {
      const img = new Image();

      img.onload = () => {
        const scale = 2;
        const canvas = document.createElement("canvas");
        canvas.width = width * scale;
        canvas.height = height * scale;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }

        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = canvas.toDataURL("image/png", 1);
        URL.revokeObjectURL(url);
        resolve({
          imageData,
          width,
          height
        });
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };

      img.src = url;
    });
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

  const addChartToPdf = (pdf, title, chartData, y, margin) => {
    if (!chartData?.imageData) return y;

    y = addSectionTitle(pdf, title, y, margin);

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const usableWidth = pageWidth - margin * 2;
    const remainingHeight = pageHeight - y - margin;

    let renderWidth = usableWidth;
    let renderHeight = (chartData.height / chartData.width) * renderWidth;

    const maxChartHeight = 100;

    if (renderHeight > maxChartHeight) {
      renderHeight = maxChartHeight;
      renderWidth = (chartData.width / chartData.height) * renderHeight;
    }

    y = ensurePageSpace(pdf, y, renderHeight + 10, margin);

    if (renderHeight > remainingHeight) {
      pdf.addPage();
      y = margin;
    }

    const x = margin + (usableWidth - renderWidth) / 2;

    pdf.addImage(chartData.imageData, "PNG", x, y, renderWidth, renderHeight);
    return y + renderHeight + 10;
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

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(20);
      pdf.text("Machine Analytics Report", margin, y);

      y += 10;
      pdf.setDrawColor(180, 180, 180);
      pdf.line(margin, y, pageWidth - margin, y);

      y += 10;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.text(`Generated on: ${now.toLocaleString()}`, margin, y);
      y += 7;
      pdf.text(
        `Dataset ID: ${currentDatasetId || "N/A"}    Selected Parameter: ${
          yAxis || "N/A"
        }    Chart Type: ${chartType}`,
        margin,
        y
      );
      y += 7;
      pdf.text(
        `Selected Machines: ${
          selectedMachines.length > 0 ? selectedMachines.join(", ") : "None"
        }`,
        margin,
        y
      );

      y += 12;
      y = addSectionTitle(pdf, "Report Overview", y, margin);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);

      y = addWrappedText(
        pdf,
        "This report summarizes the selected dataset visualization and the analytical results generated from the current dashboard view. It includes the main chart, descriptive analysis, anomaly detection outcome, machine health insight, failure classification, forecast results, and a short conclusion.",
        margin,
        y,
        contentWidth
      );

      y += 6;

      if (numericValues.length > 0 && machineColumn && yAxis) {
        y = addSectionTitle(pdf, "Graph Analysis", y, margin);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);

        y = addWrappedText(
          pdf,
          `The chart compares ${yAxis} values across ${machineColumn} samples. The observed values range from ${minValue} to ${maxValue}, with an average of ${avgValue}. The highest value is recorded for machine ${
            maxItem?.[machineColumn] || "N/A"
          }, while the lowest value is recorded for machine ${
            minItem?.[machineColumn] || "N/A"
          }.`,
          margin,
          y,
          contentWidth
        );

        y += 6;
      }

      y = addChartToPdf(pdf, "Main Visualization", mainChartImage, y, margin);

      if (summaryData?.summary?.length > 0) {
        y = addSectionTitle(pdf, "AI Summary", y, margin);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);

        y = addWrappedText(
          pdf,
          summaryData.summary.join(" "),
          margin,
          y,
          contentWidth
        );
        y += 6;
      }

      if (anomalySummary) {
        y = addSectionTitle(pdf, "Anomaly Detection", y, margin);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);

        y = addWrappedText(
          pdf,
          `Detected ${anomalySummary.anomalies} anomalies out of ${anomalySummary.total} machine samples. Abnormal machines: ${
            anomalySummary.machines.length > 0
              ? anomalySummary.machines.join(", ")
              : "None"
          }.`,
          margin,
          y,
          contentWidth
        );
        y += 6;
      }

      if (healthData?.summary) {
        y = addSectionTitle(pdf, "Health Score Summary", y, margin);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);

        y = addWrappedText(
          pdf,
          `The average machine health score is ${healthData.summary.average_score}. The best-performing machine is ${
            healthData.summary.best_machine?.machine || "N/A"
          }, while the worst-performing machine is ${
            healthData.summary.worst_machine?.machine || "N/A"
          }.`,
          margin,
          y,
          contentWidth
        );
        y += 6;

        y = addChartToPdf(pdf, "Health Score Chart", healthChartImage, y, margin);
      }

      if (failureData?.summary?.top_risk_machine) {
        y = addSectionTitle(pdf, "Failure Classification", y, margin);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);

        y = addWrappedText(
          pdf,
          `The top risk machine is ${failureData.summary.top_risk_machine.machine} with a failure score of ${failureData.summary.top_risk_machine.failure_score}. Its risk class is ${failureData.summary.top_risk_machine.failure_class}.`,
          margin,
          y,
          contentWidth
        );
        y += 6;

        y = addChartToPdf(
          pdf,
          "Failure Classification Chart",
          failureChartImage,
          y,
          margin
        );
      }

      if (forecastData?.points?.length > 0) {
        y = addSectionTitle(pdf, "Forecast Analysis", y, margin);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);

        y = addWrappedText(
          pdf,
          `The predicted next value for ${yAxis} is ${
            forecastData.predicted_next?.toFixed?.(3) ||
            forecastData.predicted_next
          } with a ${forecastData.trend} trend.`,
          margin,
          y,
          contentWidth
        );
        y += 6;

        y = addChartToPdf(pdf, "Forecast Chart", forecastChartImage, y, margin);
      }

      y = addSectionTitle(pdf, "Conclusion", y, margin);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);

      let conclusionText = `Based on the selected dataset and parameter ${
        yAxis || "N/A"
      }, the report highlights the overall machine performance pattern shown in the main visualization.`;

      if (anomalySummary) {
        conclusionText += ` A total of ${anomalySummary.anomalies} anomaly cases were identified`;
        if (anomalySummary.machines.length > 0) {
          conclusionText += `, mainly involving machines ${anomalySummary.machines.join(", ")}`;
        }
        conclusionText += ".";
      }

      if (healthData?.summary) {
        conclusionText += ` Health score analysis indicates an average score of ${healthData.summary.average_score}.`;
      }

      if (failureData?.summary?.top_risk_machine) {
        conclusionText += ` The machine requiring the most attention is ${failureData.summary.top_risk_machine.machine}.`;
      }

      if (forecastData?.predicted_next !== undefined) {
        conclusionText += ` Forecast results suggest the next expected ${
          yAxis || "parameter"
        } value is ${
          forecastData.predicted_next?.toFixed?.(3) ||
          forecastData.predicted_next
        }.`;
      }

      y = addWrappedText(pdf, conclusionText, margin, y, contentWidth);

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
      if (!currentDatasetId) return;

      try {
        const data = await fetchApi(
          `http://localhost:8000/datasets/${currentDatasetId}/chart-suggestion?parameter=${encodeURIComponent(
            yAxis || ""
          )}`,
          "Failed to load chart suggestion"
        );
        setChartSuggestion(data);
      } catch (error) {
        setChartSuggestion(null);
      }
    };

    fetchSuggestion();
  }, [currentDatasetId, yAxis, fetchApi]);

  const machineOptions = machineColumn
    ? [...new Set(previewData.map((row) => String(row[machineColumn]).trim()))]
        .filter(Boolean)
        .sort((a, b) => Number(a) - Number(b))
    : [];

  const yAxisOptions = columns.filter(
    (col) =>
      col !== machineColumn &&
      previewData.some((row) => row[col] !== "" && !isNaN(Number(row[col])))
  );

  const handleMachineToggle = (machine) => {
    setSelectedMachines((prev) => {
      if (prev.includes(machine)) {
        return prev.filter((item) => item !== machine);
      }
      return [...prev, machine].sort((a, b) => Number(a) - Number(b));
    });
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

  const filteredData = previewData.filter((row) =>
    selectedMachines.includes(String(row[machineColumn]).trim())
  );

  const selectedMachineLabel =
    selectedMachines.length === 0
      ? "Select Machines"
      : allMachinesChecked
      ? "All Machines"
      : selectedMachines.length <= 3
      ? selectedMachines.join(", ")
      : `${selectedMachines.length} Machines Selected`;

  const numericValues = filteredData
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
      numericValues.reduce((a, b) => a + b, 0) / numericValues.length
    ).toFixed(3);

    minItem = filteredData.find((row) => Number(row[yAxis]) === minValue);
    maxItem = filteredData.find((row) => Number(row[yAxis]) === maxValue);
  }

  const radarData =
    selectedMachines.length > 0 && yAxisOptions.length > 0
      ? yAxisOptions.slice(0, 6).map((col) => {
          const selectedMachine = selectedMachines[0];
          const selectedRows = previewData.filter(
            (row) => String(row[machineColumn]).trim() === selectedMachine
          );
          const selectedValue =
            selectedRows.length > 0
              ? selectedRows.reduce(
                  (sum, row) => sum + (Number(row[col]) || 0),
                  0
                ) / selectedRows.length
              : 0;

          const averageValue =
            previewData.reduce((sum, row) => sum + (Number(row[col]) || 0), 0) /
            Math.max(previewData.length, 1);

          return {
            parameter: col,
            selected: Number(selectedValue.toFixed(2)),
            average: Number(averageValue.toFixed(2))
          };
        })
      : [];

  const healthTop = healthData?.results?.slice(0, 8) || [];
  const failureTop = failureData?.results?.slice(0, 8) || [];

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

            <div>
              <div className="controls-panel">
                <div ref={machineDropdownRef} className="machine-dropdown">
                  <button
                    type="button"
                    className="machine-dropdown-button"
                    onClick={() => setIsMachineDropdownOpen((prev) => !prev)}
                  >
                    {selectedMachineLabel}
                  </button>

                  {isMachineDropdownOpen && (
                    <div className="machine-dropdown-menu">
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

                <select
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value)}
                >
                  <option value="bar">Bar</option>
                  <option value="line">Line</option>
                  <option value="pie">Pie</option>
                  <option value="scatter">Scatter</option>
                  <option value="area">Area</option>
                  <option value="composed">Composed</option>
                  <option value="radar">Radar</option>
                </select>

                <button
                  onClick={fetchAnomalies}
                  disabled={!currentDatasetId || !yAxis || isDetectingAnomalies}
                >
                  {isDetectingAnomalies ? "Detecting..." : "Detect Anomalies"}
                </button>

                <button
                  onClick={() =>
                    downloadChartFromRef(
                      mainChartRef,
                      `main_${chartType}_${
                        yAxis ? yAxis.replace(/[^\w-]+/g, "_") : "chart"
                      }`
                    )
                  }
                  disabled={filteredData.length === 0 || !yAxis}
                >
                  Download Main Graph
                </button>
              </div>

              {chartSuggestion && (
                <div className="suggestion-box">
                  <strong>Suggested Chart:</strong> {chartSuggestion.recommended_chart}
                  <span> - {chartSuggestion.reason}</span>
                </div>
              )}

              <div className="ai-actions">
                <button
                  onClick={fetchHealthScores}
                  disabled={!currentDatasetId || isLoadingInsights}
                >
                  Health Score
                </button>
                <button
                  onClick={fetchFailureClassification}
                  disabled={!currentDatasetId || isLoadingInsights}
                >
                  Failure Classification
                </button>
                <button
                  onClick={fetchAiSummary}
                  disabled={!currentDatasetId || isLoadingInsights}
                >
                  AI Summary
                </button>
                <button
                  onClick={fetchForecast}
                  disabled={!currentDatasetId || !yAxis || isLoadingInsights}
                >
                  Forecast
                </button>
              </div>

              <div className="chart-area" ref={mainChartRef}>
                {chartType === "bar" &&
                  machineColumn &&
                  yAxis &&
                  filteredData.length > 0 && (
                    <ResponsiveContainer width="100%" height={360}>
                      <BarChart data={filteredData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey={machineColumn} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey={yAxis}>
                          {filteredData.map((row, index) => {
                            const machine = String(row[machineColumn]).trim();
                            const isAnomaly = anomalyMap[machine];
                            return (
                              <Cell
                                key={index}
                                fill={
                                  isAnomaly ? "#EF4444" : COLORS[index % COLORS.length]
                                }
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}

                {chartType === "line" &&
                  machineColumn &&
                  yAxis &&
                  filteredData.length > 0 && (
                    <ResponsiveContainer width="100%" height={360}>
                      <LineChart data={filteredData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey={machineColumn} />
                        <YAxis />
                        <Tooltip />
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
                  filteredData.length > 0 && (
                    <ResponsiveContainer width="100%" height={360}>
                      <PieChart>
                        <Pie
                          data={filteredData}
                          dataKey={yAxis}
                          nameKey={machineColumn}
                          outerRadius={120}
                        >
                          {filteredData.map((row, index) => {
                            const machine = String(row[machineColumn]).trim();
                            const isAnomaly = anomalyMap[machine];
                            return (
                              <Cell
                                key={index}
                                fill={
                                  isAnomaly ? "#EF4444" : COLORS[index % COLORS.length]
                                }
                              />
                            );
                          })}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}

                {chartType === "scatter" &&
                  machineColumn &&
                  yAxis &&
                  filteredData.length > 0 && (
                    <ResponsiveContainer width="100%" height={360}>
                      <ScatterChart>
                        <CartesianGrid />
                        <XAxis dataKey={machineColumn} name={machineColumn} />
                        <YAxis dataKey={yAxis} name={yAxis} />
                        <Tooltip />
                        <Scatter data={filteredData} fill="#6366F1" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  )}

                {chartType === "area" &&
                  machineColumn &&
                  yAxis &&
                  filteredData.length > 0 && (
                    <ResponsiveContainer width="100%" height={360}>
                      <AreaChart data={filteredData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey={machineColumn} />
                        <YAxis />
                        <Tooltip />
                        <Area
                          type="monotone"
                          dataKey={yAxis}
                          stroke="#0F766E"
                          fill="#99F6E4"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}

                {chartType === "composed" &&
                  machineColumn &&
                  yAxis &&
                  filteredData.length > 0 && (
                    <ResponsiveContainer width="100%" height={360}>
                      <ComposedChart data={filteredData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey={machineColumn} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey={yAxis} fill="#93C5FD" />
                        <Line
                          type="monotone"
                          dataKey={yAxis}
                          stroke="#1D4ED8"
                          strokeWidth={2}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}

                {chartType === "radar" && radarData.length > 0 && (
                  <ResponsiveContainer width="100%" height={360}>
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

                {failureData?.summary?.top_risk_machine && (
                  <div className="metadata-box">
                    <h4>Failure Classification</h4>
                    <p>
                      Top risk machine:{" "}
                      <b>{failureData.summary.top_risk_machine.machine}</b>
                    </p>
                    <p>
                      Failure score:{" "}
                      <b>{failureData.summary.top_risk_machine.failure_score}</b>
                    </p>
                    <p>
                      Risk class:{" "}
                      <b>{failureData.summary.top_risk_machine.failure_class}</b>
                    </p>
                  </div>
                )}

                {numericValues.length > 0 && machineColumn && yAxis && (
                  <div className="metadata-box">
                    <h4>Graph Analysis</h4>
                    <p>
                      This chart compares <b>{yAxis}</b> values across{" "}
                      <b>{machineColumn}</b> samples.
                    </p>
                    <p>
                      The values range between <b>{minValue}</b> and <b>{maxValue}</b>{" "}
                      with an average of <b>{avgValue}</b>.
                    </p>
                    <p>
                      The highest value occurs for{" "}
                      <b>{maxItem?.[machineColumn]}</b>, while{" "}
                      <b>{minItem?.[machineColumn]}</b> shows the lowest
                      measurement.
                    </p>
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
                    <button
                      onClick={() =>
                        downloadChartFromRef(healthChartRef, "health_score_chart")
                      }
                      disabled={healthTop.length === 0}
                    >
                      Download Health Score Graph
                    </button>
                  </div>

                  <div className="stats-row">
                    <div className="stat-card">
                      <span>Average Score</span>
                      <strong>{healthData.summary.average_score}</strong>
                    </div>
                    <div className="stat-card">
                      <span>Best Machine</span>
                      <strong>{healthData.summary.best_machine?.machine}</strong>
                    </div>
                    <div className="stat-card">
                      <span>Worst Machine</span>
                      <strong>{healthData.summary.worst_machine?.machine}</strong>
                    </div>
                  </div>

                  <div className="chart-area" ref={healthChartRef}>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={healthTop}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="machine" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="score">
                          {healthTop.map((row, index) => (
                            <Cell
                              key={index}
                              fill={
                                row.label === "Healthy"
                                  ? "#22C55E"
                                  : row.label === "Warning"
                                  ? "#F59E0B"
                                  : "#EF4444"
                              }
                            />
                          ))}
                        </Bar>
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
                    <button
                      onClick={() =>
                        downloadChartFromRef(
                          failureChartRef,
                          "failure_classification_chart"
                        )
                      }
                      disabled={failureTop.length === 0}
                    >
                      Download Failure Graph
                    </button>
                  </div>

                  <div className="chart-area" ref={failureChartRef}>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={failureTop}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="machine" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="failure_score">
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
                          `forecast_${
                            yAxis ? yAxis.replace(/[^\w-]+/g, "_") : "chart"
                          }`
                        )
                      }
                      disabled={!forecastData?.points?.length}
                    >
                      Download Forecast Graph
                    </button>
                  </div>

                  <p className="section-note">
                    Predicted next value:{" "}
                    <b>
                      {forecastData.predicted_next?.toFixed?.(3) ||
                        forecastData.predicted_next}
                    </b>{" "}
                    with a <b>{forecastData.trend}</b> trend.
                  </p>

                  <div className="chart-area" ref={forecastChartRef}>
                    <ResponsiveContainer width="100%" height={320}>
                      <ComposedChart data={forecastData.points}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis />
                        <Tooltip />
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
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
