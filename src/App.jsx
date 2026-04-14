import { useState } from "react";
import Home from "./Home.jsx";
import DataLayerTool from "./tools/DataLayerTool.jsx";
import GA4Tool from "./tools/GA4Tool.jsx";
import GTMTool from "./tools/GTMTool.jsx";
import GSCTool from "./tools/GSCTool.jsx";
import SchemaTool from "./tools/SchemaTool.jsx";

export default function App() {
  const [view, setView] = useState("home");
  const goHome = () => setView("home");

  if (view === "datalayer") return <DataLayerTool onHome={goHome} />;
  if (view === "ga4") return <GA4Tool onHome={goHome} />;
  if (view === "gtm") return <GTMTool onHome={goHome} />;
  if (view === "gsc") return <GSCTool onHome={goHome} />;
  if (view === "schema") return <SchemaTool onHome={goHome} />;
  return <Home onSelect={setView} />;
}
