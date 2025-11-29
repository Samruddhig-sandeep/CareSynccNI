import "dotenv/config";
import express from "express";
import cors from "cors";
import geminiRoute from "./routes/gemini";

// ROUTES
import { handleDemo } from "./routes/demo.js";
import { handleSearchCodes, handleGetCodeByNameste } from "./routes/codes.js";
import {
  handleCreatePatient,
  handleGetPatient,
  handleListPatients,
  handleAddDiagnosis,
  handleExportPatientFHIR,
} from "./routes/patients.js";
import authRouter from "./routes/auth";
import chatRoute from "./routes/chat";

export function createServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API health check
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "pong";
    res.json({ message: ping });
  });

  // EXISTING ROUTES
  app.get("/api/demo", handleDemo);
  app.get("/api/codes/search", handleSearchCodes);
  app.get("/api/codes/:code", handleGetCodeByNameste);

  app.use("/api/auth", authRouter);
  app.use("/api/chat", chatRoute);
app.use("/api/gemini", geminiRoute);

  // PATIENT ROUTES
  app.post("/api/patients", handleCreatePatient);
  app.get("/api/patients", handleListPatients);
  app.get("/api/patients/:patientId", handleGetPatient);
  app.post("/api/patients/:patientId/diagnoses", handleAddDiagnosis);
  app.get("/api/patients/:patientId/fhir", handleExportPatientFHIR);
  

  // OPENAI CHATBOT ROUTE

  return app; // important to return without starting actual server
}
