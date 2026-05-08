import "./Dashboard.css";

import { useLocation } from "react-router-dom";
import { useState } from "react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
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

const CustomTooltip = ({
  active,
  payload,
  label
}) => {

  if (active && payload && payload.length) {

    return (
      <div
        style={{
          background: "#ffffff",
          padding: "12px",
          border: "1px solid #E5E7EB",
          borderRadius: "12px",
          boxShadow: "0 4px 14px rgba(0,0,0,0.08)"
        }}
      >
        <p><b>{label}</b></p>

        {payload.map((entry, i) => (
          <p
            key={i}
            style={{
              color: entry.color
            }}
          >
            <b>{entry.name}:</b>{" "}
            {Number(entry.value).toFixed(2)}
          </p>
        ))}
      </div>
    );
  }

  return null;
};

function ChartsDashboard() {

  const location = useLocation();

  const {
    yAxis,
    machineColumn,
    machineChartData,
    combinedShiftLineData,
    selectedMachines,
    anomalyMap,
    healthChartData,
    failureTop,
    forecastData,
  } = location.state || {};

  const [visibleCharts, setVisibleCharts] =
    useState({
      line: true,
      health: true,
      failure: true,
      forecast: true,
      bar: true
    });

  const sidebarButtonStyle = {
    padding: "14px",
    borderRadius: "12px",
    border: "none",
    background: "#1F2937",
    color: "white",
    cursor: "pointer",
    fontSize: "15px",
    textAlign: "left",
    fontWeight: "500"
  };

  const chartStyle = {
    background: "white",
    borderRadius: "20px",
    padding: "20px",
    height: "520px",
    border: "1px solid #E5E7EB",
    boxShadow: "0 4px 18px rgba(0,0,0,0.06)"
  };

  const headingStyle = {
    marginBottom: "16px",
    color: "#111827",
    fontSize: "20px",
    fontWeight: "700"
  };

  return (

    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#EEF2F7",
        overflow: "hidden"
      }}
    >

      {/* SIDEBAR */}

      <div
        style={{
          width: "260px",
          background: "#111827",
          color: "white",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "18px"
        }}
      >

        <h2
          style={{
            fontSize: "24px",
            fontWeight: "700",
            marginBottom: "20px"
          }}
        >
          Dashboard
        </h2>

        <button
          onClick={() =>
            setVisibleCharts(prev => ({
              ...prev,
              line: !prev.line
            }))
          }
          style={sidebarButtonStyle}
        >
          Shift Comparison
        </button>

        <button
          onClick={() =>
            setVisibleCharts(prev => ({
              ...prev,
              health: !prev.health
            }))
          }
          style={sidebarButtonStyle}
        >
          Health Analysis
        </button>

        <button
          onClick={() =>
            setVisibleCharts(prev => ({
              ...prev,
              failure: !prev.failure
            }))
          }
          style={sidebarButtonStyle}
        >
          Failure Analysis
        </button>

        <button
          onClick={() =>
            setVisibleCharts(prev => ({
              ...prev,
              forecast: !prev.forecast
            }))
          }
          style={sidebarButtonStyle}
        >
          Forecast Analysis
        </button>

        <button
          onClick={() =>
            setVisibleCharts(prev => ({
              ...prev,
              bar: !prev.bar
            }))
          }
          style={sidebarButtonStyle}
        >
          Machine Performance
        </button>

        <button
          onClick={() => window.history.back()}
          style={{
            marginTop: "auto",
            padding: "12px",
            borderRadius: "10px",
            border: "none",
            background: "#4F46E5",
            color: "white",
            cursor: "pointer",
            fontWeight: "600"
          }}
        >
          Back
        </button>

      </div>

      {/* MAIN DASHBOARD */}

      <div
        style={{
          flex: 1,
          padding: "24px",
          overflowY: "auto"
        }}
      >

        <h1
          style={{
            marginBottom: "24px",
            color: "#111827",
            fontSize: "34px",
            fontWeight: "800"
          }}
        >
          Analytics Dashboard
        </h1>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(2, 1fr)",
            gap: "20px"
          }}
        >

          {/* BAR */}

          {visibleCharts.bar &&
            machineChartData?.length > 0 && (

            <div style={chartStyle}>

              <h3 style={headingStyle}>
                Machine Performance
              </h3>

              <ResponsiveContainer
                width="100%"
                height={420}
              >

                <BarChart
                  data={machineChartData}
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey={machineColumn}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                    tick={{ fontSize: 11 }}
                  />

                  <YAxis />

                  <Tooltip
                    content={
                      <CustomTooltip />
                    }
                  />

                  <Legend />

                  <Bar dataKey={yAxis}>

                    {machineChartData.map(
                      (row, index) => {

                        const machine =
                          String(
                            row[machineColumn]
                          ).trim();

                        const isAnomaly =
                          anomalyMap?.[
                            machine
                          ];

                        return (
                          <Cell
                            key={index}
                            fill={
                              isAnomaly
                                ? "#EF4444"
                                : COLORS[
                                    index %
                                      COLORS.length
                                  ]
                            }
                          />
                        );
                      }
                    )}

                  </Bar>

                </BarChart>

              </ResponsiveContainer>

            </div>
          )}

          {/* LINE */}

          {visibleCharts.line &&
            combinedShiftLineData?.length >
              0 && (

            <div style={chartStyle}>

              <h3 style={headingStyle}>
                Shift Comparison
              </h3>

              <ResponsiveContainer
                width="100%"
                height={420}
              >

                <LineChart
                  data={
                    combinedShiftLineData
                  }
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <ReferenceLine
                    x="L-14:00"
                    stroke="#9CA3AF"
                    strokeDasharray="3 3"
                  />

                  <ReferenceLine
                    x="N-22:00"
                    stroke="#9CA3AF"
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="label"
                    angle={-20}
                    textAnchor="end"
                    height={60}
                    tick={{ fontSize: 11 }}
                  />

                  <YAxis />

                  <Tooltip
                    content={
                      <CustomTooltip />
                    }
                  />

                  <Legend />

                  {selectedMachines?.map(
                    (
                      machine,
                      index
                    ) => (

                      <Line
                        key={machine}
                        type="monotone"
                        dataKey={machine}
                        name={`Machine ${machine}`}
                        stroke={
                          COLORS[
                            index %
                              COLORS.length
                          ]
                        }
                        strokeWidth={2.5}
                        dot={false}
                      />
                    )
                  )}

                </LineChart>

              </ResponsiveContainer>

            </div>
          )}

          {/* HEALTH */}

          {visibleCharts.health &&
            healthChartData?.length >
              0 && (

            <div style={chartStyle}>

              <h3 style={headingStyle}>
                Health Score
              </h3>

              <ResponsiveContainer
                width="100%"
                height={420}
              >

                <BarChart
                  data={healthChartData}
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="machine"
                  />

                  <YAxis />

                  <Tooltip />

                  <Legend />

                  <Bar
                    dataKey="E"
                    fill="#6366F1"
                  />

                  <Bar
                    dataKey="L"
                    fill="#22C55E"
                  />

                  <Bar
                    dataKey="N"
                    fill="#F59E0B"
                  />

                </BarChart>

              </ResponsiveContainer>

            </div>
          )}

          {/* FAILURE */}

          {visibleCharts.failure &&
            failureTop?.length > 0 && (

            <div style={chartStyle}>

              <h3 style={headingStyle}>
                Failure Classification
              </h3>

              <ResponsiveContainer
                width="100%"
                height={420}
              >

                <BarChart
                  data={failureTop}
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="label"
                    angle={-20}
                    textAnchor="end"
                    height={60}
                    tick={{ fontSize: 11 }}
                  />

                  <YAxis />

                  <Tooltip />

                  <Legend />

                  <Bar
                    dataKey="failure_score"
                    fill="#EF4444"
                  />

                </BarChart>

              </ResponsiveContainer>

            </div>
          )}

          {/* FORECAST */}

          {visibleCharts.forecast &&
            (
              (
                forecastData?.points &&
                forecastData.points.length > 0
              ) ||
              (
                Array.isArray(forecastData) &&
                forecastData.length > 0
              )
            ) && (

            <div style={chartStyle}>

              <h3 style={headingStyle}>
                Forecast Analysis
              </h3>

              <ResponsiveContainer
                width="100%"
                height={420}
              >

                <LineChart
                  data={
                    forecastData?.points ||
                    forecastData
                  }
                >

                  <CartesianGrid
                    strokeDasharray="3 3"
                  />

                  <XAxis dataKey="index" />

                  <YAxis />

                  <Tooltip />

                  <Legend />

                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#6366F1"
                    strokeWidth={2.5}
                    dot={false}
                  />

                  <Line
                    type="monotone"
                    dataKey="forecast"
                    stroke="#EF4444"
                    strokeWidth={2.5}
                    dot={false}
                  />

                </LineChart>

              </ResponsiveContainer>

            </div>
          )}

        </div>

      </div>

    </div>
  );
}

export default ChartsDashboard;