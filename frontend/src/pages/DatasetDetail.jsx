import { useParams } from "react-router-dom";

function DatasetDetail() {
  const { id } = useParams();

  return (
    <div style={{ padding: "40px" }}>
      <h2>Dataset Detail Page</h2>
      <p>Dataset ID: {id}</p>
    </div>
  );
}

export default DatasetDetail;