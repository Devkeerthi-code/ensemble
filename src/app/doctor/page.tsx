import type { Metadata } from "next";
import { DoctorTool } from "./doctor-tool";

export const metadata: Metadata = { title: "Doctor" };

export default function DoctorPage() {
  return (
    <div className="wrap app-main">
      <div className="sh">
        <div>
          <div className="eyebrow"><span className="mark">D</span>Doctor</div>
          <h1 style={{ fontSize: "var(--t-xl)" }}>Check a setup you already have</h1>
          <p>Upload your project folder (only AI config files are read) or paste files. Doctor checks each one against the official format, flags unsafe permissions and suggests fixes.</p>
        </div>
      </div>
      <DoctorTool />
    </div>
  );
}
